/**
 * Maps canonical income / SOFP / cash-flow line items to financial KPIs and merges operational inputs.
 * Pure utilities — no DB.
 */

import { canonicalFieldDefaults, incomeStatementSchema, statementOfFinancialPositionLineItemsSchema } from "../config/financialReportFormSchemas";
import type { OperationalKpiFieldKey } from "../config/operationalKpiFieldSchema";

function n(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const x = Number(String(v).trim());
  return Number.isFinite(x) ? x : 0;
}

function safeDiv(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return a / b;
}

const INCOME_OP_EX_KEYS = incomeStatementSchema.fields
  .filter((f) => f.section === "Operating expenses")
  .map((f) => f.key);

export function monthsInReportingWindow(periodStart: string | Date, periodEnd: string | Date): number {
  const s = new Date(periodStart);
  const e = new Date(periodEnd);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 1;
  const dayMs = 86400000;
  const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / dayMs) + 1);
  return Math.max(1, days / 30);
}

export function totalsFromIncomeLineItems(lineItems: Record<string, unknown> | null | undefined): {
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  depreciationAndAmortisation: number;
  interestExpense: number;
  incomeTaxExpense: number;
  nonOperating: number;
  belowTheLine: number;
  operatingIncome: number;
  ebitda: number;
  netIncomeApprox: number;
  salesMarketingProxy: number;
} {
  const d = lineItems && typeof lineItems === "object" ? lineItems : {};
  const revenue = n(d.grossSales) - n(d.returnsRefundsAndAllowances) + n(d.otherRevenue);
  const cogs = n(d.goodsPurchased) + n(d.materials) + n(d.labour) + n(d.overhead);
  const grossProfit = revenue - cogs;
  let operatingExpenses = 0;
  for (const k of INCOME_OP_EX_KEYS) {
    operatingExpenses += n(d[k]);
  }
  const depreciationAndAmortisation = n(d.depreciationAndAmortisation);
  const operatingIncome = grossProfit - operatingExpenses;
  const ebitda = operatingIncome + depreciationAndAmortisation;
  const interestExpense = n(d.lessInterestExpense);
  const incomeTaxExpense = n(d.lessIncomeTaxExpense);
  const nonOperating = n(d.nonOperatingRevenuesAndExpenses);
  const belowTheLine =
    n(d.incomeFromDiscontinuedOperations) + n(d.effectOfAccountingChanges) + n(d.extraordinaryItems);
  const netIncomeApprox = operatingIncome + nonOperating - interestExpense - incometaxStrict(incomeTaxExpense) + belowTheLine;
  const salesMarketingProxy = n(d.advertisingAndPromotion) + n(d.researchAndDevelopment);
  return {
    revenue,
    cogs,
    grossProfit,
    operatingExpenses,
    depreciationAndAmortisation,
    interestExpense,
    incomeTaxExpense,
    salesMarketingProxy,
    nonOperating,
    belowTheLine,
    operatingIncome,
    ebitda,
    netIncomeApprox: netIncomeApprox,
  };
}

/** Tax line is "less" expense — treat stored positive number as expense magnitude */
function incometaxStrict(t: number): number {
  return Math.abs(t);
}

export function totalsFromSofpCurrent(current: Record<string, unknown> | null | undefined): {
  cash: number;
  accountsReceivable: number;
  inventory: number;
  currentAssets: number;
  currentLiabilities: number;
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
} {
  const defaults = canonicalFieldDefaults(statementOfFinancialPositionLineItemsSchema);
  const s = current && typeof current === "object" ? current : defaults;
  const cash = n(s.cash);
  const accountsReceivable = n(s.accountsReceivable);
  const inventory = n(s.inventory);
  const currentAssets =
    cash +
    accountsReceivable +
    inventory +
    n(s.prepaidExpenses) +
    n(s.shortTermInvestments);
  const currentLiabilities =
    n(s.accountsPayable) +
    n(s.shortTermLoans) +
    n(s.incomeTaxesPayable) +
    n(s.accruedSalariesAndWages) +
    n(s.unearnedRevenue) +
    n(s.currentPortionOfLongTermDebt);
  const longTermAndOtherLiab =
    n(s.longTermDebt) + n(s.deferredIncomeTaxLiabilities) + n(s.otherLongTermLiabilities);
  const totalLiabilities = currentLiabilities + longTermAndOtherLiab;
  const fixedAssets =
    n(s.longTermInvestments) +
    n(s.propertyPlantAndEquipment) +
    n(s.lessAccumulatedDepreciation) +
    n(s.intangibleAssets);
  const otherAssets = n(s.deferredIncomeTaxAssets) + n(s.otherAssets);
  const totalAssets = currentAssets + fixedAssets + otherAssets;
  const equity = n(s.ownersInvestment) + n(s.retainedEarnings) + n(s.otherOwnersEquity);
  return {
    cash,
    accountsReceivable,
    inventory,
    currentAssets,
    currentLiabilities,
    totalAssets,
    totalLiabilities,
    equity,
  };
}

export function totalsFromCashflowLineItems(cf: Record<string, unknown> | null | undefined): {
  cashBeginning: number;
  cashEnding: number;
  operatingReceipts: number;
  operatingPayments: number;
  operatingNetApprox: number;
} {
  const d = cf && typeof cf === "object" ? cf : {};
  const rec = n(d.cashReceiptsCustomers) + n(d.cashReceiptsOtherOperations);
  const pay =
    n(d.cashPaidInventoryPurchases) +
    n(d.cashPaidGeneralOperatingAndAdministrativeExpenses) +
    n(d.cashPaidWageExpenses) +
    n(d.cashPaidInterest) +
    n(d.cashPaidIncomeTaxes);
  return {
    cashBeginning: n(d.cashAtBeginningOfYear),
    cashEnding: n(d.cashAtEndOfYear),
    operatingReceipts: rec,
    operatingPayments: pay,
    operatingNetApprox: rec - pay,
  };
}

/** Parsed upload shape (CSV/XLSX) — partial */
export function extractIncomeFromParsedReport(parsed: unknown): Partial<ReturnType<typeof totalsFromIncomeLineItems>> | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (typeof p.totalRevenue === "number") {
    return {
      revenue: p.totalRevenue,
      cogs: n(p.costOfGoodsSold),
      grossProfit: n(p.grossProfit),
      operatingExpenses: n(p.operatingExpenses),
      depreciationAndAmortisation: 0,
      interestExpense: n(p.otherExpenses),
      operatingIncome: n(p.grossProfit) - n(p.operatingExpenses),
      ebitda: n(p.grossProfit) - n(p.operatingExpenses),
      netIncomeApprox: n(p.netIncome),
      salesMarketingProxy: 0,
      incomeTaxExpense: 0,
      nonOperating: n(p.otherIncome),
      belowTheLine: 0,
    };
  }
  const years = p.years as string[] | undefined;
  const totalNetRevenue = p.totalNetRevenue as Record<string, number> | undefined;
  const netIncome = p.netIncome as Record<string, number> | undefined;
  if (years?.length && totalNetRevenue) {
    const y = years[0];
    return {
      revenue: n(totalNetRevenue[y]),
      netIncomeApprox: n(netIncome?.[y]),
      cogs: 0,
      grossProfit: 0,
      operatingExpenses: 0,
      depreciationAndAmortisation: 0,
      interestExpense: 0,
      operatingIncome: 0,
      ebitda: 0,
      salesMarketingProxy: 0,
      incomeTaxExpense: 0,
      nonOperating: 0,
      belowTheLine: 0,
    };
  }
  return null;
}

export function extractSofpFromParsedReport(parsed: unknown): Partial<ReturnType<typeof totalsFromSofpCurrent>> | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (typeof p.currentAssets === "number" && typeof p.totalAssets === "number") {
    return {
      currentAssets: n(p.currentAssets),
      currentLiabilities: n(p.currentLiabilities),
      totalAssets: n(p.totalAssets),
      totalLiabilities: n(p.totalLiabilities),
      equity: n(p.shareholdersEquity),
      cash: n(p.cash),
      accountsReceivable: n(p.accountsReceivable),
      inventory: n(p.inventory),
    };
  }
  const ownerEquity = p.ownerEquity as { total?: number } | undefined;
  if (ownerEquity && typeof ownerEquity.total === "number") {
    return {
      equity: ownerEquity.total,
      totalLiabilities: n(p.totalLongTermLiabilities),
      totalAssets: 0,
      currentAssets: 0,
      currentLiabilities: 0,
      cash: 0,
      accountsReceivable: 0,
      inventory: 0,
    };
  }
  return null;
}

export function extractCashflowFromParsedReport(parsed: unknown): Partial<ReturnType<typeof totalsFromCashflowLineItems>> | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (typeof p.netCashFlow === "number" || typeof p.netIncrease === "number") {
    const ops = p.operations as { net?: number } | undefined;
    return {
      operatingNetApprox: n(p.cashFromOperating ?? ops?.net),
      cashEnding: n(p.endingCashBalance ?? p.endingBalance),
      cashBeginning: n(p.startingCashBalance),
      operatingReceipts: 0,
      operatingPayments: 0,
    };
  }
  return null;
}

export type OperationalInput = Partial<Record<OperationalKpiFieldKey, number>>;

export interface DerivedKpiBundle {
  financial: Record<string, number | null>;
  operationalDerived: Record<string, number | null>;
  missing: string[];
  formulasVersion: number;
}

export function computeDerivedKpis(args: {
  incomeLineItems?: Record<string, unknown> | null;
  sofpCurrent?: Record<string, unknown> | null;
  cashflowLineItems?: Record<string, unknown> | null;
  parsedIncome?: unknown;
  parsedSofp?: unknown;
  parsedCashflow?: unknown;
  operational?: OperationalInput | null;
  priorPeriodRevenue?: number | null;
  periodStart: string | Date;
  periodEnd: string | Date;
}): DerivedKpiBundle {
  const missing: string[] = [];
  const incLines = args.incomeLineItems ? totalsFromIncomeLineItems(args.incomeLineItems) : totalsFromIncomeLineItems({});
  const incParsed = extractIncomeFromParsedReport(args.parsedIncome) || {};
  const inc = { ...incLines, ...incParsed } as ReturnType<typeof totalsFromIncomeLineItems>;
  if (!args.incomeLineItems && !args.parsedIncome && inc.revenue === 0 && inc.netIncomeApprox === 0) {
    missing.push("INCOME_STATEMENT");
  }

  const bsBase = args.sofpCurrent ? totalsFromSofpCurrent(args.sofpCurrent) : totalsFromSofpCurrent(null);
  const bsParsed = extractSofpFromParsedReport(args.parsedSofp) || {};
  const bs = { ...bsBase, ...bsParsed } as ReturnType<typeof totalsFromSofpCurrent>;
  if (!args.sofpCurrent && !args.parsedSofp) missing.push("STATEMENT_OF_FINANCIAL_POSITION");

  const cfBase = args.cashflowLineItems ? totalsFromCashflowLineItems(args.cashflowLineItems) : totalsFromCashflowLineItems(null);
  const cfParsed = extractCashflowFromParsedReport(args.parsedCashflow) || {};
  const cf = { ...cfBase, ...cfParsed } as ReturnType<typeof totalsFromCashflowLineItems>;
  if (!args.cashflowLineItems && !args.parsedCashflow) missing.push("CASHFLOW_STATEMENT");

  const months = monthsInReportingWindow(args.periodStart, args.periodEnd);

  const revenue = inc.revenue ?? 0;
  const cogs = inc.cogs ?? 0;
  const grossProfit = revenue - cogs;
  const netIncome = inc.netIncomeApprox ?? 0;
  const ebitda = inc.ebitda ?? 0;
  const interestExp = Math.abs(inc.interestExpense ?? 0);
  const ebit =
    inc.operatingIncome != null && Number.isFinite(inc.operatingIncome)
      ? inc.operatingIncome
      : grossProfit - (inc.operatingExpenses ?? 0);

  const financial: Record<string, number | null> = {
    TOTAL_REVENUE_COMPUTED: revenue !== 0 ? revenue : null,
    COGS_COMPUTED: cogs !== 0 ? cogs : null,
    GROSS_PROFIT_COMPUTED: revenue !== 0 || cogs !== 0 ? grossProfit : null,
    GROSS_PROFIT_MARGIN: safeDiv(grossProfit, revenue),
    NET_PROFIT_MARGIN: safeDiv(netIncome, revenue),
    EBITDA_MARGIN: safeDiv(ebitda, revenue),
    CURRENT_RATIO: safeDiv(bs.currentAssets, bs.currentLiabilities),
    QUICK_RATIO: safeDiv(bs.cash + bs.accountsReceivable, bs.currentLiabilities),
    DEBT_TO_EQUITY: safeDiv(bs.totalLiabilities, bs.equity),
    INTEREST_COVERAGE: interestExp > 0 && Number.isFinite(ebit) ? safeDiv(ebit, interestExp) : null,
    ROA: safeDiv(netIncome, bs.totalAssets),
    ROE: safeDiv(netIncome, bs.equity),
    CASH_OPERATING_NET_APPROX:
      cf.operatingNetApprox != null && Number.isFinite(cf.operatingNetApprox) ? cf.operatingNetApprox : null,
    MONTHLY_BURN_OPERATING:
      cf.operatingNetApprox != null && cf.operatingNetApprox < 0
        ? Math.abs(cf.operatingNetApprox) / months
        : null,
    CASH_RUNWAY_MONTHS: null as number | null,
    CASH_CONVERSION_RATIO:
      cf.operatingNetApprox != null &&
      Number.isFinite(cf.operatingNetApprox) &&
      Number.isFinite(ebitda) &&
      ebitda !== 0
        ? safeDiv(cf.operatingNetApprox, ebitda)
        : null,
    WORKING_CAPITAL: bs.currentAssets - bs.currentLiabilities,
    REVENUE_GROWTH_RATE: null as number | null,
    INVENTORY_TURNOVER: null as number | null,
  };

  const cashForRunway = bs.cash > 0 ? bs.cash : cf.cashEnding;
  const burn = financial.MONTHLY_BURN_OPERATING;
  financial.CASH_RUNWAY_MONTHS = burn != null && burn > 0 && cashForRunway > 0 ? cashForRunway / burn : null;

  if (args.priorPeriodRevenue != null && args.priorPeriodRevenue > 0 && revenue > 0) {
    financial.REVENUE_GROWTH_RATE = safeDiv(revenue - args.priorPeriodRevenue, args.priorPeriodRevenue);
  } else if (revenue > 0) {
    missing.push("PRIOR_PERIOD_REVENUE");
  }

  const avgInv =
    (args.operational?.averageInventory ?? 0) > 0
      ? args.operational!.averageInventory!
      : bs.inventory > 0
        ? bs.inventory
        : null;
  financial.INVENTORY_TURNOVER = avgInv != null && avgInv > 0 && cogs > 0 ? safeDiv(cogs, avgInv) : null;

  const op = args.operational || {};
  const churn = op.churnRate != null && op.churnRate > 0 ? op.churnRate : null;
  const arpu = op.averageRevenuePerCustomerPerMonth != null && op.averageRevenuePerCustomerPerMonth > 0
    ? op.averageRevenuePerCustomerPerMonth
    : null;
  const smSpend =
    op.salesAndMarketingSpend != null && op.salesAndMarketingSpend > 0
      ? op.salesAndMarketingSpend
      : inc.salesMarketingProxy > 0
        ? inc.salesMarketingProxy
        : null;
  const newCust = op.newCustomersCount != null && op.newCustomersCount > 0 ? op.newCustomersCount : null;

  const operationalDerived: Record<string, number | null> = {
    CUSTOMER_RETENTION_RATE: churn != null ? 1 - churn : null,
    LTV: churn != null && churn > 0 && arpu != null ? arpu / churn : null,
    CAC: smSpend != null && newCust != null ? smSpend / newCust : null,
    LTV_CAC_RATIO: null as number | null,
    CONVERSION_RATE:
      op.leadOrVisitorCount != null &&
      op.leadOrVisitorCount > 0 &&
      op.customersFromLeads != null &&
      op.customersFromLeads >= 0
        ? safeDiv(op.customersFromLeads, op.leadOrVisitorCount)
        : null,
    UNIT_CONTRIBUTION:
      op.averageSellingPricePerUnit != null &&
      op.variableCostPerUnit != null
        ? op.averageSellingPricePerUnit - op.variableCostPerUnit
        : null,
    NET_DOLLAR_RETENTION:
      op.priorPeriodRevenueFromExistingCustomers != null &&
      op.priorPeriodRevenueFromExistingCustomers > 0 &&
      op.revenueFromExistingCustomersThisPeriod != null
        ? safeDiv(op.revenueFromExistingCustomersThisPeriod, op.priorPeriodRevenueFromExistingCustomers)
        : null,
    CHURN_INPUT: churn,
    MRR_REPORTED: op.monthlyRecurringRevenue != null && op.monthlyRecurringRevenue > 0 ? op.monthlyRecurringRevenue : null,
  };

  const ltv = operationalDerived.LTV;
  const cac = operationalDerived.CAC;
  operationalDerived.LTV_CAC_RATIO =
    ltv != null && cac != null && cac !== 0 ? ltv / cac : null;

  if (operationalDerived.LTV == null && (churn == null || arpu == null)) {
    if (op.averageRevenuePerCustomerPerMonth || op.churnRate) missing.push("LTV_INPUTS");
  }
  if (operationalDerived.CAC == null && (smSpend == null || newCust == null)) missing.push("CAC_INPUTS");

  return { financial, operationalDerived, missing, formulasVersion: 1 };
}
