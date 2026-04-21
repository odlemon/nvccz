// @ts-nocheck

export interface CashFlowParams {
  startDate: Date;
  endDate: Date;
  currencyId?: string;
}

export interface CashFlowTransaction {
  id: string;
  date: string;
  reference: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  source: string; // "CASHBOOK", "INVOICE", "EXPENSE", "MANUAL_ENTRY", etc.
  journalEntry: any; // Full journal entry details (referenceNumber, description, transactionDate, status, etc.)
  sourceTransaction: any; // Actual transaction details (cashbook entry, invoice, expense, etc.)
  journalEntryId: string;
  journalEntryStatus: string;
}

export interface CashFlowAccount {
  accountId: string;
  accountNo: string;
  accountName: string;
  accountType: string;
  financialStatement: string;
  totalDebits: number;
  totalCredits: number;
  netAmount: number;
  cashFlowCategory: string;
  transactions: CashFlowTransaction[]; // Transaction breakdown
}

/** One row in operating / investing / financing (direct-method line items + drill-down). */
export interface CashFlowStatementLineItem {
  accountId: string;
  accountNo: string;
  accountName: string;
  accountType: string;
  amount: number;
  netAmount: number;
  totalDebits: number;
  totalCredits: number;
  transactions: CashFlowTransaction[];
}

export interface CashFlowActivity {
  total: number;
  description: string;
  /** Row-level detail (preferred). */
  lineItems: CashFlowStatementLineItem[];
  /**
   * Same array as `lineItems`. Older frontends keyed off `accounts`; without this they show
   * "No activities" while still displaying section `total` from the same object.
   */
  accounts: CashFlowStatementLineItem[];
  accountCount?: number;
}

export interface CashFlowLine {
  label: string;
  amount: number;
  accounts?: CashFlowAccount[];
}

export interface CashFlowPresentationSection {
  label: string;
  cashReceipts?: CashFlowLine[];
  cashPayments?: CashFlowLine[];
  additions?: CashFlowLine[];
  adjustments?: CashFlowLine[];
  total: number;
}

export interface CashFlowStatement {
  period: {
    startDate: Date;
    endDate: Date;
  };
  operatingActivities: CashFlowActivity;
  investingActivities: CashFlowActivity;
  financingActivities: CashFlowActivity;
  /**
   * Net increase (decrease) in cash for the period from GL cash accounts: ending − beginning.
   * Always reconciles: beginningCashBalance + netCashFlow === endingCashBalance.
   */
  netCashFlow: number;
  /** Operating + investing + financing section totals (approximate; may differ from netCashFlow). */
  activityBasedNetCashFlow: number;
  beginningCashBalance: number;
  endingCashBalance: number;
  currency: {
    id: string;
    code: string;
    name: string;
  };
  generatedAt: Date;
  presentation?: {
    operating: CashFlowPresentationSection;
    investing: CashFlowPresentationSection;
    financing: CashFlowPresentationSection;
    netChangeInCash: number;
    beginningCashBalance: number;
    endingCashBalance: number;
  };
} 