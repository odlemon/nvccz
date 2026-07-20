// @ts-nocheck
import { prisma } from "../../utils/database";
import { moneyStr } from "../../middleware/lpPortalFoundation";
import { LpPortalAccessService, type LpPortalContext } from "./LpPortalAccessService";

const db = () => prisma as any;

function dateOnly(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function resolveOperatingModel(fund: { fundPurpose?: string }, ctxRow: any): "PRIVATE_CAPITAL" | "OPEN_ENDED" {
  if (ctxRow?.operatingModel === "OPEN_ENDED" || ctxRow?.operatingModel === "PRIVATE_CAPITAL") {
    return ctxRow.operatingModel;
  }
  // LISTED_EQUITY funds default to OPEN_ENDED when context missing; otherwise PRIVATE_CAPITAL
  if (String(fund?.fundPurpose || "") === "LISTED_EQUITY") return "OPEN_ENDED";
  return "PRIVATE_CAPITAL";
}

export class LpPortalSessionService {
  static async getSession(ctx: LpPortalContext, userId: string) {
    const client = await LpPortalAccessService.assertClientActive(ctx.clientId);

    const commitments = await prisma.investmentCommitment.findMany({
      where: {
        clientId: ctx.clientId,
        status: { in: ["ACTIVE", "PENDING"] },
      },
      include: {
        fund: {
          select: {
            id: true,
            name: true,
            fundPurpose: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const entitled = commitments.filter((c) => LpPortalAccessService.fundAllowed(ctx, c.fundId));
    const fundIds = [...new Set(entitled.map((c) => c.fundId))];

    const contexts = fundIds.length
      ? await db().lpFundPortalContext.findMany({ where: { fundId: { in: fundIds } } })
      : [];
    const ctxByFund = new Map(contexts.map((r: any) => [r.fundId, r]));

    const holdings = fundIds.length
      ? await db().lpHoldingPosition.findMany({
          where: { clientId: ctx.clientId, fundId: { in: fundIds }, isActive: true },
        })
      : [];
    const holdingByFund = new Map(holdings.map((h: any) => [h.fundId, h]));

    const funds = entitled.map((ic) => {
      const portalCtx = ctxByFund.get(ic.fundId);
      const holding = holdingByFund.get(ic.fundId);
      const operatingModel = resolveOperatingModel(ic.fund, portalCtx);
      return {
        fundId: ic.fundId,
        publicReference: portalCtx?.publicReference ?? null,
        fundName: ic.fund.name,
        shortName: portalCtx?.shortName ?? ic.fund.name,
        operatingModel,
        currencyCode: portalCtx?.currencyCode || ic.currency || "USD",
        shareClass: portalCtx?.defaultShareClass ?? holding?.shareClass ?? null,
        asOfDate:
          dateOnly(portalCtx?.asOfDate) ||
          dateOnly(holding?.asOfDate) ||
          dateOnly(new Date()),
        valuationStatus: portalCtx?.valuationStatus || holding?.valuationStatus || "FINAL",
        investorAccountReference: holding?.accountRef ?? null,
        commitmentAmount: moneyStr(ic.amount),
      };
    });

    // Deduplicate by fundId (multiple commitments possible)
    const seen = new Set<string>();
    const uniqueFunds = funds.filter((f) => {
      if (seen.has(f.fundId)) return false;
      seen.add(f.fundId);
      return true;
    });

    const [unackedNotices, openRequests, unreadMessages] = await Promise.all([
      this.countUnackedNotices(ctx),
      db().lpServiceRequest.count({
        where: {
          clientId: ctx.clientId,
          status: { in: ["OPEN", "SUBMITTED", "UNDER_REVIEW", "AWAITING_INVESTOR", "ASSIGNED"] },
        },
      }),
      db().lpMessage.count({
        where: {
          readAt: null,
          authorType: "OPS",
          thread: { clientId: ctx.clientId },
        },
      }),
    ]);

    const notifications = unackedNotices + openRequests + unreadMessages;
    const defaultAsOf =
      uniqueFunds.map((f) => f.asOfDate).filter(Boolean).sort().slice(-1)[0] ||
      dateOnly(new Date());
    const statuses = uniqueFunds.map((f) => f.valuationStatus);
    const defaultValuationStatus =
      statuses.length === 0
        ? "FINAL"
        : statuses.every((s) => s === statuses[0])
          ? statuses[0]
          : "FINAL";

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const displayName =
      ctx.displayName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
      user?.email ||
      client.legalName;

    return {
      client: {
        id: client.id,
        legalName: client.legalName,
        email: client.email,
        investorId: client.investorId,
        displayName,
      },
      lpRole: ctx.lpRole || "VIEWER",
      presentationCurrency: "USD",
      defaultAsOfDate: defaultAsOf,
      defaultValuationStatus,
      funds: uniqueFunds,
      unreadCounts: {
        requests: openRequests,
        messages: unreadMessages,
        notices: unackedNotices,
        notifications,
      },
    };
  }

  private static async countUnackedNotices(ctx: LpPortalContext): Promise<number> {
    const notices = await db().lpNotice.findMany({
      where: {
        status: "PUBLISHED",
        OR: [
          { targetType: "ALL" },
          { targetType: "ORG", clientId: ctx.clientId },
          { targetType: "USER", userId: ctx.userId || undefined },
          {
            targetType: "FUND",
            ...(ctx.fundScope?.length ? { fundId: { in: ctx.fundScope } } : {}),
          },
        ],
      },
      select: { id: true, fundId: true, clientId: true, userId: true, targetType: true },
    });

    const visible = notices.filter((n: any) => {
      if (n.clientId && n.clientId !== ctx.clientId) return false;
      if (n.userId && ctx.userId && n.userId !== ctx.userId) return false;
      if (n.fundId && !LpPortalAccessService.fundAllowed(ctx, n.fundId)) return false;
      return true;
    });
    if (!visible.length) return 0;

    const receipts = await db().lpNoticeReceipt.findMany({
      where: {
        clientId: ctx.clientId,
        noticeId: { in: visible.map((n: any) => n.id) },
        acknowledgedAt: { not: null },
      },
      select: { noticeId: true },
    });
    const acked = new Set(receipts.map((r: any) => r.noticeId));
    return visible.filter((n: any) => !acked.has(n.id)).length;
  }
}
