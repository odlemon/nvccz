// @ts-nocheck
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import { DataIntegrationService } from "./DataIntegrationService";
import { asNumber, roundTo } from "./performanceBackendSupport";
import {
  cashFlowRag,
  computePortfolioAumHistoryCagr,
  computeYtdAumChangeRate,
  getLatestAndPriorKpiBlobs,
  inferAssetClassLabel,
  inferBusinessUnitLabel,
  liquidityRag,
  numFromKpiField,
  priorPeriodFairValueFromKpiValues,
  profitRag,
  revenueGrowthRag,
  sectorHerfindahlHirschmanFromPercentages,
  sortedKpiPeriodKeys,
} from "../utils/portfolioDashboardKpiHelpers";
import {
  computeAnalystFlagsForCompany,
  rollupAnalystFlags,
} from "../utils/portfolioDashboardAnalystFlags";

/** Default cap on quarter IRR rows (full dashboard) — avoids O(years×companies) blowup on old funds. */
const IRR_BY_QUARTER_CAP_FULL = 56;
/** AUM-scoped dashboard: minimal IRR history for speed. */
const IRR_BY_QUARTER_CAP_AUM = 8;

export interface PortfolioDashboardParams {
  fundId?: string; // Optional fund filter - if not provided, aggregates all funds
  portfolioCompanyId?: string; // Optional single-company slice (same fund context)
  year?: number; // Optional year filter for historical data
  currencyId?: string; // Optional currency filter
  asOfDate?: Date; // Optional date for snapshot
  /**
   * `aum`: lighter payload (no comparison/waterfall/analyst rollup; shorter IRR series). Faster for AUM-only tiles.
   * `full` (default): complete dashboard.
   */
  scope?: "full" | "aum";
}

export interface PortfolioDashboardData {
  // High-Level Metrics
  metrics: {
    totalInvested: number;
    availableForDrawdown: number;
    fundGrossIRR: number;
    lpNetIRR: number;
    tvpi: number;
    /** Realized proceeds and income / paid-in capital (LP committed). Simplified DPI-style ratio. */
    dpi: number;
    /** Portfolio NAV-style multiple: total value / aggregate invested cost (disbursed). */
    moicOnCost: number;
    /** (Total portfolio value − deployed capital) / deployed capital; null if nothing deployed. */
    portfolioRoi: number | null;
  };
  
  // Performance Overview (Bar Chart Data)
  performanceOverview: {
    paidIn: number;
    totalInvestment: number;
    managementExpenses: number;
    otherExpenses: number;
    realizedProceedsAndIncome: number;
    fmvUnrealizedPortfolio: number;
  };
  
  // J Curve Data
  jCurve: Array<{
    year: number;
    contribution: number;
    distribution: number;
    cumulativeAmount: number;
  }>;
  
  // Deal Allocation (Pie Chart)
  dealAllocation: Array<{
    sector: string;
    investmentCost: number;
    percentage: number;
  }>;
  
  // IRR by Quarter
  irrByQuarter: Array<{
    quarter: string; // "Q1 2025"
    quarterNumber: number;
    year: number;
    investorNetIRR: number;
    fundNetIRR: number;
    fundGrossIRR: number;
  }>;
  
  // Portfolio Summary Table
  portfolioSummary: Array<{
    companyId: string;
    name: string;
    initialInvestment: Date | null;
    mainIndustry: string;
    commitReserves: number;
    currentOwnership: number | null;
    totalInvestmentCost: number;
    currentInvestmentCost: number;
    realized: number;
    fairMarketValue: number;
    totalValue: number;
    multiplesOfCost: number;
    grossIRR: number;
    totalRevenue: number | null;
    netProfit: number | null;
    cashFlowNet: number | null;
    /** Derived from ACCEPTED report snapshots (see InvestmentMonitoringKpiService). */
    monitoringKpis: Record<string, number | null> | null;
    monitoringKpisMeta: { asOfPeriod?: string; computedAt?: string; source?: string } | null;
    priorPeriodKey: string | null;
    currentPeriodKey: string | null;
    totalRevenuePrior: number | null;
    netProfitPrior: number | null;
    cashFlowNetPrior: number | null;
    totalRevenueDelta: number | null;
    netProfitDelta: number | null;
    cashFlowNetDelta: number | null;
    kpiRag: {
      revenueGrowth: "green" | "yellow" | "red" | null;
      profitability: "green" | "yellow" | "red" | null;
      liquidity: "green" | "yellow" | "red" | null;
      cashFlow: "green" | "yellow" | "red" | null;
    } | null;
    analystFlags: Array<{
      code: string;
      severity: "info" | "warning" | "error";
      title: string;
      description: string;
    }>;
    /**
     * Same keys as `monitoringKpis` with display fallbacks from `latestKpiValues` where the
     * monitoring snapshot had no income statement (REVENUE / profit remain null in raw monitoring).
     */
    monitoringKpisFilled: Record<string, number | null> | null;
  }>;

  /**
   * Cross-company / cross-period bar chart inputs (same row order as `portfolioSummary`).
   * Rates are decimals (e.g. 0.12 = 12%). `*Pct` fields are on a 0–100 scale for axis labels.
   */
  comparisonChart: Array<{
    companyId: string;
    name: string;
    priorPeriodKey: string | null;
    currentPeriodKey: string | null;
    revenueGrowthRate: number | null;
    revenueGrowthRatePct: number | null;
    ebitdaMargin: number | null;
    ebitdaMarginPct: number | null;
    netProfitMargin: number | null;
    netProfitMarginPct: number | null;
  }>;

  /**
   * Net profit bridge between the latest two `kpiValues` periods: prior → +revenue change + costs & other → current.
   * `steps` are deltas; `complete` is false when prior/current net or deltas are missing.
   */
  netProfitWaterfall: Array<{
    companyId: string;
    name: string;
    priorPeriodKey: string | null;
    currentPeriodKey: string | null;
    startNetProfit: number | null;
    endNetProfit: number | null;
    steps: Array<{ id: string; label: string; value: number }>;
    complete: boolean;
  }>;

  /**
   * Total portfolio AUM (holdings view): sum of unrealized FMV plus realized proceeds per company.
   * Distinct from fund `totalAmount` / committed LP capital — see `metrics.totalInvested` and CEO `calculateAUM`.
   */
  totalPortfolioAum: number;

  /**
   * Tile-oriented AUM KPIs: explicit holdings value, company count, sector distribution, diversification, growth (YoY/YTD), deployment, returns.
   * Excludes pipeline / application request amounts and recent disbursement line items.
   */
  aumKpis: {
    /** Same as `totalPortfolioAum` — market value of holdings (FMV + realized). */
    totalPortfolioValue: number;
    /** Portfolio companies with deployed capital or positive holdings value */
    totalCompanies: number;
    sectorDistribution: Array<{ sector: string; aum: number; percentage: number }>;
    /** Up to 5 sectors by AUM share */
    topSectors: Array<{ sector: string; aum: number; percentage: number }>;
    diversificationScore: {
      herfindahlHirschmanIndex: number;
      sectorCount: number;
      /** Higher = more diversified (0–100). `(1 − HHI/10000) × 100` on AUM weights. */
      score0to100: number | null;
    };
    deploymentRatePct: number | null;
    growth: {
      yoyChangeRate: number | null;
      ytdChangeRate: number | null;
      ytdStartPeriodKey: string | null;
      ytdStartAum: number | null;
      cagr: number | null;
      cagrYears: number | null;
      historySeries: Array<{ periodKey: string; totalAum: number }>;
    };
    performance: {
      fundGrossIRR: number;
      lpNetIRR: number;
      portfolioRoi: number | null;
      tvpi: number;
      dpi: number;
      moicOnCost: number;
    };
    /** Value-weighted AUM by optional capTable business unit (else Unspecified) */
    businessUnitDistribution: Array<{ businessUnit: string; aum: number; percentage: number }>;
    topBusinessUnits: Array<{ businessUnit: string; aum: number; percentage: number }>;
    definitions: {
      excludesPipelineAndApplicationRequestValue: true;
      recentDisbursementsExcluded: true;
      activePortfolioNotSeparateFromTotalCompanies: true;
      riskAdjustedRequiresReturnSeries: true;
    };
  };

  /**
   * ILPA-style portfolio snapshot: AUM breakdown, diversification, growth, utilization, and performance in one tree.
   * `dealAllocation` remains cost-basis; this block uses **holdings value** (totalValue) for concentration.
   */
  portfolioComposition: {
    headline: {
      totalPortfolioAum: number;
      totalRealizedValue: number;
      totalUnrealizedValue: number;
      /** Companies with deployed capital or positive holdings value */
      numberOfHoldings: number;
    };
    /** Diversification: sector/industry (from `PortfolioCompany.industry`) by current holdings value */
    aumBySector: Array<{ sector: string; aum: number; percentage: number }>;
    /** From `capTable.assetClass` / instrument hints, else EQUITY */
    aumByAssetClass: Array<{ assetClass: string; aum: number; percentage: number }>;
    /** From `capTable.businessUnit` / division / segment when set; else `Unspecified` */
    aumByBusinessUnit: Array<{ businessUnit: string; aum: number; percentage: number }>;
    diversification: {
      sectorCount: number;
      aumSectorHerfindahlHirschmanIndex: number;
      /** Higher = more diversified; `(1 − HHI/10000) × 100` on AUM sector weights. */
      diversificationScore0to100: number | null;
    };
    aumGrowth: {
      yoyChangeRate: number | null;
      cagr: number | null;
      cagrYears: number | null;
      firstPeriodKey: string | null;
      lastPeriodKey: string | null;
      /** Portfolio-level AUM proxy by reporting period (for trend / CAGR context) */
      historySeries: Array<{ periodKey: string; totalAum: number }>;
    };
    utilization: {
      deploymentRatePct: number | null;
      totalCommittedCapital: number;
      totalDeployed: number;
    };
    performance: {
      tvpi: number;
      dpi: number;
      moicOnCost: number;
      fundGrossIRR: number;
      lpNetIRR: number;
      portfolioRoi: number | null;
    };
    riskAdjustedReturns: {
      sharpeRatio: number | null;
      beta: number | null;
      dataAvailability: "NOT_AVAILABLE" | "AVAILABLE";
      /** Why metrics are absent (requires return time series + benchmark). */
      note: string;
    };
  };

  fundKpis: {
    /** Disbursed (cost) / sum of tranche commitments, %, when commitments exist. */
    deploymentRatePct: number | null;
    /** Sector concentration index (0–10000) from `dealAllocation` percentages (cost-basis). */
    sectorHerfindahlHirschmanIndex: number;
    sectorCount: number;
    /**
     * YoY change in holdings value when every company has PORTFOLIO_FAIR_VALUE on the prior kpiValues period; else null.
     */
    aumGrowthYoy: number | null;
    /** CAGR across `kpiValues` period endpoints (holdings proxy); see `portfolioComposition.aumGrowth`. */
    aumCagr: number | null;
    /** Companies with deployed capital or positive holdings value */
    numberOfHoldings: number;
  };

  analystFlagsRollup: Array<{
    code: string;
    severity: "info" | "warning" | "error";
    companyCount: number;
    companies: string[];
  }>;
  
  // Totals Row
  totals: {
    totalInvestmentCost: number;
    currentInvestmentCost: number;
    realized: number;
    fairMarketValue: number;
    totalValue: number;
    multiplesOfCost: number;
    grossIRR: number;
  };
  
  // Period Information
  period: {
    asOfDate: Date;
    fundName: string | null;
    year: number | null;
    /** Echo of request `scope` (`full` default); `aum` = lighter payload. */
    scope: "full" | "aum";
  };
  
  generatedAt: Date;
}

export class PortfolioDashboardService {
  private static makeEmptyPortfolioDashboardData(partial: {
    asOfDate: Date;
    year: number | null;
    fundName: string | null;
  }): PortfolioDashboardData {
    return {
      metrics: {
        totalInvested: 0,
        availableForDrawdown: 0,
        fundGrossIRR: 0,
        lpNetIRR: 0,
        tvpi: 0,
        dpi: 0,
        moicOnCost: 0,
        portfolioRoi: null,
      },
      performanceOverview: {
        paidIn: 0,
        totalInvestment: 0,
        managementExpenses: 0,
        otherExpenses: 0,
        realizedProceedsAndIncome: 0,
        fmvUnrealizedPortfolio: 0,
      },
      jCurve: [],
      dealAllocation: [],
      irrByQuarter: [],
      portfolioSummary: [],
      totals: {
        totalInvestmentCost: 0,
        currentInvestmentCost: 0,
        realized: 0,
        fairMarketValue: 0,
        totalValue: 0,
        multiplesOfCost: 0,
        grossIRR: 0,
      },
      totalPortfolioAum: 0,
      aumKpis: {
        totalPortfolioValue: 0,
        totalCompanies: 0,
        sectorDistribution: [],
        topSectors: [],
        diversificationScore: {
          herfindahlHirschmanIndex: 0,
          sectorCount: 0,
          score0to100: null,
        },
        deploymentRatePct: null,
        growth: {
          yoyChangeRate: null,
          ytdChangeRate: null,
          ytdStartPeriodKey: null,
          ytdStartAum: null,
          cagr: null,
          cagrYears: null,
          historySeries: [],
        },
        performance: {
          fundGrossIRR: 0,
          lpNetIRR: 0,
          portfolioRoi: null,
          tvpi: 0,
          dpi: 0,
          moicOnCost: 0,
        },
        businessUnitDistribution: [],
        topBusinessUnits: [],
        definitions: {
          excludesPipelineAndApplicationRequestValue: true,
          recentDisbursementsExcluded: true,
          activePortfolioNotSeparateFromTotalCompanies: true,
          riskAdjustedRequiresReturnSeries: true,
        },
      },
      portfolioComposition: {
        headline: {
          totalPortfolioAum: 0,
          totalRealizedValue: 0,
          totalUnrealizedValue: 0,
          numberOfHoldings: 0,
        },
        aumBySector: [],
        aumByAssetClass: [],
        aumByBusinessUnit: [],
        diversification: { sectorCount: 0, aumSectorHerfindahlHirschmanIndex: 0, diversificationScore0to100: null },
        aumGrowth: {
          yoyChangeRate: null,
          cagr: null,
          cagrYears: null,
          firstPeriodKey: null,
          lastPeriodKey: null,
          historySeries: [],
        },
        utilization: {
          deploymentRatePct: null,
          totalCommittedCapital: 0,
          totalDeployed: 0,
        },
        performance: {
          tvpi: 0,
          dpi: 0,
          moicOnCost: 0,
          fundGrossIRR: 0,
          lpNetIRR: 0,
          portfolioRoi: null,
        },
        riskAdjustedReturns: {
          sharpeRatio: null,
          beta: null,
          dataAvailability: "NOT_AVAILABLE",
          note:
            "Sharpe ratio and beta require periodic portfolio returns and a benchmark series; not computed in this API.",
        },
      },
      fundKpis: {
        deploymentRatePct: null,
        sectorHerfindahlHirschmanIndex: 0,
        sectorCount: 0,
        aumGrowthYoy: null,
        aumCagr: null,
        numberOfHoldings: 0,
      },
      analystFlagsRollup: [],
      comparisonChart: [],
      netProfitWaterfall: [],
      period: {
        asOfDate: partial.asOfDate,
        fundName: partial.fundName,
        year: partial.year,
        scope: "full",
      },
      generatedAt: new Date(),
    };
  }

  /**
   * Weighted aggregate fund gross IRR (same engine as dashboard `metrics.fundGrossIRR`),
   * rounded to 6 decimal places for PE ↔ performance manual sync (`fieldPath` e.g. `data.metrics.irr`).
   */
  static async getWeightedFundGrossIrrSixDecimals(
    params: Pick<PortfolioDashboardParams, "fundId"> = {}
  ): Promise<{ irr: number; precisionDigits: number; fundCount: number }> {
    const include = {
      portfolioCompanies: {
        include: { investmentImplementation: { include: { fundDisbursements: true } } },
      },
    };
    let funds: any[];
    if (params.fundId) {
      const fund = await prisma.fund.findUnique({
        where: { id: params.fundId },
        include,
      });
      funds = fund ? [fund] : [];
    } else {
      funds = await prisma.fund.findMany({ include });
    }

    let totalWeightedIRR = 0;
    let totalWeight = 0;
    for (const fund of funds) {
      try {
        const irr = DataIntegrationService.fundGrossIrrFromLoadedFund(fund);
        const fundPaidIn = parseFloat((fund.totalAmount || new Decimal(0)).toString());
        totalWeightedIRR += irr * fundPaidIn;
        totalWeight += fundPaidIn;
      } catch (error) {
        console.error(`Error calculating IRR for fund ${fund.id}:`, error);
      }
    }
    const raw = totalWeight > 0 ? totalWeightedIRR / totalWeight : 0;
    const irr = roundTo(asNumber(raw, 0), 6);
    return { irr, precisionDigits: 6, fundCount: funds.length };
  }

  /**
   * Sum of latest `TOTAL_REVENUE` from each portfolio company's `financialKpis` (PE ↔ performance sync).
   */
  static async getAggregatedPortfolioTotalRevenue(params: { fundId?: string } = {}): Promise<{
    totalRevenue: number;
    companyCount: number;
    companiesWithRevenue: number;
  }> {
    const where = params.fundId ? { fundId: params.fundId } : {};
    const companies = await prisma.portfolioCompany.findMany({
      where,
      select: { financialKpis: true }
    });
    let sum = 0;
    let companiesWithRevenue = 0;
    for (const c of companies) {
      const latest = (c.financialKpis as any)?.latestKpiValues?.TOTAL_REVENUE;
      if (latest == null || latest === "") continue;
      const n = parseFloat(String(latest));
      if (!Number.isFinite(n)) continue;
      sum += n;
      companiesWithRevenue += 1;
    }
    return {
      totalRevenue: roundTo(sum, 2),
      companyCount: companies.length,
      companiesWithRevenue
    };
  }

  /**
   * Get comprehensive portfolio dashboard data
   */
  static async getDashboardData(params: PortfolioDashboardParams = {}): Promise<PortfolioDashboardData> {
    try {
      const asOfDate = params.asOfDate || new Date();
      const filterYear = params.year;

      let effectiveFundId: string | undefined = params.fundId;
      if (!effectiveFundId && params.portfolioCompanyId) {
        const pc = await prisma.portfolioCompany.findUnique({
          where: { id: params.portfolioCompanyId },
          select: { fundId: true },
        });
        effectiveFundId = pc?.fundId ?? undefined;
      }
      
      // Get fund(s) - if fundId provided, get specific fund, otherwise get all funds
      let funds: any[];
      if (effectiveFundId) {
        const fund = await prisma.fund.findUnique({
          where: { id: effectiveFundId },
          include: {
            portfolioCompanies: {
              include: {
                investmentImplementation: {
                  include: {
                    fundDisbursements: true
                  }
                }
              }
            },
            investmentCommitments: true
          }
        });
        // If fund not found, return empty dashboard with zeros
        if (!fund) {
          return this.makeEmptyPortfolioDashboardData({
            asOfDate: params.asOfDate || new Date(),
            fundName: null,
            year: params.year || null,
          });
        }
        funds = [fund];
      } else {
        funds = await prisma.fund.findMany({
          include: {
            portfolioCompanies: {
              include: {
                investmentImplementation: {
                  include: {
                    fundDisbursements: true
                  }
                }
              }
            },
            investmentCommitments: true
          }
        });
        // If no funds found, return empty dashboard with zeros
        if (funds.length === 0) {
          return this.makeEmptyPortfolioDashboardData({
            asOfDate: params.asOfDate || new Date(),
            fundName: null,
            year: params.year || null,
          });
        }
      }
      
      // Get portfolio companies from funds
      let allPortfolioCompanies = funds.flatMap(f => f.portfolioCompanies || []);
      
      // If no portfolio companies found through fund relation, try querying directly by fundId
      if (allPortfolioCompanies.length === 0 && effectiveFundId) {
        const directCompanies = await prisma.portfolioCompany.findMany({
          where: {
            fundId: effectiveFundId
          },
          include: {
            investmentImplementation: {
              include: {
                fundDisbursements: true
              }
            }
          }
        });
        allPortfolioCompanies = directCompanies;
      }

      if (filterYear) {
        allPortfolioCompanies = allPortfolioCompanies.filter(company => {
          const startYear = company.startDate ? new Date(company.startDate).getFullYear() : null;
          return startYear === filterYear || !startYear; // Include if matches year or no start date
        });
      }

      if (params.portfolioCompanyId) {
        allPortfolioCompanies = allPortfolioCompanies.filter((c) => c.id === params.portfolioCompanyId);
      }
      
      // For aggregation, we'll use the first fund as the "primary" fund for fund-specific fields
      // but aggregate data across all funds
      const primaryFund = funds[0];
      const scope = params.scope === "aum" ? "aum" : "full";
      const irrQuarterCap = scope === "aum" ? IRR_BY_QUARTER_CAP_AUM : IRR_BY_QUARTER_CAP_FULL;

      const [
        metrics,
        performanceOverview,
        jCurve,
        irrByQuarter,
        portfolioSummary,
      ] = await Promise.all([
        Promise.resolve(this.calculateMetrics(funds, allPortfolioCompanies)),
        this.calculatePerformanceOverview(funds, allPortfolioCompanies),
        Promise.resolve(this.calculateJCurve(funds, allPortfolioCompanies, filterYear)),
        Promise.resolve(
          this.calculateIRRByQuarter(funds, allPortfolioCompanies, filterYear, irrQuarterCap)
        ),
        Promise.resolve(
          this.calculatePortfolioSummary(allPortfolioCompanies, {
            skipAnalystFlags: scope === "aum",
          })
        ),
      ]);
      const dealAllocation = PortfolioDashboardService.deriveDealAllocationFromPortfolioSummary(
        portfolioSummary
      );
      
      // Calculate totals
      const totals = this.calculateTotals(portfolioSummary);
      
      // Determine fund name(s) for display
      const fundName = effectiveFundId
        ? primaryFund.name
        : funds.length === 1
          ? primaryFund.name
          : `All Funds (${funds.length})`;

      const paidIn = performanceOverview.paidIn;
      const dpi =
        paidIn > 0 ? Math.round((performanceOverview.realizedProceedsAndIncome / paidIn) * 10000) / 10000 : 0;
      const moicOnCost =
        totals.totalInvestmentCost > 0
          ? Math.round((totals.totalValue / totals.totalInvestmentCost) * 10000) / 10000
          : 0;
      const portfolioRoi =
        metrics.totalInvested > 0
          ? Math.round(((totals.totalValue - metrics.totalInvested) / metrics.totalInvested) * 10000) / 10000
          : null;
      const metricsAugmented = {
        ...metrics,
        dpi,
        moicOnCost,
        portfolioRoi,
      };

      const pctShares = dealAllocation.map((d) => d.percentage).filter((p) => Number.isFinite(p) && p >= 0);
      const sectorHhi = sectorHerfindahlHirschmanFromPercentages(pctShares);
      const sectorCount = new Set(dealAllocation.map((d) => d.sector)).size;

      let totalCommittedSum = 0;
      for (const c of allPortfolioCompanies) {
        const committed = c.investmentImplementation?.totalCommittedAmount;
        if (committed != null) {
          totalCommittedSum += parseFloat((committed as Decimal).toString());
        }
      }
      const deploymentRatePct =
        totalCommittedSum > 0
          ? Math.round((metrics.totalInvested / totalCommittedSum) * 10000) / 100
          : null;

      const totalPortfolioAum = Math.round(totals.totalValue * 100) / 100;
      const aumGrowthYoy = this.computeAumGrowthYoyFromKpiHistory(allPortfolioCompanies, totals.totalValue);
      const aumHistoryCagr = computePortfolioAumHistoryCagr({
        portfolioCompanies: allPortfolioCompanies,
        getRealizedValue: (c) => this.getRealizedValue(c),
      });

      const analystFlagsRollup =
        scope === "aum"
          ? []
          : rollupAnalystFlags(
              portfolioSummary.map((row) => ({ companyName: row.name, flags: row.analystFlags }))
            );

      const comparisonChart =
        scope === "aum" ? [] : PortfolioDashboardService.buildComparisonChartFromSummary(portfolioSummary);
      const netProfitWaterfall =
        scope === "aum" ? [] : PortfolioDashboardService.buildNetProfitWaterfallFromSummary(portfolioSummary);
      const portfolioComposition = PortfolioDashboardService.buildPortfolioComposition({
        portfolioSummary,
        allPortfolioCompanies,
        totals,
        metrics: metricsAugmented,
        deploymentRatePct,
        totalCommittedSum,
        totalDeployed: metrics.totalInvested,
        aumGrowthYoy,
        aumHistoryCagr,
      });

      const ytdAum = computeYtdAumChangeRate({
        historySeries: aumHistoryCagr.series,
        calendarYear: asOfDate.getFullYear(),
        currentTotalAum: totalPortfolioAum,
      });
      const aumKpis = PortfolioDashboardService.buildAumKpis({
        portfolioComposition,
        metrics: metricsAugmented,
        ytdAum,
      });

      return {
        metrics: metricsAugmented,
        performanceOverview,
        jCurve,
        dealAllocation,
        irrByQuarter,
        portfolioSummary,
        comparisonChart,
        netProfitWaterfall,
        totals,
        totalPortfolioAum,
        aumKpis,
        portfolioComposition,
        fundKpis: {
          deploymentRatePct,
          sectorHerfindahlHirschmanIndex: sectorHhi,
          sectorCount,
          aumGrowthYoy,
          aumCagr: portfolioComposition.aumGrowth.cagr,
          numberOfHoldings: portfolioComposition.headline.numberOfHoldings,
        },
        analystFlagsRollup,
        period: {
          asOfDate,
          fundName,
          year: filterYear || null,
          scope,
        },
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error("Error generating portfolio dashboard:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to generate portfolio dashboard. Please try again.");
    }
  }
  
  /**
   * Calculate high-level metrics (supports multiple funds aggregation).
   * Uses loaded fund trees only — no per-fund `calculateFundPerformance` DB round-trips.
   */
  private static calculateMetrics(
    funds: any[],
    portfolioCompanies: any[]
  ): {
    totalInvested: number;
    availableForDrawdown: number;
    fundGrossIRR: number;
    lpNetIRR: number;
    tvpi: number;
  } {
    // Total invested = sum of all disbursed amounts
    const totalInvested = portfolioCompanies.reduce((sum, company) => {
      const disbursements = company.investmentImplementation?.fundDisbursements || [];
      const companyTotal = disbursements
        .filter((d: any) => d.status === 'DISBURSED')
        .reduce((companySum: number, d: any) => {
          const amount = d.amount || new Decimal(0);
          return companySum + parseFloat(amount.toString());
        }, 0);
      return sum + companyTotal;
    }, 0);
    
    // Available for drawdown = sum of remainingAmount from all funds
    const availableForDrawdown = funds.reduce((sum, fund) => {
      const remaining = fund.remainingAmount || new Decimal(0);
      return sum + parseFloat(remaining.toString());
    }, 0);
    
    // Calculate TVPI (Total Value to Paid-In)
    // TVPI = (Realized + Unrealized) / Paid-In
    const paidIn = funds.reduce((sum, fund) => {
      const total = fund.totalAmount || new Decimal(0);
      return sum + parseFloat(total.toString());
    }, 0);
    const totalValue = portfolioCompanies.reduce((sum, company) => {
      const fmv = this.getFairMarketValue(company);
      const realized = this.getRealizedValue(company);
      return sum + fmv + realized;
    }, 0);
    const tvpi = paidIn > 0 ? totalValue / paidIn : 0;
    
    // Calculate Fund Gross IRR (weighted average across all funds)
    let totalWeightedIRR = 0;
    let totalWeight = 0;
    for (const fund of funds) {
      try {
        const irr = DataIntegrationService.fundGrossIrrFromLoadedFund(fund);
        const fundPaidIn = parseFloat((fund.totalAmount || new Decimal(0)).toString());
        totalWeightedIRR += irr * fundPaidIn;
        totalWeight += fundPaidIn;
      } catch (error) {
        console.error(`Error calculating IRR for fund ${fund.id}:`, error);
      }
    }
    const fundGrossIRR = totalWeight > 0 ? totalWeightedIRR / totalWeight : 0;
    
    // LP Net IRR = Fund Gross IRR - management fees (simplified, assume 2% management fee)
    const managementFeeRate = 0.02; // 2% annual management fee
    const lpNetIRR = Math.max(0, fundGrossIRR - (managementFeeRate * 100));
    
    return {
      totalInvested: Math.round(totalInvested * 100) / 100,
      availableForDrawdown: Math.round(availableForDrawdown * 100) / 100,
      fundGrossIRR: Math.round(fundGrossIRR * 100) / 100,
      lpNetIRR: Math.round(lpNetIRR * 100) / 100,
      tvpi: Math.round(tvpi * 10000) / 10000 // Round to 4 decimals for multiples
    };
  }
  
  /**
   * Calculate performance overview (bar chart data) - supports multiple funds
   */
  private static async calculatePerformanceOverview(
    funds: any[],
    portfolioCompanies: any[]
  ): Promise<{
    paidIn: number;
    totalInvestment: number;
    managementExpenses: number;
    otherExpenses: number;
    realizedProceedsAndIncome: number;
    fmvUnrealizedPortfolio: number;
  }> {
    // Aggregate paidIn across all funds
    const paidIn = funds.reduce((sum, fund) => {
      const total = fund.totalAmount || new Decimal(0);
      return sum + parseFloat(total.toString());
    }, 0);
    
    // Total investment = sum of all disbursed amounts
    const totalInvestment = portfolioCompanies.reduce((sum, company) => {
      const disbursements = company.investmentImplementation?.fundDisbursements || [];
      const companyTotal = disbursements
        .filter((d: any) => d.status === 'DISBURSED')
        .reduce((companySum: number, d: any) => {
          const amount = d.amount || new Decimal(0);
          return companySum + parseFloat(amount.toString());
        }, 0);
      return sum + companyTotal;
    }, 0);
    
    const { management: managementExpenses, other: otherExpenses } =
      await this.getPostedExpenseTotalsSplit();
    
    // Realized proceeds and income = sum of realized values + dividend income
    const realizedProceedsAndIncome = portfolioCompanies.reduce((sum, company) => {
      return sum + this.getRealizedValue(company);
    }, 0);
    
    // FMV of unrealized portfolio = sum of fair market values
    const fmvUnrealizedPortfolio = portfolioCompanies.reduce((sum, company) => {
      return sum + this.getFairMarketValue(company);
    }, 0);
    
    return {
      paidIn: Math.round(paidIn * 100) / 100,
      totalInvestment: Math.round(totalInvestment * 100) / 100,
      managementExpenses: Math.round(managementExpenses * 100) / 100,
      otherExpenses: Math.round(otherExpenses * 100) / 100,
      realizedProceedsAndIncome: Math.round(realizedProceedsAndIncome * 100) / 100,
      fmvUnrealizedPortfolio: Math.round(fmvUnrealizedPortfolio * 100) / 100
    };
  }
  
  /**
   * Calculate J Curve data (supports multiple funds and year filter)
   */
  private static async calculateJCurve(
    funds: any[],
    portfolioCompanies: any[],
    filterYear?: number
  ): Promise<Array<{
    year: number;
    contribution: number;
    distribution: number;
    cumulativeAmount: number;
  }>> {
    // Get all investment commitments (contributions) from all funds
    const allCommitments = funds.flatMap(fund => fund.investmentCommitments || []);
    
    // Group commitments by year
    const contributionsByYear = new Map<number, number>();
    for (const commitment of allCommitments) {
      if (!commitment.effectiveDate || !commitment.amount) continue;
      const year = new Date(commitment.effectiveDate).getFullYear();
      if (filterYear && year !== filterYear) continue; // Filter by year if specified
      const current = contributionsByYear.get(year) || 0;
      const amount = commitment.amount || new Decimal(0);
      contributionsByYear.set(year, current + parseFloat(amount.toString()));
    }
    
    // Get distributions (realized proceeds) by year
    const distributionsByYear = new Map<number, number>();
    for (const company of portfolioCompanies) {
      const realized = this.getRealizedValue(company);
      if (realized === 0) continue;
      
      // Use company startDate, endDate, or first disbursement date as proxy for distribution year
      let distributionYear: number;
      if (company.endDate) {
        distributionYear = new Date(company.endDate).getFullYear();
      } else if (company.startDate) {
        distributionYear = new Date(company.startDate).getFullYear();
      } else {
        const firstDisbursement = company.investmentImplementation?.fundDisbursements
          ?.filter((d: any) => d.status === 'DISBURSED')
          ?.sort((a: any, b: any) => new Date(a.disbursementDate).getTime() - new Date(b.disbursementDate).getTime())[0];
        distributionYear = firstDisbursement 
          ? new Date(firstDisbursement.disbursementDate).getFullYear()
          : new Date().getFullYear();
      }
      
      if (filterYear && distributionYear !== filterYear) continue; // Filter by year if specified
      const current = distributionsByYear.get(distributionYear) || 0;
      distributionsByYear.set(distributionYear, current + realized);
    }
    
    // Get all years from earliest fund creation to current
    const fundStartYears = funds.map(f => new Date(f.createdAt).getFullYear());
    const earliestYear = Math.min(...fundStartYears);
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let year = earliestYear; year <= currentYear; year++) {
      if (filterYear && year !== filterYear) continue; // Filter by year if specified
      years.push(year);
    }
    
    // Build J Curve data
    let cumulativeAmount = 0;
    const jCurve = years.map(year => {
      const contribution = contributionsByYear.get(year) || 0;
      const distribution = distributionsByYear.get(year) || 0;
      cumulativeAmount = cumulativeAmount + contribution - distribution;
      
      return {
        year,
        contribution: Math.round(contribution * 100) / 100,
        distribution: Math.round(distribution * 100) / 100,
        cumulativeAmount: Math.round(cumulativeAmount * 100) / 100
      };
    });
    
    return jCurve;
  }
  
  /**
   * Calculate IRR by quarter (supports multiple funds and year filter)
   */
  private static async calculateIRRByQuarter(
    funds: any[],
    portfolioCompanies: any[],
    filterYear?: number,
    maxQuarters?: number
  ): Promise<Array<{
    quarter: string;
    quarterNumber: number;
    year: number;
    investorNetIRR: number;
    fundNetIRR: number;
    fundGrossIRR: number;
  }>> {
    // Get earliest fund start date
    const fundStartDates = funds.map(f => new Date(f.createdAt));
    const earliestStartDate = new Date(Math.min(...fundStartDates.map(d => d.getTime())));
    const currentDate = new Date();
    
    // Generate quarters from earliest fund start to current
    const quarters: Array<{ quarter: number; year: number }> = [];
    let currentQuarter = Math.floor(earliestStartDate.getMonth() / 3) + 1;
    let currentYear = earliestStartDate.getFullYear();
    
    while (currentYear < currentDate.getFullYear() || 
           (currentYear === currentDate.getFullYear() && currentQuarter <= Math.floor(currentDate.getMonth() / 3) + 1)) {
      if (!filterYear || currentYear === filterYear) {
        quarters.push({ quarter: currentQuarter, year: currentYear });
      }
      
      currentQuarter++;
      if (currentQuarter > 4) {
        currentQuarter = 1;
        currentYear++;
      }
    }

    const cap = maxQuarters != null && maxQuarters > 0 ? maxQuarters : IRR_BY_QUARTER_CAP_FULL;
    if (quarters.length > cap) {
      quarters.splice(0, quarters.length - cap);
    }

    // Aggregate paidIn across all funds
    const totalPaidIn = funds.reduce((sum, fund) => {
      const total = fund.totalAmount || new Decimal(0);
      return sum + parseFloat(total.toString());
    }, 0);
    
    // Calculate IRR for each quarter (simplified - would need proper cash flow analysis)
    const irrByQuarter = quarters.map(({ quarter, year }) => {
      // For each quarter, calculate cumulative performance
      const quarterEndDate = new Date(year, quarter * 3 - 1, 0); // Last day of quarter
      
      // Get investments made up to this quarter
      const investmentsUpToQuarter = portfolioCompanies.reduce((sum, company) => {
        const disbursements = company.investmentImplementation?.fundDisbursements || [];
        const companyTotal = disbursements
          .filter((d: any) => {
            const disbursementDate = new Date(d.disbursementDate);
            return disbursementDate <= quarterEndDate && d.status === 'DISBURSED';
          })
          .reduce((companySum: number, d: any) => {
            const amount = d.amount || new Decimal(0);
            return companySum + parseFloat(amount.toString());
          }, 0);
        return sum + companyTotal;
      }, 0);
      
      // Get total value up to this quarter
      const totalValueUpToQuarter = portfolioCompanies.reduce((sum, company) => {
        const fmv = this.getFairMarketValue(company);
        const realized = this.getRealizedValue(company);
        return sum + fmv + realized;
      }, 0);
      
      // Simplified IRR calculation
      const fundGrossIRR = totalPaidIn > 0 && investmentsUpToQuarter > 0
        ? ((totalValueUpToQuarter / totalPaidIn) - 1) * 100
        : 0;
      
      // Fund Net IRR = Gross IRR - management fees
      const managementFeeRate = 0.02;
      const fundNetIRR = Math.max(0, fundGrossIRR - (managementFeeRate * 100));
      
      // Investor Net IRR = Fund Net IRR - carried interest (simplified, assume 20% carry)
      const carryRate = 0.20;
      const investorNetIRR = fundNetIRR * (1 - carryRate);
      
      return {
        quarter: `Q${quarter} ${year}`,
        quarterNumber: quarter,
        year,
        investorNetIRR: Math.round(investorNetIRR * 100) / 100,
        fundNetIRR: Math.round(fundNetIRR * 100) / 100,
        fundGrossIRR: Math.round(fundGrossIRR * 100) / 100
      };
    });
    
    return irrByQuarter;
  }
  
  /**
   * Cost-basis sector split (avoids a second pass over disbursements — derives from summary rows).
   */
  private static deriveDealAllocationFromPortfolioSummary(
    summary: PortfolioDashboardData["portfolioSummary"]
  ): PortfolioDashboardData["dealAllocation"] {
    const sectorMap = new Map<string, number>();
    for (const row of summary) {
      const sec = row.mainIndustry || "Other";
      sectorMap.set(sec, (sectorMap.get(sec) || 0) + row.totalInvestmentCost);
    }
    let totalInvestmentCost = 0;
    for (const v of sectorMap.values()) totalInvestmentCost += v;
    return Array.from(sectorMap.entries())
      .map(([sector, investmentCost]) => ({
        sector,
        investmentCost: Math.round(investmentCost * 100) / 100,
        percentage:
          totalInvestmentCost > 0
            ? Math.round((investmentCost / totalInvestmentCost) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => b.investmentCost - a.investmentCost);
  }

  /**
   * Calculate portfolio summary table
   */
  private static calculatePortfolioSummary(
    portfolioCompanies: any[],
    options?: { skipAnalystFlags?: boolean }
  ): PortfolioDashboardData["portfolioSummary"] {
    const skipFlags = options?.skipAnalystFlags === true;
    const summary = portfolioCompanies.map(company => {
      const disbursements = company.investmentImplementation?.fundDisbursements || [];
      
      // Total investment cost = sum of all disbursed amounts
      const totalInvestmentCost = disbursements
        .filter((d: any) => d.status === 'DISBURSED')
        .reduce((sum: number, d: any) => {
          const amount = d.amount || new Decimal(0);
          return sum + parseFloat(amount.toString());
        }, 0);
      
      // Current investment cost = total investment cost (assuming no partial exits)
      const currentInvestmentCost = totalInvestmentCost;
      
      // Get initial investment date (first disbursement date or startDate)
      const firstDisbursement = disbursements
        .filter((d: any) => d.status === 'DISBURSED')
        .sort((a: any, b: any) => {
          const dateA = a.disbursementDate ? new Date(a.disbursementDate).getTime() : 0;
          const dateB = b.disbursementDate ? new Date(b.disbursementDate).getTime() : 0;
          return dateA - dateB;
        })[0];
      const initialInvestment = firstDisbursement?.disbursementDate 
        ? new Date(firstDisbursement.disbursementDate) 
        : (company.startDate ? new Date(company.startDate) : null);
      
      // Commit/Reserves = totalCommittedAmount - totalInvestmentCost
      const committedAmount = company.investmentImplementation?.totalCommittedAmount || new Decimal(0);
      const totalCommitted = parseFloat(committedAmount.toString());
      const commitReserves = Math.max(0, totalCommitted - totalInvestmentCost);
      
      // Current ownership from capTable or default
      const capTable = company.capTable as any;
      const currentOwnership = capTable?.currentOwnership || null;
      
      // Realized value
      const realized = this.getRealizedValue(company);
      
      // Fair market value
      const fairMarketValue = this.getFairMarketValue(company);

      // Total value = realized + fair market value
      const totalValue = realized + fairMarketValue;

      // Multiples of cost = totalValue / totalInvestmentCost
      const multiplesOfCost = totalInvestmentCost > 0 
        ? totalValue / totalInvestmentCost 
        : 0;

      // Gross IRR (simplified calculation). Floor holding period at ~1 day so brand-new positions do not explode.
      const yearsSinceInvestmentRaw = initialInvestment
        ? (new Date().getTime() - new Date(initialInvestment).getTime()) / (1000 * 60 * 60 * 24 * 365)
        : 1;
      const yearsSinceInvestment = Math.max(yearsSinceInvestmentRaw, 1 / 365);
      const grossIRR =
        totalInvestmentCost > 0 && yearsSinceInvestment > 0
          ? (Math.pow(totalValue / totalInvestmentCost, 1 / yearsSinceInvestment) - 1) * 100
          : 0;

      // Get KPI values from financialKpis
      const financialKpis = company.financialKpis as any;
      const latestKpiValues = financialKpis?.latestKpiValues || {};
      const totalRevenue = latestKpiValues.TOTAL_REVENUE !== undefined && latestKpiValues.TOTAL_REVENUE !== null
        ? parseFloat(latestKpiValues.TOTAL_REVENUE.toString())
        : null;
      const netProfit = latestKpiValues.NET_PROFIT !== undefined && latestKpiValues.NET_PROFIT !== null
        ? parseFloat(latestKpiValues.NET_PROFIT.toString())
        : null;
      const cashFlowNet = latestKpiValues.CASH_FLOW_NET !== undefined && latestKpiValues.CASH_FLOW_NET !== null
        ? parseFloat(latestKpiValues.CASH_FLOW_NET.toString())
        : null;

      const rawMonitoring = financialKpis?.monitoringKpis;
      const monitoringKpis =
        rawMonitoring && typeof rawMonitoring === "object"
          ? Object.fromEntries(
              Object.entries(rawMonitoring).filter(([, v]) => v === null || typeof v === "number")
            )
          : null;
      const meta = financialKpis?.monitoringKpisMeta;
      const monitoringKpisMeta =
        meta && typeof meta === "object"
          ? {
              asOfPeriod: meta.asOfPeriod != null ? String(meta.asOfPeriod) : undefined,
              computedAt: meta.computedAt != null ? String(meta.computedAt) : undefined,
              source: meta.source != null ? String(meta.source) : undefined,
            }
          : null;

      const kpiValues = financialKpis?.kpiValues;
      const pair = getLatestAndPriorKpiBlobs(kpiValues);
      let priorPeriodKey: string | null = null;
      let currentPeriodKey: string | null = null;
      let totalRevenuePrior: number | null = null;
      let netProfitPrior: number | null = null;
      let cashFlowNetPrior: number | null = null;
      if (pair) {
        priorPeriodKey = pair.priorKey;
        currentPeriodKey = pair.currentKey;
        totalRevenuePrior = numFromKpiField(pair.prior as Record<string, unknown>, "TOTAL_REVENUE");
        netProfitPrior = numFromKpiField(pair.prior as Record<string, unknown>, "NET_PROFIT");
        cashFlowNetPrior = numFromKpiField(pair.prior as Record<string, unknown>, "CASH_FLOW_NET");
      }
      const totalRevenueDelta =
        totalRevenue != null && totalRevenuePrior != null
          ? Math.round((totalRevenue - totalRevenuePrior) * 100) / 100
          : null;
      const netProfitDelta =
        netProfit != null && netProfitPrior != null
          ? Math.round((netProfit - netProfitPrior) * 100) / 100
          : null;
      const cashFlowNetDelta =
        cashFlowNet != null && cashFlowNetPrior != null
          ? Math.round((cashFlowNet - cashFlowNetPrior) * 100) / 100
          : null;

      const revGrowthMon = monitoringKpis?.REVENUE_GROWTH_RATE;
      let revenueGrowthRateForRag: number | null =
        revGrowthMon != null && Number.isFinite(revGrowthMon) ? revGrowthMon : null;
      if (
        revenueGrowthRateForRag == null &&
        totalRevenuePrior != null &&
        totalRevenuePrior > 0 &&
        totalRevenue != null
      ) {
        revenueGrowthRateForRag = (totalRevenue - totalRevenuePrior) / totalRevenuePrior;
      }
      const nm = monitoringKpis?.NET_PROFIT_MARGIN;
      const cr = monitoringKpis?.CURRENT_RATIO;
      const qr = monitoringKpis?.QUICK_RATIO;
      const ocf = monitoringKpis?.OPERATING_CASH_FLOW;

      const kpiRag = {
        revenueGrowth: revenueGrowthRag(revenueGrowthRateForRag),
        profitability: profitRag(netProfit, nm != null ? nm : null),
        liquidity: liquidityRag(cr != null ? cr : null, qr != null ? qr : null),
        cashFlow: cashFlowRag(ocf != null ? ocf : null, cashFlowNet),
      };

      const analystFlags = skipFlags
        ? []
        : computeAnalystFlagsForCompany({
            companyName: company.name,
            monitoringKpis,
            totalRevenue,
            netProfit,
            cashFlowNet,
            totalRevenuePrior,
            revenueGrowthRateFromMonitoring: revGrowthMon,
          });

      const monitoringKpisFilled = PortfolioDashboardService.mergeMonitoringKpisFromLatest(
        monitoringKpis,
        latestKpiValues as Record<string, unknown>,
        totalRevenue,
        netProfit,
        cashFlowNet
      );

      return {
        companyId: company.id,
        name: company.name,
        initialInvestment,
        mainIndustry: company.industry || 'Other',
        commitReserves: Math.round(commitReserves * 100) / 100,
        currentOwnership: currentOwnership ? Math.round(currentOwnership * 100) / 100 : null,
        totalInvestmentCost: Math.round(totalInvestmentCost * 100) / 100,
        currentInvestmentCost: Math.round(currentInvestmentCost * 100) / 100,
        realized: Math.round(realized * 100) / 100,
        fairMarketValue: Math.round(fairMarketValue * 100) / 100,
        totalValue: Math.round(totalValue * 100) / 100,
        multiplesOfCost: Math.round(multiplesOfCost * 10000) / 10000,
        grossIRR: Math.round(grossIRR * 100) / 100,
        totalRevenue: totalRevenue !== null ? Math.round(totalRevenue * 100) / 100 : null,
        netProfit: netProfit !== null ? Math.round(netProfit * 100) / 100 : null,
        cashFlowNet: cashFlowNet !== null ? Math.round(cashFlowNet * 100) / 100 : null,
        monitoringKpis,
        monitoringKpisMeta,
        priorPeriodKey,
        currentPeriodKey,
        totalRevenuePrior: totalRevenuePrior !== null ? Math.round(totalRevenuePrior * 100) / 100 : null,
        netProfitPrior: netProfitPrior !== null ? Math.round(netProfitPrior * 100) / 100 : null,
        cashFlowNetPrior: cashFlowNetPrior !== null ? Math.round(cashFlowNetPrior * 100) / 100 : null,
        totalRevenueDelta,
        netProfitDelta,
        cashFlowNetDelta,
        kpiRag,
        analystFlags,
        monitoringKpisFilled,
      };
    });
    
    // Sort by total value descending
    summary.sort((a, b) => b.totalValue - a.totalValue);
    
    return summary;
  }

  /** Bar-chart series: revenue growth, EBITDA margin, net margin per company (monitoring + kpiValues fallback). */
  private static buildComparisonChartFromSummary(
    summary: PortfolioDashboardData["portfolioSummary"]
  ): PortfolioDashboardData["comparisonChart"] {
    return summary.map((row) => {
      const filled = row.monitoringKpisFilled || row.monitoringKpis;
      let revGrowth: number | null =
        filled?.REVENUE_GROWTH_RATE != null && Number.isFinite(filled.REVENUE_GROWTH_RATE as number)
          ? (filled.REVENUE_GROWTH_RATE as number)
          : null;
      if (
        revGrowth == null &&
        row.totalRevenuePrior != null &&
        row.totalRevenuePrior > 0 &&
        row.totalRevenue != null
      ) {
        revGrowth = (row.totalRevenue - row.totalRevenuePrior) / row.totalRevenuePrior;
      }
      const ebitdaMargin =
        filled?.EBITDA_MARGIN != null && Number.isFinite(filled.EBITDA_MARGIN as number)
          ? (filled.EBITDA_MARGIN as number)
          : null;
      let npm: number | null =
        filled?.NET_PROFIT_MARGIN != null && Number.isFinite(filled.NET_PROFIT_MARGIN as number)
          ? (filled.NET_PROFIT_MARGIN as number)
          : null;
      if (npm == null && row.totalRevenue != null && row.totalRevenue > 0 && row.netProfit != null) {
        npm = row.netProfit / row.totalRevenue;
      }
      const roundR = (x: number) => Math.round(x * 1e6) / 1e6;
      const toPct = (x: number | null) => (x != null ? Math.round(x * 10000) / 100 : null);
      return {
        companyId: row.companyId,
        name: row.name,
        priorPeriodKey: row.priorPeriodKey,
        currentPeriodKey: row.currentPeriodKey,
        revenueGrowthRate: revGrowth != null ? roundR(revGrowth) : null,
        revenueGrowthRatePct: toPct(revGrowth),
        ebitdaMargin: ebitdaMargin != null ? roundR(ebitdaMargin) : null,
        ebitdaMarginPct: toPct(ebitdaMargin),
        netProfitMargin: npm != null ? roundR(npm) : null,
        netProfitMarginPct: toPct(npm),
      };
    });
  }

  /**
   * Waterfall from prior net profit: + revenue change + (costs & other, net) = current net profit.
   * Residual step captures margin, opex, and unmodeled P&L lines when only revenue and net are known.
   */
  private static buildNetProfitWaterfallFromSummary(
    summary: PortfolioDashboardData["portfolioSummary"]
  ): PortfolioDashboardData["netProfitWaterfall"] {
    return summary.map((row) => {
      const np0 = row.netProfitPrior;
      const np1 = row.netProfit;
      const revDelta = row.totalRevenueDelta;
      const netDelta = row.netProfitDelta;
      const incomplete =
        np0 == null || np1 == null || revDelta == null || netDelta == null;
      if (incomplete) {
        return {
          companyId: row.companyId,
          name: row.name,
          priorPeriodKey: row.priorPeriodKey,
          currentPeriodKey: row.currentPeriodKey,
          startNetProfit: np0 != null ? Math.round(np0 * 100) / 100 : null,
          endNetProfit: np1 != null ? Math.round(np1 * 100) / 100 : null,
          steps: [],
          complete: false,
        };
      }
      const costsOther = Math.round((netDelta - revDelta) * 100) / 100;
      return {
        companyId: row.companyId,
        name: row.name,
        priorPeriodKey: row.priorPeriodKey,
        currentPeriodKey: row.currentPeriodKey,
        startNetProfit: Math.round(np0 * 100) / 100,
        endNetProfit: Math.round(np1 * 100) / 100,
        steps: [
          {
            id: "revenue_change",
            label: "Revenue change",
            value: Math.round(revDelta * 100) / 100,
          },
          {
            id: "costs_and_other",
            label: "Costs & other (net)",
            value: costsOther,
          },
        ],
        complete: true,
      };
    });
  }

  private static buildPortfolioComposition(params: {
    portfolioSummary: PortfolioDashboardData["portfolioSummary"];
    allPortfolioCompanies: any[];
    totals: PortfolioDashboardData["totals"];
    metrics: PortfolioDashboardData["metrics"];
    deploymentRatePct: number | null;
    totalCommittedSum: number;
    totalDeployed: number;
    aumGrowthYoy: number | null;
    aumHistoryCagr: ReturnType<typeof computePortfolioAumHistoryCagr>;
  }): PortfolioDashboardData["portfolioComposition"] {
    const {
      portfolioSummary,
      allPortfolioCompanies,
      totals,
      metrics,
      deploymentRatePct,
      totalCommittedSum,
      totalDeployed,
      aumGrowthYoy,
      aumHistoryCagr,
    } = params;

    const numberOfHoldings = portfolioSummary.filter(
      (r) => r.totalInvestmentCost > 0 || r.totalValue > 0
    ).length;

    const sectorMap = new Map<string, number>();
    for (const row of portfolioSummary) {
      const sec = row.mainIndustry || "Other";
      sectorMap.set(sec, (sectorMap.get(sec) || 0) + row.totalValue);
    }
    const aumTotal = totals.totalValue;
    const aumBySector = Array.from(sectorMap.entries())
      .map(([sector, aum]) => ({
        sector,
        aum: Math.round(aum * 100) / 100,
        percentage: aumTotal > 0 ? Math.round((aum / aumTotal) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.aum - a.aum);

    const companyById = new Map<string, any>(allPortfolioCompanies.map((c: any) => [c.id, c]));
    const assetMap = new Map<string, number>();
    for (const row of portfolioSummary) {
      const co = companyById.get(row.companyId);
      const label = co ? inferAssetClassLabel(co) : "EQUITY";
      assetMap.set(label, (assetMap.get(label) || 0) + row.totalValue);
    }
    const aumByAssetClass = Array.from(assetMap.entries())
      .map(([assetClass, aum]) => ({
        assetClass,
        aum: Math.round(aum * 100) / 100,
        percentage: aumTotal > 0 ? Math.round((aum / aumTotal) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.aum - a.aum);

    const buMap = new Map<string, number>();
    for (const row of portfolioSummary) {
      const co = companyById.get(row.companyId);
      const bu = co ? inferBusinessUnitLabel(co) : "Unspecified";
      buMap.set(bu, (buMap.get(bu) || 0) + row.totalValue);
    }
    const aumByBusinessUnit = Array.from(buMap.entries())
      .map(([businessUnit, aum]) => ({
        businessUnit,
        aum: Math.round(aum * 100) / 100,
        percentage: aumTotal > 0 ? Math.round((aum / aumTotal) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.aum - a.aum);

    const sectorPctShares = aumBySector
      .map((d) => d.percentage)
      .filter((p) => Number.isFinite(p) && p >= 0);
    const aumSectorHhi = sectorHerfindahlHirschmanFromPercentages(sectorPctShares);
    const diversificationScore0to100 =
      aumSectorHhi != null && Number.isFinite(aumSectorHhi)
        ? Math.round((1 - aumSectorHhi / 10000) * 10000) / 100
        : null;

    return {
      headline: {
        totalPortfolioAum: Math.round(totals.totalValue * 100) / 100,
        totalRealizedValue: Math.round(totals.realized * 100) / 100,
        totalUnrealizedValue: Math.round(totals.fairMarketValue * 100) / 100,
        numberOfHoldings,
      },
      aumBySector,
      aumByAssetClass,
      aumByBusinessUnit,
      diversification: {
        sectorCount: new Set(aumBySector.map((d) => d.sector)).size,
        aumSectorHerfindahlHirschmanIndex: aumSectorHhi,
        diversificationScore0to100,
      },
      aumGrowth: {
        yoyChangeRate: aumGrowthYoy,
        cagr: aumHistoryCagr.cagr,
        cagrYears: aumHistoryCagr.years,
        firstPeriodKey: aumHistoryCagr.firstPeriodKey,
        lastPeriodKey: aumHistoryCagr.lastPeriodKey,
        historySeries: aumHistoryCagr.series,
      },
      utilization: {
        deploymentRatePct,
        totalCommittedCapital: Math.round(totalCommittedSum * 100) / 100,
        totalDeployed: Math.round(totalDeployed * 100) / 100,
      },
      performance: {
        tvpi: metrics.tvpi,
        dpi: metrics.dpi,
        moicOnCost: metrics.moicOnCost,
        fundGrossIRR: metrics.fundGrossIRR,
        lpNetIRR: metrics.lpNetIRR,
        portfolioRoi: metrics.portfolioRoi,
      },
      riskAdjustedReturns: {
        sharpeRatio: null,
        beta: null,
        dataAvailability: "NOT_AVAILABLE",
        note:
          "Sharpe ratio and beta require periodic portfolio returns and a benchmark series; not computed in this API.",
      },
    };
  }

  private static buildAumKpis(params: {
    portfolioComposition: PortfolioDashboardData["portfolioComposition"];
    metrics: PortfolioDashboardData["metrics"];
    ytdAum: ReturnType<typeof computeYtdAumChangeRate>;
  }): PortfolioDashboardData["aumKpis"] {
    const { portfolioComposition: pc, metrics, ytdAum } = params;
    const dist = pc.aumBySector;
    const div = pc.diversification;
    return {
      totalPortfolioValue: pc.headline.totalPortfolioAum,
      totalCompanies: pc.headline.numberOfHoldings,
      sectorDistribution: dist,
      topSectors: dist.slice(0, 5),
      diversificationScore: {
        herfindahlHirschmanIndex: div.aumSectorHerfindahlHirschmanIndex,
        sectorCount: div.sectorCount,
        score0to100: div.diversificationScore0to100,
      },
      deploymentRatePct: pc.utilization.deploymentRatePct,
      growth: {
        yoyChangeRate: pc.aumGrowth.yoyChangeRate,
        ytdChangeRate: ytdAum.ytdChangeRate,
        ytdStartPeriodKey: ytdAum.ytdStartPeriodKey,
        ytdStartAum: ytdAum.ytdStartAum,
        cagr: pc.aumGrowth.cagr,
        cagrYears: pc.aumGrowth.cagrYears,
        historySeries: pc.aumGrowth.historySeries,
      },
      performance: {
        fundGrossIRR: metrics.fundGrossIRR,
        lpNetIRR: metrics.lpNetIRR,
        portfolioRoi: metrics.portfolioRoi,
        tvpi: metrics.tvpi,
        dpi: metrics.dpi,
        moicOnCost: metrics.moicOnCost,
      },
      businessUnitDistribution: pc.aumByBusinessUnit,
      topBusinessUnits: pc.aumByBusinessUnit.slice(0, 5),
      definitions: {
        excludesPipelineAndApplicationRequestValue: true,
        recentDisbursementsExcluded: true,
        activePortfolioNotSeparateFromTotalCompanies: true,
        riskAdjustedRequiresReturnSeries: true,
      },
    };
  }

  /**
   * Holdings-based NAV (FMV + realized) and breadth count — for CEO tiles without loading the full portfolio dashboard.
   * Does not include application/request pipeline amounts.
   */
  static async getAggregatedHoldingsAumSnapshot(
    params: Pick<PortfolioDashboardParams, "fundId" | "portfolioCompanyId"> = {}
  ): Promise<{ totalHoldingsValue: number; companyCount: number }> {
    let effectiveFundId: string | undefined = params.fundId;
    if (!effectiveFundId && params.portfolioCompanyId) {
      const pc = await prisma.portfolioCompany.findUnique({
        where: { id: params.portfolioCompanyId },
        select: { fundId: true },
      });
      effectiveFundId = pc?.fundId ?? undefined;
    }

    let companies: any[];
    if (effectiveFundId) {
      companies = await prisma.portfolioCompany.findMany({
        where: { fundId: effectiveFundId },
        include: { investmentImplementation: { include: { fundDisbursements: true } } },
      });
    } else {
      companies = await prisma.portfolioCompany.findMany({
        where: { fundId: { not: null } },
        include: { investmentImplementation: { include: { fundDisbursements: true } } },
      });
    }

    if (params.portfolioCompanyId) {
      companies = companies.filter((c) => c.id === params.portfolioCompanyId);
    }

    const summary = PortfolioDashboardService.calculatePortfolioSummary(companies);
    const totals = PortfolioDashboardService.calculateTotals(summary);
    const companyCount = summary.filter((r) => r.totalInvestmentCost > 0 || r.totalValue > 0).length;
    return {
      totalHoldingsValue: Math.round(totals.totalValue * 100) / 100,
      companyCount,
    };
  }

  /** Fill monitoring nulls from `latestKpiValues` / summary totals where monitoring lacked an income statement. */
  private static mergeMonitoringKpisFromLatest(
    monitoringKpis: Record<string, number | null> | null,
    latestKpiValues: Record<string, unknown>,
    totalRevenue: number | null,
    netProfit: number | null,
    cashFlowNet: number | null
  ): Record<string, number | null> | null {
    const pick = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = typeof v === "number" ? v : parseFloat(String(v));
      return Number.isFinite(n) ? n : null;
    };
    const base = monitoringKpis && typeof monitoringKpis === "object" ? { ...monitoringKpis } : {};
    if (base.REVENUE == null) base.REVENUE = totalRevenue ?? pick(latestKpiValues.TOTAL_REVENUE);
    if (base.NET_PROFIT_DERIVED == null) base.NET_PROFIT_DERIVED = netProfit ?? pick(latestKpiValues.NET_PROFIT);
    if (base.OPERATING_CASH_FLOW == null) base.OPERATING_CASH_FLOW = cashFlowNet ?? pick(latestKpiValues.CASH_FLOW_NET);
    const rev = base.REVENUE;
    if (rev != null && rev > 0 && base.NET_PROFIT_MARGIN == null && base.NET_PROFIT_DERIVED != null) {
      base.NET_PROFIT_MARGIN = Math.round((base.NET_PROFIT_DERIVED / rev) * 1e6) / 1e6;
    }
    if (Object.keys(base).length === 0) return null;
    return base;
  }
  
  /**
   * Calculate totals row
   */
  private static calculateTotals(
    portfolioSummary: Array<{
      totalInvestmentCost: number;
      currentInvestmentCost: number;
      realized: number;
      fairMarketValue: number;
      totalValue: number;
      multiplesOfCost: number;
      grossIRR: number;
    }>
  ): {
    totalInvestmentCost: number;
    currentInvestmentCost: number;
    realized: number;
    fairMarketValue: number;
    totalValue: number;
    multiplesOfCost: number;
    grossIRR: number;
  } {
    const totals = portfolioSummary.reduce((acc, company) => {
      acc.totalInvestmentCost += company.totalInvestmentCost;
      acc.currentInvestmentCost += company.currentInvestmentCost;
      acc.realized += company.realized;
      acc.fairMarketValue += company.fairMarketValue;
      acc.totalValue += company.totalValue;
      return acc;
    }, {
      totalInvestmentCost: 0,
      currentInvestmentCost: 0,
      realized: 0,
      fairMarketValue: 0,
      totalValue: 0,
      multiplesOfCost: 0,
      grossIRR: 0
    });
    
    // Calculate weighted averages
    totals.multiplesOfCost = totals.totalInvestmentCost > 0
      ? totals.totalValue / totals.totalInvestmentCost
      : 0;
    
    // Gross IRR as weighted average (simplified)
    const totalCost = totals.totalInvestmentCost;
    const totalValue = totals.totalValue;
    const avgYears = 3; // Simplified - would need actual calculation
    totals.grossIRR = totalCost > 0 && avgYears > 0
      ? (Math.pow(totalValue / totalCost, 1 / avgYears) - 1) * 100
      : 0;
    
    return {
      totalInvestmentCost: Math.round(totals.totalInvestmentCost * 100) / 100,
      currentInvestmentCost: Math.round(totals.currentInvestmentCost * 100) / 100,
      realized: Math.round(totals.realized * 100) / 100,
      fairMarketValue: Math.round(totals.fairMarketValue * 100) / 100,
      totalValue: Math.round(totals.totalValue * 100) / 100,
      multiplesOfCost: Math.round(totals.multiplesOfCost * 10000) / 10000,
      grossIRR: Math.round(totals.grossIRR * 100) / 100
    };
  }
  
  /**
   * YoY holdings change when each company has PORTFOLIO_FAIR_VALUE on the second-latest kpiValues period.
   */
  private static computeAumGrowthYoyFromKpiHistory(portfolioCompanies: any[], currentTotalAum: number): number | null {
    if (!portfolioCompanies.length || currentTotalAum <= 0) return null;
    let priorSum = 0;
    for (const c of portfolioCompanies) {
      const priorFmv = priorPeriodFairValueFromKpiValues(c.financialKpis?.kpiValues);
      if (priorFmv == null) return null;
      priorSum += priorFmv + this.getRealizedValue(c);
    }
    if (priorSum <= 0) return null;
    return Math.round(((currentTotalAum - priorSum) / priorSum) * 10000) / 10000;
  }

  /**
   * Chart-ready KPI history from `portfolioCompany.financialKpis.kpiValues`.
   */
  static async getKpiTimeSeries(params: {
    fundId?: string;
    portfolioCompanyId?: string;
    metricsKeys?: string[];
  }): Promise<{
    metricKeys: string[];
    /** Why some raw values are null (e.g. valuation not stored for older periods). */
    notes: string[];
    companies: Array<{
      companyId: string;
      companyName: string;
      dataPoints: Array<{
        periodKey: string;
        values: Record<string, number | null>;
        /** `PORTFOLIO_FAIR_VALUE` forward-filled from last known period + latest snapshot when absent. */
        valuesWithCarryForward: Record<string, number | null>;
      }>;
    }>;
  }> {
    const defaultKeys = [
      "TOTAL_REVENUE",
      "NET_PROFIT",
      "CASH_FLOW_NET",
      "PORTFOLIO_FAIR_VALUE",
      "EBITDA",
      "EBITDA_MARGIN",
    ];
    const metricKeys =
      params.metricsKeys?.length && params.metricsKeys.some(Boolean)
        ? params.metricsKeys.map((k) => k.trim()).filter(Boolean)
        : defaultKeys;

    let effectiveFundId = params.fundId;
    if (!effectiveFundId && params.portfolioCompanyId) {
      const pc = await prisma.portfolioCompany.findUnique({
        where: { id: params.portfolioCompanyId },
        select: { fundId: true },
      });
      effectiveFundId = pc?.fundId ?? undefined;
    }

    const where: any = {};
    if (params.portfolioCompanyId) {
      where.id = params.portfolioCompanyId;
    } else if (effectiveFundId) {
      where.fundId = effectiveFundId;
    }

    const companies = await prisma.portfolioCompany.findMany({
      where,
      select: { id: true, name: true, financialKpis: true, fundId: true },
    });

    const out: Array<{
      companyId: string;
      companyName: string;
      dataPoints: Array<{
        periodKey: string;
        values: Record<string, number | null>;
        valuesWithCarryForward: Record<string, number | null>;
      }>;
    }> = [];

    for (const c of companies) {
      const fk = c.financialKpis as any;
      const kpiValues = fk?.kpiValues;
      const keys = sortedKpiPeriodKeys(kpiValues);
      const latestFmv =
        numFromKpiField(fk?.latestKpiValues as Record<string, unknown> | undefined, "PORTFOLIO_FAIR_VALUE") ??
        numFromKpiField(
          (fk?.latestValuation && typeof fk.latestValuation === "object"
            ? (fk.latestValuation as Record<string, unknown>)
            : undefined) as Record<string, unknown> | undefined,
          "amount"
        );
      const dataPoints: Array<{
        periodKey: string;
        values: Record<string, number | null>;
        valuesWithCarryForward: Record<string, number | null>;
      }> = [];
      for (const pk of keys) {
        const blob = (kpiValues as any)[pk];
        if (!blob || typeof blob !== "object") continue;
        const values: Record<string, number | null> = {};
        for (const mk of metricKeys) {
          values[mk] = numFromKpiField(blob as Record<string, unknown>, mk);
        }
        dataPoints.push({ periodKey: pk, values, valuesWithCarryForward: { ...values } });
      }
      let carryFmv: number | null = null;
      for (const pt of dataPoints) {
        const v = pt.values.PORTFOLIO_FAIR_VALUE;
        if (v != null && Number.isFinite(v)) carryFmv = v;
        if (
          metricKeys.includes("PORTFOLIO_FAIR_VALUE") &&
          (pt.valuesWithCarryForward.PORTFOLIO_FAIR_VALUE == null ||
            !Number.isFinite(pt.valuesWithCarryForward.PORTFOLIO_FAIR_VALUE as number)) &&
          carryFmv != null
        ) {
          pt.valuesWithCarryForward.PORTFOLIO_FAIR_VALUE = carryFmv;
        }
      }
      if (
        metricKeys.includes("PORTFOLIO_FAIR_VALUE") &&
        dataPoints.length > 0 &&
        latestFmv != null
      ) {
        const last = dataPoints[dataPoints.length - 1];
        if (
          last.valuesWithCarryForward.PORTFOLIO_FAIR_VALUE == null ||
          !Number.isFinite(last.valuesWithCarryForward.PORTFOLIO_FAIR_VALUE as number)
        ) {
          last.valuesWithCarryForward.PORTFOLIO_FAIR_VALUE = latestFmv;
        }
      }
      out.push({ companyId: c.id, companyName: c.name, dataPoints });
    }

    return {
      metricKeys,
      notes: [
        "values are raw from kpiValues per period; null means that field was not stored for that period.",
        "valuesWithCarryForward PORTFOLIO_FAIR_VALUE uses last known period and the latest portfolio fair value snapshot so charts can connect points.",
        "monitoringKpis nulls: income-statement-only metrics stay null when the ACCEPTED monitoring pack lacked an income statement for that as-of period; see monitoringKpisFilled on the main dashboard.",
      ],
      companies: out,
    };
  }

  /**
   * Get fair market value from portfolio company financialKpis
   */
  private static getFairMarketValue(company: any): number {
    const financialKpis = company.financialKpis as any;
    if (financialKpis?.latestKpiValues?.PORTFOLIO_FAIR_VALUE) {
      const fairValue = financialKpis.latestKpiValues.PORTFOLIO_FAIR_VALUE || new Decimal(0);
      return parseFloat(fairValue.toString());
    }
    if (financialKpis?.latestValuation?.amount) {
      const valuationAmount = financialKpis.latestValuation.amount || new Decimal(0);
      return parseFloat(valuationAmount.toString());
    }
    // Fallback to annual revenue as proxy
    return parseFloat(company.annualRevenue?.toString() || '0');
  }
  
  /**
   * Get realized value from portfolio company (dividends, exits, etc.)
   */
  private static getRealizedValue(company: any): number {
    const financialKpis = company.financialKpis as any;
    // Check for realized proceeds in financialKpis
    if (financialKpis?.realizedProceeds) {
      const realized = financialKpis.realizedProceeds || new Decimal(0);
      return parseFloat(realized.toString());
    }
    // Check for dividend income
    if (financialKpis?.latestKpiValues?.DIVIDEND_INCOME) {
      const dividend = financialKpis.latestKpiValues.DIVIDEND_INCOME || new Decimal(0);
      return parseFloat(dividend.toString());
    }
    // If company has endDate, it might be exited - use FMV as realized
    if (company.endDate) {
      return this.getFairMarketValue(company);
    }
    return 0;
  }
  
  /**
   * One aggregation pass over posted journal lines for dashboard expense tiles (avoids loading every line into Node).
   */
  private static async getPostedExpenseTotalsSplit(): Promise<{ management: number; other: number }> {
    try {
      const managementAccounts = await prisma.chartOfAccounts.findMany({
        where: { accountType: "EXPENSE", accountName: { contains: "Management" } },
        select: { id: true },
      });
      const mgmtIds = managementAccounts.map((a) => a.id);

      if (mgmtIds.length === 0) {
        const rows = await prisma.$queryRaw<Array<{ other_total: unknown }>>`
          SELECT COALESCE(SUM(jel.debitAmount), 0) AS other_total
          FROM journal_entry_lines jel
          INNER JOIN journal_entries je ON je.id = jel.journalEntryId
          INNER JOIN chart_of_accounts coa ON coa.id = jel.chartOfAccountId
          WHERE je.status = 'POSTED' AND coa.accountType = 'EXPENSE'
        `;
        const other = parseFloat(String(rows[0]?.other_total ?? 0));
        return { management: 0, other: Math.round(other * 100) / 100 };
      }

      const rows = await prisma.$queryRaw<Array<{ management_total: unknown; other_total: unknown }>>`
        SELECT
          COALESCE(SUM(CASE WHEN jel.chartOfAccountId IN (${Prisma.join(mgmtIds)}) THEN jel.debitAmount ELSE 0 END), 0) AS management_total,
          COALESCE(SUM(CASE WHEN coa.accountType = 'EXPENSE' AND jel.chartOfAccountId NOT IN (${Prisma.join(
            mgmtIds
          )}) THEN jel.debitAmount ELSE 0 END), 0) AS other_total
        FROM journal_entry_lines jel
        INNER JOIN journal_entries je ON je.id = jel.journalEntryId
        INNER JOIN chart_of_accounts coa ON coa.id = jel.chartOfAccountId
        WHERE je.status = 'POSTED'
      `;
      const r = rows[0];
      const management = parseFloat(String(r?.management_total ?? 0));
      const other = parseFloat(String(r?.other_total ?? 0));
      return {
        management: Math.round(management * 100) / 100,
        other: Math.round(other * 100) / 100,
      };
    } catch (error) {
      console.error("Error getting posted expense totals:", error);
      return { management: 0, other: 0 };
    }
  }
}
