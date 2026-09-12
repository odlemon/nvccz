/**
 * Revert bad login GL sync that overwrote goal currentValue with full native GL totals.
 *
 * Dry run:  npm run db:revert:gl-login-sync
 * Apply:     npm run db:revert:gl-login-sync -- --apply
 *
 * Env overrides:
 *   COMPANY_GOAL_ID, DEPARTMENT_GOAL_ID
 *   RESTORE_CURRENT=50700
 *   GL_INCREMENT_PENDING=2500  — sets glNativeAmount baseline so next sync adds this delta
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { defaultLoginSyncPeriod } from "../src/services/performanceGoalSyncUtils";
import { FinancialKpiGlValueService } from "../src/services/FinancialKpiGlValueService";
import { resolveKpiFinancialProfile } from "../src/services/kpiFinancialAccountingRules";
import {
  deriveGoalProgressState
} from "../src/services/performanceGoalRollupUtils";
import { legacyProgressFieldsForGoal } from "../src/services/PerformanceGoalService";
import { resolveGoalEscalationStatus } from "../src/services/performanceScorecardSupport";

const APPLY = process.argv.includes("--apply");

const COMPANY_GOAL_ID = process.env.COMPANY_GOAL_ID ?? "cmpjts5fo0001kt6k6qy97pms";
const DEPARTMENT_GOAL_ID = process.env.DEPARTMENT_GOAL_ID ?? "cmpju3tm40005kt6kz0qshclx";
const RESTORE_CURRENT = Number(process.env.RESTORE_CURRENT ?? "50700");
const GL_INCREMENT_PENDING = Number(process.env.GL_INCREMENT_PENDING ?? "2500");

async function restoreGoalCurrent(
  goalId: string,
  newCurrent: number,
  glNativeBaseline: number | null
): Promise<void> {
  const goal = await prisma.performanceGoal.findUnique({ where: { id: goalId } });
  if (!goal) {
    console.warn(`Goal ${goalId} not found — skip`);
    return;
  }

  const progressState = deriveGoalProgressState({
    currentValue: newCurrent,
    targetValue: goal.targetValue,
    targetOperator: goal.targetOperator,
    isReverseKpi: goal.isReverseKpi,
    previousStage: goal.stage,
    progressPercentage: goal.progressPercentage
  });

  const performanceRiskZone = resolveGoalEscalationStatus({
    currentValue: newCurrent,
    preciseCurrentValue: String(newCurrent),
    targetValue: goal.targetValue,
    preciseTargetValue: goal.preciseTargetValue,
    allowableVariance: goal.allowableVariance,
    isReverseKpi: goal.isReverseKpi,
    endDate: goal.endDate
  });

  const syncConfigRaw = goal.syncConfig;
  const syncConfig =
    syncConfigRaw && typeof syncConfigRaw === "object" && !Array.isArray(syncConfigRaw)
      ? (syncConfigRaw as Record<string, unknown>)
      : {};

  const nextSyncConfig =
    glNativeBaseline != null
      ? {
          ...syncConfig,
          source: "posted_journal_lines",
          glNativeAmount: glNativeBaseline,
          glLastIncrement: null,
          glRevertedAt: new Date().toISOString()
        }
      : null;

  if (APPLY) {
    await prisma.performanceGoal.update({
      where: { id: goalId },
      data: {
        currentValue: newCurrent,
        preciseCurrentValue: String(newCurrent),
        progressPercentage: progressState.progressPercentage,
        status: progressState.status,
        stage: progressState.stage,
        performanceRiskZone,
        performanceRiskZoneAt: new Date(),
        lastSyncedAt: null,
        lastSyncedValue: null,
        ...legacyProgressFieldsForGoal(goal, newCurrent),
        ...(nextSyncConfig ? { syncConfig: nextSyncConfig } : {}),
        updatedAt: new Date()
      }
    });
  }
}

async function main() {
  console.log(`\n=== Revert GL login sync damage (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);
  console.log("Restore company + department currentValue to:", RESTORE_CURRENT);
  console.log("Pending GL increment for next sync:", GL_INCREMENT_PENDING);

  const company = await prisma.performanceGoal.findUnique({
    where: { id: COMPANY_GOAL_ID },
    include: { kpi: true }
  });
  const dept = await prisma.performanceGoal.findUnique({ where: { id: DEPARTMENT_GOAL_ID } });

  console.log("\nBefore — company:", {
    title: company?.title,
    current: company?.currentValue?.toString(),
    syncConfig: company?.syncConfig
  });
  console.log("Before — department:", {
    title: dept?.title,
    current: dept?.currentValue?.toString()
  });

  const glEvents = await prisma.performanceGoalProgressEvent.findMany({
    where: {
      goalId: { in: [COMPANY_GOAL_ID, DEPARTMENT_GOAL_ID] },
      source: "gl_sync"
    },
    select: { id: true, goalId: true, amount: true, sourceRef: true, createdAt: true }
  });
  console.log(`\ngl_sync events to delete: ${glEvents.length}`);

  let glNativeBaseline: number | null = null;
  if (company?.kpi) {
    const { periodStart, periodEnd } = defaultLoginSyncPeriod();
    const profile = resolveKpiFinancialProfile(company.kpi);
    const glNow = await FinancialKpiGlValueService.fetchNativeGlValue({
      profile,
      periodStart,
      periodEnd
    });
    if (glNow != null && GL_INCREMENT_PENDING > 0) {
      glNativeBaseline = glNow - GL_INCREMENT_PENDING;
    } else if (glNow != null) {
      glNativeBaseline = glNow;
    }
    console.log("\nGL TOTAL_REVENUE native (login period):", glNow);
    console.log("glNativeAmount baseline after revert:", glNativeBaseline);
    console.log(`Next login sync should add +${GL_INCREMENT_PENDING} → ${RESTORE_CURRENT + GL_INCREMENT_PENDING}`);
  }

  if (APPLY) {
    const deleted = await prisma.performanceGoalProgressEvent.deleteMany({
      where: {
        goalId: { in: [COMPANY_GOAL_ID, DEPARTMENT_GOAL_ID] },
        source: "gl_sync"
      }
    });
    console.log(`\nDeleted ${deleted.count} gl_sync progress events`);

    await restoreGoalCurrent(COMPANY_GOAL_ID, RESTORE_CURRENT, glNativeBaseline);
    await restoreGoalCurrent(DEPARTMENT_GOAL_ID, RESTORE_CURRENT, null);
    console.log("\n✅ Restored company + department goals");
  } else {
    console.log("\nDry run — pass --apply to restore goals and delete gl_sync events");
  }

  const afterCompany = await prisma.performanceGoal.findUnique({
    where: { id: COMPANY_GOAL_ID },
    select: { currentValue: true, progressPercentage: true, stage: true, syncConfig: true }
  });
  const afterDept = await prisma.performanceGoal.findUnique({
    where: { id: DEPARTMENT_GOAL_ID },
    select: { currentValue: true, progressPercentage: true, stage: true }
  });
  console.log("\nAfter — company:", afterCompany);
  console.log("After — department:", afterDept);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
