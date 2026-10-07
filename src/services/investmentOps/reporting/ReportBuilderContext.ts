// @ts-nocheck
import { prisma } from "../../../utils/database";
import { ListedEquityAccessService } from "../../listedEquity/ListedEquityAccessService";
import { ListedEquityPortfolioService } from "../../listedEquity/ListedEquityPortfolioService";
import { InvestmentOpsPortfolioService } from "../InvestmentOpsPortfolioService";
import { PerformanceReportMetricsEngine } from "./PerformanceReportMetricsEngine";
import type { ReportScopeType } from "./investmentReportTemplates";
import { num } from "./reportFormatters";

export type ReportBuildParams = {
  reportType: string;
  reportRunId: string;
  userId: string;
  user: any;
  fundId?: string;
  clientId?: string;
  scopeType: ReportScopeType;
  parameters?: {
    periodStart?: string;
    periodEnd?: string;
    valuationDate?: string;
    asOf?: string;
    benchmarkName?: string;
    clientLegalName?: string;
    assetManagerName?: string;
    firmName?: string;
  };
};

export type ReportBuilderContext = Awaited<ReturnType<typeof ReportBuilderContextLoader.load>>;

export class ReportBuilderContextLoader {
  static async load(params: ReportBuildParams) {
    const now = new Date();
    const asOfRaw = params.parameters?.asOf || params.parameters?.valuationDate;
    const periodEnd = params.parameters?.periodEnd
      ? new Date(params.parameters.periodEnd)
      : asOfRaw
        ? new Date(asOfRaw)
        : now;
    const periodStart = params.parameters?.periodStart
      ? new Date(params.parameters.periodStart)
      : new Date(periodEnd.getFullYear(), Math.floor(periodEnd.getMonth() / 3) * 3, 1);
    const valuationDate = asOfRaw ? new Date(asOfRaw) : periodEnd;
    const ytdStart = new Date(periodEnd.getFullYear(), 0, 1);

    const scope = await ListedEquityAccessService.getAccessibleFundIds(params.userId, params.user);
    let fundIds: string[] = [];
    if (params.fundId) {
      await ListedEquityAccessService.assertFundAccess(params.userId, params.fundId, params.user);
      fundIds = [params.fundId];
    } else if (scope === "ALL") {
      const rows = await prisma.fund.findMany({
        where: ListedEquityAccessService.listedEquityFundWhere(),
        select: { id: true },
      });
      fundIds = rows.map((r) => r.id);
    } else {
      fundIds = scope;
    }

    const funds = await prisma.fund.findMany({
      where: { id: { in: fundIds } },
      include: {
        listedEquityFundConfig: true,
        fundManagers: { include: { user: true }, where: { isActive: true }, take: 1 },
      },
    });

    const primaryFund = params.fundId
      ? funds.find((f) => f.id === params.fundId) ?? funds[0]
      : funds[0];

    const fundId = primaryFund?.id;
    let holdings: any[] = [];
    let pnl: any = null;
    let overview: any = null;
    let transactions: any[] = [];
    let snapshots: any[] = [];

    if (fundId) {
      [holdings, pnl, overview, transactions, snapshots] = await Promise.all([
        ListedEquityPortfolioService.getHoldings(fundId, params.userId, params.user),
        ListedEquityPortfolioService.getPnl(fundId, params.userId, params.user),
        InvestmentOpsPortfolioService.overview(fundId, params.userId, params.user),
        InvestmentOpsPortfolioService.transactions(fundId, params.userId, params.user),
        PerformanceReportMetricsEngine.loadSnapshots(fundId),
      ]);
    }

    const allHoldings: any[] = [];
    let firmNav = 0;
    for (const f of funds) {
      try {
        const h = await ListedEquityPortfolioService.getHoldings(f.id, params.userId, params.user);
        allHoldings.push(...h.map((row: any) => ({ ...row, fundId: f.id, fundName: f.name })));
        const snap = await prisma.listedEquityValuationSnapshot.findFirst({
          where: { fundId: f.id },
          orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
        });
        firmNav += snap ? num(snap.navBaseCurrency) : 0;
      } catch {
        /* skip inaccessible */
      }
    }

    const client = params.clientId
      ? await prisma.client.findUnique({
          where: { id: params.clientId },
          include: { investmentCommitments: { where: fundId ? { fundId } : undefined } },
        })
      : null;

    const [
      mgmtFees,
      capitalPayments,
      distributions,
      valRuns,
      valEx,
      reconBatches,
      complianceRules,
      complianceResults,
      clients,
      mgmtFeePeriods,
      tradesInPeriod,
      brokerCommissions,
    ] = await Promise.all([
      fundId
        ? prisma.managementFeePeriod.aggregate({
            where: { fundId, periodStart: { gte: periodStart }, periodEnd: { lte: periodEnd } },
            _sum: { totalFee: true },
          })
        : { _sum: { totalFee: null } },
      prisma.capitalCallAllocationPayment.findMany({
        where: {
          recordedAt: { gte: periodStart, lte: periodEnd },
          ...(fundId
            ? { capitalCallAllocation: { capitalCall: { fundId } } }
            : fundIds.length
              ? { capitalCallAllocation: { capitalCall: { fundId: { in: fundIds } } } }
              : {}),
        },
        include: { capitalCallAllocation: { include: { client: true, capitalCall: true } } },
        take: 500,
      }),
      prisma.distributionAllocationPayment.findMany({
        where: {
          recordedAt: { gte: periodStart, lte: periodEnd },
          ...(fundId
            ? { allocation: { distribution: { fundId } } }
            : fundIds.length
              ? { allocation: { distribution: { fundId: { in: fundIds } } } }
              : {}),
        },
        include: { allocation: { include: { client: true, distribution: true } } },
        take: 500,
      }),
      fundId
        ? prisma.investmentValuationRun.findMany({
            where: { fundId },
            orderBy: { createdAt: "desc" },
            take: 10,
          })
        : [],
      fundId
        ? prisma.investmentValuationException.findMany({
            where: { fundId },
            orderBy: { createdAt: "desc" },
            take: 20,
          })
        : [],
      fundId
        ? prisma.investmentReconciliationBatch.findMany({
            where: { fundId },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { items: true },
          })
        : [],
      prisma.investmentComplianceRule.findMany({
        where: { OR: [{ fundId: fundId ?? undefined }, { fundId: null }], isActive: true },
        take: 50,
      }),
      fundId
        ? prisma.investmentComplianceResult.findMany({
            where: { order: { fundId } },
            orderBy: { createdAt: "desc" },
            take: 100,
            include: { order: true },
          })
        : [],
      prisma.client.findMany({ take: 200, orderBy: { legalName: "asc" } }),
      fundId
        ? prisma.managementFeePeriod.findMany({
            where: { fundId, periodEnd: { gte: periodStart, lte: periodEnd } },
            orderBy: { periodEnd: "desc" },
            take: 20,
          })
        : [],
      fundId
        ? prisma.listedEquityTrade.findMany({
            where: {
              fundId,
              status: { not: "DRAFT" },
              executedAt: { gte: periodStart, lte: periodEnd },
            },
            include: { security: true, settlement: true },
            orderBy: { executedAt: "desc" },
            take: 200,
          })
        : [],
      prisma.investmentBrokerCommission.findMany({ where: { isActive: true }, take: 20 }),
    ]);

    const snap = pnl?.snapshot;
    const closingNav = overview?.nav ?? (snap ? num(snap.navBaseCurrency) : 0);
    const baseCurrency =
      primaryFund?.listedEquityFundConfig?.baseCurrencyCode || overview?.baseCurrency || "USD";

    const periodMetrics = fundId
      ? await PerformanceReportMetricsEngine.metricsForPeriod(fundId, periodStart, periodEnd, snapshots)
      : null;

    const modelWeights = await PerformanceReportMetricsEngine.modelBenchmarkWeights(fundId || "");

    return {
      params,
      now,
      periodStart,
      periodEnd,
      valuationDate,
      ytdStart,
      fundId,
      funds,
      primaryFund,
      fundIds,
      holdings,
      allHoldings,
      pnl,
      overview,
      transactions,
      snapshots,
      snap,
      closingNav,
      firmNav,
      baseCurrency,
      client,
      mgmtFees: num(mgmtFees._sum?.totalFee),
      capitalPayments,
      distributions,
      valRuns,
      valEx,
      reconBatches,
      complianceRules,
      complianceResults,
      clients,
      mgmtFeePeriods,
      tradesInPeriod,
      brokerCommissions,
      periodMetrics,
      modelWeights,
      userName: `${params.user?.firstName ?? ""} ${params.user?.lastName ?? ""}`.trim() || params.user?.email || "Arcus User",
      pmName: overview?.portfolioManager || "Portfolio Manager",
      assetManagerName: params.parameters?.assetManagerName || "Arcus Asset Management",
      firmName: params.parameters?.firmName || "Arcus Asset Management",
    };
  }
}
