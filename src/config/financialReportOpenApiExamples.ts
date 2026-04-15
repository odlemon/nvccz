import {
  canonicalFieldDefaults,
  cashflowStatementSchema,
  incomeStatementSchema,
  statementOfFinancialPositionLineItemsSchema,
} from "./financialReportFormSchemas";

/** Line-item map for income statement draft `data` (canonical template keys). */
export const OPENAPI_INCOME_STATEMENT_DATA_EXAMPLE: Record<string, number> = {
  ...canonicalFieldDefaults(incomeStatementSchema),
  grossSales: 1_250_000,
  returnsRefundsAndAllowances: 12_500,
  otherRevenue: 8_200,
  goodsPurchased: 420_000,
  materials: 95_000,
  labour: 180_000,
  overhead: 44_000,
  advertisingAndPromotion: 22_000,
  salariesBenefitsAndWages: 310_000,
  rentLease: 48_000,
  utilitiesTelephoneExpenses: 6_200,
  professionalServices: 14_500,
  depreciationAndAmortisation: 18_000,
  lessInterestExpense: 15_000,
  lessIncomeTaxExpense: 28_000,
  nonOperatingRevenuesAndExpenses: -3_200,
};

const bsZero = canonicalFieldDefaults(statementOfFinancialPositionLineItemsSchema);

/** Balance sheet `data`: comparative `currentPeriod` / `priorPeriod` line items. */
export const OPENAPI_BALANCE_SHEET_DATA_EXAMPLE: {
  currentPeriod: Record<string, number>;
  priorPeriod: Record<string, number>;
} = {
  currentPeriod: {
    ...bsZero,
    cash: 185_000,
    accountsReceivable: 95_000,
    inventory: 72_000,
    prepaidExpenses: 11_000,
    accountsPayable: 42_000,
    shortTermLoans: 25_000,
    longTermDebt: 180_000,
    retainedEarnings: 210_000,
    ownersInvestment: 500_000,
  },
  priorPeriod: {
    ...bsZero,
    cash: 162_000,
    accountsReceivable: 88_000,
    inventory: 69_000,
    prepaidExpenses: 10_200,
    accountsPayable: 39_000,
    shortTermLoans: 28_000,
    longTermDebt: 190_000,
    retainedEarnings: 198_000,
    ownersInvestment: 500_000,
  },
};

/** Cash flow draft `data` (single-period template keys). */
export const OPENAPI_CASHFLOW_DATA_EXAMPLE: Record<string, number> = {
  ...canonicalFieldDefaults(cashflowStatementSchema),
  cashAtBeginningOfYear: 140_000,
  cashReceiptsCustomers: 1_180_000,
  cashReceiptsOtherOperations: 4_500,
  cashPaidInventoryPurchases: 400_000,
  cashPaidGeneralOperatingAndAdministrativeExpenses: 112_000,
  cashPaidWageExpenses: 305_000,
  cashPaidInterest: 15_000,
  cashPaidIncomeTaxes: 26_000,
  investingPaidPurchaseOfPropertyAndEquipment: 48_000,
  financingPaidRepaymentOfLoans: 20_000,
  financingPaidDividends: 10_000,
  cashAtEndOfYear: 185_000,
};

export const OPENAPI_INCOME_STATEMENT_DRAFT_BODY_EXAMPLE = {
  reportingPeriod: "2025-03-31",
  periodType: "QUARTERLY",
  periodStart: "2025-01-01",
  periodEnd: "2025-03-31",
  title: "Income statement — Q1 2025",
  description: "Draft from portal; attach XLSX via POST .../file?reportId=",
  templateVersion: "2025.1",
  data: OPENAPI_INCOME_STATEMENT_DATA_EXAMPLE,
};

export const OPENAPI_BALANCE_SHEET_DRAFT_BODY_EXAMPLE = {
  reportingPeriod: "2025-03-31",
  periodType: "QUARTERLY",
  periodStart: "2025-01-01",
  periodEnd: "2025-03-31",
  title: "Statement of financial position — Q1 2025",
  description: "Comparative current vs prior period",
  templateVersion: "2025.1",
  data: OPENAPI_BALANCE_SHEET_DATA_EXAMPLE,
};

export const OPENAPI_CASHFLOW_DRAFT_BODY_EXAMPLE = {
  reportingPeriod: "2025-03-31",
  periodType: "QUARTERLY",
  periodStart: "2025-01-01",
  periodEnd: "2025-03-31",
  title: "Cash flow statement — Q1 2025",
  description: "Indirect-style line items per template",
  templateVersion: "2025.1",
  data: OPENAPI_CASHFLOW_DATA_EXAMPLE,
};
