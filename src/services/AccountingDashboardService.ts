// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "decimal.js";
import { IncomeStatementService } from "./IncomeStatementService";
import { BalanceSheetService } from "./BalanceSheetService";

export interface DashboardParams {
  period?: 'MTD' | 'YTD'; // Month to Date or Year to Date
  benchmark?: 'LAST_MONTH' | 'LAST_YEAR';
  startDate?: Date;
  endDate?: Date;
  currencyId?: string;
  entityId?: string; // For multi-entity support (if needed)
  financialYear?: string;
  months?: string[]; // Array of month names or numbers
}

export interface DashboardMetrics {
  revenue: {
    value: number;
    change: number;
    changePercent: number;
  };
  cogs: {
    value: number;
    change: number;
    changePercent: number;
  };
  grossProfit: {
    value: number;
    change: number;
    changePercent: number;
    grossProfitPercent: number; // Gross Profit / Revenue * 100
  };
  netProfit: {
    value: number;
    change: number;
    changePercent: number;
  };
}

export interface MonthlyData {
  month: string; // "Jan", "Feb", etc.
  monthNumber: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossProfitPercent: number;
  netProfit: number;
}

export interface ExpenseBreakdown {
  category: string;
  amount: number;
  percent: number;
}

export interface AssetBreakdown {
  category: string;
  amount: number;
  percent: number;
}

export interface LiabilityEquityBreakdown {
  category: string;
  amount: number;
  percent: number;
}

export interface AccountingDashboardData {
  // Key Metrics (Top Cards)
  metrics: DashboardMetrics;
  
  /** Three-Way Match: committed spend from Purchase Orders (not yet billed). GL unchanged until bill is posted. */
  committedSpend: number;
  
  // Monthly Chart Data
  monthlyData: MonthlyData[];
  
  // Detailed Breakdowns
  expenses: ExpenseBreakdown[];
  assets: {
    summary: AssetBreakdown[];
    detailed: AssetBreakdown[];
    total: number;
  };
  liabilitiesEquity: {
    summary: LiabilityEquityBreakdown[];
    detailed: LiabilityEquityBreakdown[];
    total: number;
  };
  
  // Period Information
  period: {
    startDate: Date;
    endDate: Date;
    periodType: 'MTD' | 'YTD';
    benchmarkType: 'LAST_MONTH' | 'LAST_YEAR';
  };
  
  // Currency
  currency: {
    id: string;
    code: string;
    name: string;
  };
  
  generatedAt: Date;
}

export class AccountingDashboardService {
  /**
   * Get comprehensive accounting dashboard data
   */
  static async getDashboardData(params: DashboardParams = {}): Promise<AccountingDashboardData> {
    try {
      const {
        period = 'YTD',
        benchmark = 'LAST_YEAR',
        startDate,
        endDate,
        currencyId
      } = params;

      // Get currency
      const currency = currencyId 
        ? await prisma.currency.findUnique({ where: { id: currencyId } })
        : await prisma.currency.findFirst({ where: { isActive: true } });

      if (!currency) {
        throw new Error("No active currency found");
      }

      // Calculate date ranges
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      let periodStart: Date;
      let periodEnd: Date = new Date(now);
      periodEnd.setHours(23, 59, 59, 999);

      if (startDate && endDate) {
        periodStart = new Date(startDate);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(endDate);
        periodEnd.setHours(23, 59, 59, 999);
      } else if (period === 'MTD') {
        periodStart = new Date(currentYear, currentMonth, 1);
        periodStart.setHours(0, 0, 0, 0);
      } else { // YTD
        periodStart = new Date(currentYear, 0, 1);
        periodStart.setHours(0, 0, 0, 0);
      }

      // Calculate benchmark period
      let benchmarkStart: Date;
      let benchmarkEnd: Date;

      if (benchmark === 'LAST_MONTH') {
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        benchmarkStart = new Date(lastMonthYear, lastMonth, 1);
        benchmarkStart.setHours(0, 0, 0, 0);
        benchmarkEnd = new Date(lastMonthYear, lastMonth + 1, 0);
        benchmarkEnd.setHours(23, 59, 59, 999);
      } else { // LAST_YEAR
        const periodDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
        benchmarkEnd = new Date(periodStart);
        benchmarkEnd.setFullYear(periodStart.getFullYear() - 1);
        benchmarkStart = new Date(benchmarkEnd);
        benchmarkStart.setDate(benchmarkStart.getDate() - periodDays);
      }

      // Get current period financial data using Income Statement Service
      const currentIncomeStatement = await IncomeStatementService.generateIncomeStatement({
        startDate: periodStart,
        endDate: periodEnd,
        currencyId: currency.id
      });

      // Get benchmark period financial data
      const benchmarkIncomeStatement = await IncomeStatementService.generateIncomeStatement({
        startDate: benchmarkStart,
        endDate: benchmarkEnd,
        currencyId: currency.id
      });

      // Calculate COGS for current period
      const currentCOGS = await this.calculateCOGS(periodStart, periodEnd, currency.id);
      
      // Calculate COGS for benchmark period
      const benchmarkCOGS = await this.calculateCOGS(benchmarkStart, benchmarkEnd, currency.id);

      // Calculate metrics
      const revenue = currentIncomeStatement.sections.revenue.total;
      const benchmarkRevenue = benchmarkIncomeStatement.sections.revenue.total;
      const revenueChange = revenue - benchmarkRevenue;
      const revenueChangePercent = benchmarkRevenue !== 0 
        ? (revenueChange / benchmarkRevenue) * 100 
        : 0;

      const cogsChange = currentCOGS - benchmarkCOGS;
      const cogsChangePercent = benchmarkCOGS !== 0 
        ? (cogsChange / benchmarkCOGS) * 100 
        : 0;

      const grossProfit = revenue - currentCOGS;
      const benchmarkGrossProfit = benchmarkRevenue - benchmarkCOGS;
      const grossProfitChange = grossProfit - benchmarkGrossProfit;
      const grossProfitChangePercent = benchmarkGrossProfit !== 0 
        ? (grossProfitChange / benchmarkGrossProfit) * 100 
        : 0;
      const grossProfitPercent = revenue !== 0 
        ? (grossProfit / revenue) * 100 
        : 0;

      const netProfit = currentIncomeStatement.totals.netIncome;
      const benchmarkNetProfit = benchmarkIncomeStatement.totals.netIncome;
      const netProfitChange = netProfit - benchmarkNetProfit;
      const netProfitChangePercent = benchmarkNetProfit !== 0 
        ? (netProfitChange / benchmarkNetProfit) * 100 
        : 0;

      // Get monthly data for charts
      const monthlyData = await this.getMonthlyData(
        periodStart,
        periodEnd,
        currency.id
      );

      // Get expense breakdown
      const expenses = await this.getExpenseBreakdown(
        periodStart,
        periodEnd,
        currency.id
      );

      // Committed Spend: open POs (DRAFT, SENT, APPROVED, PENDING) in this currency; BILLED excluded. No GL on PO — AP when bill posts.
      const committedSpend = await this.getCommittedSpend(currency.id);

      // Get balance sheet data for assets and liabilities
      const balanceSheet = await BalanceSheetService.generateBalanceSheet({
        asOfDate: periodEnd,
        currencyId: currency.id
      });

      let assetsSummary = this.formatAssetsSummary(balanceSheet.assets);
      let assetsDetailed = this.formatAssetsDetailed(balanceSheet.assets);
      let assetsTotal = balanceSheet.assets.totalAssets;

      const supplemental = await AccountingDashboardService.getSupplementalAssetAddon(
        periodEnd,
        currency.id,
        balanceSheet
      );
      for (const row of supplemental) {
        assetsTotal += row.amount;
        assetsSummary.push({
          category: row.label,
          amount: row.amount,
          percent: 0
        });
        assetsDetailed.push({
          category: row.label,
          amount: row.amount,
          percent: 0
        });
      }
      for (const row of assetsSummary) {
        row.percent = assetsTotal !== 0 ? (row.amount / assetsTotal) * 100 : 0;
      }
      for (const row of assetsDetailed) {
        row.percent = assetsTotal !== 0 ? (row.amount / assetsTotal) * 100 : 0;
      }

      // Format liabilities & equity breakdown
      const liabilitiesEquitySummary = this.formatLiabilitiesEquitySummary(
        balanceSheet.liabilities,
        balanceSheet.equity
      );
      const liabilitiesEquityDetailed = this.formatLiabilitiesEquityDetailed(
        balanceSheet.liabilities,
        balanceSheet.equity
      );

      return {
        metrics: {
          revenue: {
            value: revenue,
            change: revenueChange,
            changePercent: revenueChangePercent
          },
          cogs: {
            value: currentCOGS,
            change: cogsChange,
            changePercent: cogsChangePercent
          },
          grossProfit: {
            value: grossProfit,
            change: grossProfitChange,
            changePercent: grossProfitChangePercent,
            grossProfitPercent: grossProfitPercent
          },
          netProfit: {
            value: netProfit,
            change: netProfitChange,
            changePercent: netProfitChangePercent
          }
        },
        committedSpend,
        monthlyData,
        expenses,
        assets: {
          summary: assetsSummary,
          detailed: assetsDetailed,
          total: assetsTotal
        },
        liabilitiesEquity: {
          summary: liabilitiesEquitySummary,
          detailed: liabilitiesEquityDetailed,
          total: balanceSheet.totalLiabilitiesAndEquity
        },
        period: {
          startDate: periodStart,
          endDate: periodEnd,
          periodType: period,
          benchmarkType: benchmark
        },
        currency: {
          id: currency.id,
          code: currency.code,
          name: currency.name
        },
        generatedAt: new Date()
      };
    } catch (error) {
      console.error("Error generating accounting dashboard:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to generate accounting dashboard. Please try again.");
    }
  }

  /**
   * Committed Spend: sum of open Purchase Order `totalAmount` (incl. PO VAT when applicable), excluding BILLED.
   * GL balances stay unchanged on PO creation; AP posts when the purchase invoice is submitted.
   * @param currencyId - filter POs by this currency (e.g. ZIG)
   */
  private static async getCommittedSpend(currencyId: string): Promise<number> {
    try {
      const pos = await prisma.purchaseOrder.findMany({
        where: {
          currencyId,
          status: { in: ["DRAFT", "SENT", "APPROVED", "PENDING"] },
        },
        select: { totalAmount: true },
      });
      const total = pos.reduce((sum, po) => sum + Number(po.totalAmount), 0);
      return total;
    } catch (error) {
      console.error("Error getting committed spend:", error);
      return 0;
    }
  }

  /**
   * COGS from journal entries (single COGS account lookup). Public for reconciliation vs Income Statement period.
   */
  static async calculateCOGS(
    startDate: Date,
    endDate: Date,
    currencyId: string
  ): Promise<number> {
    try {
      // Find COGS account (contains is case-sensitive on MySQL; accountNo is primary)
      const cogsAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountName: { contains: 'Cost of Goods Sold' } },
            { accountName: { contains: 'COGS' } },
            { accountNo: { startsWith: '5100' } } // Common COGS account range
          ],
          isActive: true
        }
      });

      if (!cogsAccount) {
        console.warn("COGS account not found, returning 0");
        return 0;
      }

      // Get all journal entry lines for COGS account in the period
      const journalLines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: cogsAccount.id,
          journalEntry: {
            transactionDate: {
              gte: startDate,
              lte: endDate
            },
            status: 'POSTED',
            currencyId: currencyId
          }
        },
        include: {
          journalEntry: true
        }
      });

      // Calculate total COGS (debits increase COGS)
      let totalCOGS = new Decimal(0);
      for (const line of journalLines) {
        totalCOGS = totalCOGS.plus(line.debitAmount);
        // Credits decrease COGS (returns, adjustments)
        totalCOGS = totalCOGS.minus(line.creditAmount);
      }

      return totalCOGS.toNumber();
    } catch (error) {
      console.error("Error calculating COGS:", error);
      return 0;
    }
  }

  /**
   * Get monthly breakdown for charts
   */
  private static async getMonthlyData(
    startDate: Date,
    endDate: Date,
    currencyId: string
  ): Promise<MonthlyData[]> {
    const monthlyData: MonthlyData[] = [];
    const currentDate = new Date(startDate);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    while (currentDate <= endDate) {
      const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);

      // Limit to endDate if monthEnd exceeds it
      if (monthEnd > endDate) {
        monthEnd.setTime(endDate.getTime());
      }

      // Get income statement for this month
      const monthIncomeStatement = await IncomeStatementService.generateIncomeStatement({
        startDate: monthStart,
        endDate: monthEnd,
        currencyId: currencyId
      });

      const monthCOGS = await this.calculateCOGS(monthStart, monthEnd, currencyId);
      const monthRevenue = monthIncomeStatement.sections.revenue.total;
      const monthGrossProfit = monthRevenue - monthCOGS;
      const monthGrossProfitPercent = monthRevenue !== 0 
        ? (monthGrossProfit / monthRevenue) * 100 
        : 0;
      const monthNetProfit = monthIncomeStatement.totals.netIncome;

      monthlyData.push({
        month: monthNames[currentDate.getMonth()],
        monthNumber: currentDate.getMonth() + 1,
        revenue: monthRevenue,
        cogs: monthCOGS,
        grossProfit: monthGrossProfit,
        grossProfitPercent: monthGrossProfitPercent,
        netProfit: monthNetProfit
      });

      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return monthlyData;
  }

  /**
   * Get expense breakdown by category
   */
  private static async getExpenseBreakdown(
    startDate: Date,
    endDate: Date,
    currencyId: string
  ): Promise<ExpenseBreakdown[]> {
    try {
      // Get income statement for expense breakdown
      const incomeStatement = await IncomeStatementService.generateIncomeStatement({
        startDate,
        endDate,
        currencyId
      });

      const totalExpenses = incomeStatement.sections.operatingExpenses.total;
      const expenseBreakdown: ExpenseBreakdown[] = [];

      // Get expenses from operating expenses section
      for (const account of incomeStatement.sections.operatingExpenses.accounts) {
        if (account.netAmount > 0) {
          expenseBreakdown.push({
            category: account.accountName,
            amount: account.netAmount,
            percent: totalExpenses !== 0 
              ? (account.netAmount / totalExpenses) * 100 
              : 0
          });
        }
      }

      // Sort by amount descending
      expenseBreakdown.sort((a, b) => b.amount - a.amount);

      return expenseBreakdown;
    } catch (error) {
      console.error("Error getting expense breakdown:", error);
      return [];
    }
  }

  /**
   * Format assets summary
   */
  private static formatAssetsSummary(assets: any): AssetBreakdown[] {
    const summary: AssetBreakdown[] = [];
    const total = assets.totalAssets;

    if (assets.cashAndCashEquivalents.total > 0) {
      summary.push({
        category: 'Cash & Bank Balance',
        amount: assets.cashAndCashEquivalents.total,
        percent: total !== 0 ? (assets.cashAndCashEquivalents.total / total) * 100 : 0
      });
    }

    if (assets.currentAssets.total > 0) {
      summary.push({
        category: 'Current Assets',
        amount: assets.currentAssets.total,
        percent: total !== 0 ? (assets.currentAssets.total / total) * 100 : 0
      });
    }

    if (assets.fixedAssets.total > 0) {
      summary.push({
        category: 'Fixed Assets',
        amount: assets.fixedAssets.total,
        percent: total !== 0 ? (assets.fixedAssets.total / total) * 100 : 0
      });
    }

    if (assets.otherAssets.total > 0) {
      summary.push({
        category: 'Other Assets',
        amount: assets.otherAssets.total,
        percent: total !== 0 ? (assets.otherAssets.total / total) * 100 : 0
      });
    }

    const vatPresentationTotal = assets.expensePresentationRecoverableVat?.total ?? 0;
    if (vatPresentationTotal > 0) {
      summary.push({
        category: 'Recoverable / input VAT (expense-oriented disclosure)',
        amount: vatPresentationTotal,
        percent: total !== 0 ? (vatPresentationTotal / total) * 100 : 0
      });
    }

    return summary;
  }

  /**
   * Format assets detailed breakdown
   */
  private static formatAssetsDetailed(assets: any): AssetBreakdown[] {
    const detailed: AssetBreakdown[] = [];
    const total = assets.totalAssets;

    // Cash and cash equivalents breakdown
    for (const account of assets.cashAndCashEquivalents.breakdown || []) {
      detailed.push({
        category: account.accountName,
        amount: account.balance,
        percent: total !== 0 ? (account.balance / total) * 100 : 0
      });
    }

    // Current assets breakdown
    for (const account of assets.currentAssets.accounts || []) {
      detailed.push({
        category: account.accountName,
        amount: account.balance,
        percent: total !== 0 ? (account.balance / total) * 100 : 0
      });
    }

    // Fixed assets breakdown
    for (const account of assets.fixedAssets.accounts || []) {
      detailed.push({
        category: account.accountName,
        amount: account.balance,
        percent: total !== 0 ? (account.balance / total) * 100 : 0
      });
    }

    // Other assets breakdown
    for (const account of assets.otherAssets.accounts || []) {
      detailed.push({
        category: account.accountName,
        amount: account.balance,
        percent: total !== 0 ? (account.balance / total) * 100 : 0
      });
    }

    for (const account of assets.expensePresentationRecoverableVat?.accounts || []) {
      detailed.push({
        category: account.accountName,
        amount: account.balance,
        percent: total !== 0 ? (account.balance / total) * 100 : 0
      });
    }

    return detailed;
  }

  /**
   * Format liabilities & equity summary
   */
  private static formatLiabilitiesEquitySummary(
    liabilities: any,
    equity: any
  ): LiabilityEquityBreakdown[] {
    const summary: LiabilityEquityBreakdown[] = [];
    const total = liabilities.totalLiabilities + equity.total;

    if (liabilities.currentLiabilities.total > 0) {
      summary.push({
        category: 'Current Liabilities',
        amount: liabilities.currentLiabilities.total,
        percent: total !== 0 ? (liabilities.currentLiabilities.total / total) * 100 : 0
      });
    }

    if (liabilities.longTermLiabilities.total > 0) {
      summary.push({
        category: 'Non Current',
        amount: liabilities.longTermLiabilities.total,
        percent: total !== 0 ? (liabilities.longTermLiabilities.total / total) * 100 : 0
      });
    }

    if (equity.total > 0) {
      summary.push({
        category: 'Equity',
        amount: equity.total,
        percent: total !== 0 ? (equity.total / total) * 100 : 0
      });
    }

    return summary;
  }

  /**
   * Format liabilities & equity detailed breakdown
   */
  private static formatLiabilitiesEquityDetailed(
    liabilities: any,
    equity: any
  ): LiabilityEquityBreakdown[] {
    const detailed: LiabilityEquityBreakdown[] = [];
    const total = liabilities.totalLiabilities + equity.total;

    // Current liabilities breakdown
    for (const account of liabilities.currentLiabilities.accounts || []) {
      detailed.push({
        category: account.accountName,
        amount: account.balance,
        percent: total !== 0 ? (account.balance / total) * 100 : 0
      });
    }

    // Long-term liabilities breakdown
    for (const account of liabilities.longTermLiabilities.accounts || []) {
      detailed.push({
        category: account.accountName,
        amount: account.balance,
        percent: total !== 0 ? (account.balance / total) * 100 : 0
      });
    }

    // Equity breakdown
    for (const account of equity.accounts || []) {
      detailed.push({
        category: account.accountName,
        amount: account.balance,
        percent: total !== 0 ? (account.balance / total) * 100 : 0
      });
    }

    return detailed;
  }

  /**
   * Subledger lines merged into the dashboard asset breakdown (same response shape).
   * Amounts are net of overlapping GL balances already present on the balance sheet to reduce double-counting.
   */
  private static async getSupplementalAssetAddon(
    asOf: Date,
    currencyId: string,
    balanceSheet: any
  ): Promise<Array<{ label: string; amount: number }>> {
    const out: Array<{ label: string; amount: number }> = [];

    const assets = await prisma.asset.findMany({
      where: {
        isActive: true,
        status: "IN_USE",
        OR: [{ recordedCurrencyId: currencyId }, { recordedCurrencyId: null }]
      },
      select: {
        currentBookValue: true,
        assetAccount: { select: { accountNo: true } }
      }
    });

    let registerTotal = 0;
    const registerNos = new Set();
    for (const a of assets) {
      registerTotal += Number(a.currentBookValue);
      const no = a.assetAccount?.accountNo;
      if (no) registerNos.add(no);
    }

    let overlapFixed = 0;
    for (const acc of balanceSheet.assets?.fixedAssets?.accounts || []) {
      if (registerNos.has(acc.accountNo)) overlapFixed += Number(acc.balance || 0);
    }

    const netFixed = Math.max(0, registerTotal - overlapFixed);
    if (registerTotal > 0.01) {
      const useNet = netFixed > 0.01;
      out.push({
        label: useNet
          ? "Fixed assets (register, net of GL overlap)"
          : "Fixed assets (register — assets module)",
        amount: useNet ? netFixed : registerTotal
      });
    }

    let stiCarrying = 0;
    try {
      const { ShortTermInvestmentService } = await import("./ShortTermInvestmentService");
      const dash = await ShortTermInvestmentService.getDashboard({
        asOfIso: asOf.toISOString().slice(0, 10)
      });
      stiCarrying = Number(dash.portfolio?.carryingTotal || 0);
    } catch {
      stiCarrying = 0;
    }

    const stiRows = await prisma.shortTermInvestmentInstrument.findMany({
      where: { status: "ACTIVE" },
      select: {
        principalGlAccount: { select: { accountNo: true } }
      }
    });
    const stiNos = new Set(
      stiRows.map((r) => r.principalGlAccount?.accountNo).filter(Boolean) as string[]
    );

    const scanOverlappingSti = (): number => {
      let sum = 0;
      const walk = (list: any[]) => {
        for (const acc of list || []) {
          if (acc?.accountNo && stiNos.has(acc.accountNo)) {
            sum += Number(acc.balance || 0);
          }
        }
      };
      walk(balanceSheet.assets?.cashAndCashEquivalents?.breakdown || []);
      walk(balanceSheet.assets?.currentAssets?.accounts || []);
      walk(balanceSheet.assets?.fixedAssets?.accounts || []);
      walk(balanceSheet.assets?.otherAssets?.accounts || []);
      return sum;
    };

    const stiOverlap = scanOverlappingSti();
    const netSti = Math.max(0, stiCarrying - stiOverlap);
    if (stiCarrying > 0.01) {
      const useNet = netSti > 0.01;
      out.push({
        label: useNet
          ? "Short-term investments (portfolio, net of GL overlap)"
          : "Short-term investments (portfolio)",
        amount: useNet ? netSti : stiCarrying
      });
    }

    return out;
  }
}
