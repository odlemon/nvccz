// @ts-nocheck
import { prisma } from "../utils/database";
import { userCanAccessApplication } from "../utils/applicationFundAccess";
import { buildCommentPayload } from "./TaskCollaborationService";
import { FirebaseStorageService } from "./FirebaseStorageService";
import { emitToDeal, emitToUsers } from "./RealtimeSocketService";
import { EmailNotificationService } from "./EmailNotificationService";

const DEAL_COMMENT = "deal_comment";
const DEAL_SYSTEM_MESSAGE = "deal_system_message";

function safeJsonParse<T = any>(value: any, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

export function buildDealCollaborationDeepLink(applicationId: string, commentId?: string | null) {
  return {
    dealId: applicationId,
    commentId: commentId || null,
    path: `/deals/${applicationId}`,
    modalTarget: "deal-card"
  };
}

async function resolveDealAccess(applicationId: string, actorId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      dueDiligenceReview: { select: { reviewerId: true } },
      fund: { select: { id: true, name: true } }
    }
  });

  if (!application) {
    throw new Error("Application not found.");
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    include: { role: true }
  });

  if (!actor) {
    throw new Error("Acting user not found.");
  }

  const allowed = await userCanAccessApplication(actor, {
    id: application.id,
    fundId: application.fundId,
    assignedAnalystId: application.assignedAnalystId,
    dueDiligenceReview: application.dueDiligenceReview
  });

  if (!allowed) {
    throw new Error("Access denied: you do not have permission to view this deal.");
  }

  return { application, actor };
}

async function uploadDealCollaborationFiles(applicationId: string, files: Array<any>) {
  const uploads = await Promise.all(
    (files || []).map(async (file) => {
      const uploaded = await FirebaseStorageService.uploadApplicationDocument(
        file.buffer,
        file.originalname,
        applicationId,
        "DEAL_COLLABORATION_ATTACHMENT"
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

async function loadMentionCandidateUsers(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      dueDiligenceReview: { select: { reviewerId: true } }
    }
  });

  if (!application) {
    return [];
  }

  const idSet = new Set<string>();
  if (application.assignedAnalystId) idSet.add(application.assignedAnalystId);
  if (application.dueDiligenceReview?.reviewerId) {
    idSet.add(application.dueDiligenceReview.reviewerId);
  }

  if (application.fundId) {
    const fms = await prisma.fundManager.findMany({
      where: { fundId: application.fundId, isActive: true },
      select: { userId: true }
    });
    fms.forEach((fm) => idSet.add(fm.userId));
  }

  const execUsers = await prisma.user.findMany({
    where: {
      role: {
        name: { in: ["admin", "ceo", "cio"] }
      }
    },
    select: { id: true }
  });
  execUsers.forEach((u) => idSet.add(u.id));

  const ids = Array.from(idSet).filter(Boolean);
  if (ids.length === 0) {
    return [];
  }

  return prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      userDepartment: true,
      role: { select: { name: true } }
    },
    orderBy: { firstName: "asc" }
  });
}

function mapDealChatRow(comment: any) {
  const payload = safeJsonParse(
    comment.description,
    buildCommentPayload({ content: comment.description || "" })
  );
  return {
    id: comment.id,
    applicationId: comment.applicationId,
    storagePath: `deals/${comment.applicationId}/collaboration/${comment.id}`,
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

export class DealCollaborationService {
  static async listMessages(applicationId: string, actorId: string) {
    await resolveDealAccess(applicationId, actorId);

    const rows = await prisma.activityLog.findMany({
      where: {
        applicationId,
        activityType: { in: [DEAL_COMMENT, DEAL_SYSTEM_MESSAGE] }
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
      orderBy: { createdAt: "asc" }
    });

    return rows.map((row) => mapDealChatRow(row)).filter((row) => !row.isDeleted);
  }

  static async getMentionSuggestions(applicationId: string, actorId: string, query?: string) {
    await resolveDealAccess(applicationId, actorId);

    const search = String(query || "").trim();
    const users = await loadMentionCandidateUsers(applicationId);

    const filtered = search
      ? users.filter((u) => {
          const q = search.toLowerCase();
          return (
            String(u.firstName || "")
              .toLowerCase()
              .includes(q) ||
            String(u.lastName || "")
              .toLowerCase()
              .includes(q) ||
            String(u.email || "")
              .toLowerCase()
              .includes(q)
          );
        })
      : users;

    return filtered.slice(0, 25).map((user) => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email
    }));
  }

  static async getChatMessage(applicationId: string, msgId: string, actorId: string) {
    await resolveDealAccess(applicationId, actorId);

    const comment = await prisma.activityLog.findFirst({
      where: {
        id: msgId,
        applicationId,
        activityType: { in: [DEAL_COMMENT, DEAL_SYSTEM_MESSAGE] }
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
      throw new Error("Deal collaboration message not found.");
    }

    return mapDealChatRow(comment);
  }

  static async createMessage(params: {
    applicationId: string;
    actorId: string;
    content: string;
    mentionUserIds?: string[];
    files?: any[];
  }) {
    const { application, actor } = await resolveDealAccess(params.applicationId, params.actorId);

    if (!String(params.content || "").trim()) {
      throw new Error("Message content is required.");
    }

    const uploadedFiles = await uploadDealCollaborationFiles(application.id, params.files || []);

    const candidates = await this.getMentionSuggestions(params.applicationId, params.actorId, "");
    const mentionIdSet = new Set((params.mentionUserIds || []).filter(Boolean));
    const mentions = candidates
      .filter((c) => mentionIdSet.has(c.id))
      .map((c) => ({ userId: c.id, name: c.name }));

    const comment = await prisma.activityLog.create({
      data: {
        applicationId: application.id,
        userId: params.actorId,
        activityType: DEAL_COMMENT,
        title: "Deal collaboration",
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

    const row = mapDealChatRow(comment);

    emitToDeal(application.id, "deal_collaboration_message", {
      applicationId: application.id,
      dealReference: application.dealReference,
      message: row
    });

    if (mentions.length > 0) {
      const deepLinkPayload = buildDealCollaborationDeepLink(application.id, comment.id);
      const businessLabel = application.businessName || application.dealReference || application.id;

      await prisma.notification.createMany({
        data: mentions
          .filter((m) => m.userId !== params.actorId)
          .map((m) => ({
            title: "Deal mention",
            message: `${actor.firstName} ${actor.lastName} mentioned you on deal "${businessLabel}".`,
            type: "DEAL_MENTION",
            userId: m.userId,
            data: deepLinkPayload,
            relatedEntity: "Application",
            relatedEntityId: application.id
          }))
      });

      emitToUsers(
        mentions.filter((m) => m.userId !== params.actorId).map((m) => m.userId),
        "notification_created",
        {
          type: "DEAL_MENTION",
          ...deepLinkPayload
        }
      );

      const targetIds = mentions.filter((m) => m.userId !== params.actorId).map((m) => m.userId);
      if (targetIds.length > 0) {
        const mentionedUsers = await prisma.user.findMany({
          where: { id: { in: targetIds } }
        });
        for (const u of mentionedUsers) {
          if (!u.email) continue;
          EmailNotificationService.sendPortfolioDealFeedMentionEmail({
            recipientName: `${u.firstName} ${u.lastName}`.trim(),
            recipientEmail: u.email,
            authorName: `${actor.firstName} ${actor.lastName}`.trim(),
            businessName: businessLabel,
            applicationId: application.id,
            commentPreview: String(params.content || "").slice(0, 500)
          }).catch((err: any) => {
            console.error("Deal feed mention email failed", {
              userId: u.id,
              error: err?.message
            });
          });
        }
      }
    }

    return row;
  }

  /**
   * Soft-delete own deal collaboration comment (mirrors TaskCollaborationService.deleteTaskComment).
   */
  static async deleteMessage(applicationId: string, messageId: string, actorId: string) {
    await resolveDealAccess(applicationId, actorId);

    const comment = await prisma.activityLog.findUnique({
      where: { id: messageId },
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

    if (
      !comment ||
      comment.applicationId !== applicationId ||
      comment.activityType !== DEAL_COMMENT
    ) {
      throw new Error("Deal collaboration message not found.");
    }

    if (comment.userId !== actorId) {
      throw new Error("You can only delete your own messages.");
    }

    const payload = safeJsonParse(comment.description, buildCommentPayload({ content: "" }));
    const deletedPayload = buildCommentPayload({
      ...payload,
      content: "",
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedById: actorId
    });

    await prisma.activityLog.update({
      where: { id: messageId },
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
      id: messageId,
      applicationId,
      storagePath: `deals/${applicationId}/collaboration/${messageId}`,
      isDeleted: true,
      deletedAt: deletedPayload.deletedAt,
      deletedById: actorId,
      content: null,
      mentions: [],
      attachments: payload.attachments || [],
      author
    };

    emitToDeal(applicationId, "deal_comment_deleted", response);
    emitToDeal(applicationId, "deal_collaboration_message", response);
    return response;
  }
}
