// @ts-nocheck
import type { HardcodedKPI } from "../config/hardcodedKPIs";
import { HARDCODED_KPIS, getFinancialKPIs } from "../config/hardcodedKPIs";

export const PERF_JE_REF_PREFIXES = ["PERF-GOAL-", "KPI-GOAL-"] as const;

export type ProgressEventSource = "manual" | "task" | "activity" | "gl_sync";

export type GoalForSync = {
  id: string;
  title: string;
  type: string | null;
  kpiId: string | null;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  parentGoalId: string | null;
  kpi?: {
    id: string;
    code: string | null;
    name: string;
    isFinancial: boolean;
    accountType: string | null;
  } | null;
};

export type SyncJobPlan = {
  kpiId: string;
  kpiCode: string;
  kpiName: string;
  periodStart: Date;
  periodEnd: Date;
  canonicalGoalId: string;
  canonicalGoalTitle: string;
  duplicateGoalIds: string[];
  isPayroll: boolean;
  isBalanceSheet: boolean;
  hardcodedConfig: HardcodedKPI | null;
};

export function dateRangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && aEnd.getTime() >= bStart.getTime();
}

/** UTC calendar month start through end of today. */
export function defaultLoginSyncPeriod(): { periodStart: Date; periodEnd: Date } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  return {
    periodStart: new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(y, m, d, 23, 59, 59, 999))
  };
}

export function intersectSyncWindow(
  goal: { startDate: Date; endDate: Date },
  periodStart: Date,
  periodEnd: Date
): { windowStart: Date; windowEnd: Date } | null {
  const windowStart = new Date(
    Math.max(new Date(goal.startDate).getTime(), periodStart.getTime())
  );
  const windowEnd = new Date(Math.min(new Date(goal.endDate).getTime(), periodEnd.getTime()));
  if (windowStart.getTime() > windowEnd.getTime()) return null;
  return { windowStart, windowEnd };
}

export function glSyncSourceRef(periodStart: Date, periodEnd: Date): string {
  return `gl_sync:${periodStart.toISOString().slice(0, 10)}:${periodEnd.toISOString().slice(0, 10)}`;
}

export function pickCanonicalCompanyGoal<T extends { id: string; type: string | null; createdAt: Date }>(
  goals: T[]
): { canonical: T; duplicates: T[] } {
  const company = goals.filter((g) => String(g.type || "").toLowerCase() === "company");
  const pool = company.length ? company : goals;
  const sorted = [...pool].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return { canonical: sorted[0], duplicates: sorted.slice(1) };
}

const BALANCE_SHEET_ACCOUNT_TYPES = new Set([
  "Asset",
  "Current Asset",
  "Fixed Asset",
  "Long-Term Asset",
  "Other Asset",
  "Liability",
  "Current Liability",
  "Long-Term Liability"
]);

export function resolveHardcodedByKpi(kpi: {
  code: string | null;
  name: string;
}): HardcodedKPI | null {
  if (kpi.code) {
    const byCode = HARDCODED_KPIS.find((h) => h.code === String(kpi.code).toUpperCase());
    if (byCode) return byCode;
  }
  return (
    HARDCODED_KPIS.find(
      (h) => String(h.name).toLowerCase().trim() === String(kpi.name).toLowerCase().trim()
    ) ?? null
  );
}

export function isBalanceSheetKpi(
  hardcoded: HardcodedKPI | null,
  accountType: string | null
): boolean {
  if (hardcoded?.accountType && BALANCE_SHEET_ACCOUNT_TYPES.has(hardcoded.accountType)) {
    return true;
  }
  const at = String(accountType || "").trim();
  return BALANCE_SHEET_ACCOUNT_TYPES.has(at);
}

export function groupGoalsIntoSyncJobs(
  goals: GoalForSync[],
  periodStart: Date,
  periodEnd: Date
): SyncJobPlan[] {
  const financialCodes = new Set(getFinancialKPIs().map((k) => k.code));
  const byKpi = new Map<string, GoalForSync[]>();

  for (const goal of goals) {
    if (!goal.kpiId || !goal.kpi) continue;
    const hc = resolveHardcodedByKpi(goal.kpi);
    const isFinancial =
      goal.kpi.isFinancial || (hc?.isFinancial ?? false) || financialCodes.has(String(goal.kpi.code || ""));
    if (!isFinancial) continue;
    if (!dateRangesOverlap(goal.startDate, goal.endDate, periodStart, periodEnd)) continue;

    const list = byKpi.get(goal.kpiId) || [];
    list.push(goal);
    byKpi.set(goal.kpiId, list);
  }

  const jobs: SyncJobPlan[] = [];
  for (const [kpiId, kpiGoals] of byKpi.entries()) {
    const kpi = kpiGoals[0].kpi!;
    const hc = resolveHardcodedByKpi(kpi);
    const code = String(kpi.code || hc?.code || "").toUpperCase();
    const { canonical, duplicates } = pickCanonicalCompanyGoal(kpiGoals);
    const win = intersectSyncWindow(canonical, periodStart, periodEnd);
    if (!win) continue;

    jobs.push({
      kpiId,
      kpiCode: code,
      kpiName: kpi.name,
      periodStart: win.windowStart,
      periodEnd: win.windowEnd,
      canonicalGoalId: canonical.id,
      canonicalGoalTitle: canonical.title,
      duplicateGoalIds: duplicates.map((d) => d.id),
      isPayroll: code === "PAYROLL_EXPENSE",
      isBalanceSheet: isBalanceSheetKpi(hc, kpi.accountType),
      hardcodedConfig: hc
    });
  }

  return jobs;
}
