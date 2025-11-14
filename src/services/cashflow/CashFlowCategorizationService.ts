// @ts-nocheck
import { CashFlowAccount } from "./types";

export class CashFlowCategorizationService {
  /**
   * Categorize accounts by cash flow activity
   * NOTE: Cash and bank accounts are excluded from all activities - they are the result, not a source
   */
  static categorizeAccountsByCashFlow(accounts: CashFlowAccount[]): CashFlowAccount[] {
    for (const account of accounts) {
      const accountName = account.accountName.toLowerCase();
      const accountNo = account.accountNo;

      // Check if this is a cash/bank account - these should NOT appear in any activity section
      const isCashAccount = accountName.includes("cash") || 
                            accountName.includes("bank") ||
                            (account.accountType === "Current Asset" && accountNo >= "1000" && accountNo < "1100");

      if (isCashAccount) {
        // Mark cash accounts with a special category so they can be excluded from activities
        account.cashFlowCategory = "CASH_ACCOUNT";
        continue; // Skip categorization for cash accounts
      }

      // Operating Activities
      if (this.isOperatingActivity(accountName, accountNo, account.accountType)) {
        account.cashFlowCategory = "Operating";
      }
      // Investing Activities
      else if (this.isInvestingActivity(accountName, accountNo, account.accountType)) {
        account.cashFlowCategory = "Investing";
      }
      // Financing Activities
      else if (this.isFinancingActivity(accountName, accountNo, account.accountType)) {
        account.cashFlowCategory = "Financing";
      }
      // Default to Operating for income statement accounts
      else if (account.financialStatement === "Income Statement") {
        account.cashFlowCategory = "Operating";
      }
      // Default to Operating for other accounts
      else {
        account.cashFlowCategory = "Operating";
      }
    }

    return accounts;
  }

  /**
   * Determine if account is operating activity
   */
  private static isOperatingActivity(accountName: string, accountNo: string, accountType: string): boolean {
    // Revenue and expense accounts are operating activities
    if (accountType === "Revenue" || accountType === "Expense") {
      return true;
    }

    // Current assets and liabilities (except cash and loans)
    const operatingKeywords = [
      "accounts receivable", "accounts payable", "inventory", "prepaid", "accrued",
      "sales", "revenue", "income", "expense", "cost", "wages", "salary", "rent",
      "utilities", "insurance", "maintenance", "office", "travel", "advertising",
      "management fees", "operating", "administrative", "selling"
    ];

    return operatingKeywords.some(keyword => accountName.includes(keyword));
  }

  /**
   * Determine if account is investing activity
   */
  private static isInvestingActivity(accountName: string, accountNo: string, accountType: string): boolean {
    // Fixed assets and investments
    const investingKeywords = [
      "equipment", "machinery", "vehicle", "building", "property", "land",
      "investment", "securities", "bonds", "stocks", "fixed asset", "capital asset",
      "depreciation", "accumulated depreciation", "amortization"
    ];

    return investingKeywords.some(keyword => accountName.includes(keyword));
  }

  /**
   * Determine if account is financing activity
   * NOTE: Cash and bank accounts are NOT financing activities - they are the result of cash flows
   */
  private static isFinancingActivity(accountName: string, accountNo: string, accountType: string): boolean {
    // Loans, equity (but NOT cash/bank accounts)
    const financingKeywords = [
      "loan", "mortgage", "bank loan", "long term debt", "short term debt",
      "capital", "equity", "shareholder", "dividend",
      "drawing", "withdrawal", "contribution"
    ];

    // Explicitly exclude cash and bank accounts (they should not be in any activity section)
    const isCashAccount = accountName.includes("cash") || 
                          accountName.includes("bank") ||
                          (accountType === "Current Asset" && accountNo >= "1000" && accountNo < "1100");

    if (isCashAccount) {
      return false; // Cash accounts should not be in financing activities
    }

    return financingKeywords.some(keyword => accountName.includes(keyword));
  }
} 