// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "decimal.js";
import { buildJournalEntryWhereForGlReporting } from "../utils/journalEntryReportingFilter";
import { resolveUsdZwgAvgForConsolidatedReport } from "./UsdZwgRateResolver";
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
  /** Group Consolidation: scope to one ForecastEntity's own journal entries. Omitted = whole ledger (existing behavior, unchanged). */
  forecastEntityId?: string;
  /** Group Consolidation: true = only manually-flagged elimination journals, false = exclude them, omitted = no filter (existing behavior, unchanged). */
  isEliminationEntry?: boolean;
}

export interface ConsolidatedIncomeStatementParams {
  startDate: Date;
  endDate: Date;
  consolidationCurrencyId: string;
  /** Group Consolidation: scope to one ForecastEntity's own journal entries. Omitted = whole ledger (existing behavior, unchanged). */
  forecastEntityId?: string;
  /** Group Consolidation: true = only manually-flagged elimination journals, false = exclude them, omitted = no filter (existing behavior, unchanged). */
  isEliminationEntry?: boolean;
}

export interface ConsolidationSummaryParams {
  /** Balance sheet as-of date. Defaults to now. */
  asOfDate?: Date;
  /** Income statement period. Defaults to month-to-date. */
  periodStart?: Date;
  periodEnd?: Date;
  consolidationCurrencyId: string;
  /** Scope to one entity's own summary. Omitted = full multi-entity + eliminations + consolidated envelope. */
  forecastEntityId?: string;
}

type RateCache = Map<string, { rate: number; code: string }>;

/** ZiG family: rates are often stored under one code (e.g. ZWL) while journals use another (ZWG). */
const ZIG_FAMILY_CODES = ["ZIG", "ZWG", "ZWL"] as const;

export class ConsolidatedReportService {
  private static normalizeCurrencyCode(code: string | null | undefined): string {
    return (code ?? "").trim().toUpperCase();
  }

  /**
   * Map raw `journal_entries.currencyId` values to canonical `currencies.id`.
   * Some legacy rows store an ISO code (e.g. "USD") instead of the Currency cuid — that breaks FX lookups
   * (rate cache sees "USD" as an unknown id and errors with misleading "USD → USD").
   */
  private static async buildLegacyCurrencyResolutionMap(
    rawIds: Iterable<string>
  ): Promise<Map<string, string>> {
    const all = await prisma.currency.findMany({ select: { id: true, code: true } });
    const idSet = new Set(all.map((c) => c.id));
    const upperCodeToId = new Map<string, string>();
    for (const c of all) {
      upperCodeToId.set(this.normalizeCurrencyCode(c.code), c.id);
    }

    const map = new Map<string, string>();
    for (const raw of rawIds) {
      if (!raw) continue;
      if (idSet.has(raw)) {
        map.set(raw, raw);
        continue;
      }
      const byCode = upperCodeToId.get(this.normalizeCurrencyCode(raw));
      if (byCode) {
        map.set(raw, byCode);
        continue;
      }
      map.set(raw, raw);
      console.warn(
        `[ConsolidatedReportService] Unknown currency key "${raw}" (not a currency id or known code); FX may fail.`
      );
    }
    return map;
  }

  /**
   * All `currencies.id` values that should match the same logical currency in `exchange_rates`:
   * duplicate rows sharing `code`, and ZIG/ZWG/ZWL treated as one bucket for FX rows.
   */
  private static async expandCurrencyIdsForExchangeLookup(currencyId: string): Promise<string[]> {
    const row = await prisma.currency.findUnique({
      where: { id: currencyId },
      select: { id: true, code: true },
    });
    if (!row) return [currencyId];

    const norm = this.normalizeCurrencyCode(row.code);
    const zigFamily = new Set(ZIG_FAMILY_CODES as readonly string[]);

    if (zigFamily.has(norm)) {
      const rows = await prisma.currency.findMany({
        where: { code: { in: [...ZIG_FAMILY_CODES] } },
        select: { id: true },
      });
      return [...new Set([currencyId, ...rows.map((r) => r.id)])];
    }

    const sameCode = await prisma.currency.findMany({
      where: { code: row.code },
      select: { id: true },
    });
    return sameCode.length ? sameCode.map((r) => r.id) : [currencyId];
  }

  /**
   * Resolve the conversion rate from `fromCurrencyId` to `toCurrencyId` as of `asOfDate`.
   * Fallback chain: exact date → nearest earlier → inverse → latest (active) → Zimrate/snapshot USD↔ZiG → inactive table rows.
   * Uses expanded currency id sets so duplicate `Currency` rows or ZIG/ZWG/ZWL aliases still match `exchange_rates` rows.
   */
  private static async resolveRate(
    fromCurrencyId: string,
    toCurrencyId: string,
    asOfDate: Date
  ): Promise<number> {
    if (fromCurrencyId === toCurrencyId) return 1;

    const [fromMeta, toMeta] = await Promise.all([
      prisma.currency.findUnique({ where: { id: fromCurrencyId }, select: { code: true } }),
      prisma.currency.findUnique({ where: { id: toCurrencyId }, select: { code: true } }),
    ]);
    if (!fromMeta || !toMeta) {
      throw new Error(`Unknown currency id in conversion (${fromCurrencyId} → ${toCurrencyId})`);
    }

    const fc0 = this.normalizeCurrencyCode(fromMeta.code);
    const tc0 = this.normalizeCurrencyCode(toMeta.code);
    if (fc0 && fc0 === tc0) return 1;

    const fromIds = await this.expandCurrencyIdsForExchangeLookup(fromCurrencyId);
    const toIds = await this.expandCurrencyIdsForExchangeLookup(toCurrencyId);
    if (fromIds.length === 0 || toIds.length === 0) {
      throw new Error(`No exchange rate found for currency conversion (${fromCurrencyId} → ${toCurrencyId})`);
    }

    const normalized = new Date(asOfDate);
    normalized.setHours(0, 0, 0, 0);

    const zigCodes = new Set(ZIG_FAMILY_CODES as readonly string[]);

    // 1. Exact date match (any id pair)
    let row = await prisma.exchangeRate.findFirst({
      where: {
        date: normalized,
        fromCurrencyId: { in: fromIds },
        toCurrencyId: { in: toIds },
      },
    });
    if (row && Number(row.rate) > 0) return Number(row.rate);

    // 2. Nearest earlier date (direct, active)
    row = await prisma.exchangeRate.findFirst({
      where: {
        fromCurrencyId: { in: fromIds },
        toCurrencyId: { in: toIds },
        date: { lte: normalized },
        isActive: true,
      },
      orderBy: { date: "desc" },
    });
    if (row && Number(row.rate) > 0) return Number(row.rate);

    // 3. Inverse rate (nearest earlier, active)
    let inv = await prisma.exchangeRate.findFirst({
      where: {
        fromCurrencyId: { in: toIds },
        toCurrencyId: { in: fromIds },
        date: { lte: normalized },
        isActive: true,
      },
      orderBy: { date: "desc" },
    });
    if (inv && Number(inv.rate) > 0) return 1 / Number(inv.rate);

    // 4. Latest available rate regardless of date (direct, active)
    row = await prisma.exchangeRate.findFirst({
      where: {
        fromCurrencyId: { in: fromIds },
        toCurrencyId: { in: toIds },
        isActive: true,
      },
      orderBy: { date: "desc" },
    });
    if (row && Number(row.rate) > 0) return Number(row.rate);

    // 5. Latest inverse (active)
    inv = await prisma.exchangeRate.findFirst({
      where: {
        fromCurrencyId: { in: toIds },
        toCurrencyId: { in: fromIds },
        isActive: true,
      },
      orderBy: { date: "desc" },
    });
    if (inv && Number(inv.rate) > 0) return 1 / Number(inv.rate);

    // 6. Live Zimrate USD/ZWG + stored snapshot (ZiG↔USD when no table row matches expanded ids)
    const snapshot = await resolveUsdZwgAvgForConsolidatedReport(prisma as any).catch(() => null);
    if (snapshot && snapshot > 0) {
      if (fc0 === "USD" && zigCodes.has(tc0)) return snapshot;
      if (zigCodes.has(fc0) && tc0 === "USD") return 1 / snapshot;
    }

    // 7. Inactive rows (still better than failing when only legacy/deactivated rates exist)
    row = await prisma.exchangeRate.findFirst({
      where: {
        fromCurrencyId: { in: fromIds },
        toCurrencyId: { in: toIds },
        date: { lte: normalized },
        rate: { gt: 0 },
      },
      orderBy: { date: "desc" },
    });
    if (row && Number(row.rate) > 0) return Number(row.rate);

    inv = await prisma.exchangeRate.findFirst({
      where: {
        fromCurrencyId: { in: toIds },
        toCurrencyId: { in: fromIds },
        date: { lte: normalized },
        rate: { gt: 0 },
      },
      orderBy: { date: "desc" },
    });
    if (inv && Number(inv.rate) > 0) return 1 / Number(inv.rate);

    row = await prisma.exchangeRate.findFirst({
      where: {
        fromCurrencyId: { in: fromIds },
        toCurrencyId: { in: toIds },
        rate: { gt: 0 },
      },
      orderBy: { date: "desc" },
    });
    if (row && Number(row.rate) > 0) return Number(row.rate);

    inv = await prisma.exchangeRate.findFirst({
      where: {
        fromCurrencyId: { in: toIds },
        toCurrencyId: { in: fromIds },
        rate: { gt: 0 },
      },
      orderBy: { date: "desc" },
    });
    if (inv && Number(inv.rate) > 0) return 1 / Number(inv.rate);

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

    const targetRow = currencies.find((c) => c.id === targetCurrencyId);
    const targetCodeNorm = targetRow ? this.normalizeCurrencyCode(targetRow.code) : "";

    const usdCurrency = currencies.find((c) => this.normalizeCurrencyCode(c.code) === "USD");
    const usdId = usdCurrency?.id;

    for (const cid of currencyIds) {
      const cidCode = codeMap.get(cid);
      const cidNorm = cidCode ? this.normalizeCurrencyCode(cidCode) : "";
      if (
        cid === targetCurrencyId ||
        (targetCodeNorm && cidNorm && targetCodeNorm === cidNorm)
      ) {
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

  /**
   * Posted JE lines with chart-of-account metadata. Loads COA in a second query so rows whose
   * `chartOfAccountId` no longer exists (DB drift) are skipped instead of failing Prisma's required relation.
   */
  private static async loadJournalLinesWithCoaForConsolidated(journalEntryWhere: Record<string, unknown>) {
    const raw = await prisma.journalEntryLine.findMany({
      where: { journalEntry: { is: journalEntryWhere } },
      select: {
        chartOfAccountId: true,
        debitAmount: true,
        creditAmount: true,
        journalEntry: { select: { currencyId: true } },
      },
    });

    const ids = [...new Set(raw.map((r) => r.chartOfAccountId))];
    const coas = await prisma.chartOfAccounts.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        accountNo: true,
        accountName: true,
        accountType: true,
        financialStatement: true,
      },
    });
    const coaMap = new Map(coas.map((c) => [c.id, c]));

    const orphanCount = raw.filter((r) => !coaMap.has(r.chartOfAccountId)).length;
    if (orphanCount > 0) {
      console.warn(
        `[ConsolidatedReportService] Skipping ${orphanCount} journal line(s) with missing chart of account rows (orphan chartOfAccountId).`
      );
    }

    const out: Array<{
      chartOfAccountId: string;
      debitAmount: (typeof raw)[number]["debitAmount"];
      creditAmount: (typeof raw)[number]["creditAmount"];
      journalEntry: { currencyId: string | null };
      chartOfAccount: (typeof coas)[number];
    }> = [];

    for (const line of raw) {
      const coa = coaMap.get(line.chartOfAccountId);
      if (!coa) continue;
      out.push({
        chartOfAccountId: line.chartOfAccountId,
        debitAmount: line.debitAmount,
        creditAmount: line.creditAmount,
        journalEntry: line.journalEntry,
        chartOfAccount: coa,
      });
    }
    return out;
  }

  /**
   * Group Consolidation: merge optional `forecastEntityId` / `isEliminationEntry` scoping onto an
   * already-built GL reporting `where` (from `buildJournalEntryWhereForGlReporting`). Both are added
   * as additional top-level fields — Prisma combines them with that where's existing `AND` array via
   * implicit AND, no need to touch the shared helper. Omitting both keeps every existing caller's
   * behavior (whole-ledger, no entity/elimination filter) bit-for-bit unchanged.
   */
  private static applyConsolidationScope(
    where: Record<string, unknown>,
    scope: { forecastEntityId?: string; isEliminationEntry?: boolean }
  ): Record<string, unknown> {
    const scoped: Record<string, unknown> = { ...where };
    if (scope.forecastEntityId) {
      scoped.forecastEntityId = scope.forecastEntityId;
    }
    if (scope.isEliminationEntry !== undefined) {
      scoped.isEliminationEntry = scope.isEliminationEntry;
    }
    return scoped;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CONSOLIDATED BALANCE SHEET
  // ═══════════════════════════════════════════════════════════════════════════

  static async generateConsolidatedBalanceSheet(params: ConsolidatedBalanceSheetParams) {
    const { consolidationCurrencyId: consolidationCurrencyRaw, hideZeroBalances } = params;

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

    // Fetch ALL journal lines — no currency filter (optionally scoped by forecastEntityId / isEliminationEntry for Group Consolidation)
    const journalEntryWhere = this.applyConsolidationScope(
      buildJournalEntryWhereForGlReporting({ gte: startDate, lte: endDate }),
      params
    );

    const accounts = await prisma.chartOfAccounts.findMany({
      where: { financialStatement: { in: ["Balance Sheet", "Balance sheet"] }, isActive: true },
      orderBy: { accountNo: "asc" },
    });

    const journalLines = await this.loadJournalLinesWithCoaForConsolidated(journalEntryWhere);

    const rawCurrencyIds = new Set<string>();
    for (const line of journalLines) {
      if (line.journalEntry.currencyId) rawCurrencyIds.add(line.journalEntry.currencyId);
    }
    rawCurrencyIds.add(consolidationCurrencyRaw);

    const currencyResolution = await this.buildLegacyCurrencyResolutionMap(rawCurrencyIds);
    const consolidationCurrencyId =
      currencyResolution.get(consolidationCurrencyRaw) ?? consolidationCurrencyRaw;

    const targetCurrency = await prisma.currency.findUnique({ where: { id: consolidationCurrencyId } });
    if (!targetCurrency) throw new Error("Consolidation currency not found");

    // Collect distinct currencies (canonical ids) for FX
    const currencyIds = new Set<string>();
    for (const line of journalLines) {
      const raw = line.journalEntry.currencyId;
      if (!raw) continue;
      currencyIds.add(currencyResolution.get(raw) ?? raw);
    }
    currencyIds.add(consolidationCurrencyId);

    const rateCache = await this.buildRateCache(consolidationCurrencyId, endDate, currencyIds);

    // Accumulate per (account, sourceCurrency) → source amount
    type AccCcyKey = string; // accountId|currencyId
    const sourceAmounts = new Map<AccCcyKey, { sourceAmount: number; accountType: string; accountName: string }>();
    const earningsBySource = new Map<string, number>();

    for (const line of journalLines) {
      const accId = line.chartOfAccountId;
      const rawCcy = line.journalEntry.currencyId;
      const ccyId = rawCcy ? currencyResolution.get(rawCcy) ?? rawCcy : null;
      if (!ccyId) continue;
      const key: AccCcyKey = `${accId}|${ccyId}`;
      const entry = sourceAmounts.get(key) ?? { sourceAmount: 0, accountType: line.chartOfAccount.accountType, accountName: line.chartOfAccount.accountName };

      const debit = new Decimal(line.debitAmount).toNumber();
      const credit = new Decimal(line.creditAmount).toNumber();
      const accountType = line.chartOfAccount.accountType;
      const accountName = line.chartOfAccount.accountName.toLowerCase();

      // assets (a contra asset such as accumulated depreciation included) as debit − credit, so a contra balance is
      // negative and reduces its section; it was credit − debit and added to fixed assets
      const delta = accountType.includes("Asset") ? debit - credit : credit - debit;
      // income-statement accounts roll into equity as earnings (they were left out, so the sheet never balanced)
      if (String(line.chartOfAccount.financialStatement || "").toLowerCase().includes("income")) {
        earningsBySource.set(ccyId, (earningsBySource.get(ccyId) ?? 0) + (credit - debit));
        continue;
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
    // the chart's own type is "Long-Term Liability" (it was matched as "Long-term Liability" and so left out)
    const longTermLiabilities = allAccounts.filter((a) => /^(long-term|non-current) liability$/i.test(a.accountType));
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

    const earnings = Math.round([...earningsBySource.entries()].reduce((s, [cid, amt]) => s + amt * ((rateCache.get(cid) ?? { rate: 1 }).rate), 0) * 100) / 100;
    const earningsLine: ConsolidatedAccount = {
      accountId: "earnings", accountNo: "", accountName: "Retained and current earnings", accountType: "Equity", balance: earnings,
      currencyBreakdown: [...earningsBySource.entries()].map(([cid, amt]) => { const r = rateCache.get(cid) ?? { rate: 1, code: "???" }; return { sourceCurrency: r.code, sourceCurrencyId: cid, sourceAmount: Math.round(amt * 100) / 100, conversionRate: r.rate, consolidatedAmount: Math.round(amt * r.rate * 100) / 100 }; }),
    };
    equityAccounts.push(earningsLine);
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
    const { startDate, endDate, consolidationCurrencyId: consolidationCurrencyRaw } = params;

    const sd = new Date(startDate);
    sd.setHours(0, 0, 0, 0);
    const ed = new Date(endDate);
    ed.setHours(23, 59, 59, 999);

    // Fetch ALL posted JE lines — no currency filter (optionally scoped by forecastEntityId / isEliminationEntry for Group Consolidation)
    const journalEntryWhere = this.applyConsolidationScope(
      buildJournalEntryWhereForGlReporting({ gte: sd, lte: ed }),
      params
    );

    const journalLines = await this.loadJournalLinesWithCoaForConsolidated(journalEntryWhere);

    const rawCurrencyIds = new Set<string>();
    for (const line of journalLines) {
      if (line.journalEntry.currencyId) rawCurrencyIds.add(line.journalEntry.currencyId);
    }
    rawCurrencyIds.add(consolidationCurrencyRaw);

    const currencyResolution = await this.buildLegacyCurrencyResolutionMap(rawCurrencyIds);
    const consolidationCurrencyId =
      currencyResolution.get(consolidationCurrencyRaw) ?? consolidationCurrencyRaw;

    const targetCurrency = await prisma.currency.findUnique({ where: { id: consolidationCurrencyId } });
    if (!targetCurrency) throw new Error("Consolidation currency not found");

    // Only income statement accounts
    const isIncomeStatementAccount = (fs: string | null) =>
      fs && (fs.toLowerCase().includes("income") || fs.toLowerCase().includes("profit"));

    const incomeLines = journalLines.filter((l) => isIncomeStatementAccount(l.chartOfAccount.financialStatement));

    const currencyIds = new Set<string>();
    for (const l of incomeLines) {
      const raw = l.journalEntry.currencyId;
      if (raw) currencyIds.add(currencyResolution.get(raw) ?? raw);
    }
    currencyIds.add(consolidationCurrencyId);

    const rateCache = await this.buildRateCache(consolidationCurrencyId, ed, currencyIds);

    // Accumulate per (account, sourceCurrency)
    type AccCcyKey = string;
    const sourceAmounts = new Map<AccCcyKey, number>();

    const accountMeta = new Map<string, { accountNo: string; accountName: string; accountType: string }>();

    for (const line of incomeLines) {
      const accId = line.chartOfAccountId;
      const rawCcy = line.journalEntry.currencyId;
      const ccyId = rawCcy ? currencyResolution.get(rawCcy) ?? rawCcy : null;
      if (!ccyId) continue;
      const key: AccCcyKey = `${accId}|${ccyId}`;

      const debit = new Decimal(line.debitAmount).toNumber();
      const credit = new Decimal(line.creditAmount).toNumber();
      const accountType = line.chartOfAccount.accountType;

      // revenue and other income are credit-normal ("Income" was given the expense sign)
      const delta = accountType === "Revenue" || accountType === "Income" ? credit - debit : debit - credit;

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

    // Categorise into sections — tax first: an account like "Corporate Tax Expense" carries accountType "Expense" AND
    // matches the tax name check, so classifying expenses before tax put it in both sections and subtracted it twice
    // (revenue − doubled-up expenses = a loss overstated by the tax amount on every consolidated/entity income
    // statement; live example: Corporate Tax Expense $1,000 made YTD net income read −$552,466.49 instead of the
    // correct −$551,466.49, same figure the Command Centre and CEO View KPI already computed correctly). Each
    // account now lands in exactly one of these four sections.
    const revenueAccounts = consolidatedAccounts.filter((a) => a.accountType === "Revenue" || a.accountType === "Income");
    const taxAccounts = consolidatedAccounts.filter((a) =>
      a.accountType === "Tax" || a.accountName.toLowerCase().includes("income tax") || a.accountName.toLowerCase().includes("tax expense")
    );
    const expenseAccounts = consolidatedAccounts.filter((a) =>
      !revenueAccounts.includes(a) &&
      !taxAccounts.includes(a) &&
      (a.accountType === "Expense" || a.accountType === "Cost of Goods Sold" || a.accountType === "Operating Expense")
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

  // ═══════════════════════════════════════════════════════════════════════════
  //  GROUP CONSOLIDATION SUMMARY (multi-entity)
  // ═══════════════════════════════════════════════════════════════════════════

  private static round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /**
   * One entity's own GL summary — reuses the exact same currency-consolidation math as the
   * standalone balance sheet / income statement reports, just scoped via forecastEntityId.
   * Excludes that entity's own elimination-flagged journals (isEliminationEntry: false) so a
   * multi-entity caller can add these up and separately net out eliminations without double-counting.
   */
  private static async buildEntityGlSummary(
    entity: { id: string; name: string; type: string },
    asOfDate: Date,
    periodStart: Date,
    periodEnd: Date,
    consolidationCurrencyId: string
  ) {
    const [bs, is] = await Promise.all([
      this.generateConsolidatedBalanceSheet({
        asOfDate,
        consolidationCurrencyId,
        hideZeroBalances: true,
        forecastEntityId: entity.id,
        isEliminationEntry: false,
      }),
      this.generateConsolidatedIncomeStatement({
        startDate: periodStart,
        endDate: periodEnd,
        consolidationCurrencyId,
        forecastEntityId: entity.id,
        isEliminationEntry: false,
      }),
    ]);

    return {
      forecastEntityId: entity.id,
      entityName: entity.name,
      entityType: entity.type,
      balanceSheet: {
        totalAssets: bs.assets.totalAssets,
        totalLiabilities: bs.liabilities.totalLiabilities,
        totalEquity: bs.equity.total,
        isBalanced: bs.isBalanced,
      },
      incomeStatement: {
        revenue: is.sections.revenue.total,
        expenses: is.sections.operatingExpenses.total,
        netIncome: is.totals.netIncome,
      },
    };
  }

  /**
   * Group Consolidation summary. Two modes:
   *  - `forecastEntityId` given: returns that one entity's own GL summary.
   *  - omitted: returns EVERY active ForecastEntity's own summary, plus an `eliminations` line
   *    (the sum of all `isEliminationEntry: true` journals, ledger-wide) and a `consolidated`
   *    total = combined (sum of all entities) MINUS eliminations — netted out as its own visible
   *    layer rather than silently folded into the combined figure.
   */
  static async getConsolidationSummary(params: ConsolidationSummaryParams) {
    const asOfDate = params.asOfDate ?? new Date();
    const periodStart = params.periodStart ?? new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);
    const periodEnd = params.periodEnd ?? asOfDate;
    const { consolidationCurrencyId } = params;

    if (params.forecastEntityId) {
      const entity = await prisma.forecastEntity.findUnique({
        where: { id: params.forecastEntityId },
        select: { id: true, name: true, type: true, isActive: true },
      });
      if (!entity) {
        throw new Error(`ForecastEntity not found: ${params.forecastEntityId}`);
      }
      const summary = await this.buildEntityGlSummary(entity, asOfDate, periodStart, periodEnd, consolidationCurrencyId);
      return {
        scope: "SINGLE_ENTITY" as const,
        asOfDate,
        period: { startDate: periodStart, endDate: periodEnd },
        consolidationCurrencyId,
        entity: summary,
        generatedAt: new Date(),
      };
    }

    const entities = await prisma.forecastEntity.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true, type: true },
    });

    const entitySummaries = await Promise.all(
      entities.map((e) => this.buildEntityGlSummary(e, asOfDate, periodStart, periodEnd, consolidationCurrencyId))
    );

    // Eliminations: every isEliminationEntry=true journal, ledger-wide (not scoped to one entity —
    // a human posts these at the group layer to net out inter-entity balances/activity).
    const [elimBs, elimIs] = await Promise.all([
      this.generateConsolidatedBalanceSheet({
        asOfDate,
        consolidationCurrencyId,
        hideZeroBalances: true,
        isEliminationEntry: true,
      }),
      this.generateConsolidatedIncomeStatement({
        startDate: periodStart,
        endDate: periodEnd,
        consolidationCurrencyId,
        isEliminationEntry: true,
      }),
    ]);
    const eliminations = {
      totalAssets: elimBs.assets.totalAssets,
      totalLiabilities: elimBs.liabilities.totalLiabilities,
      totalEquity: elimBs.equity.total,
      revenue: elimIs.sections.revenue.total,
      expenses: elimIs.sections.operatingExpenses.total,
      netIncome: elimIs.totals.netIncome,
    };

    const zero = { totalAssets: 0, totalLiabilities: 0, totalEquity: 0, revenue: 0, expenses: 0, netIncome: 0 };
    const combinedBeforeEliminations = entitySummaries.reduce(
      (acc, e) => ({
        totalAssets: acc.totalAssets + e.balanceSheet.totalAssets,
        totalLiabilities: acc.totalLiabilities + e.balanceSheet.totalLiabilities,
        totalEquity: acc.totalEquity + e.balanceSheet.totalEquity,
        revenue: acc.revenue + e.incomeStatement.revenue,
        expenses: acc.expenses + e.incomeStatement.expenses,
        netIncome: acc.netIncome + e.incomeStatement.netIncome,
      }),
      { ...zero }
    );
    for (const k of Object.keys(combinedBeforeEliminations) as Array<keyof typeof combinedBeforeEliminations>) {
      combinedBeforeEliminations[k] = this.round2(combinedBeforeEliminations[k]);
    }

    const consolidated = {
      totalAssets: this.round2(combinedBeforeEliminations.totalAssets - eliminations.totalAssets),
      totalLiabilities: this.round2(combinedBeforeEliminations.totalLiabilities - eliminations.totalLiabilities),
      totalEquity: this.round2(combinedBeforeEliminations.totalEquity - eliminations.totalEquity),
      revenue: this.round2(combinedBeforeEliminations.revenue - eliminations.revenue),
      expenses: this.round2(combinedBeforeEliminations.expenses - eliminations.expenses),
      netIncome: this.round2(combinedBeforeEliminations.netIncome - eliminations.netIncome),
    };

    return {
      scope: "MULTI_ENTITY" as const,
      asOfDate,
      period: { startDate: periodStart, endDate: periodEnd },
      consolidationCurrencyId,
      entities: entitySummaries,
      eliminations,
      combinedBeforeEliminations,
      consolidated,
      generatedAt: new Date(),
    };
  }
}
