// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";
import { FpaFormulaEngine } from "./FpaFormulaEngine";
import { pickCanonicalCells, mergeLineValuesByCode, periodKey } from "./FpaCellCanonical";

function userDisplayName(u: any): string | null {
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || null;
}

function periodRoleFor(periodDate: Date, actualCutoff: Date, sourceType?: string | null): "ACTUAL" | "FORECAST" {
  if (String(sourceType || "").toUpperCase() === "ACTUAL") return "ACTUAL";
  const p = new Date(periodDate);
  p.setHours(0, 0, 0, 0);
  const cut = new Date(actualCutoff);
  cut.setHours(0, 0, 0, 0);
  return p <= cut ? "ACTUAL" : "FORECAST";
}

function monthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function cellStatusOf(c: any): string {
  if (c.isLocked) return "LOCKED";
  const src = String(c.sourceType || "").toUpperCase();
  const vt = String(c.valueType || "").toUpperCase();
  if (src === "ACTUAL") return "ACTUAL";
  if (src === "IMPORT" || src === "IMPORTED") return "IMPORTED";
  if (src === "OVERRIDE") return "OVERRIDE";
  if (src === "ERROR" || vt === "ERROR") return "ERROR";
  if (src === "PENDING" || vt === "PENDING_CALCULATION") return "PENDING_CALCULATION";
  if (c.formulaId || vt === "CALCULATED" || vt === "FORMULA" || src === "FORMULA" || src === "GROWTH") {
    return "CALCULATED";
  }
  return "INPUT";
}

function isEditableStatus(status: string): boolean {
  return status === "INPUT" || status === "OVERRIDE";
}

function summarizeValues(values: number[], method: string): number {
  if (!values.length) return 0;
  const m = String(method || "SUM").toUpperCase();
  if (m === "AVG" || m === "AVERAGE" || m === "MEAN") {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  if (m === "LAST") return values[values.length - 1];
  return values.reduce((a, b) => a + b, 0);
}

function isCalculatedLineItem(li: any): boolean {
  if (!li) return false;
  const t = String(li.lineItemType || "").toUpperCase();
  if (["CALCULATED", "CALC", "FX"].includes(t)) return true;
  if (li.isEditable === false && t !== "INPUT" && t !== "DRIVER") return true;
  return false;
}

function quarterKey(d: Date): { key: string; label: string; start: string } {
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(y, startMonth, 1)).toISOString().slice(0, 10);
  return { key: `${y}-Q${q}`, label: `Q${q} ${y}`, start };
}

function yearKey(d: Date): { key: string; label: string; start: string } {
  const y = d.getUTCFullYear();
  const start = `${y}-01-01`;
  return { key: `${y}`, label: String(y), start };
}

function serializeCell(c: any) {
  return {
    ...c,
    recordVersion: c.recordVersion != null ? Number(c.recordVersion) : 1,
    cellStatus: cellStatusOf(c),
    value: c.value != null ? Number(c.value) : null,
  };
}

export class FpaGridService {
  static async assertEditableVersion(versionId: string, userId: string, user: any, ip?: string) {
    const version = await prisma.planningVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new FpaError(404, "NOT_FOUND", "Version not found");
    try {
      FpaAccessService.assertCanEditVersion(user, version);
    } catch (e: any) {
      if (e?.statusCode === 403) {
        await FpaAuditService.log("CELL_EDIT_BLOCKED_LOCKED", userId, {
          modelId: version.modelId,
          versionId,
          reason: e.message,
          ip,
        });
      }
      throw e;
    }
    return version;
  }

  static async resolveActualCutoff(modelId: string): Promise<Date> {
    const lastActual = await prisma.planningActualsSnapshot.findFirst({
      where: { modelId },
      orderBy: { periodDate: "desc" },
      select: { periodDate: true },
    });
    if (lastActual?.periodDate) return monthStart(new Date(lastActual.periodDate));
    // Default: end of prior calendar month
    const now = new Date();
    return monthStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  }

  static async getGrid(modelId: string, opts: any = {}, user: any = null) {
    const page = Math.max(1, Number(opts.page || 1));
    const pageSize = Math.min(500, Math.max(1, Number(opts.pageSize || opts.page_size || 100)));
    const grain = String(opts.grain || "monthly").toLowerCase();
    const moduleId = opts.moduleId ? String(opts.moduleId) : null;

    if (moduleId) {
      const mod = await prisma.planningModule.findFirst({ where: { id: moduleId, modelId } });
      if (!mod) throw new FpaError(404, "NOT_FOUND", "Module not found for this model");
    }

    const where: any = { modelId };
    if (opts.versionId) where.versionId = String(opts.versionId);
    if (opts.scenarioId) where.scenarioId = String(opts.scenarioId);
    if (opts.lineItemId) where.lineItemId = String(opts.lineItemId);

    let assignedDepartmentIds: string[] | null = null;
    let cycleMeta: any = null;
    if (opts.cycleId && user) {
      cycleMeta = await prisma.planningBudgetCycle.findUnique({ where: { id: String(opts.cycleId) } });
      if (cycleMeta) {
        if (!opts.versionId) where.versionId = cycleMeta.versionId;
        if (!opts.scenarioId && cycleMeta.scenarioId) where.scenarioId = cycleMeta.scenarioId;
      }
      assignedDepartmentIds = await FpaAccessService.resolveCycleDepartmentIds(user, opts.cycleId);
      if (assignedDepartmentIds && assignedDepartmentIds.length === 0) {
        throw new FpaError(403, "FORBIDDEN", "You are not assigned to this budget cycle");
      }
      if (assignedDepartmentIds?.length) {
        where.OR = [{ departmentId: { in: assignedDepartmentIds } }, { departmentId: null }];
      }
    }
    if (opts.departmentId) where.departmentId = String(opts.departmentId);

    const lineItemWhere: any = { modelId };
    if (moduleId) lineItemWhere.moduleId = moduleId;
    const lineItems = await prisma.planningLineItem.findMany({
      where: lineItemWhere,
      orderBy: { sortOrder: "asc" },
    });
    const lineItemIds = lineItems.map((l) => l.id);
    if (moduleId) {
      where.lineItemId = lineItemIds.length ? { in: lineItemIds } : { in: ["__none__"] };
    }

    let actualCutoff = await FpaGridService.resolveActualCutoff(modelId);
    if (cycleMeta?.actualsCutoffDate) actualCutoff = monthStart(new Date(cycleMeta.actualsCutoffDate));

    const [model, total, cells, formulas, allCellsForTotals] = await Promise.all([
      prisma.planningModel.findUnique({
        where: { id: modelId },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true, email: true, backgroundImage: true } },
        },
      }),
      prisma.planningCell.count({ where }),
      prisma.planningCell.findMany({
        where,
        include: {
          lineItem: {
            select: {
              id: true,
              code: true,
              name: true,
              lineItemType: true,
              category: true,
              isEditable: true,
              summaryMethod: true,
              moduleId: true,
            },
          },
        },
        orderBy: [{ lineItem: { sortOrder: "asc" } }, { periodDate: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.planningFormula.findMany({
        where: {
          modelId,
          ...(lineItemIds.length ? { lineItemId: { in: lineItemIds } } : { lineItemId: { in: ["__none__"] } }),
        },
        select: { id: true, lineItemId: true, expression: true, isValid: true },
      }),
      prisma.planningCell.findMany({
        where,
        select: { lineItemId: true, periodDate: true, value: true },
        orderBy: { periodDate: "asc" },
      }),
    ]);
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");

    const formulasByLi: Record<string, any[]> = {};
    for (const f of formulas) {
      (formulasByLi[f.lineItemId] ||= []).push({
        id: f.id,
        expression: f.expression,
        isValid: f.isValid,
      });
    }

    const lineItemsOut = lineItems.map((li) => ({
      ...li,
      summaryMethod: li.summaryMethod || "SUM",
      formulas: formulasByLi[li.id] || [],
    }));

    const methodByLi = Object.fromEntries(
      lineItems.map((li) => [li.id, String(li.summaryMethod || "SUM").toUpperCase()])
    );

    const fyTotals: Record<string, number> = {};
    const monthlyByLi: Record<string, Array<{ period: string; value: number }>> = {};
    const canonicalTotals = pickCanonicalCells(allCellsForTotals);
    for (const c of canonicalTotals) {
      const key = periodKey(c.periodDate);
      const val = c.value != null ? Number(c.value) : null;
      if (val == null) continue;
      (monthlyByLi[c.lineItemId] ||= []).push({ period: key, value: val });
    }
    for (const li of lineItems) {
      const vals = (monthlyByLi[li.id] || [])
        .sort((a, b) => a.period.localeCompare(b.period))
        .map((x) => x.value);
      fyTotals[li.id] = summarizeValues(vals, methodByLi[li.id]);
    }

    const canonicalPage = pickCanonicalCells(cells);
    const enrichedCells = canonicalPage.map((c) => {
      const cellStatus = cellStatusOf(c);
      const periodRole = periodRoleFor(c.periodDate, actualCutoff, c.sourceType);
      return {
        ...c,
        recordVersion: c.recordVersion != null ? Number(c.recordVersion) : 1,
        periodRole,
        cellStatus,
        isEditable: isEditableStatus(cellStatus) && c.isEditable && !c.isLocked,
        value: c.value != null ? Number(c.value) : null,
      };
    });

    const periodMap = new Map<string, { periodDate: string; periodRole: "ACTUAL" | "FORECAST"; readOnly?: boolean; label?: string }>();
    for (const c of enrichedCells) {
      const key = new Date(c.periodDate).toISOString().slice(0, 10);
      if (!periodMap.has(key)) {
        periodMap.set(key, { periodDate: key, periodRole: c.periodRole });
      }
    }
    if (model.startPeriod && model.endPeriod) {
      let cursor = monthStart(new Date(model.startPeriod));
      const end = monthStart(new Date(model.endPeriod));
      while (cursor <= end) {
        const key = cursor.toISOString().slice(0, 10);
        if (!periodMap.has(key)) {
          periodMap.set(key, {
            periodDate: key,
            periodRole: periodRoleFor(cursor, actualCutoff, null),
          });
        }
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      }
    }
    let periods = [...periodMap.values()].sort((a, b) => a.periodDate.localeCompare(b.periodDate));
    let cellsOut = enrichedCells;

    if (grain === "quarterly" || grain === "annual") {
      const bucketFn = grain === "quarterly" ? quarterKey : yearKey;
      const aggPeriods = new Map<string, any>();
      const cellBuckets: Record<string, Record<string, number[]>> = {};
      const periodRoleBuckets: Record<string, "ACTUAL" | "FORECAST"> = {};

      for (const p of periods) {
        const d = new Date(p.periodDate);
        const b = bucketFn(d);
        if (!aggPeriods.has(b.key)) {
          aggPeriods.set(b.key, {
            periodDate: b.start,
            periodKey: b.key,
            label: b.label,
            periodRole: p.periodRole,
            readOnly: true,
          });
        }
        if (p.periodRole === "FORECAST") periodRoleBuckets[b.key] = "FORECAST";
        else if (!periodRoleBuckets[b.key]) periodRoleBuckets[b.key] = p.periodRole;
      }
      for (const [k, role] of Object.entries(periodRoleBuckets)) {
        const row = aggPeriods.get(k);
        if (row) row.periodRole = role;
      }

      for (const c of allCellsForTotals) {
        const d = new Date(c.periodDate);
        const b = bucketFn(d);
        const val = c.value != null ? Number(c.value) : null;
        if (val == null) continue;
        ((cellBuckets[c.lineItemId] ||= {})[b.key] ||= []).push(val);
      }

      cellsOut = [];
      for (const li of lineItems) {
        const buckets = cellBuckets[li.id] || {};
        for (const [bKey, vals] of Object.entries(buckets)) {
          const meta = aggPeriods.get(bKey);
          if (!meta) continue;
          cellsOut.push({
            id: `agg:${li.id}:${bKey}`,
            modelId,
            lineItemId: li.id,
            periodDate: meta.periodDate,
            periodKey: bKey,
            value: summarizeValues(vals, methodByLi[li.id]),
            cellStatus: "CALCULATED",
            isEditable: false,
            periodRole: meta.periodRole,
            readOnly: true,
            lineItem: {
              id: li.id,
              code: li.code,
              name: li.name,
              lineItemType: li.lineItemType,
              category: li.category,
              isEditable: li.isEditable,
              summaryMethod: li.summaryMethod,
              moduleId: li.moduleId,
            },
          });
        }
      }
      periods = [...aggPeriods.values()].sort((a, b) => a.periodDate.localeCompare(b.periodDate));
    }

    return {
      modelId,
      moduleId,
      grain,
      versionId: opts.versionId || cycleMeta?.versionId || null,
      scenarioId: opts.scenarioId || cycleMeta?.scenarioId || null,
      cycleId: opts.cycleId || null,
      assignedDepartmentIds,
      page,
      pageSize,
      total: grain === "monthly" ? total : cellsOut.length,
      actualCutoff: actualCutoff.toISOString().slice(0, 10),
      ownerName: userDisplayName(model.owner),
      ownerAvatarUrl: model.owner?.backgroundImage || null,
      periods,
      lineItems: lineItemsOut,
      fyTotals,
      cells: cellsOut,
    };
  }

  static async updateCell(input: any, user: any, ip?: string) {
    const userId = user?.id;
    const modelId = input.modelId ? String(input.modelId) : null;
    let cell = input.cellId || input.id
      ? await prisma.planningCell.findUnique({ where: { id: input.cellId || input.id } })
      : null;
    if (!cell && input.lineItemId && input.periodDate && input.versionId && input.scenarioId) {
      const candidates = await prisma.planningCell.findMany({
        where: {
          versionId: String(input.versionId),
          scenarioId: String(input.scenarioId),
          lineItemId: String(input.lineItemId),
          periodDate: new Date(input.periodDate),
          ...(modelId ? { modelId } : {}),
          ...(input.departmentId ? { departmentId: String(input.departmentId) } : {}),
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 20,
      });
      cell = pickCanonicalCells(candidates)[0] || null;
    }

    // Upsert for empty DRAFT versions: create cell at coordinates then update
    if (!cell && input.lineItemId && input.periodDate && input.versionId && input.scenarioId) {
      const resolvedModelId =
        modelId ||
        (
          await prisma.planningVersion.findUnique({
            where: { id: String(input.versionId) },
            select: { modelId: true },
          })
        )?.modelId;
      if (!resolvedModelId) throw new FpaError(404, "NOT_FOUND", "Version / model not found for cell upsert");
      await FpaGridService.assertEditableVersion(String(input.versionId), userId, user, ip);
      const lineItem = await prisma.planningLineItem.findFirst({
        where: { id: String(input.lineItemId), modelId: resolvedModelId },
      });
      if (!lineItem) throw new FpaError(404, "NOT_FOUND", "Line item not found");
      if (isCalculatedLineItem(lineItem) || lineItem.isEditable === false) {
        throw new FpaError(409, "CELL_NOT_EDITABLE", "Calculated or non-editable line items cannot be edited");
      }
      cell = await prisma.planningCell.create({
        data: {
          modelId: resolvedModelId,
          scenarioId: String(input.scenarioId),
          versionId: String(input.versionId),
          lineItemId: String(input.lineItemId),
          periodDate: new Date(input.periodDate),
          departmentId: input.departmentId ? String(input.departmentId) : null,
          currencyCode: input.currencyCode || "USD",
          value: null,
          valueType: "INPUT",
          sourceType: "MANUAL",
          isEditable: lineItem.isEditable !== false,
          isLocked: false,
          recordVersion: BigInt(1),
        },
      });
    }

    if (!cell) throw new FpaError(404, "NOT_FOUND", "Cell not found");
    const lineItemForEdit = await prisma.planningLineItem.findUnique({ where: { id: cell.lineItemId } });
    if (isCalculatedLineItem(lineItemForEdit) || lineItemForEdit?.isEditable === false) {
      await FpaAuditService.log("CELL_EDIT_BLOCKED", userId, {
        modelId: cell.modelId,
        versionId: cell.versionId,
        cellId: cell.id,
        lineItemId: cell.lineItemId,
        moduleId: lineItemForEdit?.moduleId || null,
        entityType: "CELL",
        reason: "Calculated or non-editable line item",
        ip,
      });
      throw new FpaError(409, "CELL_NOT_EDITABLE", "Calculated or non-editable line items cannot be edited");
    }
    const version = await FpaGridService.assertEditableVersion(cell.versionId, userId, user, ip);
    const status = cellStatusOf(cell);
    if (!isEditableStatus(status) || cell.isLocked || !cell.isEditable) {
      await FpaAuditService.log("CELL_EDIT_BLOCKED", userId, {
        modelId: cell.modelId,
        versionId: cell.versionId,
        cellId: cell.id,
        lineItemId: cell.lineItemId,
        moduleId: lineItemForEdit?.moduleId || null,
        entityType: "CELL",
        reason: `Cell status ${status} is not editable`,
        ip,
      });
      throw new FpaError(409, "CELL_NOT_EDITABLE", `Users may edit INPUT/OVERRIDE cells only (got ${status})`);
    }

    let assignedDepartmentIds: string[] | null = null;
    if (input.cycleId) {
      assignedDepartmentIds = await FpaAccessService.resolveCycleDepartmentIds(user, input.cycleId);
      if (assignedDepartmentIds && assignedDepartmentIds.length === 0) {
        throw new FpaError(403, "FORBIDDEN", "You are not assigned to this budget cycle");
      }
    }
    FpaAccessService.assertCanEditVersion(user, version, {
      departmentId: cell.departmentId || input.departmentId || null,
      assignedDepartmentIds: assignedDepartmentIds || undefined,
    });

    const currentVersion = cell.recordVersion != null ? Number(cell.recordVersion) : 1;
    if (input.recordVersion != null && Number(input.recordVersion) !== currentVersion) {
      const changer = cell.lastUpdatedById
        ? await prisma.user.findUnique({
            where: { id: cell.lastUpdatedById },
            select: { firstName: true, lastName: true, email: true },
          })
        : null;
      throw new FpaError(409, "CONFLICT", "This value changed after you opened the worksheet.", [
        {
          code: "CONFLICT",
          currentValue: cell.value != null ? Number(cell.value) : null,
          recordVersion: currentVersion,
          changedBy: userDisplayName(changer),
          changedAt: cell.lastUpdatedAt,
        },
      ]);
    }

    const oldValue = cell.value;
    const newValue = input.value;
    const updated = await prisma.planningCell.update({
      where: { id: cell.id },
      data: {
        value: newValue,
        valueType: input.valueType || "MANUAL",
        sourceType: input.sourceType || (status === "OVERRIDE" ? "OVERRIDE" : "INPUT"),
        departmentId: cell.departmentId || input.departmentId || undefined,
        lastUpdatedById: userId,
        lastUpdatedAt: new Date(),
        recordVersion: BigInt(currentVersion + 1),
      },
    });
    await FpaAuditService.log("CELL_UPDATE", userId, {
      modelId: cell.modelId,
      versionId: cell.versionId,
      scenarioId: cell.scenarioId,
      cellId: cell.id,
      lineItemId: cell.lineItemId,
      moduleId: lineItemForEdit?.moduleId || null,
      entityType: "cell",
      entityId: cell.id,
      oldValue: oldValue != null ? String(oldValue) : null,
      newValue: newValue != null ? String(newValue) : null,
      summary: `Updated ${lineItemForEdit?.name || lineItemForEdit?.code || "cell"} ${
        cell.periodDate ? String(cell.periodDate).slice(0, 10) : ""
      }: ${oldValue ?? "null"} → ${newValue ?? "null"}`.trim(),
      ip,
    });

    const dependents = await FpaGridService.recalculateDependents(updated, userId);
    const primary = serializeCell(updated);
    return {
      ...primary,
      updatedCells: [primary, ...dependents],
    };
  }

  /** Re-evaluate formulas that reference the edited line in the same period / dept slice. */
  static async recalculateDependents(cell: any, userId: string) {
    const lineItem = await prisma.planningLineItem.findUnique({ where: { id: cell.lineItemId } });
    if (!lineItem) return [];
    const code = String(lineItem.code).toUpperCase();
    const formulas = await prisma.planningFormula.findMany({
      where: { modelId: cell.modelId },
      include: { lineItem: { select: { id: true, code: true } } },
    });
    const dependents = formulas.filter((f) =>
      FpaFormulaEngine.extractLineCodes(f.expression).some((c) => String(c).toUpperCase() === code)
    );
    if (!dependents.length) return [];

    const periodCells = await prisma.planningCell.findMany({
      where: {
        versionId: cell.versionId,
        scenarioId: cell.scenarioId,
        periodDate: cell.periodDate,
        departmentId: cell.departmentId ?? null,
      },
      include: { lineItem: { select: { id: true, code: true } } },
    });
    const canonicalPeriod = pickCanonicalCells(periodCells);
    const lines: Record<string, number> = {};
    const merged = mergeLineValuesByCode(canonicalPeriod, { nullAsZero: true });
    for (const [k, v] of Object.entries(merged)) lines[k] = v != null ? Number(v) : 0;
    const driversRows = await prisma.planningDriver.findMany({ where: { modelId: cell.modelId }, take: 200 });
    const drivers: Record<string, number> = {};
    for (const d of driversRows) drivers[String(d.code).toUpperCase()] = Number(d.value || 0);

    const out = [];
    for (const f of dependents) {
      if (!f.lineItemId) continue;
      try {
        const value = FpaFormulaEngine.evaluate(f.expression, { lines, drivers });
        const target =
          canonicalPeriod.find((c) => c.lineItemId === f.lineItemId) ||
          (await prisma.planningCell.findFirst({
            where: {
              versionId: cell.versionId,
              scenarioId: cell.scenarioId,
              lineItemId: f.lineItemId,
              periodDate: cell.periodDate,
              departmentId: cell.departmentId ?? null,
            },
            orderBy: [{ updatedAt: "desc" }],
          }));
        if (!target || target.isLocked) continue;
        // Prefer valued row if duplicates still exist
        const valued =
          target.value != null
            ? target
            : canonicalPeriod.find((c) => c.lineItemId === f.lineItemId && c.value != null) || target;
        const nextRv = BigInt(Number(valued.recordVersion || 1) + 1);
        const updated = await prisma.planningCell.update({
          where: { id: valued.id },
          data: {
            value,
            valueType: "CALCULATED",
            sourceType: "FORMULA",
            formulaId: f.id,
            lastUpdatedById: userId,
            lastUpdatedAt: new Date(),
            lastCalculatedAt: new Date(),
            recordVersion: nextRv,
          },
        });
        if (f.lineItem?.code) lines[String(f.lineItem.code).toUpperCase()] = value;
        out.push(serializeCell(updated));
      } catch {
        /* skip invalid formula for this slice */
      }
    }
    return out;
  }

  static async bulkUpdate(modelId: string, updates: any[], user: any, ip?: string) {
    const results = [];
    for (const u of updates || []) {
      results.push(await FpaGridService.updateCell({ ...u, modelId }, user, ip));
    }
    return { updated: results.length, cells: results };
  }

  static async spread(input: any, user: any, ip?: string) {
    const userId = user?.id;
    const { modelId, versionId, scenarioId, lineItemId, value, periodDates } = input;
    if (!versionId || !lineItemId) throw new FpaError(400, "VALIDATION", "versionId and lineItemId required");
    await FpaGridService.assertEditableVersion(versionId, userId, user, ip);

    const where: any = { modelId, versionId, lineItemId, isLocked: false, isEditable: true };
    if (scenarioId) where.scenarioId = scenarioId;
    if (periodDates?.length) {
      where.periodDate = { in: periodDates.map((d) => new Date(d)) };
    }
    const cells = await prisma.planningCell.findMany({ where });
    const n = cells.length || 1;
    const per = Number(value) / n;
    const updated = [];
    for (const cell of cells) {
      updated.push(
        await FpaGridService.updateCell(
          { cellId: cell.id, value: per, reason: input.reason || "SPREAD" },
          user,
          ip
        )
      );
    }
    return { spreadAcross: updated.length, cells: updated };
  }

  static async copyForward(input: any, user: any, ip?: string) {
    const userId = user?.id;
    const { modelId, versionId, scenarioId, lineItemId, fromPeriodDate } = input;
    if (!versionId || !lineItemId || !fromPeriodDate) {
      throw new FpaError(400, "VALIDATION", "versionId, lineItemId, fromPeriodDate required");
    }
    await FpaGridService.assertEditableVersion(versionId, userId, user, ip);
    const from = new Date(fromPeriodDate);
    const source = await prisma.planningCell.findFirst({
      where: { modelId, versionId, scenarioId, lineItemId, periodDate: from },
    });
    if (!source) throw new FpaError(404, "NOT_FOUND", "Source cell not found");
    const targets = await prisma.planningCell.findMany({
      where: {
        modelId,
        versionId,
        scenarioId,
        lineItemId,
        periodDate: { gt: from },
        isLocked: false,
        isEditable: true,
      },
      orderBy: { periodDate: "asc" },
    });
    const updated = [];
    for (const cell of targets) {
      updated.push(
        await FpaGridService.updateCell(
          { cellId: cell.id, value: source.value, reason: input.reason || "COPY_FORWARD" },
          user,
          ip
        )
      );
    }
    return { copied: updated.length, value: source.value, cells: updated };
  }

  /**
   * Apply growth rate forward from a base period.
   * mode FLAT: each period = base * (1 + rate)
   * mode COMPOUND: each next period compounds from previous applied value
   */
  static async applyGrowth(input: any, user: any, ip?: string) {
    const userId = user?.id;
    const modelId = String(input.modelId || "");
    const versionId = String(input.versionId || "");
    const scenarioId = String(input.scenarioId || "");
    const lineItemId = String(input.lineItemId || "");
    const fromPeriodDate = input.fromPeriodDate;
    const ratePct = Number(input.ratePct);
    const mode = String(input.mode || "COMPOUND").toUpperCase();

    if (!modelId || !versionId || !scenarioId || !lineItemId || !fromPeriodDate) {
      throw new FpaError(
        400,
        "VALIDATION",
        "modelId, versionId, scenarioId, lineItemId, fromPeriodDate are required"
      );
    }
    if (!Number.isFinite(ratePct)) throw new FpaError(400, "VALIDATION", "ratePct is required");
    await FpaGridService.assertEditableVersion(versionId, userId, user, ip);

    const from = new Date(fromPeriodDate);
    const source = await prisma.planningCell.findFirst({
      where: { modelId, versionId, scenarioId, lineItemId, periodDate: from },
    });
    if (!source || source.value == null) {
      throw new FpaError(404, "NOT_FOUND", "Source cell with a value not found at fromPeriodDate");
    }

    const targets = await prisma.planningCell.findMany({
      where: {
        modelId,
        versionId,
        scenarioId,
        lineItemId,
        periodDate: { gt: from },
        isLocked: false,
        isEditable: true,
      },
      orderBy: { periodDate: "asc" },
    });

    const rate = ratePct / 100;
    let prev = Number(source.value);
    const base = Number(source.value);
    const updated = [];
    for (let i = 0; i < targets.length; i++) {
      const cell = targets[i];
      const nextVal = mode === "FLAT" ? base * (1 + rate) : prev * (1 + rate);
      prev = nextVal;
      updated.push(
        await FpaGridService.updateCell(
          {
            cellId: cell.id,
            value: nextVal,
            reason: input.reason || `APPLY_GROWTH_${mode}_${ratePct}`,
            sourceType: "GROWTH",
            valueType: "CALCULATED",
          },
          user,
          ip
        )
      );
    }

    await FpaAuditService.log("CELL_APPLY_GROWTH", userId, {
      modelId,
      versionId,
      scenarioId,
      reason: `ratePct=${ratePct};mode=${mode};from=${fromPeriodDate}`,
      ip,
    });

    return {
      applied: updated.length,
      ratePct,
      mode,
      fromPeriodDate,
      baseValue: base,
      cells: updated,
    };
  }

  static async cellHistory(cellId: string) {
    const rows = await prisma.planningAuditLog.findMany({
      where: { cellId, actionType: { in: ["CELL_UPDATE", "CELL_EDIT_BLOCKED", "CELL_EDIT_BLOCKED_LOCKED"] } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      cellId: r.cellId,
      userId: r.userId,
      userName: userDisplayName(r.user),
      actionType: r.actionType,
      oldValue: r.oldValue,
      newValue: r.newValue,
      reason: r.reason,
      createdAt: r.createdAt,
    }));
  }

  static async listCellComments(modelId: string, cellId: string) {
    const cell = await prisma.planningCell.findFirst({ where: { id: cellId, modelId } });
    if (!cell) throw new FpaError(404, "NOT_FOUND", "Cell not found");
    const rows = await prisma.planningComment.findMany({
      where: { modelId, cellId },
      orderBy: { createdAt: "desc" },
    });
    const userIds = [...new Set(rows.map((r) => r.createdById))];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const byId = Object.fromEntries(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      status: r.status,
      authorName: userDisplayName(byId[r.createdById]),
      authorId: r.createdById,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  static async addCellComment(modelId: string, cellId: string, input: any, user: any) {
    const cell = await prisma.planningCell.findFirst({ where: { id: cellId, modelId } });
    if (!cell) throw new FpaError(404, "NOT_FOUND", "Cell not found");
    const body = String(input?.body || input?.comment || "").trim();
    if (!body) throw new FpaError(400, "VALIDATION", "body is required");
    const created = await prisma.planningComment.create({
      data: {
        modelId,
        cellId,
        body,
        correctiveAction: input?.correctiveAction || null,
        status: input?.status || "OPEN",
        createdById: user.id,
      },
    });
    return {
      id: created.id,
      body: created.body,
      status: created.status,
      authorName: userDisplayName(user),
      authorId: user.id,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  /**
   * Worksheet validation strip — cell/period level issues for a version+scenario.
   */
  static async gridValidations(modelId: string, opts: any = {}) {
    const versionId = opts.versionId ? String(opts.versionId) : null;
    const scenarioId = opts.scenarioId ? String(opts.scenarioId) : null;
    const moduleId = opts.moduleId ? String(opts.moduleId) : null;
    if (!versionId) throw new FpaError(400, "VALIDATION", "versionId is required");

    if (moduleId) {
      const mod = await prisma.planningModule.findFirst({ where: { id: moduleId, modelId } });
      if (!mod) throw new FpaError(404, "NOT_FOUND", "Module not found for this model");
    }

    const lineItemWhere: any = { modelId };
    if (moduleId) lineItemWhere.moduleId = moduleId;

    const [lineItems, cells, formulas] = await Promise.all([
      prisma.planningLineItem.findMany({ where: lineItemWhere, orderBy: { sortOrder: "asc" } }),
      prisma.planningCell.findMany({
        where: {
          modelId,
          versionId,
          ...(scenarioId ? { scenarioId } : {}),
          ...(moduleId
            ? {
                lineItem: { moduleId },
              }
            : {}),
        },
        include: { lineItem: { select: { id: true, code: true, name: true, moduleId: true } } },
      }),
      prisma.planningFormula.findMany({
        where: {
          modelId,
          ...(moduleId ? { lineItem: { moduleId } } : {}),
        },
      }),
    ]);

    const issues: Array<{
      severity: "ERROR" | "WARNING" | "INFO";
      code: string;
      message: string;
      lineItemId?: string;
      periodDate?: string;
      cellId?: string;
    }> = [];

    const required = lineItems.filter((li) => li.isEditable !== false);
    const canonical = pickCanonicalCells(cells);
    const byKey = new Map(
      canonical.map((c) => [`${c.lineItemId}|${periodKey(c.periodDate)}`, c])
    );

    const periods = [...new Set(canonical.map((c) => periodKey(c.periodDate)))].sort();
    if (!periods.length) {
      issues.push({
        severity: "WARNING",
        code: "EMPTY_GRID",
        message: "No cells in this version/scenario. Seed cells or enter values via coordinate upsert.",
      });
    }

    for (const li of required) {
      for (const p of periods) {
        const c = byKey.get(`${li.id}|${p}`);
        if (!c) {
          issues.push({
            severity: "WARNING",
            code: "MISSING_CELL",
            message: `Missing cell for ${li.code || li.name} @ ${p}`,
            lineItemId: li.id,
            periodDate: p,
          });
        } else if (c.value == null && c.isEditable && !c.isLocked) {
          issues.push({
            severity: "INFO",
            code: "EMPTY_VALUE",
            message: `Empty value for ${li.code || li.name} @ ${p}`,
            lineItemId: li.id,
            periodDate: p,
            cellId: c.id,
          });
        }
      }
    }

    for (const f of formulas) {
      if (!f.isValid) {
        issues.push({
          severity: "ERROR",
          code: "INVALID_FORMULA",
          message: f.validationMsg || "Formula is marked invalid",
          lineItemId: f.lineItemId,
        });
      }
    }

    const lockedEditable = canonical.filter((c) => c.isLocked && c.isEditable);
    if (lockedEditable.length) {
      issues.push({
        severity: "INFO",
        code: "LOCKED_CELLS",
        message: `${lockedEditable.length} cell(s) are locked`,
      });
    }

    return {
      modelId,
      moduleId,
      versionId,
      scenarioId,
      count: issues.length,
      issues,
    };
  }

  /**
   * Bulk spreadsheet-style ops (server-validated).
   * operation: FILL_RIGHT | FILL_DOWN | COPY_PRIOR_PERIOD | COPY_PRIOR_YEAR |
   *            PERCENT_INCREASE | PERCENT_DECREASE | CLEAR_EDITABLE
   */
  static async bulkOperation(input: any, user: any, ip?: string) {
    const op = String(input.operation || "").toUpperCase();
    const modelId = String(input.modelId || "");
    const versionId = String(input.versionId || "");
    const scenarioId = String(input.scenarioId || "");
    const lineItemId = input.lineItemId ? String(input.lineItemId) : null;
    if (!modelId || !versionId || !op) {
      throw new FpaError(400, "VALIDATION", "modelId, versionId, and operation are required");
    }
    await FpaGridService.assertEditableVersion(versionId, user?.id, user, ip);

    const where: any = {
      modelId,
      versionId,
      isLocked: false,
      isEditable: true,
      ...(scenarioId ? { scenarioId } : {}),
      ...(lineItemId ? { lineItemId } : {}),
      ...(input.departmentId ? { departmentId: String(input.departmentId) } : {}),
    };
    const cells = await prisma.planningCell.findMany({
      where,
      orderBy: [{ lineItemId: "asc" }, { periodDate: "asc" }],
    });
    const editable = cells.filter((c) => cellStatusOf(c) === "INPUT");
    const updated = [];
    const ratePct = Number(input.ratePct || 0);

    if (op === "CLEAR_EDITABLE") {
      for (const c of editable) {
        updated.push(
          await FpaGridService.updateCell(
            { cellId: c.id, value: null, recordVersion: Number(c.recordVersion || 1), cycleId: input.cycleId },
            user,
            ip
          )
        );
      }
    } else if (op === "PERCENT_INCREASE" || op === "PERCENT_DECREASE") {
      const sign = op === "PERCENT_DECREASE" ? -1 : 1;
      const factor = 1 + (sign * ratePct) / 100;
      for (const c of editable) {
        if (c.value == null) continue;
        updated.push(
          await FpaGridService.updateCell(
            {
              cellId: c.id,
              value: Number(c.value) * factor,
              recordVersion: Number(c.recordVersion || 1),
              cycleId: input.cycleId,
            },
            user,
            ip
          )
        );
      }
    } else if (op === "FILL_RIGHT" || op === "COPY_PRIOR_PERIOD") {
      const byLine: Record<string, typeof editable> = {};
      for (const c of editable) {
        (byLine[c.lineItemId] ||= []).push(c);
      }
      for (const list of Object.values(byLine)) {
        list.sort((a, b) => new Date(a.periodDate).getTime() - new Date(b.periodDate).getTime());
        let prev = list[0]?.value;
        for (let i = 1; i < list.length; i++) {
          const c = list[i];
          if (prev == null) {
            prev = c.value;
            continue;
          }
          updated.push(
            await FpaGridService.updateCell(
              {
                cellId: c.id,
                value: Number(prev),
                recordVersion: Number(c.recordVersion || 1),
                cycleId: input.cycleId,
              },
              user,
              ip
            )
          );
          prev = prev;
        }
      }
    } else if (op === "COPY_PRIOR_YEAR") {
      for (const c of editable) {
        const prior = new Date(c.periodDate);
        prior.setUTCFullYear(prior.getUTCFullYear() - 1);
        const src = await prisma.planningCell.findFirst({
          where: {
            modelId,
            versionId,
            scenarioId: c.scenarioId,
            lineItemId: c.lineItemId,
            periodDate: prior,
          },
        });
        if (!src || src.value == null) continue;
        updated.push(
          await FpaGridService.updateCell(
            {
              cellId: c.id,
              value: Number(src.value),
              recordVersion: Number(c.recordVersion || 1),
              cycleId: input.cycleId,
            },
            user,
            ip
          )
        );
      }
    } else if (op === "FILL_DOWN") {
      const byPeriod: Record<string, typeof editable> = {};
      for (const c of editable) {
        const key = new Date(c.periodDate).toISOString().slice(0, 10);
        (byPeriod[key] ||= []).push(c);
      }
      for (const list of Object.values(byPeriod)) {
        const first = list.find((c) => c.value != null);
        if (!first) continue;
        for (const c of list) {
          if (c.id === first.id) continue;
          updated.push(
            await FpaGridService.updateCell(
              {
                cellId: c.id,
                value: Number(first.value),
                recordVersion: Number(c.recordVersion || 1),
                cycleId: input.cycleId,
              },
              user,
              ip
            )
          );
        }
      }
    } else {
      throw new FpaError(400, "VALIDATION", `Unknown bulk operation: ${op}`);
    }

    return { operation: op, updated: updated.length, cells: updated };
  }

  static async cellDetail(modelId: string, cellId: string) {
    const cell = await prisma.planningCell.findFirst({
      where: { id: cellId, modelId },
      include: {
        lineItem: true,
        formula: true,
        driver: true,
        scenario: { select: { id: true, name: true } },
        version: { select: { id: true, name: true, status: true } },
        lastUpdatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!cell) throw new FpaError(404, "NOT_FOUND", "Cell not found");

    let departmentName = null;
    let entityName = null;
    if (cell.departmentId) {
      const d = await prisma.department.findUnique({
        where: { id: cell.departmentId },
        select: { name: true },
      });
      departmentName = d?.name || null;
    }
    if (cell.entityId) {
      try {
        const e = await prisma.forecastEntity.findUnique({
          where: { id: cell.entityId },
          select: { name: true },
        });
        entityName = e?.name || null;
      } catch {
        entityName = null;
      }
    }

    const drivers = [];
    if (cell.driver) {
      drivers.push({
        id: cell.driver.id,
        code: cell.driver.code,
        name: cell.driver.name,
        value: Number(cell.driver.value),
        unit: cell.driver.unit,
      });
    } else if (cell.formulaId) {
      const related = await prisma.planningDriver.findMany({
        where: { modelId, versionId: cell.versionId },
        take: 20,
      });
      for (const d of related) {
        drivers.push({
          id: d.id,
          code: d.code,
          name: d.name,
          value: Number(d.value),
          unit: d.unit,
        });
      }
    }

    const history = await FpaGridService.cellHistory(cellId);
    const comments = await FpaGridService.listCellComments(modelId, cellId);

    let validationStatus = "OK";
    if (cell.formula && cell.formula.isValid === false) validationStatus = "INVALID_FORMULA";
    else if (cell.value == null && cell.isEditable) validationStatus = "EMPTY";
    else if (cell.isLocked) validationStatus = "LOCKED";

    let formulaUpdatedByName = null;
    if (cell.formulaId) {
      const formulaUserId = cell.formula?.createdById || null;
      if (formulaUserId) {
        const fu = await prisma.user.findUnique({
          where: { id: formulaUserId },
          select: { firstName: true, lastName: true, email: true },
        });
        formulaUpdatedByName = userDisplayName(fu);
      }
      if (!formulaUpdatedByName) {
        const audit = await prisma.planningAuditLog.findFirst({
          where: {
            modelId,
            OR: [
              { actionType: { contains: "FORMULA" } },
              { entityType: { in: ["formula", "FORMULA"] } },
            ],
            lineItemId: cell.lineItemId,
          },
          orderBy: { createdAt: "desc" },
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        });
        formulaUpdatedByName = userDisplayName(audit?.user) || userDisplayName(cell.lastUpdatedBy);
      }
    }

    return {
      id: cell.id,
      lineItem: cell.lineItem
        ? { id: cell.lineItem.id, code: cell.lineItem.code, name: cell.lineItem.name }
        : null,
      periodDate: cell.periodDate,
      departmentId: cell.departmentId,
      departmentName,
      entityId: cell.entityId,
      entityName,
      version: cell.version,
      scenario: cell.scenario,
      value: cell.value != null ? Number(cell.value) : null,
      currencyCode: cell.currencyCode,
      cellStatus: cellStatusOf(cell),
      recordVersion: cell.recordVersion != null ? Number(cell.recordVersion) : 1,
      formula: cell.formula
        ? { id: cell.formula.id, expression: cell.formula.expression, isValid: cell.formula.isValid }
        : null,
      currentDrivers: drivers,
      lastUpdatedBy: userDisplayName(cell.lastUpdatedBy),
      lastUpdatedAt: cell.lastUpdatedAt,
      lastCalculatedAt: cell.lastCalculatedAt || null,
      formulaUpdatedAt: cell.formula?.updatedAt || null,
      formulaUpdatedByName,
      validationStatus,
      history,
      comments,
    };
  }

  /** Formula dependency graph for “View Formula Trace”. */
  static async cellTrace(modelId: string, cellId: string) {
    const detail = await FpaGridService.cellDetail(modelId, cellId);
    const expression = detail.formula?.expression || null;
    const lineCodes = expression ? FpaFormulaEngine.extractLineCodes(expression) : [];
    const driverCodes = expression ? FpaFormulaEngine.extractDriverCodes(expression) : [];
    const formulas = await prisma.planningFormula.findMany({
      where: { modelId },
      include: { lineItem: { select: { id: true, code: true, name: true } } },
    });
    const dependents = formulas
      .filter((f) => {
        if (!detail.lineItem?.code) return false;
        return FpaFormulaEngine.extractLineCodes(f.expression).some(
          (c) => String(c).toUpperCase() === String(detail.lineItem.code).toUpperCase()
        );
      })
      .map((f) => ({
        formulaId: f.id,
        lineItemId: f.lineItemId,
        lineCode: f.lineItem?.code || null,
        lineName: f.lineItem?.name || null,
        expression: f.expression,
      }));

    const cell = await prisma.planningCell.findFirst({
      where: { id: cellId, modelId },
      include: { lineItem: { select: { id: true, code: true, name: true } } },
    });
    const periodCells = cell
      ? await prisma.planningCell.findMany({
          where: {
            modelId,
            versionId: cell.versionId,
            scenarioId: cell.scenarioId,
            periodDate: cell.periodDate,
            departmentId: cell.departmentId ?? null,
          },
          include: { lineItem: { select: { id: true, code: true, name: true } } },
        })
      : [];
    const canonicalPeriod = pickCanonicalCells(periodCells);
    const valueByCode = mergeLineValuesByCode(canonicalPeriod);

    // Dependent cell values for same period
    const depValues: Record<string, number | null> = {};
    for (const d of dependents) {
      const hit = canonicalPeriod.find((c) => c.lineItemId === d.lineItemId);
      depValues[d.lineItemId] = hit?.value != null ? Number(hit.value) : null;
    }

    const rootId = `cell:${cellId}`;
    const nodes = [
      {
        id: rootId,
        label: detail.lineItem?.name || detail.lineItem?.code || cellId,
        kind: "RESULT",
        value: detail.value,
        expression,
      },
      ...lineCodes.map((c) => ({
        id: `line:${c}`,
        label: c,
        kind: "LINE",
        value: valueByCode[c] ?? null,
        expression: null,
      })),
      ...driverCodes.map((c) => ({
        id: `driver:${c}`,
        label: c,
        kind: "DRIVER",
        value: (detail.currentDrivers || []).find((d) => String(d.code).toUpperCase() === String(c).toUpperCase())?.value ?? null,
        expression: null,
      })),
      ...dependents.map((d) => ({
        id: `dep:${d.lineItemId}`,
        label: d.lineName || d.lineCode,
        kind: "DEPENDENT",
        value: depValues[d.lineItemId] ?? null,
        expression: d.expression,
      })),
    ];
    const edges = [
      ...lineCodes.map((c) => ({ from: `line:${c}`, to: rootId })),
      ...driverCodes.map((c) => ({ from: `driver:${c}`, to: rootId })),
      ...dependents.map((d) => ({ from: rootId, to: `dep:${d.lineItemId}` })),
    ];

    return {
      cellId,
      expression,
      root: { cellId, expression, value: detail.value },
      nodes,
      edges,
      inputs: {
        lineCodes,
        driverCodes,
        currentDrivers: detail.currentDrivers,
      },
      dependents,
      // legacy nodes shape retained for older FE
      legacyNodes: [
        ...lineCodes.map((c) => ({ type: "LINE", code: c })),
        ...driverCodes.map((c) => ({ type: "DRIVER", code: c })),
        ...dependents.map((d) => ({ type: "DEPENDENT", code: d.lineCode, formulaId: d.formulaId })),
      ],
    };
  }
}
