// @ts-nocheck
import { prisma } from "../../utils/database";

const REVENUE_CODES = ["REVENUE", "NET_REVENUE", "GROSS_REVENUE"];
const GROSS_MARGIN_CODES = ["GROSS_MARGIN", "GROSS_PROFIT"];
const COGS_CODES = ["COGS", "COST_OF_GOODS_SOLD", "COST_OF_SALES"];
const EBITDA_CODES = ["EBITDA"];

async function sumCodes(
  modelId: string,
  versionId: string | null,
  scenarioId: string | null,
  codes: string[]
): Promise<{ total: number; matchedCode: string | null; byPeriod: Record<string, number> }> {
  const lineItems = await prisma.planningLineItem.findMany({
    where: { modelId, code: { in: codes } },
    select: { id: true, code: true },
  });
  if (!lineItems.length) return { total: 0, matchedCode: null, byPeriod: {} };

  // Prefer first code that exists on the model (stable KPI mapping)
  const preferred = codes.find((c) => lineItems.some((l) => String(l.code).toUpperCase() === c));
  const use = preferred
    ? lineItems.filter((l) => String(l.code).toUpperCase() === preferred)
    : lineItems;
  const ids = use.map((l) => l.id);
  const where: any = { modelId, lineItemId: { in: ids } };
  if (versionId) where.versionId = versionId;
  if (scenarioId) where.scenarioId = scenarioId;

  const cells = await prisma.planningCell.findMany({
    where,
    select: { periodDate: true, value: true },
  });
  let total = 0;
  const byPeriod: Record<string, number> = {};
  for (const c of cells) {
    const v = Number(c.value || 0);
    total += v;
    const key = new Date(c.periodDate).toISOString().slice(0, 10);
    byPeriod[key] = (byPeriod[key] || 0) + v;
  }
  return { total, matchedCode: preferred || use[0]?.code || null, byPeriod };
}

/**
 * Live planning KPIs for Stage 3 worksheet — always reads committed cells (no cache).
 */
export class FpaPlanningSummaryService {
  static async get(modelId: string, query: any = {}) {
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) {
      const err: any = new Error("Model not found");
      err.statusCode = 404;
      err.code = "NOT_FOUND";
      throw err;
    }

    let versionId = query.versionId ? String(query.versionId) : null;
    let scenarioId = query.scenarioId ? String(query.scenarioId) : null;
    let materialVariancePct = 5;
    let financialYear: number | null = null;

    if (query.cycleId) {
      const cycle = await prisma.modelPlanningCycle.findUnique({ where: { id: String(query.cycleId) } });
      if (cycle) {
        versionId = versionId || cycle.sourceModelVersionId;
        scenarioId = scenarioId || cycle.baseScenarioId;
        financialYear = cycle.financialYear;
        if (cycle.materialVariancePct != null) materialVariancePct = Number(cycle.materialVariancePct);
      }
    }

    if (!versionId) {
      const working = await prisma.planningVersion.findFirst({
        where: { modelId, status: { not: "ARCHIVED" } },
        orderBy: { createdAt: "asc" },
      });
      versionId = working?.id || null;
    }

    const [rev, gmRaw, ebitda, cogs] = await Promise.all([
      sumCodes(modelId, versionId, scenarioId, REVENUE_CODES),
      sumCodes(modelId, versionId, scenarioId, GROSS_MARGIN_CODES),
      sumCodes(modelId, versionId, scenarioId, EBITDA_CODES),
      sumCodes(modelId, versionId, scenarioId, COGS_CODES),
    ]);
    // No dedicated Gross Margin/Gross Profit line item on this model: fall
    // back to Revenue − COGS. If there's no COGS line item either (a
    // services/advisory business with no cost-of-sales concept), Gross
    // Margin legitimately equals Revenue (0 COGS) rather than defaulting to
    // $0 — showing $0 when Revenue is millions was the bug.
    let gm = gmRaw
    if (!gmRaw.matchedCode) {
      const byPeriod: Record<string, number> = {}
      for (const p of new Set([...Object.keys(rev.byPeriod), ...Object.keys(cogs.byPeriod)])) {
        byPeriod[p] = (rev.byPeriod[p] || 0) - (cogs.byPeriod[p] || 0)
      }
      gm = {
        total: rev.total - cogs.total,
        matchedCode: cogs.matchedCode ? "REVENUE-COGS" : "REVENUE",
        byPeriod,
      }
    }

    const grossMarginPct = rev.total !== 0 ? (gm.total / Math.abs(rev.total)) * 100 : null;

    // Prior-FY revenue for variance (live read of prior-year periods)
    let priorRevenue = 0;
    if (financialYear || versionId) {
      const fy =
        financialYear ||
        (await (async () => {
          const sample = await prisma.planningCell.findFirst({
            where: { modelId, ...(versionId ? { versionId } : {}) },
            orderBy: { periodDate: "desc" },
            select: { periodDate: true },
          });
          return sample?.periodDate ? new Date(sample.periodDate).getUTCFullYear() : new Date().getUTCFullYear();
        })());
      const priorStart = new Date(Date.UTC(fy - 1, 0, 1));
      const priorEnd = new Date(Date.UTC(fy - 1, 11, 31));
      const revLines = await prisma.planningLineItem.findMany({
        where: { modelId, code: { in: REVENUE_CODES } },
        select: { id: true, code: true },
      });
      const preferred = REVENUE_CODES.find((c) => revLines.some((l) => String(l.code).toUpperCase() === c));
      const ids = revLines
        .filter((l) => !preferred || String(l.code).toUpperCase() === preferred)
        .map((l) => l.id);
      if (ids.length) {
        const priorCells = await prisma.planningCell.findMany({
          where: {
            modelId,
            lineItemId: { in: ids },
            periodDate: { gte: priorStart, lte: priorEnd },
            ...(versionId ? { versionId } : {}),
            ...(scenarioId ? { scenarioId } : {}),
          },
          select: { value: true },
        });
        priorRevenue = priorCells.reduce((s, c) => s + Number(c.value || 0), 0);
      }
    }

    const varianceAmount = rev.total - priorRevenue;
    const variancePct =
      priorRevenue !== 0 ? (varianceAmount / Math.abs(priorRevenue)) * 100 : null;

    const periods = Object.keys(rev.byPeriod).sort();
    const trend = {
      revenue: periods.map((p) => rev.byPeriod[p] || 0),
      ebitda: periods.map((p) => ebitda.byPeriod[p] || 0),
      grossMargin: periods.map((p) => gm.byPeriod[p] || 0),
      periods,
    };

    return {
      modelId,
      versionId,
      scenarioId: scenarioId || null,
      asOf: new Date().toISOString(),
      materialVariancePct,
      revenue: rev.total,
      revenueCode: rev.matchedCode,
      grossMargin: gm.total,
      grossMarginCode: gm.matchedCode,
      grossMarginPct,
      ebitda: ebitda.total,
      ebitdaCode: ebitda.matchedCode,
      variance: {
        amount: varianceAmount,
        pct: variancePct,
        priorRevenue,
        label: priorRevenue ? `vs prior year` : null,
      },
      trend,
      kpis: {
        revenue: rev.total,
        grossMargin: gm.total,
        grossMarginPct,
        ebitda: ebitda.total,
      },
    };
  }
}
