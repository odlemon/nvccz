// @ts-nocheck
import { prisma } from "../utils/database";
import { FirebaseStorageService } from "./FirebaseStorageService";
import { emailTransport, getFromAddress } from "../config/email.config";
import { emitToTask, emitToUser, emitToUsers } from "./RealtimeSocketService";
import { EmailNotificationService } from "./EmailNotificationService";

export const TASK_STAGE_OPTIONS = [
  { code: "todo", label: "To Do", zone: "NEUTRAL" },
  { code: "delayed", label: "Delayed", zone: "AMBER" },
  { code: "in_progress", label: "In Progress", zone: "NEUTRAL" },
  { code: "completed", label: "Complete", zone: "GREEN" },
  { code: "amber", label: "Amber", zone: "AMBER" },
  { code: "red", label: "Red", zone: "RED" },
  { code: "overdue", label: "Overdue", zone: "RED" }
];

function normaliseTeam(team: any): string[] {
  if (!team) return [];
  if (Array.isArray(team)) return team.filter(Boolean);
  if (typeof team === "string") {
    try {
      const parsed = JSON.parse(team);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function safeJsonParse<T = any>(value: any, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

/** Shared JSON shape for task + deal collaboration rows in `activity_logs.description`. Export only; logic unchanged. */
export function buildCommentPayload(input: any) {
  return {
    kind: input.kind || "comment",
    content: input.content || "",
    mentions: Array.isArray(input.mentions) ? input.mentions : [],
    attachments: Array.isArray(input.attachments) ? input.attachments : [],
    isDeleted: Boolean(input.isDeleted),
    deletedAt: input.deletedAt || null,
    deletedById: input.deletedById || null,
    eventType: input.eventType || null,
    createdAt: input.createdAt || new Date().toISOString()
  };
}

export function buildTaskDeepLink(taskId: string, commentId?: string, applicationId?: string | null) {
  const dealId = applicationId || null;
  if (dealId) {
    return {
      taskId,
      commentId: commentId || null,
      dealId,
      path: `/deals/${dealId}`,
      taskPath: `/tasks/${taskId}`,
      modalTarget: "deal-card"
    };
  }
  return {
    taskId,
    commentId: commentId || null,
    path: `/tasks/${taskId}`,
    modalTarget: "kanban-task"
  };
}

function decodeBase64Attachment(contentBase64: string, maxBytes = 5 * 1024 * 1024): Buffer {
  if (!contentBase64 || typeof contentBase64 !== "string") {
    throw new Error("contentBase64 is required.");
  }

  const normalized = contentBase64.includes(",")
    ? contentBase64.slice(contentBase64.indexOf(",") + 1)
    : contentBase64;
  const buffer = Buffer.from(normalized, "base64");

  if (!buffer || buffer.length === 0) {
    throw new Error("Attachment payload is empty.");
  }
  if (buffer.length > maxBytes) {
    throw new Error("Attachment exceeds 5MB limit.");
  }
  return buffer;
}

export function normaliseTaskStage(stage: string) {
  const value = String(stage || "").trim().toLowerCase();
  if (!value) return "todo";
  if (value === "in progress" || value === "started") return "in_progress";
  if (value === "complete") return "completed";
  return value;
}

/** Short label for task chat system lines (E.09), e.g. in_progress → "Started". */
export function taskStageChatLabel(stage: string) {
  const normalized = normaliseTaskStage(stage);
  const map: Record<string, string> = {
    todo: "To Do",
    delayed: "Delayed",
    in_progress: "Started",
    completed: "Complete",
    amber: "Amber",
    red: "Red",
    overdue: "Overdue"
  };
  return map[normalized] || normalized;
}

/**
 * C.06 — Past clock time vs due `date` (e.g. 10:01 after 10:00) without waiting for a separate write
 * to flip `isOverdue` in the DB. Excludes trashed and completed work.
 */
export function isTaskPastDueByClock(task: any): boolean {
  if (!task || task.isTrashed) return false;
  const stage = normaliseTaskStage(task?.stage);
  if (stage === "completed") return false;
  const d = task.date != null ? new Date(task.date) : null;
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

export type TaskOverdueFields = {
  stage: string;
  isOverdue: boolean;
  overdueStatus: string | null;
  originalStage: string | null;
};

/**
 * Due date drives stage: past due (non-completed) → `overdue`, ignoring a fresh todo/in_progress from the client.
 */
export function resolveTaskStageAndOverdueFields(
  requestedStage: string,
  dueDate: Date,
  existing?: { stage?: string | null; isOverdue?: boolean; originalStage?: string | null }
): TaskOverdueFields {
  const requestedNorm = normaliseTaskStage(requestedStage || "todo");
  if (requestedNorm === "completed") {
    return {
      stage: "completed",
      isOverdue: false,
      overdueStatus: null,
      originalStage: null
    };
  }

  const pastDue = dueDate.getTime() < Date.now();
  if (!pastDue) {
    return {
      stage: requestedNorm,
      isOverdue: false,
      overdueStatus: null,
      originalStage: null
    };
  }

  const prior =
    existing?.originalStage != null && String(existing.originalStage).trim() !== ""
      ? normaliseTaskStage(String(existing.originalStage))
      : existing?.stage && normaliseTaskStage(existing.stage) !== "overdue"
        ? normaliseTaskStage(existing.stage)
        : requestedNorm;

  return {
    stage: "overdue",
    isOverdue: true,
    overdueStatus: `overdue_${prior}`,
    originalStage: prior
  };
}

/** Shape task for API when due date has passed (no extra DB round-trip on list endpoints). */
export function applyDueDateStageToTask<T extends Record<string, unknown>>(task: T): T {
  if (!task || task.isTrashed) return task;
  if (!isTaskPastDueByClock(task)) return task;
  const resolved = resolveTaskStageAndOverdueFields(
    String(task.stage || "todo"),
    new Date(task.date as string | Date),
    {
      stage: task.stage as string,
      isOverdue: Boolean(task.isOverdue),
      originalStage: task.originalStage as string | null
    }
  );
  return { ...task, ...resolved };
}

export function isRedZoneTask(task: any) {
  const stage = normaliseTaskStage(task?.stage);
  if (stage === "red" || stage === "overdue" || Boolean(task?.isOverdue)) {
    return true;
  }
  return isTaskPastDueByClock(task);
}

/** Task is in overdue state (persisted flag, overdue stage, or past due date). */
export function isTaskInOverdueState(task: any): boolean {
  if (!task || task.isTrashed) return false;
  if (normaliseTaskStage(task.stage) === "completed") return false;
  return (
    Boolean(task.isOverdue) ||
    normaliseTaskStage(task.stage) === "overdue" ||
    isTaskPastDueByClock(task)
  );
}

/** API-facing zone label (C.06 RED ZONE, delayed → AMBER ZONE, etc.). */
export function resolveTaskPerformanceZone(task: any): string {
  if (!task) return "NEUTRAL";
  if (isRedZoneTask(task)) return "RED ZONE";
  const stage = normaliseTaskStage(task?.stage);
  const row = TASK_STAGE_OPTIONS.find((o) => o.code === stage);
  if (row?.zone === "AMBER") return "AMBER ZONE";
  if (row?.zone === "GREEN") return "GREEN ZONE";
  return "NEUTRAL";
}

async function resolveTaskAccess(taskId: string, actorId: string) {
  const [task, actor] = await Promise.all([
    prisma.task.findUnique({
      where: { id: taskId },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    }),
    prisma.user.findUnique({
      where: { id: actorId },
      include: {
        role: true,
        department: true
      }
    })
  ]);

  if (!task) {
    throw new Error("Task not found.");
  }

  if (!actor) {
    throw new Error("Acting user not found.");
  }

  const roleName = String(actor.role?.name || actor.roleCode || "").toLowerCase();
  const actorDepartment = actor.userDepartment || actor.department?.name || null;
  const teamIds = normaliseTeam(task.team);
  const canAccess =
    roleName === "admin" ||
    roleName === "ceo" ||
    task.createdBy === actorId ||
    teamIds.includes(actorId) ||
    (!!task.department && !!actorDepartment && task.department === actorDepartment);

  if (!canAccess) {
    throw new Error("Access denied: you do not have permission to collaborate on this task.");
  }

  return { task, actor, teamIds };
}

async function uploadTaskFiles(taskId: string, files: Array<any>) {
  const uploads = await Promise.all(
    (files || []).map(async (file) => {
      const uploaded = await FirebaseStorageService.uploadApplicationDocument(
        file.buffer,
        file.originalname,
        taskId,
        "TASK_ATTACHMENT"
      );

      return {
        fileName: file.originalname,
        fileUrl: uploaded.downloadURL,
        filePath: uploaded.filePath,
        fileSize: file.size || null,
        mimeType: file.mimetype || null,
        uploadedAt: new Date().toISOString()
      };
    })
  );

  return uploads;
}

export class TaskCollaborationService {
  static getTaskStageOptions() {
    return TASK_STAGE_OPTIONS;
  }

  static async createSystemMessage(params: {
    taskId: string;
    actorId: string;
    content: string;
    eventType: string;
    metadata?: any;
  }) {
    const { task } = await resolveTaskAccess(params.taskId, params.actorId);
    const created = await prisma.activityLog.create({
      data: {
        taskId: task.id,
        userId: params.actorId,
        activityType: "task_system_message",
        title: "System Message",
        description: JSON.stringify(
          buildCommentPayload({
            kind: "system",
            content: params.content,
            eventType: params.eventType,
            attachments: [],
            mentions: [],
            metadata: params.metadata || null
          })
        ),
        status: "approved"
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });
    emitToTask(task.id, "task_system_message", {
      taskId: task.id,
      content: params.content,
      eventType: params.eventType,
      createdAt: new Date().toISOString()
    });
    return created;
  }

  /** E.09 — "{First Last} moved task to {Started|…}." in task chat + realtime `task_message`. */
  static async createTaskStatusChangedSystemMessage(params: {
    taskId: string;
    actorId: string;
    newStage: string;
    variant?: "default" | "bulk";
  }) {
    const actor = await prisma.user.findUnique({
      where: { id: params.actorId },
      select: { firstName: true, lastName: true }
    });
    const displayName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : "Someone";
    const label = taskStageChatLabel(params.newStage);
    const content =
      params.variant === "bulk"
        ? `${displayName} moved task to ${label} during a bulk update.`
        : `${displayName} moved task to ${label}.`;

    const created = await this.createSystemMessage({
      taskId: params.taskId,
      actorId: params.actorId,
      content,
      eventType: "TASK_STATUS_CHANGED"
    });
    emitToTask(params.taskId, "task_message", this.mapTaskChatRow(created));
    return created;
  }

  static async listTaskComments(taskId: string, actorId: string) {
    await resolveTaskAccess(taskId, actorId);

    const comments = await prisma.activityLog.findMany({
      where: {
        taskId,
        activityType: {
          in: ["task_comment", "task_system_message"]
        }
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return comments
      .map((comment) => this.mapTaskChatRow(comment))
      .filter((row) => !row.isDeleted);
  }

  /** Logical document path (E.03); persisted in `activity_logs` keyed by taskId + id. */
  static taskChatStoragePath(taskId: string, msgId: string) {
    return `tasks/${taskId}/chats/${msgId}`;
  }

  private static mapTaskChatRow(comment: any) {
    const payload = safeJsonParse(comment.description, buildCommentPayload({ content: comment.description || "" }));
    return {
      id: comment.id,
      taskId: comment.taskId,
      storagePath: TaskCollaborationService.taskChatStoragePath(comment.taskId, comment.id),
      activityType: comment.activityType,
      title: comment.title,
      content: payload.isDeleted ? null : payload.content,
      isDeleted: Boolean(payload.isDeleted),
      deletedAt: payload.deletedAt || null,
      deletedById: payload.deletedById || null,
      mentions: payload.mentions || [],
      attachments: payload.attachments || [],
      eventType: payload.eventType || null,
      createdAt: comment.createdAt,
      author: comment.user
        ? {
            id: comment.user.id,
            fullName: `${comment.user.firstName} ${comment.user.lastName}`.trim(),
            email: comment.user.email
          }
        : null
    };
  }

  static async getTaskChatMessage(taskId: string, msgId: string, actorId: string) {
    await resolveTaskAccess(taskId, actorId);

    const comment = await prisma.activityLog.findFirst({
      where: {
        id: msgId,
        taskId,
        activityType: {
          in: ["task_comment", "task_system_message"]
        }
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!comment) {
      throw new Error("Chat message not found");
    }

    return this.mapTaskChatRow(comment);
  }

  static async getMentionSuggestions(taskId: string, actorId: string, query?: string) {
    const { task, teamIds } = await resolveTaskAccess(taskId, actorId);
    const search = String(query || "").trim();
    const candidateIds = Array.from(new Set([...teamIds, task.createdBy].filter(Boolean)));

    const users = await prisma.user.findMany({
      where: {
        id: { in: candidateIds.length > 0 ? candidateIds : ["__none__"] },
        ...(search
          ? {
              OR: [
                { firstName: { contains: search } },
                { lastName: { contains: search } },
                { email: { contains: search } }
              ]
            }
          : {})
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        userDepartment: true,
        role: {
          select: {
            name: true
          }
        }
      },
      take: 15,
      orderBy: {
        firstName: "asc"
      }
    });

    return users.map((user) => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email
    }));
  }

  static async createTaskComment(params: {
    taskId: string;
    actorId: string;
    content: string;
    mentionUserIds?: string[];
    files?: any[];
  }) {
    const { task, actor } = await resolveTaskAccess(params.taskId, params.actorId);

    if (!String(params.content || "").trim()) {
      throw new Error("Comment content is required.");
    }

    const uploadedFiles = await uploadTaskFiles(task.id, params.files || []);
    const mentionCandidates = await this.getMentionSuggestions(task.id, params.actorId);
    const mentionIdSet = new Set((params.mentionUserIds || []).filter(Boolean));
    const mentions = mentionCandidates
      .filter((candidate) => mentionIdSet.has(candidate.id))
      .map((candidate) => ({
        userId: candidate.id,
        name: candidate.name
      }));

    const comment = await prisma.activityLog.create({
      data: {
        taskId: task.id,
        userId: params.actorId,
        activityType: "task_comment",
        title: "Task Comment",
        description: JSON.stringify(
          buildCommentPayload({
            kind: "comment",
            content: params.content,
            mentions,
            attachments: uploadedFiles
          })
        ),
        status: "approved"
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (mentions.length > 0) {
      const deepLinkPayload = buildTaskDeepLink(task.id, comment.id, task.applicationId);
      await prisma.notification.createMany({
        data: mentions
          .filter((mention) => mention.userId !== params.actorId)
          .map((mention) => ({
            title: "Task Mention",
            message: `${actor.firstName} ${actor.lastName} mentioned you in task "${task.title}".`,
            type: "TASK_MENTION",
            userId: mention.userId,
            data: deepLinkPayload,
            relatedEntity: "Task",
            relatedEntityId: task.id
          }))
      });
      emitToUsers(
        mentions
          .filter((mention) => mention.userId !== params.actorId)
          .map((mention) => mention.userId),
        "notification_created",
        {
          type: "TASK_MENTION",
          ...deepLinkPayload
        }
      );

      const targetIds = mentions
        .filter((mention) => mention.userId !== params.actorId)
        .map((mention) => mention.userId);
      if (targetIds.length > 0) {
        const mentionedUsers = await prisma.user.findMany({
          where: { id: { in: targetIds } }
        });
        for (const u of mentionedUsers) {
          if (!u.email) continue;
          EmailNotificationService.sendDealCollaborationMentionEmail({
            recipientName: `${u.firstName} ${u.lastName}`.trim(),
            recipientEmail: u.email,
            authorName: `${actor.firstName} ${actor.lastName}`.trim(),
            taskTitle: task.title,
            dealId: task.applicationId || undefined,
            commentPreview: String(params.content || "").slice(0, 500)
          }).catch((err: any) => {
            console.error("Deal collaboration mention email failed", {
              userId: u.id,
              error: err?.message
            });
          });
        }
      }
    }

    const response = {
      id: comment.id,
      taskId: task.id,
      storagePath: TaskCollaborationService.taskChatStoragePath(task.id, comment.id),
      content: params.content,
      mentions,
      attachments: uploadedFiles,
      createdAt: comment.createdAt,
      author: {
        id: comment.user.id,
        fullName: `${comment.user.firstName} ${comment.user.lastName}`.trim(),
        email: comment.user.email
      }
    };
    emitToTask(task.id, "task_comment_created", response);
    emitToTask(task.id, "task_message", response);
    return response;
  }

  static async deleteTaskComment(taskId: string, commentId: string, actorId: string) {
    await resolveTaskAccess(taskId, actorId);

    const comment = await prisma.activityLog.findUnique({
      where: { id: commentId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!comment || comment.taskId !== taskId || comment.activityType !== "task_comment") {
      throw new Error("Task comment not found.");
    }

    if (comment.userId !== actorId) {
      throw new Error("You can only delete your own task comments.");
    }

    const payload = safeJsonParse(comment.description, buildCommentPayload({ content: comment.description || "" }));
    const deletedPayload = buildCommentPayload({
      ...payload,
      content: "",
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedById: actorId
    });

    await prisma.activityLog.update({
      where: { id: commentId },
      data: {
        description: JSON.stringify(deletedPayload),
        status: "deleted"
      }
    });

    const author = comment.user
      ? {
          id: comment.user.id,
          fullName: `${comment.user.firstName} ${comment.user.lastName}`.trim(),
          email: comment.user.email
        }
      : null;
    const response = {
      id: commentId,
      taskId,
      storagePath: TaskCollaborationService.taskChatStoragePath(taskId, commentId),
      isDeleted: true,
      deletedAt: deletedPayload.deletedAt,
      deletedById: actorId,
      content: null,
      mentions: [],
      attachments: payload.attachments || [],
      author
    };
    emitToTask(taskId, "task_comment_deleted", response);
    emitToTask(taskId, "task_message", response);
    return response;
  }

  static async uploadTaskAttachments(params: {
    taskId: string;
    actorId: string;
    files: any[];
  }) {
    const { task } = await resolveTaskAccess(params.taskId, params.actorId);

    if (!Array.isArray(params.files) || params.files.length === 0) {
      throw new Error("At least one attachment is required.");
    }

    const uploadedFiles = await uploadTaskFiles(task.id, params.files);
    const existingActivities = Array.isArray(task.activities) ? task.activities : [];
    const attachmentActivities = uploadedFiles.map((attachment) => ({
      type: "attachment_upload",
      activity: "Attachment uploaded",
      attachment,
      date: new Date().toISOString(),
      by: params.actorId
    }));
    const mergedActivities = [...existingActivities, ...attachmentActivities];

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        activities: mergedActivities
      }
    });

    await this.createSystemMessage({
      taskId: task.id,
      actorId: params.actorId,
      content: `uploaded ${uploadedFiles.length} attachment(s) to this task.`,
      eventType: "TASK_ATTACHMENT_UPLOADED"
    });

    return {
      taskId: updatedTask.id,
      attachments: uploadedFiles
    };
  }

  static async uploadTaskAttachmentBase64(params: {
    taskId: string;
    actorId: string;
    fileName: string;
    contentBase64: string;
    mimeType?: string;
  }) {
    const { task } = await resolveTaskAccess(params.taskId, params.actorId);
    const safeFileName = String(params.fileName || "").trim();
    if (!safeFileName) {
      throw new Error("fileName is required.");
    }

    const fileBuffer = decodeBase64Attachment(params.contentBase64);
    const uploaded = await FirebaseStorageService.uploadApplicationDocument(
      fileBuffer,
      safeFileName,
      task.id,
      "TASK_ATTACHMENT"
    );

    const attachment = {
      fileName: safeFileName,
      fileUrl: uploaded.downloadURL,
      filePath: uploaded.filePath,
      fileSize: fileBuffer.length,
      mimeType: params.mimeType || null,
      uploadedAt: new Date().toISOString()
    };

    const existingActivities = Array.isArray(task.activities) ? task.activities : [];
    const attachmentActivity = {
      type: "attachment_upload",
      activity: "Attachment uploaded",
      attachment,
      date: new Date().toISOString(),
      by: params.actorId
    };
    const mergedActivities = [...existingActivities, attachmentActivity];

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        activities: mergedActivities
      }
    });

    await this.createSystemMessage({
      taskId: task.id,
      actorId: params.actorId,
      content: "uploaded 1 attachment to this task.",
      eventType: "TASK_ATTACHMENT_UPLOADED"
    });

    return {
      taskId: updatedTask.id,
      attachment,
      attachments: [attachment]
    };
  }

  static async notifyTaskRedZone(params: {
    task: any;
    reason: string;
  }) {
    const teamIds = normaliseTeam(params.task.team);
    const creatorId = params.task.createdBy ? String(params.task.createdBy) : null;
    const recipientIds = [...new Set([...teamIds, creatorId].filter(Boolean))];
    if (recipientIds.length === 0) {
      return { notifiedUsers: 0 };
    }

    const users = await prisma.user.findMany({
      where: {
        id: {
          in: recipientIds
        }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true
      }
    });

    if (users.length === 0) {
      return { notifiedUsers: 0 };
    }

    await prisma.notification.createMany({
      data: users.map((user) => ({
        title: "Task Red Zone Alert",
        message: `Task "${params.task.title}" is in Red Zone. ${params.reason}`,
        type: "TASK_RED_ZONE",
        userId: user.id,
        data: buildTaskDeepLink(params.task.id, undefined, params.task.applicationId),
        relatedEntity: "Task",
        relatedEntityId: params.task.id
      }))
    });
    emitToUsers(
      users.map((user) => user.id),
      "notification_created",
      {
        type: "TASK_RED_ZONE",
        ...buildTaskDeepLink(params.task.id, undefined, params.task.applicationId)
      }
    );

    const from = getFromAddress("platform");
    await Promise.allSettled(
      users
        .filter((user) => Boolean(user.email))
        .map((user) =>
          emailTransport.sendMail({
            from: `"${from.name}" <${from.address}>`,
            to: `"${`${user.firstName} ${user.lastName}`.trim()}" <${user.email}>`,
            subject: `Task Red Zone Alert - ${params.task.title}`,
            html: `
              <p>Dear ${user.firstName},</p>
              <p>The task <strong>${params.task.title}</strong> has entered <strong>Red Zone</strong>.</p>
              <p>${params.reason}</p>
              <p>Please review it in the performance module as soon as possible.</p>
            `
          })
        )
    );

    return {
      notifiedUsers: users.length
    };
  }
}
