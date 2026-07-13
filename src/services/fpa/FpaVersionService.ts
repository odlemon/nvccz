// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";

export class FpaVersionService {
  static async listByModel(modelId: string) {
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Model not found");
    return prisma.planningVersion.findMany({
      where: { modelId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        modelId: true,
        name: true,
        status: true,
        lockedAt: true,
        publishedAt: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  static async create(input: any, userId: string, ip?: string) {
    const modelId = input.modelId;
    if (!modelId || !input.name) throw new FpaError(400, "VALIDATION", "modelId and name required");
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Model not found");
    const copyFromVersionId = input.copyFromVersionId || input.sourceVersionId || null;

    const result = await prisma.$transaction(async (tx) => {
      const version = await tx.planningVersion.create({
        data: {
          modelId,
          name: String(input.name),
          status: "DRAFT",
          createdById: userId,
        },
      });

      let cellsCopied = 0;
      if (copyFromVersionId) {
        const source = await tx.planningVersion.findFirst({
          where: { id: String(copyFromVersionId), modelId },
        });
        if (!source) throw new FpaError(404, "NOT_FOUND", "copyFromVersionId not found on this model");
        const cells = await tx.planningCell.findMany({ where: { versionId: source.id } });
        if (cells.length) {
          await tx.planningCell.createMany({
            data: cells.map((c) => ({
              modelId: c.modelId,
              scenarioId: c.scenarioId,
              versionId: version.id,
              lineItemId: c.lineItemId,
              periodDate: c.periodDate,
              entityId: c.entityId,
              departmentId: c.departmentId,
              costCentreId: c.costCentreId,
              accountId: c.accountId,
              currencyCode: c.currencyCode,
              value: c.value,
              valueType: c.valueType,
              sourceType: c.sourceType,
              isEditable: true,
              isLocked: false,
              formulaId: c.formulaId,
              driverId: c.driverId,
            })),
          });
          cellsCopied = cells.length;
        }
      }

      return { version, cellsCopied };
    });

    await FpaAuditService.log("VERSION_CREATE", userId, {
      modelId,
      versionId: result.version.id,
      oldValue: copyFromVersionId,
      ip,
    });
    return { ...result.version, cellsCopied: result.cellsCopied };
  }

  /**
   * Seed empty DRAFT version cells from line items × periods, or copy from another version.
   * Body: { scenarioId, copyFromVersionId? } — if no copy source, creates empty editable cells.
   */
  static async seedCells(versionId: string, input: any, userId: string, ip?: string) {
    const version = await prisma.planningVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new FpaError(404, "NOT_FOUND", "Version not found");
    if (String(version.status).toUpperCase() === "LOCKED") {
      throw new FpaError(403, "VERSION_LOCKED", "Cannot seed cells on a locked version");
    }

    const existingCount = await prisma.planningCell.count({ where: { versionId } });
    // Legacy: force without fillMissing acknowledges "already seeded" and skips.
    // Default (and fillMissing=true): materialize missing (lineItem × period) rows — required for draft grids.
    const fillMissing =
      input.fillMissing === true ||
      input.fillMissing === "true" ||
      input.materialize === true ||
      !input.force;
    if (existingCount > 0 && input.force && !fillMissing) {
      return { versionId, cellsSeeded: 0, total: existingCount, skipped: true };
    }

    const copyFromVersionId = input.copyFromVersionId || input.sourceVersionId || null;
    if (copyFromVersionId) {
      const sourceCells = await prisma.planningCell.findMany({
        where: { versionId: String(copyFromVersionId), modelId: version.modelId },
      });
      if (!sourceCells.length) throw new FpaError(404, "NOT_FOUND", "Source version has no cells");
      await prisma.planningCell.createMany({
        data: sourceCells.map((c) => ({
          modelId: c.modelId,
          scenarioId: input.scenarioId || c.scenarioId,
          versionId,
          lineItemId: c.lineItemId,
          periodDate: c.periodDate,
          entityId: c.entityId,
          departmentId: c.departmentId,
          costCentreId: c.costCentreId,
          accountId: c.accountId,
          currencyCode: c.currencyCode,
          value: c.value,
          valueType: c.valueType,
          sourceType: c.sourceType,
          isEditable: true,
          isLocked: false,
          formulaId: c.formulaId,
          driverId: c.driverId,
        })),
        skipDuplicates: true,
      });
      await FpaAuditService.log("VERSION_SEED_CELLS", userId, {
        modelId: version.modelId,
        versionId,
        entityType: "cell",
        oldValue: String(copyFromVersionId),
        summary: `Seeded cells from version ${copyFromVersionId}`,
        ip,
      });
      const total = await prisma.planningCell.count({ where: { versionId } });
      return { versionId, cellsSeeded: Math.max(0, total - existingCount), total };
    }

    const scenarioId = input.scenarioId;
    if (!scenarioId) throw new FpaError(400, "VALIDATION", "scenarioId required when not copying");
    const model = await prisma.planningModel.findUnique({ where: { id: version.modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Model not found");
    const lineItems = await prisma.planningLineItem.findMany({ where: { modelId: version.modelId } });
    if (!lineItems.length) throw new FpaError(400, "VALIDATION", "Model has no line items");

    const periods: Date[] = [];
    const cursor = new Date(model.startPeriod);
    cursor.setUTCDate(1);
    cursor.setUTCHours(0, 0, 0, 0);
    const end = new Date(model.endPeriod);
    while (cursor <= end) {
      periods.push(new Date(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    const rows = [];
    for (const li of lineItems) {
      for (const periodDate of periods) {
        rows.push({
          modelId: version.modelId,
          scenarioId: String(scenarioId),
          versionId,
          lineItemId: li.id,
          periodDate,
          currencyCode: model.baseCurrency,
          value: null,
          valueType: "INPUT",
          sourceType: "MANUAL",
          isEditable: li.isEditable,
          isLocked: false,
        });
      }
    }
    if (rows.length) {
      await prisma.planningCell.createMany({ data: rows, skipDuplicates: true });
    }
    const total = await prisma.planningCell.count({ where: { versionId } });
    const cellsSeeded = Math.max(0, total - existingCount);
    await FpaAuditService.log("VERSION_SEED_CELLS", userId, {
      modelId: version.modelId,
      versionId,
      entityType: "cell",
      summary: cellsSeeded
        ? `Materialized ${cellsSeeded} missing grid cells (${total} total)`
        : `Grid already complete (${total} cells)`,
      ip,
    });
    return { versionId, cellsSeeded, total, filledMissing: existingCount > 0 };
  }

  static async lock(versionId: string, user: any, reason?: string, ip?: string) {
    FpaAccessService.assertCanLock(user);
    const version = await prisma.planningVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new FpaError(404, "NOT_FOUND", "Version not found");
    if (String(version.status).toUpperCase() === "LOCKED") {
      throw new FpaError(400, "ALREADY_LOCKED", "Version is already locked");
    }

    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.planningVersion.update({
        where: { id: versionId },
        data: {
          status: "LOCKED",
          lockedAt: new Date(),
          lockedById: user.id,
        },
      });
      await tx.planningCell.updateMany({
        where: { versionId },
        data: { isLocked: true, isEditable: false },
      });
      const lockRow = await tx.planningLock.create({
        data: {
          modelId: version.modelId,
          versionId,
          lockType: "VERSION",
          lockedById: user.id,
          reason: reason || "Version locked",
        },
      });
      return { version: locked, lock: lockRow };
    });

    await FpaAuditService.log("VERSION_LOCK", user.id, {
      modelId: version.modelId,
      versionId,
      reason,
      ip,
    });
    return result;
  }

  static async requestReopen(versionId: string, input: any, user: any, ip?: string) {
    FpaAccessService.assertCanApprove(user);
    const reason = String(input?.reason || "").trim();
    if (!reason) throw new FpaError(400, "VALIDATION", "reason is required to request reopen");
    const version = await prisma.planningVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new FpaError(404, "NOT_FOUND", "Version not found");
    if (String(version.status).toUpperCase() !== "LOCKED") {
      throw new FpaError(409, "INVALID_TRANSITION", "Only locked versions can request reopen");
    }

    // Default policy: never silent-unlock — create a new working copy
    const copy = await prisma.planningVersion.create({
      data: {
        modelId: version.modelId,
        name: `${version.name} (reopen ${new Date().toISOString().slice(0, 10)})`,
        status: "DRAFT",
        createdById: user.id,
      },
    });

    // Copy cells into the new working version (unlocked)
    const sourceCells = await prisma.planningCell.findMany({ where: { versionId } });
    const rows = sourceCells.map((c) => ({
      modelId: c.modelId,
      scenarioId: c.scenarioId,
      versionId: copy.id,
      lineItemId: c.lineItemId,
      periodDate: c.periodDate,
      departmentId: c.departmentId,
      entityId: c.entityId,
      currencyCode: c.currencyCode,
      value: c.value,
      valueType: c.valueType,
      sourceType: c.sourceType,
      formulaId: c.formulaId,
      driverId: c.driverId,
      isEditable: true,
      isLocked: false,
      recordVersion: BigInt(1),
    }));
    if (rows.length) {
      // chunk to avoid packet limits
      for (let i = 0; i < rows.length; i += 500) {
        await prisma.planningCell.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
      }
    }

    await prisma.planningLock.create({
      data: {
        modelId: version.modelId,
        versionId: copy.id,
        lockType: "REOPEN_REQUEST",
        lockedById: user.id,
        reason: `Reopen from ${versionId}: ${reason}`,
      },
    });
    await FpaAuditService.log("VERSION_REQUEST_REOPEN", user.id, {
      modelId: version.modelId,
      versionId,
      reason,
      newValue: copy.id,
      ip,
    });

    return {
      sourceVersionId: versionId,
      workingCopyVersionId: copy.id,
      cellsCopied: rows.length,
      message: "New working copy created; locked version remains locked.",
      reason,
    };
  }

  static async publish(versionId: string, user: any, body: any = {}, ip?: string) {
    FpaAccessService.assertCanApprove(user);
    const version = await prisma.planningVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new FpaError(404, "NOT_FOUND", "Version not found");

    const { FpaModuleService } = await import("./FpaModuleService");
    const validation = await FpaModuleService.enrichedValidate(version.modelId);
    const blocking = (validation.errors || []).filter((i: any) => String(i.severity || "ERROR").toUpperCase() === "ERROR");
    // Explicit setup codes always block publish (even when soft-validated as WARNING for Detailed drafts)
    const SETUP_BLOCK = new Set([
      "MISSING_SCOPE",
      "MISSING_COA",
      "MISSING_DIMENSION",
      "MISSING_NAME",
      "NO_LINE_ITEMS",
      "MISSING_VERSION",
      "CIRCULAR_REFERENCE",
      "INVALID_FORMULA",
      "UNKNOWN_LINE_REF",
    ]);
    const setupBlocks = (validation.issues || []).filter(
      (i: any) => SETUP_BLOCK.has(String(i.code)) || i.blocksPublish === true
    );
    const setupBlockErrors = setupBlocks.filter((i: any) => {
      const code = String(i.code);
      if (SETUP_BLOCK.has(code) && (code === "MISSING_SCOPE" || code === "MISSING_COA" || i.blocksPublish)) {
        return true;
      }
      return String(i.severity || "ERROR").toUpperCase() === "ERROR";
    });
    if (!validation.passed || validation.circular || blocking.length || setupBlockErrors.length) {
      const errList = blocking.length
        ? blocking
        : setupBlockErrors.length
          ? setupBlockErrors
          : setupBlocks.filter((i: any) => String(i.severity).toUpperCase() === "ERROR");
      throw new FpaError(
        409,
        "PUBLISH_BLOCKED",
        "Fix validation errors before publishing",
        errList.map((i: any) => ({ code: i.code, message: i.message, step: i.category || i.type }))
      );
    }

    const checksum = await FpaModuleService.structureChecksum(version.modelId);
    const notes = body?.notes != null ? String(body.notes) : null;
    const publishedAt = new Date();

    const updatedVersion = await prisma.planningVersion.update({
      where: { id: versionId },
      data: {
        status: "LOCKED",
        lockedAt: publishedAt,
        lockedById: user.id,
        publishedAt,
        publishedById: user.id,
        checksum,
        publishNotes: notes,
      },
    });

    await prisma.planningCell.updateMany({
      where: { versionId },
      data: { isLocked: true, isEditable: false },
    });

    const model = await prisma.planningModel.update({
      where: { id: version.modelId },
      data: {
        status: "PUBLISHED",
        publishedAt,
        publishedById: user.id,
      },
    });

    await FpaAuditService.log("VERSION_PUBLISHED", user.id, {
      modelId: version.modelId,
      versionId,
      reason: notes || "Version published for Model Planning",
      newValue: checksum,
      ip,
    });

    const publisher = await prisma.user.findUnique({
      where: { id: user.id },
      select: { firstName: true, lastName: true, email: true },
    });
    const publishedByName = publisher
      ? [publisher.firstName, publisher.lastName].filter(Boolean).join(" ").trim() || publisher.email
      : null;

    // Always open a fresh DRAFT working copy so Builder is not stuck on the locked published version.
    const working = await FpaVersionService.createWorkingCopyFromLocked(
      updatedVersion.id,
      user,
      {
        name: `${version.name || "Version"} (working)`,
        reason: notes || "Auto working copy after publish",
      },
      ip
    );

    return {
      modelId: version.modelId,
      versionId: updatedVersion.id,
      publishedVersionId: updatedVersion.id,
      workingCopyVersionId: working.workingCopyVersionId,
      workingCopy: working.workingCopy,
      publishedBy: user.id,
      publishedById: user.id,
      publishedByName,
      publishedAt,
      checksum,
      status: model.status,
      versionStatus: updatedVersion.status,
      validationResult: {
        passed: validation.passed,
        errors: validation.errors || [],
        warnings: validation.warnings || [],
      },
      modulesChanged: [],
      lineItemsChanged: [],
      formulaChanges: [],
      mappingChanges: [],
      notes,
      message:
        "Published version is LOCKED. Switch Builder to workingCopyVersionId (new DRAFT) for further edits.",
    };
  }

  /**
   * Clone cells from a LOCKED (or any) version into a new DRAFT working copy.
   * Used by request-reopen and post-publish so FE can keep editing.
   */
  static async createWorkingCopyFromLocked(
    sourceVersionId: string,
    user: any,
    opts: { name?: string; reason?: string } = {},
    ip?: string
  ) {
    const version = await prisma.planningVersion.findUnique({ where: { id: sourceVersionId } });
    if (!version) throw new FpaError(404, "NOT_FOUND", "Version not found");

    const copy = await prisma.planningVersion.create({
      data: {
        modelId: version.modelId,
        name:
          opts.name ||
          `${version.name} (working ${new Date().toISOString().slice(0, 10)})`,
        status: "DRAFT",
        createdById: user.id,
      },
    });

    const sourceCells = await prisma.planningCell.findMany({ where: { versionId: sourceVersionId } });
    const rows = sourceCells.map((c) => ({
      modelId: c.modelId,
      scenarioId: c.scenarioId,
      versionId: copy.id,
      lineItemId: c.lineItemId,
      periodDate: c.periodDate,
      departmentId: c.departmentId,
      entityId: c.entityId,
      currencyCode: c.currencyCode,
      value: c.value,
      valueType: c.valueType,
      sourceType: c.sourceType,
      formulaId: c.formulaId,
      driverId: c.driverId,
      isEditable: true,
      isLocked: false,
      recordVersion: BigInt(1),
    }));
    if (rows.length) {
      for (let i = 0; i < rows.length; i += 500) {
        await prisma.planningCell.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
      }
    }

    await FpaAuditService.log("VERSION_WORKING_COPY", user.id, {
      modelId: version.modelId,
      versionId: sourceVersionId,
      reason: opts.reason || "Working copy created",
      newValue: copy.id,
      ip,
    });

    return {
      sourceVersionId,
      workingCopyVersionId: copy.id,
      workingCopy: copy,
      cellsCopied: rows.length,
    };
  }

  /** Refresh grid preview for a version (Builder test calc). */
  static async testCalculation(versionId: string, input: any = {}, user: any) {
    FpaAccessService.assertCanApprove(user);
    const version = await prisma.planningVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new FpaError(404, "NOT_FOUND", "Version not found");
    const scenarioId =
      input?.scenarioId ||
      (
        await prisma.planningScenario.findFirst({
          where: { modelId: version.modelId },
          orderBy: { createdAt: "asc" },
        })
      )?.id;
    const { FpaGridService } = await import("./FpaGridService");
    const grid = await FpaGridService.getGrid(
      version.modelId,
      {
        versionId,
        scenarioId,
        moduleId: input?.moduleId,
        pageSize: input?.pageSize || 500,
      },
      user
    );
    return {
      versionId,
      scenarioId: scenarioId || null,
      calculatedAt: new Date().toISOString(),
      message: "Calculation preview refreshed",
      grid,
    };
  }

  static async archive(versionId: string, user: any, ip?: string) {
    const userId = typeof user === "string" ? user : user?.id;
    const version = await prisma.planningVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new FpaError(404, "NOT_FOUND", "Version not found");
    const updated = await prisma.planningVersion.update({
      where: { id: versionId },
      data: { status: "ARCHIVED" },
    });
    await FpaAuditService.log("VERSION_ARCHIVE", userId, { modelId: version.modelId, versionId, ip });
    return updated;
  }
}
