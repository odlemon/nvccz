// @ts-nocheck
import { BalanceSheetService } from "./BalanceSheetService";
import { IncomeStatementService } from "./IncomeStatementService";
import {
  getPostedPeriodNetForAccountNo,
  getPostedPeriodRevenueExpenseNetProfitExcludingPerformance
} from "./AccountingGlPeriodTotalsService";
import type { KpiFinancialProfile } from "./kpiFinancialAccountingRules";

export type FetchGlValueInput = {
  profile: KpiFinancialProfile;
  periodStart: Date;
  periodEnd: Date;
  currencyId?: string;
};

/**
 * Resolve native GL amount for a financial KPI (signed), aligned with analytics semantics.
 */
export class FinancialKpiGlValueService {
  static async fetchNativeGlValue(input: FetchGlValueInput): Promise<number | null> {
    const { profile, periodStart, periodEnd, currencyId } = input;
    const strategy = profile.syncStrategy;

    if (strategy === "unsupported" || strategy === "payroll_runs") {
      return null;
    }

    const glOpts = { excludePerformanceJournals: true };

    if (strategy === "pl_revenue_total") {
      const t = await getPostedPeriodRevenueExpenseNetProfitExcludingPerformance(periodStart, periodEnd);
      return t.revenue;
    }
    if (strategy === "pl_expense_total") {
      const t = await getPostedPeriodRevenueExpenseNetProfitExcludingPerformance(periodStart, periodEnd);
      return t.totalExpense;
    }
    if (strategy === "pl_net_profit") {
      const t = await getPostedPeriodRevenueExpenseNetProfitExcludingPerformance(periodStart, periodEnd);
      return t.netProfit;
    }
    if (strategy === "pl_account_period" && profile.accountNumber) {
      return getPostedPeriodNetForAccountNo(profile.accountNumber, periodStart, periodEnd, glOpts);
    }

    const asOf = periodEnd;
    const bsParams = { asOfDate: asOf, ...(currencyId ? { currencyId } : {}) };
    const balanceSheet = await BalanceSheetService.generateBalanceSheet(bsParams);

    if (strategy === "balance_sheet_account" && profile.accountNumber) {
      return this.balanceForAccountNo(balanceSheet, profile.accountNumber);
    }
    if (strategy === "balance_sheet_cash") {
      const ca = balanceSheet.assets?.currentAssets?.accounts || [];
      const cashLike = ca.filter((a: any) =>
        /cash|bank|equivalent/i.test(String(a.accountName || a.accountNo || ""))
      );
      if (cashLike.length) {
        return cashLike.reduce((s: number, a: any) => s + Number(a.balance || 0), 0);
      }
      return Number(balanceSheet.assets?.currentAssets?.total ?? 0);
    }
    if (strategy === "balance_sheet_liabilities_total") {
      return Number(balanceSheet.liabilities?.totalLiabilities ?? 0);
    }
    if (strategy === "balance_sheet_equity_total") {
      const eq = balanceSheet.equity || {};
      return Number(eq.total ?? 0) + Number(eq.retainedEarnings ?? 0);
    }
    if (strategy === "balance_sheet_assets_total") {
      return Number(balanceSheet.assets?.totalAssets ?? 0);
    }

    if (profile.accountNumber) {
      const periodNet = await getPostedPeriodNetForAccountNo(
        profile.accountNumber,
        periodStart,
        periodEnd,
        glOpts
      );
      if (periodNet !== 0) return periodNet;
      return this.balanceForAccountNo(balanceSheet, profile.accountNumber);
    }

    return null;
  }

  private static balanceForAccountNo(balanceSheet: any, accountNo: string): number {
    const all: Array<{ accountNo: string; balance: number }> = [];
    const push = (list: any[]) => {
      if (!Array.isArray(list)) return;
      for (const acc of list) {
        all.push({ accountNo: acc.accountNo, balance: Number(acc.balance || 0) });
      }
    };
    push(balanceSheet.assets?.currentAssets?.accounts || []);
    push(balanceSheet.assets?.fixedAssets?.accounts || []);
    push(balanceSheet.assets?.otherAssets?.accounts || []);
    push(balanceSheet.liabilities?.currentLiabilities?.accounts || []);
    push(balanceSheet.liabilities?.longTermLiabilities?.accounts || []);
    push(balanceSheet.equity?.accounts || []);

    const matches = all.filter((a) => a.accountNo === accountNo);
    if (matches.length) {
      return matches.reduce((s, a) => s + a.balance, 0);
    }
    if (accountNo === "RETAINED_EARNINGS") {
      return Number(balanceSheet.equity?.retainedEarnings ?? 0);
    }
    return 0;
  }

  /** Income-statement account line for analytics parity (optional). */
  static async fetchIncomeStatementAccountNet(
    profile: KpiFinancialProfile,
    periodStart: Date,
    periodEnd: Date,
    currencyId?: string
  ): Promise<number | null> {
    if (!profile.hardcoded) return null;
    const hc = profile.hardcoded;
    if (!["Revenue", "Income", "Expense"].includes(hc.accountType)) return null;

    const stmt = await IncomeStatementService.generateIncomeStatement({
      startDate: periodStart,
      endDate: periodEnd,
      ...(currencyId ? { currencyId } : {})
    });
    const sections = stmt?.sections || {};
    const section =
      hc.accountType === "Expense"
        ? sections.operatingExpenses || sections.expenses
        : sections.revenue;
    const accounts = section?.accounts || [];
    if (hc.accountNumber) {
      const matches = accounts.filter((a: any) => a.accountNo === hc.accountNumber);
      if (matches.length) {
        return matches.reduce(
          (s: number, a: any) => s + Number(a.netAmount ?? a.total ?? 0),
          0
        );
      }
    }
    return Number(section?.total ?? 0);
  }
}
