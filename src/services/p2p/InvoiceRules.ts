//@ts-nocheck
/**
 * §23 Invoices: the supplier's own invoice number (what makes a duplicate a duplicate), the figures on the supplier's invoice
 * (its own VAT, not a recomputation), and the links to the receipt and the procurement event.
 */
import { prisma } from "../../utils/database";
import { getP2pConfig } from "./P2pSettings";

const fail = (message: string, status = 400, code?: string) => Object.assign(new Error(message), { status, statusCode: status, code });
const money = (n: number) => Math.round(n * 100) / 100;

/** "INV-001", "inv 001" and "Inv/001" are the same invoice: uppercase letters and digits only. */
export function invoiceKey(raw: unknown): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 128);
}

export function cleanInvoiceNumber(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 128);
}

/** Refuses an invoice number this supplier has already used, naming the invoice it collides with. */
export async function assertNotDuplicate(vendorId: string, key: string, excludeId?: string) {
  if (!key) return;
  const other: any = await prisma.procurementInvoice.findFirst({
    where: { vendorId, supplierInvoiceKey: key, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, invoiceNumber: true, supplierInvoiceNumber: true, status: true, invoiceDate: true },
  });
  if (other) {
    throw fail(
      `Duplicate invoice: this supplier has already submitted invoice ${other.supplierInvoiceNumber || key} (recorded as ${other.invoiceNumber}, ${String(other.status).toLowerCase()}, dated ${new Date(other.invoiceDate).toISOString().slice(0, 10)}).`,
      409,
      "DUPLICATE_INVOICE"
    );
  }
}

/** True when a Prisma error is the unique index on (vendor, supplier invoice key): two people saved the same number at once. */
export function isDuplicateKeyError(e: any): boolean {
  if (e?.code !== "P2002") return false;
  const t = e.meta?.target;
  const fields = Array.isArray(t) ? t : t != null ? [t] : [];
  return fields.some((x: string) => String(x).includes("supplier_invoice_key") || String(x).includes("supplierInvoiceKey") || String(x).includes("vendor_supplier_key"));
}

/**
 * The invoice's figures. Subtotal is the sum of its lines. VAT is the supplier's own figure when it states one (recorded as
 * STATED, and compared with what the order implies at matching), otherwise it is worked out at the order's own VAT rate (COMPUTED).
 * A stated subtotal or total that does not reconcile with the lines is refused: totals are never free-typed.
 */
export async function resolveFigures(input: {
  items: Array<{ quantity: number; unitPrice: number }>;
  po?: { subtotal?: any; taxAmount?: any } | null;
  statedSubtotal?: number | null;
  statedTax?: number | null;
  statedTotal?: number | null;
  activeVat: (subtotal: number) => number;
}) {
  const cfg = await getP2pConfig();
  const subtotal = money(input.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0));
  const tol = Math.max(cfg.matchAmountToleranceAbs, 0.01);
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const ss = num(input.statedSubtotal);
  const st = num(input.statedTax);
  const sT = num(input.statedTotal);
  for (const [label, v] of [["subtotal", ss], ["VAT", st], ["total", sT]] as const) {
    if (v != null && (!Number.isFinite(v) || v < 0)) throw fail(`The invoice ${label} must be a number of zero or more.`);
  }
  if (ss != null && Math.abs(ss - subtotal) > tol) {
    throw fail(`The subtotal stated on the invoice (${money(ss)}) does not reconcile with its lines (${subtotal}). Correct the lines or the subtotal.`, 400, "TOTALS_DO_NOT_RECONCILE");
  }
  let taxAmount: number;
  let taxSource: "STATED" | "COMPUTED";
  if (st != null) {
    taxAmount = money(st);
    taxSource = "STATED";
  } else {
    const poSub = Number(input.po?.subtotal ?? 0);
    const poTax = Number(input.po?.taxAmount ?? 0);
    taxAmount = poSub > 0 ? money(subtotal * (poTax / poSub)) : money(input.activeVat(subtotal));
    taxSource = "COMPUTED";
  }
  const total = money(subtotal + taxAmount);
  if (sT != null && Math.abs(sT - total) > tol) {
    throw fail(`The total stated on the invoice (${money(sT)}) does not equal its subtotal plus VAT (${total}).`, 400, "TOTALS_DO_NOT_RECONCILE");
  }
  return { subtotal, taxAmount, total, taxSource };
}

/** The receipt an invoice names must be one of its own order's receipts, and must not be a rejected one. */
export async function assertReceiptBelongs(grnId: string | null | undefined, purchaseOrderId: string) {
  if (!grnId) return null;
  const grn: any = await prisma.goodsReceivedNote.findUnique({ where: { id: grnId }, select: { id: true, grnNumber: true, purchaseOrderId: true, status: true } });
  if (!grn) throw fail("The receipt named on the invoice was not found.");
  if (grn.purchaseOrderId !== purchaseOrderId) throw fail(`Receipt ${grn.grnNumber} belongs to a different purchase order.`);
  if (String(grn.status).toUpperCase() === "REJECTED") throw fail(`Receipt ${grn.grnNumber} was rejected at inspection and cannot be invoiced against.`);
  return grn;
}
