// @ts-nocheck
/**
 * Exchange rates as stored (exchange_rates): the rate table the ledger converts with (SRD ACC-FX-03: historical and
 * critical), not the live quote. GET /rates lists them (newest first) with the latest per pair; POST /rates records one
 * (a date already rated is corrected, keeping the old value in the audit log with the reason); GET /exposure summarises
 * what the organisation holds in each non-base currency, translated at the latest rate. Mounted under
 * /api/accounting/multi-currency (Accounting access guard: reading for accounting readers, writing for preparers).
 */
import { Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "../utils/database";
import AuditService from "../services/AuditService";

const n = (v: any) => (v == null ? 0 : Number(v.toString()) || 0);
const r2 = (x: number) => Math.round(x * 100) / 100;
const fail = (m: string, statusCode = 400) => Object.assign(new Error(m), { statusCode });
const run = (fn) => async (req: AuthRequest, res: Response) => {
  try { res.json({ success: true, data: await fn(req) }); }
  catch (e: any) { res.status(typeof e?.statusCode === "number" ? e.statusCode : 500).json({ success: false, message: e?.message || "Error" }); }
};
const SEL = { id: true, date: true, rate: true, source: true, isActive: true, createdAt: true, fromCurrency: { select: { id: true, code: true } }, toCurrency: { select: { id: true, code: true } }, createdBy: { select: { firstName: true, lastName: true, email: true } } };
const shape = (r) => ({ id: r.id, date: r.date, rate: n(r.rate), pair: `${r.fromCurrency.code}/${r.toCurrency.code}`, from: r.fromCurrency.code, to: r.toCurrency.code, source: r.source || "TABLE", createdAt: r.createdAt, createdBy: r.createdBy ? [r.createdBy.firstName, r.createdBy.lastName].filter(Boolean).join(" ") || r.createdBy.email : null });

/** Units of `code` per one base unit at the latest rate on or before `asOf` (either direction stored). */
async function perBase(baseId: string, curId: string, asOf: Date): Promise<number | null> {
  if (curId === baseId) return 1;
  const direct = await prisma.exchangeRate.findFirst({ where: { fromCurrencyId: baseId, toCurrencyId: curId, isActive: true, date: { lte: asOf } }, orderBy: { date: "desc" } });
  if (direct && n(direct.rate) > 0) return n(direct.rate);
  const inverse = await prisma.exchangeRate.findFirst({ where: { fromCurrencyId: curId, toCurrencyId: baseId, isActive: true, date: { lte: asOf } }, orderBy: { date: "desc" } });
  if (inverse && n(inverse.rate) > 0) return 1 / n(inverse.rate);
  return null;
}

export const FxRatesController = {
  list: run(async (req) => {
    const { from, to, dateFrom, dateTo } = req.query as any;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "60"), 10) || 60, 1), 500);
    const cur = await prisma.currency.findMany({ select: { id: true, code: true } });
    const idOf = (code) => (code ? cur.find((c) => c.code.toUpperCase() === String(code).toUpperCase())?.id : undefined);
    const where: any = { isActive: true };
    if (from) where.fromCurrencyId = idOf(from) || "none";
    if (to) where.toCurrencyId = idOf(to) || "none";
    if (dateFrom || dateTo) where.date = { ...(dateFrom ? { gte: new Date(`${String(dateFrom).slice(0, 10)}T00:00:00Z`) } : {}), ...(dateTo ? { lte: new Date(`${String(dateTo).slice(0, 10)}T23:59:59Z`) } : {}) };
    const rows = await prisma.exchangeRate.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: limit, select: SEL });
    const pairs = await prisma.exchangeRate.groupBy({ by: ["fromCurrencyId", "toCurrencyId"], where: { isActive: true } });
    const latest = [];
    for (const p of pairs) {
      const r = await prisma.exchangeRate.findFirst({ where: { fromCurrencyId: p.fromCurrencyId, toCurrencyId: p.toCurrencyId, isActive: true }, orderBy: { date: "desc" }, select: SEL });
      const prev = r && (await prisma.exchangeRate.findFirst({ where: { fromCurrencyId: p.fromCurrencyId, toCurrencyId: p.toCurrencyId, isActive: true, date: { lt: r.date } }, orderBy: { date: "desc" }, select: { rate: true, date: true } }));
      if (r) latest.push({ ...shape(r), previous: prev ? { rate: n(prev.rate), date: prev.date } : null });
    }
    const base = await prisma.currency.findFirst({ where: { isDefault: true }, select: { code: true } });
    return { baseCurrency: base?.code || null, latest, rates: rows.map(shape) };
  }),

  /** Record a rate for a date (UTC day). A date already rated is corrected: the old value and the reason are audited. */
  upsert: run(async (req) => {
    const { from, to, date, rate, reason } = req.body || {};
    const value = Number(rate);
    if (!(value > 0)) throw fail("The rate must be a positive number.");
    const day = String(date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw fail("Give the date the rate applies to (YYYY-MM-DD).");
    const { default: FiscalCalendarService } = await import("../services/FiscalCalendarService");
    const tz = await FiscalCalendarService.getFiscalTimezone().catch(() => "Africa/Harare");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (day > today) throw fail("A rate cannot be entered for a future date.");
    const cur = await prisma.currency.findMany({ select: { id: true, code: true } });
    const f = cur.find((c) => c.code.toUpperCase() === String(from || "").toUpperCase()), t = cur.find((c) => c.code.toUpperCase() === String(to || "").toUpperCase());
    if (!f || !t || f.id === t.id) throw fail("Choose two different currencies.");
    const when = new Date(`${day}T00:00:00.000Z`);
    const existing = await prisma.exchangeRate.findUnique({ where: { date_fromCurrencyId_toCurrencyId: { date: when, fromCurrencyId: f.id, toCurrencyId: t.id } } });
    if (existing && !String(reason || "").trim()) throw fail(`${f.code}/${t.code} already has a rate for ${day} (${n(existing.rate)}); give the reason for correcting it.`);
    const row = existing
      ? await prisma.exchangeRate.update({ where: { id: existing.id }, data: { rate: String(value), source: "MANUAL", isActive: true, createdById: req.user.id }, select: SEL })
      : await prisma.exchangeRate.create({ data: { date: when, fromCurrencyId: f.id, toCurrencyId: t.id, rate: String(value), source: "MANUAL", isActive: true, createdById: req.user.id }, select: SEL });
    await AuditService.log({ userId: req.user.id, action: existing ? "UPDATE" : "CREATE", entityType: "ExchangeRate", entityId: row.id, oldValues: existing ? { rate: n(existing.rate), source: existing.source } : null, newValues: { pair: `${f.code}/${t.code}`, date: day, rate: value, source: "MANUAL", reason: reason || null } }).catch(() => null);
    return { ...shape(row), corrected: !!existing };
  }),

  /** What is held in each non-base currency: bank accounts (cashbook), short-term investments, open customer invoices
   *  and supplier bills, in that currency and in the base currency at the latest rate. */
  exposure: run(async () => {
    const base = await prisma.currency.findFirst({ where: { isDefault: true }, select: { id: true, code: true } });
    if (!base) throw fail("No base currency is set.");
    const now = new Date();
    const currencies = await prisma.currency.findMany({ where: { isActive: true, NOT: { id: base.id } }, select: { id: true, code: true } });
    const out = [];
    for (const c of currencies) {
      const [banks, sti, ar, ap] = await Promise.all([
        prisma.bank.findMany({ where: { currencyId: c.id, isActive: true }, select: { id: true, name: true } }),
        prisma.shortTermInvestmentInstrument.findMany({ where: { currencyId: c.id, status: "ACTIVE" }, select: { name: true, principal: true, accruals: { orderBy: { accrualDate: "desc" }, take: 1, select: { runningAccruedBalance: true } } } }),
        prisma.invoice.aggregate({ where: { currencyId: c.id, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE", "APPROVED", "POSTED"] } }, _sum: { totalAmount: true }, _count: { _all: true } }).catch(() => ({ _sum: { totalAmount: 0 }, _count: { _all: 0 } })),
        prisma.purchaseInvoice.aggregate({ where: { currencyId: c.id, status: { notIn: ["DRAFT", "CANCELLED", "VOID", "REJECTED"] }, paymentStatus: { not: "PAID" } }, _sum: { totalAmount: true }, _count: { _all: true } }).catch(() => ({ _sum: { totalAmount: 0 }, _count: { _all: 0 } })),
      ]);
      const bankLines = [];
      for (const b of banks) {
        const g = await prisma.cashbookEntry.groupBy({ by: ["type"], where: { bankId: b.id, status: "POSTED" }, _sum: { amount: true } });
        const bal = r2(n(g.find((x) => x.type === "RECEIPT")?._sum.amount) - n(g.find((x) => x.type === "PAYMENT")?._sum.amount));
        bankLines.push({ name: b.name, balance: bal });
      }
      const stiTotal = r2(sti.reduce((t, i) => t + n(i.principal) + n(i.accruals[0]?.runningAccruedBalance), 0));
      const rate = await perBase(base.id, c.id, now);
      const items = [
        { kind: "Bank accounts", count: banks.length, amount: r2(bankLines.reduce((t, b) => t + b.balance, 0)), detail: bankLines },
        { kind: "Short-term investments", count: sti.length, amount: stiTotal },
        { kind: "Customer invoices (open, invoice totals)", count: ar._count._all, amount: r2(n(ar._sum.totalAmount)) },
        { kind: "Supplier bills (unpaid, bill totals)", count: ap._count._all, amount: r2(-n(ap._sum.totalAmount)) },
      ].map((i) => ({ ...i, inBase: rate ? r2(i.amount / rate) : null }));
      const net = r2(items.reduce((t, i) => t + i.amount, 0));
      out.push({ currency: c.code, ratePerBase: rate, items, net, netInBase: rate ? r2(net / rate) : null, missingRate: !rate });
    }
    return { baseCurrency: base.code, asOf: now, currencies: out };
  }),
};
