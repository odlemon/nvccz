// @ts-nocheck
/**
 * Pure KPI math from approved snapshot shapes (no DB). See InvestmentMonitoringKpiService for persistence.
 */
export type MonitoringKpiValues = Record<string, number | null>;
export type OperationalKpiPlaceholders = Record<string, null>;

function toNum(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeDiv(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return a / b;
}

export function parseMonitoringSnapshot(raw: any): any {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

export function computeMonitoringKpisFromInputs(args: {
  incomeStatement?: Record<string, number> | null;
  balanceSheet?: { currentPeriod?: Record<string, number>; priorPeriod?: Record<string, number> } | null;
  cashFlow?: Record<string, number> | null;
  priorPeriodIncomeStatement?: Record<string, number> | null;
  monthsInPeriod: number;
}): { financial: MonitoringKpiValues; operational: OperationalKpiPlaceholders } {
  const months = Math.max(1, Number(args.monthsInPeriod) || 1);
  const is = args.incomeStatement || null;
  const cp = args.balanceSheet?.currentPeriod || null;
  const cf = args.cashFlow || null;
  const priorIs = args.priorPeriodIncomeStatement || null;

  const financial: MonitoringKpiValues = {};
  const operational: OperationalKpiPlaceholders = {
    CUSTOMER_ACQUISITION_COST: null,
    CUSTOMER_LIFETIME_VALUE: null,
    LTV_CAC_RATIO: null,
    CHURN_RATE: null,
    MONTHLY_RECURRING_REVENUE: null,
    NET_DOLLAR_RETENTION: null,
    UNIT_CONTRIBUTION: null,
    CONVERSION_RATE: null,
    CUSTOMER_RETENTION_RATE: null,
  };

  let revenue = 0;
  let cogs = 0;
  let grossProfit = 0;
  let totalOperatingExpenses = 0;
  let operatingIncome = 0;
  let netIncome = 0;
  let ebitda = 0;
  let interestExpense = 0;
  let taxExpense = 0;

  if (is && typeof is === "object") {
    revenue =
      toNum(is.grossSales) -
      toNum(is.returnsRefundsAndAllowances) +
      toNum(is.otherRevenue);
    cogs =
      toNum(is.goodsPurchased) +
      toNum(is.materials) +
      toNum(is.labour) +
      toNum(is.overhead);
    grossProfit = revenue - cogs;

    totalOperatingExpenses =
      toNum(is.advertisingAndPromotion) +
      toNum(is.badDebt) +
      toNum(is.bankServiceCharges) +
      toNum(is.computerAndInternet) +
      toNum(is.deliveryFreightExpense) +
      toNum(is.furnitureAndEquipment) +
      toNum(is.insurance) +
      toNum(is.maintenanceAndRepairs) +
      toNum(is.mileage) +
      toNum(is.officeSupplies) +
      toNum(is.otherExpenses) +
      toNum(is.payrollProcessing) +
      toNum(is.postageAndDelivery) +
      toNum(is.professionalServices) +
      toNum(is.rentLease) +
      toNum(is.researchAndDevelopment) +
      toNum(is.salariesBenefitsAndWages) +
      toNum(is.travel) +
      toNum(is.utilitiesTelephoneExpenses) +
      toNum(is.depreciationAndAmortisation);

    operatingIncome = grossProfit - totalOperatingExpenses;
    interestExpense = toNum(is.lessInterestExpense);
    taxExpense = toNum(is.lessIncomeTaxExpense);
    const nonOp = toNum(is.nonOperatingRevenuesAndExpenses);
    const belowLine =
      toNum(is.incomeFromDiscontinuedOperations) +
      toNum(is.effectOfAccountingChanges) +
      toNum(is.extraordinaryItems);
    const preTax = operatingIncome + nonOp - interestExpense;
    netIncome = preTax - taxExpense + belowLine;
    const depreciationAmort = toNum(is.depreciationAndAmortisation);
    ebitda = netIncome + taxExpense + interestExpense + depreciationAmort;

    financial.REVENUE = revenue;
    financial.COGS = cogs;
    financial.GROSS_PROFIT = grossProfit;
    financial.OPERATING_PROFIT = operatingIncome;
    financial.EBITDA = ebitda;
    financial.NET_PROFIT_DERIVED = netIncome;
    financial.GROSS_PROFIT_MARGIN = safeDiv(grossProfit, revenue);
    financial.NET_PROFIT_MARGIN = safeDiv(netIncome, revenue);
    financial.EBITDA_MARGIN = safeDiv(ebitda, revenue);
  } else {
    financial.REVENUE = null;
    financial.COGS = null;
    financial.GROSS_PROFIT = null;
    financial.OPERATING_PROFIT = null;
    financial.EBITDA = null;
    financial.NET_PROFIT_DERIVED = null;
    financial.GROSS_PROFIT_MARGIN = null;
    financial.NET_PROFIT_MARGIN = null;
    financial.EBITDA_MARGIN = null;
  }

  let totalAssets = 0;
  let currentAssets = 0;
  let currentLiabilities = 0;
  let totalLiabilities = 0;
  let equity = 0;
  let inventory = 0;
  let cashBs = 0;
  let ar = 0;

  if (cp && typeof cp === "object") {
    cashBs = toNum(cp.cash);
    ar = toNum(cp.accountsReceivable);
    inventory = toNum(cp.inventory);
    currentAssets =
      cashBs +
      ar +
      inventory +
      toNum(cp.prepaidExpenses) +
      toNum(cp.shortTermInvestments);
    const fixedAssets =
      toNum(cp.longTermInvestments) +
      toNum(cp.propertyPlantAndEquipment) +
      toNum(cp.lessAccumulatedDepreciation) +
      toNum(cp.intangibleAssets);
    const otherAssets = toNum(cp.deferredIncomeTaxAssets) + toNum(cp.otherAssets);
    totalAssets = currentAssets + fixedAssets + otherAssets;

    currentLiabilities =
      toNum(cp.accountsPayable) +
      toNum(cp.shortTermLoans) +
      toNum(cp.incomeTaxesPayable) +
      toNum(cp.accruedSalariesAndWages) +
      toNum(cp.unearnedRevenue) +
      toNum(cp.currentPortionOfLongTermDebt);
    const longTermLiab =
      toNum(cp.longTermDebt) +
      toNum(cp.deferredIncomeTaxLiabilities) +
      toNum(cp.otherLongTermLiabilities);
    equity =
      toNum(cp.ownersInvestment) + toNum(cp.retainedEarnings) + toNum(cp.otherOwnersEquity);
    totalLiabilities = currentLiabilities + longTermLiab;

    financial.TOTAL_ASSETS = totalAssets;
    financial.TOTAL_LIABILITIES = totalLiabilities;
    financial.EQUITY = equity;
    financial.WORKING_CAPITAL = currentAssets - currentLiabilities;
    financial.CURRENT_RATIO = safeDiv(currentAssets, currentLiabilities);
    financial.QUICK_RATIO = safeDiv(cashBs + ar, currentLiabilities);
    financial.DEBT_TO_EQUITY = safeDiv(totalLiabilities, equity);
  } else {
    financial.TOTAL_ASSETS = null;
    financial.TOTAL_LIABILITIES = null;
    financial.EQUITY = null;
    financial.WORKING_CAPITAL = null;
    financial.CURRENT_RATIO = null;
    financial.QUICK_RATIO = null;
    financial.DEBT_TO_EQUITY = null;
  }

  financial.INTEREST_COVERAGE =
    is && interestExpense > 0 ? safeDiv(operatingIncome, interestExpense) : null;

  financial.RETURN_ON_ASSETS =
    is && cp && totalAssets > 0 ? safeDiv(netIncome, totalAssets) : null;

  financial.RETURN_ON_EQUITY =
    is && cp && equity !== 0 ? safeDiv(netIncome, equity) : null;

  let netCashOps = 0;

  if (cf && typeof cf === "object") {
    const receiptsOps = toNum(cf.cashReceiptsCustomers) + toNum(cf.cashReceiptsOtherOperations);
    const paidOps =
      toNum(cf.cashPaidInventoryPurchases) +
      toNum(cf.cashPaidGeneralOperatingAndAdministrativeExpenses) +
      toNum(cf.cashPaidWageExpenses) +
      toNum(cf.cashPaidInterest) +
      toNum(cf.cashPaidIncomeTaxes);
    netCashOps = receiptsOps - paidOps;

    const invR =
      toNum(cf.investingReceiptsSaleOfPropertyAndEquipment) +
      toNum(cf.investingReceiptsCollectionOfPrincipalOnLoans) +
      toNum(cf.investingReceiptsSaleOfInvestmentSecurities);
    const invP =
      toNum(cf.investingPaidPurchaseOfPropertyAndEquipment) +
      toNum(cf.investingPaidMakingLoansToOtherEntities) +
      toNum(cf.investingPaidPurchaseOfInvestmentSecurities);
    const netInv = invR - invP;

    const finR = toNum(cf.financingReceiptsIssuanceOfStock) + toNum(cf.financingReceiptsBorrowing);
    const finP =
      toNum(cf.financingPaidRepurchaseOfStockTreasuryStock) +
      toNum(cf.financingPaidRepaymentOfLoans) +
      toNum(cf.financingPaidDividends);
    const netFin = finR - finP;

    financial.OPERATING_CASH_FLOW = netCashOps;
    financial.NET_CASH_FLOW_INVESTING = netInv;
    financial.NET_CASH_FLOW_FINANCING = netFin;
    financial.NET_CHANGE_IN_CASH = netCashOps + netInv + netFin;

    const cashEnd = toNum(cf.cashAtEndOfYear);
    const cashForRunway = cashEnd > 0 ? cashEnd : cashBs;
    const monthlyBurn = netCashOps < 0 ? -netCashOps / months : 0;
    financial.BURN_RATE_MONTHLY = monthlyBurn > 0 ? monthlyBurn : null;
    financial.CASH_RUNWAY_MONTHS =
      monthlyBurn > 0 && cashForRunway > 0 ? cashForRunway / monthlyBurn : null;
    const revForRatio = is ? revenue : 0;
    financial.CASH_CONVERSION_RATIO = revForRatio > 0 ? safeDiv(netCashOps, revForRatio) : null;
  } else {
    financial.OPERATING_CASH_FLOW = null;
    financial.NET_CASH_FLOW_INVESTING = null;
    financial.NET_CASH_FLOW_FINANCING = null;
    financial.NET_CHANGE_IN_CASH = null;
    financial.BURN_RATE_MONTHLY = null;
    financial.CASH_RUNWAY_MONTHS = null;
    financial.CASH_CONVERSION_RATIO = null;
  }

  if (is && priorIs && typeof priorIs === "object") {
    const priorRev =
      toNum(priorIs.grossSales) -
      toNum(priorIs.returnsRefundsAndAllowances) +
      toNum(priorIs.otherRevenue);
    financial.REVENUE_GROWTH_RATE = priorRev !== 0 ? safeDiv(revenue - priorRev, priorRev) : null;
  } else {
    financial.REVENUE_GROWTH_RATE = null;
  }

  if (is && cp && inventory > 0 && cogs > 0) {
    financial.INVENTORY_TURNOVER = safeDiv(cogs, inventory);
  } else {
    financial.INVENTORY_TURNOVER = null;
  }

  roundFinancialKpis(financial);

  return { financial, operational };
}

function roundFinancialKpis(f: MonitoringKpiValues) {
  for (const k of Object.keys(f)) {
    const v = f[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "number" && Number.isFinite(v)) {
      f[k] = Math.round(v * 1000000) / 1000000;
    }
  }
}

export function monthsBetweenPeriodStartEnd(start: Date, end: Date): number {
  const a = start.getTime();
  const b = end.getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1;
  const days = (b - a) / (86400 * 1000);
  return Math.max(1, Math.round(days / 30) || 1);
}
