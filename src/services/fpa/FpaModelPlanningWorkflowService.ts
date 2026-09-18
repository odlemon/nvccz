// @ts-nocheck
/**
 * Model Planning Cycle workflow — Stages 6–9 (submit → review → CFO → lock).
 */
import { prisma } from "../../utils/database";
import { FpaAuditService } from "./FpaAuditService";
import { FpaAccessService } from "./FpaAccessService";
import { FpaModelPlanningError, FpaModelPlanningCycleService } from "./FpaModelPlanningCycleService";
import { PerformanceFpaBridge } from "../PerformanceFpaBridge";

function assertFpa(user: any) {
  FpaAccessService.assertCanApprove(user);
}

function assertCfo(user: any) {
  FpaAccessService.assertCanApprove(user);
}

function assertLock(user: any) {
  FpaAccessService.assertCanLock(user);
}

async function loadCycle(cycleId: string) {
  const cycle = await prisma.modelPlanningCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) throw new FpaModelPlanningError("Model planning cycle not found", 404, "NOT_FOUND");
  return cycle;
}

async function openOwnerSlices(
  cycleId: string,
  departmentId: string | null,
  taskId: string | null,
  comment: string,
  actorId: string
) {
  const where: any = { cycleId };
  if (departmentId) where.departmentId = departmentId;
  if (taskId) where.taskId = taskId;
  const owners = await prisma.modelPlanningCycleOwner.findMany({ where });
  if ((taskId || departmentId) && owners.length === 0) {
    throw new FpaModelPlanningError(
      "Task is not an owner slice on this model planning cycle",
      404,
      "TASK_NOT_FOUND"
    );
  }
  const cycle = await loadCycle(cycleId);
  for (const o of owners) {
    await prisma.modelPlanningCycleOwner.update({
      where: { id: o.id },
      data: { status: "RETURNED" },
    });
    if (o.taskId) {
      await prisma.planningTask.update({
        where: { id: o.taskId },
        data: { status: "RETURNED", submittedAt: null },
      });
      const { FpaPlanningPmTaskBridge } = await import("./FpaPlanningPmTaskBridge");
      await FpaPlanningPmTaskBridge.syncStatus(o.taskId, "RETURNED");
      await prisma.planningComment.create({
        data: {
          modelId: cycle.sourceModelId,
          cycleId,
          body: comment,
          createdById: actorId,
          taskId: o.taskId,
        },
      });
    }
  }
}

export class FpaModelPlanningWorkflowService {
  /** Consolidate after owner slices — Stage 6. */
  static async submitCycle(cycleId: string, body: any, user: any, ip?: string) {
    assertFpa(user);
    const cycle = await loadCycle(cycleId);
    const status = String(cycle.status || "").toUpperCase();
    if (["SUBMITTED", "UNDER_REVIEW", "IN_REVIEW", "APPROVED", "LOCKED"].includes(status)) {
      throw new FpaModelPlanningError("Cycle already submitted or beyond submit", 409, "ALREADY_SUBMITTED");
    }
    if (!["OPEN", "DRAFT", "RETURNED_FOR_CORRECTION"].includes(status)) {
      throw new FpaModelPlanningError(`Cannot submit from ${status}`, 409, "INVALID_STATUS");
    }

    const owners = await prisma.modelPlanningCycleOwner.findMany({ where: { cycleId } });
    const open = owners.filter((o) => !["SUBMITTED", "APPROVED"].includes(String(o.status).toUpperCase()));
    if (open.length) {
      throw new FpaModelPlanningError(
        `${open.length} owner slice(s) still open`,
        409,
        "CYCLE_NOT_READY",
        {
          blockers: open.map((owner) => ({
            type: "OWNER_SLICE",
            ownerId: owner.id,
            departmentId: owner.departmentId,
            taskId: owner.taskId,
            status: owner.status,
          })),
        }
      );
    }

    const updated = await prisma.modelPlanningCycle.update({
      where: { id: cycleId },
      data: {
        status: "SUBMITTED",
        currentStage: "FPA_REVIEW",
        submittedAt: new Date(),
        submittedById: user.id,
        updatedById: user.id,
      },
    });

    if (cycle.workflowId) {
      await prisma.planningWorkflow.update({
        where: { id: cycle.workflowId },
        data: { stage: "FPA_REVIEW" },
      });
      await prisma.planningApproval.create({
        data: {
          workflowId: cycle.workflowId,
          actorId: user.id,
          action: "MPC_SUBMIT",
          comment: body?.note || body?.comment || null,
        },
      });
    }

    await FpaAuditService.log("MODEL_PLANNING_CYCLE_SUBMIT", user.id, {
      modelId: cycle.sourceModelId,
      versionId: cycle.sourceModelVersionId,
      entityType: "ModelPlanningCycle",
      entityId: cycleId,
      reason: body?.note || body?.comment || null,
      ip,
    });
    return FpaModelPlanningCycleService.get(cycleId);
  }

  static async reviewAccept(cycleId: string, body: any, user: any, ip?: string) {
    assertFpa(user);
    const cycle = await loadCycle(cycleId);
    const status = String(cycle.status || "").toUpperCase();
    if (!["SUBMITTED", "IN_REVIEW"].includes(status)) {
      throw new FpaModelPlanningError(`Cannot review-accept from ${status}`, 409, "INVALID_STATUS");
    }

    await prisma.modelPlanningCycle.update({
      where: { id: cycleId },
      data: {
        status: "UNDER_REVIEW",
        currentStage: "CFO_REVIEW",
        updatedById: user.id,
      },
    });

    if (cycle.workflowId) {
      await prisma.planningWorkflow.update({
        where: { id: cycle.workflowId },
        data: { stage: "CFO_REVIEW" },
      });
      await prisma.planningApproval.create({
        data: {
          workflowId: cycle.workflowId,
          actorId: user.id,
          action: "MPC_REVIEW_ACCEPT",
          comment: body?.comment || null,
        },
      });
    }

    await FpaAuditService.log("MODEL_PLANNING_REVIEW_ACCEPT", user.id, {
      modelId: cycle.sourceModelId,
      entityType: "ModelPlanningCycle",
      entityId: cycleId,
      ip,
    });
    return FpaModelPlanningCycleService.get(cycleId);
  }

  static async reviewReturn(cycleId: string, body: any, user: any, ip?: string) {
    assertFpa(user);
    const comment = String(body?.comment || "").trim();
    if (!comment) throw new FpaModelPlanningError("comment is required", 400, "VALIDATION");
    const cycle = await loadCycle(cycleId);
    const status = String(cycle.status || "").toUpperCase();
    if (!["SUBMITTED", "IN_REVIEW", "UNDER_REVIEW"].includes(status)) {
      throw new FpaModelPlanningError(`Cannot review-return from ${status}`, 409, "INVALID_STATUS");
    }

    await openOwnerSlices(
      cycleId,
      body?.departmentId ? String(body.departmentId) : null,
      body?.taskId ? String(body.taskId) : null,
      comment,
      user.id
    );

    await prisma.modelPlanningCycle.update({
      where: { id: cycleId },
      data: {
        status: "RETURNED_FOR_CORRECTION",
        currentStage: "OWNER_INPUT",
        updatedById: user.id,
      },
    });

    if (cycle.workflowId) {
      await prisma.planningWorkflow.update({
        where: { id: cycle.workflowId },
        data: { stage: "OWNER_INPUT" },
      });
      await prisma.planningApproval.create({
        data: {
          workflowId: cycle.workflowId,
          actorId: user.id,
          action: "MPC_REVIEW_RETURN",
          comment,
        },
      });
    }

    await FpaAuditService.log("MODEL_PLANNING_REVIEW_RETURN", user.id, {
      modelId: cycle.sourceModelId,
      entityType: "ModelPlanningCycle",
      entityId: cycleId,
      reason: comment,
      ip,
    });
    return FpaModelPlanningCycleService.get(cycleId);
  }

  static async cfoApprove(cycleId: string, body: any, user: any, ip?: string) {
    assertCfo(user);
    const cycle = await loadCycle(cycleId);
    const status = String(cycle.status || "").toUpperCase();
    if (!["UNDER_REVIEW", "IN_REVIEW", "SUBMITTED"].includes(status)) {
      throw new FpaModelPlanningError(`Cannot cfo-approve from ${status}`, 409, "INVALID_STATUS");
    }
    if (cycle.submittedById && cycle.submittedById === user.id) {
      throw new FpaModelPlanningError("Maker cannot approve their own submission", 409, "MAKER_CHECKER");
    }

    await prisma.modelPlanningCycle.update({
      where: { id: cycleId },
      data: {
        status: "APPROVED",
        currentStage: "APPROVED",
        approvedAt: new Date(),
        approvedById: user.id,
        updatedById: user.id,
      },
    });

    if (cycle.workflowId) {
      await prisma.planningWorkflow.update({
        where: { id: cycle.workflowId },
        data: { stage: "APPROVED" },
      });
      await prisma.planningApproval.create({
        data: {
          workflowId: cycle.workflowId,
          actorId: user.id,
          action: "MPC_CFO_APPROVE",
          comment: body?.comment || null,
        },
      });
    }

    await FpaAuditService.log("MODEL_PLANNING_CFO_APPROVE", user.id, {
      modelId: cycle.sourceModelId,
      entityType: "ModelPlanningCycle",
      entityId: cycleId,
      reason: body?.comment || null,
      scenarioId: body?.scenarioId || null,
      ip,
    });
    return FpaModelPlanningCycleService.get(cycleId);
  }

  static async cfoReturn(cycleId: string, body: any, user: any, ip?: string) {
    assertCfo(user);
    const comment = String(body?.comment || "").trim();
    if (!comment) throw new FpaModelPlanningError("comment is required", 400, "VALIDATION");
    const cycle = await loadCycle(cycleId);
    const status = String(cycle.status || "").toUpperCase();
    if (!["UNDER_REVIEW", "IN_REVIEW", "SUBMITTED"].includes(status)) {
      throw new FpaModelPlanningError(`Cannot cfo-return from ${status}`, 409, "INVALID_STATUS");
    }

    await openOwnerSlices(
      cycleId,
      body?.departmentId ? String(body.departmentId) : null,
      body?.taskId ? String(body.taskId) : null,
      comment,
      user.id
    );

    await prisma.modelPlanningCycle.update({
      where: { id: cycleId },
      data: {
        status: "RETURNED_FOR_CORRECTION",
        currentStage: "OWNER_INPUT",
        updatedById: user.id,
      },
    });

    if (cycle.workflowId) {
      await prisma.planningWorkflow.update({
        where: { id: cycle.workflowId },
        data: { stage: "OWNER_INPUT" },
      });
      await prisma.planningApproval.create({
        data: {
          workflowId: cycle.workflowId,
          actorId: user.id,
          action: "MPC_CFO_RETURN",
          comment,
        },
      });
    }

    await FpaAuditService.log("MODEL_PLANNING_CFO_RETURN", user.id, {
      modelId: cycle.sourceModelId,
      entityType: "ModelPlanningCycle",
      entityId: cycleId,
      reason: comment,
      ip,
    });
    return FpaModelPlanningCycleService.get(cycleId);
  }

  static async lock(cycleId: string, body: any, user: any, ip?: string) {
    assertLock(user);
    const cycle = await loadCycle(cycleId);
    const status = String(cycle.status || "").toUpperCase();
    if (!["APPROVED"].includes(status)) {
      throw new FpaModelPlanningError(`Cannot lock from ${status} — approve first`, 409, "INVALID_STATUS");
    }

    const lockedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const lockedCycle = await tx.modelPlanningCycle.update({
        where: { id: cycleId },
        data: {
          status: "LOCKED",
          currentStage: "LOCKED",
          lockedAt,
          lockedById: user.id,
          updatedById: user.id,
        },
      });
      await tx.planningVersion.update({
        where: { id: cycle.sourceModelVersionId },
        data: { status: "LOCKED", lockedAt },
      });
      if (cycle.workflowId) {
        await tx.planningWorkflow.update({
          where: { id: cycle.workflowId },
          data: { stage: "LOCKED" },
        });
        await tx.planningApproval.create({
          data: {
            workflowId: cycle.workflowId,
            actorId: user.id,
            action: "MPC_LOCK",
            comment: body?.reason || null,
          },
        });
      }
      return lockedCycle;
    });

    await FpaAuditService.log("MODEL_PLANNING_CYCLE_LOCK", user.id, {
      modelId: cycle.sourceModelId,
      versionId: cycle.sourceModelVersionId,
      entityType: "ModelPlanningCycle",
      entityId: cycleId,
      reason: body?.reason || null,
      ip,
    });
    // This path locks cycle.sourceModelVersionId directly (its own
    // transaction above) rather than going through FpaVersionService.lock(),
    // so the Performance <-> FP&A bridge (directions 1/3, SRD-4 §22) must be
    // fired here too — otherwise locking a budget cycle through the actual
    // UAT approval flow (submit -> review -> CFO approve -> lock) never
    // snapshots targets/forecasts into Performance at all.
    await PerformanceFpaBridge.onVersionLocked(cycle.sourceModelId, cycle.sourceModelVersionId);

    const full = await FpaModelPlanningCycleService.get(cycleId);
    return {
      ...full,
      versionId: cycle.sourceModelVersionId,
      lockedAt: updated.lockedAt,
      lockedById: updated.lockedById,
    };
  }

  static async requestReopen(cycleId: string, body: any, user: any, ip?: string) {
    assertFpa(user);
    const reason = String(body?.reason || "").trim();
    if (!reason) throw new FpaModelPlanningError("reason is required", 400, "VALIDATION");
    const cycle = await loadCycle(cycleId);
    if (String(cycle.status).toUpperCase() !== "LOCKED") {
      throw new FpaModelPlanningError("Only LOCKED cycles can request reopen", 409, "INVALID_STATUS");
    }

    await prisma.modelPlanningCycle.update({
      where: { id: cycleId },
      data: {
        status: "OPEN",
        currentStage: "OWNER_INPUT",
        lockedAt: null,
        lockedById: null,
        updatedById: user.id,
      },
    });

    try {
      await prisma.planningVersion.update({
        where: { id: cycle.sourceModelVersionId },
        data: { status: "DRAFT", lockedAt: null },
      });
    } catch {
      /* ignore */
    }

    await FpaAuditService.log("MODEL_PLANNING_REQUEST_REOPEN", user.id, {
      modelId: cycle.sourceModelId,
      entityType: "ModelPlanningCycle",
      entityId: cycleId,
      reason,
      ip,
    });
    return FpaModelPlanningCycleService.get(cycleId);
  }
}
