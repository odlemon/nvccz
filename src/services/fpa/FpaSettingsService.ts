// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaAccessService } from "./FpaAccessService";
import { FpaError } from "./FpaError";

const DEFAULT_VARIANCE = {
  commentaryThresholdPct: 5,
  enforceCommentary: true,
  blockSubmitWithoutCommentary: false,
};

const DEFAULT_WORKFLOW = {
  path: "LINEAR",
  requireCfoSignature: true,
  allowRerunAfterReturn: true,
};

function assertManage(user: any) {
  FpaAccessService.assertCanApprove(user);
}

function serializeSource(source: any) {
  return {
    id: source.id,
    label: source.label,
    status: source.status,
    lastSyncAt: source.lastSyncAt || null,
    lastError: source.lastError || null,
  };
}

export class FpaSettingsService {
  static async ensureDefaults() {
    const settings = await prisma.fpaSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        varianceJson: DEFAULT_VARIANCE,
        workflowJson: DEFAULT_WORKFLOW,
      },
      update: {},
    });
    await prisma.fpaSyncSource.upsert({
      where: { id: "netsuite" },
      create: {
        id: "netsuite",
        label: "NetSuite",
        status: "DISCONNECTED",
      },
      update: {},
    });
    return settings;
  }

  static async get() {
    const settings = await FpaSettingsService.ensureDefaults();
    const syncSources = await prisma.fpaSyncSource.findMany({
      orderBy: { label: "asc" },
    });
    return {
      variance: { ...DEFAULT_VARIANCE, ...((settings.varianceJson as any) || {}) },
      workflow: { ...DEFAULT_WORKFLOW, ...((settings.workflowJson as any) || {}) },
      syncSources: syncSources.map(serializeSource),
    };
  }

  static async update(body: any, user: any) {
    assertManage(user);
    const current = await FpaSettingsService.get();
    const variance = {
      ...current.variance,
      ...(body?.variance || {}),
    };
    const workflow = {
      ...current.workflow,
      ...(body?.workflow || {}),
    };
    const threshold = Number(variance.commentaryThresholdPct);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      throw new FpaError(
        400,
        "VALIDATION",
        "variance.commentaryThresholdPct must be between 0 and 100"
      );
    }
    if (String(workflow.path || "").toUpperCase() !== "LINEAR") {
      throw new FpaError(400, "VALIDATION", "workflow.path must be LINEAR");
    }
    const boolFields = [
      ["variance.enforceCommentary", variance.enforceCommentary],
      ["variance.blockSubmitWithoutCommentary", variance.blockSubmitWithoutCommentary],
      ["workflow.requireCfoSignature", workflow.requireCfoSignature],
      ["workflow.allowRerunAfterReturn", workflow.allowRerunAfterReturn],
    ];
    for (const [field, value] of boolFields) {
      if (typeof value !== "boolean") {
        throw new FpaError(400, "VALIDATION", `${field} must be boolean`);
      }
    }
    await prisma.fpaSettings.update({
      where: { id: "default" },
      data: {
        varianceJson: {
          commentaryThresholdPct: threshold,
          enforceCommentary: variance.enforceCommentary,
          blockSubmitWithoutCommentary: variance.blockSubmitWithoutCommentary,
        },
        workflowJson: {
          path: "LINEAR",
          requireCfoSignature: workflow.requireCfoSignature,
          allowRerunAfterReturn: workflow.allowRerunAfterReturn,
        },
        updatedById: user.id,
      },
    });
    return FpaSettingsService.get();
  }

  static async source(sourceId: string) {
    await FpaSettingsService.ensureDefaults();
    const source = await prisma.fpaSyncSource.findUnique({ where: { id: sourceId } });
    if (!source) throw new FpaError(404, "SOURCE_NOT_FOUND", "Sync source not found");
    return source;
  }

  static async connect(sourceId: string, body: any, user: any) {
    assertManage(user);
    const source = await FpaSettingsService.source(sourceId);
    if (source.status === "SYNCING") {
      throw new FpaError(409, "SYNC_IN_PROGRESS", "Source is currently syncing");
    }
    const updated = await prisma.fpaSyncSource.update({
      where: { id: sourceId },
      data: {
        status: "CONNECTED",
        lastError: null,
        configJson: body?.config || source.configJson || undefined,
        updatedById: user.id,
      },
    });
    return serializeSource(updated);
  }

  static async disconnect(sourceId: string, user: any) {
    assertManage(user);
    const source = await FpaSettingsService.source(sourceId);
    if (source.status === "SYNCING") {
      throw new FpaError(409, "SYNC_IN_PROGRESS", "Source is currently syncing");
    }
    const updated = await prisma.fpaSyncSource.update({
      where: { id: sourceId },
      data: {
        status: "DISCONNECTED",
        lastError: null,
        updatedById: user.id,
      },
    });
    return serializeSource(updated);
  }

  static async sync(sourceId: string, user: any) {
    assertManage(user);
    const source = await FpaSettingsService.source(sourceId);
    if (source.status === "SYNCING") {
      throw new FpaError(409, "SYNC_IN_PROGRESS", "Source is currently syncing");
    }
    if (source.status !== "CONNECTED") {
      throw new FpaError(409, "INVALID_STATUS", "Connect the source before syncing");
    }

    await prisma.fpaSyncSource.update({
      where: { id: sourceId },
      data: { status: "SYNCING", lastError: null, updatedById: user.id },
    });

    // No external NetSuite connector is configured in this service. Return an honest
    // connector failure instead of reporting a fabricated successful import.
    const message = "Connector is not configured for server-side sync";
    const failed = await prisma.fpaSyncSource.update({
      where: { id: sourceId },
      data: {
        status: "ERROR",
        lastError: message,
        updatedById: user.id,
      },
    });
    throw new FpaError(502, "SYNC_FAILED", message, undefined, {
      source: serializeSource(failed),
    });
  }
}
