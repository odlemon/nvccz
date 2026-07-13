// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";
import { pickCanonicalCells } from "./FpaCellCanonical";

function directionFor(lineItemType: string, varianceAmount: number): string {
  const t = String(lineItemType || "").toUpperCase();
  const favPositive = t === "REVENUE" || t === "CASH" || t === "CALC";
  if (favPositive) {
    return varianceAmount >= 0 ? "FAVORABLE" : "UNFAVORABLE";
  }
  // EXPENSE / DRIVER: under budget is favorable
  return varianceAmount <= 0 ? "FAVORABLE" : "UNFAVORABLE";
}

const BOOK_LABELS: Record<string, string> = {
  BUDGET: "Budget",
  PLAN: "Budget",
  BASE: "Base",
  FORECAST: "Forecast",
  ACTUAL: "Actual",
};

function normalizeBook(raw: string): string {
  const k = String(raw || "").trim().toUpperCase();
  if (["BUDGET", "PLAN", "BASE", "FORECAST", "ACTUAL"].includes(k)) {
    if (k === "PLAN") return "BUDGET";
    return k;
  }
  return "BUDGET";
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

  /**
   * Lightweight waterfall bridge for Model Planning §42.
   * v1: start book total → variance delta → end book total (no Price/Volume/Mix yet).
   */
  static async varianceBridge(modelId: string, query: any = {}) {
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");

    const metric = String(query.metric || "REVENUE").trim().toUpperCase();
    const fromBook = normalizeBook(query.from || "BUDGET");
    const toBook = normalizeBook(query.to || "FORECAST");

    let cycleId = query.cycleId ? String(query.cycleId) : null;
    let versionId = query.versionId ? String(query.versionId) : null;
    let scenarioId = query.scenarioId ? String(query.scenarioId) : null;
    let cutoff: Date | null = null;

    if (cycleId) {
      const cycle = await prisma.planningBudgetCycle.findFirst({
        where: { id: cycleId, modelId },
      });
      if (!cycle) throw new FpaError(404, "NOT_FOUND", "Budget cycle not found for model");
      versionId = versionId || cycle.versionId || null;
      scenarioId = scenarioId || cycle.scenarioId || null;
      cutoff = cycle.actualsCutoffDate || cycle.forecastStartPeriod || null;
    }

    if (!versionId || !scenarioId) {
      const versions = await prisma.planningVersion.findMany({
        where: { modelId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      const scenarios = await prisma.planningScenario.findMany({
        where: { modelId },
        orderBy: { createdAt: "asc" },
      });
      if (!versionId) {
        versionId =
          versions.find((v) => String(v.status).toUpperCase() === "DRAFT")?.id ||
          versions.find((v) => String(v.status).toUpperCase() === "PUBLISHED")?.id ||
          versions[0]?.id ||
          null;
      }
      if (!scenarioId) {
        scenarioId = scenarios.find((s) => s.isOfficial)?.id || scenarios[0]?.id || null;
      }
    }
    if (!versionId) throw new FpaError(400, "VALIDATION", "versionId required (or bind a cycle with versionId)");
    if (!scenarioId) throw new FpaError(400, "VALIDATION", "scenarioId required (or bind a cycle with scenarioId)");

    const allScenarios = await prisma.planningScenario.findMany({ where: { modelId } });
    const fromScenarioId = FpaVarianceService.resolveScenarioForBook(allScenarios, fromBook, scenarioId);
    const toScenarioId = FpaVarianceService.resolveScenarioForBook(allScenarios, toBook, scenarioId);

    const lineItems = await FpaVarianceService.resolveMetricLineItems(modelId, metric);
    if (!lineItems.length) {
      throw new FpaError(404, "NOT_FOUND", `No line items matched metric=${metric}`);
    }
    const lineItemIds = lineItems.map((l) => l.id);

    const startValue = await FpaVarianceService.sumBook({
      modelId,
      versionId,
      scenarioId: fromScenarioId,
      lineItemIds,
      book: fromBook,
      cutoff,
    });
    const endValue = await FpaVarianceService.sumBook({
      modelId,
      versionId,
      scenarioId: toScenarioId,
      lineItemIds,
      book: toBook,
      cutoff,
    });
    const variance = endValue - startValue;
    const startLabel = BOOK_LABELS[fromBook] || fromBook;
    const endLabel = BOOK_LABELS[toBook] || toBook;

    return {
      metric,
      from: fromBook,
      to: toBook,
      startLabel,
      endLabel,
      startValue,
      endValue,
      variance,
      points: [
        { label: startLabel, value: startValue },
        { label: "Variance", value: variance },
        { label: endLabel, value: endValue },
      ],
      lineItemIds,
      lineItemCodes: lineItems.map((l) => l.code),
      versionId,
      scenarioId: toScenarioId,
      fromScenarioId,
      toScenarioId,
      cycleId,
    };
  }

  static resolveScenarioForBook(
    scenarios: Array<{ id: string; scenarioType?: string; name?: string; isOfficial?: boolean }>,
    book: string,
    fallbackId: string
  ) {
    if (!scenarios.length) return fallbackId;
    const type = (s: any) => String(s.scenarioType || "").toUpperCase();
    const name = (s: any) => String(s.name || "").toUpperCase();
    if (book === "FORECAST") {
      return (
        scenarios.find((s) => type(s) === "FORECAST" || name(s).includes("FORECAST"))?.id ||
        scenarios.find((s) => type(s) === "UPSIDE" || type(s) === "DOWNSIDE")?.id ||
        fallbackId
      );
    }
    if (book === "BUDGET" || book === "BASE" || book === "PLAN") {
      return (
        scenarios.find((s) => type(s) === "BUDGET" || type(s) === "BASE" || name(s).includes("BUDGET"))?.id ||
        scenarios.find((s) => s.isOfficial)?.id ||
        fallbackId
      );
    }
    return fallbackId;
  }

  static async resolveMetricLineItems(modelId: string, metric: string) {
    const exact = await prisma.planningLineItem.findMany({
      where: { modelId, code: metric },
      select: { id: true, code: true, name: true, category: true },
    });
    if (exact.length) return exact;

    const byCat = await prisma.planningLineItem.findMany({
      where: {
        modelId,
        OR: [{ category: metric }, { category: { contains: metric } }, { code: { contains: metric } }],
      },
      select: { id: true, code: true, name: true, category: true },
      take: 20,
    });
    if (byCat.length) return byCat;

    if (metric === "REVENUE" || metric === "SALES") {
      return prisma.planningLineItem.findMany({
        where: {
          modelId,
          OR: [
            { code: { in: ["REVENUE", "GROSS_REVENUE", "NET_REVENUE", "ARR"] } },
            { category: "REVENUE" },
          ],
        },
        select: { id: true, code: true, name: true, category: true },
      });
    }
    return [];
  }

  static async sumBook(args: {
    modelId: string;
    versionId: string;
    scenarioId: string;
    lineItemIds: string[];
    book: string;
    cutoff: Date | null;
  }) {
    const { modelId, versionId, scenarioId, lineItemIds, book, cutoff } = args;

    if (book === "ACTUAL") {
      const snaps = await prisma.planningActualsSnapshot.findMany({
        where: { modelId, lineItemId: { in: lineItemIds } },
      });
      let total = snaps.reduce((s, r) => s + Number(r.amount || 0), 0);
      if (total === 0) {
        const cells = await prisma.planningCell.findMany({
          where: {
            modelId,
            versionId,
            scenarioId,
            lineItemId: { in: lineItemIds },
            OR: [{ sourceType: "ACTUAL" }, { valueType: "ACTUAL" }],
          },
        });
        total = pickCanonicalCells(cells).reduce((s, c) => s + Number(c.value || 0), 0);
      }
      return Math.round(total * 100) / 100;
    }

    const cells = await prisma.planningCell.findMany({
      where: {
        modelId,
        versionId,
        scenarioId,
        lineItemId: { in: lineItemIds },
      },
    });
    const canonical = pickCanonicalCells(cells);

    let filtered = canonical;
    if (book === "FORECAST" && cutoff) {
      const cut = new Date(cutoff);
      filtered = canonical.filter(
        (c) => new Date(c.periodDate) >= cut && String(c.sourceType || "").toUpperCase() !== "ACTUAL"
      );
    } else if (book === "BUDGET" || book === "BASE") {
      if (cutoff) {
        const cut = new Date(cutoff);
        const pre = canonical.filter(
          (c) => new Date(c.periodDate) < cut && String(c.sourceType || "").toUpperCase() !== "ACTUAL"
        );
        filtered = pre.length
          ? pre
          : canonical.filter((c) => String(c.sourceType || "").toUpperCase() !== "ACTUAL");
      } else {
        filtered = canonical.filter((c) => String(c.sourceType || "").toUpperCase() !== "ACTUAL");
      }
    } else {
      filtered = canonical.filter((c) => String(c.sourceType || "").toUpperCase() !== "ACTUAL");
    }

    const total = filtered.reduce((s, c) => s + Number(c.value || 0), 0);
    return Math.round(total * 100) / 100;
  }
}
