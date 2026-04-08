// @ts-nocheck
import { describe, it, expect } from "@jest/globals";
import { computeMonitoringKpisFromInputs } from "../services/investmentMonitoringKpiCompute";

describe("InvestmentMonitoringKpiService.computeMonitoringKpisFromInputs", () => {
  it("computes gross profit margin and net margin from income statement", () => {
    const is = {
      grossSales: 1000,
      returnsRefundsAndAllowances: 0,
      otherRevenue: 0,
      goodsPurchased: 200,
      materials: 100,
      labour: 100,
      overhead: 0,
      advertisingAndPromotion: 200,
      lessInterestExpense: 50,
      lessIncomeTaxExpense: 40,
      depreciationAndAmortisation: 30,
      nonOperatingRevenuesAndExpenses: 0,
      incomeFromDiscontinuedOperations: 0,
      effectOfAccountingChanges: 0,
      extraordinaryItems: 0,
    };
    const { financial } = computeMonitoringKpisFromInputs({
      incomeStatement: is,
      monthsInPeriod: 1,
    });
    expect(financial.REVENUE).toBe(1000);
    expect(financial.COGS).toBe(400);
    expect(financial.GROSS_PROFIT).toBe(600);
    expect(financial.GROSS_PROFIT_MARGIN).toBeCloseTo(0.6, 5);
    expect(financial.EBITDA_MARGIN).not.toBeNull();
    expect(financial.NET_PROFIT_MARGIN).not.toBeNull();
  });

  it("returns null margins when revenue is zero (no divide by zero)", () => {
    const { financial } = computeMonitoringKpisFromInputs({
      incomeStatement: {
        grossSales: 0,
        returnsRefundsAndAllowances: 0,
        otherRevenue: 0,
      },
      monthsInPeriod: 1,
    });
    expect(financial.GROSS_PROFIT_MARGIN).toBeNull();
    expect(financial.NET_PROFIT_MARGIN).toBeNull();
    expect(financial.EBITDA_MARGIN).toBeNull();
  });

  it("computes revenue growth vs prior period", () => {
    const { financial } = computeMonitoringKpisFromInputs({
      incomeStatement: {
        grossSales: 1200,
        returnsRefundsAndAllowances: 0,
        otherRevenue: 0,
      },
      priorPeriodIncomeStatement: {
        grossSales: 1000,
        returnsRefundsAndAllowances: 0,
        otherRevenue: 0,
      },
      monthsInPeriod: 1,
    });
    expect(financial.REVENUE_GROWTH_RATE).toBeCloseTo(0.2, 5);
  });

  it("computes liquidity ratios from balance sheet current period", () => {
    const bs = {
      currentPeriod: {
        cash: 50,
        accountsReceivable: 50,
        inventory: 100,
        prepaidExpenses: 0,
        shortTermInvestments: 0,
        accountsPayable: 100,
        shortTermLoans: 0,
        incomeTaxesPayable: 0,
        accruedSalariesAndWages: 0,
        unearnedRevenue: 0,
        currentPortionOfLongTermDebt: 0,
        longTermDebt: 200,
        deferredIncomeTaxLiabilities: 0,
        otherLongTermLiabilities: 0,
        ownersInvestment: 400,
        retainedEarnings: 0,
        otherOwnersEquity: 0,
        longTermInvestments: 0,
        propertyPlantAndEquipment: 0,
        lessAccumulatedDepreciation: 0,
        intangibleAssets: 0,
        deferredIncomeTaxAssets: 0,
        otherAssets: 0,
      },
    };
    const { financial } = computeMonitoringKpisFromInputs({
      balanceSheet: bs,
      monthsInPeriod: 1,
    });
    expect(financial.CURRENT_RATIO).toBeCloseTo(2, 5);
    expect(financial.QUICK_RATIO).toBeCloseTo(1, 5);
  });

  it("operational SaaS KPIs are null (financials-only phase)", () => {
    const { operational } = computeMonitoringKpisFromInputs({
      incomeStatement: { grossSales: 100, returnsRefundsAndAllowances: 0, otherRevenue: 0 },
      monthsInPeriod: 1,
    });
    expect(operational.CUSTOMER_ACQUISITION_COST).toBeNull();
    expect(operational.MONTHLY_RECURRING_REVENUE).toBeNull();
  });
});
