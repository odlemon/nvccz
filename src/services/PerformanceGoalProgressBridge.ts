// @ts-nocheck
import { prisma } from "../utils/database";
import { logger } from "../utils/logger";
import { PerformanceGoalProgressEventService } from "./PerformanceGoalProgressEventService";
import { KpiAccountingIntegrationService } from "./KpiAccountingIntegrationService";
import { AccountingGoalSyncService } from "./AccountingGoalSyncService";
import type { ProgressEventSource } from "./performanceGoalSyncUtils";
import { resolveKpiAccountingConfig } from "../utils/kpiCatalogMetadata";

const NET_PROFIT_CODE = "NET_PROFIT";

export type ApplyProgressDeltaInput = {
  goalId: string;
  delta: number;
  source: ProgressEventSource;
  sourceRef?: string | null;
  recordedAt?: Date;
  actorId: string;
};

/**
 * Records a progress event, posts an incremental performance JE when applicable, and cascades rollups.
 */
export class PerformanceGoalProgressBridge {
  static async applyDelta(input: ApplyProgressDeltaInput): Promise<{ eventId: string; total: number } | null> {
    const delta = Number(input.delta);
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.0005) {
      return null;
    }

    const goal = await prisma.performanceGoal.findUnique({
      where: { id: input.goalId },
      include: { kpi: true }
    });
    if (!goal) {
      throw new Error(`Goal not found: ${input.goalId}`);
    }

    const { eventId, total } = await PerformanceGoalProgressEventService.recordEvent({
      goalId: input.goalId,
      amount: delta,
      recordedAt: input.recordedAt ?? new Date(),
      source: input.source,
      sourceRef: input.sourceRef ?? null,
      createdById: input.actorId
    });

    const kpiCode = String(goal.kpi?.code || "").toUpperCase();
    const kpiConfig = goal.kpi ? resolveKpiAccountingConfig(goal.kpi) : null;

    const shouldPostJe =
      goal.kpi &&
      kpiConfig?.isFinancial &&
      kpiCode !== NET_PROFIT_CODE &&
      String(goal.formulaType || "").toUpperCase() !== NET_PROFIT_CODE &&
      delta > 0;

    if (shouldPostJe) {
      try {
        const journalEntryId = await KpiAccountingIntegrationService.postPerformanceProgressJournal({
          goalId: input.goalId,
          eventId,
          amount: delta,
          recordedAt: input.recordedAt ?? new Date(),
          actorId: input.actorId
        });
        if (journalEntryId) {
          await prisma.performanceGoalProgressEvent.update({
            where: { id: eventId },
            data: { journalEntryId }
          });
        }
      } catch (err: any) {
        logger.warn("Performance progress JE failed (goal progress recorded)", {
          goalId: input.goalId,
          eventId,
          message: err?.message
        });
      }
    }

    await AccountingGoalSyncService.cascadeAfterGoalUpdate(input.goalId, goal.kpiId);

    return { eventId, total };
  }
}
