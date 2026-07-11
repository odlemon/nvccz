// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";

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

  static async getGrid(modelId: string, opts: any = {}) {
    const page = Math.max(1, Number(opts.page || 1));
    const pageSize = Math.min(500, Math.max(1, Number(opts.pageSize || opts.page_size || 100)));
    const where: any = { modelId };
    if (opts.versionId) where.versionId = String(opts.versionId);
    if (opts.scenarioId) where.scenarioId = String(opts.scenarioId);
    if (opts.lineItemId) where.lineItemId = String(opts.lineItemId);

    const [total, cells, lineItems] = await Promise.all([
      prisma.planningCell.count({ where }),
      prisma.planningCell.findMany({
        where,
        include: { lineItem: { select: { id: true, code: true, name: true, lineItemType: true, category: true } } },
        orderBy: [{ lineItem: { sortOrder: "asc" } }, { periodDate: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.planningLineItem.findMany({ where: { modelId }, orderBy: { sortOrder: "asc" } }),
    ]);

    return {
      modelId,
      versionId: opts.versionId || null,
      scenarioId: opts.scenarioId || null,
      page,
      pageSize,
      total,
      lineItems,
      cells,
    };
  }

  static async updateCell(input: any, user: any, ip?: string) {
    const userId = user?.id;
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
          modelId: input.modelId || undefined,
        },
      });
    }

    // Upsert for empty DRAFT versions: create cell at coordinates then update
    if (!cell && input.lineItemId && input.periodDate && input.versionId && input.scenarioId && input.modelId) {
      await FpaGridService.assertEditableVersion(String(input.versionId), userId, user, ip);
      const lineItem = await prisma.planningLineItem.findFirst({
        where: { id: String(input.lineItemId), modelId: String(input.modelId) },
      });
      if (!lineItem) throw new FpaError(404, "NOT_FOUND", "Line item not found");
      cell = await prisma.planningCell.create({
        data: {
          modelId: String(input.modelId),
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

  static async cellHistory(cellId: string) {
    return prisma.planningAuditLog.findMany({
      where: { cellId, actionType: { in: ["CELL_UPDATE", "CELL_EDIT_BLOCKED", "CELL_EDIT_BLOCKED_LOCKED"] } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
}
