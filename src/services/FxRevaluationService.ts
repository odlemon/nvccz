// @ts-nocheck
/**
 * Month-end revaluation of foreign-currency balances (SRD ACC-FX-05, decision D17, finding FX-01).
 *
 * For every monetary account (bank accounts, receivables, payables, VAT, other current and long-term liabilities) that
 * holds lines in a currency other than the base: its balance in that currency, valued at the closing rate for the date,
 * against what it is carried at in the base currency (each line at the rate locked when it was posted, plus earlier
 * revaluations of that currency on that account). The difference is the unrealised gain or loss: one draft journal in
 * the base currency, a line per account and currency, balanced against 4050 Unrealised Foreign Exchange Gain/Loss, for
 * an approver to post. Only the movement since the last revaluation is booked, so running it again finds nothing.
 */
import { Decimal } from "decimal.js";
import { prisma } from "../utils/database";
import { baseContext, lineBaseRate } from "../utils/baseCurrencyAmounts";
import { buildJournalEntryWhereForGlReporting } from "../utils/journalEntryReportingFilter";
import { assignNextAuditIdAndCreateJournal } from "./AuditTrailSequenceService";

const r2 = (x: number) => Math.round(x * 100) / 100;
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const FX_ACCOUNT_NO = "4050";
/** A revaluation line's description names its currency, so the next run knows what it already booked. */
const tagOf = (code: string) => `FX revaluation (${code})`;

function isMonetary(a: { accountNo: string; accountName: string; accountType: string }, bankGl: Set<string>, id: string) {
  if (bankGl.has(id)) return true;
  if (/^(Current Liability|Long-Term Liability|Long-term Liability)$/i.test(a.accountType)) return true;
  return a.accountType === "Current Asset" && /receivable|vat input|deposit|loan|cash|bank/i.test(a.accountName);
}

export class FxRevaluationService {
  /** What revaluing at the end of `asOf` (YYYY-MM-DD) would book, per account and currency. */
  static async preview(asOf: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw fail("Give the revaluation date (YYYY-MM-DD).");
    const ctx = await baseContext();
    const end = new Date(`${asOf}T23:59:59.999Z`);
    const bankGl = new Set((await prisma.bank.findMany({ where: { glAccountId: { not: null } }, select: { glAccountId: true } })).map((b) => b.glAccountId));
    const foreign = [...ctx.codes.keys()].filter((id) => id !== ctx.baseId);
    if (!foreign.length) return { asOf, baseCurrency: ctx.baseCode, rows: [], total: 0 };
    // native lines in a foreign currency on any account, posted through the date
    const lines = await prisma.journalEntryLine.findMany({
      where: { journalEntry: { ...buildJournalEntryWhereForGlReporting({ lte: end }), currencyId: { in: foreign } } },
      select: { chartOfAccountId: true, debitAmount: true, creditAmount: true, recordedCurrencyId: true, journalEntry: { select: { currencyId: true, usdZwgRateSnapshot: true, transactionDate: true } }, chartOfAccount: { select: { accountNo: true, accountName: true, accountType: true } } },
    });
    // earlier revaluations: base-currency lines tagged with the currency they revalued
    const prior = await prisma.journalEntryLine.findMany({
      where: { description: { startsWith: "FX revaluation (" }, journalEntry: { ...buildJournalEntryWhereForGlReporting({ lte: end }), referenceNumber: { startsWith: "FXREV-" } } },
      select: { chartOfAccountId: true, debitAmount: true, creditAmount: true, description: true },
    });
    const byKey = new Map();
    for (const l of lines) {
      const cid = l.recordedCurrencyId || l.journalEntry.currencyId;
      if (!isMonetary(l.chartOfAccount, bankGl, l.chartOfAccountId)) continue;
      const k = `${l.chartOfAccountId}|${cid}`;
      const row = byKey.get(k) || { accountId: l.chartOfAccountId, account: `${l.chartOfAccount.accountNo} ${l.chartOfAccount.accountName}`, currencyId: cid, currency: ctx.codes.get(cid), native: new Decimal(0), carrying: new Decimal(0), untranslated: 0 };
      const net = new Decimal(String(l.debitAmount)).minus(String(l.creditAmount));
      row.native = row.native.plus(net);
      const rate = lineBaseRate(ctx, l.journalEntry, l.recordedCurrencyId);
      if (rate == null) row.untranslated++; else row.carrying = row.carrying.plus(net.times(rate));
      byKey.set(k, row);
    }
    for (const p of prior) {
      const code = (p.description.match(/^FX revaluation \(([^)]+)\)/) || [])[1];
      const cid = [...ctx.codes.entries()].find(([, c]) => c === code)?.[0];
      const row = byKey.get(`${p.chartOfAccountId}|${cid}`);
      if (row) row.carrying = row.carrying.plus(new Decimal(String(p.debitAmount)).minus(String(p.creditAmount)));
    }
    const rows = [];
    for (const row of byKey.values()) {
      const closing = lineBaseRate(ctx, { currencyId: row.currencyId, usdZwgRateSnapshot: null, transactionDate: end }, null);
      const native = row.native.toNumber(), carrying = r2(row.carrying.toNumber());
      if (closing == null) { rows.push({ ...row, native, carrying, closingRate: null, revalued: null, difference: null, note: "No closing rate" }); continue; }
      const revalued = r2(native * closing);
      const difference = r2(revalued - carrying);
      if (Math.abs(native) < 0.005 && Math.abs(difference) < 0.005) continue;
      rows.push({ accountId: row.accountId, account: row.account, currencyId: row.currencyId, currency: row.currency, native: r2(native), closingRate: closing, revalued, carrying, difference, untranslated: row.untranslated });
    }
    rows.sort((a, b) => a.account.localeCompare(b.account));
    return { asOf, baseCurrency: ctx.baseCode, rows, total: r2(rows.reduce((s, r) => s + (r.difference || 0), 0)) };
  }

  /** A draft journal booking the differences; an approver posts it. One per date. */
  static async prepare(asOf: string, userId: string) {
    // one standing revaluation per date; a voided one keeps its reference, so a new one takes the next (FXREV-date-2, …)
    const sameDay = await prisma.journalEntry.findMany({ where: { referenceNumber: { startsWith: `FXREV-${asOf}` } }, select: { referenceNumber: true, status: true } });
    const existing = sameDay.find((j) => j.status === "PENDING" || j.status === "POSTED");
    if (existing) throw fail(`A revaluation for ${asOf} is already ${existing.status === "POSTED" ? "posted" : "waiting to be posted"} (${existing.referenceNumber}).`, 409);
    const p = await FxRevaluationService.preview(asOf);
    const book = p.rows.filter((r) => r.difference != null && Math.abs(r.difference) >= 0.01);
    if (!book.length) throw fail("Nothing to revalue: every foreign-currency balance is already carried at the closing rate.", 409);
    const fx = await prisma.chartOfAccounts.findUnique({ where: { accountNo: FX_ACCOUNT_NO }, select: { id: true, isActive: true } });
    if (!fx || fx.isActive === false) throw fail(`${FX_ACCOUNT_NO} Unrealised Foreign Exchange Gain/Loss is missing or switched off.`, 409);
    const ctx = await baseContext();
    const net = r2(book.reduce((s, r) => s + r.difference, 0));
    const data = book.map((r) => ({ chartOfAccountId: r.accountId, debitAmount: new Decimal(Math.max(r.difference, 0)), creditAmount: new Decimal(Math.max(-r.difference, 0)), description: `${tagOf(r.currency)} at ${r.closingRate}: ${r.currency} ${r.native.toLocaleString("en-US", { minimumFractionDigits: 2 })}` }));
    if (Math.abs(net) >= 0.005) data.push({ chartOfAccountId: fx.id, debitAmount: new Decimal(Math.max(-net, 0)), creditAmount: new Decimal(Math.max(net, 0)), description: net > 0 ? "Unrealised foreign exchange gain" : "Unrealised foreign exchange loss" });
    const total = r2(data.reduce((s, l) => s + Number(l.debitAmount), 0));
    const je = await prisma.$transaction(async (tx) => {
      const reference = sameDay.length ? `FXREV-${asOf}-${sameDay.length + 1}` : `FXREV-${asOf}`;
      const j = await assignNextAuditIdAndCreateJournal(tx, { transactionDate: new Date(`${asOf}T12:00:00Z`), referenceNumber: reference, description: `Month-end revaluation of foreign-currency balances at ${asOf}`, currencyId: ctx.baseId, status: "PENDING", createdById: userId, totalAmount: new Decimal(total) }, { source: "API" });
      await tx.journalEntryLine.createMany({ data: data.map((l) => ({ ...l, journalEntryId: j.id })) });
      return j;
    });
    return { journal: { id: je.id, referenceNumber: je.referenceNumber, status: je.status, total }, net, lines: book.length };
  }
}

export default FxRevaluationService;
