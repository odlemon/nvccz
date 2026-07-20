// @ts-nocheck
import { prisma } from "../../utils/database";
import { moneyStr } from "../../middleware/lpPortalFoundation";
import { LpFundMetricsService } from "../fundReporting/LpFundMetricsService";
import { LpPortalAccessService, type LpPortalContext } from "./LpPortalAccessService";
import { LpPortalCapitalActivityService } from "./LpPortalCapitalActivityService";

const db = () => prisma as any;

function applyPresentationCurrency(metrics: any, presentation: "USD" | "ZIG") {
  if (presentation === "USD") return metrics;
  const rate = metrics.fxRateUsdZig ?? metrics.usdZwgRate ?? null;
  if (!rate) return { ...metrics, presentationCurrency: "ZIG", fxNote: "FX rate unavailable — showing USD values" };
  const mult = Number(rate);
  const zig = (n: number) => Math.round(n * mult * 100) / 100;
  return {
    ...metrics,
    presentationCurrency: "ZIG",
    fxRateUsdZig: mult,
    totalCommitment: zig(metrics.totalCommitment),
    totalPaidIn: zig(metrics.totalPaidIn),
    totalDistributions: zig(metrics.totalDistributions),
    unfundedCommitment: zig(metrics.unfundedCommitment),
    nav: zig(metrics.nav),
    currencyCode: "ZIG",
  };
}

function dateOnly(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function ratioStr(value: unknown, dp = 4): string {
  if (value == null) return "0";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toFixed(dp);
}

export class LpPortalDashboardService {
  static async getDashboard(ctx: LpPortalContext, opts: { fundId?: string; presentationCurrency?: string }) {
    const client = await LpPortalAccessService.assertClientActive(ctx.clientId);
    const presentation = (opts.presentationCurrency || "USD").toUpperCase() === "ZIG" ? "ZIG" : "USD";

    const commitments = await prisma.investmentCommitment.findMany({
      where: {
        clientId: ctx.clientId,
        status: { in: ["ACTIVE", "PENDING"] },
        ...(opts.fundId ? { fundId: opts.fundId } : {}),
      },
      include: { fund: { select: { id: true, name: true } } },
    });

    const funds = commitments.filter((c) => LpPortalAccessService.fundAllowed(ctx, c.fundId));
    const asOf = new Date();
    const periodEnd = asOf;
    const periodStart = new Date(asOf);
    periodStart.setFullYear(periodStart.getFullYear() - 1);

    const fundMetrics = [];
    for (const ic of funds) {
      const snap = await prisma.lpPortalMetricSnapshot.findFirst({
        where: { clientId: ctx.clientId, fundId: ic.fundId },
        orderBy: { asOfDate: "desc" },
      });
      let metrics = snap?.metrics as any;
      if (!metrics) {
        const live = await LpFundMetricsService.computeForClient({
          fundId: ic.fundId,
          clientId: ctx.clientId,
          periodStart,
          periodEnd,
        });
        metrics = live;
      }
      fundMetrics.push({
        fundId: ic.fundId,
        fundName: ic.fund.name,
        commitmentAmount: Number(ic.amount.toString()),
        commitmentCurrency: ic.currency,
        metrics: applyPresentationCurrency(metrics, presentation),
        snapshotAsOf: snap?.asOfDate?.toISOString().slice(0, 10) ?? null,
      });
    }

    const latestJobs = await prisma.fundReportRecipientJob.findMany({
      where: { clientId: ctx.clientId, status: { in: ["DELIVERED", "SENT", "COMPILED"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        run: { include: { fund: { select: { name: true } }, template: { select: { reportLevel: true } } } },
      },
    });

    let exchangeRateWidget = null;
    if (String(presentation).toUpperCase() === "ZIG") {
      const { resolveExchangeRateWidgetForContext } = await import(
        "../exchangeRateDisplay/exchangeRateDisplayWidgetHelper"
      );
      exchangeRateWidget = await resolveExchangeRateWidgetForContext("LP_PORTAL");
    }

    return {
      client: {
        id: client.id,
        legalName: client.legalName,
        email: client.email,
        investorId: client.investorId,
      },
      lpRole: ctx.lpRole,
      presentationCurrency: presentation,
      funds: fundMetrics,
      exchangeRateWidget,
      latestReports: latestJobs.map((j) => ({
        jobId: j.id,
        fundName: j.run.fund.name,
        periodEnd: j.run.periodEnd,
        reportLevel: j.run.template.reportLevel,
        deliveredAt: j.deliveredAt,
      })),
    };
  }

  /** SRD §8 dashboard shape with KPI decimal strings + open-ended summary. */
  static async getDashboardSrd(
    ctx: LpPortalContext,
    opts: { fundId?: string; asOfDate?: string; presentationCurrency?: string } = {}
  ) {
    const legacy = await this.getDashboard(ctx, opts);
    const asOf = opts.asOfDate ? new Date(opts.asOfDate) : new Date();
    const periodEnd = asOf;
    const periodStart = new Date(asOf);
    periodStart.setFullYear(periodStart.getFullYear() - 1);

    const fundIds = legacy.funds
      .map((f: any) => f.fundId)
      .filter((id: string) => !opts.fundId || id === opts.fundId);

    let totalCommitment = 0;
    let paidIn = 0;
    let unfunded = 0;
    let currentNav = 0;
    let distributions = 0;
    let netIrr: number | null = null;
    let tvpi = 0;
    let dpi = 0;
    let rvpi = 0;
    let investmentCount = 0;
    let valuationStatus = "FINAL";
    let asOfDate = dateOnly(asOf)!;

    for (const fundId of fundIds) {
      const snap = await prisma.lpPortalMetricSnapshot.findFirst({
        where: { clientId: ctx.clientId, fundId },
        orderBy: { asOfDate: "desc" },
      });
      let m: any = snap?.metrics;
      if (!m) {
        m = await LpFundMetricsService.computeForClient({
          fundId,
          clientId: ctx.clientId,
          periodStart,
          periodEnd,
        });
      }
      totalCommitment += Number(m.totalCommitment ?? 0);
      paidIn += Number(m.totalPaidIn ?? 0);
      unfunded += Number(m.unfundedCommitment ?? 0);
      currentNav += Number(m.nav ?? 0);
      distributions += Number(m.totalDistributions ?? 0);
      if (m.netIrr != null) netIrr = Number(m.netIrr);
      tvpi = Number(m.tvpi ?? tvpi);
      dpi = Number(m.dpi ?? dpi);
      rvpi = Number(m.rvpi ?? rvpi);
      if (snap?.asOfDate) asOfDate = dateOnly(snap.asOfDate)!;

      const portalCtx = await db().lpFundPortalContext.findUnique({ where: { fundId } });
      if (portalCtx?.valuationStatus) valuationStatus = portalCtx.valuationStatus;
      if (portalCtx?.asOfDate) asOfDate = dateOnly(portalCtx.asOfDate)!;
    }

    // Recalculate consolidated multiples from aggregates
    if (paidIn > 0) {
      tvpi = (distributions + currentNav) / paidIn;
      dpi = distributions / paidIn;
      rvpi = currentNav / paidIn;
    }

    const companies = fundIds.length
      ? await prisma.portfolioCompany.count({
          where: { fundId: { in: fundIds }, status: { not: "EXITED" } },
        }).catch(() => 0)
      : 0;
    investmentCount = companies;

    const holdings = await db().lpHoldingPosition.findMany({
      where: {
        clientId: ctx.clientId,
        isActive: true,
        ...(opts.fundId ? { fundId: opts.fundId } : { fundId: { in: fundIds.length ? fundIds : ["__none__"] } }),
      },
    });

    let accountValue = 0;
    let unitsHeld = 0;
    let navPerUnit = 0;
    for (const h of holdings) {
      accountValue += Number(h.accountValue ?? 0);
      unitsHeld += Number(h.units ?? 0);
      if (Number(h.navPerUnit ?? 0) > 0) navPerUnit = Number(h.navPerUnit);
    }
    if (unitsHeld > 0 && navPerUnit === 0) navPerUnit = accountValue / unitsHeld;

    // Placeholder YTD return from metric snapshots if present
    let ytdReturn = 0;
    if (holdings[0]?.asOfDate) {
      const ytdStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));
      const earlier = await db().lpHoldingPosition.findFirst({
        where: {
          clientId: ctx.clientId,
          fundId: holdings[0].fundId,
          asOfDate: { lte: ytdStart },
        },
        orderBy: { asOfDate: "desc" },
      });
      const beginNav = Number(earlier?.navPerUnit ?? navPerUnit);
      if (beginNav > 0) ytdReturn = navPerUnit / beginNav - 1;
    }

    return {
      asOfDate,
      valuationStatus,
      kpis: {
        totalCommitment: moneyStr(totalCommitment),
        paidIn: moneyStr(paidIn),
        unfunded: moneyStr(unfunded),
        currentNav: moneyStr(currentNav),
        distributions: moneyStr(distributions),
        netIrr: netIrr != null ? ratioStr(netIrr, 4) : null,
        tvpi: ratioStr(tvpi, 4),
        dpi: ratioStr(dpi, 4),
        rvpi: ratioStr(rvpi, 4),
        investmentCount,
      },
      openEndedSummary: {
        accountValue: moneyStr(accountValue),
        unitsHeld: String(unitsHeld),
        navPerUnit: String(navPerUnit),
        ytdReturn: ratioStr(ytdReturn, 4),
      },
      // Legacy backward-compatible fields
      client: legacy.client,
      lpRole: legacy.lpRole,
      presentationCurrency: legacy.presentationCurrency,
      funds: legacy.funds,
      exchangeRateWidget: legacy.exchangeRateWidget,
      latestReports: legacy.latestReports,
    };
  }

  static async getActions(ctx: LpPortalContext) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const actions: any[] = [];

    const { items: calls } = await LpPortalCapitalActivityService.listCapitalCalls(ctx, {
      page: 1,
      pageSize: 50,
    });

    for (const c of calls) {
      if (["ISSUED", "ACKNOWLEDGED", "PARTIALLY_PAID", "OVERDUE"].includes(c.status)) {
        actions.push({
          id: `act_cc_${c.id}`,
          type: "CAPITAL_CALL_DUE",
          severity: c.status === "OVERDUE" ? "HIGH" : "MEDIUM",
          title: `Capital Call #${c.callNo} due ${c.dueDate || "soon"}`,
          fundId: c.fundId,
          relatedRecordId: c.id,
          href: "/lp-portal/capital-activity?tab=calls",
          dueDate: c.dueDate,
        });
      }
    }

    const compliance = await db().lpComplianceStatus.findUnique({
      where: { clientId: ctx.clientId },
    });
    if (compliance?.onHold || String(compliance?.kycStatus || "").toUpperCase() === "UPDATE_REQUIRED") {
      actions.push({
        id: `act_kyc_${ctx.clientId}`,
        type: "KYC_UPDATE",
        severity: "HIGH",
        title: compliance.holdReason || "KYC / compliance update required",
        fundId: null,
        relatedRecordId: compliance.id,
        href: "/lp-portal/settings",
        dueDate: null,
      });
    }

    const notices = await db().lpNotice.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 30,
    });
    for (const n of notices) {
      if (n.fundId && !LpPortalAccessService.fundAllowed(ctx, n.fundId)) continue;
      if (n.clientId && n.clientId !== ctx.clientId) continue;
      const receipt = await db().lpNoticeReceipt.findFirst({
        where: { noticeId: n.id, clientId: ctx.clientId, acknowledgedAt: { not: null } },
      });
      if (!receipt) {
        actions.push({
          id: `act_notice_${n.id}`,
          type: "NOTICE_REQUIRES_ACK",
          severity: "MEDIUM",
          title: n.title,
          fundId: n.fundId,
          relatedRecordId: n.id,
          href: "/lp-portal/documents?tab=notices",
          dueDate: null,
        });
      }
    }

    const dealing = await db().lpDealingRequest.findMany({
      where: {
        clientId: ctx.clientId,
        status: { in: ["AWAITING_FUNDS", "UNDER_REVIEW", "COMPLIANCE_REVIEW", "SUBMITTED"] },
      },
      take: 20,
      orderBy: { createdAt: "desc" },
    });
    for (const d of dealing) {
      if (!LpPortalAccessService.fundAllowed(ctx, d.fundId)) continue;
      actions.push({
        id: `act_deal_${d.id}`,
        type:
          d.requestType === "SUBSCRIPTION"
            ? "SUBSCRIPTION_AWAITING_FUNDS"
            : "REDEMPTION_UNDER_REVIEW",
        severity: "MEDIUM",
        title:
          d.requestType === "SUBSCRIPTION"
            ? `Subscription ${d.status}`
            : `Redemption ${d.status}`,
        fundId: d.fundId,
        relatedRecordId: d.id,
        href: "/lp-portal/subscriptions-redemptions",
        dueDate: dateOnly(d.requestedDealingDate),
      });
    }

    const severityRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    actions.sort(
      (a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9)
    );
    return { items: actions };
  }

  static async getRecentActivity(ctx: LpPortalContext, limit = 20) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const take = Math.min(50, Math.max(1, Number(limit) || 20));
    const events: any[] = [];

    const [calls, dists, dealing, docs, notices] = await Promise.all([
      prisma.capitalCallAllocation.findMany({
        where: { clientId: ctx.clientId },
        include: {
          capitalCall: { include: { fund: { select: { name: true } } } },
          portalState: true,
        },
        orderBy: { updatedAt: "desc" },
        take,
      }),
      prisma.distributionAllocation.findMany({
        where: { clientId: ctx.clientId },
        include: {
          distribution: { include: { fund: { select: { name: true } } } },
        },
        orderBy: { updatedAt: "desc" },
        take,
      }),
      db().lpDealingRequest.findMany({
        where: { clientId: ctx.clientId },
        orderBy: { createdAt: "desc" },
        take,
      }),
      prisma.lpPortalDocument.findMany({
        where: { clientId: ctx.clientId },
        orderBy: { publishedAt: "desc" },
        take,
      }),
      db().lpNotice.findMany({
        where: {
          OR: [{ targetType: "ALL" }, { clientId: ctx.clientId }, { targetType: "FUND" }],
        },
        orderBy: { publishedAt: "desc" },
        take,
      }),
    ]);

    for (const c of calls) {
      if (!LpPortalAccessService.fundAllowed(ctx, c.capitalCall.fundId)) continue;
      events.push({
        id: `actv_cc_${c.id}`,
        type: "CAPITAL_CALL",
        title: `Capital call — ${c.capitalCall.fund?.name || c.capitalCall.fundId}`,
        fundId: c.capitalCall.fundId,
        amount: moneyStr(c.currentCallAmount),
        status: c.status,
        at: (c.portalState?.acknowledgedAt || c.updatedAt || c.createdAt)?.toISOString?.() ?? null,
      });
    }
    for (const d of dists) {
      if (!LpPortalAccessService.fundAllowed(ctx, d.distribution.fundId)) continue;
      events.push({
        id: `actv_dist_${d.id}`,
        type: "DISTRIBUTION",
        title: `Distribution — ${d.distribution.fund?.name || d.distribution.fundId}`,
        fundId: d.distribution.fundId,
        amount: moneyStr(d.shareAmount),
        status: d.status,
        at: (d.updatedAt || d.createdAt)?.toISOString?.() ?? null,
      });
    }
    for (const d of dealing) {
      if (!LpPortalAccessService.fundAllowed(ctx, d.fundId)) continue;
      events.push({
        id: `actv_deal_${d.id}`,
        type: d.requestType,
        title: `${d.requestType} request`,
        fundId: d.fundId,
        amount: d.amount != null ? moneyStr(d.amount) : null,
        status: d.status,
        at: d.createdAt?.toISOString?.() ?? null,
      });
    }
    for (const doc of docs) {
      if (doc.fundId && !LpPortalAccessService.fundAllowed(ctx, doc.fundId)) continue;
      events.push({
        id: `actv_doc_${doc.id}`,
        type: "DOCUMENT",
        title: doc.title,
        fundId: doc.fundId,
        amount: null,
        status: "PUBLISHED",
        at: doc.publishedAt?.toISOString?.() ?? doc.createdAt?.toISOString?.() ?? null,
      });
    }
    for (const n of notices) {
      if (n.fundId && !LpPortalAccessService.fundAllowed(ctx, n.fundId)) continue;
      if (n.clientId && n.clientId !== ctx.clientId) continue;
      events.push({
        id: `actv_notice_${n.id}`,
        type: "NOTICE",
        title: n.title,
        fundId: n.fundId,
        amount: null,
        status: n.status,
        at: n.publishedAt?.toISOString?.() ?? n.createdAt?.toISOString?.() ?? null,
      });
    }

    events.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
    return { items: events.slice(0, take) };
  }
}
