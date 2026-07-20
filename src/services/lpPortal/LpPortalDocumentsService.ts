// @ts-nocheck
import { prisma } from "../../utils/database";
import {
  LpPortalError,
  assertFundAccess,
  parseListQuery,
} from "../../middleware/lpPortalFoundation";
import { LpPortalAccessService, type LpPortalContext } from "./LpPortalAccessService";
import { LpPortalVaultService } from "./LpPortalVaultService";

const db = () => prisma as any;

function dateOnly(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

export class LpPortalDocumentsService {
  static async list(ctx: LpPortalContext, query: Record<string, unknown> = {}) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const q = parseListQuery(query);
    if (q.fundId) assertFundAccess(ctx, q.fundId);

    const category = query.category ? String(query.category) : undefined;
    const search = q.search || (query.q ? String(query.q) : undefined);

    const where: any = {
      clientId: ctx.clientId,
      ...(q.fundId ? { fundId: q.fundId } : {}),
      ...(category ? { category } : {}),
      ...(search ? { title: { contains: search } } : {}),
    };

    const rows = await prisma.lpPortalDocument.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      include: { fund: { select: { name: true } } },
    });

    const filtered = rows.filter(
      (r) => !r.fundId || LpPortalAccessService.fundAllowed(ctx, r.fundId)
    );
    const total = filtered.length;
    const items = filtered.slice(q.skip, q.skip + q.take).map((d) => this.mapDoc(d));
    return { items, page: q.page, pageSize: q.pageSize, total };
  }

  static async get(
    ctx: LpPortalContext,
    documentId: string,
    meta: { ipAddress?: string; userAgent?: string; userId?: string } = {}
  ) {
    const doc = await LpPortalVaultService.getDocumentForClient(ctx, documentId);
    await this.audit(ctx, doc.id, "VIEW", meta);
    const history = await db().lpDocumentAccessAudit.findMany({
      where: { documentId: doc.id, clientId: ctx.clientId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return {
      ...this.mapDoc(doc),
      history: history.map((h: any) => ({
        user: h.userId || null,
        action: h.action,
        at: h.createdAt?.toISOString?.() ?? null,
        ip: h.ipAddress || null,
      })),
    };
  }

  static async download(
    ctx: LpPortalContext,
    documentId: string,
    meta: { ipAddress?: string; userAgent?: string; userId?: string } = {}
  ) {
    const result = await LpPortalVaultService.download(ctx, documentId);
    await this.audit(ctx, documentId, "DOWNLOAD", meta);
    return result;
  }

  static async preview(
    ctx: LpPortalContext,
    documentId: string,
    meta: { ipAddress?: string; userAgent?: string; userId?: string } = {}
  ) {
    const result = await LpPortalVaultService.download(ctx, documentId);
    await this.audit(ctx, documentId, "PREVIEW", meta);
    return { ...result, preview: true };
  }

  static async listNotices(ctx: LpPortalContext, query: Record<string, unknown> = {}) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const q = parseListQuery(query);

    const notices = await db().lpNotice.findMany({
      where: {
        status: { in: ["PUBLISHED", "DELIVERED"] },
        OR: [
          { targetType: "ALL" },
          { targetType: "ORG", clientId: ctx.clientId },
          { targetType: "USER", userId: ctx.userId || undefined },
          { targetType: "FUND" },
        ],
      },
      orderBy: { publishedAt: "desc" },
    });

    const visible = notices.filter((n: any) => this.noticeVisible(ctx, n));
    const receipts = await db().lpNoticeReceipt.findMany({
      where: {
        clientId: ctx.clientId,
        noticeId: { in: visible.map((n: any) => n.id) },
      },
    });
    const receiptByNotice = new Map(receipts.map((r: any) => [r.noticeId, r]));

    const items = visible.map((n: any) => {
      const receipt = receiptByNotice.get(n.id);
      return {
        id: n.id,
        title: n.title,
        status: receipt?.acknowledgedAt
          ? "ACKNOWLEDGED"
          : receipt?.openedAt
            ? "OPENED"
            : n.status || "PUBLISHED",
        fundId: n.fundId,
        shareClass: n.shareClass,
        publishedAt: n.publishedAt?.toISOString?.() ?? null,
        acknowledgedAt: receipt?.acknowledgedAt?.toISOString?.() ?? null,
        preview: String(n.body || "").slice(0, 240),
      };
    });

    const total = items.length;
    return {
      items: items.slice(q.skip, q.skip + q.take),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  static async getNotice(
    ctx: LpPortalContext,
    noticeId: string,
    userId?: string
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const notice = await db().lpNotice.findUnique({ where: { id: noticeId } });
    if (!notice || !this.noticeVisible(ctx, notice)) {
      throw new LpPortalError("LP_NOT_FOUND", "Notice not found", 404);
    }

    const existing = await db().lpNoticeReceipt.findFirst({
      where: {
        noticeId,
        clientId: ctx.clientId,
        ...(userId ? { userId } : {}),
      },
    });
    if (!existing) {
      await db().lpNoticeReceipt.create({
        data: {
          noticeId,
          clientId: ctx.clientId,
          userId: userId || ctx.userId || null,
          openedAt: new Date(),
        },
      });
    } else if (!existing.openedAt) {
      await db().lpNoticeReceipt.update({
        where: { id: existing.id },
        data: { openedAt: new Date() },
      });
    }

    const receipt = await db().lpNoticeReceipt.findFirst({
      where: { noticeId, clientId: ctx.clientId },
      orderBy: { createdAt: "desc" },
    });

    return {
      id: notice.id,
      title: notice.title,
      body: notice.body,
      status: receipt?.acknowledgedAt
        ? "ACKNOWLEDGED"
        : receipt?.openedAt
          ? "OPENED"
          : notice.status,
      fundId: notice.fundId,
      shareClass: notice.shareClass,
      publishedAt: notice.publishedAt?.toISOString?.() ?? null,
      openedAt: receipt?.openedAt?.toISOString?.() ?? null,
      acknowledgedAt: receipt?.acknowledgedAt?.toISOString?.() ?? null,
    };
  }

  static async acknowledgeNotice(ctx: LpPortalContext, noticeId: string, userId?: string) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const notice = await db().lpNotice.findUnique({ where: { id: noticeId } });
    if (!notice || !this.noticeVisible(ctx, notice)) {
      throw new LpPortalError("LP_NOT_FOUND", "Notice not found", 404);
    }

    const now = new Date();
    const existing = await db().lpNoticeReceipt.findFirst({
      where: {
        noticeId,
        clientId: ctx.clientId,
        userId: userId || ctx.userId || null,
      },
    });

    let receipt;
    if (existing) {
      receipt = await db().lpNoticeReceipt.update({
        where: { id: existing.id },
        data: {
          openedAt: existing.openedAt || now,
          acknowledgedAt: now,
        },
      });
    } else {
      receipt = await db().lpNoticeReceipt.create({
        data: {
          noticeId,
          clientId: ctx.clientId,
          userId: userId || ctx.userId || null,
          openedAt: now,
          acknowledgedAt: now,
        },
      });
    }

    return { acknowledgedAt: receipt.acknowledgedAt.toISOString() };
  }

  // —— internals ——

  private static noticeVisible(ctx: LpPortalContext, n: any): boolean {
    if (n.clientId && n.clientId !== ctx.clientId) return false;
    if (n.userId && ctx.userId && n.userId !== ctx.userId) return false;
    if (n.fundId && !LpPortalAccessService.fundAllowed(ctx, n.fundId)) return false;
    if (n.targetType === "ORG" && n.clientId !== ctx.clientId) return false;
    if (n.targetType === "USER" && n.userId && ctx.userId && n.userId !== ctx.userId) return false;
    return true;
  }

  private static mapDoc(d: any) {
    return {
      id: d.id,
      name: d.title,
      fundId: d.fundId,
      fundName: d.fund?.name ?? null,
      category: d.category,
      period: null,
      publishedDate: dateOnly(d.publishedAt),
      version: "1.0",
      status: d.publishedAt ? "PUBLISHED" : "DRAFT",
      accessScope: "INVESTOR_ORGANISATION",
      checksumSha256: d.sha256,
      permissions: ["VIEW", "DOWNLOAD"],
      sourceType: d.sourceType,
      sourceRefId: d.sourceRefId,
    };
  }

  private static async audit(
    ctx: LpPortalContext,
    documentId: string,
    action: "VIEW" | "DOWNLOAD" | "PREVIEW",
    meta: { ipAddress?: string; userAgent?: string; userId?: string }
  ) {
    await db().lpDocumentAccessAudit.create({
      data: {
        documentId,
        clientId: ctx.clientId,
        userId: meta.userId || ctx.userId || null,
        action,
        ipAddress: meta.ipAddress || null,
        userAgent: meta.userAgent || null,
      },
    });
  }
}
