/**
 * Arcus-style analyst flags from monitoring KPIs + reported latestKpiValues / period comparatives.
 */

export type AnalystFlagSeverity = "info" | "warning" | "error";

export interface PortfolioAnalystFlag {
  code: string;
  severity: AnalystFlagSeverity;
  title: string;
  description: string;
}

export interface AnalystFlagRollupEntry {
  code: string;
  severity: AnalystFlagSeverity;
  companyCount: number;
  companies: string[];
}

export function computeAnalystFlagsForCompany(input: {
  companyName: string;
  monitoringKpis: Record<string, number | null> | null | undefined;
  totalRevenue: number | null;
  netProfit: number | null;
  cashFlowNet: number | null;
  totalRevenuePrior: number | null;
  revenueGrowthRateFromMonitoring: number | null | undefined;
}): PortfolioAnalystFlag[] {
  const flags: PortfolioAnalystFlag[] = [];
  const mk = input.monitoringKpis || {};

  const revGrowth =
    input.revenueGrowthRateFromMonitoring != null && Number.isFinite(input.revenueGrowthRateFromMonitoring)
      ? input.revenueGrowthRateFromMonitoring
      : null;
  if (revGrowth != null && revGrowth < -0.05) {
    flags.push({
      code: "REVENUE_DECLINE",
      severity: revGrowth < -0.15 ? "error" : "warning",
      title: "Revenue decline",
      description: `${input.companyName}: revenue change vs prior period is about ${(revGrowth * 100).toFixed(1)}%.`,
    });
  } else if (
    input.totalRevenuePrior != null &&
    input.totalRevenuePrior > 0 &&
    input.totalRevenue != null &&
    input.totalRevenue < input.totalRevenuePrior * 0.95
  ) {
    flags.push({
      code: "REVENUE_DECLINE",
      severity: "warning",
      title: "Revenue decline",
      description: `${input.companyName}: latest revenue is materially below the prior reporting period.`,
    });
  }

  const ocf = mk.OPERATING_CASH_FLOW;
  if (ocf != null && Number.isFinite(ocf) && ocf < 0) {
    flags.push({
      code: "NEGATIVE_OPERATING_CASH_FLOW",
      severity: "warning",
      title: "Negative operating cash flow",
      description: `${input.companyName}: operating cash flow is negative in the latest monitoring snapshot.`,
    });
  }
  if (input.cashFlowNet != null && Number.isFinite(input.cashFlowNet) && input.cashFlowNet < 0) {
    flags.push({
      code: "NEGATIVE_REPORTED_CASH_FLOW",
      severity: "warning",
      title: "Negative reported net cash flow",
      description: `${input.companyName}: latest reported CASH_FLOW_NET is negative.`,
    });
  }

  const dte = mk.DEBT_TO_EQUITY;
  if (dte != null && Number.isFinite(dte)) {
    if (dte > 2) {
      flags.push({
        code: "HIGH_LEVERAGE",
        severity: "error",
        title: "High debt-to-equity",
        description: `${input.companyName}: debt-to-equity is elevated (${dte.toFixed(2)}).`,
      });
    } else if (dte > 1.5) {
      flags.push({
        code: "RISING_OR_ELEVATED_DEBT",
        severity: "warning",
        title: "Elevated leverage",
        description: `${input.companyName}: debt-to-equity is above typical portfolio comfort (${dte.toFixed(2)}).`,
      });
    }
  }

  const currentRatio = mk.CURRENT_RATIO;
  const quickRatio = mk.QUICK_RATIO;
  const runway = mk.CASH_RUNWAY_MONTHS;
  if (currentRatio != null && currentRatio < 1) {
    flags.push({
      code: "LIQUIDITY_CURRENT_RATIO",
      severity: currentRatio < 0.8 ? "error" : "warning",
      title: "Liquidity pressure (current ratio)",
      description: `${input.companyName}: current ratio is ${currentRatio.toFixed(2)}.`,
    });
  }
  if (quickRatio != null && quickRatio < 0.8) {
    flags.push({
      code: "LIQUIDITY_QUICK_RATIO",
      severity: quickRatio < 0.5 ? "error" : "warning",
      title: "Liquidity (quick ratio)",
      description: `${input.companyName}: quick ratio is ${quickRatio.toFixed(2)}.`,
    });
  }
  if (runway != null && runway < 12) {
    flags.push({
      code: "SHORT_CASH_RUNWAY",
      severity: runway < 6 ? "error" : "warning",
      title: "Short cash runway",
      description: `${input.companyName}: implied cash runway is about ${runway.toFixed(1)} months.`,
    });
  }

  if (input.netProfit != null && Number.isFinite(input.netProfit) && input.netProfit < 0) {
    flags.push({
      code: "NEGATIVE_NET_PROFIT",
      severity: "warning",
      title: "Negative net profit",
      description: `${input.companyName}: latest period net profit is negative.`,
    });
  }

  return flags;
}

export function rollupAnalystFlags(
  rows: Array<{ companyName: string; flags: PortfolioAnalystFlag[] }>
): AnalystFlagRollupEntry[] {
  const map = new Map<
    string,
    { severity: AnalystFlagSeverity; titles: Set<string>; companies: Set<string> }
  >();
  for (const row of rows) {
    for (const f of row.flags) {
      const ex = map.get(f.code);
      const sevRank = (s: AnalystFlagSeverity) => (s === "error" ? 3 : s === "warning" ? 2 : 1);
      if (!ex) {
        map.set(f.code, {
          severity: f.severity,
          titles: new Set([f.title]),
          companies: new Set([row.companyName]),
        });
      } else {
        if (sevRank(f.severity) > sevRank(ex.severity)) ex.severity = f.severity;
        ex.titles.add(f.title);
        ex.companies.add(row.companyName);
      }
    }
  }
  return Array.from(map.entries())
    .map(([code, v]) => ({
      code,
      severity: v.severity,
      companyCount: v.companies.size,
      companies: Array.from(v.companies).sort(),
    }))
    .sort((a, b) => b.companyCount - a.companyCount || a.code.localeCompare(b.code));
}
