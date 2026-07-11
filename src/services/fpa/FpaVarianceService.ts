// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";

function directionFor(lineItemType: string, varianceAmount: number): string {
  const t = String(lineItemType || "").toUpperCase();
  const favPositive = t === "REVENUE" || t === "CASH" || t === "CALC";
  if (favPositive) {
    return varianceAmount >= 0 ? "FAVORABLE" : "UNFAVORABLE";
  }
  // EXPENSE / DRIVER: under budget is favorable
  return varianceAmount <= 0 ? "FAVORABLE" : "UNFAVORABLE";
}

export class FpaVarianceService {
  static async calculate(input: any, userId: string, ip?: string) {
    const { modelId, versionId, scenarioId, varianceType } = input;
    if (!modelId || !versionId) throw new FpaError(400, "VALIDATION", "modelId and versionId required");

    const lineItems = await prisma.planningLineItem.findMany({ where: { modelId } });
    const planCells = await prisma.planningCell.findMany({
      where: {
        modelId,
        versionId,
        ...(scenarioId ? { scenarioId } : {}),
        sourceType: { not: "ACTUAL" },
      },
    });
    const actualSnaps = await prisma.planningActualsSnapshot.findMany({ where: { modelId } });

    const results = [];
    for (const li of lineItems) {
      const plans = planCells.filter((c) => c.lineItemId === li.id);
      const byPeriod: Record<string, { plan: number; actual: number; periodDate: Date; departmentId?: string }> = {};
      for (const p of plans) {
        const k = p.periodDate.toISOString().slice(0, 10);
        if (!byPeriod[k]) byPeriod[k] = { plan: 0, actual: 0, periodDate: p.periodDate, departmentId: p.departmentId };
        byPeriod[k].plan += Number(p.value || 0);
      }
      for (const a of actualSnaps.filter((s) => s.lineItemId === li.id)) {
        const k = a.periodDate.toISOString().slice(0, 10);
        if (!byPeriod[k]) byPeriod[k] = { plan: 0, actual: 0, periodDate: a.periodDate };
        byPeriod[k].actual += Number(a.amount || 0);
      }

      for (const row of Object.values(byPeriod)) {
        const varianceAmount = row.actual - row.plan;
        const variancePercent = row.plan !== 0 ? (varianceAmount / Math.abs(row.plan)) * 100 : null;
        const direction = directionFor(li.lineItemType, varianceAmount);
        const created = await prisma.planningVarianceResult.create({
          data: {
            modelId,
            lineItemId: li.id,
            periodDate: row.periodDate,
            departmentId: row.departmentId || null,
            varianceType: String(varianceType || "ACTUAL_VS_PLAN"),
            actualValue: row.actual,
            planValue: row.plan,
            varianceAmount,
            variancePercent,
            direction,
            commentaryRequired: Math.abs(Number(variancePercent || 0)) >= 10,
          },
        });
        results.push(created);
      }
    }

    await FpaAuditService.log("VARIANCE_CALC", userId, { modelId, versionId, newValue: String(results.length), ip });
    return { count: results.length, results };
  }

  static async listResults(query: any = {}) {
    const where: any = {};
    if (query.modelId) where.modelId = String(query.modelId);
    if (query.varianceType) where.varianceType = String(query.varianceType);
    if (query.direction) where.direction = String(query.direction);
    return prisma.planningVarianceResult.findMany({
      where,
      include: { lineItem: true, comments: true },
      orderBy: { createdAt: "desc" },
      take: Math.min(500, Number(query.limit || 100)),
    });
  }

  static async addCommentary(varianceId: string, input: any, userId: string, ip?: string) {
    const v = await prisma.planningVarianceResult.findUnique({ where: { id: varianceId } });
    if (!v) throw new FpaError(404, "NOT_FOUND", "Variance result not found");
    const body = String(input.body || input.commentary || "").trim();
    if (!body) throw new FpaError(400, "VALIDATION", "body required");
    const comment = await prisma.planningComment.create({
      data: {
        modelId: v.modelId,
        varianceId,
        body,
        correctiveAction: input.correctiveAction || null,
        status: "OPEN",
        createdById: userId,
      },
    });
    await FpaAuditService.log("VARIANCE_COMMENTARY", userId, { modelId: v.modelId, reason: body.slice(0, 200), ip });
    return comment;
  }
}
