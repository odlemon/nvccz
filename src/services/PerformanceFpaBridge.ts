// @ts-nocheck
/**
 * Performance <-> FP&A integration bridge (SRD-4 §22-25).
 *
 * Follows this codebase's existing cross-module bridge convention (see
 * PerformanceGoalProgressBridge.ts, fpa/FpaPlanningPmTaskBridge.ts): plain
 * inline service calls invoked directly from the triggering code path, no
 * event bus. Every entry point is wrapped so a bridge failure never blocks
 * the FP&A or Performance action that triggered it.
 *
 * Direction 1 (FP&A -> Performance, targets): onVersionLocked() reads each
 * active Target Mapping's line item from the now-locked version, snapshots
 * it, and only raises the linked goal's live target if it is not already
 * set or the new value is not lower (guardrail: never let a later, lower
 * forecast erase an existing target).
 *
 * Direction 2 (Performance -> FP&A, review trigger, never a direct write):
 * checkKpiBreach() is called after a goal's progress is recomputed. If the
 * goal's KPI has an active Driver Mapping and achievement is below its
 * threshold, it creates a ForecastReviewTrigger row for a human FP&A
 * reviewer. It never writes to planning_cells/planning_drivers.
 *
 * Direction 3 (FP&A -> Performance, forecast snapshot, informational):
 * onVersionLocked() also records a ForecastSnapshot per mapping, displayed
 * alongside (never instead of) the goal's target/actual.
 */
import { prisma } from "../utils/database";
import { logger } from "../utils/logger";

function periodLabelFor(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function sumCells(lineItemId: string, versionId: string): Promise<number | null> {
  const cells = await prisma.planningCell.findMany({
    where: { lineItemId, versionId },
    select: { value: true },
  });
  if (!cells.length) return null;
  return cells.reduce((s, c) => s + Number(c.value || 0), 0);
}

async function latestPeriodValue(lineItemId: string, versionId: string): Promise<number | null> {
  const cell = await prisma.planningCell.findFirst({
    where: { lineItemId, versionId },
    orderBy: { periodDate: "desc" },
    select: { value: true },
  });
  return cell ? Number(cell.value || 0) : null;
}

async function computeMappedValue(
  lineItemId: string,
  versionId: string,
  method: string
): Promise<number | null> {
  const m = String(method || "FULL_YEAR_VALUE").toUpperCase();
  if (m === "LATEST_PERIOD") return latestPeriodValue(lineItemId, versionId);
  if (m === "AVERAGE") {
    const cells = await prisma.planningCell.findMany({ where: { lineItemId, versionId }, select: { value: true } });
    if (!cells.length) return null;
    return cells.reduce((s, c) => s + Number(c.value || 0), 0) / cells.length;
  }
  // FULL_YEAR_VALUE (default)
  return sumCells(lineItemId, versionId);
}

export class PerformanceFpaBridge {
  /** Direction 1 + 3: called after FpaVersionService.lock() commits. */
  static async onVersionLocked(modelId: string, versionId: string): Promise<void> {
    try {
      const mappings = await prisma.performanceFpaTargetMapping.findMany({
        where: { modelId, isActive: true },
      });
      if (!mappings.length) return;

      for (const mapping of mappings) {
        const targetValue = await computeMappedValue(mapping.lineItemId, versionId, mapping.targetMappingMethod);
        const forecastValue = await latestPeriodValue(mapping.lineItemId, versionId);
        const goals = await prisma.performanceGoal.findMany({ where: { kpiId: mapping.kpiId } });

        if (targetValue != null) {
          if (!goals.length) {
            await prisma.performanceFinancialTargetSnapshot.create({
              data: {
                targetMappingId: mapping.id,
                sourceVersionId: versionId,
                snapshotValue: targetValue,
                appliedToGoal: false,
              },
            });
          }
          for (const goal of goals) {
            const currentTarget = goal.targetValue != null ? Number(goal.targetValue) : null;
            const appliedToGoal = currentTarget == null || targetValue >= currentTarget;
            if (appliedToGoal) {
              await prisma.performanceGoal.update({
                where: { id: goal.id },
                data: { targetValue },
              });
            }
            await prisma.performanceFinancialTargetSnapshot.create({
              data: {
                targetMappingId: mapping.id,
                performanceGoalId: goal.id,
                sourceVersionId: versionId,
                snapshotValue: targetValue,
                appliedToGoal,
              },
            });
          }
        }

        if (forecastValue != null) {
          if (!goals.length) {
            await prisma.performanceForecastSnapshot.create({
              data: {
                kpiId: mapping.kpiId,
                modelId,
                sourceVersionId: versionId,
                forecastValue,
              },
            });
          }
          for (const goal of goals) {
            await prisma.performanceForecastSnapshot.create({
              data: {
                kpiId: mapping.kpiId,
                performanceGoalId: goal.id,
                modelId,
                sourceVersionId: versionId,
                forecastValue,
              },
            });
          }
        }
      }
    } catch (e) {
      logger.warn("[PerformanceFpaBridge] onVersionLocked failed", e);
    }
  }

  /**
   * Direction 2: called after a goal's currentValue/performanceRiskZone is
   * recomputed (PerformanceGoalProgressEventService.recomputeGoalCurrentFromEvents).
   * Single-period breach check only — consecutivePeriods is stored on the
   * mapping for a future enhancement but not yet enforced here.
   */
  static async checkKpiBreach(goal: { id: string; kpiId?: string | null; targetValue?: any; currentValue?: any; assignedToId?: string | null }): Promise<void> {
    try {
      if (!goal.kpiId) return;
      const mapping = await prisma.performanceFpaDriverMapping.findFirst({
        where: { kpiId: goal.kpiId, isActive: true },
      });
      if (!mapping) return;

      const target = goal.targetValue != null ? Number(goal.targetValue) : null;
      const actual = goal.currentValue != null ? Number(goal.currentValue) : null;
      if (target == null || target === 0 || actual == null) return;
      const achievementPct = (actual / Math.abs(target)) * 100;
      const threshold = Number(mapping.thresholdPct);
      if (achievementPct >= threshold) return;

      const period = periodLabelFor();
      const existing = await prisma.performanceForecastReviewTrigger.findFirst({
        where: {
          performanceGoalId: goal.id,
          performancePeriod: period,
          status: { in: ["OPEN", "UNDER_REVIEW"] },
        },
      });
      if (existing) return; // idempotent — don't re-raise an already-open trigger for this period

      const workingVersion = await prisma.planningVersion.findFirst({
        where: { modelId: mapping.modelId, status: { not: "ARCHIVED" } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      const currentDriverValue = workingVersion
        ? await latestPeriodValue(mapping.lineItemId, workingVersion.id)
        : null;

      await prisma.performanceForecastReviewTrigger.create({
        data: {
          kpiId: goal.kpiId,
          performanceGoalId: goal.id,
          kpiOwnerId: goal.assignedToId || null,
          performancePeriod: period,
          targetValue: target,
          actualValue: actual,
          achievementPct,
          driverMappingId: mapping.id,
          currentDriverValue,
          triggerReason: `KPI achievement ${achievementPct.toFixed(1)}% is below the configured threshold of ${threshold}%.`,
          status: "OPEN",
        },
      });
    } catch (e) {
      logger.warn("[PerformanceFpaBridge] checkKpiBreach failed", e);
    }
  }
}
