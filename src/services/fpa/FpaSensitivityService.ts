// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaFormulaEngine } from "./FpaFormulaEngine";
import { pickCanonicalCells, periodKey } from "./FpaCellCanonical";

function topoOrder(formulas: Array<{ lineItemId: string; code: string; expression: string }>): string[] {
  const deps: Record<string, string[]> = {};
  const codes = new Set(formulas.map((f) => f.code));
  for (const f of formulas) {
    deps[f.code] = FpaFormulaEngine.extractLineCodes(f.expression).filter((c) => codes.has(c) && c !== f.code);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];

  function dfs(node: string) {
    if (visited.has(node)) return;
    if (visiting.has(node)) return;
    visiting.add(node);
    for (const d of deps[node] || []) dfs(d);
    visiting.delete(node);
    visited.add(node);
    order.push(node);
  }

  for (const f of formulas) dfs(f.code);
  return order;
}

function inRange(period: Date, from?: Date | null, to?: Date | null) {
  const t = new Date(period).getTime();
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
}

/** Collect all formula dependents (transitive) of a driver code. */
function dependentCodesOf(
  driverCode: string,
  formulaRows: Array<{ code: string; expression: string }>
): Set<string> {
  const adj: Record<string, string[]> = {};
  for (const f of formulaRows) {
    const deps = FpaFormulaEngine.extractLineCodes(f.expression);
    for (const d of deps) {
      (adj[d] ||= []).push(f.code);
    }
  }
  const out = new Set<string>();
  const stack = [...(adj[driverCode] || [])];
  while (stack.length) {
    const n = stack.pop();
    if (!n || out.has(n)) continue;
    out.add(n);
    for (const nxt of adj[n] || []) stack.push(nxt);
  }
  return out;
}

export class FpaSensitivityService {
  static async run(modelId: string, body: any, user: any) {
    const versionId = body.versionId ? String(body.versionId) : null;
    const scenarioId = body.scenarioId ? String(body.scenarioId) : null;
    const driverLineItemId = body.driverLineItemId ? String(body.driverLineItemId) : null;
    if (!versionId || !scenarioId || !driverLineItemId) {
      throw new FpaError(400, "VALIDATION", "versionId, scenarioId, and driverLineItemId are required");
    }

    const shock = body.shock || {};
    const shockType = String(shock.type || "PERCENT").toUpperCase();
    const shockValue = Number(shock.value ?? 5);
    if (shockType !== "PERCENT") {
      throw new FpaError(400, "VALIDATION", "Only shock.type=PERCENT is supported");
    }

    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");

    const lineItems = await prisma.planningLineItem.findMany({
      where: { modelId },
      orderBy: { sortOrder: "asc" },
    });
    const driverLi = lineItems.find((l) => l.id === driverLineItemId);
    if (!driverLi) throw new FpaError(404, "NOT_FOUND", "Driver line item not found");

    let targetIds: string[] = Array.isArray(body.targetLineItemIds)
      ? body.targetLineItemIds.map(String)
      : [];

    const periodFrom = body.periodRange?.from ? new Date(body.periodRange.from) : null;
    const periodTo = body.periodRange?.to ? new Date(body.periodRange.to) : null;

    const formulas = await prisma.planningFormula.findMany({
      where: { modelId },
      include: { lineItem: { select: { id: true, code: true, name: true } } },
    });
    const formulaRows = formulas
      .filter((f) => f.lineItem?.code)
      .map((f) => ({
        lineItemId: f.lineItemId,
        code: String(f.lineItem.code).toUpperCase(),
        expression: f.expression,
        name: f.lineItem.name,
      }));
    const formulaByCode = Object.fromEntries(formulaRows.map((f) => [f.code, f]));
    const evalOrder = topoOrder(formulaRows);
    const liByCode = Object.fromEntries(
      lineItems.map((l) => [String(l.code || "").toUpperCase(), l])
    );

    if (!targetIds.length) {
      const driverCode = String(driverLi.code || "").toUpperCase();
      const depCodes = dependentCodesOf(driverCode, formulaRows);
      const dependentIds = [...depCodes].map((c) => liByCode[c]?.id).filter(Boolean);
      const kpiIds = lineItems
        .filter((l) => {
          const code = String(l.code || "").toUpperCase();
          const name = String(l.name || "").toUpperCase();
          return (
            code === "EBITDA" ||
            code.includes("CASH") ||
            code.includes("GROSS") ||
            code.includes("REVENUE") ||
            name.includes("CASH") ||
            name.includes("EBITDA") ||
            name.includes("GROSS")
          );
        })
        .map((l) => l.id);
      targetIds = [...new Set([...kpiIds, ...dependentIds])].filter((id) => id !== driverLineItemId);
    }

    const rawCells = await prisma.planningCell.findMany({
      where: { modelId, versionId, scenarioId },
      include: { lineItem: { select: { id: true, code: true, name: true } } },
      orderBy: { periodDate: "asc" },
    });
    const cells = pickCanonicalCells(rawCells);

    const periodsSet = new Set<string>();
    const byPeriod: Record<string, typeof cells> = {};
    for (const c of cells) {
      if (!inRange(c.periodDate, periodFrom, periodTo)) continue;
      const key = periodKey(c.periodDate);
      periodsSet.add(key);
      (byPeriod[key] ||= []).push(c);
    }
    const periods = [...periodsSet].sort();

    const driversRows = await prisma.planningDriver.findMany({ where: { modelId }, take: 200 });
    const drivers: Record<string, number> = {};
    for (const d of driversRows) drivers[String(d.code).toUpperCase()] = Number(d.value || 0);

    const baseByLi: Record<string, number[]> = {};
    const shockedByLi: Record<string, number[]> = {};
    for (const li of lineItems) {
      baseByLi[li.id] = [];
      shockedByLi[li.id] = [];
    }

    function evaluateCase(periodCells: typeof cells, shockDriver: boolean): Record<string, number> {
      const lines: Record<string, number> = {};
      for (const c of periodCells) {
        const code = c.lineItem?.code ? String(c.lineItem.code).toUpperCase() : null;
        if (!code) continue;
        // Canonical cells already prefer non-null; still never overwrite valued with null
        if (lines[code] != null && c.value == null) continue;
        let val = c.value != null ? Number(c.value) : 0;
        if (shockDriver && c.lineItemId === driverLineItemId) {
          val = val * (1 + shockValue / 100);
        }
        lines[code] = val;
      }
      for (const code of evalOrder) {
        const f = formulaByCode[code];
        if (!f) continue;
        try {
          lines[code] = FpaFormulaEngine.evaluate(f.expression, { lines, drivers });
        } catch {
          /* keep input/prior */
        }
      }
      const byId: Record<string, number> = {};
      for (const li of lineItems) {
        const code = String(li.code || "").toUpperCase();
        byId[li.id] = lines[code] != null ? Number(lines[code]) : 0;
      }
      return byId;
    }

    for (const p of periods) {
      const slice = byPeriod[p] || [];
      const base = evaluateCase(slice, false);
      const shocked = evaluateCase(slice, true);
      for (const li of lineItems) {
        baseByLi[li.id].push(base[li.id] ?? 0);
        shockedByLi[li.id].push(shocked[li.id] ?? 0);
      }
    }

    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const allImpacts = targetIds
      .map((id) => {
        const li = lineItems.find((l) => l.id === id);
        if (!li) return null;
        const baseTotal = sum(baseByLi[id] || []);
        const shockedTotal = sum(shockedByLi[id] || []);
        const deltaTotal = shockedTotal - baseTotal;
        const deltaPct = baseTotal !== 0 ? (deltaTotal / Math.abs(baseTotal)) * 100 : deltaTotal === 0 ? 0 : null;
        return {
          lineItemId: id,
          name: li.name,
          code: li.code,
          baseTotal,
          shockedTotal,
          deltaTotal,
          deltaPct: deltaPct != null ? Math.round(deltaPct * 100) / 100 : null,
        };
      })
      .filter(Boolean);

    // Do not return fake zero-delta "success" impacts — empty + message instead
    const impacts = allImpacts.filter((i) => Math.abs(Number(i.deltaTotal || 0)) > 1e-9);
    const driverHasValues = cells.some((c) => c.lineItemId === driverLineItemId && c.value != null);
    const shockLabel = `${shockValue >= 0 ? "+" : ""}${shockValue}%`;

    const seriesTargetId = impacts[0]?.lineItemId || driverLineItemId;
    const seriesTargetName =
      impacts[0]?.name || driverLi.name;
    const series = {
      periods,
      baseCase: baseByLi[seriesTargetId] || [],
      shocked: shockedByLi[seriesTargetId] || [],
      unit: "USD",
      lineItemId: seriesTargetId,
      lineItemName: seriesTargetName,
    };

    const result: any = {
      driver: {
        lineItemId: driverLi.id,
        code: driverLi.code,
        name: driverLi.name,
        shock: { type: "PERCENT", value: shockValue },
        shockLabel,
      },
      impacts,
      series,
      versionId,
      scenarioId,
    };

    if (!impacts.length) {
      result.message = !driverHasValues
        ? "No calculated dependents with values for this driver. Seed cells and formulas first."
        : !formulaRows.length
          ? "No formulas on this model. Seed formulas (e.g. GROSS_REVENUE) before sensitivity."
          : "Shock did not move any calculated dependents. Check formulas reference this driver and periods have values.";
      result.series = { periods: [], baseCase: [], shocked: [], unit: "USD" };
    }

    return result;
  }
}
