// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { PerformanceGoalProgressBridge } from "./PerformanceGoalProgressBridge";
import { ForecastingAccessService } from "./ForecastingAccessService";
import { ForecastingAuditService } from "./ForecastingAuditService";
import { ForecastingError } from "./ForecastingError";
import { FORECAST_ERROR_CODES } from "../constants/forecastingEngine";

export class ForecastingOpmBridgeService {
  static async listGoalLinks(scenarioId: string, user?: any) {
    await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
    return prisma.forecastGoalLink.findMany({
      where: { scenarioId },
      include: { performanceGoal: { select: { id: true, title: true, targetValue: true, currentValue: true } } }
    });
  }

  static async createGoalLink(
    scenarioId: string,
    user: { id: string },
    body: { performance_goal_id: string; account_id?: string; threshold_value?: number }
  ) {
    const scenario = await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
    ForecastingAccessService.assertScenarioEditable(scenario);
    const goal = await prisma.performanceGoal.findUnique({ where: { id: body.performance_goal_id } });
    if (!goal) {
      throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_COORDINATES, "Performance goal not found", 400);
    }
    const link = await prisma.$transaction(async (tx) => {
      const row = await tx.forecastGoalLink.create({
        data: {
          scenarioId,
          performanceGoalId: body.performance_goal_id,
          accountId: body.account_id || null,
          thresholdValue: body.threshold_value != null ? new Decimal(body.threshold_value) : null
        }
      });
      await ForecastingAuditService.log(tx, {
        scenarioId,
        userId: user.id,
        actionType: "GOAL_LINK_CREATE",
        deltaPayload: {
          performance_goal_id: body.performance_goal_id,
          performance_goal_title: goal.title,
          account_id: body.account_id ?? null,
          threshold_value: body.threshold_value ?? null
        }
      });
      return row;
    });
    return link;
  }

  static async deleteGoalLink(scenarioId: string, linkId: string, user: { id: string }) {
    const scenario = await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
    ForecastingAccessService.assertScenarioEditable(scenario);
    const existing = await prisma.forecastGoalLink.findFirst({
      where: { id: linkId, scenarioId },
      include: { performanceGoal: { select: { id: true, title: true } } }
    });
    await prisma.$transaction(async (tx) => {
      await tx.forecastGoalLink.deleteMany({ where: { id: linkId, scenarioId } });
      await ForecastingAuditService.log(tx, {
        scenarioId,
        userId: user.id,
        actionType: "GOAL_LINK_DELETE",
        deltaPayload: {
          link_id: linkId,
          performance_goal_id: existing?.performanceGoalId ?? null,
          performance_goal_title: existing?.performanceGoal?.title ?? null
        }
      });
    });
    return { deleted: true };
  }

  static async onComputeCompleted(scenarioId: string, actorId: string) {
    const links = await prisma.forecastGoalLink.findMany({
      where: { scenarioId },
      include: { performanceGoal: true }
    });
    if (!links.length) return { updated: 0 };

    let updated = 0;
    for (const link of links) {
      const where: any = { scenarioId };
      if (link.accountId) where.accountId = link.accountId;
      const agg = await prisma.forecastCell.aggregate({
        where,
        _sum: { forecastValue: true }
      });
      const total = Number(agg._sum.forecastValue ?? 0);
      const previous = Number(link.performanceGoal.currentValue ?? 0);
      const delta = total - previous;
      if (Math.abs(delta) > 0.0005) {
        await PerformanceGoalProgressBridge.applyDelta({
          goalId: link.performanceGoalId,
          delta,
          source: "forecast_sync" as any,
          sourceRef: scenarioId,
          actorId,
          skipJournal: true
        });
        await prisma.performanceGoal.update({
          where: { id: link.performanceGoalId },
          data: { currentValue: new Decimal(total), lastSyncedAt: new Date() }
        });
        updated++;
      }

      if (link.thresholdValue != null && total < Number(link.thresholdValue)) {
        await prisma.performanceGoal.update({
          where: { id: link.performanceGoalId },
          data: {
            stage: "execution",
            status: "at_risk",
            performanceRiskZone: "RED",
            performanceRiskZoneAt: new Date()
          }
        });
      }
    }
    return { updated };
  }
}
