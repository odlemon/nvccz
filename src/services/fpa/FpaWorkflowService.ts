// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";
import { FpaBudgetCycleService } from "./FpaBudgetCycleService";

function esc(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

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
            priority: t.priority || "MEDIUM",
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
    const rows = await prisma.planningWorkflow.findMany({
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

    const deptIds = [
      ...new Set(rows.flatMap((w) => w.tasks.map((t) => t.departmentId).filter(Boolean))),
    ] as string[];
    const depts = deptIds.length
      ? await prisma.department.findMany({
          where: { id: { in: deptIds } },
          select: { id: true, name: true },
        })
      : [];
    const deptName = Object.fromEntries(depts.map((d) => [d.id, d.name]));

    return rows.map((w) => ({
      ...w,
      tasks: w.tasks.map((t) => ({
        ...t,
        departmentName: t.departmentId ? deptName[t.departmentId] || null : null,
        department: t.departmentId ? deptName[t.departmentId] || null : null,
      })),
    }));
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

    const deptIds = [...new Set(wf.tasks.map((t) => t.departmentId).filter(Boolean))] as string[];
    const userIds = [
      ...new Set(wf.tasks.flatMap((t) => [t.assigneeId, t.reviewerId]).filter(Boolean).map(String)),
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
    const display = (u: any) =>
      u ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || null : null;

    return {
      ...wf,
      tasks: wf.tasks.map((t) => ({
        ...t,
        departmentName: t.departmentId ? deptName[t.departmentId] || null : null,
        department: t.departmentId ? deptName[t.departmentId] || null : null,
        assigneeName: display(userMap[t.assigneeId]),
        reviewerName: display(userMap[t.reviewerId]),
      })),
    };
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
      where.workflow = { ...(where.workflow || {}), modelId: String(query.modelId) };
    }
    // Optional versionId: tasks on budget cycles / workflows tied to that version
    if (query.versionId) {
      const cycles = await prisma.planningBudgetCycle.findMany({
        where: { versionId: String(query.versionId) },
        select: { workflowId: true },
      });
      const workflowIds = cycles.map((c) => c.workflowId).filter(Boolean);
      if (workflowIds.length) {
        where.workflowId = { in: workflowIds };
      } else {
        // No budget cycle for version — still allow model-scoped tasks if modelId set
        if (!query.modelId) {
          return [];
        }
      }
    }

    const tasks = await prisma.planningTask.findMany({
      where,
      include: {
        workflow: { select: { id: true, modelId: true, name: true, stage: true, status: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });

    const deptIds = [...new Set(tasks.map((t) => t.departmentId).filter(Boolean))] as string[];
    const depts = deptIds.length
      ? await prisma.department.findMany({
          where: { id: { in: deptIds } },
          select: { id: true, name: true },
        })
      : [];
    const deptName = Object.fromEntries(depts.map((d) => [d.id, d.name]));

    return tasks.map((t) => {
      const assignee = t.assignee;
      const assigneeName = assignee
        ? [assignee.firstName, assignee.lastName].filter(Boolean).join(" ").trim() ||
          assignee.email ||
          null
        : null;
      return {
        ...t,
        departmentName: t.departmentId ? deptName[t.departmentId] || null : null,
        assigneeName,
        // FE-friendly aliases (some screens bind `department` / `assignee`)
        department: t.departmentId ? deptName[t.departmentId] || null : null,
      };
    });
  }

  static async cycleForWorkflow(workflowId: string) {
    const budget = await prisma.planningBudgetCycle.findFirst({
      where: { workflowId },
      select: { id: true, name: true, fiscalYear: true },
    });
    if (budget) return { ...budget, kind: "budget" as const };

    const model = await prisma.modelPlanningCycle.findFirst({
      where: { OR: [{ workflowId }, { approvalWorkflowId: workflowId }] },
      select: { id: true, name: true, financialYear: true },
    });
    if (model) {
      return {
        id: model.id,
        name: model.name,
        fiscalYear: model.financialYear,
        kind: "model" as const,
      };
    }
    return null;
  }

  /** Notify assignee on reassign / return / approve; notify FPA+CFO on owner task submit. */
  static async notifyTaskEvent(opts: {
    task: { id: string; title: string; assigneeId?: string | null; workflowId: string };
    actorId?: string | null;
    type: "TASK_REASSIGNED" | "TASK_SUBMITTED" | "TASK_RETURNED" | "TASK_APPROVED";
    comment?: string | null;
    targetUserId?: string | null;
  }) {
    try {
      const cycle = await FpaWorkflowService.cycleForWorkflow(opts.task.workflowId);
      const cycleId = cycle?.id || opts.task.workflowId;
      const cycleLabel = cycle ? `${cycle.name} (FY${cycle.fiscalYear})` : opts.task.title;

      if (opts.type === "TASK_SUBMITTED") {
        const [fpa, cfo] = await Promise.all([
          FpaBudgetCycleService.resolveFpaManagerUsers(),
          FpaBudgetCycleService.resolveCfoUsers(),
        ]);
        await FpaBudgetCycleService.notifyUsers({
          users: [...fpa, ...cfo],
          excludeUserId: opts.actorId,
          type: "BUDGET_TASK_SUBMITTED",
          title: "Budget task submitted",
          message: `"${opts.task.title}" was submitted for ${cycleLabel}.`,
          cycleId: cycle?.id || cycleId,
          data: { taskId: opts.task.id },
          email: {
            subject: `Budget task submitted — ${opts.task.title}`,
            heading: "Budget task submitted",
            preheader: opts.task.title,
            bodyInnerHtml: (name) => `
            <p>Dear ${esc(name)},</p>
            <p>Budget task <strong>${esc(opts.task.title)}</strong> was submitted${cycle ? ` for <strong>${esc(cycle.name)}</strong>` : ""}.</p>
            ${opts.comment ? `<p><strong>Comment:</strong> ${esc(opts.comment)}</p>` : ""}
            <p>Please review in the Budgeting workspace.</p>`,
            ctaLabel: "Review task",
          },
        });
        return;
      }

      const userId = opts.targetUserId || opts.task.assigneeId;
      if (!userId || userId === opts.actorId) return;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      if (!user?.email) return;

      const map = {
        TASK_REASSIGNED: {
          title: "Budget task assigned",
          message: `You were assigned budget task "${opts.task.title}".`,
          heading: "Budget task assigned",
          subject: `Budget task assigned — ${opts.task.title}`,
          body: (name: string) => `
            <p>Dear ${esc(name)},</p>
            <p>You have been assigned budget task <strong>${esc(opts.task.title)}</strong>${cycle ? ` on <strong>${esc(cycle.name)}</strong>` : ""}.</p>
            ${opts.comment ? `<p><strong>Note:</strong> ${esc(opts.comment)}</p>` : ""}`,
        },
        TASK_RETURNED: {
          title: "Budget task returned",
          message: `Budget task "${opts.task.title}" was returned for correction.`,
          heading: "Budget task returned",
          subject: `Budget task returned — ${opts.task.title}`,
          body: (name: string) => `
            <p>Dear ${esc(name)},</p>
            <p>Budget task <strong>${esc(opts.task.title)}</strong> was returned for correction.</p>
            ${opts.comment ? `<p><strong>Feedback:</strong> ${esc(opts.comment)}</p>` : ""}
            <p>Please update and resubmit.</p>`,
        },
        TASK_APPROVED: {
          title: "Budget task approved",
          message: `Budget task "${opts.task.title}" was approved.`,
          heading: "Budget task approved",
          subject: `Budget task approved — ${opts.task.title}`,
          body: (name: string) => `
            <p>Dear ${esc(name)},</p>
            <p>Budget task <strong>${esc(opts.task.title)}</strong> was approved.</p>
            ${opts.comment ? `<p><strong>Comment:</strong> ${esc(opts.comment)}</p>` : ""}`,
        },
      } as const;

      const meta = map[opts.type];
      if (!meta) return;

      await FpaBudgetCycleService.notifyUsers({
        users: [user],
        excludeUserId: opts.actorId,
        type: opts.type === "TASK_REASSIGNED" ? "BUDGET_TASK_ASSIGNED" : opts.type === "TASK_RETURNED" ? "BUDGET_TASK_RETURNED" : "BUDGET_TASK_APPROVED",
        title: meta.title,
        message: meta.message,
        cycleId: cycle?.id || cycleId,
        relatedEntity: "PlanningTask",
        data: { taskId: opts.task.id },
        email: {
          subject: meta.subject,
          heading: meta.heading,
          preheader: opts.task.title,
          bodyInnerHtml: meta.body,
        },
      });
    } catch (e) {
      console.error("FPA task notification failed:", e);
    }
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
    if (assigneeId) {
      await FpaWorkflowService.notifyTaskEvent({
        task: updated,
        actorId: user.id,
        type: "TASK_REASSIGNED",
        comment: input.comment || null,
        targetUserId: String(assigneeId),
      });
    }
    return updated;
  }

  static async submit(taskId: string, user: any, input: any = {}, ip?: string) {
    const comment = typeof input === "string" ? input : input?.comment;
    const changeNotes =
      typeof input === "object" && input
        ? String(input.changeNotes || input.notes || "").trim() || null
        : null;
    const task = await prisma.planningTask.findUnique({ where: { id: taskId }, include: { workflow: true } });
    if (!task) throw new FpaError(404, "NOT_FOUND", "Task not found");
    if (task.assigneeId && task.assigneeId !== user.id && !FpaAccessService.canApprove(user)) {
      throw new FpaError(403, "FORBIDDEN", "Only assignee can submit this task");
    }

    const cycle = await FpaWorkflowService.cycleForWorkflow(task.workflowId);
    if (cycle?.kind === "budget" && cycle.id) {
      const check = await FpaBudgetCycleService.validateOwnerSubmission(cycle.id, user, {
        departmentIds: task.departmentId ? [task.departmentId] : undefined,
      });
      if (!check.passed) {
        throw new FpaError(
          400,
          "SUBMISSION_BLOCKED",
          `Cannot submit: ${check.errors.length} requirement(s) remain unmet`,
          check.errors
        );
      }
    }
    if (cycle?.kind === "model") {
      const { FpaModelPlanningOwnersService } = await import("./FpaModelPlanningOwnersService");
      await FpaModelPlanningOwnersService.validateSliceSubmit(taskId, user);
    }

    const updated = await prisma.planningTask.update({
      where: { id: taskId },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        ...(changeNotes != null ? { changeNotes } : {}),
      },
    });
    await prisma.planningApproval.create({
      data: {
        workflowId: task.workflowId,
        taskId,
        actorId: user.id,
        action: "SUBMIT",
        comment: comment || changeNotes || null,
      },
    });
    if (cycle?.kind === "budget" && cycle.id && task.departmentId) {
      await prisma.planningBudgetCycleOwner.updateMany({
        where: { cycleId: cycle.id, departmentId: task.departmentId },
        data: { status: "SUBMITTED" },
      });
    }
    if (cycle?.kind === "model" && task.departmentId) {
      const { FpaModelPlanningOwnersService } = await import("./FpaModelPlanningOwnersService");
      await FpaModelPlanningOwnersService.markOwnerSubmitted(task.workflowId, task.departmentId);
      const { FpaPlanningPmTaskBridge } = await import("./FpaPlanningPmTaskBridge");
      await FpaPlanningPmTaskBridge.syncStatus(taskId, "SUBMITTED");
    }
    await FpaAuditService.log("TASK_SUBMIT", user.id, { modelId: task.workflow.modelId, reason: comment, ip });
    await FpaWorkflowService.notifyTaskEvent({
      task: updated,
      actorId: user.id,
      type: "TASK_SUBMITTED",
      comment: comment || null,
    });
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
    const cycle = await FpaWorkflowService.cycleForWorkflow(task.workflowId);
    if (cycle?.kind === "model") {
      const { FpaPlanningPmTaskBridge } = await import("./FpaPlanningPmTaskBridge");
      await FpaPlanningPmTaskBridge.syncStatus(taskId, "RETURNED");
    }
    await FpaWorkflowService.notifyTaskEvent({
      task: updated,
      actorId: user.id,
      type: "TASK_RETURNED",
      comment: comment || null,
      targetUserId: updated.assigneeId,
    });
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
      data: { status: "APPROVED", reviewerId: user.id },
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
    await FpaWorkflowService.notifyTaskEvent({
      task: updated,
      actorId: user.id,
      type: "TASK_APPROVED",
      comment: comment || null,
      targetUserId: updated.assigneeId,
    });
    return updated;
  }
}
