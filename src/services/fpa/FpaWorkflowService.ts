// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";

export class FpaWorkflowService {
  static async createWorkflow(input: any, userId: string, ip?: string) {
    if (!input.modelId || !input.name) throw new FpaError(400, "VALIDATION", "modelId and name required");
    const workflow = await prisma.planningWorkflow.create({
      data: {
        modelId: input.modelId,
        name: String(input.name),
        workflowType: String(input.workflowType || "BUDGET_CYCLE"),
        stage: String(input.stage || "SETUP"),
        status: "ACTIVE",
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        createdById: userId,
      },
    });

    const tasksIn = input.tasks || [];
    const tasks = [];
    for (const t of tasksIn) {
      tasks.push(
        await prisma.planningTask.create({
          data: {
            workflowId: workflow.id,
            title: String(t.title || "Task"),
            departmentId: t.departmentId || null,
            assigneeId: t.assigneeId || null,
            status: "PENDING",
            priority: t.priority || "NORMAL",
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
          },
        })
      );
    }

    await FpaAuditService.log("WORKFLOW_CREATE", userId, { modelId: input.modelId, ip });
    return { ...workflow, tasks };
  }

  static async listWorkflows(query: any = {}) {
    const where: any = {};
    if (query.modelId) where.modelId = String(query.modelId);
    if (query.status) where.status = String(query.status);
    return prisma.planningWorkflow.findMany({
      where,
      include: {
        tasks: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            title: true,
            status: true,
            assigneeId: true,
            departmentId: true,
            priority: true,
            dueDate: true,
          },
        },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getWorkflow(id: string) {
    const wf = await prisma.planningWorkflow.findUnique({
      where: { id },
      include: {
        tasks: { orderBy: { createdAt: "asc" }, include: { approvals: true } },
        approvals: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!wf) throw new FpaError(404, "NOT_FOUND", "Workflow not found");
    return wf;
  }

  /**
   * Align with home dashboard openTasks: assigned to me OR unassigned.
   * Optional filters: modelId, status.
   */
  static async myTasks(userId: string, query: any = {}) {
    const where: any = {
      OR: [{ assigneeId: userId }, { assigneeId: null }],
      status: query.status
        ? String(query.status)
        : { in: ["PENDING", "RETURNED", "SUBMITTED"] },
    };
    if (query.modelId) {
      where.workflow = { modelId: String(query.modelId) };
    }

    return prisma.planningTask.findMany({
      where,
      include: {
        workflow: { select: { id: true, modelId: true, name: true, stage: true, status: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });
  }

  static async reassign(taskId: string, input: any, user: any, ip?: string) {
    FpaAccessService.assertCanApprove(user);
    const task = await prisma.planningTask.findUnique({ where: { id: taskId }, include: { workflow: true } });
    if (!task) throw new FpaError(404, "NOT_FOUND", "Task not found");
    const assigneeId = input.assigneeId ?? input.userId ?? null;
    if (assigneeId) {
      const assignee = await prisma.user.findUnique({ where: { id: String(assigneeId) }, select: { id: true } });
      if (!assignee) throw new FpaError(400, "VALIDATION", "assigneeId user not found");
    }
    const updated = await prisma.planningTask.update({
      where: { id: taskId },
      data: { assigneeId: assigneeId ? String(assigneeId) : null },
    });
    await prisma.planningApproval.create({
      data: {
        workflowId: task.workflowId,
        taskId,
        actorId: user.id,
        action: "REASSIGN",
        comment: input.comment || (assigneeId ? `Reassigned to ${assigneeId}` : "Unassigned"),
      },
    });
    await FpaAuditService.log("TASK_REASSIGN", user.id, {
      modelId: task.workflow.modelId,
      reason: input.comment,
      newValue: assigneeId ? String(assigneeId) : null,
      ip,
    });
    return updated;
  }

  static async submit(taskId: string, user: any, comment?: string, ip?: string) {
    const task = await prisma.planningTask.findUnique({ where: { id: taskId }, include: { workflow: true } });
    if (!task) throw new FpaError(404, "NOT_FOUND", "Task not found");
    if (task.assigneeId && task.assigneeId !== user.id && !FpaAccessService.canApprove(user)) {
      throw new FpaError(403, "FORBIDDEN", "Only assignee can submit this task");
    }
    const updated = await prisma.planningTask.update({
      where: { id: taskId },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    await prisma.planningApproval.create({
      data: {
        workflowId: task.workflowId,
        taskId,
        actorId: user.id,
        action: "SUBMIT",
        comment: comment || null,
      },
    });
    await FpaAuditService.log("TASK_SUBMIT", user.id, { modelId: task.workflow.modelId, reason: comment, ip });
    return updated;
  }

  static async returnTask(taskId: string, user: any, comment?: string, ip?: string) {
    FpaAccessService.assertCanApprove(user);
    const task = await prisma.planningTask.findUnique({ where: { id: taskId }, include: { workflow: true } });
    if (!task) throw new FpaError(404, "NOT_FOUND", "Task not found");
    const updated = await prisma.planningTask.update({
      where: { id: taskId },
      data: { status: "RETURNED", submittedAt: null },
    });
    await prisma.planningApproval.create({
      data: {
        workflowId: task.workflowId,
        taskId,
        actorId: user.id,
        action: "RETURN",
        comment: comment || null,
      },
    });
    await FpaAuditService.log("TASK_RETURN", user.id, { modelId: task.workflow.modelId, reason: comment, ip });
    return updated;
  }

  static async approve(taskId: string, user: any, comment?: string, ip?: string) {
    FpaAccessService.assertCanApprove(user);
    const task = await prisma.planningTask.findUnique({ where: { id: taskId }, include: { workflow: true } });
    if (!task) throw new FpaError(404, "NOT_FOUND", "Task not found");

    const submitApproval = await prisma.planningApproval.findFirst({
      where: { taskId, action: "SUBMIT" },
      orderBy: { createdAt: "desc" },
    });
    if (submitApproval && submitApproval.actorId === user.id) {
      throw new FpaError(403, "MAKER_CHECKER", "Maker cannot approve their own submission");
    }

    const updated = await prisma.planningTask.update({
      where: { id: taskId },
      data: { status: "APPROVED" },
    });
    await prisma.planningApproval.create({
      data: {
        workflowId: task.workflowId,
        taskId,
        actorId: user.id,
        action: "APPROVE",
        comment: comment || null,
      },
    });
    await FpaAuditService.log("TASK_APPROVE", user.id, { modelId: task.workflow.modelId, reason: comment, ip });
    return updated;
  }
}
