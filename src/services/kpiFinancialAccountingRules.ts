// @ts-nocheck
import type { HardcodedKPI } from "../config/hardcodedKPIs";
import { HARDCODED_KPIS } from "../config/hardcodedKPIs";
import { resolveKpiAccountingConfig } from "../utils/kpiCatalogMetadata";

export type KpiSyncStrategy =
  | "payroll_runs"
  | "pl_revenue_total"
  | "pl_expense_total"
  | "pl_net_profit"
  | "pl_account_period"
  | "balance_sheet_account"
  | "balance_sheet_assets_total"
  | "balance_sheet_liabilities_total"
  | "balance_sheet_equity_total"
  | "balance_sheet_cash"
  | "unsupported";

export type KpiFinancialProfile = {
  code: string;
  name: string;
  isFinancial: boolean;
  accountType: string | null;
  accountNumber: string | null;
  journalEntryType: "Debit" | "Credit" | null;
  syncStrategy: KpiSyncStrategy;
  postsProgressJournal: boolean;
  hardcoded: HardcodedKPI | null;
};

const PAYROLL_CODE = "PAYROLL_EXPENSE";
const NET_PROFIT_CODE = "NET_PROFIT";
const TOTAL_REVENUE_CODE = "TOTAL_REVENUE";
const OPERATING_EXPENSES_CODE = "OPERATING_EXPENSES";
const CASH_BALANCE_CODE = "CASH_BALANCE";
const TOTAL_LIABILITIES_CODE = "TOTAL_LIABILITIES";
const SHAREHOLDERS_EQUITY_CODE = "SHAREHOLDERS_EQUITY";
const CASH_FLOW_NET_CODE = "CASH_FLOW_NET";
const SUPPLIER_PAYMENTS_CODE = "SUPPLIER_PAYMENTS_MADE";

const BALANCE_SHEET_TYPES = new Set([
  "Asset",
  "Current Asset",
  "Fixed Asset",
  "Long-Term Asset",
  "Other Asset",
  "Liability",
  "Current Liability",
  "Long-Term Liability",
  "Equity"
]);

const INCOME_STATEMENT_TYPES = new Set(["Revenue", "Income", "Expense"]);

/** Reporting-only: sync from GL aggregates / balance sheet but never post progress JEs. */
const REPORTING_ONLY_NO_JE_CODES = new Set([
  CASH_FLOW_NET_CODE,
  SUPPLIER_PAYMENTS_CODE,
  TOTAL_LIABILITIES_CODE,
  SHAREHOLDERS_EQUITY_CODE,
  CASH_BALANCE_CODE
]);

export function isDbOrCatalogFinancial(kpi: {
  code: string | null;
  name: string;
  isFinancial: boolean;
}): boolean {
  if (kpi.isFinancial) return true;
  if (kpi.code && HARDCODED_KPIS.some((h) => h.code === kpi.code && h.isFinancial)) return true;
  const byName = HARDCODED_KPIS.find(
    (h) => h.isFinancial && String(h.name).toLowerCase().trim() === String(kpi.name).toLowerCase().trim()
  );
  return Boolean(byName);
}

export function resolveKpiFinancialProfile(kpi: {
  name: string;
  code: string | null;
  catalogDescription: string | null;
  catalogDepartmentName: string | null;
  accountType: string | null;
  accountNumber: string | null;
  journalEntryType: string | null;
  isFinancial: boolean;
}): KpiFinancialProfile {
  const hardcoded = resolveKpiAccountingConfig(kpi);
  const code = String(kpi.code || hardcoded?.code || "").toUpperCase();
  const accountType = hardcoded?.accountType ?? kpi.accountType ?? null;
  const accountNumber = hardcoded?.accountNumber ?? kpi.accountNumber ?? null;
  const journalEntryType = (hardcoded?.journalEntryType ?? kpi.journalEntryType) as
    | "Debit"
    | "Credit"
    | null;
  const isFinancial = isDbOrCatalogFinancial({
    code,
    name: kpi.name,
    isFinancial: Boolean(kpi.isFinancial || hardcoded?.isFinancial)
  });

  let syncStrategy: KpiSyncStrategy = "unsupported";
  if (!isFinancial) {
    syncStrategy = "unsupported";
  } else if (code === PAYROLL_CODE) {
    syncStrategy = "payroll_runs";
  } else if (code === NET_PROFIT_CODE) {
    syncStrategy = "pl_net_profit";
  } else if (code === TOTAL_REVENUE_CODE) {
    syncStrategy = "pl_revenue_total";
  } else if (code === OPERATING_EXPENSES_CODE) {
    syncStrategy = "pl_expense_total";
  } else if (code === CASH_BALANCE_CODE || code === CASH_FLOW_NET_CODE) {
    syncStrategy = "balance_sheet_cash";
  } else if (code === TOTAL_LIABILITIES_CODE) {
    syncStrategy = "balance_sheet_liabilities_total";
  } else if (code === SHAREHOLDERS_EQUITY_CODE) {
    syncStrategy = "balance_sheet_equity_total";
  } else if (accountNumber && accountType && BALANCE_SHEET_TYPES.has(accountType)) {
    syncStrategy = "balance_sheet_account";
  } else if (accountNumber && accountType && INCOME_STATEMENT_TYPES.has(accountType)) {
    syncStrategy = "pl_account_period";
  } else if (accountType && BALANCE_SHEET_TYPES.has(accountType) && !accountNumber) {
    if (accountType === "Asset" || accountType.includes("Asset")) {
      syncStrategy = "balance_sheet_assets_total";
    } else if (accountType === "Liability" || accountType.includes("Liability")) {
      syncStrategy = "balance_sheet_liabilities_total";
    } else if (accountType === "Equity") {
      syncStrategy = "balance_sheet_equity_total";
    }
  } else if (accountType === "Expense") {
    syncStrategy = "pl_expense_total";
  } else if (accountType === "Revenue" || accountType === "Income") {
    syncStrategy = "pl_revenue_total";
  }

  const noJeSyncOnly = new Set<KpiSyncStrategy>([
    "payroll_runs",
    "pl_net_profit",
    "balance_sheet_cash",
    "balance_sheet_liabilities_total",
    "balance_sheet_equity_total",
    "balance_sheet_assets_total",
    "unsupported"
  ]);

  const postsProgressJournal =
    isFinancial &&
    code !== NET_PROFIT_CODE &&
    code !== PAYROLL_CODE &&
    !REPORTING_ONLY_NO_JE_CODES.has(code) &&
    !noJeSyncOnly.has(syncStrategy) &&
    Boolean(accountNumber && journalEntryType);

  return {
    code,
    name: kpi.name,
    isFinancial,
    accountType,
    accountNumber,
    journalEntryType,
    syncStrategy,
    postsProgressJournal,
    hardcoded
  };
}

export function getKpiProgressJournalSkipReasonFromProfile(
  profile: KpiFinancialProfile,
  input: {
    parentGoalId: string | null;
    formulaType: string | null;
    amount: number;
  }
): string | null {
  if (input.parentGoalId) {
    return "sub-goal; accounting posts at parent rollup only";
  }
  const formula = String(input.formulaType || "").toUpperCase();
  if (profile.code === PAYROLL_CODE || formula === PAYROLL_CODE) {
    return "payroll expense is recorded by PayrollService, not KPI achievement";
  }
  if (profile.code === NET_PROFIT_CODE || formula === NET_PROFIT_CODE) {
    return "net profit is derived from GL sync, not incremental performance journals";
  }
  if (!profile.isFinancial) {
    return "KPI is not financial";
  }
  if (!profile.postsProgressJournal) {
    if (REPORTING_ONLY_NO_JE_CODES.has(profile.code)) {
      return "reporting-only KPI; progress does not post journals";
    }
    if (profile.code === NET_PROFIT_CODE) {
      return "net profit is derived from GL sync, not incremental performance journals";
    }
    if (profile.syncStrategy.startsWith("balance_sheet_") && profile.syncStrategy !== "balance_sheet_account") {
      return "aggregate balance-sheet KPI; sync from GL only, not per-entry performance journals";
    }
    return "KPI has no GL account mapping for progress journals";
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return "non-positive amount";
  }
  return null;
}
