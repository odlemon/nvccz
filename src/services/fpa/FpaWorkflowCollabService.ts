// @ts-nocheck
import fs from "fs";
import path from "path";
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";
import { RemoteUploadService } from "../RemoteUploadService";

function userDisplayName(u: any): string | null {
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || null;
}

function escCsv(v: any): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Canonical UI priority: HIGH | MEDIUM | LOW (legacy NORMAL → MEDIUM). */
function mapTaskPriority(p: any): "HIGH" | "MEDIUM" | "LOW" {
  const v = String(p || "MEDIUM").toUpperCase();
  if (v === "HIGH") return "HIGH";
  if (v === "LOW") return "LOW";
  return "MEDIUM"; // NORMAL and anything else
}

export class FpaWorkflowCollabService {
  static async assertCycle(cycleId: string) {
    const cycle = await prisma.planningBudgetCycle.findUnique({
      where: { id: cycleId },
      include: { owners: true },
    });
    if (!cycle) throw new FpaError(404, "NOT_FOUND", "Budget cycle not found");
    return cycle;
  }

  static async assertTask(taskId: string) {
    const task = await prisma.planningTask.findUnique({
      where: { id: taskId },
      include: { workflow: true },
    });
    if (!task) throw new FpaError(404, "NOT_FOUND", "Task not found");
    return task;
  }

  static async cycleForTask(taskId: string) {
    const task = await FpaWorkflowCollabService.assertTask(taskId);
    const cycle = await prisma.planningBudgetCycle.findFirst({
      where: { workflowId: task.workflowId },
    });
    return { task, cycle };
  }

  static buildStages(cycle: any) {
    const status = String(cycle.status || "").toUpperCase();
    const stageOrder = ["SETUP", "DEPT_INPUT", "FPA_REVIEW", "CFO_APPROVAL", "LOCKED"];
    const activeKey =
      status === "DRAFT" || status === "LOADING_ACTUALS" || status === "LOADING_BASELINE"
        ? "SETUP"
        : status === "OPEN_FOR_INPUT" || status === "RETURNED_FOR_CORRECTION"
          ? "DEPT_INPUT"
          : status === "PENDING_FPA_REVIEW"
            ? "FPA_REVIEW"
            : status === "PENDING_CFO_REVIEW"
              ? "CFO_APPROVAL"
              : status === "APPROVED" || status === "LOCKED"
                ? "LOCKED"
                : "SETUP";
    const activeIdx = stageOrder.indexOf(activeKey);

    const defs = [
      {
        key: "SETUP",
        label: "Setup",
        start: cycle.createdAt || null,
        end: cycle.openedAt || null,
      },
      {
        key: "DEPT_INPUT",
        label: "Dept Input",
        start: cycle.openedAt || null,
        end: cycle.fpaReviewAt || null,
      },
      {
        key: "FPA_REVIEW",
        label: "FP&A Review",
        start: cycle.fpaReviewAt || null,
        end: cycle.cfoReviewAt || null,
      },
      {
        key: "CFO_APPROVAL",
        label: "CFO Approval",
        start: cycle.cfoReviewAt || null,
        end: cycle.approvedAt || cycle.lockedAt || null,
      },
      {
        key: "LOCKED",
        label: "Locked",
        start: cycle.lockedAt || null,
        end: cycle.lockedAt || null,
      },
    ];

    return defs.map((d, i) => {
      let st = "PENDING";
      if (status === "LOCKED" && d.key === "LOCKED") st = "DONE";
      else if (i < activeIdx) st = "DONE";
      else if (i === activeIdx) st = status === "LOCKED" && d.key === "LOCKED" ? "DONE" : "ACTIVE";
      else st = "PENDING";
      if (d.key === "LOCKED" && cycle.lockedAt) st = "DONE";
      if (d.key === "CFO_APPROVAL" && cycle.approvedAt && !cycle.lockedAt && activeKey === "LOCKED") {
        st = "DONE";
      }
      return { ...d, status: st };
    });
  }

  static async listCycleTasks(cycleId: string, query: any = {}, user: any) {
    FpaAccessService.assertCanApprove(user);
    const cycle = await FpaWorkflowCollabService.assertCycle(cycleId);
    if (!cycle.workflowId) return [];

    const where: any = { workflowId: cycle.workflowId };
    if (query.status) where.status = String(query.status);
    if (query.departmentId) where.departmentId = String(query.departmentId);
    if (query.assigneeId) where.assigneeId = String(query.assigneeId);
    if (query.priority) {
      const p = mapTaskPriority(query.priority);
      // Include legacy NORMAL rows when filtering MEDIUM
      where.priority = p === "MEDIUM" ? { in: ["MEDIUM", "NORMAL"] } : p;
    }

    const tasks = await prisma.planningTask.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });

    const deptIds = [...new Set(tasks.map((t) => t.departmentId).filter(Boolean))] as string[];
    const userIds = [
      ...new Set(
        tasks
          .flatMap((t) => [t.assigneeId, t.reviewerId])
          .filter(Boolean)
          .map(String)
      ),
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

    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: mapTaskPriority(t.priority),
      departmentId: t.departmentId,
      departmentName: t.departmentId ? deptName[t.departmentId] || null : null,
      department: t.departmentId ? deptName[t.departmentId] || null : null,
      assigneeId: t.assigneeId,
      assigneeName: userDisplayName(userMap[t.assigneeId]),
      reviewerId: t.reviewerId,
      reviewerName: userDisplayName(userMap[t.reviewerId]),
      dueDate: t.dueDate,
      submittedOn: t.submittedAt,
      changeNotes: t.changeNotes || null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  static async exportCycleTasksCsv(cycleId: string, query: any, user: any) {
    const rows = await FpaWorkflowCollabService.listCycleTasks(cycleId, query, user);
    const header = [
      "Task",
      "Department",
      "Assignee",
      "Status",
      "Priority",
      "Due Date",
      "Submitted On",
      "Reviewer",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.title,
          r.departmentName,
          r.assigneeName,
          r.status,
          r.priority,
          r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : "",
          r.submittedOn ? new Date(r.submittedOn).toISOString() : "",
          r.reviewerName,
        ]
          .map(escCsv)
          .join(",")
      );
    }
    return {
      filename: "cycle-tasks.csv",
      contentType: "text/csv; charset=utf-8",
      body: "\uFEFF" + lines.join("\n"),
      rowCount: rows.length,
    };
  }

  static async listApprovalEvents(cycleId: string, user: any) {
    FpaAccessService.assertCanApprove(user);
    const cycle = await FpaWorkflowCollabService.assertCycle(cycleId);
    if (!cycle.workflowId) return [];

    const approvals = await prisma.planningApproval.findMany({
      where: { workflowId: cycle.workflowId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        actor: { select: { id: true, firstName: true, lastName: true, email: true } },
        task: { select: { id: true, title: true, departmentId: true } },
      },
    });

    const actionMap: Record<string, string> = {
      SUBMIT: "SUBMITTED",
      SUBMIT_FPA: "SUBMITTED",
      FPA_ACCEPT: "ACCEPTED",
      APPROVE: "APPROVED",
      CFO_APPROVE: "APPROVED",
      RETURN: "RETURNED",
      FPA_RETURN: "RETURNED",
      CFO_RETURN: "RETURNED",
      LOCK: "LOCKED",
      REASSIGN: "REASSIGNED",
    };

    return approvals.map((a) => ({
      id: a.id,
      actorId: a.actorId,
      actorName: userDisplayName(a.actor),
      action: actionMap[String(a.action).toUpperCase()] || String(a.action).toUpperCase(),
      rawAction: a.action,
      target: a.taskId
        ? { type: "TASK", id: a.taskId, title: a.task?.title || null, departmentId: a.task?.departmentId || null }
        : { type: "CYCLE", id: cycleId, title: cycle.name },
      comment: a.comment,
      commentSnippet: a.comment ? String(a.comment).slice(0, 160) : null,
      createdAt: a.createdAt,
    }));
  }

  static async listComments(opts: { cycleId?: string; taskId?: string }, user: any) {
    const where: any = {};
    if (opts.cycleId) where.cycleId = String(opts.cycleId);
    if (opts.taskId) where.taskId = String(opts.taskId);
    if (!where.cycleId && !where.taskId) {
      throw new FpaError(400, "VALIDATION", "cycleId or taskId required");
    }
    if (!FpaAccessService.canApprove(user)) {
      where.OR = [{ visibility: "ALL" }, { createdById: user.id }];
    }
    const rows = await prisma.planningComment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
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
      visibility: r.visibility || "ALL",
      cycleId: r.cycleId,
      taskId: r.taskId,
      authorId: r.createdById,
      authorName: userDisplayName(byId[r.createdById]),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  static async addComment(
    opts: { cycleId?: string; taskId?: string },
    input: any,
    user: any
  ) {
    const body = String(input?.body || input?.comment || "").trim();
    if (!body) throw new FpaError(400, "VALIDATION", "body is required");
    const visibility = String(input?.visibility || "ALL").toUpperCase() === "INTERNAL" ? "INTERNAL" : "ALL";
    if (visibility === "INTERNAL" && !FpaAccessService.canApprove(user)) {
      throw new FpaError(403, "FORBIDDEN", "Only reviewers can post INTERNAL comments");
    }

    let modelId: string | null = null;
    let cycleId = opts.cycleId ? String(opts.cycleId) : null;
    let taskId = opts.taskId ? String(opts.taskId) : null;

    if (taskId) {
      const { task, cycle } = await FpaWorkflowCollabService.cycleForTask(taskId);
      modelId = task.workflow.modelId;
      if (!cycleId && cycle) cycleId = cycle.id;
    } else if (cycleId) {
      const cycle = await FpaWorkflowCollabService.assertCycle(cycleId);
      modelId = cycle.modelId;
    }
    if (!modelId) throw new FpaError(400, "VALIDATION", "Unable to resolve model for comment");

    const created = await prisma.planningComment.create({
      data: {
        modelId,
        cycleId,
        taskId,
        visibility,
        body,
        createdById: user.id,
      },
    });
    await FpaAuditService.log("WORKFLOW_COMMENT", user.id, {
      modelId,
      reason: body.slice(0, 200),
    });
    return {
      id: created.id,
      body: created.body,
      visibility: created.visibility,
      cycleId: created.cycleId,
      taskId: created.taskId,
      authorId: user.id,
      authorName: userDisplayName(user),
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  static async listAttachments(taskId: string, user: any) {
    await FpaWorkflowCollabService.assertTask(taskId);
    const rows = await prisma.planningAttachment.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
    });
    const userIds = [...new Set(rows.map((r) => r.uploadedById))];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const byId = Object.fromEntries(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      cycleId: r.cycleId,
      fileName: r.fileName,
      mimeType: r.mimeType,
      size: r.sizeBytes,
      sizeBytes: r.sizeBytes,
      fileUrl: r.fileUrl || `/api/v1/fpa/attachments/${r.id}/download`,
      uploadedById: r.uploadedById,
      uploadedByName: userDisplayName(byId[r.uploadedById]),
      uploadedAt: r.createdAt,
      createdAt: r.createdAt,
    }));
  }

  static async uploadAttachment(taskId: string, file: any, user: any) {
    const { task, cycle } = await FpaWorkflowCollabService.cycleForTask(taskId);
    if (!file?.buffer && !file?.data) {
      throw new FpaError(400, "VALIDATION", "file is required (multipart field: file)");
    }
    const buffer = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer || file.data);
    const originalName = String(file.originalname || file.name || "attachment.bin");
    const mimeType = file.mimetype || file.mimeType || "application/octet-stream";

    let fileUrl: string | null = null;
    let storageKey = "";
    try {
      const upload = await new RemoteUploadService().uploadFiles(
        {
          buffer,
          originalname: originalName,
          mimetype: mimeType,
          size: buffer.length,
        } as any,
        "fpa-attachments"
      );
      if (upload?.success && upload.files?.length) {
        fileUrl = upload.files[0].url || upload.files[0].fileUrl || null;
        storageKey = upload.files[0].path || upload.files[0].key || fileUrl || `remote:${originalName}`;
      } else if (!upload?.success) {
        throw new Error(upload?.error || "remote upload failed");
      }
    } catch {
      const dir = path.join(process.cwd(), "storage", "local-upload-mock", "fpa-attachments");
      fs.mkdirSync(dir, { recursive: true });
      const safe = `${Date.now()}-${originalName.replace(/[^\w.\-]+/g, "_")}`;
      const full = path.join(dir, safe);
      fs.writeFileSync(full, buffer);
      storageKey = full;
      fileUrl = null;
    }

    if (!storageKey) {
      throw new FpaError(500, "UPLOAD_FAILED", "Could not store attachment");
    }

    const created = await prisma.planningAttachment.create({
      data: {
        taskId: task.id,
        cycleId: cycle?.id || null,
        fileName: originalName,
        mimeType,
        sizeBytes: buffer.length,
        storageKey,
        fileUrl,
        uploadedById: user.id,
      },
    });
    await FpaAuditService.log("WORKFLOW_ATTACHMENT_UPLOAD", user.id, {
      modelId: task.workflow.modelId,
      newValue: created.id,
    });
    return {
      id: created.id,
      taskId: created.taskId,
      cycleId: created.cycleId,
      fileName: created.fileName,
      mimeType: created.mimeType,
      size: created.sizeBytes,
      sizeBytes: created.sizeBytes,
      fileUrl: created.fileUrl || `/api/v1/fpa/attachments/${created.id}/download`,
      uploadedById: user.id,
      uploadedByName: userDisplayName(user),
      uploadedAt: created.createdAt,
      createdAt: created.createdAt,
    };
  }

  static async getAttachment(id: string) {
    const row = await prisma.planningAttachment.findUnique({ where: { id } });
    if (!row) throw new FpaError(404, "NOT_FOUND", "Attachment not found");
    return row;
  }

  static async downloadAttachment(id: string, user: any) {
    const row = await FpaWorkflowCollabService.getAttachment(id);
    if (row.fileUrl && /^https?:\/\//i.test(row.fileUrl)) {
      return { redirectUrl: row.fileUrl, attachment: row };
    }
    if (row.storageKey && fs.existsSync(row.storageKey)) {
      return {
        streamPath: row.storageKey,
        attachment: row,
      };
    }
    throw new FpaError(404, "NOT_FOUND", "Attachment file missing on storage");
  }

  static async deleteAttachment(id: string, user: any) {
    FpaAccessService.assertCanApprove(user);
    const row = await FpaWorkflowCollabService.getAttachment(id);
    await prisma.planningAttachment.delete({ where: { id } });
    if (row.storageKey && fs.existsSync(row.storageKey) && row.storageKey.includes("fpa-attachments")) {
      try {
        fs.unlinkSync(row.storageKey);
      } catch {
        /* ignore */
      }
    }
    return { id, deleted: true };
  }

  static async taskSummary(taskId: string, user: any) {
    const { task, cycle } = await FpaWorkflowCollabService.cycleForTask(taskId);
    const empty = {
      priorFy: null as number | null,
      request: null as number | null,
      pctChange: null as number | null,
      currency: (cycle?.baseCurrency as string) || "USD",
      changeNotes: task.changeNotes || null,
      lines: [] as any[],
      departmentId: task.departmentId || null,
      taskId: task.id,
      cycleId: cycle?.id || null,
    };
    if (!cycle) return empty;

    const deptId = task.departmentId;
    const cells = await prisma.planningCell.findMany({
      where: {
        modelId: cycle.modelId,
        versionId: cycle.versionId,
        ...(cycle.scenarioId ? { scenarioId: cycle.scenarioId } : {}),
        ...(deptId ? { OR: [{ departmentId: deptId }, { departmentId: null }] } : {}),
      },
      include: { lineItem: { select: { id: true, code: true, name: true, category: true } } },
    });

    if (!cells.length) return empty;

    const byLine: Record<string, { label: string; prior: number; request: number }> = {};
    let priorFy = 0;
    let request = 0;
    for (const c of cells) {
      const key = c.lineItemId;
      const label = c.lineItem?.name || c.lineItem?.code || key;
      if (!byLine[key]) byLine[key] = { label, prior: 0, request: 0 };
      const n = Number(c.value || 0);
      const src = String(c.sourceType || "").toUpperCase();
      if (src === "ACTUAL") {
        byLine[key].prior += n;
        priorFy += n;
      } else {
        byLine[key].request += n;
        request += n;
      }
    }

    const lines = Object.values(byLine)
      .filter((l) => l.prior !== 0 || l.request !== 0)
      .map((l) => ({
        ...l,
        pctChange: l.prior !== 0 ? ((l.request - l.prior) / Math.abs(l.prior)) * 100 : null,
      }))
      .sort((a, b) => Math.abs(b.request) - Math.abs(a.request))
      .slice(0, 50);

    if (!lines.length) return empty;

    const pctChange = priorFy !== 0 ? ((request - priorFy) / Math.abs(priorFy)) * 100 : null;
    return {
      priorFy,
      request,
      pctChange,
      currency: cycle.baseCurrency || "USD",
      lines,
      changeNotes: task.changeNotes || null,
      departmentId: deptId,
      taskId: task.id,
      cycleId: cycle.id,
    };
  }

  /** Activity-based WoW proxies (not fabricated absolute history). */
  static async weekOverWeekDeltas(cycle: any) {
    if (!cycle.workflowId) {
      return { pendingDeltaWoW: 0, returnedDeltaWoW: 0 };
    }
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    const thisWeekStart = new Date(now - week);
    const lastWeekStart = new Date(now - 2 * week);

    const tasks = await prisma.planningTask.findMany({
      where: { workflowId: cycle.workflowId },
      select: { status: true, submittedAt: true, updatedAt: true },
    });
    const approvals = await prisma.planningApproval.findMany({
      where: {
        workflowId: cycle.workflowId,
        action: { in: ["RETURN", "FPA_RETURN", "CFO_RETURN"] },
        createdAt: { gte: lastWeekStart },
      },
      select: { createdAt: true },
    });

    const pendingThis = tasks.filter(
      (t) =>
        ["PENDING", "SUBMITTED"].includes(t.status) &&
        t.submittedAt &&
        new Date(t.submittedAt) >= thisWeekStart
    ).length;
    const pendingLast = tasks.filter(
      (t) =>
        t.submittedAt &&
        new Date(t.submittedAt) >= lastWeekStart &&
        new Date(t.submittedAt) < thisWeekStart
    ).length;

    const returnedThis = approvals.filter((a) => new Date(a.createdAt) >= thisWeekStart).length;
    const returnedLast = approvals.filter(
      (a) => new Date(a.createdAt) >= lastWeekStart && new Date(a.createdAt) < thisWeekStart
    ).length;

    return {
      pendingDeltaWoW: pendingThis - pendingLast,
      returnedDeltaWoW: returnedThis - returnedLast,
    };
  }
}
