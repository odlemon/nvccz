// @ts-nocheck

export type ReportFormSchema = {
  reportType: string;
  fields: Array<{
    key: string;
    label: string;
    section: string;
    defaultValue: number;
  }>;
};

/**
 * Canonical line-item keys for manual entry.
 * These keys are derived from the master XLSX template sheets (the same structure shown in the screenshots).
 *
 * Rules:
 * - All numeric fields are optional; missing values default to 0.
 * - Totals/subtotals are computed in Excel; backend stores the entered line items.
 */
export const incomeStatementSchema: ReportFormSchema = {
  reportType: "INCOME_STATEMENTS",
  fields: [
    // Revenue
    { section: "Revenue", key: "grossSales", label: "Gross sales", defaultValue: 0 },
    { section: "Revenue", key: "returnsRefundsAndAllowances", label: "Returns, refunds and allowances", defaultValue: 0 },
    { section: "Revenue", key: "otherRevenue", label: "Other revenue", defaultValue: 0 },

    // Cost of goods sold
    { section: "Cost of goods sold", key: "goodsPurchased", label: "Goods purchased", defaultValue: 0 },
    { section: "Cost of goods sold", key: "materials", label: "Materials", defaultValue: 0 },
    { section: "Cost of goods sold", key: "labour", label: "Labour", defaultValue: 0 },
    { section: "Cost of goods sold", key: "overhead", label: "Overhead", defaultValue: 0 },

    // Operating expenses
    { section: "Operating expenses", key: "advertisingAndPromotion", label: "Advertising and promotion", defaultValue: 0 },
    { section: "Operating expenses", key: "badDebt", label: "Bad debt", defaultValue: 0 },
    { section: "Operating expenses", key: "bankServiceCharges", label: "Bank service charges", defaultValue: 0 },
    { section: "Operating expenses", key: "computerAndInternet", label: "Computer and internet", defaultValue: 0 },
    { section: "Operating expenses", key: "deliveryFreightExpense", label: "Delivery/freight expense", defaultValue: 0 },
    { section: "Operating expenses", key: "furnitureAndEquipment", label: "Furniture and equipment", defaultValue: 0 },
    { section: "Operating expenses", key: "insurance", label: "Insurance", defaultValue: 0 },
    { section: "Operating expenses", key: "maintenanceAndRepairs", label: "Maintenance and repairs", defaultValue: 0 },
    { section: "Operating expenses", key: "mileage", label: "Mileage", defaultValue: 0 },
    { section: "Operating expenses", key: "officeSupplies", label: "Office supplies", defaultValue: 0 },
    { section: "Operating expenses", key: "otherExpenses", label: "Other expenses", defaultValue: 0 },
    { section: "Operating expenses", key: "payrollProcessing", label: "Payroll processing", defaultValue: 0 },
    { section: "Operating expenses", key: "postageAndDelivery", label: "Postage and delivery", defaultValue: 0 },
    { section: "Operating expenses", key: "professionalServices", label: "Professional services", defaultValue: 0 },
    { section: "Operating expenses", key: "rentLease", label: "Rent/lease", defaultValue: 0 },
    { section: "Operating expenses", key: "researchAndDevelopment", label: "Research and development", defaultValue: 0 },
    { section: "Operating expenses", key: "salariesBenefitsAndWages", label: "Salaries, benefits and wages", defaultValue: 0 },
    { section: "Operating expenses", key: "travel", label: "Travel", defaultValue: 0 },
    { section: "Operating expenses", key: "utilitiesTelephoneExpenses", label: "Utilities/telephone expenses", defaultValue: 0 },
    { section: "Operating expenses", key: "depreciationAndAmortisation", label: "Depreciation and amortisation", defaultValue: 0 },

    // Non-operating income (loss) and expenses
    { section: "Non-operating", key: "nonOperatingRevenuesAndExpenses", label: "Non-operating revenues and expenses", defaultValue: 0 },
    { section: "Non-operating", key: "lessInterestExpense", label: "(Less) interest expense", defaultValue: 0 },
    { section: "Non-operating", key: "lessIncomeTaxExpense", label: "(Less) income tax expense", defaultValue: 0 },

    // Below-the-line items
    { section: "Below-the-line items", key: "incomeFromDiscontinuedOperations", label: "Income from discontinued operations", defaultValue: 0 },
    { section: "Below-the-line items", key: "effectOfAccountingChanges", label: "Effect of accounting changes", defaultValue: 0 },
    { section: "Below-the-line items", key: "extraordinaryItems", label: "Extraordinary items", defaultValue: 0 },
  ],
};

/**
 * Statement of Financial Position — one column-set (e.g. current year or prior year).
 * Template: `templates/financial-reports/statement_of_financial_position_template.(xlsx)`.
 * Comparative periods are stored as `{ currentPeriod: {...}, priorPeriod: {...} }` (same keys each side).
 * Subtotals / totals / ratio rows are Excel formulas and are not stored.
 */
export const statementOfFinancialPositionLineItemsSchema: ReportFormSchema = {
  reportType: "STATEMENT_OF_FINANCIAL_POSITION",
  fields: [
    // Current assets
    { section: "Current Assets", key: "cash", label: "Cash", defaultValue: 0 },
    { section: "Current Assets", key: "accountsReceivable", label: "Accounts receivable", defaultValue: 0 },
    { section: "Current Assets", key: "inventory", label: "Inventory", defaultValue: 0 },
    { section: "Current Assets", key: "prepaidExpenses", label: "Prepaid expenses", defaultValue: 0 },
    { section: "Current Assets", key: "shortTermInvestments", label: "Short-term investments", defaultValue: 0 },

    // Fixed (long-term) assets
    { section: "Fixed (Long-Term) Assets", key: "longTermInvestments", label: "Long-term investments", defaultValue: 0 },
    {
      section: "Fixed (Long-Term) Assets",
      key: "propertyPlantAndEquipment",
      label: "Property, plant, and equipment",
      defaultValue: 0,
    },
    {
      section: "Fixed (Long-Term) Assets",
      key: "lessAccumulatedDepreciation",
      label: "(Less accumulated depreciation)",
      defaultValue: 0,
    },
    { section: "Fixed (Long-Term) Assets", key: "intangibleAssets", label: "Intangible assets", defaultValue: 0 },

    // Other assets
    {
      section: "Other Assets",
      key: "deferredIncomeTaxAssets",
      label: "Deferred income tax",
      defaultValue: 0,
    },
    { section: "Other Assets", key: "otherAssets", label: "Other", defaultValue: 0 },

    // Current liabilities
    { section: "Current Liabilities", key: "accountsPayable", label: "Accounts payable", defaultValue: 0 },
    { section: "Current Liabilities", key: "shortTermLoans", label: "Short-term loans", defaultValue: 0 },
    { section: "Current Liabilities", key: "incomeTaxesPayable", label: "Income taxes payable", defaultValue: 0 },
    {
      section: "Current Liabilities",
      key: "accruedSalariesAndWages",
      label: "Accrued salaries and wages",
      defaultValue: 0,
    },
    { section: "Current Liabilities", key: "unearnedRevenue", label: "Unearned revenue", defaultValue: 0 },
    {
      section: "Current Liabilities",
      key: "currentPortionOfLongTermDebt",
      label: "Current portion of long-term debt",
      defaultValue: 0,
    },

    // Long-term liabilities
    { section: "Long-Term Liabilities", key: "longTermDebt", label: "Long-term debt", defaultValue: 0 },
    {
      section: "Long-Term Liabilities",
      key: "deferredIncomeTaxLiabilities",
      label: "Deferred income tax",
      defaultValue: 0,
    },
    { section: "Long-Term Liabilities", key: "otherLongTermLiabilities", label: "Other", defaultValue: 0 },

    // Owner's equity
    { section: "Owner's Equity", key: "ownersInvestment", label: "Owner's investment", defaultValue: 0 },
    { section: "Owner's Equity", key: "retainedEarnings", label: "Retained earnings", defaultValue: 0 },
    { section: "Owner's Equity", key: "otherOwnersEquity", label: "Other", defaultValue: 0 },
  ],
};

/**
 * Cash flow statement — single-period line items (template has one amount column + formula totals).
 * `forTheYearEnding` often matches an Excel date serial in the sheet (e.g. 43830); treat as a number or omit (0).
 */
export const cashflowStatementSchema: ReportFormSchema = {
  reportType: "CASHFLOW_STATEMENTS",
  fields: [
    { section: "Header", key: "forTheYearEnding", label: "For the Year Ending", defaultValue: 0 },
    { section: "Header", key: "cashAtBeginningOfYear", label: "Cash at Beginning of Year", defaultValue: 0 },

    { section: "Operations", key: "cashReceiptsCustomers", label: "Customers", defaultValue: 0 },
    { section: "Operations", key: "cashReceiptsOtherOperations", label: "Other Operations", defaultValue: 0 },
    { section: "Operations", key: "cashPaidInventoryPurchases", label: "Inventory purchases", defaultValue: 0 },
    {
      section: "Operations",
      key: "cashPaidGeneralOperatingAndAdministrativeExpenses",
      label: "General operating and administrative expenses",
      defaultValue: 0,
    },
    { section: "Operations", key: "cashPaidWageExpenses", label: "Wage expenses", defaultValue: 0 },
    { section: "Operations", key: "cashPaidInterest", label: "Interest", defaultValue: 0 },
    { section: "Operations", key: "cashPaidIncomeTaxes", label: "Income taxes", defaultValue: 0 },

    {
      section: "Investing Activities",
      key: "investingReceiptsSaleOfPropertyAndEquipment",
      label: "Sale of property and equipment",
      defaultValue: 0,
    },
    {
      section: "Investing Activities",
      key: "investingReceiptsCollectionOfPrincipalOnLoans",
      label: "Collection of principal on loans",
      defaultValue: 0,
    },
    {
      section: "Investing Activities",
      key: "investingReceiptsSaleOfInvestmentSecurities",
      label: "Sale of investment securities",
      defaultValue: 0,
    },
    {
      section: "Investing Activities",
      key: "investingPaidPurchaseOfPropertyAndEquipment",
      label: "Purchase of property and equipment",
      defaultValue: 0,
    },
    {
      section: "Investing Activities",
      key: "investingPaidMakingLoansToOtherEntities",
      label: "Making loans to other entities",
      defaultValue: 0,
    },
    {
      section: "Investing Activities",
      key: "investingPaidPurchaseOfInvestmentSecurities",
      label: "Purchase of investment securities",
      defaultValue: 0,
    },

    { section: "Financing Activities", key: "financingReceiptsIssuanceOfStock", label: "Issuance of stock", defaultValue: 0 },
    { section: "Financing Activities", key: "financingReceiptsBorrowing", label: "Borrowing", defaultValue: 0 },
    {
      section: "Financing Activities",
      key: "financingPaidRepurchaseOfStockTreasuryStock",
      label: "Repurchase of stock (treasury stock)",
      defaultValue: 0,
    },
    { section: "Financing Activities", key: "financingPaidRepaymentOfLoans", label: "Repayment of loans", defaultValue: 0 },
    { section: "Financing Activities", key: "financingPaidDividends", label: "Dividends", defaultValue: 0 },

    { section: "Footer", key: "cashAtEndOfYear", label: "Cash at End of Year", defaultValue: 0 },
  ],
};

export function canonicalFieldDefaults(schema: ReportFormSchema): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of schema.fields) out[f.key] = f.defaultValue ?? 0;
  return out;
}

