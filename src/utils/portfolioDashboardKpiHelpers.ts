/**
 * Pure helpers for portfolio dashboard KPI period parsing, sector stats, and AUM YoY heuristics.
 */

export function sortedKpiPeriodKeys(kpiValues: unknown): string[] {
  if (!kpiValues || typeof kpiValues !== "object") return [];
  return Object.keys(kpiValues as Record<string, unknown>)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort();
}

export function getLatestAndPriorKpiBlobs(kpiValues: unknown): {
  currentKey: string;
  priorKey: string;
  current: Record<string, unknown>;
  prior: Record<string, unknown>;
} | null {
  const keys = sortedKpiPeriodKeys(kpiValues);
  if (keys.length < 2) return null;
  const currentKey = keys[keys.length - 1];
  const priorKey = keys[keys.length - 2];
  const kv = kpiValues as Record<string, Record<string, unknown>>;
  return {
    currentKey,
    priorKey,
    current: kv[currentKey] || {},
    prior: kv[priorKey] || {},
  };
}

export function numFromKpiField(blob: Record<string, unknown> | null | undefined, key: string): number | null {
  if (!blob || typeof blob !== "object") return null;
  const v = blob[key];
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** HHI on 0–10000 scale: sum of squared market shares where each share is percent 0–100 (U.S. convention). */
export function sectorHerfindahlHirschmanFromPercentages(sectorPercentages: number[]): number {
  if (!sectorPercentages.length) return 0;
  let h = 0;
  for (const p of sectorPercentages) {
    if (!Number.isFinite(p) || p < 0) continue;
    const f = p / 100;
    h += f * f;
  }
  return Math.round(h * 10000 * 100) / 100;
}

export type KpiRag = "green" | "yellow" | "red";

export function revenueGrowthRag(revenueGrowthRate: number | null | undefined): KpiRag | null {
  if (revenueGrowthRate == null || !Number.isFinite(revenueGrowthRate)) return null;
  if (revenueGrowthRate >= 0) return "green";
  if (revenueGrowthRate >= -0.05) return "yellow";
  return "red";
}

export function liquidityRag(currentRatio: number | null | undefined, quickRatio: number | null | undefined): KpiRag | null {
  const cr = currentRatio;
  const qr = quickRatio;
  if ((cr == null || !Number.isFinite(cr)) && (qr == null || !Number.isFinite(qr))) return null;
  const weak = (cr != null && cr < 1) || (qr != null && qr < 0.8);
  const borderline = (cr != null && cr >= 1 && cr < 1.2) || (qr != null && qr >= 0.8 && qr < 1);
  if (weak) return "red";
  if (borderline) return "yellow";
  return "green";
}

export function cashFlowRag(
  operatingCashFlow: number | null | undefined,
  cashFlowNet: number | null | undefined
): KpiRag | null {
  const ocf = operatingCashFlow;
  const cn = cashFlowNet;
  if ((ocf == null || !Number.isFinite(ocf)) && (cn == null || !Number.isFinite(cn))) return null;
  const v = ocf != null && Number.isFinite(ocf) ? ocf : cn!;
  if (v >= 0) return "green";
  if (v > -1) return "yellow";
  return "red";
}

export function profitRag(netProfit: number | null | undefined, netProfitMargin: number | null | undefined): KpiRag | null {
  if (netProfit != null && Number.isFinite(netProfit)) {
    if (netProfit > 0) return "green";
    if (netProfit === 0) return "yellow";
    return "red";
  }
  if (netProfitMargin != null && Number.isFinite(netProfitMargin)) {
    if (netProfitMargin >= 0.05) return "green";
    if (netProfitMargin >= 0) return "yellow";
    return "red";
  }
  return null;
}

/**
 * Heuristic prior “holdings” value per company: FMV from second-latest kpiValues period if present.
 * Returns null if that period has no PORTFOLIO_FAIR_VALUE.
 */
export function priorPeriodFairValueFromKpiValues(kpiValues: unknown): number | null {
  const keys = sortedKpiPeriodKeys(kpiValues);
  if (keys.length < 2) return null;
  const priorKey = keys[keys.length - 2];
  const kv = kpiValues as Record<string, Record<string, unknown>>;
  const blob = kv[priorKey];
  return numFromKpiField(blob, "PORTFOLIO_FAIR_VALUE");
}

/**
 * FMV from `kpiValues` at or before `periodKey` (forward-filled from prior reported periods only).
 */
export function fairValueCarriedThroughPeriod(kpiValues: unknown, periodKey: string): number {
  const kv = kpiValues as Record<string, Record<string, unknown>> | undefined;
  if (!kv || typeof kv !== "object") return 0;
  const keys = sortedKpiPeriodKeys(kv);
  let last: number | null = null;
  for (const k of keys) {
    if (k > periodKey) break;
    const v = numFromKpiField(kv[k], "PORTFOLIO_FAIR_VALUE");
    if (v != null) last = v;
  }
  return last ?? 0;
}

/** Optional investee business unit / segment for AUM concentration (capTable-driven). */
export function inferBusinessUnitLabel(company: {
  capTable?: unknown;
}): string {
  const ct = company.capTable as Record<string, unknown> | null | undefined;
  const raw =
    (ct?.businessUnit as string) ||
    (ct?.division as string) ||
    (ct?.segment as string) ||
    (ct?.operatingUnit as string) ||
    "";
  const s = String(raw || "").trim();
  return s ? s : "Unspecified";
}

/** Best-effort asset class for AUM concentration (UI may set `capTable.assetClass` / `instrumentType`). */
export function inferAssetClassLabel(company: {
  capTable?: unknown;
  fundingStage?: string | null;
}): string {
  const ct = company.capTable as Record<string, unknown> | null | undefined;
  const raw =
    (ct?.assetClass as string) ||
    (ct?.instrumentType as string) ||
    (ct?.securityType as string) ||
    "";
  const s = String(raw || "").trim();
  if (s) return s.toUpperCase();
  const stage = String(company.fundingStage || "").toUpperCase();
  if (stage.includes("DEBT") || stage.includes("LOAN") || stage.includes("NOTE")) return "DEBT";
  return "EQUITY";
}

export function computePortfolioAumHistoryCagr(params: {
  portfolioCompanies: unknown[];
  getRealizedValue: (c: unknown) => number;
}): {
  cagr: number | null;
  years: number | null;
  firstPeriodKey: string | null;
  lastPeriodKey: string | null;
  /** Portfolio-level AUM proxy per period: realized (current snapshot) + FMV carried through kpiValues. */
  series: Array<{ periodKey: string; totalAum: number }>;
} {
  const { portfolioCompanies, getRealizedValue } = params;
  const keySet = new Set<string>();
  for (const c of portfolioCompanies) {
    const kv = (c as { financialKpis?: { kpiValues?: unknown } })?.financialKpis?.kpiValues;
    for (const k of sortedKpiPeriodKeys(kv)) keySet.add(k);
  }
  const unionKeys = Array.from(keySet).sort();
  if (unionKeys.length < 2) {
    return { cagr: null, years: null, firstPeriodKey: null, lastPeriodKey: null, series: [] };
  }
  const series: Array<{ periodKey: string; totalAum: number }> = [];
  for (const periodKey of unionKeys) {
    let total = 0;
    for (const c of portfolioCompanies) {
      const kv = (c as { financialKpis?: { kpiValues?: unknown } })?.financialKpis?.kpiValues;
      total += getRealizedValue(c) + fairValueCarriedThroughPeriod(kv, periodKey);
    }
    series.push({ periodKey, totalAum: Math.round(total * 100) / 100 });
  }
  const first = series[0];
  const last = series[series.length - 1];
  const t0 = Date.parse(`${first.periodKey}T12:00:00Z`);
  const t1 = Date.parse(`${last.periodKey}T12:00:00Z`);
  const years = (t1 - t0) / (365.25 * 24 * 3600 * 1000);
  let cagr: number | null = null;
  if (first.totalAum > 0 && years > 0.08 && last.totalAum > 0) {
    cagr = Math.pow(last.totalAum / first.totalAum, 1 / years) - 1;
    cagr = Math.round(cagr * 10000) / 10000;
  }
  return {
    cagr,
    years: years > 0 ? Math.round(years * 100) / 100 : null,
    firstPeriodKey: first.periodKey,
    lastPeriodKey: last.periodKey,
    series,
  };
}

/** YTD change in portfolio AUM proxy vs first `historySeries` point in the calendar year (decimal rate). */
export function computeYtdAumChangeRate(params: {
  historySeries: Array<{ periodKey: string; totalAum: number }>;
  calendarYear: number;
  currentTotalAum: number;
}): {
  ytdChangeRate: number | null;
  ytdStartPeriodKey: string | null;
  ytdStartAum: number | null;
} {
  const { historySeries, calendarYear, currentTotalAum } = params;
  const prefix = `${calendarYear}-`;
  const inYear = historySeries.filter((p) => p.periodKey.startsWith(prefix));
  if (inYear.length === 0) {
    return { ytdChangeRate: null, ytdStartPeriodKey: null, ytdStartAum: null };
  }
  const first = inYear[0];
  if (first.totalAum <= 0) {
    return {
      ytdChangeRate: null,
      ytdStartPeriodKey: first.periodKey,
      ytdStartAum: first.totalAum,
    };
  }
  const rate = (currentTotalAum - first.totalAum) / first.totalAum;
  return {
    ytdChangeRate: Math.round(rate * 10000) / 10000,
    ytdStartPeriodKey: first.periodKey,
    ytdStartAum: Math.round(first.totalAum * 100) / 100,
  };
}
