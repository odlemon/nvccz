// @ts-nocheck
import { prisma } from "../../utils/database";
import { LpPortalAccessService, type LpPortalContext } from "./LpPortalAccessService";
import { LpPortalCapitalActivityService } from "./LpPortalCapitalActivityService";

const db = () => prisma as any;

export class LpPortalNotificationsService {
  static async listFeed(ctx: LpPortalContext, opts: { limit?: number } = {}) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const limit = Math.min(50, Math.max(1, Number(opts.limit) || 5));
    const items: any[] = [];

    const notices = await db().lpNotice.findMany({
      where: { status: { in: ["PUBLISHED", "DELIVERED"] } },
      include: { fund: { select: { name: true } } },
      orderBy: { publishedAt: "desc" },
      take: 20,
    });
    for (const n of notices) {
      if (n.fundId && !LpPortalAccessService.fundAllowed(ctx, n.fundId)) continue;
      if (n.clientId && n.clientId !== ctx.clientId) continue;
      const receipt = await db().lpNoticeReceipt.findFirst({
        where: { noticeId: n.id, clientId: ctx.clientId, acknowledgedAt: { not: null } },
      });
      if (receipt) continue;
      items.push({
        id: `notif_notice_${n.id}`,
        type: "NOTICE",
        title: n.title,
        fundName: n.fund?.name ?? null,
        href: `/lp-portal/notices?id=${n.id}`,
        createdAt: n.publishedAt?.toISOString?.() ?? n.createdAt?.toISOString?.() ?? null,
      });
    }

    const requests = await db().lpServiceRequest.findMany({
      where: { clientId: ctx.clientId, status: { in: ["OPEN", "SUBMITTED", "AWAITING_INVESTOR"] } },
      include: { fund: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });
    for (const r of requests) {
      items.push({
        id: `notif_req_${r.id}`,
        type: "REQUEST",
        title: r.subject,
        fundName: r.fund?.name ?? null,
        href: `/lp-portal/requests?ref=${r.reference}`,
        createdAt: r.updatedAt?.toISOString?.() ?? null,
      });
    }

    const { items: openCalls } = await LpPortalCapitalActivityService.listCapitalCalls(ctx, {
      page: 1,
      pageSize: 10,
    });
    for (const c of openCalls) {
      if (!["ISSUED", "OVERDUE", "ACKNOWLEDGED"].includes(c.status)) continue;
      items.push({
        id: `notif_cc_${c.id}`,
        type: "CAPITAL_CALL",
        title: `Capital Call #${c.callNo} due ${c.dueDate || "soon"}`,
        fundName: c.fundName ?? null,
        href: "/lp-portal/capital-activity?tab=calls",
        createdAt: c.dueDate ? `${c.dueDate}T00:00:00.000Z` : null,
      });
    }

    items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return { items: items.slice(0, limit) };
  }
}
