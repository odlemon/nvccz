// @ts-nocheck
import { prisma } from "../utils/database";
import { logger } from "../utils/logger";
import { PerformanceGoalProgressEventService } from "./PerformanceGoalProgressEventService";
import { KpiAccountingIntegrationService } from "./KpiAccountingIntegrationService";
import { AccountingGoalSyncService } from "./AccountingGoalSyncService";
import type { ProgressEventSource } from "./performanceGoalSyncUtils";

export type ApplyProgressDeltaInput = {
  goalId: string;
  delta: number;
  source: ProgressEventSource;
  sourceRef?: string | null;
  recordedAt?: Date;
  actorId: string;
  /** When true, record event but do not post a journal (task path posts at company goal). */
  skipJournal?: boolean;
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

    if (!input.skipJournal && goal.kpi && delta > 0) {
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

  /** Walk up parentGoalId chain to the top-level company goal. */
  static async findRootCompanyGoalId(startGoalId: string): Promise<string | null> {
    let currentId: string | null = startGoalId;
    const seen = new Set<string>();
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const row = await prisma.performanceGoal.findUnique({
        where: { id: currentId },
        select: { id: true, type: true, parentGoalId: true }
      });
      if (!row) return null;
      if (String(row.type || "").toLowerCase() === "company" && !row.parentGoalId) {
        return row.id;
      }
      if (String(row.type || "").toLowerCase() === "company" && row.parentGoalId) {
        return row.id;
      }
      currentId = row.parentGoalId;
    }
    return null;
  }

  /**
   * After task activity: record increment on leaf goal (no JE), roll up parents, post PERF-GOAL at company.
   */
  static async postCompanyJournalForTaskIncrement(input: {
    leafGoalId: string;
    increment: number;
    taskId: string;
    actorId: string;
    companyGoalId?: string | null;
    preloadedCompanyGoal?: {
      id: string;
      kpi: Record<string, unknown>;
      parentGoalId?: string | null;
      title?: string;
      targetUnit?: string | null;
      createdById?: string;
      formulaType?: string | null;
    } | null;
  }): Promise<string | null> {
    const increment = Number(input.increment);
    if (!Number.isFinite(increment) || increment <= 0) {
      return null;
    }

    const companyGoalId =
      input.companyGoalId ??
      (await this.findRootCompanyGoalId(input.leafGoalId));
    if (!companyGoalId) {
      logger.info("Task progress: no company goal in hierarchy — skip company JE", {
        leafGoalId: input.leafGoalId
      });
      return null;
    }

    const companyGoal =
      input.preloadedCompanyGoal?.id === companyGoalId
        ? input.preloadedCompanyGoal
        : await prisma.performanceGoal.findUnique({
            where: { id: companyGoalId },
            include: { kpi: true }
          });
    if (!companyGoal?.kpi) {
      return null;
    }

    const sourceRef = `task:${input.taskId}:${Date.now()}`;
    const { eventId } = await PerformanceGoalProgressEventService.recordEvent({
      goalId: companyGoalId,
      amount: increment,
      recordedAt: new Date(),
      source: "task",
      sourceRef,
      createdById: input.actorId,
      skipRecompute: true
    });

    try {
      const journalEntryId = await KpiAccountingIntegrationService.postPerformanceProgressJournal({
        goalId: companyGoalId,
        eventId,
        amount: increment,
        recordedAt: new Date(),
        actorId: input.actorId,
        preloadedGoal: companyGoal
      });
      if (journalEntryId) {
        await prisma.performanceGoalProgressEvent.update({
          where: { id: eventId },
          data: { journalEntryId }
        });
      }
      return journalEntryId;
    } catch (err: any) {
      logger.warn("Company task progress JE failed", {
        companyGoalId,
        eventId,
        message: err?.message
      });
      return null;
    }
  }
}
