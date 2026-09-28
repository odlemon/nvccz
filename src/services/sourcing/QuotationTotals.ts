import { createHash } from "crypto";

/**
 * SRD §15: a quotation's Subtotal, VAT and Total are derived from its lines and a stated VAT rate, never free-typed.
 * Both submission routes (supplier portal and staff capture) use this, so the two produce the same figures for the same lines.
 */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** A rate given as 15 or 15% or 0.15 becomes the decimal 0.15. Zero is a valid (exempt) rate. */
export function normalizeVatRate(raw: unknown, fallbackDecimal: number): number {
  if (raw == null || String(raw).trim() === "") return fallbackDecimal;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("The VAT rate must be between 0 and 100 percent.");
  return n > 1 ? n / 100 : n;
}

export function computeTotals(items: Array<{ quantity: unknown; unitPrice: unknown }>, vatRateDecimal: number) {
  const lines = items.map((i) => {
    const q = Number(i.quantity);
    const p = Number(i.unitPrice);
    return { quantity: q, unitPrice: p, totalPrice: round2(q * p) };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.totalPrice, 0));
  const taxAmount = round2(subtotal * vatRateDecimal);
  return { lines, subtotal, taxAmount, totalAmount: round2(subtotal + taxAmount), vatRate: vatRateDecimal };
}

/** If the submitter also states totals (for example read off their document), they must agree with the lines. */
export function assertDeclaredTotalsReconcile(
  computed: { subtotal: number; taxAmount: number; totalAmount: number },
  declared: { subtotal?: unknown; taxAmount?: unknown; totalAmount?: unknown }
) {
  const check = (label: string, want: number, got: unknown) => {
    if (got == null || String(got).trim() === "") return;
    const n = Number(got);
    if (!Number.isFinite(n) || Math.abs(n - want) > 0.02) {
      throw new Error(`The stated ${label} (${Number.isFinite(n) ? n.toFixed(2) : String(got)}) does not agree with the lines: they give ${want.toFixed(2)}. Correct the lines or the figure.`);
    }
  };
  check("subtotal", computed.subtotal, declared.subtotal);
  check("VAT", computed.taxAmount, declared.taxAmount);
  check("total", computed.totalAmount, declared.totalAmount);
  const decSub = declared.subtotal != null && String(declared.subtotal).trim() !== "" ? Number(declared.subtotal) : null;
  const decTax = declared.taxAmount != null && String(declared.taxAmount).trim() !== "" ? Number(declared.taxAmount) : null;
  const decTot = declared.totalAmount != null && String(declared.totalAmount).trim() !== "" ? Number(declared.totalAmount) : null;
  if (decSub != null && decTax != null && decTot != null && Math.abs(decSub + decTax - decTot) > 0.02) {
    throw new Error("The stated subtotal plus VAT does not equal the stated total.");
  }
}

/** A stable JSON of the record as submitted; its hash proves later that nothing in it has changed. */
export function submissionSnapshot(q: any, items: any[]) {
  const num = (v: any) => (v == null ? null : Number(v).toFixed(2));
  return {
    quotationNumber: q.quotationNumber,
    quotationReference: q.quotationReference ?? null,
    quotationDate: q.quotationDate ? new Date(q.quotationDate).toISOString().slice(0, 10) : null,
    rfqNumber: q.rfqNumber ?? null,
    vendorId: q.vendorId ?? null,
    currencyCode: q.currencyCode,
    subtotal: num(q.subtotal),
    taxAmount: num(q.taxAmount),
    totalAmount: num(q.totalAmount),
    vatRate: q.vatRate == null ? null : Number(q.vatRate).toFixed(4),
    paymentTerms: q.paymentTerms ?? null,
    deliveryTerms: q.deliveryTerms ?? null,
    deliveryTime: q.deliveryTime ?? null,
    deliveryPeriodDays: q.deliveryPeriodDays ?? null,
    validUntil: q.validUntil ? new Date(q.validUntil).toISOString().slice(0, 10) : null,
    submissionMethod: q.submissionMethod ?? "VENDOR_PORTAL",
    submittedAt: q.submittedAt ? new Date(q.submittedAt).toISOString() : null,
    items: items
      .map((i) => ({ itemName: i.itemName, quantity: num(i.quantity), unit: i.unit ?? null, unitPrice: num(i.unitPrice), totalPrice: num(i.totalPrice) }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}

export function hashSnapshot(snapshot: unknown): string {
  return createHash("sha256").update(JSON.stringify(snapshot), "utf8").digest("hex");
}
