/**
 * GL account number ranges vs account type (same rules as ChartOfAccountsController).
 * 1xxx Assets, 2xxx Liabilities, 3xxx Equity, 4xxx Revenue, 5xxx Expenses.
 */

export const CHART_VALID_ACCOUNT_TYPES = [
  "Current Asset",
  "Fixed Asset",
  "Long-Term Asset",
  "Contra-Asset",
  "Current Liability",
  "Long-Term Liability",
  "Equity",
  "Revenue",
  "Expense",
  "Income",
] as const;

export const CHART_VALID_FINANCIAL_STATEMENTS = [
  "Balance Sheet",
  "Income Statement",
  "Cash Flow / Tracking",
  "Income Statement / Cash Flow",
] as const;

const ACCOUNT_TYPE_BY_RANGE: { [key: string]: string[] } = {
  "1": ["Current Asset", "Fixed Asset", "Long-Term Asset", "Contra-Asset"],
  "2": ["Current Liability", "Long-Term Liability"],
  "3": ["Equity"],
  "4": ["Revenue", "Income"],
  "5": ["Expense"],
};

const RANGE_LABEL: { [key: string]: string } = {
  "1": "1000s (Assets)",
  "2": "2000s (Liabilities)",
  "3": "3000s (Equity)",
  "4": "4000s (Revenue)",
  "5": "5000s (Expenses)",
};

export function validateChartAccountNumberForType(
  accountNo: string,
  accountType: string
): { valid: boolean; message?: string } {
  const trimmed = String(accountNo ?? "").trim();
  if (!trimmed) {
    return { valid: false, message: "Account number is required." };
  }

  const firstDigit = trimmed.charAt(0);

  if (!["1", "2", "3", "4", "5"].includes(firstDigit)) {
    return {
      valid: false,
      message: `Account ${trimmed} is outside valid ranges (account numbers must start with 1–5: 1xxx Assets, 2xxx Liabilities, 3xxx Equity, 4xxx Revenue, 5xxx Expenses).`,
    };
  }

  const validTypesForRange = ACCOUNT_TYPE_BY_RANGE[firstDigit];
  if (!validTypesForRange.includes(accountType)) {
    const expectedTypes = validTypesForRange.join(", ");
    const rangeDescription = RANGE_LABEL[firstDigit];
    return {
      valid: false,
      message: `Account ${trimmed} is in the ${rangeDescription} range, but account type "${accountType}" is not valid for that range (expected: ${expectedTypes}).`,
    };
  }

  return { valid: true };
}
