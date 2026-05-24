import {
  getKpiProgressJournalSkipReasonFromProfile,
  resolveKpiFinancialProfile
} from "../services/kpiFinancialAccountingRules";

function profileFor(code: string, overrides: Record<string, unknown> = {}) {
  return resolveKpiFinancialProfile({
    name: code,
    code,
    catalogDescription: null,
    catalogDepartmentName: null,
    accountType: null,
    accountNumber: null,
    journalEntryType: null,
    isFinancial: false,
    ...overrides
  });
}

describe("kpiFinancialAccountingRules", () => {
  test("TOTAL_REVENUE syncs P&L revenue and may post progress JEs to sales account", () => {
    const p = profileFor("TOTAL_REVENUE");
    expect(p.syncStrategy).toBe("pl_revenue_total");
    expect(p.postsProgressJournal).toBe(true);
    expect(p.accountNumber).toBe("4000");
  });

  test("NET_PROFIT syncs net profit without progress JEs", () => {
    const p = profileFor("NET_PROFIT");
    expect(p.syncStrategy).toBe("pl_net_profit");
    expect(p.postsProgressJournal).toBe(false);
    expect(
      getKpiProgressJournalSkipReasonFromProfile(p, {
        parentGoalId: null,
        formulaType: null,
        amount: 100
      })
    ).toMatch(/net profit/i);
  });

  test("PAYROLL_EXPENSE uses payroll_runs sync and skips progress JEs", () => {
    const p = profileFor("PAYROLL_EXPENSE");
    expect(p.syncStrategy).toBe("payroll_runs");
    expect(p.postsProgressJournal).toBe(false);
  });

  test("per-account revenue KPI uses pl_account_period and posts JEs", () => {
    const p = profileFor("DIVIDEND_INCOME");
    expect(p.syncStrategy).toBe("pl_account_period");
    expect(p.accountNumber).toBe("4100");
    expect(p.postsProgressJournal).toBe(true);
  });

  test("AR/AP balance-sheet account KPIs sync and post JEs", () => {
    const ar = profileFor("ACCOUNTS_RECEIVABLE_OUTSTANDING");
    expect(ar.syncStrategy).toBe("balance_sheet_account");
    expect(ar.postsProgressJournal).toBe(true);

    const ap = profileFor("ACCOUNTS_PAYABLE_OUTSTANDING");
    expect(ap.syncStrategy).toBe("balance_sheet_account");
    expect(ap.postsProgressJournal).toBe(true);
  });

  test("reporting-only KPIs sync but do not post progress JEs", () => {
    for (const code of [
      "CASH_BALANCE",
      "CASH_FLOW_NET",
      "TOTAL_LIABILITIES",
      "SHAREHOLDERS_EQUITY",
      "SUPPLIER_PAYMENTS_MADE"
    ]) {
      const p = profileFor(code);
      expect(p.isFinancial).toBe(true);
      expect(p.postsProgressJournal).toBe(false);
      expect(
        getKpiProgressJournalSkipReasonFromProfile(p, {
          parentGoalId: null,
          formulaType: null,
          amount: 50
        })
      ).not.toBeNull();
    }
  });

  test("CASH_BALANCE and CASH_FLOW_NET use balance_sheet_cash strategy", () => {
    expect(profileFor("CASH_BALANCE").syncStrategy).toBe("balance_sheet_cash");
    expect(profileFor("CASH_FLOW_NET").syncStrategy).toBe("balance_sheet_cash");
  });

  test("sub-goals never post progress JEs", () => {
    const p = profileFor("MARKETING_EXPENSE");
    expect(
      getKpiProgressJournalSkipReasonFromProfile(p, {
        parentGoalId: "parent-1",
        formulaType: null,
        amount: 10
      })
    ).toMatch(/sub-goal/i);
  });
});
