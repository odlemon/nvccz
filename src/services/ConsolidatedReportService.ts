// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "decimal.js";
import { buildJournalEntryWhereForGlReporting } from "../utils/journalEntryReportingFilter";
import { resolveUsdZwgAvgForSnapshot } from "./UsdZwgRateResolver";
import { BalanceSheetService } from "./BalanceSheetService";

export interface CurrencyBreakdownItem {
  sourceCurrency: string;
  sourceCurrencyId: string;
  sourceAmount: number;
  conversionRate: number;
  consolidatedAmount: number;
}

interface ConsolidatedAccount {
  accountId: string;
  accountNo: string;
  accountName: string;
  accountType: string;
  balance: number;
  currencyBreakdown: CurrencyBreakdownItem[];
}

export interface ConsolidatedBalanceSheetParams {
  asOfDate: Date;
  consolidationCurrencyId: string;
  startDate?: Date;
  endDate?: Date;
  hideZeroBalances?: boolean;
}

export interface ConsolidatedIncomeStatementParams {
  startDate: Date;
  endDate: Date;
  consolidationCurrencyId: string;
}

type RateCache = Map<string, { rate: number; code: string }>;

export class ConsolidatedReportService {
  /**
   * Resolve the conversion rate from `fromCurrencyId` to `toCurrencyId` as of `asOfDate`.
   * Fallback chain: exact date → nearest earlier → inverse → UsdZwg snapshot for ZiG↔USD.
   */
  private static async resolveRate(
    fromCurrencyId: string,
    toCurrencyId: string,
    asOfDate: Date
  ): Promise<number> {
    if (fromCurrencyId === toCurrencyId) return 1;

    const normalized = new Date(asOfDate);
    normalized.setHours(0, 0, 0, 0);

    // 1. Exact date match
    let row = await prisma.exchangeRate.findUnique({
      where: {
        date_fromCurrencyId_toCurrencyId: { date: normalized, fromCurrencyId, toCurrencyId },
      },
    });
    if (row && Number(row.rate) > 0) return Number(row.rate);

    // 2. Nearest earlier date (direct)
    row = await prisma.exchangeRate.findFirst({
      where: { fromCurrencyId, toCurrencyId, date: { lte: normalized }, isActive: true },
      orderBy: { date: "desc" },
    });
    if (row && Number(row.rate) > 0) return Number(row.rate);

    // 3. Inverse rate (nearest earlier)
    let inv = await prisma.exchangeRate.findFirst({
      where: { fromCurrencyId: toCurrencyId, toCurrencyId: fromCurrencyId, date: { lte: normalized }, isActive: true },
      orderBy: { date: "desc" },
    });
    if (inv && Number(inv.rate) > 0) return 1 / Number(inv.rate);

    // 4. Latest available rate regardless of date (direct)
    row = await prisma.exchangeRate.findFirst({
      where: { fromCurrencyId, toCurrencyId, isActive: true },
      orderBy: { date: "desc" },
    });
    if (row && Number(row.rate) > 0) return Number(row.rate);

    // 5. Latest available inverse rate regardless of date
    inv = await prisma.exchangeRate.findFirst({
      where: { fromCurrencyId: toCurrencyId, toCurrencyId: fromCurrencyId, isActive: true },
      orderBy: { date: "desc" },
    });
    if (inv && Number(inv.rate) > 0) return 1 / Number(inv.rate);

    // 6. UsdZwg snapshot fallback (covers ZiG↔USD when no explicit rate exists)
    const snapshot = await resolveUsdZwgAvgForSnapshot(prisma as any).catch(() => null);
    if (snapshot && snapshot > 0) {
      const [fromCcy, toCcy] = await Promise.all([
        prisma.currency.findUnique({ where: { id: fromCurrencyId }, select: { code: true } }),
        prisma.currency.findUnique({ where: { id: toCurrencyId }, select: { code: true } }),
      ]);
      const fc = fromCcy?.code?.toUpperCase() ?? "";
      const tc = toCcy?.code?.toUpperCase() ?? "";
      const zigCodes = new Set(["ZIG", "ZWG", "ZWL"]);

      if (fc === "USD" && zigCodes.has(tc)) return snapshot;
      if (zigCodes.has(fc) && tc === "USD") return 1 / snapshot;
    }

    throw new Error(`No exchange rate found for currency conversion (${fromCurrencyId} → ${toCurrencyId})`);
  }

  /**
   * Try resolving a rate without throwing — returns null on failure.
   */
  private static async tryResolveRate(
    fromCurrencyId: string,
    toCurrencyId: string,
    asOfDate: Date
  ): Promise<number | null> {
    try {
      return await this.resolveRate(fromCurrencyId, toCurrencyId, asOfDate);
    } catch {
      return null;
    }
  }

  /**
   * Build a rate cache: for each currency in the system, resolve rate → target currency.
   * Falls back to triangulation through USD if no direct/inverse rate exists.
   */
  private static async buildRateCache(
    targetCurrencyId: string,
    asOfDate: Date,
    currencyIds: Set<string>
  ): Promise<RateCache> {
    const cache: RateCache = new Map();

    const currencies = await prisma.currency.findMany({
      where: { id: { in: [...currencyIds] } },
      select: { id: true, code: true },
    });
    const codeMap = new Map(currencies.map((c) => [c.id, c.code]));

    const usdCurrency = currencies.find((c) => c.code.toUpperCase() === "USD");
    const usdId = usdCurrency?.id;

    for (const cid of currencyIds) {
      if (cid === targetCurrencyId) {
        cache.set(cid, { rate: 1, code: codeMap.get(cid) ?? "???" });
        continue;
      }

      let rate = await this.tryResolveRate(cid, targetCurrencyId, asOfDate);

      // Triangulation through USD: from → USD → target
      if (rate === null && usdId && cid !== usdId && targetCurrencyId !== usdId) {
        const leg1 = await this.tryResolveRate(cid, usdId, asOfDate);
        const leg2 = await this.tryResolveRate(usdId, targetCurrencyId, asOfDate);
        if (leg1 !== null && leg2 !== null) {
          rate = leg1 * leg2;
        }
      }

      if (rate === null) {
        throw new Error(`No exchange rate found for ${codeMap.get(cid) ?? cid} → ${codeMap.get(targetCurrencyId) ?? targetCurrencyId}`);
      }

      cache.set(cid, { rate, code: codeMap.get(cid) ?? "???" });
    }
    return cache;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CONSOLIDATED BALANCE SHEET
  // ═══════════════════════════════════════════════════════════════════════════

  static async generateConsolidatedBalanceSheet(params: ConsolidatedBalanceSheetParams) {
    const { consolidationCurrencyId, hideZeroBalances } = params;

    const targetCurrency = await prisma.currency.findUnique({ where: { id: consolidationCurrencyId } });
    if (!targetCurrency) throw new Error("Consolidation currency not found");

    // Date range
    let startDate: Date;
    let endDate: Date;
    if (params.startDate && params.endDate) {
      startDate = new Date(params.startDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(params.endDate);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = new Date(0);
      endDate = new Date(params.asOfDate);
      endDate.setHours(23, 59, 59, 999);
    }

    // Fetch ALL journal lines — no currency filter
    const journalEntryWhere = buildJournalEntryWhereForGlReporting({ gte: startDate, lte: endDate });

    const accounts = await prisma.chartOfAccounts.findMany({
      where: { financialStatement: { in: ["Balance Sheet", "Balance sheet"] }, isActive: true },
      orderBy: { accountNo: "asc" },
    });

    const journalLines = await prisma.journalEntryLine.findMany({
      where: { journalEntry: { is: journalEntryWhere } },
      select: {
        chartOfAccountId: true,
        debitAmount: true,
        creditAmount: true,
        chartOfAccount: { select: { id: true, accountNo: true, accountName: true, accountType: true } },
        journalEntry: { select: { currencyId: true } },
      },
    });

    // Collect all distinct currencies used
    const currencyIds = new Set<string>();
    for (const line of journalLines) {
      if (line.journalEntry.currencyId) currencyIds.add(line.journalEntry.currencyId);
    }
    currencyIds.add(consolidationCurrencyId);

    const rateCache = await this.buildRateCache(consolidationCurrencyId, endDate, currencyIds);

    // Accumulate per (account, sourceCurrency) → source amount
    type AccCcyKey = string; // accountId|currencyId
    const sourceAmounts = new Map<AccCcyKey, { sourceAmount: number; accountType: string; accountName: string }>();

    for (const line of journalLines) {
      const accId = line.chartOfAccountId;
      const ccyId = line.journalEntry.currencyId;
      const key: AccCcyKey = `${accId}|${ccyId}`;
      const entry = sourceAmounts.get(key) ?? { sourceAmount: 0, accountType: line.chartOfAccount.accountType, accountName: line.chartOfAccount.accountName };

      const debit = new Decimal(line.debitAmount).toNumber();
      const credit = new Decimal(line.creditAmount).toNumber();
      const accountType = line.chartOfAccount.accountType;
      const accountName = line.chartOfAccount.accountName.toLowerCase();

      let delta: number;
      if (accountName.includes("accumulated depreciation") || accountType === "Contra-Asset") {
        delta = credit - debit;
      } else if (accountType.includes("Asset")) {
        delta = debit - credit;
      } else {
        delta = credit - debit; // Liabilities & Equity
      }

      entry.sourceAmount += delta;
      sourceAmounts.set(key, entry);
    }

    // Build consolidated accounts
    const accountMap = new Map<string, ConsolidatedAccount>();
    for (const acc of accounts) {
      accountMap.set(acc.id, {
        accountId: acc.id,
        accountNo: acc.accountNo,
        accountName: acc.accountName,
        accountType: acc.accountType,
        balance: 0,
        currencyBreakdown: [],
      });
    }

    for (const [key, val] of sourceAmounts.entries()) {
      const [accId, ccyId] = key.split("|");
      let consolidated = accountMap.get(accId);
      if (!consolidated) continue;

      const { rate, code } = rateCache.get(ccyId) ?? { rate: 1, code: "???" };
      const consolidatedAmount = val.sourceAmount * rate;

      consolidated.currencyBreakdown.push({
        sourceCurrency: code,
        sourceCurrencyId: ccyId,
        sourceAmount: Math.round(val.sourceAmount * 100) / 100,
        conversionRate: rate,
        consolidatedAmount: Math.round(consolidatedAmount * 100) / 100,
      });
      consolidated.balance += consolidatedAmount;
    }

    // Round final balances
    for (const acc of accountMap.values()) {
      acc.balance = Math.round(acc.balance * 100) / 100;
    }

    // Build balance sheet sections (same structure as existing)
    const bankGLAccountIds = new Set(
      (await prisma.bank.findMany({ select: { glAccountId: true } }))
        .map((b) => b.glAccountId)
        .filter(Boolean) as string[]
    );
    // Note: Cash & Cash Equivalents is a reporting bucket, not a single posting account.
    // We treat any bank-linked GL accounts (banks.glAccountId) as cash/bank for reporting.

    const allAccounts = [...accountMap.values()];
    const eps = 0.01;

    const isCash = (a: ConsolidatedAccount) =>
      BalanceSheetService.isCashOrBankEquivalentForReporting(
        {
          id: a.accountId,
          accountNo: a.accountNo,
          accountName: a.accountName,
          accountType: a.accountType,
        },
        bankGLAccountIds
      );

    const cashAccounts = allAccounts.filter((a) => a.accountType.includes("Asset") && isCash(a));
    const currentAssets = allAccounts.filter((a) => a.accountType === "Current Asset" && !isCash(a));
    const fixedAssets = allAccounts.filter((a) => a.accountType === "Fixed Asset" || a.accountType === "Contra-Asset");
    const otherAssets = allAccounts.filter((a) => a.accountType.includes("Asset") && !["Current Asset", "Fixed Asset", "Contra-Asset"].includes(a.accountType) && !isCash(a));
    const currentLiabilities = allAccounts.filter((a) => a.accountType === "Current Liability");
    const longTermLiabilities = allAccounts.filter((a) => a.accountType === "Long-term Liability" || a.accountType === "Non-Current Liability");
    const equityAccounts = allAccounts.filter((a) => a.accountType === "Equity");

    const filterZero = (arr: ConsolidatedAccount[]) =>
      hideZeroBalances ? arr.filter((a) => Math.abs(a.balance) >= eps || a.currencyBreakdown.length > 0) : arr;

    const sum = (arr: ConsolidatedAccount[]) => Math.round(arr.reduce((s, a) => s + a.balance, 0) * 100) / 100;

    const cashTotal = sum(cashAccounts);
    const currentTotal = sum(currentAssets);
    const fixedTotal = sum(fixedAssets);
    const otherTotal = sum(otherAssets);
    const totalAssets = Math.round((cashTotal + currentTotal + fixedTotal + otherTotal) * 100) / 100;

    const clTotal = sum(currentLiabilities);
    const ltTotal = sum(longTermLiabilities);
    const totalLiabilities = Math.round((clTotal + ltTotal) * 100) / 100;

    const equityTotal = sum(equityAccounts);
    const totalLiabilitiesAndEquity = Math.round((totalLiabilities + equityTotal) * 100) / 100;

    return {
      asOfDate: params.asOfDate,
      consolidationCurrency: { id: targetCurrency.id, code: targetCurrency.code, name: targetCurrency.name },
      exchangeRates: [...rateCache.entries()].map(([cid, { rate, code }]) => ({ currencyId: cid, currencyCode: code, rate })),
      assets: {
        cashAndCashEquivalents: { total: cashTotal, breakdown: filterZero(cashAccounts) },
        currentAssets: { accounts: filterZero(currentAssets), total: currentTotal },
        fixedAssets: { accounts: filterZero(fixedAssets), total: fixedTotal },
        otherAssets: { accounts: filterZero(otherAssets), total: otherTotal },
        totalAssets,
      },
      liabilities: {
        currentLiabilities: { accounts: filterZero(currentLiabilities), total: clTotal },
        longTermLiabilities: { accounts: filterZero(longTermLiabilities), total: ltTotal },
        totalLiabilities,
      },
      equity: {
        accounts: filterZero(equityAccounts),
        total: equityTotal,
      },
      totalLiabilitiesAndEquity,
      isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < eps,
      difference: Math.round((totalAssets - totalLiabilitiesAndEquity) * 100) / 100,
      generatedAt: new Date(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CONSOLIDATED INCOME STATEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  static async generateConsolidatedIncomeStatement(params: ConsolidatedIncomeStatementParams) {
    const { startDate, endDate, consolidationCurrencyId } = params;

    const targetCurrency = await prisma.currency.findUnique({ where: { id: consolidationCurrencyId } });
    if (!targetCurrency) throw new Error("Consolidation currency not found");

    const sd = new Date(startDate);
    sd.setHours(0, 0, 0, 0);
    const ed = new Date(endDate);
    ed.setHours(23, 59, 59, 999);

    // Fetch ALL posted JE lines — no currency filter
    const journalEntryWhere = buildJournalEntryWhereForGlReporting({ gte: sd, lte: ed });

    const journalLines = await prisma.journalEntryLine.findMany({
      where: { journalEntry: { is: journalEntryWhere } },
      select: {
        chartOfAccountId: true,
        debitAmount: true,
        creditAmount: true,
        chartOfAccount: {
          select: {
            id: true,
            accountNo: true,
            accountName: true,
            accountType: true,
            financialStatement: true,
          },
        },
        journalEntry: { select: { currencyId: true } },
      },
    });

    // Only income statement accounts
    const isIncomeStatementAccount = (fs: string | null) =>
      fs && (fs.toLowerCase().includes("income") || fs.toLowerCase().includes("profit"));

    const incomeLines = journalLines.filter((l) => isIncomeStatementAccount(l.chartOfAccount.financialStatement));

    const currencyIds = new Set<string>();
    for (const l of incomeLines) {
      if (l.journalEntry.currencyId) currencyIds.add(l.journalEntry.currencyId);
    }
    currencyIds.add(consolidationCurrencyId);

    const rateCache = await this.buildRateCache(consolidationCurrencyId, ed, currencyIds);

    // Accumulate per (account, sourceCurrency)
    type AccCcyKey = string;
    const sourceAmounts = new Map<AccCcyKey, number>();

    const accountMeta = new Map<string, { accountNo: string; accountName: string; accountType: string }>();

    for (const line of incomeLines) {
      const accId = line.chartOfAccountId;
      const ccyId = line.journalEntry.currencyId;
      const key: AccCcyKey = `${accId}|${ccyId}`;

      const debit = new Decimal(line.debitAmount).toNumber();
      const credit = new Decimal(line.creditAmount).toNumber();
      const accountType = line.chartOfAccount.accountType;

      let delta: number;
      if (accountType === "Revenue") {
        delta = credit - debit;
      } else {
        delta = debit - credit; // Expenses, COGS, Tax
      }

      sourceAmounts.set(key, (sourceAmounts.get(key) ?? 0) + delta);
      if (!accountMeta.has(accId)) {
        accountMeta.set(accId, {
          accountNo: line.chartOfAccount.accountNo,
          accountName: line.chartOfAccount.accountName,
          accountType: line.chartOfAccount.accountType,
        });
      }
    }

    // Build consolidated account list
    const consolidatedAccounts: ConsolidatedAccount[] = [];
    const accountIds = new Set<string>();

    for (const [key] of sourceAmounts) {
      accountIds.add(key.split("|")[0]);
    }

    for (const accId of accountIds) {
      const meta = accountMeta.get(accId)!;
      const breakdowns: CurrencyBreakdownItem[] = [];
      let totalBalance = 0;

      for (const [key, sourceAmount] of sourceAmounts) {
        const [kAccId, kCcyId] = key.split("|");
        if (kAccId !== accId) continue;

        const { rate, code } = rateCache.get(kCcyId) ?? { rate: 1, code: "???" };
        const consolidatedAmount = sourceAmount * rate;

        breakdowns.push({
          sourceCurrency: code,
          sourceCurrencyId: kCcyId,
          sourceAmount: Math.round(sourceAmount * 100) / 100,
          conversionRate: rate,
          consolidatedAmount: Math.round(consolidatedAmount * 100) / 100,
        });
        totalBalance += consolidatedAmount;
      }

      consolidatedAccounts.push({
        accountId: accId,
        accountNo: meta.accountNo,
        accountName: meta.accountName,
        accountType: meta.accountType,
        balance: Math.round(totalBalance * 100) / 100,
        currencyBreakdown: breakdowns,
      });
    }

    consolidatedAccounts.sort((a, b) => a.accountNo.localeCompare(b.accountNo));

    // Categorise into sections
    const revenueAccounts = consolidatedAccounts.filter((a) => a.accountType === "Revenue");
    const expenseAccounts = consolidatedAccounts.filter((a) =>
      a.accountType === "Expense" || a.accountType === "Cost of Goods Sold" || a.accountType === "Operating Expense"
    );
    const taxAccounts = consolidatedAccounts.filter((a) =>
      a.accountType === "Tax" || a.accountName.toLowerCase().includes("income tax") || a.accountName.toLowerCase().includes("tax expense")
    );
    const belowTheLine = consolidatedAccounts.filter(
      (a) =>
        !revenueAccounts.includes(a) &&
        !expenseAccounts.includes(a) &&
        !taxAccounts.includes(a)
    );

    const sumAccounts = (arr: ConsolidatedAccount[]) => Math.round(arr.reduce((s, a) => s + a.balance, 0) * 100) / 100;

    const revenueTotal = sumAccounts(revenueAccounts);
    const expensesTotal = sumAccounts(expenseAccounts);
    const taxTotal = sumAccounts(taxAccounts);
    const belowTotal = sumAccounts(belowTheLine);

    const netIncomeBeforeTaxes = Math.round((revenueTotal - expensesTotal) * 100) / 100;
    const incomeFromContinuingOperations = Math.round((netIncomeBeforeTaxes - taxTotal) * 100) / 100;
    const netIncome = Math.round((incomeFromContinuingOperations + belowTotal) * 100) / 100;

    return {
      period: { startDate: sd, endDate: ed },
      consolidationCurrency: { id: targetCurrency.id, code: targetCurrency.code, name: targetCurrency.name },
      exchangeRates: [...rateCache.entries()].map(([cid, { rate, code }]) => ({ currencyId: cid, currencyCode: code, rate })),
      sections: {
        revenue: { accounts: revenueAccounts, total: revenueTotal },
        operatingExpenses: { accounts: expenseAccounts, total: expensesTotal },
        incomeTax: { accounts: taxAccounts, total: taxTotal },
        belowTheLine: { accounts: belowTheLine, total: belowTotal },
      },
      totals: {
        netIncomeBeforeTaxes,
        incomeTaxExpense: taxTotal,
        incomeFromContinuingOperations,
        belowTheLine: belowTotal,
        netIncome,
      },
      generatedAt: new Date(),
    };
  }
}
