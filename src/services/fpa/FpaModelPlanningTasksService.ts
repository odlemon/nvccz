// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";
import { FpaWorkflowCollabService } from "./FpaWorkflowCollabService";
import { FpaBudgetCycleService } from "./FpaBudgetCycleService";
import { periodStartIso, toPeriodStartDate } from "./FpaPlanningCycleContextService";
import { FpaPlanningPmTaskBridge } from "./FpaPlanningPmTaskBridge";
import { emitToUsers } from "../RealtimeSocketService";
import { EmailNotificationService } from "../EmailNotificationService";

const OPEN_FOR_TASKS = new Set(["DRAFT", "OPEN", "IN_REVIEW"]);

function userDisplayName(u: any): string | null {
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || null;
}

function mapTaskPriority(p: any): "HIGH" | "MEDIUM" | "LOW" {
  const v = String(p || "MEDIUM").toUpperCase();
  if (v === "HIGH") return "HIGH";
  if (v === "LOW") return "LOW";
  return "MEDIUM";
}

function mapTaskStatus(status: string | null | undefined, ownerStatus?: string | null): string {
  const t = String(status || "").toUpperCase();
  const o = String(ownerStatus || "").toUpperCase();
  if (t === "SUBMITTED" || o === "SUBMITTED") return "SUBMITTED";
  if (t === "RETURNED" || o === "RETURNED") return "RETURNED";
  if (t === "APPROVED" || o === "APPROVED") return "APPROVED";
  if (t === "COMPLETED" || t === "DONE") return "COMPLETED";
  if (t === "IN_PROGRESS" || o === "IN_PROGRESS") return "IN_PROGRESS";
  if (t === "PENDING" || o === "OPEN" || o === "PENDING") return "OPEN";
  return t || "OPEN";
}

function modelPlanningCyclePath(cycleId: string): string {
  return `/fpa/model-planning/${cycleId}`;
}

export class FpaModelPlanningTasksService {
  static async assertCycle(cycleId: string) {
    const cycle = await prisma.modelPlanningCycle.findUnique({ where: { id: String(cycleId) } });
    if (!cycle) throw new FpaError(404, "NOT_FOUND", "Model planning cycle not found");
    return cycle;
  }

  static assertCanAssignTasks(user: any) {
    if (!FpaAccessService.canApprove(user)) {
      throw new FpaError(403, "TASK_ASSIGN_FORBIDDEN", "You do not have permission to assign planning tasks");
    }
  }

  static async assertCanViewCycleTasks(cycleId: string, user: any) {
    if (FpaAccessService.canApprove(user)) return;
    const owners = await prisma.modelPlanningCycleOwner.findMany({
      where: { cycleId: String(cycleId) },
      select: { assigneeId: true },
    });
    if (owners.some((o) => o.assigneeId === user.id)) return;

    const cycle = await FpaModelPlanningTasksService.assertCycle(cycleId);
    if (!cycle.workflowId) {
      throw new FpaError(403, "FORBIDDEN", "You are not assigned to this planning cycle");
    }
    const mine = await prisma.planningTask.findFirst({
      where: { workflowId: cycle.workflowId, assigneeId: user.id },
      select: { id: true },
    });
    if (!mine) {
      throw new FpaError(403, "FORBIDDEN", "You are not assigned to this planning cycle");
    }
  }

  static assertCycleOpenForTasks(cycle: { status?: string | null }) {
    const status = String(cycle.status || "DRAFT").toUpperCase();
    if (!OPEN_FOR_TASKS.has(status)) {
      throw new FpaError(403, "CYCLE_LOCKED", `Cycle is ${status} and cannot accept new planning tasks`);
    }
  }

  static async isOwnerSliceTask(taskId: string, cycleId?: string): Promise<boolean> {
    const where: any = { taskId: String(taskId) };
    if (cycleId) where.cycleId = String(cycleId);
    const row = await prisma.modelPlanningCycleOwner.findFirst({ where, select: { id: true } });
    return Boolean(row);
  }

  static serializeTask(
    t: any,
    ctx: {
      deptName: Record<string, string>;
      userMap: Record<string, any>;
      ownerTaskIds: Set<string>;
      ownerByTaskId: Record<string, { status: string }>;
      cycleId: string;
      modelId: string;
      versionId: string;
    }
  ) {
    const isOwnerSlice = ctx.ownerTaskIds.has(t.id);
    const ownerRow = ctx.ownerByTaskId[t.id];
    const due = t.dueDate ? periodStartIso(t.dueDate) || String(t.dueDate).slice(0, 10) : null;
    return {
      id: t.id,
      title: t.title,
      status: mapTaskStatus(t.status, ownerRow?.status),
      priority: mapTaskPriority(t.priority),
      departmentId: t.departmentId,
      departmentName: t.departmentId ? ctx.deptName[t.departmentId] || null : null,
      department: t.departmentId ? ctx.deptName[t.departmentId] || null : null,
      assigneeId: t.assigneeId,
      assigneeName: userDisplayName(t.assigneeId ? ctx.userMap[t.assigneeId] : null),
      reviewerId: t.reviewerId,
      reviewerName: userDisplayName(t.reviewerId ? ctx.userMap[t.reviewerId] : null),
      dueDate: due,
      submittedOn: t.submittedAt,
      changeNotes: t.changeNotes || null,
      description: !isOwnerSlice && t.changeNotes ? t.changeNotes : null,
      cycleId: ctx.cycleId,
      modelId: ctx.modelId,
      versionId: ctx.versionId,
      taskKind: isOwnerSlice ? "OWNER_SLICE" : "PLANNING",
      isDeptPlan: isOwnerSlice,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  static async listCycleTasks(cycleId: string, query: any = {}, user: any) {
    await FpaModelPlanningTasksService.assertCanViewCycleTasks(cycleId, user);
    const cycle = await FpaModelPlanningTasksService.assertCycle(cycleId);
    if (!cycle.workflowId) return [];

    const owners = await prisma.modelPlanningCycleOwner.findMany({
      where: { cycleId },
      select: { taskId: true, status: true, departmentId: true },
    });
    const ownerTaskIds = new Set(owners.map((o) => o.taskId).filter(Boolean) as string[]);
    const ownerByTaskId = Object.fromEntries(
      owners.filter((o) => o.taskId).map((o) => [o.taskId!, { status: o.status, departmentId: o.departmentId }])
    );

    const where: any = { workflowId: cycle.workflowId };
    if (query.status) {
      const s = String(query.status).toUpperCase();
      if (s === "OPEN") where.status = { in: ["OPEN", "PENDING", "IN_PROGRESS"] };
      else where.status = s;
    }
    if (query.departmentId) where.departmentId = String(query.departmentId);
    if (query.assigneeId) where.assigneeId = String(query.assigneeId);
    if (query.priority) {
      const p = mapTaskPriority(query.priority);
      where.priority = p === "MEDIUM" ? { in: ["MEDIUM", "NORMAL"] } : p;
    }

    const tasks = await prisma.planningTask.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });

    const deptIds = [
      ...new Set([
        ...tasks.map((t) => t.departmentId).filter(Boolean),
        ...owners.map((o) => o.departmentId),
      ]),
    ] as string[];
    const userIds = [
      ...new Set(tasks.flatMap((t) => [t.assigneeId, t.reviewerId]).filter(Boolean).map(String)),
    ];
    const [depts, users] = await Promise.all([
      deptIds.length
        ? prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } })
        : [],
      userIds.length
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [],
    ]);
    const deptName = Object.fromEntries(depts.map((d) => [d.id, d.name]));
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const ctx = {
      deptName,
      userMap,
      ownerTaskIds,
      ownerByTaskId,
      cycleId: cycle.id,
      modelId: cycle.sourceModelId,
      versionId: cycle.sourceModelVersionId,
    };

    return tasks.map((t) => FpaModelPlanningTasksService.serializeTask(t, ctx));
  }

  static async createPlanningTask(cycleId: string, input: any, user: any, ip?: string) {
    FpaModelPlanningTasksService.assertCanAssignTasks(user);

    const title = String(input?.title || "").trim();
    if (!title) throw new FpaError(400, "VALIDATION", "title is required");

    const assigneeId = input.assigneeId ? String(input.assigneeId) : null;
    const departmentId = input.departmentId ? String(input.departmentId) : null;
    const dueDate = toPeriodStartDate(input.dueDate);
    const priority = mapTaskPriority(input.priority);
    const description = String(input?.description || "").trim() || null;

    const [cycle, deptRow, assigneeRow] = await Promise.all([
      prisma.modelPlanningCycle.findUnique({ where: { id: String(cycleId) } }),
      departmentId
        ? prisma.department.findUnique({ where: { id: departmentId }, select: { id: true, name: true } })
        : Promise.resolve(null),
      assigneeId
        ? prisma.user.findUnique({
            where: { id: assigneeId },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : Promise.resolve(null),
    ]);
    if (!cycle) throw new FpaError(404, "NOT_FOUND", "Model planning cycle not found");
    FpaModelPlanningTasksService.assertCycleOpenForTasks(cycle);

    if (departmentId && !deptRow) {
      throw new FpaError(400, "UNKNOWN_DEPARTMENT", `Department not found: ${departmentId}`);
    }
    if (assigneeId && !assigneeRow) {
      throw new FpaError(400, "UNKNOWN_ASSIGNEE", `Assignee not found: ${assigneeId}`);
    }

    let workflowId = cycle.workflowId;
    if (!workflowId) {
      const workflow = await prisma.planningWorkflow.create({
        data: {
          modelId: cycle.sourceModelId,
          name: `${cycle.name} — Model Planning`,
          workflowType: "MODEL_PLANNING",
          stage: "OWNER_INPUT",
          status: "ACTIVE",
          createdById: user.id,
        },
      });
      workflowId = workflow.id;
      await prisma.modelPlanningCycle.update({
        where: { id: cycle.id },
        data: { workflowId, approvalWorkflowId: workflowId },
      });
    }

    const task = await prisma.planningTask.create({
      data: {
        workflowId,
        title,
        departmentId,
        assigneeId,
        status: "PENDING",
        priority,
        dueDate,
        changeNotes: description,
      },
    });

    // Do not block the HTTP response on audit / PM mirror / email (remote MySQL + SMTP were ~15s).
    void FpaAuditService.log("MODEL_PLANNING_TASK_CREATE", user.id, {
      modelId: cycle.sourceModelId,
      versionId: cycle.sourceModelVersionId,
      entityType: "ModelPlanningCycle",
      entityId: cycle.id,
      reason: title,
      ip,
    }).catch((e) => console.error("MODEL_PLANNING_TASK_CREATE audit failed:", e));

    void FpaPlanningPmTaskBridge.upsertFromPlanningTask({
      planningTaskId: task.id,
      title,
      description,
      assigneeId,
      departmentId,
      departmentName: deptRow?.name || null,
      dueDate,
      priority,
      status: "PENDING",
      cycleId: cycle.id,
      cycleName: cycle.name,
      modelId: cycle.sourceModelId,
      versionId: cycle.sourceModelVersionId,
      taskKind: "PLANNING",
      createdById: user.id,
      skipLookup: true,
    });

    if (assigneeId) {
      // Await in-app notify so owners always get the bell; email stays async inside.
      await FpaModelPlanningTasksService.notifyAssignee({
        cycle,
        task,
        actorId: user.id,
        description,
        departmentName: deptRow?.name || null,
      });
    }

    const deptName: Record<string, string> = {};
    const userMap: Record<string, any> = {};
    if (departmentId && deptRow?.name) deptName[departmentId] = deptRow.name;
    if (assigneeId && assigneeRow) userMap[assigneeId] = assigneeRow;

    return FpaModelPlanningTasksService.serializeTask(task, {
      deptName,
      userMap,
      ownerTaskIds: new Set(),
      ownerByTaskId: {},
      cycleId: cycle.id,
      modelId: input.modelId ? String(input.modelId) : cycle.sourceModelId,
      versionId: input.versionId ? String(input.versionId) : cycle.sourceModelVersionId,
    });
  }

  /**
   * Notify assignee: in-app bell + websocket immediately; email async (never blocks).
   */
  static async notifyAssignee(opts: {
    cycle: { id: string; name: string; financialYear?: number };
    task: { id: string; title: string; assigneeId?: string | null };
    actorId?: string | null;
    description?: string | null;
    departmentName?: string | null;
  }) {
    if (!opts.task.assigneeId) return;
    if (opts.actorId && opts.task.assigneeId === opts.actorId) return;

    const user = await prisma.user.findUnique({
      where: { id: opts.task.assigneeId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!user) return;

    const path = modelPlanningCyclePath(opts.cycle.id);
    const base = String(process.env.FRONTEND_URL || "http://app.kyntaro.com").replace(/\/+$/, "");
    const deptBit = opts.departmentName ? ` (${opts.departmentName})` : "";
    const title = "Model planning task assigned";
    const message = `You were assigned "${opts.task.title}" on ${opts.cycle.name}${deptBit}.`;
    const payload = {
      taskId: opts.task.id,
      cycleId: opts.cycle.id,
      planningTaskId: opts.task.id,
      path,
      url: `${base}${path}`,
      modalTarget: "fpa-model-planning",
    };

    try {
      await prisma.notification.create({
        data: {
          title,
          message,
          type: "MODEL_PLANNING_TASK_ASSIGNED",
          userId: user.id,
          relatedEntity: "ModelPlanningCycle",
          relatedEntityId: opts.cycle.id,
          data: payload,
        },
      });
    } catch (e) {
      console.error("Model planning in-app notify failed:", e);
    }

    try {
      emitToUsers([user.id], "notification_created", {
        type: "MODEL_PLANNING_TASK_ASSIGNED",
        ...payload,
      });
    } catch (e) {
      console.error("Model planning realtime notify failed:", e);
    }

    if (!user.email) return;

    const esc = (s: string) =>
      String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;

    void EmailNotificationService.sendFpaBudgetLifecycleEmail({
      recipientName: name,
      recipientEmail: user.email,
      subject: `Planning task assigned — ${opts.task.title}`,
      heading: "Model planning task assigned",
      preheader: opts.task.title,
      bodyInnerHtml: `
        <p>Dear ${esc(name)},</p>
        <p>You have been assigned planning task <strong>${esc(opts.task.title)}</strong> on <strong>${esc(opts.cycle.name)}</strong>${opts.departmentName ? ` for <strong>${esc(opts.departmentName)}</strong>` : ""}.</p>
        ${opts.description ? `<p><strong>Details:</strong> ${esc(opts.description)}</p>` : ""}
        <p>Open the Model Planning worksheet to continue.</p>`,
      cycleId: opts.cycle.id,
      ctaLabel: "Open worksheet",
      path,
    }).catch((e) => console.error("Model planning email notify failed:", e));
  }

  static async updateTaskStatus(taskId: string, input: any, user: any, ip?: string) {
    const status = String(input?.status || "").toUpperCase();
    if (!status) throw new FpaError(400, "VALIDATION", "status is required");

    const task = await prisma.planningTask.findUnique({
      where: { id: taskId },
      include: { workflow: true },
    });
    if (!task) throw new FpaError(404, "NOT_FOUND", "Task not found");

    const cycle = await prisma.modelPlanningCycle.findFirst({
      where: { workflowId: task.workflowId },
    });
    if (!cycle) {
      throw new FpaError(404, "NOT_FOUND", "Task is not linked to a model planning cycle");
    }

    const isOwnerSlice = await FpaModelPlanningTasksService.isOwnerSliceTask(taskId, cycle.id);
    if (isOwnerSlice && ["COMPLETED", "DONE"].includes(status)) {
      throw new FpaError(
        403,
        "OWNER_SUBMIT_REQUIRED",
        "Department plan tasks must be submitted via POST /tasks/{id}/submit, not marked complete"
      );
    }

    const allowed = new Set(["OPEN", "IN_PROGRESS", "COMPLETED", "DONE", "PENDING"]);
    if (!allowed.has(status)) {
      throw new FpaError(400, "VALIDATION", `Unsupported status ${status} for planning task update`);
    }

    if (task.assigneeId && task.assigneeId !== user.id && !FpaAccessService.canApprove(user)) {
      throw new FpaError(403, "FORBIDDEN", "Only assignee or FP&A can update this task");
    }

    const nextStatus = ["COMPLETED", "DONE"].includes(status) ? "COMPLETED" : status === "OPEN" ? "PENDING" : status;

    const updated = await prisma.planningTask.update({
      where: { id: taskId },
      data: { status: nextStatus },
    });

    await FpaPlanningPmTaskBridge.syncStatus(taskId, nextStatus);

    await FpaAuditService.log("MODEL_PLANNING_TASK_UPDATE", user.id, {
      modelId: task.workflow.modelId,
      entityType: "PlanningTask",
      entityId: taskId,
      reason: `status=${nextStatus}`,
      ip,
    });

    return { id: updated.id, status: mapTaskStatus(updated.status), taskKind: "PLANNING" };
  }

  static async listComments(cycleId: string, user: any) {
    await FpaModelPlanningTasksService.assertCanViewCycleTasks(cycleId, user);
    return FpaWorkflowCollabService.listComments({ cycleId }, user);
  }

  static async addComment(cycleId: string, input: any, user: any) {
    await FpaModelPlanningTasksService.assertCanViewCycleTasks(cycleId, user);
    await FpaModelPlanningTasksService.assertCycle(cycleId);
    return FpaWorkflowCollabService.addModelPlanningComment(cycleId, input, user);
  }

  static async listActivity(cycleId: string, user: any) {
    await FpaModelPlanningTasksService.assertCanViewCycleTasks(cycleId, user);
    return FpaWorkflowCollabService.listModelPlanningApprovalEvents(cycleId, user);
  }
}
