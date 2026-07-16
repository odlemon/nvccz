import { PrismaClient } from "@prisma/client";
import {
  FpaPlanningCycleContextService,
  periodStartIso,
  resolveCutoffPair,
  toPeriodStartDate,
  nextPeriodStart,
} from "./FpaPlanningCycleContextService";
import { FpaAuditService } from "./FpaAuditService";
import { FpaModelPlanningOwnersService } from "./FpaModelPlanningOwnersService";

const prisma = new PrismaClient();

/** Serialize cycle dates as period-start ISO (`YYYY-MM-01`) for FE banding/header. */
async function serializeCycle(cycle: any) {
  if (!cycle) return cycle;
  const actualsCutoffPeriod = periodStartIso(cycle.actualsCutoffPeriod);
  let forecastStartPeriod = periodStartIso(cycle.forecastStartPeriod);
  if (!forecastStartPeriod && cycle.actualsCutoffPeriod) {
    const cut = toPeriodStartDate(cycle.actualsCutoffPeriod);
    if (cut) forecastStartPeriod = periodStartIso(nextPeriodStart(cut));
  }
  const owners = await FpaModelPlanningOwnersService.enrichOwners(cycle.id);
  return {
    ...cycle,
    cycle_name: cycle.name,
    actualsCutoffPeriod,
    forecastStartPeriod,
    submissionDeadline: periodStartIso(cycle.submissionDeadline) || cycle.submissionDeadline,
    owners,
  };
}

const MODEL_PLANNING_TYPES = [
  "ANNUAL_BUDGET",
  "ROLLING_FORECAST",
  "QUARTERLY_FORECAST",
  "LONG_RANGE_PLAN",
  "STRATEGIC_PLAN",
  "REFORECAST",
] as const;

export const MODEL_PLANNING_STATUSES = [
  "DRAFT",
  "OPEN",
  "IN_REVIEW",
  "APPROVED",
  "LOCKED",
  "CLOSED",
] as const;

type PlanningType = (typeof MODEL_PLANNING_TYPES)[number];
type PlanningStatus = (typeof MODEL_PLANNING_STATUSES)[number];

const STATUS_TRANSITIONS: Record<PlanningStatus, PlanningStatus[]> = {
  DRAFT: ["DRAFT", "OPEN"],
  OPEN: ["OPEN", "IN_REVIEW", "CLOSED"],
  IN_REVIEW: ["IN_REVIEW", "OPEN", "APPROVED"],
  APPROVED: ["APPROVED", "LOCKED"],
  LOCKED: ["LOCKED", "CLOSED"],
  CLOSED: ["CLOSED"],
};

const IMMUTABLE_STATUSES: PlanningStatus[] = ["APPROVED", "LOCKED", "CLOSED"];

function assertStatusTransition(from: string, to: string) {
  const current = String(from || "DRAFT").toUpperCase() as PlanningStatus;
  const next = String(to).toUpperCase() as PlanningStatus;
  if (!MODEL_PLANNING_STATUSES.includes(next)) {
    throw new FpaModelPlanningError(
      `Invalid status. Allowed: ${MODEL_PLANNING_STATUSES.join(", ")}`,
      400,
      "INVALID_STATUS"
    );
  }
  const allowed = STATUS_TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    throw new FpaModelPlanningError(
      `Invalid status transition from ${current} to ${next}`,
      409,
      "INVALID_STATUS_TRANSITION"
    );
  }
}

async function assertPublishedSourceVersion(versionId: string, modelId: string) {
  const version = await prisma.planningVersion.findUnique({ where: { id: versionId } });
  if (!version) {
    throw new FpaModelPlanningError("Source model version not found", 404, "SOURCE_VERSION_NOT_FOUND");
  }
  if (version.modelId !== modelId) {
    throw new FpaModelPlanningError(
      "Source model version does not belong to the selected model",
      400,
      "VERSION_MODEL_MISMATCH"
    );
  }
  if (!FpaPlanningCycleContextService.isPublishedVersionStatus(version.status)) {
    throw new FpaModelPlanningError(
      "Source model version must be published (LOCKED). Publish the model in Model Builder first.",
      400,
      "SOURCE_VERSION_NOT_PUBLISHED"
    );
  }
  return version;
}

export class FpaModelPlanningCycleService {
  static MODEL_PLANNING_TYPES = MODEL_PLANNING_TYPES;
  static MODEL_PLANNING_STATUSES = MODEL_PLANNING_STATUSES;

  static async list(query: Record<string, unknown> = {}, _user: Record<string, unknown> = {}) {
    const where: Record<string, unknown> = {};
    if (query.modelId) where.sourceModelId = query.modelId;
    if (query.planningType) where.planningType = query.planningType;
    if (query.status) where.status = query.status;
    if (query.ownerId) where.planningOwnerId = query.ownerId;

    const [items, total] = await Promise.all([
      prisma.modelPlanningCycle.findMany({
        where,
        orderBy: [{ financialYear: "desc" }, { createdAt: "desc" }],
      }),
      prisma.modelPlanningCycle.count({ where }),
    ]);

    return {
      items: await Promise.all(items.map(serializeCycle)),
      total,
      count: items.length,
    };
  }

  static async create(body: Record<string, unknown> = {}, userId: string, ip: string) {
    const name = body.name != null ? String(body.name).trim() : "";
    if (!name) {
      throw new FpaModelPlanningError("Planning cycle name is required", 400, "NAME_REQUIRED");
    }
    if (body.financialYear == null || Number.isNaN(Number(body.financialYear))) {
      throw new FpaModelPlanningError("Financial year is required", 400, "FINANCIAL_YEAR_REQUIRED");
    }
    if (!body.planningType) {
      throw new FpaModelPlanningError("Planning type is required", 400, "PLANNING_TYPE_REQUIRED");
    }
    const planningType = String(body.planningType) as PlanningType;
    if (!MODEL_PLANNING_TYPES.includes(planningType)) {
      throw new FpaModelPlanningError(
        `Invalid planning type. Allowed: ${MODEL_PLANNING_TYPES.join(", ")}`,
        400,
        "INVALID_PLANNING_TYPE"
      );
    }
    if (!body.sourceModelId) {
      throw new FpaModelPlanningError("Source model is required", 400, "SOURCE_MODEL_REQUIRED");
    }
    if (!body.sourceModelVersionId) {
      throw new FpaModelPlanningError("Source model version is required", 400, "SOURCE_VERSION_REQUIRED");
    }

    const sourceModelId = String(body.sourceModelId);
    const sourceModelVersionId = String(body.sourceModelVersionId);

    const model = await prisma.planningModel.findUnique({ where: { id: sourceModelId } });
    if (!model) {
      throw new FpaModelPlanningError("Source model not found", 404, "SOURCE_MODEL_NOT_FOUND");
    }

    await assertPublishedSourceVersion(sourceModelVersionId, model.id);

    if (body.baseScenarioId) {
      const scenario = await prisma.planningScenario.findUnique({
        where: { id: String(body.baseScenarioId) },
      });
      if (!scenario || scenario.modelId !== model.id) {
        throw new FpaModelPlanningError(
          "Base scenario not found for the selected model",
          400,
          "BASE_SCENARIO_INVALID"
        );
      }
    }

    const ownersIn = Array.isArray(body.owners) ? body.owners : [];
    if (ownersIn.length < 1) {
      throw new FpaModelPlanningError(
        "At least one owner with departmentId and assigneeId is required",
        400,
        "NO_OWNERS"
      );
    }

    const cutoffs = resolveCutoffPair({
      actualsCutoffPeriod: body.actualsCutoffPeriod,
      forecastStartPeriod: body.forecastStartPeriod,
    });

    const cycle = await prisma.modelPlanningCycle.create({
      data: {
        name,
        financialYear: Number(body.financialYear),
        planningType,
        sourceModelId,
        sourceModelVersionId,
        actualsCutoffPeriod: cutoffs.actualsCutoffPeriod,
        forecastStartPeriod: cutoffs.forecastStartPeriod,
        planningHorizon: body.planningHorizon != null ? Number(body.planningHorizon) : null,
        baseScenarioId: body.baseScenarioId ? String(body.baseScenarioId) : null,
        submissionDeadline: body.submissionDeadline
          ? toPeriodStartDate(body.submissionDeadline) || new Date(String(body.submissionDeadline))
          : null,
        approvalWorkflowId: body.approvalWorkflowId ? String(body.approvalWorkflowId) : null,
        planningOwnerId: body.planningOwnerId ? String(body.planningOwnerId) : userId,
        status: "DRAFT",
        createdById: userId,
        updatedById: userId,
      },
    });

    await FpaModelPlanningOwnersService.replaceOwners(cycle, ownersIn, userId, ip);

    await FpaAuditService.log("MODEL_PLANNING_CYCLE_CREATE", userId, {
      modelId: cycle.sourceModelId,
      versionId: cycle.sourceModelVersionId,
      entityType: "ModelPlanningCycle",
      entityId: cycle.id,
      reason: JSON.stringify({ name: cycle.name, planningType: cycle.planningType }),
      ip,
    });

    const refreshed = await prisma.modelPlanningCycle.findUnique({ where: { id: cycle.id } });
    return await serializeCycle(refreshed);
  }

  static async get(id: string) {
    const cycle = await prisma.modelPlanningCycle.findUnique({ where: { id } });
    if (!cycle) {
      throw new FpaModelPlanningError("Model planning cycle not found", 404, "NOT_FOUND");
    }
    return await serializeCycle(cycle);
  }

  /** Raw Prisma row (for internal guards). */
  static async getRaw(id: string) {
    const cycle = await prisma.modelPlanningCycle.findUnique({ where: { id } });
    if (!cycle) {
      throw new FpaModelPlanningError("Model planning cycle not found", 404, "NOT_FOUND");
    }
    return cycle;
  }

  static async update(id: string, body: Record<string, unknown> = {}, userId: string, ip: string) {
    const existing = await FpaModelPlanningCycleService.getRaw(id);
    const currentStatus = String(existing.status || "DRAFT").toUpperCase();

    if (body.planningType) {
      const planningType = String(body.planningType) as PlanningType;
      if (!MODEL_PLANNING_TYPES.includes(planningType)) {
        throw new FpaModelPlanningError(
          `Invalid planning type. Allowed: ${MODEL_PLANNING_TYPES.join(", ")}`,
          400,
          "INVALID_PLANNING_TYPE"
        );
      }
    }

    if (body.status != null) {
      assertStatusTransition(currentStatus, String(body.status));
    }

    const nextStatus = body.status != null ? String(body.status).toUpperCase() : currentStatus;
    const structuralFieldsTouched =
      body.sourceModelId != null ||
      body.sourceModelVersionId != null ||
      body.baseScenarioId != null ||
      body.planningType != null ||
      body.financialYear != null;

    if (structuralFieldsTouched && IMMUTABLE_STATUSES.includes(nextStatus as PlanningStatus)) {
      throw new FpaModelPlanningError(
        "Cannot change model, version, or planning type on an approved/locked/closed cycle",
        409,
        "CYCLE_IMMUTABLE"
      );
    }

    const sourceModelId = body.sourceModelId != null ? String(body.sourceModelId) : existing.sourceModelId;
    if (body.sourceModelVersionId && body.sourceModelVersionId !== existing.sourceModelVersionId) {
      await assertPublishedSourceVersion(String(body.sourceModelVersionId), sourceModelId);
    }

    if (body.baseScenarioId) {
      const scenario = await prisma.planningScenario.findUnique({
        where: { id: String(body.baseScenarioId) },
      });
      if (!scenario || scenario.modelId !== sourceModelId) {
        throw new FpaModelPlanningError(
          "Base scenario not found for the selected model",
          400,
          "BASE_SCENARIO_INVALID"
        );
      }
    }

    let actualsCutoffPeriod: Date | null | undefined = undefined;
    let forecastStartPeriod: Date | null | undefined = undefined;
    if (body.actualsCutoffPeriod !== undefined || body.forecastStartPeriod !== undefined) {
      const cutoffs = resolveCutoffPair({
        actualsCutoffPeriod:
          body.actualsCutoffPeriod !== undefined
            ? body.actualsCutoffPeriod
            : existing.actualsCutoffPeriod,
        forecastStartPeriod:
          body.forecastStartPeriod !== undefined
            ? body.forecastStartPeriod
            : body.actualsCutoffPeriod !== undefined
              ? null // re-derive from new cutoff unless FE also sent forecast
              : existing.forecastStartPeriod,
      });
      // If only forecastStart changed, keep existing cutoff and use provided forecast
      if (body.actualsCutoffPeriod === undefined && body.forecastStartPeriod !== undefined) {
        actualsCutoffPeriod = undefined;
        forecastStartPeriod = toPeriodStartDate(body.forecastStartPeriod);
      } else {
        actualsCutoffPeriod = cutoffs.actualsCutoffPeriod;
        forecastStartPeriod = cutoffs.forecastStartPeriod;
      }
    }

    const cycle = await prisma.modelPlanningCycle.update({
      where: { id },
      data: {
        name: body.name != null ? String(body.name).trim() : undefined,
        financialYear: body.financialYear != null ? Number(body.financialYear) : undefined,
        planningType: body.planningType ? String(body.planningType) : undefined,
        sourceModelId: body.sourceModelId ? String(body.sourceModelId) : undefined,
        sourceModelVersionId: body.sourceModelVersionId ? String(body.sourceModelVersionId) : undefined,
        actualsCutoffPeriod,
        forecastStartPeriod,
        planningHorizon: body.planningHorizon != null ? Number(body.planningHorizon) : undefined,
        baseScenarioId:
          body.baseScenarioId != null ? (body.baseScenarioId ? String(body.baseScenarioId) : null) : undefined,
        submissionDeadline:
          body.submissionDeadline != null
            ? body.submissionDeadline
              ? toPeriodStartDate(body.submissionDeadline) || new Date(String(body.submissionDeadline))
              : null
            : undefined,
        approvalWorkflowId:
          body.approvalWorkflowId != null
            ? body.approvalWorkflowId
              ? String(body.approvalWorkflowId)
              : null
            : undefined,
        planningOwnerId:
          body.planningOwnerId != null
            ? body.planningOwnerId
              ? String(body.planningOwnerId)
              : null
            : undefined,
        status: body.status != null ? String(body.status).toUpperCase() : undefined,
        updatedById: userId,
      },
    });

    await FpaAuditService.log("MODEL_PLANNING_CYCLE_UPDATE", userId, {
      modelId: cycle.sourceModelId,
      versionId: cycle.sourceModelVersionId,
      entityType: "ModelPlanningCycle",
      entityId: cycle.id,
      reason: JSON.stringify({ name: cycle.name, status: cycle.status }),
      ip,
    });

    if (Array.isArray(body.owners)) {
      await FpaModelPlanningOwnersService.replaceOwners(
        await prisma.modelPlanningCycle.findUniqueOrThrow({ where: { id } }),
        body.owners,
        userId,
        ip
      );
    }

    return await serializeCycle(await prisma.modelPlanningCycle.findUniqueOrThrow({ where: { id } }));
  }

  static async setOwners(id: string, body: any, userId: string, ip?: string) {
    return FpaModelPlanningOwnersService.setOwners(id, body, userId, ip);
  }

  static async ownerWorkspace(id: string, user: any) {
    return FpaModelPlanningOwnersService.ownerWorkspace(id, user);
  }

  static async remove(id: string, userId: string, ip: string) {
    const existing = await FpaModelPlanningCycleService.getRaw(id);
    if (existing.status !== "DRAFT") {
      throw new FpaModelPlanningError(
        "Only DRAFT model planning cycles can be deleted",
        409,
        "NOT_DELETABLE"
      );
    }

    await prisma.modelPlanningCycle.delete({ where: { id } });
    await FpaAuditService.log("MODEL_PLANNING_CYCLE_DELETE", userId, {
      modelId: existing.sourceModelId,
      versionId: existing.sourceModelVersionId,
      entityType: "ModelPlanningCycle",
      entityId: id,
      reason: JSON.stringify({ name: existing.name }),
      ip,
    });
    return { id, deleted: true };
  }

  /** Aggregates cycle + published source model so FE opens the planning worksheet grid. */
  static async workspace(id: string) {
    const cycleRaw = await FpaModelPlanningCycleService.getRaw(id);
    const cycle = await serializeCycle(cycleRaw);

    const [model, version, scenarios] = await Promise.all([
      prisma.planningModel.findUnique({ where: { id: cycleRaw.sourceModelId } }),
      prisma.planningVersion.findUnique({ where: { id: cycleRaw.sourceModelVersionId } }),
      prisma.planningScenario.findMany({ where: { modelId: cycleRaw.sourceModelId } }),
    ]);

    return {
      cycle,
      owners: cycle.owners,
      model,
      version,
      scenarios,
      actualsCutoffPeriod: cycle.actualsCutoffPeriod,
      forecastStartPeriod: cycle.forecastStartPeriod,
      grid: {
        modelId: cycleRaw.sourceModelId,
        versionId: cycleRaw.sourceModelVersionId,
        baseScenarioId: cycleRaw.baseScenarioId,
        cycleId: cycleRaw.id,
        actualCutoff: cycle.actualsCutoffPeriod,
        forecastStartPeriod: cycle.forecastStartPeriod,
      },
    };
  }

  /** Selection helpers for the create form (published versions only). */
  static async selectionSources(modelId?: string) {
    const models = await prisma.planningModel.findMany({
      where: modelId ? { id: modelId } : {},
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    });

    let versions: Array<{
      id: string;
      modelId: string;
      name: string;
      status: string;
      publishedAt: Date | null;
      createdAt: Date;
    }> = [];
    let scenarios: Array<{ id: string; modelId: string; name: string; scenarioType: string }> = [];

    if (modelId) {
      const allVersions = await prisma.planningVersion.findMany({
        where: { modelId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          modelId: true,
          name: true,
          status: true,
          publishedAt: true,
          createdAt: true,
        },
      });
      versions = allVersions.filter((v) =>
        FpaPlanningCycleContextService.isPublishedVersionStatus(v.status)
      );
      scenarios = await prisma.planningScenario.findMany({
        where: { modelId },
        select: { id: true, modelId: true, name: true, scenarioType: true },
      });
    }

    return {
      planningTypes: MODEL_PLANNING_TYPES,
      planningStatuses: MODEL_PLANNING_STATUSES,
      models,
      versions,
      scenarios,
    };
  }
}

export class FpaModelPlanningError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 500, code = "ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
