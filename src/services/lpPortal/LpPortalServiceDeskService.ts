// @ts-nocheck
import { prisma } from "../../utils/database";
import {
  LpPortalError,
  assertFundAccess,
  parseListQuery,
} from "../../middleware/lpPortalFoundation";
import { LpPortalAccessService, type LpPortalContext } from "./LpPortalAccessService";
import { LpPortalMfaService } from "./LpPortalMfaService";
import { LpPortalColleagueService } from "./LpPortalColleagueService";
import { LpPortalAttachmentService } from "./LpPortalAttachmentService";
import { LpPortalRealtimeService } from "./LpPortalRealtimeService";

const db = () => prisma as any;

function newRequestReference(): string {
  const part = Date.now().toString(36).toUpperCase().slice(-6);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SR-${part}${rand}`;
}

export class LpPortalServiceDeskService {
  static async listRequests(ctx: LpPortalContext, query: Record<string, unknown> = {}) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const q = parseListQuery(query);
    if (q.fundId) assertFundAccess(ctx, q.fundId);

    const type = query.type ? String(query.type) : undefined;
    const where: any = {
      clientId: ctx.clientId,
      ...(q.fundId ? { fundId: q.fundId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(type ? { requestType: type } : {}),
    };

    const [total, rows] = await Promise.all([
      db().lpServiceRequest.count({ where }),
      db().lpServiceRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: q.skip,
        take: q.take,
        include: { fund: { select: { name: true } } },
      }),
    ]);

    const items = [];
    const userIds = [...new Set(rows.map((r: any) => r.createdById).filter(Boolean))];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds as string[] } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    for (const r of rows.filter(
      (row: any) => !row.fundId || LpPortalAccessService.fundAllowed(ctx, row.fundId)
    )) {
      items.push({
        ...this.mapRequest(r, userById.get(r.createdById)),
        attachments: await LpPortalAttachmentService.listForRequest(ctx, r.id),
      });
    }

    return {
      items,
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  static async createRequest(
    ctx: LpPortalContext,
    body: {
      type: string;
      fundId?: string;
      subject: string;
      description?: string;
      priority?: string;
      attachmentIds?: string[];
    },
    userId?: string
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    if (body.fundId) assertFundAccess(ctx, body.fundId);
    if (!body.subject?.trim()) {
      throw new LpPortalError("LP_VALIDATION", "subject is required", 422, {
        subject: "Required",
      });
    }

    await LpPortalAttachmentService.validateAttachmentIds(ctx, body.attachmentIds);

    const row = await db().lpServiceRequest.create({
      data: {
        reference: newRequestReference(),
        clientId: ctx.clientId,
        fundId: body.fundId || null,
        requestType: String(body.type || "PROFILE_ACCESS").toUpperCase(),
        status: "SUBMITTED",
        priority: String(body.priority || "NORMAL").toUpperCase(),
        subject: body.subject.trim(),
        body: body.description || "",
        createdById: userId || ctx.userId || null,
      },
      include: {
        fund: { select: { name: true } },
      },
    });

    await LpPortalAttachmentService.linkToRequest(ctx, body.attachmentIds || [], row.id);

    if (body.description) {
      await db().lpServiceRequestMessage.create({
        data: {
          requestId: row.id,
          authorType: "INVESTOR",
          authorId: userId || ctx.userId || null,
          body: body.description,
        },
      });
    }

    const mapped = {
      ...this.mapRequest(row),
      attachments: await LpPortalAttachmentService.listForRequest(ctx, row.id),
    };
    void LpPortalRealtimeService.emitRequestCreated(
      ctx.clientId,
      {
        id: row.id,
        reference: row.reference,
        subject: row.subject,
        status: row.status,
        priority: row.priority,
        fundId: row.fundId,
        fundName: row.fund?.name ?? null,
      },
      userId || ctx.userId
    );
    return mapped;
  }

  static async getRequestByReference(ctx: LpPortalContext, reference: string) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const row = await db().lpServiceRequest.findUnique({
      where: { reference },
      include: {
        fund: { select: { name: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!row || row.clientId !== ctx.clientId) {
      throw new LpPortalError("LP_NOT_FOUND", "Service request not found", 404);
    }
    if (row.fundId && !LpPortalAccessService.fundAllowed(ctx, row.fundId)) {
      throw new LpPortalError("LP_NOT_FOUND", "Service request not found", 404);
    }
    return {
      ...this.mapRequest(row, row.createdById ? await prisma.user.findUnique({
        where: { id: row.createdById },
        select: { id: true, email: true, firstName: true, lastName: true },
      }) : null),
      attachments: await LpPortalAttachmentService.listForRequest(ctx, row.id),
      messages: await this.mapRequestMessages(ctx, row.messages || []),
    };
  }

  static async listBankInstructionChanges(ctx: LpPortalContext) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const rows = await db().lpBankInstructionChange.findMany({
      where: { clientId: ctx.clientId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r: any) => ({
      id: r.id,
      fundId: r.fundId,
      status: r.status,
      payload: r.payloadJson,
      createdAt: r.createdAt?.toISOString?.() ?? null,
      updatedAt: r.updatedAt?.toISOString?.() ?? null,
    }));
  }

  static async createBankInstructionChange(
    ctx: LpPortalContext,
    body: Record<string, unknown>,
    userId?: string
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    if (body.fundId) assertFundAccess(ctx, String(body.fundId));
    const mfa = await this.getMfa(ctx, userId);
    if (mfa.requireMfaForLp && !mfa.enabled) {
      throw new LpPortalError("LP_MFA_REQUIRED", "MFA must be enabled to submit bank instruction changes", 403);
    }

    const row = await db().lpBankInstructionChange.create({
      data: {
        clientId: ctx.clientId,
        fundId: body.fundId ? String(body.fundId) : null,
        status: "SUBMITTED",
        requestedById: userId || ctx.userId || null,
        payloadJson: body,
      },
    });
    return { id: row.id, status: row.status, createdAt: row.createdAt?.toISOString?.() ?? null };
  }

  private static async mapRequestMessages(ctx: LpPortalContext, messages: any[]) {
    const ids = messages.map((m) => m.id);
    const attMap = await LpPortalAttachmentService.listForMessages(ctx, ids);
    return messages.map((m: any) => ({
      id: m.id,
      authorType: m.authorType,
      authorId: m.authorId,
      body: m.body,
      attachments: attMap.get(m.id) || [],
      createdAt: m.createdAt?.toISOString?.() ?? null,
    }));
  }

  static async addRequestMessage(
    ctx: LpPortalContext,
    reference: string,
    body: { body: string; attachmentIds?: string[] },
    userId?: string
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    if (!body.body?.trim()) {
      throw new LpPortalError("LP_VALIDATION", "body is required", 422, { body: "Required" });
    }
    const req = await db().lpServiceRequest.findUnique({ where: { reference } });
    if (!req || req.clientId !== ctx.clientId) {
      throw new LpPortalError("LP_NOT_FOUND", "Service request not found", 404);
    }

    await LpPortalAttachmentService.validateAttachmentIds(ctx, body.attachmentIds);

    const msg = await db().lpServiceRequestMessage.create({
      data: {
        requestId: req.id,
        authorType: "INVESTOR",
        authorId: userId || ctx.userId || null,
        body: body.body.trim(),
      },
    });

    await LpPortalAttachmentService.linkToMessage(ctx, body.attachmentIds || [], msg.id);

    if (["RESOLVED", "CLOSED"].includes(String(req.status))) {
      await db().lpServiceRequest.update({
        where: { id: req.id },
        data: { status: "AWAITING_INVESTOR" },
      });
      LpPortalRealtimeService.emitRequestUpdated(ctx.clientId, reference, { status: "AWAITING_INVESTOR" });
    }

    const mappedMsg = {
      id: msg.id,
      authorType: msg.authorType,
      body: msg.body,
      attachments: await LpPortalAttachmentService.listForMessages(ctx, [msg.id]).then((m) => m.get(msg.id) || []),
      createdAt: msg.createdAt.toISOString(),
    };
    void LpPortalRealtimeService.emitRequestMessage(
      ctx.clientId,
      reference,
      mappedMsg,
      userId || ctx.userId
    );
    return mappedMsg;
  }

  static async uploadRequestAttachment(
    ctx: LpPortalContext,
    file: { buffer: Buffer; originalname: string; mimetype?: string; size?: number },
    userId?: string
  ) {
    return LpPortalAttachmentService.uploadRequestAttachment(ctx, file, userId);
  }

  static async listThreads(ctx: LpPortalContext, query: Record<string, unknown> = {}) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const q = parseListQuery(query);
    if (q.fundId) assertFundAccess(ctx, q.fundId);

    const where: any = {
      clientId: ctx.clientId,
      ...(q.fundId ? { fundId: q.fundId } : {}),
      ...(q.status ? { status: q.status } : {}),
    };

    const [total, rows] = await Promise.all([
      db().lpMessageThread.count({ where }),
      db().lpMessageThread.findMany({
        where,
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
        skip: q.skip,
        take: q.take,
        include: {
          fund: { select: { name: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
    ]);

    const items = [];
    for (const t of rows) {
      if (t.fundId && !LpPortalAccessService.fundAllowed(ctx, t.fundId)) continue;
      const unread = await db().lpMessage.count({
        where: { threadId: t.id, readAt: null, authorType: "OPS" },
      });
      items.push({
        id: t.id,
        subject: t.subject,
        fundId: t.fundId,
        fundName: t.fund?.name ?? null,
        relatedType: t.relatedType,
        relatedId: t.relatedId,
        status: t.status,
        lastMessageAt: t.lastMessageAt?.toISOString?.() ?? null,
        lastMessagePreview: t.messages?.[0]?.body?.slice(0, 160) ?? null,
        unreadCount: unread,
      });
    }

    return { items, page: q.page, pageSize: q.pageSize, total };
  }

  static async getThread(ctx: LpPortalContext, threadId: string) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const thread = await db().lpMessageThread.findUnique({
      where: { id: threadId },
      include: {
        fund: { select: { name: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!thread || thread.clientId !== ctx.clientId) {
      throw new LpPortalError("LP_NOT_FOUND", "Thread not found", 404);
    }
    if (thread.fundId && !LpPortalAccessService.fundAllowed(ctx, thread.fundId)) {
      throw new LpPortalError("LP_NOT_FOUND", "Thread not found", 404);
    }
    const participants = await this.buildThreadParticipants(thread.messages || [], ctx);
    const msgIds = (thread.messages || []).map((m: any) => m.id);
    const attByMsg = await LpPortalAttachmentService.listForMessages(ctx, msgIds);

    return {
      id: thread.id,
      subject: thread.subject,
      fundId: thread.fundId,
      fundName: thread.fund?.name ?? null,
      relatedType: thread.relatedType,
      relatedId: thread.relatedId,
      status: thread.status,
      participants,
      messages: (thread.messages || []).map((m: any) => ({
        id: m.id,
        authorType: m.authorType,
        authorId: m.authorId,
        body: m.body,
        attachments: attByMsg.get(m.id) || [],
        readAt: m.readAt?.toISOString?.() ?? null,
        createdAt: m.createdAt?.toISOString?.() ?? null,
      })),
    };
  }

  private static async buildThreadParticipants(messages: any[], ctx: LpPortalContext) {
    const authorIds = [...new Set(messages.map((m) => m.authorId).filter(Boolean))];
    if (ctx.userId && !authorIds.includes(ctx.userId)) authorIds.push(ctx.userId);
    const users = authorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: authorIds as string[] } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: `${u.firstName} ${u.lastName}`.trim(),
      initials: `${u.firstName?.[0] || ""}${u.lastName?.[0] || ""}`.toUpperCase(),
    }));
  }

  static async replyToThread(
    ctx: LpPortalContext,
    threadId: string,
    body: { body: string; attachmentIds?: string[] },
    userId?: string
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    if (!body.body?.trim()) {
      throw new LpPortalError("LP_VALIDATION", "body is required", 422, { body: "Required" });
    }
    const thread = await db().lpMessageThread.findUnique({ where: { id: threadId } });
    if (!thread || thread.clientId !== ctx.clientId) {
      throw new LpPortalError("LP_NOT_FOUND", "Thread not found", 404);
    }

    await LpPortalAttachmentService.validateAttachmentIds(ctx, body.attachmentIds);

    const now = new Date();
    const msg = await db().lpMessage.create({
      data: {
        threadId,
        authorType: "INVESTOR",
        authorId: userId || ctx.userId || null,
        body: body.body.trim(),
      },
    });
    await LpPortalAttachmentService.linkToMessage(ctx, body.attachmentIds || [], msg.id);
    await db().lpMessageThread.update({
      where: { id: threadId },
      data: { lastMessageAt: now, status: "OPEN" },
    });

    const mappedMsg = {
      id: msg.id,
      authorType: msg.authorType,
      body: msg.body,
      attachments: await LpPortalAttachmentService.listForMessages(ctx, [msg.id]).then((m) => m.get(msg.id) || []),
      createdAt: msg.createdAt.toISOString(),
    };
    void LpPortalRealtimeService.emitThreadMessage(
      ctx.clientId,
      threadId,
      mappedMsg,
      { subject: thread.subject },
      userId || ctx.userId
    );
    return mappedMsg;
  }

  static async markThreadRead(ctx: LpPortalContext, threadId: string) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const thread = await db().lpMessageThread.findUnique({ where: { id: threadId } });
    if (!thread || thread.clientId !== ctx.clientId) {
      throw new LpPortalError("LP_NOT_FOUND", "Thread not found", 404);
    }

    const result = await db().lpMessage.updateMany({
      where: { threadId, authorType: "OPS", readAt: null },
      data: { readAt: new Date() },
    });

    LpPortalRealtimeService.emitThreadRead(ctx.clientId, threadId, result.count);

    return { threadId, markedRead: result.count };
  }

  static async getOrganisation(ctx: LpPortalContext) {
    const client = await LpPortalAccessService.assertClientActive(ctx.clientId);
    let colleagues: any[] = [];
    try {
      if (ctx.lpRole === "MANAGER" || ctx.isStaff) {
        const list = await LpPortalColleagueService.listColleagues(ctx);
        colleagues = list.data || [];
      }
    } catch {
      colleagues = [];
    }

    return {
      id: client.id,
      legalName: client.legalName,
      investorId: client.investorId,
      email: client.email,
      country: client.country,
      phone: client.phone,
      address: client.address,
      status: client.status,
      lpRole: ctx.lpRole,
      colleagues,
    };
  }

  static async getSettings(ctx: LpPortalContext, userId?: string) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const uid = userId || ctx.userId;
    let prefs = null;
    if (uid) {
      prefs = await db().lpNotificationPrefs.findUnique({
        where: { clientId_userId: { clientId: ctx.clientId, userId: uid } },
      });
    }

    const mfa = await this.getMfa(ctx, uid);
    return {
      notifications: {
        emailCapitalCalls: prefs?.emailCapitalCalls ?? true,
        emailDistributions: prefs?.emailDistributions ?? true,
        emailDocuments: prefs?.emailDocuments ?? true,
        emailMessages: prefs?.emailMessages ?? true,
        emailNotices: prefs?.emailNotices ?? true,
        inAppCapitalCalls: prefs?.inAppCapitalCalls ?? true,
        inAppDistributions: prefs?.inAppDistributions ?? true,
        inAppDocuments: prefs?.inAppDocuments ?? true,
        inAppMessages: prefs?.inAppMessages ?? true,
        inAppNotices: prefs?.inAppNotices ?? true,
        emailDigest: prefs?.emailDigest ?? "WEEKLY",
      },
      mfa,
      presentationCurrency: prefs?.presentationCurrency ?? "USD",
      defaultAsOfPreference: prefs?.defaultAsOfPreference ?? "LATEST",
    };
  }

  static async patchNotifications(
    ctx: LpPortalContext,
    patch: Record<string, unknown>,
    userId?: string
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const uid = userId || ctx.userId;
    if (!uid) {
      throw new LpPortalError("LP_UNAUTHORIZED", "User required for notification prefs", 401);
    }

    const boolFields = [
      "emailCapitalCalls",
      "emailDistributions",
      "emailDocuments",
      "emailMessages",
      "emailNotices",
      "inAppCapitalCalls",
      "inAppDistributions",
      "inAppDocuments",
      "inAppMessages",
      "inAppNotices",
    ];
    const cleaned: any = {};
    for (const k of boolFields) {
      if (typeof patch[k] === "boolean") cleaned[k] = patch[k];
    }
    if (typeof patch.emailDigest === "string") cleaned.emailDigest = patch.emailDigest;
    if (typeof patch.presentationCurrency === "string") {
      cleaned.presentationCurrency = patch.presentationCurrency;
    }
    if (typeof patch.defaultAsOfPreference === "string") {
      cleaned.defaultAsOfPreference = patch.defaultAsOfPreference;
    }

    const row = await db().lpNotificationPrefs.upsert({
      where: { clientId_userId: { clientId: ctx.clientId, userId: uid } },
      create: {
        clientId: ctx.clientId,
        userId: uid,
        ...cleaned,
      },
      update: cleaned,
    });

    return {
      emailCapitalCalls: row.emailCapitalCalls,
      emailDistributions: row.emailDistributions,
      emailDocuments: row.emailDocuments,
      emailMessages: row.emailMessages,
      emailNotices: row.emailNotices,
      inAppCapitalCalls: row.inAppCapitalCalls,
      inAppDistributions: row.inAppDistributions,
      inAppDocuments: row.inAppDocuments,
      inAppMessages: row.inAppMessages,
      inAppNotices: row.inAppNotices,
      emailDigest: row.emailDigest,
      presentationCurrency: row.presentationCurrency,
      defaultAsOfPreference: row.defaultAsOfPreference,
    };
  }

  static async patchDisplaySettings(
    ctx: LpPortalContext,
    patch: { presentationCurrency?: string; defaultAsOfPreference?: string },
    userId?: string
  ) {
    return this.patchNotifications(ctx, patch, userId);
  }

  static async getMfa(ctx: LpPortalContext, userId?: string) {
    const uid = userId || ctx.userId;
    const policy = await LpPortalMfaService.getPolicy();
    let enabled = false;
    let enabledAt: string | null = null;
    if (uid) {
      const totp = await prisma.userMfaTotp.findUnique({ where: { userId: uid } });
      enabled = Boolean(totp?.enabledAt);
      enabledAt = totp?.enabledAt?.toISOString?.() ?? null;
    }
    return {
      requireMfaForLp: Boolean(policy.requireMfaForLp),
      issuerName: policy.issuerName,
      enabled,
      enabledAt,
      manageUrls: {
        enroll: "/api/auth/mfa/enroll",
        confirmEnrollment: "/api/auth/mfa/confirm-enrollment",
        changePassword: "/api/auth/change-password",
      },
    };
  }

  private static mapRequest(r: any, createdBy?: { id: string; email: string; firstName: string; lastName: string } | null) {
    const submittedBy = r.createdById
      ? {
          id: r.createdById,
          email: createdBy?.email ?? r.createdBy?.email ?? null,
          name: createdBy
            ? `${createdBy.firstName || ""} ${createdBy.lastName || ""}`.trim()
            : r.createdBy
              ? `${r.createdBy.firstName || ""} ${r.createdBy.lastName || ""}`.trim()
              : null,
        }
      : null;
    return {
      id: r.id,
      reference: r.reference,
      type: r.requestType,
      fundId: r.fundId,
      fundName: r.fund?.name ?? null,
      status: r.status,
      priority: r.priority || "NORMAL",
      subject: r.subject,
      description: r.body,
      submittedBy,
      createdBy: submittedBy,
      createdAt: r.createdAt?.toISOString?.() ?? null,
      updatedAt: r.updatedAt?.toISOString?.() ?? null,
    };
  }
}
