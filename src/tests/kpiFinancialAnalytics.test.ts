import { resolveKpiFinancialProfile } from "../services/kpiFinancialAccountingRules";

describe("KPI analytics GL profile routing", () => {
  test("Operating Expenses uses aggregate P&L expense total", () => {
    const profile = resolveKpiFinancialProfile({
      name: "Operating Expenses",
      code: "OPERATING_EXPENSES",
      catalogDescription: null,
      catalogDepartmentName: null,
      accountType: "Expense",
      accountNumber: "5090",
      journalEntryType: "Debit",
      isFinancial: true
    });
    expect(profile.syncStrategy).toBe("pl_expense_total");
  });

  test("Marketing Expense uses per-account period net, not aggregate expense total", () => {
    const profile = resolveKpiFinancialProfile({
      name: "Marketing Expense",
      code: "MARKETING_EXPENSE",
      catalogDescription: null,
      catalogDepartmentName: null,
      accountType: "Expense",
      accountNumber: "5060",
      journalEntryType: "Debit",
      isFinancial: true
    });
    expect(profile.syncStrategy).toBe("pl_account_period");
    expect(profile.accountNumber).toBe("5060");
  });

  test("Payroll Expense uses payroll runs or salaries account", () => {
    const profile = resolveKpiFinancialProfile({
      name: "Payroll Expense",
      code: "PAYROLL_EXPENSE",
      catalogDescription: null,
      catalogDepartmentName: null,
      accountType: "Expense",
      accountNumber: "5030",
      journalEntryType: "Debit",
      isFinancial: true
    });
    expect(profile.syncStrategy).toBe("payroll_runs");
    expect(profile.accountNumber).toBe("5030");
  });
});
