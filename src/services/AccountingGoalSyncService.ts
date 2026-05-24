// @ts-nocheck
import { prisma } from "../utils/database";
import { logger } from "../utils/logger";
import { PerformanceGoalProgressEventService } from "./PerformanceGoalProgressEventService";
import { FinancialKpiGlValueService } from "./FinancialKpiGlValueService";
import {
  defaultLoginSyncPeriod,
  groupGoalsIntoSyncJobs,
  type GoalForSync,
  type SyncJobPlan
} from "./performanceGoalSyncUtils";
import { PerformanceGoalService, legacyProgressFieldsForGoal } from "./PerformanceGoalService";
import { deriveGoalProgressState, parseGoalCurrentAndTargetForAnalytics } from "./performanceGoalRollupUtils";
import { resolveGoalEscalationStatus } from "./performanceScorecardSupport";
import type { KpiSyncStrategy } from "./kpiFinancialAccountingRules";

const SETTINGS_ID = "default";

/** Login sync: incremental P&L merge only — no payroll refresh, no balance-sheet snapshots. */
const LOGIN_SYNC_STRATEGIES = new Set<KpiSyncStrategy>([
  "pl_revenue_total",
  "pl_expense_total",
  "pl_account_period",
  "pl_net_profit"
]);

function isLoginSyncEnabled(): boolean {
  const raw = String(process.env.PERF_LOGIN_SYNC_ENABLED ?? "true").toLowerCase();
  return raw !== "false" && raw !== "0";
}

export class AccountingGoalSyncService {
  static async planSyncJobs(
    periodStart: Date,
    periodEnd: Date,
    kpiCodes?: string[]
  ): Promise<SyncJobPlan[]> {
    const goals = await prisma.performanceGoal.findMany({
      where: {
        kpiId: { not: null },
        status: { in: ["active", "completed", "in_progress"] }
      },
      select: {
        id: true,
        title: true,
        type: true,
        kpiId: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        parentGoalId: true,
        kpi: {
          select: {
            id: true,
            code: true,
            name: true,
            isFinancial: true,
            accountType: true,
            accountNumber: true,
            journalEntryType: true,
            catalogDescription: true,
            catalogDepartmentName: true
          }
        }
      }
    });

    let jobs = groupGoalsIntoSyncJobs(goals as GoalForSync[], periodStart, periodEnd);

    if (kpiCodes?.length) {
      const allowed = new Set(kpiCodes.map((c) => String(c).toUpperCase()));
      jobs = jobs.filter((j) => allowed.has(j.kpiCode));
    }

    return jobs;
  }

  static async cascadeAfterGoalUpdate(goalId: string, kpiId: string | null): Promise<void> {
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: goalId },
      select: { parentGoalId: true }
    });
    if (goal?.parentGoalId) {
      await PerformanceGoalService.updateParentGoalProgress(goal.parentGoalId).catch((err) =>
        logger.warn("Performance sync parent rollup failed", {
          goalId,
          message: err?.message
        })
      );
    }
    if (kpiId) {
      await PerformanceGoalService.recalculateKPIProgress(kpiId).catch((err) =>
        logger.warn("Performance sync KPI recalc failed", { kpiId, message: err?.message })
      );
    }
    try {
      const { RollupCalculationService } = await import("./RollupCalculationService");
      await RollupCalculationService.recalculateAllRollups(goalId);
    } catch (err: any) {
      logger.warn("Performance sync roll-up failed", { goalId, message: err?.message });
    }
  }

  static async runSyncJob(
    job: SyncJobPlan,
    actorId: string,
    options?: { payrollAlreadyRan?: boolean; incrementalOnly?: boolean }
  ): Promise<{ updated: boolean; glNative: number | null; newTotal: number | null; skippedReason?: string }> {
    if (job.isPayroll) {
      if (options?.incrementalOnly) {
        return { updated: false, glNative: null, newTotal: null, skippedReason: "payroll_skipped_on_login" };
      }
      if (options?.payrollAlreadyRan) {
        return { updated: false, glNative: null, newTotal: null, skippedReason: "payroll_delegated" };
      }
      await PerformanceGoalService.refreshAllPayrollExpenseGoals(actorId);
      const goal = await prisma.performanceGoal.findUnique({
        where: { id: job.canonicalGoalId },
        select: { currentValue: true }
      });
      const total = goal?.currentValue ? parseFloat(String(goal.currentValue)) : 0;
      return { updated: true, glNative: total, newTotal: total };
    }

    const glNative = await FinancialKpiGlValueService.fetchNativeGlValue({
      profile: job.financialProfile,
      periodStart: job.periodStart,
      periodEnd: job.periodEnd
    });

    if (glNative == null || job.financialProfile.syncStrategy === "unsupported") {
      logger.info("Performance sync job skipped (no GL mapping)", {
        kpiCode: job.kpiCode,
        syncStrategy: job.financialProfile.syncStrategy,
        goalId: job.canonicalGoalId
      });
      return { updated: false, glNative: null, newTotal: null, skippedReason: "no_mapping" };
    }

    const goalRow = await prisma.performanceGoal.findUnique({
      where: { id: job.canonicalGoalId },
      include: { kpi: { select: { name: true, accountType: true } } }
    });
    if (!goalRow) {
      return { updated: false, glNative: null, newTotal: null, skippedReason: "goal_not_found" };
    }

    const { current: prevCurrent } = parseGoalCurrentAndTargetForAnalytics(goalRow);
    const syncConfigRaw = goalRow.syncConfig;
    const syncConfig =
      syncConfigRaw && typeof syncConfigRaw === "object" && !Array.isArray(syncConfigRaw)
        ? (syncConfigRaw as Record<string, unknown>)
        : {};
    const prevGlNative = Number(syncConfig.glNativeAmount ?? syncConfig.lastGlNative ?? 0);
    const prevGl = Number.isFinite(prevGlNative) ? prevGlNative : 0;

    const increment = glNative - prevGl;
    if (Math.abs(increment) < 0.0005) {
      logger.info("Performance GL sync skipped — no new posted GL since last sync", {
        kpiCode: job.kpiCode,
        goalId: job.canonicalGoalId,
        glNative,
        prevGl
      });
      return { updated: false, glNative, newTotal: prevCurrent, skippedReason: "no_gl_delta" };
    }

    const newCurrent = prevCurrent + increment;

    const progressState = deriveGoalProgressState({
      currentValue: newCurrent,
      targetValue: goalRow.targetValue,
      targetOperator: goalRow.targetOperator,
      isReverseKpi: goalRow.isReverseKpi,
      previousStage: goalRow.stage,
      progressPercentage: goalRow.progressPercentage
    });

    const performanceRiskZone = resolveGoalEscalationStatus({
      currentValue: newCurrent,
      preciseCurrentValue: String(newCurrent),
      targetValue: goalRow.targetValue,
      preciseTargetValue: goalRow.preciseTargetValue,
      allowableVariance: goalRow.allowableVariance,
      isReverseKpi: goalRow.isReverseKpi,
      endDate: goalRow.endDate
    });

    await prisma.performanceGoal.update({
      where: { id: job.canonicalGoalId },
      data: {
        currentValue: newCurrent,
        preciseCurrentValue: String(newCurrent),
        progressPercentage: progressState.progressPercentage,
        status: progressState.status,
        stage: progressState.stage,
        performanceRiskZone,
        performanceRiskZoneAt: new Date(),
        lastSyncedAt: new Date(),
        lastSyncedValue: newCurrent,
        ...legacyProgressFieldsForGoal(goalRow, newCurrent),
        syncConfig: {
          ...syncConfig,
          source: "posted_journal_lines",
          glKpiCode: job.kpiCode,
          glSyncStrategy: job.financialProfile.syncStrategy,
          glPeriodStart: job.periodStart.toISOString(),
          glPeriodEnd: job.periodEnd.toISOString(),
          glSyncedAt: new Date().toISOString(),
          glNativeAmount: glNative,
          glLastIncrement: increment
        },
        lastSyncJobId: `login-sync-${job.kpiCode}`
      }
    });

    await PerformanceGoalProgressEventService.recordEvent({
      goalId: job.canonicalGoalId,
      amount: increment,
      recordedAt: job.periodEnd,
      source: "gl_sync",
      sourceRef: `gl_sync_delta:${job.periodStart.toISOString().slice(0, 10)}:${job.periodEnd.toISOString().slice(0, 10)}:${Date.now()}`,
      createdById: actorId,
      skipRecompute: true
    });

    await this.mirrorCompanyCurrentToDepartmentGoals(job.canonicalGoalId, newCurrent, progressState);

    console.log(
      `🔄 Performance GL sync ${job.kpiCode} goal ${job.canonicalGoalTitle}: prev=${prevCurrent} +Δ${increment} (gl ${prevGl}→${glNative}) = ${newCurrent}`
    );

    if (job.duplicateGoalIds.length) {
      logger.warn("Performance sync duplicate company goals (canonical only updated)", {
        kpiCode: job.kpiCode,
        canonicalGoalId: job.canonicalGoalId,
        duplicateGoalIds: job.duplicateGoalIds
      });
    }

    return { updated: true, glNative, newTotal: newCurrent };
  }

  /** After company goal GL increment: mirror current to direct department children only (not individual / tasks). */
  static async mirrorCompanyCurrentToDepartmentGoals(
    companyGoalId: string,
    newCurrent: number,
    progressState: ReturnType<typeof deriveGoalProgressState>
  ): Promise<void> {
    const deptGoals = await prisma.performanceGoal.findMany({
      where: {
        parentGoalId: companyGoalId,
        type: "department"
      }
    });

    for (const dept of deptGoals) {
      const deptProgress = deriveGoalProgressState({
        currentValue: newCurrent,
        targetValue: dept.targetValue,
        targetOperator: dept.targetOperator,
        isReverseKpi: dept.isReverseKpi,
        previousStage: dept.stage,
        progressPercentage: dept.progressPercentage
      });
      const deptRisk = resolveGoalEscalationStatus({
        currentValue: newCurrent,
        preciseCurrentValue: String(newCurrent),
        targetValue: dept.targetValue,
        preciseTargetValue: dept.preciseTargetValue,
        allowableVariance: dept.allowableVariance,
        isReverseKpi: dept.isReverseKpi,
        endDate: dept.endDate
      });

      await prisma.performanceGoal.update({
        where: { id: dept.id },
        data: {
          currentValue: newCurrent,
          preciseCurrentValue: String(newCurrent),
          progressPercentage: deptProgress.progressPercentage,
          status: deptProgress.status,
          stage: deptProgress.stage,
          performanceRiskZone: deptRisk,
          performanceRiskZoneAt: new Date(),
          lastSyncedAt: new Date(),
          lastSyncedValue: newCurrent,
          ...legacyProgressFieldsForGoal(dept, newCurrent),
          updatedAt: new Date()
        }
      });
    }
  }

  static async runFullSync(input: {
    periodStart: Date;
    periodEnd: Date;
    actorId: string;
    kpiCodes?: string[];
    /** When true (login path): P&L incremental merge only; skip payroll + balance sheet. */
    loginSyncOnly?: boolean;
  }): Promise<{
    jobCount: number;
    updated: number;
    skipped: number;
    errors: string[];
  }> {
    let jobs = await this.planSyncJobs(input.periodStart, input.periodEnd, input.kpiCodes);

    if (input.loginSyncOnly) {
      jobs = jobs.filter(
        (j) => !j.isPayroll && LOGIN_SYNC_STRATEGIES.has(j.financialProfile.syncStrategy)
      );
    }

    logger.info("Performance sync plan", {
      jobCount: jobs.length,
      loginSyncOnly: Boolean(input.loginSyncOnly),
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString()
    });

    if (!jobs.length) {
      logger.info("Performance sync: nothing to sync", {
        periodStart: input.periodStart.toISOString(),
        periodEnd: input.periodEnd.toISOString()
      });
      return { jobCount: 0, updated: 0, skipped: 0, errors: [] };
    }

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    let payrollRan = false;

    for (const job of jobs) {
      try {
        logger.info("Performance sync job running", {
          kpiCode: job.kpiCode,
          canonicalGoalId: job.canonicalGoalId,
          periodStart: job.periodStart.toISOString().slice(0, 10),
          periodEnd: job.periodEnd.toISOString().slice(0, 10)
        });
        const result = await this.runSyncJob(job, input.actorId, {
          payrollAlreadyRan: payrollRan,
          incrementalOnly: Boolean(input.loginSyncOnly)
        });
        if (job.isPayroll && result.updated) payrollRan = true;
        if (result.updated) updated += 1;
        else skipped += 1;
      } catch (e: any) {
        const msg = `${job.kpiCode}/${job.canonicalGoalId}: ${e?.message ?? e}`;
        errors.push(msg);
        logger.error("Performance sync job failed", { message: msg });
      }
    }

    logger.info("Performance sync completed", {
      jobCount: jobs.length,
      updated,
      skipped,
      errors: errors.length
    });

    return { jobCount: jobs.length, updated, skipped, errors };
  }

  static async maybeRunAfterLogin(actorId: string): Promise<void> {
    if (!isLoginSyncEnabled()) {
      logger.info("Performance login sync disabled (PERF_LOGIN_SYNC_ENABLED)");
      return;
    }

    try {
      logger.info("Performance login sync started", { actorId });

      const { periodStart, periodEnd } = defaultLoginSyncPeriod();
      const result = await this.runFullSync({
        periodStart,
        periodEnd,
        actorId,
        loginSyncOnly: true
      });

      await prisma.performanceSyncSettings.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, lastLoginSyncAt: new Date() },
        update: { lastLoginSyncAt: new Date() }
      });

      if (result.jobCount === 0) {
        logger.info("Performance login sync: nothing to sync", {
          actorId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString()
        });
      } else {
        logger.info("Performance login sync completed", {
          actorId,
          ...result,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString()
        });
      }
    } catch (e: any) {
      logger.warn("Performance login sync skipped", {
        message: e?.message ?? String(e),
        code: e?.code,
        actorId
      });
    }
  }
}
