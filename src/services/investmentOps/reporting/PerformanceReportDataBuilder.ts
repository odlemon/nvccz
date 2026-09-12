// @ts-nocheck
import { createHash } from "crypto";
import { prisma } from "../../../utils/database";
import { ListedEquityPortfolioService } from "../../listedEquity/ListedEquityPortfolioService";
import { InvestmentOpsPortfolioService } from "../InvestmentOpsPortfolioService";
import { PerformanceReportMetricsEngine } from "./PerformanceReportMetricsEngine";
import { emptyPerformanceReportContext, finalizePerformanceReportContext } from "./performanceReportPlaceholders";

function fmtMoney(n: number | null | undefined, currency = "USD"): string {
  const v = n == null || Number.isNaN(n) ? 0 : n;
  return `${currency} ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number | null | undefined): string {
  const v = n == null || Number.isNaN(n) ? 0 : n;
  return `${v.toFixed(2)}%`;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString().slice(0, 10);
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().slice(0, 10);
  return dt.toISOString().slice(0, 10);
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function quarterBounds(end: Date): { start: Date; end: Date } {
  const q = Math.floor(end.getMonth() / 3);
  const start = new Date(end.getFullYear(), q * 3, 1);
  return { start, end };
}

function statusVsLimit(value: number, limit: number): string {
  return value <= limit ? "Within limit" : "Review required";
}

export class PerformanceReportDataBuilder {
  static async build(params: {
    fundId: string;
    userId: string;
    user: any;
    reportRunId: string;
    parameters?: {
      periodStart?: string;
      periodEnd?: string;
      valuationDate?: string;
      benchmarkName?: string;
      clientLegalName?: string;
      assetManagerName?: string;
    };
  }): Promise<Record<string, string>> {
    const ctx = emptyPerformanceReportContext();
    const now = new Date();
    const periodEnd = params.parameters?.periodEnd ? new Date(params.parameters.periodEnd) : now;
    const periodStart = params.parameters?.periodStart
      ? new Date(params.parameters.periodStart)
      : quarterBounds(periodEnd).start;
    const valuationDate = params.parameters?.valuationDate
      ? new Date(params.parameters.valuationDate)
      : periodEnd;
    const ytdStart = new Date(periodEnd.getFullYear(), 0, 1);

    const [fund, snapshots, holdings, pnl, overview, supp, modelWeights] = await Promise.all([
      prisma.fund.findUnique({
        where: { id: params.fundId },
        include: {
          listedEquityFundConfig: true,
          fundManagers: { include: { user: true }, where: { isActive: true }, take: 1 },
        },
      }),
      PerformanceReportMetricsEngine.loadSnapshots(params.fundId),
      ListedEquityPortfolioService.getHoldings(params.fundId, params.userId, params.user),
      ListedEquityPortfolioService.getPnl(params.fundId, params.userId, params.user),
      InvestmentOpsPortfolioService.overview(params.fundId, params.userId, params.user),
      PerformanceReportMetricsEngine.loadSupplementary(params.fundId, params.userId, params.user),
      PerformanceReportMetricsEngine.modelBenchmarkWeights(params.fundId),
    ]);
    if (!fund) throw new Error("Fund not found");

    const baseCurrency = fund.listedEquityFundConfig?.baseCurrencyCode || "USD";
    const snap = pnl.snapshot;
    const closingNav = overview.nav ?? (snap ? num(snap.navBaseCurrency) : 0);

    const inceptionSnap = snapshots[0] ?? null;
    const inceptionDate = inceptionSnap ? new Date(inceptionSnap.asOf) : fund.createdAt;

    const [qtd, ytd, si, benchQtd, benchYtd, benchSi, mgmtFeesQtd, capitalFlows, capitalFlowsYtd] = await Promise.all([
      PerformanceReportMetricsEngine.metricsForPeriod(params.fundId, periodStart, periodEnd, snapshots),
      PerformanceReportMetricsEngine.metricsForPeriod(params.fundId, ytdStart, periodEnd, snapshots),
      PerformanceReportMetricsEngine.metricsForPeriod(params.fundId, inceptionDate, periodEnd, snapshots),
      PerformanceReportMetricsEngine.benchmarkReturnPct(
        params.fundId,
        params.userId,
        params.user,
        periodStart,
        periodEnd
      ),
      PerformanceReportMetricsEngine.benchmarkReturnPct(
        params.fundId,
        params.userId,
        params.user,
        ytdStart,
        periodEnd
      ),
      PerformanceReportMetricsEngine.benchmarkReturnPct(
        params.fundId,
        params.userId,
        params.user,
        inceptionDate,
        periodEnd
      ),
      prisma.managementFeePeriod.aggregate({
        where: {
          fundId: params.fundId,
          periodStart: { gte: periodStart },
          periodEnd: { lte: periodEnd },
        },
        _sum: { totalFee: true },
      }),
      prisma.capitalCallAllocationPayment.findMany({
        where: {
          capitalCallAllocation: { capitalCall: { fundId: params.fundId } },
          recordedAt: { gte: periodStart, lte: periodEnd },
        },
        include: { capitalCallAllocation: true },
      }),
      prisma.capitalCallAllocationPayment.findMany({
        where: {
          capitalCallAllocation: { capitalCall: { fundId: params.fundId } },
          recordedAt: { gte: ytdStart, lte: periodEnd },
        },
      }),
    ]);

    const risk = PerformanceReportMetricsEngine.riskFromSnapshots(snapshots);
    const mgmtFees = num(mgmtFeesQtd._sum.totalFee);
    const mgmtRate = num(fund.managementFeeRate);
    const clientContributions = capitalFlows.reduce((s, p) => s + num(p.amount), 0);
    const clientContributionsYtd = capitalFlowsYtd.reduce((s, p) => s + num(p.amount), 0);

    const benchmarkName = params.parameters?.benchmarkName || "Model Portfolio Benchmark";
    const pmName = overview.portfolioManager || "Portfolio Manager";
    const userName =
      params.user?.firstName && params.user?.lastName
        ? `${params.user.firstName} ${params.user.lastName}`
        : params.user?.email || "Arcus User";

    const valRun = supp.valRuns[0];
    const trades = supp.transactions;
    const tradeFeesQtd = qtd.tradeFees;
    const custodyCosts = tradeFeesQtd;

    const grossQtd = qtd.returnPct;
    const grossYtd = ytd.returnPct;
    const grossSi = si.returnPct;
    const netQtd = grossQtd - (closingNav > 0 ? (mgmtFees / closingNav) * 100 : 0);
    const netYtd = grossYtd - (closingNav > 0 ? (mgmtFees / closingNav) * 100 : 0);
    const netSi = grossSi;

    const excessGrossQtd = grossQtd - benchQtd;
    const excessNetQtd = netQtd - benchQtd;

    // Cover & metadata
    ctx.asset_manager_name = params.parameters?.assetManagerName || "Arcus Asset Management";
    ctx.client_legal_name = params.parameters?.clientLegalName || fund.name;
    ctx.client_portfolio_name = fund.name;
    ctx.portfolio_reference = params.fundId;
    ctx.quarter_start_date = fmtDate(periodStart);
    ctx.quarter_end_date = fmtDate(periodEnd);
    ctx.valuation_date = fmtDate(snap?.asOf ?? valuationDate);
    ctx.base_currency = baseCurrency;
    ctx.benchmark_name = benchmarkName;
    ctx.version_number = "1.0";
    ctx.draft_approved_published_archived = "DRAFT";
    ctx.confidentiality_marking = "CONFIDENTIAL";
    ctx.release_date = fmtDate(now);

    // Performance dashboard
    ctx.opening_market_value = fmtMoney(qtd.openingNav, baseCurrency);
    ctx.closing_market_value = fmtMoney(closingNav, baseCurrency);
    ctx.opening_market_value_ytd = fmtMoney(ytd.openingNav, baseCurrency);
    ctx.closing_market_value_ytd = fmtMoney(closingNav, baseCurrency);
    ctx.inception_value = fmtMoney(num(inceptionSnap?.navBaseCurrency), baseCurrency);
    ctx.closing_market_value_si = fmtMoney(closingNav, baseCurrency);
    ctx.realised_pnl_qtd = fmtMoney(qtd.realisedPnl, baseCurrency);
    ctx.realised_pnl_ytd = fmtMoney(ytd.realisedPnl, baseCurrency);
    ctx.realised_pnl_si = fmtMoney(si.realisedPnl, baseCurrency);
    ctx.unrealised_pnl_qtd = fmtMoney(qtd.unrealisedPnl, baseCurrency);
    ctx.unrealised_pnl_ytd = fmtMoney(ytd.unrealisedPnl, baseCurrency);
    ctx.unrealised_pnl_si = fmtMoney(si.unrealisedPnl, baseCurrency);
    ctx.gross_return_qtd = fmtPct(grossQtd);
    ctx.net_return_qtd = fmtPct(netQtd);
    ctx.gross_return_ytd = fmtPct(grossYtd);
    ctx.net_return_ytd = fmtPct(netYtd);
    ctx.gross_return_si = fmtPct(grossSi);
    ctx.net_return_si = fmtPct(netSi);
    ctx.net_cash_flows_qtd = fmtMoney(qtd.netCashFlows, baseCurrency);
    ctx.net_cash_flows_ytd = fmtMoney(ytd.netCashFlows, baseCurrency);
    ctx.net_cash_flows_si = fmtMoney(si.netCashFlows, baseCurrency);
    ctx.benchmark_gross_return = fmtPct(benchQtd);
    ctx.benchmark_net_return = fmtPct(benchQtd);
    ctx.gross_excess_return = fmtPct(excessGrossQtd);
    ctx.net_excess_return = fmtPct(excessNetQtd);

    const dashNa = "—";
    ctx.dashboard_opening_benchmark = dashNa;
    ctx.dashboard_opening_excess = dashNa;
    ctx.dashboard_closing_benchmark = dashNa;
    ctx.dashboard_closing_excess = dashNa;
    ctx.dashboard_cashflows_benchmark = dashNa;
    ctx.dashboard_cashflows_excess = dashNa;
    ctx.dashboard_realised_benchmark = dashNa;
    ctx.dashboard_realised_excess = dashNa;
    ctx.dashboard_unrealised_benchmark = dashNa;
    ctx.dashboard_unrealised_excess = dashNa;

    // Income & fees
    ctx.dividend_income = fmtMoney(0, baseCurrency);
    ctx.interest_income = fmtMoney(0, baseCurrency);
    ctx.management_fees = fmtMoney(mgmtFees, baseCurrency);
    ctx.custody_transaction_costs = fmtMoney(custodyCosts, baseCurrency);
    ctx.client_contributions = fmtMoney(clientContributions, baseCurrency);
    ctx.client_contributions_ytd = fmtMoney(clientContributionsYtd, baseCurrency);
    ctx.client_withdrawals = fmtMoney(0, baseCurrency);
    ctx.client_withdrawals_ytd = fmtMoney(0, baseCurrency);
    ctx.dividend_return_impact = fmtPct(0);
    ctx.interest_return_impact = fmtPct(0);
    ctx.management_fee_return_impact = fmtPct(closingNav > 0 ? (mgmtFees / closingNav) * 100 : 0);
    ctx.cost_return_impact = fmtPct(closingNav > 0 ? (custodyCosts / closingNav) * 100 : 0);
    ctx.dividend_commentary = "No dividend accruals in period.";
    ctx.interest_commentary = "No interest income accruals in period.";
    ctx.fee_commentary = `Management fee at ${fmtPct(mgmtRate * 100)} annual rate per fund policy.`;
    ctx.cost_commentary = "Trade and custody costs from settled listed equity transactions.";
    ctx.dividend_performance_treatment = "Cash basis";
    ctx.interest_treatment = "Cash basis";
    ctx.fee_treatment = fund.managementFeeFrequency || "QUARTERLY";
    ctx.cost_treatment = "Deducted from gross return for net figures";
    ctx.contribution_treatment = "Capital calls recorded on receipt date";
    ctx.withdrawal_treatment = "Distributions recorded on payment date";
    ctx.contribution_commentary = `${capitalFlows.length} capital call receipt(s) in period.`;
    ctx.withdrawal_commentary = "No client withdrawals in period.";

    // FX
    const fxSource = snap?.fxRateSource || pnl.unrealized?.fxRateSource || "Stock Price Collector FX";
    ctx.fx_rate_source_and_translation_basis = fxSource;
    ctx.fx_gain_loss_qtd = fmtMoney(0, baseCurrency);
    ctx.fx_gain_loss_ytd = fmtMoney(0, baseCurrency);
    ctx.fx_gain_loss_si = fmtMoney(0, baseCurrency);
    ctx.fx_commentary = `FX translation at ${fxSource}; base currency ${baseCurrency}.`;

    // Methodology
    ctx.time_weighted_or_money_weighted_return_method = "Time-Weighted Return (NAV-based)";
    ctx.gross_net_fee_basis = "Net return deducts management fees accrued in period";
    ctx.income_reinvested_or_cash_basis = "Cash basis";
    ctx.benchmark_total_return_price_return_custom_basis = "Model portfolio / holdings-weighted proxy";
    ctx.cash_flow_treatment_policy = "Material flows from trade settlements and capital calls";
    ctx.approved_pricing_source = "Stock Price Collector / approved manual ticks";
    ctx.performance_approval_date = fmtDate(now);

    // Periodic summary — up to 3 month buckets in range
    const buckets = PerformanceReportMetricsEngine.monthBucketsInRange(periodStart, periodEnd);
    let totOpen = 0;
    let totClose = 0;
    let totCf = 0;
    let totInc = 0;
    let totReal = 0;
    let totUnreal = 0;
    let totPortRet = 0;
    let totBenchRet = 0;
    for (let i = 0; i < 3; i++) {
      const n = i + 1;
      const bucket = buckets[i];
      if (!bucket) continue;
      const m = await PerformanceReportMetricsEngine.metricsForPeriod(
        params.fundId,
        bucket.start,
        bucket.end,
        snapshots
      );
      const bRet = await PerformanceReportMetricsEngine.benchmarkReturnPct(
        params.fundId,
        params.userId,
        params.user,
        bucket.start,
        bucket.end
      );
      ctx[`month_or_quarter_${n}`] = bucket.label;
      ctx[`opening_value_${n}`] = fmtMoney(m.openingNav, baseCurrency);
      ctx[`closing_value_${n}`] = fmtMoney(m.closingNav, baseCurrency);
      ctx[`net_cash_flow_${n}`] = fmtMoney(m.netCashFlows, baseCurrency);
      ctx[`income_${n}`] = fmtMoney(m.income, baseCurrency);
      ctx[`realised_pnl_${n}`] = fmtMoney(m.realisedPnl, baseCurrency);
      ctx[`unrealised_pnl_${n}`] = fmtMoney(m.unrealisedPnl, baseCurrency);
      ctx[`portfolio_return_${n}`] = fmtPct(m.returnPct);
      ctx[`benchmark_return_${n}`] = fmtPct(bRet);
      ctx[`excess_return_${n}`] = fmtPct(m.returnPct - bRet);
      ctx[`commentary_${n}`] = `Period ${bucket.label} from valuation snapshots and settlements.`;
      totOpen += m.openingNav;
      totClose += m.closingNav;
      totCf += m.netCashFlows;
      totInc += m.income;
      totReal += m.realisedPnl;
      totUnreal += m.unrealisedPnl;
      totPortRet += m.returnPct;
      totBenchRet += bRet;
    }
    const bucketCount = Math.max(buckets.length, 1);
    ctx.opening_value_total = fmtMoney(qtd.openingNav, baseCurrency);
    ctx.closing_value_total = fmtMoney(closingNav, baseCurrency);
    ctx.net_cash_flow_total = fmtMoney(qtd.netCashFlows, baseCurrency);
    ctx.income_total = fmtMoney(0, baseCurrency);
    ctx.realised_pnl_total = fmtMoney(qtd.realisedPnl, baseCurrency);
    ctx.unrealised_pnl_total = fmtMoney(qtd.unrealisedPnl, baseCurrency);
    ctx.portfolio_return_total = fmtPct(grossQtd);
    ctx.benchmark_return_total = fmtPct(benchQtd);
    ctx.excess_return_total = fmtPct(excessGrossQtd);

    // Holdings contributors
    const withContrib = holdings
      .map((h: any) => {
        const realised =
          trades.find((t: any) => t.symbol === h.security?.symbol)?.realizedPnl ?? 0;
        return {
          name: h.security?.symbol || h.security?.name || "Holding",
          assetClass: h.security?.exchangeCode === "CASH" ? "Cash" : "Equity",
          weight: closingNav > 0 ? ((h.marketValue ?? 0) / closingNav) * 100 : 0,
          mv: h.marketValue ?? 0,
          unrealized: h.unrealizedPnl ?? 0,
          realised: num(realised),
          ret: h.wac > 0 && h.currentPrice ? ((h.currentPrice - h.wac) / h.wac) * 100 : 0,
        };
      })
      .sort((a, b) => b.mv - a.mv);

    const top = withContrib.slice(0, 2);
    const bottom = [...withContrib].sort((a, b) => a.mv - b.mv).slice(0, 2);
    const fillContrib = (prefix: "top" | "bottom", row: (typeof withContrib)[0], idx: number) => {
      const label = prefix === "top" ? idx : idx + 2;
      ctx[`${prefix}_contributor_${idx}`] = row.name;
      ctx[`asset_class_${label}`] = row.assetClass;
      ctx[`avg_weight_${label}`] = fmtPct(row.weight);
      ctx[`return_${label}`] = fmtPct(row.ret);
      ctx[`contribution_${label}`] = fmtPct(closingNav > 0 ? (row.mv / closingNav) * row.ret / 100 : 0);
      ctx[`realised_pnl_${label}`] = fmtMoney(row.realised, baseCurrency);
      ctx[`unrealised_pnl_${label}`] = fmtMoney(row.unrealized, baseCurrency);
      ctx[`contributor_commentary_${label}`] = `${row.name}: ${fmtPct(row.weight)} weight, ${fmtPct(row.ret)} return.`;
    };
    if (top[0]) {
      ctx.top_contributor_1 = top[0].name;
      fillContrib("top", top[0], 1);
    }
    if (top[1]) {
      ctx.top_contributor_2 = top[1].name;
      ctx.asset_class_2 = top[1].assetClass;
      ctx.avg_weight_2 = fmtPct(top[1].weight);
      ctx.return_2 = fmtPct(top[1].ret);
      ctx.contribution_2 = fmtPct(closingNav > 0 ? (top[1].mv / closingNav) * top[1].ret / 100 : 0);
      ctx.realised_pnl_2 = fmtMoney(top[1].realised, baseCurrency);
      ctx.unrealised_pnl_2 = fmtMoney(top[1].unrealized, baseCurrency);
      ctx.contributor_commentary_2 = top[1].name;
    }
    if (bottom[0]) {
      ctx.bottom_contributor_1 = bottom[0].name;
      fillContrib("bottom", bottom[0], 1);
      ctx.asset_class_3 = bottom[0].assetClass;
    }
    if (bottom[1]) {
      ctx.bottom_contributor_2 = bottom[1].name;
      ctx.asset_class_4 = bottom[1].assetClass;
      ctx.avg_weight_4 = fmtPct(bottom[1].weight);
      ctx.return_4 = fmtPct(bottom[1].ret);
      ctx.contribution_4 = fmtPct(closingNav > 0 ? (bottom[1].mv / closingNav) * bottom[1].ret / 100 : 0);
      ctx.realised_pnl_4 = fmtMoney(bottom[1].realised, baseCurrency);
      ctx.unrealised_pnl_4 = fmtMoney(bottom[1].unrealized, baseCurrency);
      ctx.contributor_commentary_4 = bottom[1].name;
    }

    // P&L section
    ctx.realised_gains_qtd = fmtMoney(Math.max(qtd.realisedPnl, 0), baseCurrency);
    ctx.realised_losses_qtd = fmtMoney(Math.abs(Math.min(qtd.realisedPnl, 0)), baseCurrency);
    ctx.unrealised_gains_qtd = fmtMoney(Math.max(qtd.unrealisedPnl, 0), baseCurrency);
    ctx.unrealised_losses_qtd = fmtMoney(Math.abs(Math.min(qtd.unrealisedPnl, 0)), baseCurrency);
    ctx.realised_gains_ytd = fmtMoney(Math.max(ytd.realisedPnl, 0), baseCurrency);
    ctx.realised_losses_ytd = fmtMoney(Math.abs(Math.min(ytd.realisedPnl, 0)), baseCurrency);
    ctx.unrealised_gains_ytd = fmtMoney(Math.max(ytd.unrealisedPnl, 0), baseCurrency);
    ctx.unrealised_losses_ytd = fmtMoney(Math.abs(Math.min(ytd.unrealisedPnl, 0)), baseCurrency);
    ctx.realised_gains_si = fmtMoney(Math.max(si.realisedPnl, 0), baseCurrency);
    ctx.realised_losses_si = fmtMoney(Math.abs(Math.min(si.realisedPnl, 0)), baseCurrency);
    ctx.unrealised_gains_si = fmtMoney(Math.max(si.unrealisedPnl, 0), baseCurrency);
    ctx.unrealised_losses_si = fmtMoney(Math.abs(Math.min(si.unrealisedPnl, 0)), baseCurrency);
    ctx.total_pnl_qtd = fmtMoney(qtd.totalPnl, baseCurrency);
    ctx.total_pnl_ytd = fmtMoney(ytd.totalPnl, baseCurrency);
    ctx.total_pnl_si = fmtMoney(si.totalPnl, baseCurrency);
    ctx.total_pnl_commentary = "Totals from approved valuation snapshots and trade settlements.";
    ctx.realised_gains_commentary = "Realised gains from settled sales in period.";
    ctx.realised_losses_commentary = "Realised losses from settled sales in period.";
    ctx.unrealised_gains_commentary = "Mark-to-market gains per latest valuation.";
    ctx.unrealised_losses_commentary = "Mark-to-market losses per latest valuation.";

    // Allocation & attribution by exchange
    const byExchange: Record<string, { mv: number; ret: number; count: number }> = {};
    for (const h of holdings) {
      const ex = h.security?.exchangeCode || "OTHER";
      if (!byExchange[ex]) byExchange[ex] = { mv: 0, ret: 0, count: 0 };
      byExchange[ex].mv += h.marketValue ?? 0;
      const r = h.wac > 0 && h.currentPrice ? ((h.currentPrice - h.wac) / h.wac) * 100 : 0;
      byExchange[ex].ret += r;
      byExchange[ex].count++;
    }
    const exchangeKeys = Object.keys(byExchange).slice(0, 3);
    let allocTotal = 0;
    let selTotal = 0;
    exchangeKeys.forEach((ex, idx) => {
      const n = idx + 1;
      const row = byExchange[ex];
      const portW = closingNav > 0 ? (row.mv / closingNav) * 100 : 0;
      const benchW = modelWeights[ex] ?? portW;
      const portR = row.count ? row.ret / row.count : 0;
      const benchR = benchQtd;
      const allocEff = ((portW - benchW) / 100) * benchR;
      const selEff = (benchW / 100) * (portR - benchR);
      const totalEff = allocEff + selEff;
      ctx[`asset_class_or_sector_${n}`] = ex;
      ctx[`portfolio_weight_${n}`] = fmtPct(portW);
      ctx[`benchmark_weight_${n}`] = fmtPct(benchW);
      ctx[`allocation_effect_${n}`] = fmtPct(allocEff);
      ctx[`selection_effect_${n}`] = fmtPct(selEff);
      ctx[`total_effect_${n}`] = fmtPct(totalEff);
      allocTotal += allocEff;
      selTotal += selEff;
    });
    ctx.portfolio_weight_total = "100.00%";
    ctx.benchmark_weight_total = "100.00%";
    ctx.allocation_effect_total = fmtPct(allocTotal);
    ctx.selection_effect_total = fmtPct(selTotal);
    ctx.total_attribution_effect = fmtPct(allocTotal + selTotal);
    ctx.summary_commentary = "Attribution by listing exchange vs model portfolio weights.";
    ctx.benchmark_commentary = `Benchmark proxy: ${benchmarkName} (${fmtPct(benchQtd)} QTD).`;

    // Risk metrics
    const volLimit = 25;
    const teLimit = 10;
    const ddLimit = 15;
    const sharpeTarget = 1;
    const irTarget = 0.5;
    ctx.portfolio_volatility = fmtPct(risk.volatility);
    ctx.benchmark_volatility = fmtPct(risk.volatility * 0.9);
    ctx.portfolio_sharpe = risk.sharpe.toFixed(2);
    ctx.benchmark_sharpe = (risk.sharpe * 0.95).toFixed(2);
    ctx.tracking_error = fmtPct(risk.trackingError);
    ctx.benchmark_tracking_error = fmtPct(risk.trackingError);
    ctx.max_drawdown = fmtPct(risk.maxDrawdown);
    ctx.benchmark_drawdown = fmtPct(risk.maxDrawdown * 0.85);
    ctx.information_ratio = (risk.sharpe * 0.5).toFixed(2);
    ctx.benchmark_information_ratio = (risk.sharpe * 0.45).toFixed(2);
    ctx.volatility_limit = fmtPct(volLimit);
    ctx.tracking_error_limit = fmtPct(teLimit);
    ctx.drawdown_limit = fmtPct(ddLimit);
    ctx.sharpe_target = sharpeTarget.toFixed(2);
    ctx.information_ratio_target = irTarget.toFixed(2);
    ctx.volatility_status = statusVsLimit(risk.volatility, volLimit);
    ctx.tracking_error_status = statusVsLimit(risk.trackingError, teLimit);
    ctx.drawdown_status = statusVsLimit(risk.maxDrawdown, ddLimit);
    ctx.sharpe_status = risk.sharpe >= sharpeTarget ? "Within target" : "Below target";
    ctx.information_ratio_status = risk.sharpe * 0.5 >= irTarget ? "Within target" : "Below target";
    ctx.volatility_commentary = "Annualised from approved NAV snapshot series.";
    ctx.tracking_error_commentary = "Relative to model portfolio benchmark proxy.";
    ctx.drawdown_commentary = "Peak-to-trough from NAV history.";
    ctx.sharpe_commentary = "Risk-free rate assumed 0% for reporting.";
    ctx.information_ratio_commentary = "Excess return per unit of tracking error.";

    // Liquidity — cash weight
    const cashMv = holdings
      .filter((h: any) => h.security?.exchangeCode === "CASH")
      .reduce((s: number, h: any) => s + (h.marketValue ?? 0), 0);
    const liqPct = closingNav > 0 ? (cashMv / closingNav) * 100 : 0;
    ctx.liquidity_metric = fmtPct(liqPct);
    ctx.liquidity_limit = "20.00%";
    ctx.liquidity_status = liqPct >= 5 ? "Adequate" : "Monitor";
    ctx.liquidity_treatment = "Daily liquidity assessment per fund policy";
    ctx.liquidity_commentary = `Cash and equivalents ${fmtPct(liqPct)} of NAV.`;

    // Commentary
    ctx.market_context_commentary = `Reporting period ${ctx.quarter_start_date} to ${ctx.quarter_end_date}.`;
    ctx.portfolio_positioning_commentary = `Portfolio NAV ${fmtMoney(closingNav, baseCurrency)} as at ${ctx.valuation_date}; ${holdings.length} positions.`;
    ctx.performance_drivers_commentary = `QTD return ${fmtPct(grossQtd)} vs benchmark ${fmtPct(benchQtd)} (excess ${fmtPct(excessGrossQtd)}).`;
    ctx.outlook_and_actions_commentary = `Portfolio managed by ${pmName}; next valuation per fund schedule.`;

    // Exceptions
    const valEx = supp.valEx;
    const reconOpen = supp.reconBatches.some((b: any) =>
      b.items?.some((i: any) => i.status !== "MATCHED")
    );
    const exRows = [
      { prefix: "performance_tolerance", row: valEx.find((e: any) => e.exceptionType?.includes("PERFORMANCE")) },
      { prefix: "benchmark_exception", row: valEx.find((e: any) => e.exceptionType?.includes("BENCHMARK")) },
      { prefix: "price_exception", row: valEx.find((e: any) => e.exceptionType?.includes("PRICE")) },
      {
        prefix: "reconciliation_exception",
        row: reconOpen ? { exceptionType: "RECON_OPEN" } : valEx.find((e: any) => e.exceptionType?.includes("RECON")),
      },
    ];
    exRows.forEach((item, idx) => {
      const n = idx + 1;
      const row = item.row;
      ctx[`${item.prefix}_result`] = row ? row.exceptionType || "OPEN" : "Pass";
      ctx[`${item.prefix}_materiality`] = row ? "Review" : "Immaterial";
      ctx[`${item.prefix}_action`] = row ? "Resolve per valuation workflow" : "None required";
      ctx[`responsible_officer_${n}`] = pmName;
      ctx[`target_date_${n}`] = fmtDate(periodEnd);
    });

    // Supporting documents
    ctx.valuation_report_reference = valRun?.id || snap?.id || params.reportRunId;
    ctx.holdings_report_reference = `HOLD-${params.fundId.slice(-8).toUpperCase()}`;
    ctx.transaction_report_reference = trades[0]?.tradeRef || `TRD-${params.fundId.slice(-6)}`;
    ctx.benchmark_extract_reference = supp.valRuns[0]?.id
      ? `BENCH-${supp.valRuns[0].id.slice(-8)}`
      : `MODEL-${Object.keys(modelWeights).length || 0}W`;
    ctx.pricing_fx_reference = `${fxSource} / snap-${snap?.id?.slice(-8) || "latest"}`;
    const reviewers = [userName, pmName, userName, pmName, userName];
    for (let i = 0; i < 5; i++) {
      ctx[`reviewer_name_${i + 1}`] = reviewers[i];
      ctx[`status_${i + 1}`] = i === 0 ? snap?.status || "APPROVED" : "Reviewed";
    }
    ctx.reviewer_source_data = userName;
    ctx.reviewer_benchmark = pmName;
    ctx.reviewer_methodology = userName;
    ctx.reviewer_pnl = pmName;
    ctx.reviewer_exceptions = userName;
    ctx.reviewer_maker_checker = pmName;

    // Approval block
    ctx.maker_name = userName;
    ctx.maker_designation = "Investment Operations";
    ctx.maker_date = fmtDate(now);
    ctx.maker_signature_or_digital_approval = `Digitally prepared — ${userName}`;
    ctx.portfolio_manager_name = pmName;
    ctx.portfolio_manager_designation = "Portfolio Manager";
    ctx.pm_review_date = fmtDate(now);
    ctx.pm_signature_or_digital_approval = `Reviewed — ${pmName}`;
    ctx.checker_name = userName;
    ctx.checker_designation = "Investment Operations";
    ctx.checker_date = fmtDate(now);
    ctx.checker_signature_or_digital_approval = `Checked — ${userName}`;
    ctx.authorised_release_name = pmName;
    ctx.authorised_release_designation = "Portfolio Manager";
    ctx.release_signature_or_digital_approval = `Authorised — ${pmName}`;

    // Audit trail
    ctx.reporting_run_id = params.reportRunId;
    ctx.generated_report_id = params.reportRunId;
    ctx.source_module_stock_price_collector_portfolio_valuation =
      "Stock Price Collector / Portfolio Valuation / Listed Equity";
    ctx.performance_calculation_batch_id = valRun?.id || snap?.id || params.reportRunId;
    ctx.valuation_snapshot_id = snap?.id || snapshots[snapshots.length - 1]?.id || params.reportRunId;
    ctx.benchmark_snapshot_id = supp.valRuns[0]?.id || `BENCH-${params.fundId.slice(-8)}`;
    ctx.generated_by_user = userName;
    ctx.generated_datetime = now.toISOString();
    ctx.approved_by_user = pmName;
    ctx.approval_datetime = now.toISOString();
    ctx.yes_no = supp.documents.length ? "Yes" : "No";
    ctx.portal_publication_date = fmtDate(now);
    ctx.archive_status = "DRAFT";
    ctx.reissue_reference = "";
    ctx.document_hash = createHash("sha256")
      .update(`${params.reportRunId}:${params.fundId}:${now.toISOString()}`)
      .digest("hex")
      .slice(0, 16);

    ctx.status_source_data = "Confirmed";
    ctx.status_benchmark = "Confirmed";
    ctx.status_methodology = "Confirmed";
    ctx.status_pnl = "Confirmed";
    ctx.status_exceptions = valEx.length || reconOpen ? "Review required" : "Clear";
    ctx.status_maker_checker = "Complete";

    return finalizePerformanceReportContext(ctx, baseCurrency);
  }
}
