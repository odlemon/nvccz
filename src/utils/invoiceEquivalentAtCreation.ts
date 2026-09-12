import { Decimal } from '@prisma/client/runtime/library';

export type InvoiceEquivalentCurrency = {
  id: string;
  code: string;
  name: string;
  symbol: string;
};

/** Single response field: total in the other leg of USD ↔ ZWG/ZWL at creation snapshot rate. */
export type InvoiceEquivalentAtCreation = {
  amount: string;
  currency: InvoiceEquivalentCurrency;
};

type InvoiceLike = {
  totalAmount: unknown;
  currency: { code: string };
  exchangeRateAtCreation?: unknown;
  usdZwgRateSnapshot?: unknown;
};

function snapshotRate(inv: InvoiceLike): number | null {
  const raw = inv.exchangeRateAtCreation ?? inv.usdZwgRateSnapshot;
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normCode(code: string): string {
  return String(code || '').trim().toUpperCase();
}

/**
 * Rate is ZWG (or ZWL) per 1 USD, same as Zimrate USD/ZWG avg.
 * - USD invoice → equivalent total in local (ZWG/ZWL) = totalAmount × rate
 * - ZWG/ZWL invoice → equivalent total in USD = totalAmount ÷ rate
 */
export function buildInvoiceEquivalentAtCreation(
  invoice: InvoiceLike,
  currencies: { usd: InvoiceEquivalentCurrency | null; local: InvoiceEquivalentCurrency | null }
): InvoiceEquivalentAtCreation | null {
  const rate = snapshotRate(invoice);
  if (rate == null) return null;

  const base = normCode(invoice.currency.code);
  const total = new Decimal(invoice.totalAmount as any);

  if (base === 'USD') {
    if (!currencies.local) return null;
    const equiv = total.mul(rate);
    return {
      amount: equiv.toDecimalPlaces(2).toString(),
      currency: currencies.local
    };
  }

  if (base === 'ZWL' || base === 'ZWG' || base === 'ZIG') {
    if (!currencies.usd) return null;
    const equiv = total.div(rate);
    return {
      amount: equiv.toDecimalPlaces(2).toString(),
      currency: currencies.usd
    };
  }

  return null;
}
