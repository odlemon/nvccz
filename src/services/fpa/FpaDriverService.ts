// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";
import { FpaFormulaEngine } from "./FpaFormulaEngine";

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function yearBounds(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year, 11, 31)),
  };
}

/**
 * Resolve prior-year actual for a driver code (avg of matching cells/drivers).
 * Prefer ACTUAL sourceType / snapshots; fall back to prior-FY cells, then cutoff band.
 */
async function resolvePriorActuals(
  modelId: string,
  codes: string[],
  opts: {
    versionId?: string | null;
    scenarioId?: string | null;
    financialYear?: number | null;
    actualsCutoff?: Date | null;
  }
): Promise<{ byCode: Record<string, number | null>; priorPeriodLabel: string | null }> {
  const uniqueCodes = [...new Set(codes.map((c) => String(c || "").toUpperCase()).filter(Boolean))];
  const byCode: Record<string, number | null> = Object.fromEntries(uniqueCodes.map((c) => [c, null]));
  if (!uniqueCodes.length) return { byCode, priorPeriodLabel: null };

  let financialYear = opts.financialYear != null ? Number(opts.financialYear) : null;
  if (!financialYear && opts.versionId) {
    const sample = await prisma.planningCell.findFirst({
      where: { modelId, versionId: opts.versionId },
      orderBy: { periodDate: "desc" },
      select: { periodDate: true },
    });
    if (sample?.periodDate) financialYear = new Date(sample.periodDate).getUTCFullYear();
  }
  if (!financialYear) financialYear = new Date().getUTCFullYear();
  const priorYear = financialYear - 1;
  const priorPeriodLabel = `FY${priorYear} Actual`;
  const { start: priorStart, end: priorEnd } = yearBounds(priorYear);

  const lineItems = await prisma.planningLineItem.findMany({
    where: { modelId, code: { in: uniqueCodes } },
    select: { id: true, code: true },
  });
  const codeByLineId = Object.fromEntries(lineItems.map((l) => [l.id, String(l.code).toUpperCase()]));
  const lineIds = lineItems.map((l) => l.id);

  // 1) Actuals snapshots for prior FY
  if (lineIds.length) {
    const snaps = await prisma.planningActualsSnapshot.findMany({
      where: {
        modelId,
        lineItemId: { in: lineIds },
        periodDate: { gte: priorStart, lte: priorEnd },
      },
      select: { lineItemId: true, amount: true },
    });
    const buckets: Record<string, number[]> = {};
    for (const s of snaps) {
      const code = codeByLineId[s.lineItemId];
      if (!code) continue;
      (buckets[code] ||= []).push(Number(s.amount || 0));
    }
    for (const code of uniqueCodes) {
      const a = avg(buckets[code] || []);
      if (a != null) byCode[code] = a;
    }
  }

  // 2) Cells marked ACTUAL in prior FY (any version — historical baseline)
  const missingAfterSnaps = uniqueCodes.filter((c) => byCode[c] == null);
  if (missingAfterSnaps.length && lineIds.length) {
    const missLineIds = lineItems.filter((l) => missingAfterSnaps.includes(String(l.code).toUpperCase())).map((l) => l.id);
    const actualCells = await prisma.planningCell.findMany({
      where: {
        modelId,
        lineItemId: { in: missLineIds },
        sourceType: "ACTUAL",
        periodDate: { gte: priorStart, lte: priorEnd },
        ...(opts.scenarioId ? { scenarioId: opts.scenarioId } : {}),
      },
      select: { lineItemId: true, value: true },
    });
    const buckets: Record<string, number[]> = {};
    for (const c of actualCells) {
      const code = codeByLineId[c.lineItemId];
      if (!code) continue;
      (buckets[code] ||= []).push(Number(c.value || 0));
    }
    for (const code of missingAfterSnaps) {
      const a = avg(buckets[code] || []);
      if (a != null) byCode[code] = a;
    }
  }

  // 3) Any prior-FY cells for matching line codes (any version)
  const missingAfterActual = uniqueCodes.filter((c) => byCode[c] == null);
  if (missingAfterActual.length && lineIds.length) {
    const missLineIds = lineItems
      .filter((l) => missingAfterActual.includes(String(l.code).toUpperCase()))
      .map((l) => l.id);
    const priorCells = await prisma.planningCell.findMany({
      where: {
        modelId,
        lineItemId: { in: missLineIds },
        periodDate: { gte: priorStart, lte: priorEnd },
        ...(opts.scenarioId ? { scenarioId: opts.scenarioId } : {}),
      },
      select: { lineItemId: true, value: true },
    });
    const buckets: Record<string, number[]> = {};
    for (const c of priorCells) {
      const code = codeByLineId[c.lineItemId];
      if (!code) continue;
      (buckets[code] ||= []).push(Number(c.value || 0));
    }
    for (const code of missingAfterActual) {
      const a = avg(buckets[code] || []);
      if (a != null) byCode[code] = a;
    }
  }

  // 4) Prior-FY driver rows (same code, any version)
  const missingAfterCells = uniqueCodes.filter((c) => byCode[c] == null);
  if (missingAfterCells.length) {
    const priorDrivers = await prisma.planningDriver.findMany({
      where: {
        modelId,
        code: { in: missingAfterCells },
        periodDate: { gte: priorStart, lte: priorEnd },
        ...(opts.scenarioId ? { scenarioId: opts.scenarioId } : {}),
      },
      select: { code: true, value: true },
    });
    const buckets: Record<string, number[]> = {};
    for (const d of priorDrivers) {
      const code = String(d.code).toUpperCase();
      (buckets[code] ||= []).push(Number(d.value || 0));
    }
    for (const code of missingAfterCells) {
      const a = avg(buckets[code] || []);
      if (a != null) byCode[code] = a;
    }
  }

  // 5) Cutoff band in current FY (periods <= actualsCutoff) as actual baseline
  const missingAfterDrivers = uniqueCodes.filter((c) => byCode[c] == null);
  if (missingAfterDrivers.length && opts.actualsCutoff && lineIds.length) {
    const missLineIds = lineItems
      .filter((l) => missingAfterDrivers.includes(String(l.code).toUpperCase()))
      .map((l) => l.id);
    const cutoffCells = await prisma.planningCell.findMany({
      where: {
        modelId,
        lineItemId: { in: missLineIds },
        periodDate: { lte: opts.actualsCutoff },
        ...(opts.versionId ? { versionId: opts.versionId } : {}),
        ...(opts.scenarioId ? { scenarioId: opts.scenarioId } : {}),
      },
      select: { lineItemId: true, value: true },
    });
    const buckets: Record<string, number[]> = {};
    for (const c of cutoffCells) {
      const code = codeByLineId[c.lineItemId];
      if (!code) continue;
      (buckets[code] ||= []).push(Number(c.value || 0));
    }
    for (const code of missingAfterDrivers) {
      const a = avg(buckets[code] || []);
      if (a != null) byCode[code] = a;
    }
  }

  const anyResolved = uniqueCodes.some((c) => byCode[c] != null);
  return { byCode, priorPeriodLabel: anyResolved ? priorPeriodLabel : null };
}

function serializeDriver(d: any, priorActual: number | null, priorPeriodLabel: string | null) {
  const value = d.value != null ? Number(d.value) : null;
  return {
    ...d,
    value,
    priorActual,
    priorValue: priorActual,
    priorPeriodLabel,
    confidence: d.confidence || null,
    spreadingMethod: d.spreadingMethod || null,
  };
}

const CONFIDENCE = new Set(["HIGH", "MEDIUM", "LOW"]);
const SPREAD_METHODS = new Set([
  "EVEN",
  "SEASONAL",
  "PRIOR_YEAR",
  "PRIOR_YEAR_PATTERN",
  "HISTORICAL_PATTERN",
  "CUSTOM_WEIGHT",
  "MANUAL",
  "WORKING_DAYS",
  "SEASONAL_PROFILE",
]);

async function assertVersionEditableForDrivers(versionId: string | null | undefined) {
  if (!versionId) return;
  const version = await prisma.planningVersion.findUnique({ where: { id: String(versionId) } });
  if (!version) throw new FpaError(404, "NOT_FOUND", "Version not found");
  const st = String(version.status || "").toUpperCase();
  // ARCHIVED is hard-blocked. LOCKED published versions remain editable for planning assumptions
  // (Model Planning worksheet / Assumptions library on an open cycle).
  if (st === "ARCHIVED") {
    throw new FpaError(403, "LOCKED_VERSION", "Cannot change drivers on an archived version");
  }
}

export class FpaDriverService {
  static async list(modelId: string, query: any = {}) {
    const where: any = { modelId };
    if (query.scenarioId) where.scenarioId = String(query.scenarioId);
    if (query.versionId) where.versionId = String(query.versionId);
    if (query.category) where.category = String(query.category);
    const rows = await prisma.planningDriver.findMany({
      where,
      orderBy: [{ code: "asc" }, { periodDate: "asc" }],
    });

    let financialYear: number | null = query.financialYear != null ? Number(query.financialYear) : null;
    let actualsCutoff: Date | null = null;
    if (query.cycleId) {
      const cycle = await prisma.modelPlanningCycle.findUnique({ where: { id: String(query.cycleId) } });
      if (cycle) {
        financialYear = financialYear ?? cycle.financialYear;
        actualsCutoff = cycle.actualsCutoffPeriod || null;
      }
    }

    const { byCode, priorPeriodLabel } = await resolvePriorActuals(
      modelId,
      rows.map((r) => r.code),
      {
        versionId: query.versionId ? String(query.versionId) : null,
        scenarioId: query.scenarioId ? String(query.scenarioId) : null,
        financialYear,
        actualsCutoff,
      }
    );

    return rows.map((r) => {
      const code = String(r.code).toUpperCase();
      const prior = byCode[code] ?? null;
      return serializeDriver(r, prior, prior != null ? priorPeriodLabel : null);
    });
  }

  static async create(input: any, userId: string, ip?: string) {
    if (!input.modelId || !input.code || !input.name) {
      throw new FpaError(400, "VALIDATION", "modelId, code, name required");
    }
    if (!input.scenarioId || !input.versionId) {
      throw new FpaError(400, "VALIDATION", "scenarioId and versionId required");
    }
    await assertVersionEditableForDrivers(input.versionId);

    let confidence = input.confidence != null ? String(input.confidence).toUpperCase() : null;
    if (confidence && !CONFIDENCE.has(confidence)) {
      throw new FpaError(400, "VALIDATION", "confidence must be HIGH|MEDIUM|LOW");
    }
    let spreadingMethod =
      input.spreadingMethod != null ? String(input.spreadingMethod).toUpperCase() : null;
    if (spreadingMethod && !SPREAD_METHODS.has(spreadingMethod)) {
      throw new FpaError(400, "VALIDATION", "Invalid spreadingMethod");
    }

    const driver = await prisma.planningDriver.create({
      data: {
        modelId: input.modelId,
        scenarioId: String(input.scenarioId),
        versionId: String(input.versionId),
        code: String(input.code).toUpperCase(),
        name: String(input.name),
        category: String(input.category || "GENERAL"),
        periodDate: input.periodDate ? new Date(input.periodDate) : null,
        value: input.value ?? 0,
        unit: input.unit || null,
        requiresApproval: !!input.requiresApproval,
        confidence,
        spreadingMethod,
        createdById: userId,
      },
    });
    await FpaAuditService.log("DRIVER_CREATE", userId, { modelId: input.modelId, ip });
    return serializeDriver(driver, null, null);
  }

  static async update(driverId: string, input: any, userId: string, ip?: string) {
    const existing = await prisma.planningDriver.findUnique({ where: { id: driverId } });
    if (!existing) throw new FpaError(404, "NOT_FOUND", "Driver not found");
    await assertVersionEditableForDrivers(existing.versionId);

    const data: any = {};
    if (input.name != null) data.name = String(input.name);
    if (input.value != null) data.value = input.value;
    if (input.unit != null) data.unit = input.unit;
    if (input.category != null) data.category = String(input.category);
    if (input.periodDate != null) data.periodDate = new Date(input.periodDate);
    if (input.requiresApproval != null) data.requiresApproval = !!input.requiresApproval;
    if (input.confidence !== undefined) {
      if (input.confidence == null || input.confidence === "") data.confidence = null;
      else {
        const c = String(input.confidence).toUpperCase();
        if (!CONFIDENCE.has(c)) throw new FpaError(400, "VALIDATION", "confidence must be HIGH|MEDIUM|LOW");
        data.confidence = c;
      }
    }
    if (input.spreadingMethod !== undefined) {
      if (input.spreadingMethod == null || input.spreadingMethod === "") data.spreadingMethod = null;
      else {
        const m = String(input.spreadingMethod).toUpperCase();
        if (!SPREAD_METHODS.has(m)) throw new FpaError(400, "VALIDATION", "Invalid spreadingMethod");
        data.spreadingMethod = m;
      }
    }

    const updated = await prisma.planningDriver.update({ where: { id: driverId }, data });
    const updatedCells: any[] = [];

    if (input.value != null) {
      const formulas = await prisma.planningFormula.findMany({
        where: { modelId: existing.modelId },
        include: { lineItem: true },
      });
      const dependent = formulas.filter((f) =>
        FpaFormulaEngine.extractDriverCodes(f.expression).includes(existing.code)
      );
      for (const f of dependent) {
        const cells = await prisma.planningCell.findMany({
          where: {
            modelId: existing.modelId,
            lineItemId: f.lineItemId,
            ...(existing.versionId ? { versionId: existing.versionId } : {}),
            ...(existing.scenarioId ? { scenarioId: existing.scenarioId } : {}),
          },
        });
        const drivers = await prisma.planningDriver.findMany({
          where: { modelId: existing.modelId, code: { in: FpaFormulaEngine.extractDriverCodes(f.expression) } },
        });
        const driverMap: Record<string, number> = {};
        for (const d of drivers) driverMap[d.code] = Number(d.value);
        driverMap[existing.code] = Number(updated.value);

        for (const cell of cells) {
          try {
            const lineCodes = FpaFormulaEngine.extractLineCodes(f.expression);
            const lineVals: Record<string, number> = {};
            if (lineCodes.length) {
              const siblings = await prisma.planningCell.findMany({
                where: {
                  modelId: cell.modelId,
                  versionId: cell.versionId,
                  scenarioId: cell.scenarioId,
                  periodDate: cell.periodDate,
                  lineItem: { code: { in: lineCodes } },
                },
                include: { lineItem: true },
              });
              for (const s of siblings) lineVals[s.lineItem.code] = Number(s.value || 0);
            }
            const val = FpaFormulaEngine.evaluate(f.expression, { lines: lineVals, drivers: driverMap });
            const cellUpdated = await prisma.planningCell.update({
              where: { id: cell.id },
              data: {
                value: val,
                formulaId: f.id,
                valueType: "FORMULA",
                lastUpdatedById: userId,
                lastUpdatedAt: new Date(),
              },
            });
            updatedCells.push({
              id: cellUpdated.id,
              lineItemId: cellUpdated.lineItemId,
              periodDate: cellUpdated.periodDate,
              value: Number(cellUpdated.value),
              cellStatus: "CALCULATED",
              valueType: cellUpdated.valueType,
              sourceType: cellUpdated.sourceType,
            });
          } catch {
            // skip cells that cannot evaluate simply
          }
        }
      }
    }

    await FpaAuditService.log("DRIVER_UPDATE", userId, {
      modelId: existing.modelId,
      oldValue: String(existing.value),
      newValue: String(updated.value),
      ip,
    });

    const { byCode, priorPeriodLabel } = await resolvePriorActuals(existing.modelId, [existing.code], {
      versionId: existing.versionId,
      scenarioId: existing.scenarioId,
      financialYear: null,
      actualsCutoff: null,
    });
    const code = String(existing.code).toUpperCase();
    const prior = byCode[code] ?? null;

    return {
      ...serializeDriver(updated, prior, prior != null ? priorPeriodLabel : null),
      updatedCells,
    };
  }

  static async remove(driverId: string, userId: string, ip?: string) {
    const existing = await prisma.planningDriver.findUnique({ where: { id: driverId } });
    if (!existing) throw new FpaError(404, "NOT_FOUND", "Driver not found");
    await assertVersionEditableForDrivers(existing.versionId);

    const formulas = await prisma.planningFormula.findMany({
      where: { modelId: existing.modelId },
      select: { id: true, expression: true },
    });
    const referenced = formulas.some((f) =>
      FpaFormulaEngine.extractDriverCodes(f.expression).includes(existing.code)
    );
    if (referenced) {
      throw new FpaError(409, "DRIVER_IN_USE", "Driver is referenced by formulas and cannot be deleted");
    }
    const cellRefs = await prisma.planningCell.count({ where: { driverId } });
    if (cellRefs > 0) {
      throw new FpaError(409, "DRIVER_IN_USE", "Driver is linked to planning cells");
    }

    await prisma.planningDriver.delete({ where: { id: driverId } });
    await FpaAuditService.log("DRIVER_DELETE", userId, {
      modelId: existing.modelId,
      entityId: driverId,
      reason: existing.code,
      ip,
    });
    return { id: driverId, deleted: true };
  }
}
