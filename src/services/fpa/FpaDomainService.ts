// @ts-nocheck
/**
 * Domain tab packs — workforce / revenue / expense / cash.
 * Honest empties when data is thin; never fabricate headcount.
 */
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaFormulaEngine } from "./FpaFormulaEngine";

const CATEGORY_MAP: Record<string, string> = {
  workforce: "WORKFORCE",
  revenue: "REVENUE",
  expense: "EXPENSE",
  cash: "CASH",
};

function iso(d: Date | string | null | undefined) {
  if (!d) return null;
  return new Date(d).toISOString().slice(0, 10);
}

function sumCells(cells: any[]) {
  return cells.reduce((s, c) => s + Number(c.value || 0), 0);
}

function byPeriodMap(cells: any[]) {
  const m: Record<string, number> = {};
  for (const c of cells) {
    const k = iso(c.periodDate)!;
    m[k] = (m[k] || 0) + Number(c.value || 0);
  }
  return m;
}

// Precise headcount-item match. Loose substring matching on "FTE" previously
// also caught cost/dollar drivers like "Average Cost per FTE" (code
// FTE_COST), summing dollar values into headcount counts and producing
// garbage totals (e.g. 14,674 "headcount").
function isHeadcountItem(code: unknown, name: unknown): boolean {
  const c = String(code || "").toUpperCase().trim();
  const n = String(name || "").toUpperCase().trim();
  const exact = new Set(["HEADCOUNT", "HC", "FTE", "FTE_COUNT", "HC_COUNT"]);
  if (exact.has(c) || exact.has(n)) return true;
  return /(^|[_\s])HEADCOUNT([_\s]|$)/.test(c) || /(^|[_\s])HEADCOUNT([_\s]|$)/.test(n);
}

// A line item is a rollup/total (not an independent input) if it has its own
// formula, or is explicitly typed as calculated. Domain-pack totals must sum
// only leaf items — summing a rollup's cells alongside its own constituent
// leaf items' cells double-counts the total (e.g. Revenue KPI reading 2x the
// real total because a "Revenue" rollup line item was summed together with
// the Client Mandates / Average Monthly Fee / etc. items that already sum to it).
function isRollupLineItem(li: any): boolean {
  if (Array.isArray(li.formulas) && li.formulas.length > 0) return true;
  const t = String(li.lineItemType || "").toUpperCase();
  return t === "CALCULATED" || t === "CALC";
}

function parsePeriod(value: any, field: string): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw new FpaError(400, "INVALID_PERIOD_RANGE", `${field} must be a valid date`);
  }
  return d;
}

async function loadScoped(modelId: string, category: string, query: any) {
  const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
  if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");
  const versionId = query.versionId ? String(query.versionId) : null;
  const scenarioId = query.scenarioId ? String(query.scenarioId) : null;
  const entityId = query.entityId ? String(query.entityId) : null;
  const periodFrom = parsePeriod(query.periodFrom, "periodFrom");
  const periodTo = parsePeriod(query.periodTo, "periodTo");
  if (periodFrom && periodTo && periodFrom > periodTo) {
    throw new FpaError(400, "INVALID_PERIOD_RANGE", "periodFrom must be on or before periodTo");
  }
  if (entityId) {
    const entity = await prisma.forecastEntity.findUnique({ where: { id: entityId } });
    if (!entity || !entity.isActive) {
      throw new FpaError(404, "NOT_FOUND", "Forecast entity not found");
    }
  }

  const lineItems = await prisma.planningLineItem.findMany({
    where: { modelId, category },
    orderBy: { sortOrder: "asc" },
    include: { formulas: { select: { id: true }, take: 1 } },
  });
  const liIds = lineItems.map((l) => l.id);
  const cellWhere: any = { modelId, lineItemId: { in: liIds } };
  if (versionId) cellWhere.versionId = versionId;
  if (scenarioId) cellWhere.scenarioId = scenarioId;
  if (entityId) cellWhere.entityId = entityId;
  if (periodFrom || periodTo) {
    cellWhere.periodDate = {
      ...(periodFrom ? { gte: periodFrom } : {}),
      ...(periodTo ? { lte: periodTo } : {}),
    };
  }
  const cells = liIds.length
    ? await prisma.planningCell.findMany({ where: cellWhere, orderBy: { periodDate: "asc" } })
    : [];
  const actualWhere: any = { modelId, lineItemId: { in: liIds } };
  if (entityId) actualWhere.entityId = entityId;
  if (periodFrom || periodTo) {
    actualWhere.periodDate = {
      ...(periodFrom ? { gte: periodFrom } : {}),
      ...(periodTo ? { lte: periodTo } : {}),
    };
  }
  const actuals = await prisma.planningActualsSnapshot.findMany({ where: actualWhere });

  // Real Budget figures come from the model's own approved/locked planning
  // cycle version — not a proxy. Prefer LOCKED (final) over APPROVED
  // (pending lock), most recently updated first.
  const budgetVersionCycle =
    (await prisma.modelPlanningCycle.findFirst({
      where: { sourceModelId: modelId, status: "LOCKED" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, sourceModelVersionId: true },
    })) ||
    (await prisma.modelPlanningCycle.findFirst({
      where: { sourceModelId: modelId, status: "APPROVED" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, sourceModelVersionId: true },
    }));
  const budgetCells =
    budgetVersionCycle && liIds.length
      ? await prisma.planningCell.findMany({
          where: {
            modelId,
            lineItemId: { in: liIds },
            versionId: budgetVersionCycle.sourceModelVersionId,
            ...(scenarioId ? { scenarioId } : {}),
            ...(entityId ? { entityId } : {}),
            ...(periodFrom || periodTo
              ? { periodDate: { ...(periodFrom ? { gte: periodFrom } : {}), ...(periodTo ? { lte: periodTo } : {}) } }
              : {}),
          },
        })
      : [];

  const depts = await prisma.department.findMany({ select: { id: true, name: true } });
  const deptName = Object.fromEntries(depts.map((d) => [d.id, d.name]));
  const linkedEntityIds = (
    await prisma.planningModelEntity.findMany({
      where: { modelId },
      select: { entityId: true },
    })
  ).map((row) => row.entityId);
  const availableEntities = linkedEntityIds.length
    ? await prisma.forecastEntity.findMany({
        where: { id: { in: linkedEntityIds }, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : await prisma.forecastEntity.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
  const allPeriods = await prisma.planningCell.findMany({
    where: {
      modelId,
      lineItemId: { in: liIds },
      ...(versionId ? { versionId } : {}),
      ...(scenarioId ? { scenarioId } : {}),
      ...(entityId ? { entityId } : {}),
    },
    select: { periodDate: true },
    distinct: ["periodDate"],
    orderBy: { periodDate: "asc" },
  });
  return {
    model,
    versionId,
    scenarioId,
    entityId,
    periodFrom,
    periodTo,
    lineItems,
    cells,
    actuals,
    budgetCells,
    budgetCycleStatus: budgetVersionCycle?.status || null,
    deptName,
    availableEntities,
    availablePeriods: allPeriods.map((p) => iso(p.periodDate)),
  };
}

export class FpaDomainService {
  static categoryOf(category: string) {
    const cat = CATEGORY_MAP[String(category || "").toLowerCase()] || String(category || "").toUpperCase();
    if (!["WORKFORCE", "REVENUE", "EXPENSE", "CASH"].includes(cat)) {
      throw new FpaError(400, "VALIDATION", "category must be workforce|revenue|expense|cash");
    }
    return cat;
  }

  static buildPack(cat: string, scoped: any, drivers: any[]) {
    if (cat === "WORKFORCE") return FpaDomainService.workforcePack(scoped, drivers);
    if (cat === "REVENUE") return FpaDomainService.revenuePack(scoped);
    if (cat === "EXPENSE") return FpaDomainService.expensePack(scoped);
    return FpaDomainService.cashPack(scoped);
  }

  static async listByCategory(modelId: string, category: string, query: any = {}) {
    if (!modelId) throw new FpaError(400, "VALIDATION", "modelId required");
    const cat = FpaDomainService.categoryOf(category);

    const drivers =
      cat === "WORKFORCE"
        ? await prisma.planningDriver.findMany({
            where: { modelId, category: { in: ["WORKFORCE", "HC", "HEADCOUNT"] } },
          })
        : await prisma.planningDriver.findMany({ where: { modelId, category: cat } });

    const scoped = await loadScoped(modelId, cat, query);
    const { lineItems, cells, actuals, deptName, versionId, scenarioId } = scoped;

    const pack = await FpaDomainService.buildPack(cat, scoped, drivers);

    // Keep thin legacy keys for older clients
    const lineItemsLegacy = lineItems.map((li) => ({
      ...li,
      cells: cells.filter((c) => c.lineItemId === li.id).slice(0, 24),
    }));

    return {
      modelId,
      category: cat,
      versionId,
      scenarioId,
      scope: {
        modelId,
        versionId,
        scenarioId,
        entityId: scoped.entityId,
        periodFrom: scoped.periodFrom ? iso(scoped.periodFrom) : null,
        periodTo: scoped.periodTo ? iso(scoped.periodTo) : null,
      },
      availableFilters: {
        entities: scoped.availableEntities,
        periods: scoped.availablePeriods,
      },
      ...pack,
      lineItems: lineItemsLegacy,
      drivers,
    };
  }

  static async sensitivity(category: string, body: any, user: any) {
    const modelId = body.modelId ? String(body.modelId) : "";
    const versionId = body.versionId ? String(body.versionId) : "";
    const scenarioId = body.scenarioId ? String(body.scenarioId) : "";
    if (!modelId || !versionId || !scenarioId) {
      throw new FpaError(400, "VALIDATION", "modelId, versionId, and scenarioId are required");
    }
    const cat = FpaDomainService.categoryOf(category);
    const overrides = Array.isArray(body.overrides) ? body.overrides : [];
    if (!overrides.length) {
      throw new FpaError(400, "VALIDATION", "overrides must contain at least one driver");
    }

    const query = {
      versionId,
      scenarioId,
      entityId: body.entityId,
      periodFrom: body.periodFrom,
      periodTo: body.periodTo,
    };
    const scoped = await loadScoped(modelId, cat, query);
    const drivers = await prisma.planningDriver.findMany({
      where: {
        modelId,
        OR: [
          { versionId, scenarioId },
          { versionId: null, scenarioId: null },
          { versionId, scenarioId: null },
        ],
      },
    });
    const driverMap: Record<string, number> = {};
    for (const driver of drivers) {
      driverMap[String(driver.code).toUpperCase()] = Number(driver.value || 0);
    }
    for (const override of overrides) {
      const code = String(override?.driverCode || "").trim().toUpperCase();
      if (!code || !(code in driverMap)) {
        throw new FpaError(400, "UNKNOWN_DRIVER", `Unknown driver: ${code || "(blank)"}`);
      }
      const value = Number(override.value);
      if (!Number.isFinite(value)) {
        throw new FpaError(400, "VALIDATION", `Override value for ${code} must be numeric`);
      }
      driverMap[code] = value;
    }

    const basePack = await FpaDomainService.buildPack(cat, scoped, drivers);
    const allLineItems = await prisma.planningLineItem.findMany({ where: { modelId } });
    const formulas = await prisma.planningFormula.findMany({
      where: { modelId },
      include: { lineItem: { select: { id: true, code: true } } },
    });
    const allCells = await prisma.planningCell.findMany({
      where: {
        modelId,
        versionId,
        scenarioId,
        ...(scoped.entityId ? { entityId: scoped.entityId } : {}),
        ...(scoped.periodFrom || scoped.periodTo
          ? {
              periodDate: {
                ...(scoped.periodFrom ? { gte: scoped.periodFrom } : {}),
                ...(scoped.periodTo ? { lte: scoped.periodTo } : {}),
              },
            }
          : {}),
      },
    });
    const liById = Object.fromEntries(allLineItems.map((li) => [li.id, li]));
    const byPeriod: Record<string, any[]> = {};
    for (const cell of allCells) (byPeriod[iso(cell.periodDate)!] ||= []).push(cell);

    const previewCells = scoped.cells.filter(
      (cell) => !formulas.some((formula) => formula.lineItemId === cell.lineItemId)
    );
    for (const [period, periodCells] of Object.entries(byPeriod)) {
      const lines: Record<string, number> = {};
      for (const cell of periodCells) {
        const code = String(liById[cell.lineItemId]?.code || "").toUpperCase();
        if (code) lines[code] = (lines[code] || 0) + Number(cell.value || 0);
      }
      for (const formula of formulas) {
        const code = String(formula.lineItem?.code || "").toUpperCase();
        if (!code) continue;
        try {
          lines[code] = FpaFormulaEngine.evaluate(formula.expression, {
            lines,
            drivers: driverMap,
          });
        } catch {
          // Keep the persisted base value if this formula cannot be evaluated.
        }
      }
      for (const formula of formulas) {
        const li = liById[formula.lineItemId];
        if (!li || li.category !== cat) continue;
        const code = String(li.code).toUpperCase();
        if (lines[code] == null) continue;
        previewCells.push({
          id: `preview:${formula.lineItemId}:${period}`,
          modelId,
          versionId,
          scenarioId,
          lineItemId: formula.lineItemId,
          periodDate: new Date(period),
          entityId: scoped.entityId,
          departmentId: null,
          value: lines[code],
          sourceType: "SENSITIVITY_PREVIEW",
        });
      }
    }
    const previewScoped = { ...scoped, cells: previewCells };
    const previewPack = await FpaDomainService.buildPack(cat, previewScoped, drivers);

    return {
      scope: {
        modelId,
        versionId,
        scenarioId,
        entityId: scoped.entityId,
        periodFrom: scoped.periodFrom ? iso(scoped.periodFrom) : null,
        periodTo: scoped.periodTo ? iso(scoped.periodTo) : null,
      },
      overrides: overrides.map((o) => ({
        driverCode: String(o.driverCode).toUpperCase(),
        value: Number(o.value),
      })),
      base: basePack,
      preview: previewPack,
      persisted: false,
    };
  }

  static async workforcePack(scoped: any, drivers: any[]) {
    const { cells, actuals, deptName, lineItems } = scoped;
    const hcDrivers = drivers.filter((d) => isHeadcountItem(d.code, d.name));
    const hcByPeriod: Record<string, number> = {};
    for (const d of hcDrivers) {
      const k = iso(d.periodDate) || "total";
      hcByPeriod[k] = (hcByPeriod[k] || 0) + Number(d.value || 0);
    }
    // Also treat WORKFORCE line items whose code/name is precisely a
    // headcount identifier (not a loose substring match — see isHeadcountItem).
    const hcLines = lineItems.filter((l) => isHeadcountItem(l.code, l.name));
    for (const li of hcLines) {
      for (const c of cells.filter((x) => x.lineItemId === li.id)) {
        const k = iso(c.periodDate)!;
        hcByPeriod[k] = (hcByPeriod[k] || 0) + Number(c.value || 0);
      }
    }

    const periods = Object.keys(hcByPeriod).sort();
    const spark = periods.map((p) => hcByPeriod[p]);
    const headcount = spark.length ? spark[spark.length - 1] : 0;
    const budgetHeadcount = spark.length > 1 ? spark[0] : headcount;

    // Salary from drivers or expense-like workforce cells
    const salaryDrivers = drivers.filter((d) => /salary|comp|wage/i.test(`${d.code} ${d.name}`));
    const avgSalary =
      salaryDrivers.length > 0
        ? salaryDrivers.reduce((s, d) => s + Number(d.value || 0), 0) / salaryDrivers.length
        : null;

    const hirePlan = periods.map((period) => {
      const planned = hcByPeriod[period] || 0;
      const act = actuals
        .filter((a) => iso(a.periodDate) === period)
        .reduce((s, a) => s + Number(a.amount || 0), 0);
      return { period, planned, actual: act || null };
    });

    const attritionTrend = periods.map((period, i) => {
      if (i === 0) return { period, pct: null };
      const prev = hcByPeriod[periods[i - 1]] || 0;
      const cur = hcByPeriod[period] || 0;
      const pct = prev > 0 && cur < prev ? Number((((prev - cur) / prev) * 100).toFixed(1)) : 0;
      return { period, pct };
    });

    // Headcount is a point-in-time balance (a department doesn't have 446
    // people just because ~37/month were added together across 12 months) -
    // track per period per department and use the latest period only, same
    // fix already applied to Closing Cash (FPA-003) and Scenario Comparison's
    // Headcount (FPA-008 follow-up). Cost is a flow and stays summed.
    const byDeptPeriod: Record<string, Record<string, { headcount: number; cost: number }>> = {};
    for (const c of cells) {
      if (!c.departmentId) continue;
      const period = iso(c.periodDate)!;
      if (!byDeptPeriod[c.departmentId]) byDeptPeriod[c.departmentId] = {};
      if (!byDeptPeriod[c.departmentId][period]) byDeptPeriod[c.departmentId][period] = { headcount: 0, cost: 0 };
      const v = Number(c.value || 0);
      const li = lineItems.find((l) => l.id === c.lineItemId);
      if (li && isHeadcountItem(li.code, li.name)) {
        byDeptPeriod[c.departmentId][period].headcount += v;
      } else {
        byDeptPeriod[c.departmentId][period].cost += v;
      }
    }
    const departments = Object.entries(byDeptPeriod).map(([departmentId, periodMap]) => {
      const deptPeriods = Object.keys(periodMap).sort();
      const latestPeriod = deptPeriods[deptPeriods.length - 1];
      const latestHeadcount = latestPeriod ? periodMap[latestPeriod].headcount : 0;
      const totalCost = deptPeriods.reduce((s, p) => s + periodMap[p].cost, 0);
      return {
        departmentId,
        departmentName: deptName[departmentId] || null,
        headcount: latestHeadcount || null,
        budgetHeadcount: null,
        hires: null,
        attritionPct: null,
        avgSalary:
          latestHeadcount > 0 && totalCost > 0 ? Number((totalCost / latestHeadcount).toFixed(0)) : avgSalary,
        openRoles: null,
      };
    });

    return {
      kpis: {
        headcount: headcount || null,
        budgetHeadcount: budgetHeadcount || null,
        openRoles: null,
        hiresYtd: null,
        attritionPct: attritionTrend.filter((a) => a.pct != null).slice(-1)[0]?.pct ?? null,
        avgSalary,
        sparklines: { headcount: spark },
      },
      hirePlan,
      attritionTrend: attritionTrend.filter((a) => a.pct != null),
      departments,
    };
  }

  static revenuePack(scoped: any) {
    const { lineItems: allLineItems, cells: allCells, actuals, deptName } = scoped;
    // Exclude rollup/total line items (e.g. a "Revenue" line item that is
    // itself a formula summing the real streams) from the leaf-level totals
    // and the streams table — otherwise the rollup's own cells get summed
    // alongside the streams that already sum to it, doubling the total.
    const rollupIds = new Set(allLineItems.filter(isRollupLineItem).map((l: any) => l.id));
    const lineItems = allLineItems.filter((l: any) => !rollupIds.has(l.id));
    const cells = allCells.filter((c: any) => !rollupIds.has(c.lineItemId));
    const periods = [...new Set(cells.map((c) => iso(c.periodDate)))].filter(Boolean).sort() as string[];
    const forecastByPeriod = byPeriodMap(cells);
    const actualByPeriod: Record<string, number> = {};
    for (const a of actuals) {
      const k = iso(a.periodDate)!;
      actualByPeriod[k] = (actualByPeriod[k] || 0) + Number(a.amount || 0);
    }
    const revenue = sumCells(cells);
    const actualTotal = Object.values(actualByPeriod).reduce((s, v) => s + v, 0);
    const monthly = periods.map((period) => ({
      period,
      actual: actualByPeriod[period] ?? null,
      budget: null,
      forecast: forecastByPeriod[period] || 0,
    }));

    const streams = lineItems.map((li) => {
      const liCells = cells.filter((c) => c.lineItemId === li.id);
      const forecast = sumCells(liCells);
      const actual = actuals
        .filter((a) => a.lineItemId === li.id)
        .reduce((s, a) => s + Number(a.amount || 0), 0);
      return {
        id: li.id,
        name: li.name,
        region: null,
        method: "DRIVER",
        actual: actual || null,
        budget: null,
        forecast,
        yoyPct: null,
        sharePct: revenue > 0 ? Number(((forecast / revenue) * 100).toFixed(1)) : null,
      };
    });

    const waterfall =
      actualTotal > 0
        ? [
            { key: "prior", label: "Actuals base", value: actualTotal },
            { key: "delta", label: "Forecast vs actuals", delta: Number((revenue - actualTotal).toFixed(2)) },
            { key: "result", label: "Current forecast", value: revenue },
          ]
        : revenue > 0
          ? [{ key: "result", label: "Current forecast", value: revenue }]
          : [];

    return {
      kpis: {
        revenue,
        budget: null,
        forecast: revenue,
        yoyPct: actualTotal > 0 ? Number((((revenue - actualTotal) / actualTotal) * 100).toFixed(1)) : null,
      },
      waterfall,
      monthly,
      streams,
    };
  }

  static expensePack(scoped: any) {
    const { lineItems, cells, actuals, budgetCells, deptName } = scoped;
    const periods = [...new Set(cells.map((c) => iso(c.periodDate)))].filter(Boolean).sort() as string[];
    const forecastByPeriod = byPeriodMap(cells);
    const actualByPeriod: Record<string, number> = {};
    for (const a of actuals) {
      const k = iso(a.periodDate)!;
      actualByPeriod[k] = (actualByPeriod[k] || 0) + Number(a.amount || 0);
    }
    const budgetByPeriod = byPeriodMap(budgetCells || []);
    const hasRealBudget = Boolean((budgetCells || []).length);
    const opex = sumCells(cells);
    const actualTotal = Object.values(actualByPeriod).reduce((s, v) => s + v, 0);
    // Budget = the model's own locked/approved planning cycle version, when
    // one exists — not a stand-in. Falls back to the old actuals-or-forecast
    // proxy only when no such cycle has ever been approved for this model.
    const budget = hasRealBudget ? sumCells(budgetCells) : actualTotal || opex;
    const variancePct =
      budget > 0 ? Number((((opex - budget) / budget) * 100).toFixed(1)) : null;

    const byCat: Record<string, number> = {};
    for (const li of lineItems) {
      const amt = sumCells(cells.filter((c) => c.lineItemId === li.id));
      const cat = li.name.split(/\s+/)[0] || "Other";
      byCat[cat] = (byCat[cat] || 0) + amt;
    }
    const byCategory = Object.entries(byCat).map(([category, amount]) => ({
      category,
      amount,
      sharePct: opex > 0 ? Number(((amount / opex) * 100).toFixed(1)) : null,
    }));

    const monthlyBurn = periods.map((period) => ({
      period,
      actual: actualByPeriod[period] ?? null,
      budget: hasRealBudget ? budgetByPeriod[period] ?? null : null,
      forecast: forecastByPeriod[period] || 0,
    }));

    const byDept: Record<string, { forecast: number; actual: number; budget: number }> = {};
    for (const c of cells) {
      if (!c.departmentId) continue;
      if (!byDept[c.departmentId]) byDept[c.departmentId] = { forecast: 0, actual: 0, budget: 0 };
      byDept[c.departmentId].forecast += Number(c.value || 0);
    }
    for (const a of actuals) {
      if (!a.departmentId) continue;
      if (!byDept[a.departmentId]) byDept[a.departmentId] = { forecast: 0, actual: 0, budget: 0 };
      byDept[a.departmentId].actual += Number(a.amount || 0);
    }
    if (hasRealBudget) {
      for (const c of budgetCells) {
        if (!c.departmentId) continue;
        if (!byDept[c.departmentId]) byDept[c.departmentId] = { forecast: 0, actual: 0, budget: 0 };
        byDept[c.departmentId].budget += Number(c.value || 0);
      }
    }
    const departments = Object.entries(byDept).map(([departmentId, v]) => {
      const deptBudget = hasRealBudget ? v.budget : v.actual || budget / Object.keys(byDept).length;
      const status = v.forecast > deptBudget * 1.05 ? "OVER_BUDGET" : "ON_TRACK";
      return {
        departmentId,
        departmentName: deptName[departmentId] || null,
        budget: hasRealBudget ? v.budget || null : v.actual || null,
        actual: v.actual || null,
        runRate: v.forecast || null,
        forecast: v.forecast,
        headcount: null,
        status,
      };
    });
    const alerts = departments
      .filter((d) => d.status === "OVER_BUDGET")
      .map((d) => ({
        departmentId: d.departmentId,
        departmentName: d.departmentName,
        variancePct: null,
        varianceAmount: d.forecast - (d.budget || 0),
        severity: "OVER_BUDGET",
      }));

    const bridge = [
      { key: "budget", label: "Budget / actuals", value: budget },
      { key: "volume", label: "Run-rate change", delta: opex - budget },
      { key: "forecast", label: "Forecast", value: opex },
    ];

    return {
      kpis: { opex, budget, forecast: opex, variancePct },
      alerts,
      byCategory,
      monthlyBurn,
      bridge,
      departments,
    };
  }

  static cashPack(scoped: any) {
    const { lineItems, cells } = scoped;
    const periods = [...new Set(cells.map((c) => iso(c.periodDate)))].filter(Boolean).sort() as string[];
    const rows = lineItems.map((li) => {
      const values: Record<string, number> = {};
      for (const c of cells.filter((x) => x.lineItemId === li.id)) {
        values[iso(c.periodDate)!] = Number(c.value || 0);
      }
      const name = `${li.code} ${li.name}`.toUpperCase();
      let rowType = "TOTAL";
      if (/INFLOW|COLLECT|RECEIPT|REVENUE|OPENING/i.test(name) && !/CLOSING/i.test(name)) {
        rowType = /OPENING/i.test(name) ? "TOTAL" : "INFLOW";
      } else if (/OUTFLOW|PAYROLL|PAYMENT|EXPENSE|OPEX|CAPEX/i.test(name)) {
        rowType = "OUTFLOW";
      } else if (/CLOSING|NET|TOTAL/i.test(name)) {
        rowType = "TOTAL";
      } else if (Number(Object.values(values)[0] || 0) < 0) {
        rowType = "OUTFLOW";
      } else if (Object.keys(values).length) {
        rowType = "INFLOW";
      }
      return { id: li.id, label: li.name, rowType, values };
    });

    const closingRow = rows.find((r) => /closing/i.test(r.label)) || rows[rows.length - 1];
    const lastPeriod = periods[periods.length - 1];
    const closingCash = closingRow && lastPeriod ? Number(closingRow.values[lastPeriod] || 0) : 0;
    const inflows = rows
      .filter((r) => r.rowType === "INFLOW")
      .reduce((s, r) => s + Object.values(r.values).reduce((a, b) => a + b, 0), 0);
    const outflows = rows
      .filter((r) => r.rowType === "OUTFLOW")
      .reduce((s, r) => s + Object.values(r.values).reduce((a, b) => a + Math.abs(b), 0), 0);
    const netCashFlow = inflows - outflows;
    const monthlyBurn = periods.length ? outflows / periods.length : 0;
    const runwayMonths =
      monthlyBurn > 0 ? Number((closingCash / monthlyBurn).toFixed(1)) : null;

    return {
      kpis: { closingCash, netCashFlow, runwayMonths },
      periods,
      rows,
    };
  }
}
