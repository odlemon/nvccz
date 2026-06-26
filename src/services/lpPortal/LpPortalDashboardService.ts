// @ts-nocheck
import { prisma } from "../../utils/database";
import { LpFundMetricsService } from "../fundReporting/LpFundMetricsService";
import { LpPortalAccessService, type LpPortalContext } from "./LpPortalAccessService";

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
}
