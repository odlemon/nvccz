import {
  isPayrollBudgetCategoryItem,
  isPayrollGlExpenseAccount,
  PAYROLL_BUDGET_LINE_NAME,
} from "../services/performanceDashboardPayrollBudget";

describe("performanceDashboardPayrollBudget", () => {
  test("isPayrollBudgetCategoryItem detects salary / payroll lines", () => {
    expect(
      isPayrollBudgetCategoryItem({
        category: "salary",
        description: "Salaries and Wages (Payroll)",
      })
    ).toBe(true);
    expect(
      isPayrollBudgetCategoryItem({
        category: "office",
        description: "Rent Expense",
      })
    ).toBe(false);
  });

  test("isPayrollGlExpenseAccount detects payroll GL accounts", () => {
    expect(isPayrollGlExpenseAccount({ accountNo: "5030", accountName: "Salaries and Wages" })).toBe(
      true
    );
    expect(isPayrollGlExpenseAccount({ accountNo: "5060", accountName: "Marketing Expense" })).toBe(
      false
    );
  });

  test("PAYROLL_BUDGET_LINE_NAME is stable for UI", () => {
    expect(PAYROLL_BUDGET_LINE_NAME).toContain("Payroll");
  });
});
