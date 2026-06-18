// @ts-nocheck
import { prisma } from "../utils/database";
import { FORECAST_ERROR_CODES } from "../constants/forecastingEngine";
import { ForecastingError } from "./ForecastingError";
import { ForecastingAuditService } from "./ForecastingAuditService";

export class ForecastingEventsBridgeService {
  static async recordPrepaidAccrual(eventId: string, amount: number, actorId?: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, approvedBudget: true }
    });
    if (!event) return { skipped: true };

    const scenarios = await prisma.forecastScenario.findMany({
      where: { status: { in: ["ACTIVE", "DRAFT"] } },
      take: 5
    });

    for (const scenario of scenarios) {
      await ForecastingAuditService.log(prisma, {
        scenarioId: scenario.id,
        userId: actorId ?? null,
        actionType: "COMPUTE",
        deltaPayload: {
          internal_event: "PREPAID_EVENT_ACCRUAL",
          event_id: eventId,
          event_title: event.title,
          amount,
          edit_type: "SCENARIO_RECALC"
        }
      });
    }
    return { recorded: true, event_id: eventId, amount };
  }

  static async assertEventWithinForecastBoundary(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { budgetItems: true }
    });
    if (!event) return;

    const totalBudget = event.budgetItems.reduce(
      (sum, item) => sum + Number(item.estimatedCost) * Number(item.quantity || 1),
      0
    );
    const approved = Number(event.approvedBudget ?? totalBudget);

    const scenarios = await prisma.forecastScenario.findMany({
      where: { status: { in: ["ACTIVE", "DRAFT"] } },
      take: 1
    });
    if (!scenarios.length) return;

    const scenario = scenarios[0];
    const opexAgg = await prisma.forecastCell.aggregate({
      where: {
        scenarioId: scenario.id,
        account: { accountType: "Expense" }
      },
      _sum: { forecastValue: true }
    });
    const opexBoundary = Number(opexAgg._sum.forecastValue ?? 0);
    if (opexBoundary > 0 && approved > opexBoundary) {
      throw new ForecastingError(
        FORECAST_ERROR_CODES.EVENT_BUDGET_EXCEEDED,
        `Event budget ${approved} exceeds forecast OpEx boundary ${opexBoundary}`,
        422,
        { event_id: eventId, approved, opex_boundary: opexBoundary }
      );
    }
  }
}
