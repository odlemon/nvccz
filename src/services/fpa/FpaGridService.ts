// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";

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

  static async getGrid(modelId: string, opts: any = {}) {
    const page = Math.max(1, Number(opts.page || 1));
    const pageSize = Math.min(500, Math.max(1, Number(opts.pageSize || opts.page_size || 100)));
    const where: any = { modelId };
    if (opts.versionId) where.versionId = String(opts.versionId);
    if (opts.scenarioId) where.scenarioId = String(opts.scenarioId);
    if (opts.lineItemId) where.lineItemId = String(opts.lineItemId);

    const [model, total, cells, lineItems, actualCutoff] = await Promise.all([
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
            select: { id: true, code: true, name: true, lineItemType: true, category: true, isEditable: true },
          },
        },
        orderBy: [{ lineItem: { sortOrder: "asc" } }, { periodDate: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.planningLineItem.findMany({ where: { modelId }, orderBy: { sortOrder: "asc" } }),
      FpaGridService.resolveActualCutoff(modelId),
    ]);
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");

    const enrichedCells = cells.map((c) => ({
      ...c,
      periodRole: periodRoleFor(c.periodDate, actualCutoff, c.sourceType),
      value: c.value != null ? Number(c.value) : null,
    }));

    const periodMap = new Map<string, { periodDate: string; periodRole: "ACTUAL" | "FORECAST" }>();
    for (const c of enrichedCells) {
      const key = new Date(c.periodDate).toISOString().slice(0, 10);
      if (!periodMap.has(key)) {
        periodMap.set(key, { periodDate: key, periodRole: c.periodRole });
      }
    }
    // Also include model calendar periods even if no cells yet
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
    const periods = [...periodMap.values()].sort((a, b) => a.periodDate.localeCompare(b.periodDate));

    return {
      modelId,
      versionId: opts.versionId || null,
      scenarioId: opts.scenarioId || null,
      page,
      pageSize,
      total,
      actualCutoff: actualCutoff.toISOString().slice(0, 10),
      ownerName: userDisplayName(model.owner),
      ownerAvatarUrl: model.owner?.backgroundImage || null,
      periods,
      lineItems,
      cells: enrichedCells,
    };
  }

  static async updateCell(input: any, user: any, ip?: string) {
    const userId = user?.id;
    const modelId = input.modelId ? String(input.modelId) : null;
    let cell = input.cellId || input.id
      ? await prisma.planningCell.findUnique({ where: { id: input.cellId || input.id } })
      : null;
    if (!cell && input.lineItemId && input.periodDate && input.versionId && input.scenarioId) {
      cell = await prisma.planningCell.findFirst({
        where: {
          versionId: String(input.versionId),
          scenarioId: String(input.scenarioId),
          lineItemId: String(input.lineItemId),
          periodDate: new Date(input.periodDate),
          ...(modelId ? { modelId } : {}),
        },
      });
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
      cell = await prisma.planningCell.create({
        data: {
          modelId: resolvedModelId,
          scenarioId: String(input.scenarioId),
          versionId: String(input.versionId),
          lineItemId: String(input.lineItemId),
          periodDate: new Date(input.periodDate),
          currencyCode: input.currencyCode || "USD",
          value: null,
          valueType: "INPUT",
          sourceType: "MANUAL",
          isEditable: lineItem.isEditable !== false,
          isLocked: false,
        },
      });
    }

    if (!cell) throw new FpaError(404, "NOT_FOUND", "Cell not found");
    const version = await FpaGridService.assertEditableVersion(cell.versionId, userId, user, ip);
    if (cell.isLocked || !cell.isEditable) {
      await FpaAuditService.log("CELL_EDIT_BLOCKED", userId, {
        modelId: cell.modelId,
        versionId: cell.versionId,
        cellId: cell.id,
        reason: "Cell locked or not editable",
        ip,
      });
      throw new FpaError(403, "CELL_LOCKED", "Cell is locked or not editable");
    }
    FpaAccessService.assertCanEditVersion(user, version, { departmentId: cell.departmentId });

    const oldValue = cell.value;
    const newValue = input.value;
    const updated = await prisma.planningCell.update({
      where: { id: cell.id },
      data: {
        value: newValue,
        valueType: input.valueType || "MANUAL",
        sourceType: input.sourceType || "INPUT",
        lastUpdatedById: userId,
        lastUpdatedAt: new Date(),
      },
    });
    await FpaAuditService.log("CELL_UPDATE", userId, {
      modelId: cell.modelId,
      versionId: cell.versionId,
      scenarioId: cell.scenarioId,
      cellId: cell.id,
      oldValue: oldValue != null ? String(oldValue) : null,
      newValue: newValue != null ? String(newValue) : null,
      ip,
    });
    return updated;
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
    if (!versionId) throw new FpaError(400, "VALIDATION", "versionId is required");

    const [lineItems, cells, formulas] = await Promise.all([
      prisma.planningLineItem.findMany({ where: { modelId }, orderBy: { sortOrder: "asc" } }),
      prisma.planningCell.findMany({
        where: {
          modelId,
          versionId,
          ...(scenarioId ? { scenarioId } : {}),
        },
        include: { lineItem: { select: { id: true, code: true, name: true } } },
      }),
      prisma.planningFormula.findMany({ where: { modelId } }),
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
    const cellKey = (lineItemId: string, period: Date) =>
      `${lineItemId}|${new Date(period).toISOString().slice(0, 10)}`;
    const byKey = new Map(cells.map((c) => [cellKey(c.lineItemId, c.periodDate), c]));

    const periods = [...new Set(cells.map((c) => new Date(c.periodDate).toISOString().slice(0, 10)))].sort();
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

    const lockedEditable = cells.filter((c) => c.isLocked && c.isEditable);
    if (lockedEditable.length) {
      issues.push({
        severity: "INFO",
        code: "LOCKED_CELLS",
        message: `${lockedEditable.length} cell(s) are locked`,
      });
    }

    return {
      modelId,
      versionId,
      scenarioId,
      count: issues.length,
      issues,
    };
  }
}
