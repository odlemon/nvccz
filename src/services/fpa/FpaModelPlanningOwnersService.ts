import { PrismaClient } from "@prisma/client";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";
import { periodStartIso, toPeriodStartDate } from "./FpaPlanningCycleContextService";
import { FpaPlanningPmTaskBridge } from "./FpaPlanningPmTaskBridge";
import { FpaModelPlanningTasksService } from "./FpaModelPlanningTasksService";

const prisma = new PrismaClient();

function userDisplayName(u: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || null;
}

function mapOwnerStatus(ownerStatus: string, taskStatus?: string | null): string {
  const t = String(taskStatus || "").toUpperCase();
  if (t === "SUBMITTED") return "SUBMITTED";
  if (t === "RETURNED") return "RETURNED";
  if (t === "APPROVED") return "APPROVED";
  const o = String(ownerStatus || "OPEN").toUpperCase();
  if (o === "PENDING") return "OPEN";
  return o || "OPEN";
}

export class FpaModelPlanningOwnersService {
  static async validateOwnerRows(ownersIn: any[]) {
    if (!Array.isArray(ownersIn) || ownersIn.length < 1) {
      throw new FpaError(
        400,
        "NO_OWNERS",
        "At least one owner with departmentId and assigneeId is required"
      );
    }

    const deptIds = ownersIn.map((o) => String(o.departmentId || "")).filter(Boolean);
    const assigneeIds = ownersIn.map((o) => String(o.assigneeId || "")).filter(Boolean);
    if (deptIds.length !== ownersIn.length) {
      throw new FpaError(400, "UNKNOWN_DEPARTMENT", "Each owner requires departmentId");
    }
    if (assigneeIds.length !== ownersIn.length) {
      throw new FpaError(400, "UNKNOWN_ASSIGNEE", "Each owner requires assigneeId");
    }
    if (new Set(deptIds).size !== deptIds.length) {
      throw new FpaError(400, "DUPLICATE_DEPARTMENT", "Duplicate departmentId in owners[]");
    }

    const depts = await prisma.department.findMany({ where: { id: { in: deptIds } } });
    const deptOk = new Set(depts.map((d) => d.id));
    for (const id of deptIds) {
      if (!deptOk.has(id)) {
        throw new FpaError(400, "UNKNOWN_DEPARTMENT", `Department not found: ${id}`);
      }
    }

    const users = await prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const userOk = new Set(users.map((u) => u.id));
    for (const id of assigneeIds) {
      if (!userOk.has(id)) {
        throw new FpaError(400, "UNKNOWN_ASSIGNEE", `Assignee not found: ${id}`);
      }
    }

    return { depts, users };
  }

  static async enrichOwners(cycleId: string) {
    const owners = await prisma.modelPlanningCycleOwner.findMany({
      where: { cycleId },
      orderBy: { createdAt: "asc" },
    });
    if (!owners.length) return [];

    const deptIds = owners.map((o) => o.departmentId);
    const assigneeIds = owners.map((o) => o.assigneeId).filter(Boolean) as string[];
    const taskIds = owners.map((o) => o.taskId).filter(Boolean) as string[];

    const [depts, users, tasks] = await Promise.all([
      prisma.department.findMany({ where: { id: { in: deptIds } } }),
      assigneeIds.length
        ? prisma.user.findMany({
            where: { id: { in: assigneeIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : Promise.resolve([]),
      taskIds.length
        ? prisma.planningTask.findMany({ where: { id: { in: taskIds } } })
        : Promise.resolve([]),
    ]);

    const deptById = Object.fromEntries(depts.map((d) => [d.id, d]));
    const userById = Object.fromEntries(users.map((u) => [u.id, u]));
    const taskById = Object.fromEntries(tasks.map((t) => [t.id, t]));

    return owners.map((o) => {
      const task = o.taskId ? taskById[o.taskId] : null;
      const due = o.dueDate || task?.dueDate || null;
      return {
        id: o.id,
        departmentId: o.departmentId,
        departmentName: deptById[o.departmentId]?.name || null,
        assigneeId: o.assigneeId,
        assigneeName: userDisplayName(o.assigneeId ? userById[o.assigneeId] : null),
        taskId: o.taskId,
        status: mapOwnerStatus(o.status, task?.status),
        dueDate: periodStartIso(due) || (due ? String(due).slice(0, 10) : null),
      };
    });
  }

  /**
   * Create workflow + tasks + owner rows for a model planning cycle.
   * Caller should pass an existing cycle id (and usually run inside/after cycle create).
   */
  static async replaceOwners(
    cycle: {
      id: string;
      name: string;
      sourceModelId: string;
      sourceModelVersionId: string;
      baseScenarioId: string | null;
      submissionDeadline: Date | null;
      workflowId: string | null;
      status: string;
    },
    ownersIn: any[],
    userId: string,
    ip?: string
  ) {
    const { depts } = await FpaModelPlanningOwnersService.validateOwnerRows(ownersIn);

    let workflowId = cycle.workflowId;
    if (!workflowId) {
      const workflow = await prisma.planningWorkflow.create({
        data: {
          modelId: cycle.sourceModelId,
          name: `${cycle.name} — Model Planning`,
          workflowType: "MODEL_PLANNING",
          stage: "OWNER_INPUT",
          status: "ACTIVE",
          createdById: userId,
        },
      });
      workflowId = workflow.id;
      await prisma.modelPlanningCycle.update({
        where: { id: cycle.id },
        data: { workflowId, approvalWorkflowId: workflowId },
      });
    }

    const existing = await prisma.modelPlanningCycleOwner.findMany({ where: { cycleId: cycle.id } });
    const incomingDeptIds = new Set(ownersIn.map((o) => String(o.departmentId)));

    for (const old of existing) {
      if (!incomingDeptIds.has(old.departmentId)) {
        if (old.taskId) {
          await prisma.planningTask.update({
            where: { id: old.taskId },
            data: { status: "CANCELLED" },
          });
          await FpaPlanningPmTaskBridge.trashLinked(old.taskId);
        }
        await prisma.modelPlanningCycleOwner.delete({ where: { id: old.id } });
      }
    }

    for (const o of ownersIn) {
      const departmentId = String(o.departmentId);
      const assigneeId = String(o.assigneeId);
      const dept = depts.find((d) => d.id === departmentId);
      const dueDate =
        toPeriodStartDate(o.dueDate) ||
        toPeriodStartDate(cycle.submissionDeadline) ||
        null;
      const prev = existing.find((e) => e.departmentId === departmentId);
      const title = `${dept?.name || "Department"} planning input`;

      if (prev) {
        const assigneeChanged = String(prev.assigneeId || "") !== assigneeId;
        if (prev.taskId) {
          await prisma.planningTask.update({
            where: { id: prev.taskId },
            data: {
              assigneeId,
              dueDate,
              title,
              status: String(prev.status).toUpperCase() === "SUBMITTED" ? "SUBMITTED" : "PENDING",
            },
          });
          await FpaPlanningPmTaskBridge.upsertFromPlanningTask({
            planningTaskId: prev.taskId,
            title,
            assigneeId,
            departmentId,
            departmentName: dept?.name || null,
            dueDate,
            priority: "MEDIUM",
            status: String(prev.status).toUpperCase() === "SUBMITTED" ? "SUBMITTED" : "PENDING",
            cycleId: cycle.id,
            cycleName: cycle.name,
            modelId: cycle.sourceModelId,
            versionId: cycle.sourceModelVersionId,
            taskKind: "OWNER_SLICE",
            createdById: userId,
          });
          if (assigneeChanged) {
            await FpaModelPlanningTasksService.notifyAssignee({
              cycle,
              task: { id: prev.taskId, title, assigneeId },
              actorId: userId,
              departmentName: dept?.name || null,
            });
          }
        }
        await prisma.modelPlanningCycleOwner.update({
          where: { id: prev.id },
          data: {
            assigneeId,
            dueDate,
            status: String(prev.status).toUpperCase() === "SUBMITTED" ? "SUBMITTED" : "OPEN",
          },
        });
      } else {
        const task = await prisma.planningTask.create({
          data: {
            workflowId: workflowId!,
            title,
            departmentId,
            assigneeId,
            status: "PENDING",
            priority: "MEDIUM",
            dueDate,
          },
        });
        await prisma.modelPlanningCycleOwner.create({
          data: {
            cycleId: cycle.id,
            departmentId,
            assigneeId,
            taskId: task.id,
            dueDate,
            status: "OPEN",
          },
        });
        await FpaPlanningPmTaskBridge.upsertFromPlanningTask({
          planningTaskId: task.id,
          title,
          assigneeId,
          departmentId,
          departmentName: dept?.name || null,
          dueDate,
          priority: "MEDIUM",
          status: "PENDING",
          cycleId: cycle.id,
          cycleName: cycle.name,
          modelId: cycle.sourceModelId,
          versionId: cycle.sourceModelVersionId,
          taskKind: "OWNER_SLICE",
          createdById: userId,
          skipLookup: true,
        });
        await FpaModelPlanningTasksService.notifyAssignee({
          cycle,
          task: { id: task.id, title, assigneeId },
          actorId: userId,
          departmentName: dept?.name || null,
        });
      }
    }

    await FpaModelPlanningOwnersService.materialiseDepartmentCells(cycle, [...incomingDeptIds]);

    await FpaAuditService.log("MODEL_PLANNING_OWNERS_SET", userId, {
      modelId: cycle.sourceModelId,
      versionId: cycle.sourceModelVersionId,
      entityType: "ModelPlanningCycle",
      entityId: cycle.id,
      reason: JSON.stringify({ ownerCount: ownersIn.length }),
      ip,
    });

    return FpaModelPlanningOwnersService.enrichOwners(cycle.id);
  }

  /** Clone company-level INPUT cells into each owner department slice (idempotent). */
  static async materialiseDepartmentCells(
    cycle: {
      sourceModelId: string;
      sourceModelVersionId: string;
      baseScenarioId: string | null;
    },
    departmentIds: string[]
  ) {
    if (!departmentIds.length) return { created: 0 };

    const baseWhere: any = {
      modelId: cycle.sourceModelId,
      versionId: cycle.sourceModelVersionId,
      departmentId: null,
    };
    if (cycle.baseScenarioId) baseWhere.scenarioId = cycle.baseScenarioId;

    const templates = await prisma.planningCell.findMany({
      where: baseWhere,
      include: {
        lineItem: { select: { lineItemType: true, isEditable: true } },
      },
      take: 20000,
    });
    const editableTemplates = templates.filter((t) => {
      const type = String(t.lineItem?.lineItemType || "").toUpperCase();
      if (["CALC", "CALCULATED", "FX"].includes(type)) return false;
      return t.lineItem?.isEditable !== false;
    });
    if (!editableTemplates.length) return { created: 0 };

    let created = 0;
    for (const departmentId of departmentIds) {
      const existing = await prisma.planningCell.findMany({
        where: {
          modelId: cycle.sourceModelId,
          versionId: cycle.sourceModelVersionId,
          departmentId,
          ...(cycle.baseScenarioId ? { scenarioId: cycle.baseScenarioId } : {}),
        },
        select: { lineItemId: true, periodDate: true, scenarioId: true },
      });
      const have = new Set(
        existing.map(
          (c) => `${c.scenarioId || ""}:${c.lineItemId}:${new Date(c.periodDate).toISOString().slice(0, 10)}`
        )
      );

      const rows: any[] = [];
      for (const t of editableTemplates) {
        const key = `${t.scenarioId || ""}:${t.lineItemId}:${new Date(t.periodDate).toISOString().slice(0, 10)}`;
        if (have.has(key)) continue;
        rows.push({
          modelId: t.modelId,
          scenarioId: t.scenarioId,
          versionId: t.versionId,
          lineItemId: t.lineItemId,
          periodDate: t.periodDate,
          departmentId,
          currencyCode: t.currencyCode || "USD",
          value: t.value,
          valueType: t.valueType || "INPUT",
          sourceType: t.sourceType || "MANUAL",
          formulaId: t.formulaId,
          isEditable: true,
          isLocked: false,
          recordVersion: BigInt(1),
        });
      }

      const chunk = 400;
      for (let i = 0; i < rows.length; i += chunk) {
        const part = rows.slice(i, i + chunk);
        if (!part.length) continue;
        const res = await prisma.planningCell.createMany({ data: part, skipDuplicates: true });
        created += res.count || part.length;
      }
    }
    return { created };
  }

  static async setOwners(cycleId: string, body: any, userId: string, ip?: string) {
    const cycle = await prisma.modelPlanningCycle.findUnique({ where: { id: cycleId } });
    if (!cycle) throw new FpaError(404, "NOT_FOUND", "Model planning cycle not found");
    const status = String(cycle.status || "").toUpperCase();
    if (["LOCKED", "CLOSED", "APPROVED"].includes(status)) {
      throw new FpaError(
        409,
        "CYCLE_IMMUTABLE",
        "Cannot change owners on an approved/locked/closed cycle"
      );
    }
    const ownersIn = Array.isArray(body?.owners) ? body.owners : Array.isArray(body) ? body : [];
    const owners = await FpaModelPlanningOwnersService.replaceOwners(cycle, ownersIn, userId, ip);
    return { id: cycleId, owners };
  }

  static async ownerWorkspace(cycleId: string, user: any) {
    const cycle = await prisma.modelPlanningCycle.findUnique({ where: { id: cycleId } });
    if (!cycle) throw new FpaError(404, "NOT_FOUND", "Model planning cycle not found");

    const owners = await FpaModelPlanningOwnersService.enrichOwners(cycleId);
    const isApprover = FpaAccessService.canApprove(user);
    const mine = isApprover
      ? owners
      : owners.filter((o) => o.assigneeId === user?.id);

    if (!isApprover && !mine.length) {
      throw new FpaError(403, "FORBIDDEN", "You are not assigned as an owner on this planning cycle");
    }

    const myOwner = mine[0] || null;
    const assignedDepartmentIds = isApprover
      ? owners.map((o) => o.departmentId)
      : mine.map((o) => o.departmentId);

    const status = String(myOwner?.status || "").toUpperCase();
    const canSubmit =
      Boolean(myOwner?.taskId) &&
      ["OPEN", "IN_PROGRESS", "RETURNED", "PENDING"].includes(status) &&
      !["LOCKED", "CLOSED", "APPROVED"].includes(String(cycle.status).toUpperCase());

    const unmetRequirements: Array<{ code: string; message: string }> = [];
    if (!myOwner?.taskId) {
      unmetRequirements.push({
        code: "NO_TASK",
        message: "No owner task is linked to your department assignment",
      });
    }
    if (["SUBMITTED", "APPROVED"].includes(status)) {
      unmetRequirements.push({
        code: "ALREADY_SUBMITTED",
        message: "Your department slice is already submitted",
      });
    }

    return {
      cycle: {
        id: cycle.id,
        status: cycle.status,
        cycle_name: cycle.name,
        name: cycle.name,
        financialYear: cycle.financialYear,
        planningType: cycle.planningType,
        sourceModelId: cycle.sourceModelId,
        sourceModelVersionId: cycle.sourceModelVersionId,
        baseScenarioId: cycle.baseScenarioId,
        actualsCutoffPeriod: periodStartIso(cycle.actualsCutoffPeriod),
        forecastStartPeriod: periodStartIso(cycle.forecastStartPeriod),
      },
      owners,
      myOwner,
      canSubmit: canSubmit && unmetRequirements.every((u) => u.code !== "ALREADY_SUBMITTED" && u.code !== "NO_TASK"),
      unmetRequirements: canSubmit ? [] : unmetRequirements,
      assignedDepartmentIds,
      readOnly: ["LOCKED", "CLOSED", "APPROVED"].includes(String(cycle.status).toUpperCase()),
    };
  }

  static async markOwnerSubmitted(workflowId: string, departmentId: string) {
    const cycle = await prisma.modelPlanningCycle.findFirst({
      where: { OR: [{ workflowId }, { approvalWorkflowId: workflowId }] },
      select: { id: true },
    });
    if (!cycle) return null;
    await prisma.modelPlanningCycleOwner.updateMany({
      where: { cycleId: cycle.id, departmentId },
      data: { status: "SUBMITTED" },
    });

    const remaining = await prisma.modelPlanningCycleOwner.count({
      where: {
        cycleId: cycle.id,
        status: { notIn: ["SUBMITTED", "APPROVED"] },
      },
    });
    // All owner slices submitted — stay OPEN until FP&A consolidates via POST …/submit
    if (remaining === 0) {
      await prisma.modelPlanningCycle.update({
        where: { id: cycle.id },
        data: { currentStage: "READY_TO_CONSOLIDATE" },
      });
    }
    return cycle.id;
  }

  static async validateSliceSubmit(taskId: string, user: any) {
    const task = await prisma.planningTask.findUnique({ where: { id: taskId } });
    if (!task) throw new FpaError(404, "NOT_FOUND", "Task not found");
    const owners = await prisma.modelPlanningCycleOwner.findMany({
      where: { taskId },
    });
    if (!owners.length) return { applies: false as const };

    const owner = owners[0];
    if (owner.assigneeId && owner.assigneeId !== user?.id && !FpaAccessService.canApprove(user)) {
      throw new FpaError(403, "FORBIDDEN", "Only the assigned owner can submit this slice");
    }
    const status = String(owner.status || "").toUpperCase();
    if (["SUBMITTED", "APPROVED"].includes(status)) {
      throw new FpaError(400, "OWNER_SUBMIT_BLOCKED", "Department slice already submitted");
    }
    if (!["OPEN", "IN_PROGRESS", "RETURNED", "PENDING"].includes(status)) {
      throw new FpaError(
        400,
        "OWNER_SUBMIT_BLOCKED",
        `Cannot submit owner slice in status ${status}`
      );
    }
    return { applies: true as const, owner };
  }
}
