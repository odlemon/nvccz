// @ts-nocheck

export interface CashFlowParams {
  startDate: Date;
  endDate: Date;
  currencyId?: string;
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
}

export interface CashFlowActivity {
  accounts: CashFlowAccount[];
  total: number;
  description: string;
}

export interface CashFlowStatement {
  period: {
    startDate: Date;
    endDate: Date;
  };
  operatingActivities: CashFlowActivity;
  investingActivities: CashFlowActivity;
  financingActivities: CashFlowActivity;
  netCashFlow: number;
  beginningCashBalance: number;
  endingCashBalance: number;
  currency: {
    id: string;
    code: string;
    name: string;
  };
  generatedAt: Date;
} 