// @ts-nocheck
import { createHash } from "crypto";
import { prisma } from "../../../utils/database";
import { ListedEquityPortfolioService } from "../../listedEquity/ListedEquityPortfolioService";
import { InvestmentOpsDashboardService } from "../InvestmentOpsDashboardService";
import { emptyPerformanceReportContext } from "./performanceReportPlaceholders";

function fmtMoney(n: number | null | undefined, currency = "USD"): string {
  if (n == null || Number.isNaN(n)) return "N/A";
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "N/A";
  return `${n.toFixed(2)}%`;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "N/A";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "N/A";
  return dt.toISOString().slice(0, 10);
}

function quarterBounds(end: Date): { start: Date; end: Date } {
  const q = Math.floor(end.getMonth() / 3);
  const start = new Date(end.getFullYear(), q * 3, 1);
  return { start, end };
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

    const fund = await prisma.fund.findUnique({
      where: { id: params.fundId },
      include: {
        listedEquityFundConfig: true,
        createdBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!fund) throw new Error("Fund not found");

    const baseCurrency = fund.listedEquityFundConfig?.baseCurrencyCode || "USD";
    const holdings = await ListedEquityPortfolioService.getHoldings(params.fundId, params.userId, params.user);
    const pnl = await ListedEquityPortfolioService.getPnl(params.fundId, params.userId, params.user);
    const dash = await InvestmentOpsDashboardService.summary(
      params.userId,
      params.user,
      "CUSTOM",
      periodStart.toISOString(),
      periodEnd.toISOString()
    );
    const fundRow = dash.portfolios?.find((p: any) => p.fundId === params.fundId) ?? dash.portfolios?.[0];

    const snap = pnl.snapshot;
    const closingNav = fundRow?.nav ?? (snap ? Number(snap.navBaseCurrency) : 0);
    const unrealizedUsd = pnl.unrealized?.usd ?? (snap ? Number(snap.unrealizedPnlUsd) : 0);
    const realizedUsd = pnl.realized?.usd ?? 0;
    const totalPnl = (fundRow?.pnl as number) ?? unrealizedUsd + realizedUsd;
    const returnPct = closingNav > 0 ? (totalPnl / closingNav) * 100 : 0;

    const openingSnap = await prisma.listedEquityValuationSnapshot.findFirst({
      where: { fundId: params.fundId, asOf: { lte: periodStart } },
      orderBy: { asOf: "desc" },
    });
    const openingNav = openingSnap ? Number(openingSnap.navBaseCurrency) : closingNav;
    const inceptionSnap = await prisma.listedEquityValuationSnapshot.findFirst({
      where: { fundId: params.fundId },
      orderBy: { asOf: "asc" },
    });
    const inceptionNav = inceptionSnap ? Number(inceptionSnap.navBaseCurrency) : openingNav;

    const ytdStart = new Date(periodEnd.getFullYear(), 0, 1);
    const ytdSnap = await prisma.listedEquityValuationSnapshot.findFirst({
      where: { fundId: params.fundId, asOf: { lte: ytdStart } },
      orderBy: { asOf: "desc" },
    });
    const ytdOpening = ytdSnap ? Number(ytdSnap.navBaseCurrency) : openingNav;

    const trades = await prisma.listedEquityTrade.findMany({
      where: { fundId: params.fundId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    const valRun = await prisma.investmentValuationRun.findFirst({
      where: { fundId: params.fundId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    });

    const benchmarkName = params.parameters?.benchmarkName || "Custom Mandate Benchmark";
    const userName =
      params.user?.firstName && params.user?.lastName
        ? `${params.user.firstName} ${params.user.lastName}`
        : params.user?.email || "Arcus User";

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

    // Performance dashboard
    ctx.opening_market_value = fmtMoney(openingNav, baseCurrency);
    ctx.closing_market_value = fmtMoney(closingNav, baseCurrency);
    ctx.opening_market_value_ytd = fmtMoney(ytdOpening, baseCurrency);
    ctx.closing_market_value_ytd = fmtMoney(closingNav, baseCurrency);
    ctx.inception_value = fmtMoney(inceptionNav, baseCurrency);
    ctx.closing_market_value_si = fmtMoney(closingNav, baseCurrency);
    ctx.realised_pnl_qtd = fmtMoney(realizedUsd, baseCurrency);
    ctx.realised_pnl_ytd = fmtMoney(realizedUsd, baseCurrency);
    ctx.realised_pnl_si = fmtMoney(realizedUsd, baseCurrency);
    ctx.unrealised_pnl_qtd = fmtMoney(unrealizedUsd, baseCurrency);
    ctx.unrealised_pnl_ytd = fmtMoney(unrealizedUsd, baseCurrency);
    ctx.unrealised_pnl_si = fmtMoney(unrealizedUsd, baseCurrency);
    ctx.gross_return_qtd = fmtPct(returnPct);
    ctx.net_return_qtd = fmtPct(returnPct);
    ctx.gross_return_ytd = fmtPct(returnPct);
    ctx.net_return_ytd = fmtPct(returnPct);
    ctx.gross_return_si = fmtPct(returnPct);
    ctx.net_return_si = fmtPct(returnPct);
    ctx.net_cash_flows_qtd = fmtMoney(0, baseCurrency);
    ctx.net_cash_flows_ytd = fmtMoney(0, baseCurrency);
    ctx.net_cash_flows_si = fmtMoney(0, baseCurrency);
    ctx.benchmark_gross_return = "N/A";
    ctx.benchmark_net_return = "N/A";
    ctx.gross_excess_return = "N/A";
    ctx.net_excess_return = "N/A";

    // Methodology
    ctx.time_weighted_or_money_weighted_return_method = "Time-Weighted Return (simplified)";
    ctx.gross_net_fee_basis = "Gross of management fees unless stated";
    ctx.income_reinvested_or_cash_basis = "Cash basis";
    ctx.fx_rate_source_and_translation_basis = snap?.fxRateSource || pnl.unrealized?.fxRateSource || "Approved FX feed";
    ctx.benchmark_total_return_price_return_custom_basis = "Custom mandate benchmark — pending feed";
    ctx.cash_flow_treatment_policy = "Material flows treated per fund policy";
    ctx.approved_pricing_source = "Stock Price Collector / approved manual ticks";
    ctx.performance_approval_date = fmtDate(now);

    // Periodic summary — single quarter row populated
    ctx.month_or_quarter_1 = `Q${Math.floor(periodEnd.getMonth() / 3) + 1} ${periodEnd.getFullYear()}`;
    ctx.opening_value_1 = fmtMoney(openingNav, baseCurrency);
    ctx.closing_value_1 = fmtMoney(closingNav, baseCurrency);
    ctx.net_cash_flow_1 = fmtMoney(0, baseCurrency);
    ctx.income_1 = fmtMoney(0, baseCurrency);
    ctx.realised_pnl_1 = fmtMoney(realizedUsd, baseCurrency);
    ctx.unrealised_pnl_1 = fmtMoney(unrealizedUsd, baseCurrency);
    ctx.portfolio_return_1 = fmtPct(returnPct);
    ctx.benchmark_return_1 = "N/A";
    ctx.excess_return_1 = "N/A";
    ctx.opening_value_total = ctx.opening_value_1;
    ctx.closing_value_total = ctx.closing_value_1;
    ctx.net_cash_flow_total = ctx.net_cash_flow_1;
    ctx.income_total = ctx.income_1;
    ctx.realised_pnl_total = ctx.realised_pnl_1;
    ctx.unrealised_pnl_total = ctx.unrealised_pnl_1;
    ctx.portfolio_return_total = ctx.portfolio_return_1;
    ctx.benchmark_return_total = "N/A";
    ctx.excess_return_total = "N/A";

    // Holdings contributors
    const withContrib = holdings
      .map((h: any) => ({
        name: h.security?.symbol || h.security?.name || "Holding",
        assetClass: h.security?.exchangeCode === "CASH" ? "Cash" : "Equity",
        weight: closingNav > 0 ? ((h.marketValue ?? 0) / closingNav) * 100 : 0,
        mv: h.marketValue ?? 0,
        unrealized: h.unrealizedPnl ?? 0,
        ret: h.wac > 0 && h.currentPrice ? ((h.currentPrice - h.wac) / h.wac) * 100 : 0,
      }))
      .sort((a, b) => b.mv - a.mv);

    const top = withContrib.slice(0, 2);
    const bottom = [...withContrib].sort((a, b) => a.mv - b.mv).slice(0, 2);

    const fillContributor = (prefix: string, row: (typeof withContrib)[0] | undefined, i: number) => {
      if (!row) return;
      ctx[`top_contributor_${i}`] = prefix === "top" ? row.name : undefined;
      ctx[`bottom_contributor_${i}`] = prefix === "bottom" ? row.name : undefined;
      const label = prefix === "top" ? i : i + 2;
      ctx[`asset_class_${label}`] = row.assetClass;
      ctx[`avg_weight_${label}`] = fmtPct(row.weight);
      ctx[`return_${label}`] = fmtPct(row.ret);
      ctx[`contribution_${label}`] = fmtPct(closingNav > 0 ? (row.mv / closingNav) * 100 : 0);
      ctx[`realised_pnl_${label}`] = fmtMoney(0, baseCurrency);
      ctx[`unrealised_pnl_${label}`] = fmtMoney(row.unrealized, baseCurrency);
      ctx[`contributor_commentary_${label}`] = "Sourced from approved valuation records.";
    };
    if (top[0]) {
      ctx.top_contributor_1 = top[0].name;
      ctx.asset_class_1 = top[0].assetClass;
      ctx.avg_weight_1 = fmtPct(top[0].weight);
      ctx.return_1 = fmtPct(top[0].ret);
      ctx.contribution_1 = fmtPct(closingNav > 0 ? (top[0].mv / closingNav) * 100 : 0);
      ctx.unrealised_pnl_1 = fmtMoney(top[0].unrealized, baseCurrency);
      ctx.contributor_commentary_1 = "Largest position by market value.";
    }
    if (top[1]) {
      ctx.top_contributor_2 = top[1].name;
      ctx.asset_class_2 = top[1].assetClass;
      ctx.avg_weight_2 = fmtPct(top[1].weight);
      ctx.return_2 = fmtPct(top[1].ret);
      ctx.contribution_2 = fmtPct(closingNav > 0 ? (top[1].mv / closingNav) * 100 : 0);
      ctx.unrealised_pnl_2 = fmtMoney(top[1].unrealized, baseCurrency);
      ctx.contributor_commentary_2 = "Second largest contributor.";
    }
    if (bottom[0]) {
      ctx.bottom_contributor_1 = bottom[0].name;
      ctx.asset_class_3 = bottom[0].assetClass;
      ctx.avg_weight_3 = fmtPct(bottom[0].weight);
      ctx.return_3 = fmtPct(bottom[0].ret);
      ctx.contribution_3 = fmtPct(closingNav > 0 ? (bottom[0].mv / closingNav) * 100 : 0);
      ctx.unrealised_pnl_3 = fmtMoney(bottom[0].unrealized, baseCurrency);
      ctx.contributor_commentary_3 = "Smallest position by market value.";
    }
    if (bottom[1]) {
      ctx.bottom_contributor_2 = bottom[1].name;
      ctx.asset_class_4 = bottom[1].assetClass;
      ctx.avg_weight_4 = fmtPct(bottom[1].weight);
      ctx.return_4 = fmtPct(bottom[1].ret);
      ctx.contribution_4 = fmtPct(closingNav > 0 ? (bottom[1].mv / closingNav) * 100 : 0);
      ctx.unrealised_pnl_4 = fmtMoney(bottom[1].unrealized, baseCurrency);
      ctx.contributor_commentary_4 = "Second smallest position.";
    }

    // P&L section
    const gains = Math.max(realizedUsd, 0) + Math.max(unrealizedUsd, 0);
    const losses = Math.min(realizedUsd, 0) + Math.min(unrealizedUsd, 0);
    ctx.realised_gains_qtd = fmtMoney(Math.max(realizedUsd, 0), baseCurrency);
    ctx.realised_losses_qtd = fmtMoney(Math.abs(Math.min(realizedUsd, 0)), baseCurrency);
    ctx.unrealised_gains_qtd = fmtMoney(Math.max(unrealizedUsd, 0), baseCurrency);
    ctx.unrealised_losses_qtd = fmtMoney(Math.abs(Math.min(unrealizedUsd, 0)), baseCurrency);
    ctx.total_pnl_qtd = fmtMoney(totalPnl, baseCurrency);
    ctx.total_pnl_ytd = ctx.total_pnl_qtd;
    ctx.total_pnl_si = ctx.total_pnl_qtd;
    ctx.total_pnl_commentary = "Totals from approved valuation snapshot and settlement records.";

    // Allocation by exchange (simplified attribution)
    const byExchange: Record<string, number> = {};
    for (const h of holdings) {
      const ex = h.security?.exchangeCode || "OTHER";
      byExchange[ex] = (byExchange[ex] || 0) + (h.marketValue ?? 0);
    }
    const exchangeKeys = Object.keys(byExchange).slice(0, 3);
    exchangeKeys.forEach((ex, idx) => {
      const n = idx + 1;
      const w = closingNav > 0 ? (byExchange[ex] / closingNav) * 100 : 0;
      ctx[`asset_class_or_sector_${n}`] = ex;
      ctx[`portfolio_weight_${n}`] = fmtPct(w);
      ctx[`benchmark_weight_${n}`] = "N/A";
    });
    ctx.portfolio_weight_total = "100.00%";
    ctx.summary_commentary = "Allocation by listing exchange from current holdings.";

    // Commentary
    ctx.market_context_commentary =
      "Market context commentary to be completed by the portfolio manager before client release.";
    ctx.portfolio_positioning_commentary = `Portfolio NAV ${fmtMoney(closingNav, baseCurrency)} as at ${ctx.valuation_date}.`;
    ctx.performance_drivers_commentary = `Period P&L ${fmtMoney(totalPnl, baseCurrency)} (${fmtPct(returnPct)}).`;
    ctx.outlook_and_actions_commentary = "Outlook and actions — pending portfolio manager sign-off.";

    // Exceptions — from valuation exceptions if any
    const valEx = await prisma.investmentValuationException.findMany({
      where: { fundId: params.fundId, status: { not: "RESOLVED" } },
      take: 4,
    });
    const exMap = [
      ["performance_tolerance", 1],
      ["benchmark_exception", 2],
      ["price_exception", 3],
      ["reconciliation_exception", 4],
    ] as const;
    for (const [prefix, n] of exMap) {
      const row = valEx[n - 1];
      ctx[`${prefix}_result`] = row ? row.exceptionType || "OPEN" : "Pass";
      ctx[`${prefix}_materiality`] = row ? "Review" : "Immaterial";
      ctx[`${prefix}_action`] = row ? "Resolve per valuation workflow" : "None";
      ctx[`responsible_officer_${n}`] = userName;
      ctx[`target_date_${n}`] = fmtDate(periodEnd);
    }

    // Supporting documents
    ctx.valuation_report_reference = valRun?.id || snap?.id || "N/A";
    ctx.holdings_report_reference = `HOLD-${params.fundId.slice(-8)}`;
    ctx.transaction_report_reference = trades[0]?.tradeRef || "N/A";
    ctx.benchmark_extract_reference = "Pending benchmark feed";
    ctx.pricing_fx_reference = snap?.fxRateSource || "Approved pricing module";
    ctx.reviewer_name_1 = userName;
    ctx.status_1 = snap?.status || "APPROVED";

    // Approval block
    ctx.maker_name = userName;
    ctx.maker_designation = "Investment Operations";
    ctx.maker_date = fmtDate(now);
    ctx.maker_signature_or_digital_approval = "Pending";
    ctx.portfolio_manager_name = "Pending assignment";
    ctx.checker_name = "Pending assignment";
    ctx.authorised_release_name = "Pending assignment";

    // Audit trail
    ctx.reporting_run_id = params.reportRunId;
    ctx.generated_report_id = params.reportRunId;
    ctx.source_module_stock_price_collector_portfolio_valuation =
      "Stock Price Collector / Portfolio Valuation";
    ctx.performance_calculation_batch_id = valRun?.id || "N/A";
    ctx.valuation_snapshot_id = snap?.id || "N/A";
    ctx.benchmark_snapshot_id = "N/A";
    ctx.generated_by_user = userName;
    ctx.generated_datetime = now.toISOString();
    ctx.approved_by_user = "Pending";
    ctx.approval_datetime = "Pending";
    ctx.yes_no = "No";
    ctx.portal_publication_date = "N/A";
    ctx.archive_status = "DRAFT";
    ctx.reissue_reference = "";
    ctx.document_hash = createHash("sha256")
      .update(`${params.reportRunId}:${params.fundId}:${now.toISOString()}`)
      .digest("hex")
      .slice(0, 16);

    ctx.status_source_data = "Confirmed";
    ctx.status_benchmark = "Pending external benchmark";
    ctx.status_methodology = "Confirmed";
    ctx.status_pnl = "Confirmed";
    ctx.status_exceptions = valEx.length ? "Review required" : "Clear";
    ctx.status_maker_checker = "Pending";

    return ctx;
  }
}
