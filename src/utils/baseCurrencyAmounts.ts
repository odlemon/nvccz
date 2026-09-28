// @ts-nocheck
/**
 * Base-currency amounts for journal lines (SRD ACC-GL-04 / ACC-FX-05, decision D17, finding FX-01).
 *
 * Every line is valued in the base currency at the rate locked when its journal was posted: a line in the base currency
 * at 1; a ZiG line at the journal's own USD/ZiG rate snapshot (recorded on every journal at creation); any other
 * currency at the stored rate for the journal's date (or the last one before it). The rate is part of the journal, so
 * the base amount of a posted line never changes afterwards.
 *
 * A report asked for in the base currency (or with no currency) covers every currency, each line at its base amount;
 * a report asked for in another currency covers that currency's journals in their own amounts.
 *
 * Use: select `usdZwgRateSnapshot`, `currencyId` and `transactionDate` on the journal and `recordedCurrencyId` on the
 * line, then `await toBaseAmounts(lines)` — each line's debitAmount / creditAmount become base amounts (Decimal), with
 * `baseRate` set; lines whose rate cannot be found are left out and returned in `untranslated`.
 */
import { Decimal } from "decimal.js";
import { prisma } from "./database";

const ZIG_CODES = new Set(["ZIG", "ZWG", "ZWL"]);

export type BaseContext = { baseId: string; baseCode: string; codes: Map<string, string>; rates: Map<string, Array<{ t: number; rate: number }>> };

export async function baseContext(): Promise<BaseContext> {
  const cur = await prisma.currency.findMany({ select: { id: true, code: true, isDefault: true } });
  const base = cur.find((c) => c.isDefault) || cur.find((c) => c.code === "USD");
  if (!base) throw new Error("No base currency is set.");
  const codes = new Map(cur.map((c) => [c.id, c.code]));
  // units of base per 1 unit of the currency, by date: from rates stored either way round
  const rows = await prisma.exchangeRate.findMany({ where: { isActive: true, OR: [{ fromCurrencyId: base.id }, { toCurrencyId: base.id }] }, select: { date: true, rate: true, fromCurrencyId: true, toCurrencyId: true }, orderBy: { date: "asc" } }).catch(() => []);
  const rates = new Map();
  for (const r of rows) {
    const other = r.fromCurrencyId === base.id ? r.toCurrencyId : r.fromCurrencyId;
    const v = Number(r.rate);
    if (!(v > 0)) continue;
    const perUnit = r.fromCurrencyId === base.id ? 1 / v : v;
    if (!rates.has(other)) rates.set(other, []);
    rates.get(other).push({ t: new Date(r.date).getTime(), rate: perUnit });
  }
  return { baseId: base.id, baseCode: base.code, codes, rates };
}

/** Units of base currency per one unit of the line's currency, or null when no rate is known. */
export function lineBaseRate(ctx: BaseContext, journal: { currencyId: string; usdZwgRateSnapshot?: any; transactionDate?: Date }, lineCurrencyId?: string | null): number | null {
  const cid = lineCurrencyId || journal.currencyId;
  if (!cid || cid === ctx.baseId) return 1;
  const code = ctx.codes.get(cid);
  const snap = Number(journal.usdZwgRateSnapshot ?? 0);
  if (code && ZIG_CODES.has(code) && ctx.baseCode === "USD" && snap > 0) return 1 / snap;
  const list = ctx.rates.get(cid);
  if (!list || !list.length) return null;
  const t = journal.transactionDate ? new Date(journal.transactionDate).getTime() : Date.now();
  let found = null;
  for (const r of list) { if (r.t <= t) found = r.rate; else break; }
  return found ?? list[0].rate;
}

/** True when a report in this currency covers every currency at base amounts. */
export async function isBaseReport(currencyId?: string | null, ctx?: BaseContext): Promise<boolean> {
  if (!currencyId) return true;
  const c = ctx || (await baseContext());
  return currencyId === c.baseId;
}

/** Replace each line's amounts with base amounts (in place). Returns the lines that could be valued and those that could not. */
export async function toBaseAmounts<T extends { debitAmount: any; creditAmount: any; recordedCurrencyId?: string | null; journalEntry: any }>(lines: T[], ctx?: BaseContext): Promise<{ lines: T[]; untranslated: T[] }> {
  const c = ctx || (await baseContext());
  const kept: T[] = [], untranslated: T[] = [];
  for (const l of lines) {
    const rate = lineBaseRate(c, l.journalEntry, l.recordedCurrencyId);
    if (rate == null) { untranslated.push(l); continue; }
    if (rate !== 1) {
      (l as any).debitAmount = new Decimal(String(l.debitAmount ?? 0)).times(rate).toDecimalPlaces(6);
      (l as any).creditAmount = new Decimal(String(l.creditAmount ?? 0)).times(rate).toDecimalPlaces(6);
    }
    (l as any).baseRate = rate;
    kept.push(l);
  }
  return { lines: kept, untranslated };
}

/** The same for journals fetched with their lines: each journal's lines become base amounts (in place); lines that
 *  cannot be valued are removed. Returns how many were left out. */
export async function journalsToBase(journals: any[], ctx?: BaseContext): Promise<number> {
  const c = ctx || (await baseContext());
  let dropped = 0;
  for (const j of journals) {
    const kept = [];
    for (const l of j.journalEntryLines || []) {
      const rate = lineBaseRate(c, j, l.recordedCurrencyId);
      if (rate == null) { dropped++; continue; }
      if (rate !== 1) {
        l.debitAmount = new Decimal(String(l.debitAmount ?? 0)).times(rate).toDecimalPlaces(6);
        l.creditAmount = new Decimal(String(l.creditAmount ?? 0)).times(rate).toDecimalPlaces(6);
      }
      l.baseRate = rate;
      kept.push(l);
    }
    j.journalEntryLines = kept;
  }
  return dropped;
}

/** The base currency's row (id, code, name) — what a report "in the base currency" is labelled with. */
export async function baseCurrencyRow() {
  return (await prisma.currency.findFirst({ where: { isDefault: true } })) || (await prisma.currency.findFirst({ where: { code: "USD" } })) || (await prisma.currency.findFirst({ where: { isActive: true } }));
}
