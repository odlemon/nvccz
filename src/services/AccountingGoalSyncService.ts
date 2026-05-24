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
import { PerformanceGoalService } from "./PerformanceGoalService";

const SETTINGS_ID = "default";

function isLoginSyncEnabled(): boolean {
  const raw = String(process.env.PERF_LOGIN_SYNC_ENABLED ?? "true").toLowerCase();
  return raw !== "false" && raw !== "0";
}

function loginSyncCooldownMs(): number {
  const raw = Number(process.env.PERF_LOGIN_SYNC_COOLDOWN_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

async function getOrCreateSyncSettings() {
  return prisma.performanceSyncSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {}
  });
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
    options?: { payrollAlreadyRan?: boolean }
  ): Promise<{ updated: boolean; glNative: number | null; newTotal: number | null; skippedReason?: string }> {
    if (job.isPayroll) {
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

    await PerformanceGoalProgressEventService.ensureBaselineFromGoalCurrent(
      job.canonicalGoalId,
      actorId
    );

    const { total } = await PerformanceGoalProgressEventService.upsertGlSyncEvent({
      goalId: job.canonicalGoalId,
      glNativeAmount: glNative,
      periodStart: job.periodStart,
      periodEnd: job.periodEnd,
      createdById: actorId
    });

    await prisma.performanceGoal.update({
      where: { id: job.canonicalGoalId },
      data: {
        syncConfig: {
          source: "posted_journal_lines",
          glKpiCode: job.kpiCode,
          glSyncStrategy: job.financialProfile.syncStrategy,
          glPeriodStart: job.periodStart.toISOString(),
          glPeriodEnd: job.periodEnd.toISOString(),
          glSyncedAt: new Date().toISOString(),
          glNativeAmount: glNative
        },
        lastSyncJobId: `login-sync-${job.kpiCode}`
      }
    });

    const goalRow = await prisma.performanceGoal.findUnique({
      where: { id: job.canonicalGoalId },
      select: { kpiId: true }
    });
    await this.cascadeAfterGoalUpdate(job.canonicalGoalId, goalRow?.kpiId ?? null);

    console.log(
      `🔄 Performance GL sync ${job.kpiCode} goal ${job.canonicalGoalTitle}: glNative=${glNative} total=${total}`
    );

    if (job.duplicateGoalIds.length) {
      logger.warn("Performance sync duplicate company goals (canonical only updated)", {
        kpiCode: job.kpiCode,
        canonicalGoalId: job.canonicalGoalId,
        duplicateGoalIds: job.duplicateGoalIds
      });
    }

    return { updated: true, glNative, newTotal: total };
  }

  static async runFullSync(input: {
    periodStart: Date;
    periodEnd: Date;
    actorId: string;
    kpiCodes?: string[];
  }): Promise<{
    jobCount: number;
    updated: number;
    skipped: number;
    errors: string[];
  }> {
    const jobs = await this.planSyncJobs(input.periodStart, input.periodEnd, input.kpiCodes);
    logger.info("Performance sync plan", {
      jobCount: jobs.length,
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
        const result = await this.runSyncJob(job, input.actorId, { payrollAlreadyRan: payrollRan });
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

    const cooldownMs = loginSyncCooldownMs();

    try {
      logger.info("Performance login sync started", { actorId, cooldownMs });

      const settings = await getOrCreateSyncSettings();
      const last = settings.lastLoginSyncAt;
      if (last != null && cooldownMs > 0) {
        const elapsed = Date.now() - last.getTime();
        if (elapsed < cooldownMs) {
          logger.info("Performance login sync skipped by cooldown", {
            actorId,
            cooldownMs,
            elapsedMs: elapsed,
            lastLoginSyncAt: last.toISOString()
          });
          return;
        }
      }

      const { periodStart, periodEnd } = defaultLoginSyncPeriod();
      const result = await this.runFullSync({ periodStart, periodEnd, actorId });

      await prisma.performanceSyncSettings.update({
        where: { id: SETTINGS_ID },
        data: { lastLoginSyncAt: new Date() }
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
