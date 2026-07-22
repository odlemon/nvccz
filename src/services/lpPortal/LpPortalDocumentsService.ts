// @ts-nocheck
import { prisma } from "../../utils/database";
import {
  LpPortalError,
  assertFundAccess,
  parseListQuery,
} from "../../middleware/lpPortalFoundation";
import { LpPortalAccessService, type LpPortalContext } from "./LpPortalAccessService";
import { LpPortalVaultService } from "./LpPortalVaultService";
import { LpPortalRealtimeService } from "./LpPortalRealtimeService";

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
    const doc = await LpPortalVaultService.getDocumentForClient(ctx, documentId);
    const mime = doc.mimeType || "application/pdf";
    if (mime !== "application/pdf" && !mime.startsWith("image/")) {
      throw new LpPortalError(
        "LP_UNSUPPORTED_MEDIA",
        "Preview is only available for PDF and image documents",
        415,
        undefined,
        { mimeType: mime }
      );
    }
    const result = await LpPortalVaultService.download(ctx, documentId);
    await this.audit(ctx, documentId, "PREVIEW", meta);
    return { ...result, preview: true, mimeType: mime };
  }

  static async summary(ctx: LpPortalContext) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const rows = await prisma.lpPortalDocument.findMany({
      where: { clientId: ctx.clientId },
      select: { category: true, publishedAt: true, fundId: true },
    });
    const visible = rows.filter(
      (r) => !r.fundId || LpPortalAccessService.fundAllowed(ctx, r.fundId)
    );
    const byCategory = new Map<string, number>();
    for (const r of visible) {
      byCategory.set(r.category, (byCategory.get(r.category) || 0) + 1);
    }
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const ytdStart = new Date(new Date().getFullYear(), 0, 1);
    const ytdDownloads = await db().lpDocumentAccessAudit.count({
      where: { clientId: ctx.clientId, action: "DOWNLOAD", createdAt: { gte: ytdStart } },
    });
    const newThisWeek = visible.filter(
      (r) => r.publishedAt && new Date(r.publishedAt) >= weekAgo
    ).length;

    return {
      total: visible.length,
      newThisWeek,
      requiresSignature: 0,
      secureDownloadsYtd: ytdDownloads,
      byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, count })),
    };
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
      include: { fund: { select: { name: true } } },
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
        category: n.category || this.inferNoticeCategory(n.title),
        kind: n.category || this.inferNoticeCategory(n.title),
        status: receipt?.acknowledgedAt
          ? "ACKNOWLEDGED"
          : receipt?.openedAt
            ? "OPENED"
            : n.status || "PUBLISHED",
        fundId: n.fundId,
        fundName: n.fund?.name ?? null,
        shareClass: n.shareClass,
        requiresAcknowledgement: true,
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
    const notice = await db().lpNotice.findUnique({
      where: { id: noticeId },
      include: { fund: { select: { name: true } } },
    });
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
      void LpPortalRealtimeService.emitNoticeUpdated(ctx.clientId, {
        id: notice.id,
        title: notice.title,
        status: "OPENED",
        fundId: notice.fundId,
        fundName: notice.fund?.name ?? null,
      });
    } else if (!existing.openedAt) {
      await db().lpNoticeReceipt.update({
        where: { id: existing.id },
        data: { openedAt: new Date() },
      });
      void LpPortalRealtimeService.emitNoticeUpdated(ctx.clientId, {
        id: notice.id,
        title: notice.title,
        status: "OPENED",
        fundId: notice.fundId,
        fundName: notice.fund?.name ?? null,
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
      category: notice.category || this.inferNoticeCategory(notice.title),
      kind: notice.category || this.inferNoticeCategory(notice.title),
      status: receipt?.acknowledgedAt
        ? "ACKNOWLEDGED"
        : receipt?.openedAt
          ? "OPENED"
          : notice.status,
      fundId: notice.fundId,
      fundName: notice.fund?.name ?? null,
      shareClass: notice.shareClass,
      requiresAcknowledgement: true,
      publishedAt: notice.publishedAt?.toISOString?.() ?? null,
      openedAt: receipt?.openedAt?.toISOString?.() ?? null,
      acknowledgedAt: receipt?.acknowledgedAt?.toISOString?.() ?? null,
    };
  }

  static async acknowledgeNotice(ctx: LpPortalContext, noticeId: string, userId?: string) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const notice = await db().lpNotice.findUnique({
      where: { id: noticeId },
      include: { fund: { select: { name: true } } },
    });
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

    void LpPortalRealtimeService.emitNoticeUpdated(ctx.clientId, {
      id: notice.id,
      title: notice.title,
      status: "ACKNOWLEDGED",
      fundId: notice.fundId,
      fundName: notice.fund?.name ?? null,
    });

    return { acknowledgedAt: receipt.acknowledgedAt.toISOString() };
  }

  static async publishNoticeRealtime(clientId: string, notice: Record<string, unknown>) {
    void LpPortalRealtimeService.emitNoticeUpdated(clientId, {
      id: String(notice.id),
      title: String(notice.title || ""),
      status: "PUBLISHED",
      fundId: (notice.fundId as string) ?? null,
      fundName: (notice.fundName as string) ?? null,
    });
  }

  // —— internals ——

  private static inferNoticeCategory(title: string): string {
    const t = String(title || "").toLowerCase();
    if (t.includes("capital call") || t.includes("call #")) return "CAPITAL_CALL";
    if (t.includes("report") || t.includes("letter") || t.includes("quarterly")) return "REPORT";
    if (t.includes("policy") || t.includes("terms")) return "POLICY";
    return "GENERAL";
  }

  private static noticeVisible(ctx: LpPortalContext, n: any): boolean {
    if (n.clientId && n.clientId !== ctx.clientId) return false;
    if (n.userId && ctx.userId && n.userId !== ctx.userId) return false;
    if (n.fundId && !LpPortalAccessService.fundAllowed(ctx, n.fundId)) return false;
    if (n.targetType === "ORG" && n.clientId !== ctx.clientId) return false;
    if (n.targetType === "USER" && n.userId && ctx.userId && n.userId !== ctx.userId) return false;
    return true;
  }

  private static mapDoc(d: any) {
    const fileSizeBytes =
      d.fileSizeBytes != null
        ? Number(typeof d.fileSizeBytes === "bigint" ? d.fileSizeBytes : d.fileSizeBytes)
        : null;
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
      mimeType: d.mimeType || "application/pdf",
      fileSizeBytes,
      pageCount: d.pageCount ?? null,
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
