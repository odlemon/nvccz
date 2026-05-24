// @ts-nocheck
import { prisma } from "../utils/database";
import { deriveGoalProgressState } from "./performanceGoalRollupUtils";
import {
  inferReverseKpiFromNameOrAccountType,
  legacyProgressFieldsForGoal,
  parseProgressBaseline
} from "./PerformanceGoalService";
import { resolveGoalEscalationStatus } from "./performanceScorecardSupport";
import type { ProgressEventSource } from "./performanceGoalSyncUtils";
import { glSyncSourceRef } from "./performanceGoalSyncUtils";

export type RecordProgressEventInput = {
  goalId: string;
  amount: number;
  recordedAt?: Date;
  source: ProgressEventSource;
  sourceRef?: string | null;
  createdById: string;
  journalEntryId?: string | null;
  /** When true, replace existing row with same goalId+source+sourceRef instead of inserting. */
  replaceExisting?: boolean;
};

export class PerformanceGoalProgressEventService {
  static async sumEventsForGoal(goalId: string, excludeGlSync = false): Promise<number> {
    const rows = await prisma.performanceGoalProgressEvent.findMany({
      where: {
        goalId,
        ...(excludeGlSync ? { source: { not: "gl_sync" } } : {})
      },
      select: { amount: true }
    });
    return rows.reduce((sum, r) => {
      const n = parseFloat(String(r.amount ?? 0));
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }

  static async recordEvent(input: RecordProgressEventInput): Promise<{ eventId: string; total: number }> {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount)) {
      throw new Error("Progress event amount must be a number");
    }

    const recordedAt = input.recordedAt ?? new Date();

    if (input.replaceExisting && input.sourceRef) {
      await prisma.performanceGoalProgressEvent.deleteMany({
        where: {
          goalId: input.goalId,
          source: input.source,
          sourceRef: input.sourceRef
        }
      });
    }

    const event = await prisma.performanceGoalProgressEvent.create({
      data: {
        goalId: input.goalId,
        amount,
        recordedAt,
        source: input.source,
        sourceRef: input.sourceRef ?? null,
        journalEntryId: input.journalEntryId ?? null,
        createdById: input.createdById
      }
    });

    const total = await this.recomputeGoalCurrentFromEvents(input.goalId);
    return { eventId: event.id, total };
  }

  static async upsertGlSyncEvent(params: {
    goalId: string;
    glNativeAmount: number;
    periodStart: Date;
    periodEnd: Date;
    createdById: string;
  }): Promise<{ eventId: string; total: number }> {
    const sourceRef = glSyncSourceRef(params.periodStart, params.periodEnd);
    return this.recordEvent({
      goalId: params.goalId,
      amount: params.glNativeAmount,
      recordedAt: params.periodEnd,
      source: "gl_sync",
      sourceRef,
      createdById: params.createdById,
      replaceExisting: true
    });
  }

  static async recomputeGoalCurrentFromEvents(goalId: string): Promise<number> {
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: goalId },
      include: { kpi: { select: { name: true, accountType: true } } }
    });
    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    const total = await this.sumEventsForGoal(goalId, false);

    const inferredReverse = inferReverseKpiFromNameOrAccountType(
      goal.kpi?.name,
      goal.title,
      goal.kpi?.accountType
    );
    const effectiveIsReverseKpi =
      Boolean(goal.isReverseKpi) ||
      String(goal.targetOperator || "").trim() === "<=" ||
      inferredReverse;
    const effectiveTargetOperator =
      goal.targetOperator != null && goal.targetOperator !== ""
        ? goal.targetOperator
        : effectiveIsReverseKpi
          ? "<="
          : ">=";

    const progressState = deriveGoalProgressState({
      currentValue: total,
      targetValue: goal.targetValue,
      targetOperator: effectiveTargetOperator,
      isReverseKpi: effectiveIsReverseKpi,
      previousStage: goal.stage,
      progressPercentage: goal.progressPercentage
    });

    const legacyData = legacyProgressFieldsForGoal(goal, total);
    const performanceRiskZone = resolveGoalEscalationStatus({
      preciseCurrentValue: String(total),
      currentValue: total,
      preciseTargetValue: goal.preciseTargetValue,
      targetValue: goal.targetValue,
      allowableVariance: goal.allowableVariance,
      isReverseKpi: effectiveIsReverseKpi,
      endDate: goal.endDate
    });

    await prisma.performanceGoal.update({
      where: { id: goalId },
      data: {
        currentValue: total,
        preciseCurrentValue: String(total),
        progressPercentage: progressState.progressPercentage,
        status: progressState.status,
        stage: progressState.stage,
        performanceRiskZone,
        performanceRiskZoneAt: new Date(),
        lastSyncedAt: new Date(),
        lastSyncedValue: total,
        ...legacyData,
        updatedAt: new Date()
      }
    });

    return total;
  }

  static async getEventsForGoal(goalId: string) {
    return prisma.performanceGoalProgressEvent.findMany({
      where: { goalId },
      orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
      include: {
        journalEntry: { select: { id: true, referenceNumber: true, description: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });
  }

  /** Seed a single manual event from existing goal current when no events exist yet. */
  static async ensureBaselineFromGoalCurrent(goalId: string, createdById: string): Promise<void> {
    const count = await prisma.performanceGoalProgressEvent.count({ where: { goalId } });
    if (count > 0) return;

    const goal = await prisma.performanceGoal.findUnique({ where: { id: goalId } });
    if (!goal) return;

    const baseline = parseProgressBaseline(goal);
    if (baseline <= 0) return;

    await this.recordEvent({
      goalId,
      amount: baseline,
      recordedAt: goal.updatedAt ?? new Date(),
      source: "manual",
      sourceRef: "baseline_migration",
      createdById
    });
  }
}
