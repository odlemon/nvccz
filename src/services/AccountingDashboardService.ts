// @ts-nocheck
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/database";
import { Decimal } from "decimal.js";
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

      const aggregateStart =
        benchmarkStart < periodStart ? benchmarkStart : periodStart;
      const aggregateEnd =
        benchmarkEnd > periodEnd ? benchmarkEnd : periodEnd;

      const [
        accountsMetadata,
        pnlRows,
        cogsAccount,
        committedSpend,
        balanceSheet,
      ] = await Promise.all([
        this.getPnLAccountMetadata(),
        this.aggregatePnLByMonth(
          aggregateStart,
          aggregateEnd,
          currency.id,
          true
        ),
        this.resolveCOGSChartAccount(),
        this.getCommittedSpend(currency.id),
        this.getDashboardBalanceSheet(periodEnd, currency.id),
      ]);

      const cogsRows = cogsAccount
        ? await this.aggregatePnLByMonth(
            aggregateStart,
            aggregateEnd,
            currency.id,
            false,
            [cogsAccount.id]
          )
        : [];

      const currentBuckets = this.buildPnLBuckets(
        pnlRows,
        accountsMetadata,
        periodStart,
        periodEnd
      );
      const benchmarkBuckets = this.buildPnLBuckets(
        pnlRows,
        accountsMetadata,
        benchmarkStart,
        benchmarkEnd
      );

      const currentCOGS = this.sumCOGSRows(
        cogsRows,
        periodStart,
        periodEnd
      );
      const benchmarkCOGS = this.sumCOGSRows(
        cogsRows,
        benchmarkStart,
        benchmarkEnd
      );

      const revenue = currentBuckets.revenueTotal;
      const benchmarkRevenue = benchmarkBuckets.revenueTotal;
      const revenueChange = revenue - benchmarkRevenue;
      const revenueChangePercent =
        benchmarkRevenue !== 0 ? (revenueChange / benchmarkRevenue) * 100 : 0;

      const cogsChange = currentCOGS - benchmarkCOGS;
      const cogsChangePercent =
        benchmarkCOGS !== 0 ? (cogsChange / benchmarkCOGS) * 100 : 0;

      const grossProfit = revenue - currentCOGS;
      const benchmarkGrossProfit = benchmarkRevenue - benchmarkCOGS;
      const grossProfitChange = grossProfit - benchmarkGrossProfit;
      const grossProfitChangePercent =
        benchmarkGrossProfit !== 0
          ? (grossProfitChange / benchmarkGrossProfit) * 100
          : 0;
      const grossProfitPercent =
        revenue !== 0 ? (grossProfit / revenue) * 100 : 0;

      const netProfit = currentBuckets.netIncomeTotal;
      const benchmarkNetProfit = benchmarkBuckets.netIncomeTotal;
      const netProfitChange = netProfit - benchmarkNetProfit;
      const netProfitChangePercent =
        benchmarkNetProfit !== 0
          ? (netProfitChange / benchmarkNetProfit) * 100
          : 0;

      const expenses = this.buildExpenseBreakdownFromBuckets(currentBuckets);

      const monthlyData = this.buildMonthlyDataFromBuckets(
        currentBuckets,
        cogsRows,
        periodStart,
        periodEnd
      );

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

      const r = (n: number) => this.round2(n);
      const roundBreakdown = <T extends { amount: number; percent: number }>(
        rows: T[]
      ): T[] =>
        rows.map((row) => ({
          ...row,
          amount: r(row.amount),
          percent: r(row.percent),
        }));
      const roundMonth = (m: MonthlyData): MonthlyData => ({
        ...m,
        revenue: r(m.revenue),
        cogs: r(m.cogs),
        grossProfit: r(m.grossProfit),
        grossProfitPercent: r(m.grossProfitPercent),
        netProfit: r(m.netProfit),
      });

      return {
        metrics: {
          revenue: {
            value: r(revenue),
            change: r(revenueChange),
            changePercent: r(revenueChangePercent),
          },
          cogs: {
            value: r(currentCOGS),
            change: r(cogsChange),
            changePercent: r(cogsChangePercent),
          },
          grossProfit: {
            value: r(grossProfit),
            change: r(grossProfitChange),
            changePercent: r(grossProfitChangePercent),
            grossProfitPercent: r(grossProfitPercent),
          },
          netProfit: {
            value: r(netProfit),
            change: r(netProfitChange),
            changePercent: r(netProfitChangePercent),
          },
        },
        committedSpend: r(committedSpend),
        monthlyData: monthlyData.map(roundMonth),
        expenses: roundBreakdown(expenses),
        assets: {
          summary: roundBreakdown(assetsSummary),
          detailed: roundBreakdown(assetsDetailed),
          total: r(assetsTotal),
        },
        liabilitiesEquity: {
          summary: roundBreakdown(liabilitiesEquitySummary),
          detailed: roundBreakdown(liabilitiesEquityDetailed),
          total: r(balanceSheet.totalLiabilitiesAndEquity),
        },
        period: {
          startDate: periodStart,
          endDate: periodEnd,
          periodType: period,
          benchmarkType: benchmark,
        },
        currency: {
          id: currency.id,
          code: currency.code,
          name: currency.name,
        },
        generatedAt: new Date(),
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

  private static async resolveCOGSChartAccount(): Promise<{ id: string } | null> {
    try {
      return await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountName: { contains: "Cost of Goods Sold" } },
            { accountName: { contains: "COGS" } },
            { accountNo: { startsWith: "5100" } },
          ],
          isActive: true,
        },
        select: { id: true },
      });
    } catch (error) {
      console.error("Error resolving COGS account:", error);
      return null;
    }
  }

  private static async calculateCOGSForAccount(
    chartOfAccountId: string,
    startDate: Date,
    endDate: Date,
    currencyId: string
  ): Promise<number> {
    try {
      const journalLines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId,
          journalEntry: {
            transactionDate: { gte: startDate, lte: endDate },
            status: "POSTED",
            currencyId,
          },
        },
        select: { debitAmount: true, creditAmount: true },
      });
      let totalCOGS = new Decimal(0);
      for (const line of journalLines) {
        totalCOGS = totalCOGS.plus(line.debitAmount);
        totalCOGS = totalCOGS.minus(line.creditAmount);
      }
      return totalCOGS.toNumber();
    } catch (error) {
      console.error("Error calculating COGS:", error);
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
      const cogsAccount = await this.resolveCOGSChartAccount();
      if (!cogsAccount) {
        console.warn("COGS account not found, returning 0");
        return 0;
      }
      return this.calculateCOGSForAccount(
        cogsAccount.id,
        startDate,
        endDate,
        currencyId
      );
    } catch (error) {
      console.error("Error calculating COGS:", error);
      return 0;
    }
  }

  /**
   * One-shot fetch of P&L account metadata + VAT-account exclusions used by the dashboard P&L bucket builder.
   * Mirrors `IncomeStatementService.calculateAccountBalances` filters so totals reconcile with the income statement.
   */
  private static async getPnLAccountMetadata(): Promise<{
    accountsById: Map<
      string,
      {
        accountId: string;
        accountNo: string;
        accountName: string;
        accountType: string;
      }
    >;
    vatAccountIds: Set<string>;
  }> {
    const [pnlAccounts, vatAccounts] = await Promise.all([
      prisma.chartOfAccounts.findMany({
        where: {
          financialStatement: "Income Statement",
          isActive: true,
        },
        select: {
          id: true,
          accountNo: true,
          accountName: true,
          accountType: true,
        },
      }),
      prisma.chartOfAccounts.findMany({
        where: {
          OR: [
            { accountName: { contains: "VAT Input" } },
            { accountName: { contains: "VAT Output" } },
            { accountNo: { in: ["2100", "2110"] } },
            {
              accountName: { contains: "VAT" },
              accountType: { in: ["Current Liability", "Current Asset"] },
            },
          ],
          isActive: true,
        },
        select: { id: true },
      }),
    ]);

    const accountsById = new Map<
      string,
      {
        accountId: string;
        accountNo: string;
        accountName: string;
        accountType: string;
      }
    >();
    for (const a of pnlAccounts) {
      accountsById.set(a.id, {
        accountId: a.id,
        accountNo: a.accountNo,
        accountName: a.accountName,
        accountType: a.accountType,
      });
    }
    return {
      accountsById,
      vatAccountIds: new Set(vatAccounts.map((v) => v.id)),
    };
  }

  /**
   * Single SQL aggregation: per (chartOfAccountId, year, month) debits + credits across the date range.
   * Mirrors `IncomeStatementService.generateIncomeStatement` exclusions when `applyReversalExclusion=true`
   * (skips VR-/REV- prefixed reversals and entries linked to voided/reversed cashbook entries).
   */
  private static async aggregatePnLByMonth(
    startDate: Date,
    endDate: Date,
    currencyId: string,
    applyReversalExclusion: boolean,
    accountIdFilter?: string[]
  ): Promise<
    Array<{
      accountId: string;
      year: number;
      month: number;
      debit: number;
      credit: number;
    }>
  > {
    const exclusionFragment = applyReversalExclusion
      ? Prisma.sql`
          AND je.referenceNumber NOT LIKE 'VR-%'
          AND je.referenceNumber NOT LIKE 'REV-%'
          AND NOT EXISTS (
            SELECT 1 FROM cashbook_entries cbe
            WHERE cbe.journalEntryId = je.id
              AND (cbe.status = 'VOIDED' OR cbe.reversedAt IS NOT NULL)
          )
        `
      : Prisma.sql``;

    const accountFragment =
      accountIdFilter && accountIdFilter.length > 0
        ? Prisma.sql`AND jel.chartOfAccountId IN (${Prisma.join(
            accountIdFilter
          )})`
        : Prisma.sql``;

    const rows = await prisma.$queryRaw<
      Array<{
        accountId: string;
        y: number | bigint;
        m: number | bigint;
        debit: unknown;
        credit: unknown;
      }>
    >`
      SELECT
        jel.chartOfAccountId AS accountId,
        YEAR(je.transactionDate) AS y,
        MONTH(je.transactionDate) AS m,
        SUM(jel.debitAmount) AS debit,
        SUM(jel.creditAmount) AS credit
      FROM journal_entry_lines jel
      INNER JOIN journal_entries je ON je.id = jel.journalEntryId
      WHERE je.status = 'POSTED'
        AND je.currencyId = ${currencyId}
        AND je.transactionDate >= ${startDate}
        AND je.transactionDate <= ${endDate}
        ${exclusionFragment}
        ${accountFragment}
      GROUP BY jel.chartOfAccountId, y, m
    `;

    return rows.map((r) => ({
      accountId: r.accountId,
      year: Number(r.y),
      month: Number(r.m),
      debit: Number(r.debit ?? 0),
      credit: Number(r.credit ?? 0),
    }));
  }

  /**
   * Build period totals + per-account-per-month buckets from aggregated rows.
   * Account classification mirrors `IncomeStatementService.buildIncomeStatementSections`.
   */
  private static buildPnLBuckets(
    rows: Array<{
      accountId: string;
      year: number;
      month: number;
      debit: number;
      credit: number;
    }>,
    metadata: {
      accountsById: Map<
        string,
        {
          accountId: string;
          accountNo: string;
          accountName: string;
          accountType: string;
        }
      >;
      vatAccountIds: Set<string>;
    },
    startDate: Date,
    endDate: Date
  ): {
    revenueTotal: number;
    operatingExpensesTotal: number;
    incomeTaxTotal: number;
    belowTheLineTotal: number;
    netIncomeTotal: number;
    operatingExpensesByAccount: Map<
      string,
      { accountName: string; amount: number }
    >;
    monthlyTotals: Map<
      string,
      {
        revenue: number;
        operatingExpenses: number;
        incomeTax: number;
        belowTheLine: number;
        netIncome: number;
      }
    >;
  } {
    const startKey = `${startDate.getFullYear()}-${String(
      startDate.getMonth() + 1
    ).padStart(2, "0")}`;
    const endKey = `${endDate.getFullYear()}-${String(
      endDate.getMonth() + 1
    ).padStart(2, "0")}`;

    let revenueTotal = 0;
    let operatingExpensesTotal = 0;
    let incomeTaxTotal = 0;
    let belowTheLineTotal = 0;
    const operatingExpensesByAccount = new Map<
      string,
      { accountName: string; amount: number }
    >();
    const monthlyTotals = new Map<
      string,
      {
        revenue: number;
        operatingExpenses: number;
        incomeTax: number;
        belowTheLine: number;
        netIncome: number;
      }
    >();

    for (const row of rows) {
      if (metadata.vatAccountIds.has(row.accountId)) continue;
      const meta = metadata.accountsById.get(row.accountId);
      if (!meta) continue;

      const ymKey = `${row.year}-${String(row.month).padStart(2, "0")}`;
      if (ymKey < startKey || ymKey > endKey) continue;

      const accountNoValue = parseInt(meta.accountNo, 10);
      if (Number.isNaN(accountNoValue) || accountNoValue === 0) continue;

      const debit = row.debit;
      const credit = row.credit;

      let revenueDelta = 0;
      let opexDelta = 0;
      let taxDelta = 0;
      let belowDelta = 0;

      if (accountNoValue >= 4000 && accountNoValue <= 4099) {
        revenueDelta = credit - debit;
      } else if (accountNoValue >= 4100 && accountNoValue <= 4199) {
        revenueDelta = -(credit - debit);
      } else if (accountNoValue >= 5000 && accountNoValue <= 5999) {
        opexDelta = debit - credit;
      } else if (accountNoValue >= 6100 && accountNoValue <= 6199) {
        taxDelta = debit - credit;
      } else if (accountNoValue >= 6200 && accountNoValue <= 6999) {
        if (meta.accountType === "Expense") {
          belowDelta = -(debit - credit);
        } else {
          belowDelta = credit - debit;
        }
      } else {
        opexDelta = debit - credit;
      }

      revenueTotal += revenueDelta;
      operatingExpensesTotal += opexDelta;
      incomeTaxTotal += taxDelta;
      belowTheLineTotal += belowDelta;

      if (opexDelta !== 0) {
        const existing = operatingExpensesByAccount.get(row.accountId);
        if (existing) {
          existing.amount += opexDelta;
        } else {
          operatingExpensesByAccount.set(row.accountId, {
            accountName: meta.accountName,
            amount: opexDelta,
          });
        }
      }

      const monthBucket = monthlyTotals.get(ymKey) ?? {
        revenue: 0,
        operatingExpenses: 0,
        incomeTax: 0,
        belowTheLine: 0,
        netIncome: 0,
      };
      monthBucket.revenue += revenueDelta;
      monthBucket.operatingExpenses += opexDelta;
      monthBucket.incomeTax += taxDelta;
      monthBucket.belowTheLine += belowDelta;
      monthlyTotals.set(ymKey, monthBucket);
    }

    for (const bucket of monthlyTotals.values()) {
      bucket.netIncome =
        bucket.revenue -
        bucket.operatingExpenses -
        bucket.incomeTax +
        bucket.belowTheLine;
    }

    const netIncomeTotal =
      revenueTotal -
      operatingExpensesTotal -
      incomeTaxTotal +
      belowTheLineTotal;

    return {
      revenueTotal,
      operatingExpensesTotal,
      incomeTaxTotal,
      belowTheLineTotal,
      netIncomeTotal,
      operatingExpensesByAccount,
      monthlyTotals,
    };
  }

  /** Sum aggregated COGS rows (debit-credit) within the date range. */
  private static sumCOGSRows(
    rows: Array<{
      year: number;
      month: number;
      debit: number;
      credit: number;
    }>,
    startDate: Date,
    endDate: Date
  ): number {
    const startKey = `${startDate.getFullYear()}-${String(
      startDate.getMonth() + 1
    ).padStart(2, "0")}`;
    const endKey = `${endDate.getFullYear()}-${String(
      endDate.getMonth() + 1
    ).padStart(2, "0")}`;
    let total = new Decimal(0);
    for (const r of rows) {
      const ymKey = `${r.year}-${String(r.month).padStart(2, "0")}`;
      if (ymKey < startKey || ymKey > endKey) continue;
      total = total.plus(r.debit).minus(r.credit);
    }
    return total.toNumber();
  }

  /** Build expense breakdown from operating-expense-by-account map. */
  private static buildExpenseBreakdownFromBuckets(buckets: {
    operatingExpensesTotal: number;
    operatingExpensesByAccount: Map<
      string,
      { accountName: string; amount: number }
    >;
  }): ExpenseBreakdown[] {
    const total = buckets.operatingExpensesTotal;
    const out: ExpenseBreakdown[] = [];
    for (const v of buckets.operatingExpensesByAccount.values()) {
      if (v.amount > 0) {
        out.push({
          category: v.accountName,
          amount: v.amount,
          percent: total !== 0 ? (v.amount / total) * 100 : 0,
        });
      }
    }
    out.sort((a, b) => b.amount - a.amount);
    return out;
  }

  /**
   * Fast dashboard-only balance sheet:
   * - One SQL aggregation across `journal_entry_lines` for `transactionDate <= asOfDate` with the same exclusions
   *   `BalanceSheetService` uses (POSTED, currency, no `VR-`/`REV-`, no voided/reversed cashbook entries).
   * - Skips the slow per-line transaction enrichment / per-account detail loads the BS service does for the report UI.
   * - Mirrors the BS service classification: cash & cash equivalents (bank-linked GL + 1000-1199 cash names),
   *   Current/Fixed/Other Assets, Contra-Asset (consolidated as "Accumulated Depreciation" negative line),
   *   Portfolio Investments consolidation (1500/1501), VAT input/recoverable expense-style disclosure,
   *   Current / Long-Term Liabilities, Equity, plus retained earnings (net income to date).
   */
  private static async getDashboardBalanceSheet(
    asOfDate: Date,
    currencyId: string
  ): Promise<{
    assets: {
      cashAndCashEquivalents: {
        total: number;
        breakdown: Array<{
          accountNo: string;
          accountName: string;
          balance: number;
        }>;
      };
      currentAssets: {
        accounts: Array<{
          accountNo: string;
          accountName: string;
          balance: number;
        }>;
        total: number;
      };
      fixedAssets: {
        accounts: Array<{
          accountNo: string;
          accountName: string;
          balance: number;
        }>;
        total: number;
      };
      otherAssets: {
        accounts: Array<{
          accountNo: string;
          accountName: string;
          balance: number;
        }>;
        total: number;
      };
      expensePresentationRecoverableVat: {
        accounts: Array<{
          accountNo: string;
          accountName: string;
          balance: number;
        }>;
        total: number;
      };
      totalAssets: number;
    };
    liabilities: {
      currentLiabilities: {
        accounts: Array<{
          accountNo: string;
          accountName: string;
          balance: number;
        }>;
        total: number;
      };
      longTermLiabilities: {
        accounts: Array<{
          accountNo: string;
          accountName: string;
          balance: number;
        }>;
        total: number;
      };
      totalLiabilities: number;
    };
    equity: {
      accounts: Array<{
        accountNo: string;
        accountName: string;
        balance: number;
      }>;
      total: number;
      retainedEarnings: number;
    };
    totalLiabilitiesAndEquity: number;
  }> {
    const [allAccounts, banks, balanceRows, retainedRows] = await Promise.all([
      prisma.chartOfAccounts.findMany({
        where: { isActive: true },
        select: {
          id: true,
          accountNo: true,
          accountName: true,
          accountType: true,
          financialStatement: true,
        },
        orderBy: { accountNo: "asc" },
      }),
      prisma.bank.findMany({
        where: { isActive: true, glAccount: { isActive: true } },
        select: { glAccount: { select: { id: true } } },
      }),
      prisma.$queryRaw<
        Array<{ accountId: string; debit: unknown; credit: unknown }>
      >`
        SELECT
          jel.chartOfAccountId AS accountId,
          SUM(jel.debitAmount) AS debit,
          SUM(jel.creditAmount) AS credit
        FROM journal_entry_lines jel
        INNER JOIN journal_entries je ON je.id = jel.journalEntryId
        WHERE je.status = 'POSTED'
          AND je.currencyId = ${currencyId}
          AND je.transactionDate <= ${asOfDate}
          AND je.referenceNumber NOT LIKE 'VR-%'
          AND je.referenceNumber NOT LIKE 'REV-%'
          AND NOT EXISTS (
            SELECT 1 FROM cashbook_entries cbe
            WHERE cbe.journalEntryId = je.id
              AND (cbe.status = 'VOIDED' OR cbe.reversedAt IS NOT NULL)
          )
        GROUP BY jel.chartOfAccountId
      `,
      prisma.$queryRaw<
        Array<{
          accountType: string;
          debit: unknown;
          credit: unknown;
        }>
      >`
        SELECT
          coa.accountType AS accountType,
          SUM(jel.debitAmount) AS debit,
          SUM(jel.creditAmount) AS credit
        FROM journal_entry_lines jel
        INNER JOIN journal_entries je ON je.id = jel.journalEntryId
        INNER JOIN chart_of_accounts coa ON coa.id = jel.chartOfAccountId
        WHERE je.status = 'POSTED'
          AND je.transactionDate <= ${asOfDate}
          AND coa.isActive = 1
          AND coa.accountType IN ('Revenue', 'Income', 'Expense')
        GROUP BY coa.accountType
      `,
    ]);

    const bankGLAccountIds = new Set<string>();
    for (const b of banks) {
      if (b.glAccount?.id) bankGLAccountIds.add(b.glAccount.id);
    }

    const balanceByAccount = new Map<string, { debit: number; credit: number }>();
    for (const r of balanceRows) {
      balanceByAccount.set(r.accountId, {
        debit: Number(r.debit ?? 0),
        credit: Number(r.credit ?? 0),
      });
    }

    let totalRevenue = 0;
    let totalExpense = 0;
    for (const r of retainedRows) {
      const debit = Number(r.debit ?? 0);
      const credit = Number(r.credit ?? 0);
      if (r.accountType === "Revenue" || r.accountType === "Income") {
        totalRevenue += credit - debit;
      } else if (r.accountType === "Expense") {
        totalExpense += debit - credit;
      }
    }
    let retainedEarnings = totalRevenue - totalExpense;

    const isVatInputRecoverableByName = (accountName: string): boolean => {
      const n = String(accountName || "").toLowerCase();
      if (n.includes("vat output") || n.includes("output vat")) return false;
      return (
        n.includes("vat input") ||
        n.includes("input vat") ||
        n.includes("vat recoverable") ||
        n.includes("recoverable vat") ||
        (n.includes("vat") &&
          (n.includes("receivable") || n.includes("recover")))
      );
    };

    const isCashOrBank = (account: {
      id: string;
      accountNo: string;
      accountName: string;
      accountType: string;
    }): boolean => {
      if (account.accountType !== "Current Asset") return false;
      if (bankGLAccountIds.has(account.id)) return true;
      const name = account.accountName.toLowerCase();
      const inLegacy = account.accountNo >= "1000" && account.accountNo < "1100";
      const inCash = account.accountNo >= "1100" && account.accountNo <= "1199";
      if (!inLegacy && !inCash) return false;
      return (
        name.includes("cash") ||
        name.includes("petty") ||
        name.includes("money market") ||
        name.includes("call deposit")
      );
    };

    type Row = { accountNo: string; accountName: string; balance: number };
    const cashBreakdown: Row[] = [];
    let cashTotal = 0;
    const currentAssets: Row[] = [];
    const fixedAssets: Row[] = [];
    const otherAssets: Row[] = [];
    const expensePresentationRecoverableVat: Row[] = [];
    const currentLiabilities: Row[] = [];
    const longTermLiabilities: Row[] = [];
    const equityAccounts: Row[] = [];
    let accumulatedDepreciation = 0;

    for (const acc of allAccounts) {
      if (
        acc.financialStatement !== "Balance Sheet" &&
        acc.financialStatement !== "Balance sheet"
      ) {
        continue;
      }

      const totals = balanceByAccount.get(acc.id) ?? { debit: 0, credit: 0 };
      const accountName = acc.accountName.toLowerCase();
      const accountType = acc.accountType;
      let balance = 0;
      if (
        accountName.includes("accumulated depreciation") ||
        accountType === "Contra-Asset"
      ) {
        balance = totals.credit - totals.debit;
      } else if (accountType.includes("Asset")) {
        balance = totals.debit - totals.credit;
      } else if (accountType.includes("Liability") || accountType === "Equity") {
        balance = totals.credit - totals.debit;
      }

      const isImportantLiability =
        acc.accountNo === "2150" || acc.accountNo === "2250";
      const isCash = isCashOrBank(acc);

      if (Math.abs(balance) < 0.01 && !isImportantLiability) {
        if (!isCash) continue;
        if (!bankGLAccountIds.has(acc.id)) continue;
      }

      const isAccumulatedDepreciation =
        (accountName.includes("accumulated") &&
          (accountName.includes("depreciation") ||
            accountName.includes("depr"))) ||
        accountType === "Contra-Asset" ||
        (accountType.includes("Asset") &&
          (accountName.includes("depreciation") ||
            accountName.includes("depr")));
      if (isAccumulatedDepreciation) {
        accumulatedDepreciation += balance;
        continue;
      }

      const row: Row = {
        accountNo: acc.accountNo,
        accountName: acc.accountName,
        balance,
      };

      if (isCash) {
        cashTotal += balance;
        cashBreakdown.push(row);
        continue;
      }

      if (accountType === "Current Asset") {
        if (isVatInputRecoverableByName(acc.accountName)) {
          expensePresentationRecoverableVat.push({
            ...row,
            accountName: `${acc.accountName} (recoverable/input VAT — expense-style disclosure)`,
          });
        } else {
          currentAssets.push(row);
        }
      } else if (
        accountType === "Fixed Asset" ||
        accountType === "Long-Term Asset" ||
        accountType === "Non-Current Asset"
      ) {
        fixedAssets.push(row);
      } else if (accountType.includes("Asset")) {
        if (isVatInputRecoverableByName(acc.accountName)) {
          expensePresentationRecoverableVat.push({
            ...row,
            accountName: `${acc.accountName} (recoverable/input VAT — expense-style disclosure)`,
          });
        } else {
          otherAssets.push(row);
        }
      } else if (accountType === "Current Liability") {
        currentLiabilities.push(row);
      } else if (accountType === "Long-Term Liability") {
        longTermLiabilities.push(row);
      } else if (accountType === "Equity") {
        equityAccounts.push(row);
      }
    }

    const portfolio1500Idx = fixedAssets.findIndex((a) => a.accountNo === "1500");
    const portfolio1501Idx = fixedAssets.findIndex((a) => a.accountNo === "1501");
    if (portfolio1500Idx >= 0 || portfolio1501Idx >= 0) {
      const combinedBalance =
        (portfolio1500Idx >= 0 ? fixedAssets[portfolio1500Idx].balance : 0) +
        (portfolio1501Idx >= 0 ? fixedAssets[portfolio1501Idx].balance : 0);
      const indices = [portfolio1500Idx, portfolio1501Idx]
        .filter((i) => i >= 0)
        .sort((a, b) => b - a);
      for (const i of indices) fixedAssets.splice(i, 1);
      fixedAssets.push({
        accountNo: "1501",
        accountName: "Portfolio Investments",
        balance: combinedBalance,
      });
    }

    if (Math.abs(accumulatedDepreciation) > 0.01) {
      fixedAssets.push({
        accountNo: "ACCUM-DEPR",
        accountName: "Accumulated Depreciation",
        balance: -Math.abs(accumulatedDepreciation),
      });
    }

    if (cashTotal !== 0 || cashBreakdown.length > 0) {
      currentAssets.unshift({
        accountNo: "CASH-EQUIV",
        accountName: "Cash and Cash Equivalents",
        balance: cashTotal,
      });
    }

    const totalCurrentAssets = currentAssets.reduce(
      (s, a) => s + a.balance,
      0
    );
    const totalFixedAssets = fixedAssets.reduce((s, a) => s + a.balance, 0);
    const totalOtherAssets = otherAssets.reduce((s, a) => s + a.balance, 0);
    const totalExpensePresentationRecoverableVat =
      expensePresentationRecoverableVat.reduce((s, a) => s + a.balance, 0);
    const totalAssets =
      totalCurrentAssets +
      totalFixedAssets +
      totalOtherAssets +
      totalExpensePresentationRecoverableVat;

    const totalCurrentLiabilities = currentLiabilities.reduce(
      (s, a) => s + a.balance,
      0
    );
    const totalLongTermLiabilities = longTermLiabilities.reduce(
      (s, a) => s + a.balance,
      0
    );
    const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;

    const equityAccountTotal = equityAccounts.reduce(
      (s, a) => s + a.balance,
      0
    );
    let totalEquity = equityAccountTotal + retainedEarnings;
    let totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
    const initialDifference = totalAssets - totalLiabilitiesAndEquity;
    if (Math.abs(initialDifference) >= 0.01) {
      retainedEarnings = totalAssets - totalLiabilities - equityAccountTotal;
      totalEquity = equityAccountTotal + retainedEarnings;
      totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
    }

    return {
      assets: {
        cashAndCashEquivalents: { total: cashTotal, breakdown: cashBreakdown },
        currentAssets: { accounts: currentAssets, total: totalCurrentAssets },
        fixedAssets: { accounts: fixedAssets, total: totalFixedAssets },
        otherAssets: { accounts: otherAssets, total: totalOtherAssets },
        expensePresentationRecoverableVat: {
          accounts: expensePresentationRecoverableVat,
          total: totalExpensePresentationRecoverableVat,
        },
        totalAssets,
      },
      liabilities: {
        currentLiabilities: {
          accounts: currentLiabilities,
          total: totalCurrentLiabilities,
        },
        longTermLiabilities: {
          accounts: longTermLiabilities,
          total: totalLongTermLiabilities,
        },
        totalLiabilities,
      },
      equity: {
        accounts: equityAccounts,
        total: totalEquity,
        retainedEarnings,
      },
      totalLiabilitiesAndEquity,
    };
  }

  /** Round to 2 decimal places. */
  private static round2(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  /** Build chart-friendly month rows from precomputed buckets + COGS rows. */
  private static buildMonthlyDataFromBuckets(
    buckets: {
      monthlyTotals: Map<
        string,
        {
          revenue: number;
          operatingExpenses: number;
          incomeTax: number;
          belowTheLine: number;
          netIncome: number;
        }
      >;
    },
    cogsRows: Array<{
      year: number;
      month: number;
      debit: number;
      credit: number;
    }>,
    startDate: Date,
    endDate: Date
  ): MonthlyData[] {
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const cogsByYM = new Map<string, number>();
    for (const r of cogsRows) {
      const ymKey = `${r.year}-${String(r.month).padStart(2, "0")}`;
      cogsByYM.set(ymKey, (cogsByYM.get(ymKey) ?? 0) + (r.debit - r.credit));
    }

    const result: MonthlyData[] = [];
    const cursor = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      1
    );
    const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (cursor <= last) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      const ymKey = `${y}-${String(m).padStart(2, "0")}`;
      const bucket =
        buckets.monthlyTotals.get(ymKey) ?? {
          revenue: 0,
          operatingExpenses: 0,
          incomeTax: 0,
          belowTheLine: 0,
          netIncome: 0,
        };
      const monthCOGS = cogsByYM.get(ymKey) ?? 0;
      const grossProfit = bucket.revenue - monthCOGS;
      const grossProfitPercent =
        bucket.revenue !== 0 ? (grossProfit / bucket.revenue) * 100 : 0;
      result.push({
        month: monthNames[cursor.getMonth()],
        monthNumber: m,
        revenue: bucket.revenue,
        cogs: monthCOGS,
        grossProfit,
        grossProfitPercent,
        netProfit: bucket.netIncome,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return result;
  }

  /**
   * Format assets summary
   */
  private static formatAssetsSummary(assets: any): AssetBreakdown[] {
    const summary: AssetBreakdown[] = [];
    const total = assets.totalAssets;

    if (Math.abs(assets.cashAndCashEquivalents.total) > 0.01) {
      summary.push({
        category: 'Cash & Bank Balance',
        amount: assets.cashAndCashEquivalents.total,
        percent: total !== 0 ? (assets.cashAndCashEquivalents.total / total) * 100 : 0
      });
    }

    if (Math.abs(assets.currentAssets.total) > 0.01) {
      summary.push({
        category: 'Current Assets',
        amount: assets.currentAssets.total,
        percent: total !== 0 ? (assets.currentAssets.total / total) * 100 : 0
      });
    }

    if (Math.abs(assets.fixedAssets.total) > 0.01) {
      summary.push({
        category: 'Fixed Assets',
        amount: assets.fixedAssets.total,
        percent: total !== 0 ? (assets.fixedAssets.total / total) * 100 : 0
      });
    }

    if (Math.abs(assets.otherAssets.total) > 0.01) {
      summary.push({
        category: 'Other Assets',
        amount: assets.otherAssets.total,
        percent: total !== 0 ? (assets.otherAssets.total / total) * 100 : 0
      });
    }

    const vatPresentationTotal = assets.expensePresentationRecoverableVat?.total ?? 0;
    if (Math.abs(vatPresentationTotal) > 0.01) {
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
        principalGl: { select: { accountNo: true } }
      }
    });
    const stiNos = new Set(
      stiRows.map((r) => r.principalGl?.accountNo).filter(Boolean) as string[]
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
