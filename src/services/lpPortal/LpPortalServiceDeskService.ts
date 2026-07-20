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

    return {
      items: rows
        .filter((r: any) => !r.fundId || LpPortalAccessService.fundAllowed(ctx, r.fundId))
        .map((r: any) => this.mapRequest(r)),
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

    const row = await db().lpServiceRequest.create({
      data: {
        reference: newRequestReference(),
        clientId: ctx.clientId,
        fundId: body.fundId || null,
        requestType: String(body.type || "PROFILE_ACCESS").toUpperCase(),
        status: "SUBMITTED",
        subject: body.subject.trim(),
        body: body.description || "",
        createdById: userId || ctx.userId || null,
      },
      include: { fund: { select: { name: true } } },
    });

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

    return this.mapRequest(row);
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
      ...this.mapRequest(row),
      messages: (row.messages || []).map((m: any) => ({
        id: m.id,
        authorType: m.authorType,
        authorId: m.authorId,
        body: m.body,
        createdAt: m.createdAt?.toISOString?.() ?? null,
      })),
    };
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

    const msg = await db().lpServiceRequestMessage.create({
      data: {
        requestId: req.id,
        authorType: "INVESTOR",
        authorId: userId || ctx.userId || null,
        body: body.body.trim(),
      },
    });

    if (["RESOLVED", "CLOSED"].includes(String(req.status))) {
      await db().lpServiceRequest.update({
        where: { id: req.id },
        data: { status: "AWAITING_INVESTOR" },
      });
    }

    return {
      id: msg.id,
      authorType: msg.authorType,
      body: msg.body,
      createdAt: msg.createdAt.toISOString(),
    };
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
    return {
      id: thread.id,
      subject: thread.subject,
      fundId: thread.fundId,
      fundName: thread.fund?.name ?? null,
      relatedType: thread.relatedType,
      relatedId: thread.relatedId,
      status: thread.status,
      messages: (thread.messages || []).map((m: any) => ({
        id: m.id,
        authorType: m.authorType,
        authorId: m.authorId,
        body: m.body,
        readAt: m.readAt?.toISOString?.() ?? null,
        createdAt: m.createdAt?.toISOString?.() ?? null,
      })),
    };
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

    const now = new Date();
    const msg = await db().lpMessage.create({
      data: {
        threadId,
        authorType: "INVESTOR",
        authorId: userId || ctx.userId || null,
        body: body.body.trim(),
      },
    });
    await db().lpMessageThread.update({
      where: { id: threadId },
      data: { lastMessageAt: now, status: "OPEN" },
    });

    return {
      id: msg.id,
      authorType: msg.authorType,
      body: msg.body,
      createdAt: msg.createdAt.toISOString(),
    };
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
      },
      mfa,
      presentationCurrency: "USD",
    };
  }

  static async patchNotifications(
    ctx: LpPortalContext,
    patch: {
      emailCapitalCalls?: boolean;
      emailDistributions?: boolean;
      emailDocuments?: boolean;
      emailMessages?: boolean;
      emailNotices?: boolean;
    },
    userId?: string
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const uid = userId || ctx.userId;
    if (!uid) {
      throw new LpPortalError("LP_UNAUTHORIZED", "User required for notification prefs", 401);
    }

    const data = {
      emailCapitalCalls: patch.emailCapitalCalls,
      emailDistributions: patch.emailDistributions,
      emailDocuments: patch.emailDocuments,
      emailMessages: patch.emailMessages,
      emailNotices: patch.emailNotices,
    };
    const cleaned: any = {};
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "boolean") cleaned[k] = v;
    }

    const row = await db().lpNotificationPrefs.upsert({
      where: { clientId_userId: { clientId: ctx.clientId, userId: uid } },
      create: {
        clientId: ctx.clientId,
        userId: uid,
        emailCapitalCalls: cleaned.emailCapitalCalls ?? true,
        emailDistributions: cleaned.emailDistributions ?? true,
        emailDocuments: cleaned.emailDocuments ?? true,
        emailMessages: cleaned.emailMessages ?? true,
        emailNotices: cleaned.emailNotices ?? true,
      },
      update: cleaned,
    });

    return {
      emailCapitalCalls: row.emailCapitalCalls,
      emailDistributions: row.emailDistributions,
      emailDocuments: row.emailDocuments,
      emailMessages: row.emailMessages,
      emailNotices: row.emailNotices,
    };
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
    };
  }

  private static mapRequest(r: any) {
    return {
      id: r.id,
      reference: r.reference,
      type: r.requestType,
      fundId: r.fundId,
      fundName: r.fund?.name ?? null,
      status: r.status,
      subject: r.subject,
      description: r.body,
      createdAt: r.createdAt?.toISOString?.() ?? null,
      updatedAt: r.updatedAt?.toISOString?.() ?? null,
    };
  }
}
