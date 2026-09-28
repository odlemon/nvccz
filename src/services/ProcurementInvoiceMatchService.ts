// @ts-nocheck
import { prisma } from "../utils/database";
import { getP2pConfig } from "./p2p/P2pSettings";

/**
 * §24 Three-way match: purchase order ↔ receipts ↔ invoice.
 *
 * Deterministic and re-runnable. It is evaluated when an invoice is created and again whenever a receipt on the same order is
 * recorded, approved or rejected, and immediately before an invoice is approved or paid, so the result always follows the receipts
 * and the invoices already on the order.
 *
 * Seven exception types, each detected on its own:
 *   MISSING_PO        the invoice is not linked to an order that exists
 *   MISSING_RECEIPT   the order has no receipt that stands (none recorded, or every one rejected at inspection)
 *   QTY_MISMATCH      a line bills more than was accepted (or, for a service, more than was confirmed)
 *   VALUE_MISMATCH    a unit price, or the invoice subtotal, is outside the configured tolerance of the order
 *   TAX_MISMATCH      the VAT on the invoice is not what the order's VAT rate gives for its subtotal, beyond tolerance
 *   EXCESS_INVOICE    across this and the other invoices on the order, more is billed than was ordered or received
 *   DUPLICATE_INVOICE the supplier's invoice number already exists for this supplier (or the same order, total and date window)
 * plus LINE_NOT_ON_PO for a line that matches nothing on the order.
 *
 * `ProcurementInvoice.matchingStatus`: MATCHED | DISCREPANCY | AWAITING_RECEIPT | NO_PO.
 * The result (exceptions with messages, per-line figures, the tolerances applied) is stored in `matchResult`, and mirrored in
 * `aiDiscrepancies.flags` for the screens and alerts that read it.
 */

export type MatchException = {
  type: string;
  severity: "BLOCKING" | "WARNING";
  message: string;
  line?: number;
  itemName?: string;
  detail?: Record<string, unknown>;
};

export type ProcurementMatchResult = {
  status: "MATCHED" | "DISCREPANCY" | "AWAITING_RECEIPT" | "NO_PO";
  flags: MatchException[];
  exceptions: MatchException[];
  detail: Record<string, unknown>;
};

const EPS = 1e-6;
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const money = (v: number) => Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export class ProcurementInvoiceMatchService {
  /** Evaluate one invoice and persist the result. Returns null when the invoice does not exist. */
  static async evaluate(invoiceId: string): Promise<ProcurementMatchResult | null> {
    const invoice = await prisma.procurementInvoice.findUnique({
      where: { id: invoiceId },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    if (!invoice) return null;

    const evaluatedAt = new Date().toISOString();
    const cfg = await getP2pConfig();
    const tolerances = {
      priceVariancePct: cfg.matchPriceVariancePct,
      quantityTolerancePct: cfg.matchQtyTolerancePct,
      valueTolerancePct: cfg.matchValueTolerancePct,
      taxTolerancePct: cfg.matchTaxTolerancePct,
      amountTolerance: cfg.matchAmountToleranceAbs,
    };

    if (!invoice.purchaseOrderId) {
      const exceptions: MatchException[] = [
        { type: "MISSING_PO", severity: "BLOCKING", message: "The invoice is not linked to a purchase order, so there is nothing to match it to." },
        ...(await this.duplicateFlags(invoice)),
      ];
      const result: ProcurementMatchResult = { status: "NO_PO", flags: exceptions, exceptions, detail: { evaluatedAt, tolerances, reason: "The invoice is not linked to a purchase order." } };
      await this.persist(invoice, result, new Map());
      return result;
    }

    const [po, grns, otherInvoices] = await Promise.all([
      prisma.purchaseOrder.findUnique({ where: { id: invoice.purchaseOrderId }, include: { items: { orderBy: { createdAt: "asc" } } } }),
      prisma.goodsReceivedNote.findMany({ where: { purchaseOrderId: invoice.purchaseOrderId, status: { notIn: ["REJECTED", "DRAFT"] } }, include: { items: true } }),
      prisma.procurementInvoice.findMany({
        // Each invoice is measured against the ones raised before it: what they already billed is not available again.
        where: { purchaseOrderId: invoice.purchaseOrderId, id: { not: invoice.id }, createdAt: { lte: invoice.createdAt }, status: { notIn: ["REJECTED"] } },
        include: { items: true },
      }),
    ]);
    if (!po) {
      const exceptions: MatchException[] = [{ type: "MISSING_PO", severity: "BLOCKING", message: "The purchase order this invoice was raised against no longer exists." }];
      const result: ProcurementMatchResult = { status: "NO_PO", flags: exceptions, exceptions, detail: { evaluatedAt, tolerances, reason: "The linked purchase order no longer exists." } };
      await this.persist(invoice, result, new Map());
      return result;
    }

    const poLines = po.items.filter((l) => String(l.lineStatus || "ACTIVE") !== "CANCELLED");

    // What has been accepted per PO line (a quantity, and for services an amount) across every receipt that stands.
    const accepted = new Map<string, number>();
    const acceptedAmount = new Map<string, number>();
    const serviceLines = new Set<string>();
    for (const g of grns) {
      for (const gi of g.items) {
        accepted.set(gi.purchaseOrderItemId, (accepted.get(gi.purchaseOrderItemId) ?? 0) + Number(gi.quantityAccepted ?? 0));
        if (String(gi.lineType || "GOODS").toUpperCase() === "SERVICE") {
          serviceLines.add(gi.purchaseOrderItemId);
          acceptedAmount.set(gi.purchaseOrderItemId, (acceptedAmount.get(gi.purchaseOrderItemId) ?? 0) + Number(gi.serviceAmount ?? 0));
        }
      }
    }
    const pendingInspection = grns.filter((g) => String(g.status).toUpperCase() !== "APPROVED").map((g) => g.grnNumber);

    // What the other invoices on the order have already billed against each line.
    const billedQty = new Map<string, number>();
    const billedAmount = new Map<string, number>();
    for (const o of otherInvoices) {
      for (const it of o.items) {
        if (!it.matchedPOItemId) continue;
        billedQty.set(it.matchedPOItemId, (billedQty.get(it.matchedPOItemId) ?? 0) + Number(it.quantity ?? 0));
        billedAmount.set(it.matchedPOItemId, (billedAmount.get(it.matchedPOItemId) ?? 0) + Number(it.totalPrice ?? 0));
      }
    }

    // Pair invoice lines with PO lines by item name, then description similarity, then position.
    const byName = new Map<string, typeof poLines>();
    for (const l of poLines) {
      const k = norm(l.itemName);
      byName.set(k, [...(byName.get(k) ?? []), l]);
    }
    const used = new Set<string>();
    const tokenSet = (s: string) => new Set(norm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2));
    const similarity = (a: string, b: string) => {
      const A = tokenSet(a);
      const B = tokenSet(b);
      if (!A.size || !B.size) return 0;
      let hit = 0;
      for (const t of A) if (B.has(t)) hit++;
      return hit / Math.max(A.size, B.size);
    };
    const pairing = new Map<string, (typeof poLines)[number] | null>();
    invoice.items.forEach((item, idx) => {
      const candidates = (byName.get(norm(item.itemName)) ?? []).filter((l) => !used.has(l.id));
      let hit = candidates[0] ?? null;
      if (!hit) {
        let best: { line: (typeof poLines)[number]; score: number } | null = null;
        const hay = `${item.itemName || ""} ${item.description || ""}`;
        for (const l of poLines) {
          if (used.has(l.id)) continue;
          const score = Math.max(similarity(hay, String(l.itemName || "")), similarity(hay, `${l.itemName || ""} ${l.description || ""}`));
          if (score >= 0.45 && (!best || score > best.score)) best = { line: l, score };
        }
        if (best) hit = best.line;
      }
      if (!hit && invoice.items.length === poLines.length && poLines[idx] && !used.has(poLines[idx].id)) hit = poLines[idx];
      if (hit) used.add(hit.id);
      pairing.set(item.id, hit);
    });

    const exceptions: MatchException[] = [];
    const qtyTol = 1 + cfg.matchQtyTolerancePct / 100;

    if (!grns.length) {
      exceptions.push({ type: "MISSING_RECEIPT", severity: "BLOCKING", message: `${po.poNumber} has no receipt that stands (none has been recorded, or every one was rejected at inspection), so there is nothing to match the invoice to.` });
    }
    if (invoice.grnId) {
      const named = grns.find((g) => g.id === invoice.grnId);
      if (!named) exceptions.push({ type: "MISSING_RECEIPT", severity: "BLOCKING", message: "The receipt named on the invoice no longer stands (it was rejected or removed)." });
    }

    let expectedSubtotal = 0;
    let allPaired = true;
    const lines = invoice.items.map((item, idx) => {
      const line = idx + 1;
      const poLine = pairing.get(item.id);
      const invoicedQty = Number(item.quantity ?? 0);
      const invoiceUnitPrice = Number(item.unitPrice ?? 0);
      const invoicedAmount = Number(item.totalPrice ?? invoicedQty * invoiceUnitPrice);
      if (!poLine) {
        allPaired = false;
        exceptions.push({ type: "LINE_NOT_ON_PO", severity: "BLOCKING", line, itemName: item.itemName, message: `Line ${line}: "${item.itemName}" is not on the purchase order.` });
        return { line, itemName: item.itemName, purchaseOrderItemId: null, invoicedQty, invoiceUnitPrice, status: "UNMATCHED" };
      }
      const poUnitPrice = Number(poLine.unitPrice ?? 0);
      const orderedQty = Number(poLine.quantity ?? 0);
      const acceptedQty = accepted.get(poLine.id) ?? 0;
      const others = billedQty.get(poLine.id) ?? 0;
      const isService = serviceLines.has(poLine.id);
      let ok = true;

      // VALUE: the unit price against the order's, inside the configured price tolerance
      if (poUnitPrice > 0) {
        const variancePct = ((invoiceUnitPrice - poUnitPrice) / poUnitPrice) * 100;
        if (Math.abs(variancePct) > cfg.matchPriceVariancePct + 1e-9 && Math.abs(invoiceUnitPrice - poUnitPrice) > cfg.matchAmountToleranceAbs / Math.max(invoicedQty, 1)) {
          ok = false;
          exceptions.push({
            type: "VALUE_MISMATCH", severity: "BLOCKING", line, itemName: item.itemName,
            message: `Line ${line}: "${item.itemName}" is invoiced at ${money(invoiceUnitPrice)}; the order says ${money(poUnitPrice)} (${variancePct > 0 ? "+" : ""}${r2(variancePct)}%, tolerance ${cfg.matchPriceVariancePct}%).`,
            detail: { poUnitPrice, invoiceUnitPrice, variancePct: r2(variancePct), tolerancePct: cfg.matchPriceVariancePct },
          });
        }
      }
      expectedSubtotal += invoicedQty * poUnitPrice;

      // QUANTITY / EXCESS
      if (isService) {
        const confirmed = acceptedAmount.get(poLine.id) ?? 0;
        const othersAmt = billedAmount.get(poLine.id) ?? 0;
        const available = Math.max(0, confirmed - othersAmt);
        if (invoicedAmount > available * qtyTol + cfg.matchAmountToleranceAbs) {
          ok = false;
          const cumulative = othersAmt > 0;
          exceptions.push({
            type: cumulative ? "EXCESS_INVOICE" : "QTY_MISMATCH", severity: "BLOCKING", line, itemName: item.itemName,
            message: `Line ${line}: "${item.itemName}" bills ${money(invoicedAmount)} for a service; ${money(confirmed)} was confirmed${cumulative ? `, of which ${money(othersAmt)} is already billed on other invoices` : ""}.`,
            detail: { invoicedAmount, confirmed, billedOnOthers: othersAmt },
          });
        }
      } else {
        const available = Math.max(0, acceptedQty - others);
        if (others + invoicedQty > orderedQty * qtyTol + EPS) {
          ok = false;
          exceptions.push({
            type: "EXCESS_INVOICE", severity: "BLOCKING", line, itemName: item.itemName,
            message: `Line ${line}: "${item.itemName}" would be billed ${r4(others + invoicedQty)} across this and the other invoices on ${po.poNumber}; only ${orderedQty} was ordered.`,
            detail: { invoicedQty, billedOnOthers: others, orderedQty },
          });
        } else if (grns.length && invoicedQty > available * qtyTol + EPS) {
          ok = false;
          if (others > 0) {
            exceptions.push({
              type: "EXCESS_INVOICE", severity: "BLOCKING", line, itemName: item.itemName,
              message: `Line ${line}: "${item.itemName}" invoices ${invoicedQty}; ${acceptedQty} was accepted and ${others} of it is already billed on other invoices, leaving ${r4(available)}.`,
              detail: { invoicedQty, acceptedQty, billedOnOthers: others, available: r4(available) },
            });
          } else {
            exceptions.push({
              type: "QTY_MISMATCH", severity: "BLOCKING", line, itemName: item.itemName,
              message: `Line ${line}: "${item.itemName}" invoices ${invoicedQty}; receipts accepted ${acceptedQty}.`,
              detail: { invoicedQty, acceptedQty },
            });
          }
        }
      }

      return {
        line, itemName: item.itemName, purchaseOrderItemId: poLine.id, invoicedQty, orderedQty, acceptedQty, billedOnOthers: others,
        invoiceUnitPrice, poUnitPrice, isService, status: ok ? "MATCHED" : "VARIANCE",
      };
    });

    // VALUE: the invoice subtotal against what the order prices the invoiced quantities at
    const subtotal = Number(invoice.subtotal ?? 0);
    if (allPaired && invoice.items.length) {
      const allowed = Math.max(cfg.matchAmountToleranceAbs, (expectedSubtotal * cfg.matchValueTolerancePct) / 100);
      if (Math.abs(subtotal - expectedSubtotal) > allowed + 1e-9) {
        exceptions.push({
          type: "VALUE_MISMATCH", severity: "BLOCKING",
          message: `The invoice subtotal is ${money(subtotal)}; the order prices these quantities at ${money(expectedSubtotal)} (tolerance ${cfg.matchValueTolerancePct}%, ${money(allowed)}).`,
          detail: { subtotal, expectedSubtotal: r2(expectedSubtotal), allowed: r2(allowed) },
        });
      }
    }

    // TAX: the VAT on the invoice against the order's own VAT rate applied to the invoice subtotal
    const poSubtotal = Number(po.subtotal ?? 0);
    const poTax = Number(po.taxAmount ?? 0);
    if (poSubtotal > 0) {
      const rate = poTax / poSubtotal;
      const expectedTax = subtotal * rate;
      const invoiceTax = Number(invoice.taxAmount ?? 0);
      const allowedTax = Math.max(cfg.matchAmountToleranceAbs, (expectedTax * cfg.matchTaxTolerancePct) / 100);
      if (Math.abs(invoiceTax - expectedTax) > allowedTax + 1e-9) {
        exceptions.push({
          type: "TAX_MISMATCH", severity: "BLOCKING",
          message: `The VAT on the invoice is ${money(invoiceTax)}; the order's VAT rate (${r2(rate * 100)}%) gives ${money(expectedTax)} on a subtotal of ${money(subtotal)} (tolerance ${cfg.matchTaxTolerancePct}%).`,
          detail: { invoiceTax, expectedTax: r2(expectedTax), ratePct: r2(rate * 100), taxSource: invoice.taxSource },
        });
      }
    }

    // DUPLICATE
    exceptions.push(...(await this.duplicateFlags(invoice)));

    const blocking = exceptions.filter((e) => e.severity === "BLOCKING");
    const onlyMissingReceipt = blocking.length > 0 && blocking.every((e) => e.type === "MISSING_RECEIPT");
    const status: ProcurementMatchResult["status"] = blocking.length ? (onlyMissingReceipt ? "AWAITING_RECEIPT" : "DISCREPANCY") : exceptions.length ? "DISCREPANCY" : "MATCHED";
    const result: ProcurementMatchResult = {
      status,
      flags: exceptions,
      exceptions,
      detail: {
        evaluatedAt,
        poNumber: po.poNumber,
        grnNumbers: grns.map((g) => g.grnNumber),
        receiptsPendingInspection: pendingInspection,
        priceTolerancePct: cfg.matchPriceVariancePct,
        tolerances,
        lines,
      },
    };
    await this.persist(invoice, result, pairing);
    return result;
  }

  /**
   * Another invoice from the same supplier that is this one: the same supplier invoice number (exactly, after normalisation),
   * the same number read off the document by the reading, or the same order and total dated within a week. Rejected invoices do
   * not count. The exact number cannot recur through the capture (it is refused there), so this catches older records and
   * invoices whose number only the reading found.
   */
  static async duplicateFlags(invoice: any): Promise<MatchException[]> {
    const others = await prisma.procurementInvoice.findMany({
      where: { vendorId: invoice.vendorId, id: { not: invoice.id }, status: { not: "REJECTED" } },
      select: { id: true, invoiceNumber: true, supplierInvoiceKey: true, supplierInvoiceNumber: true, ocrData: true, totalAmount: true, invoiceDate: true, purchaseOrderId: true },
    });
    const key = (s: any) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const readRef = (o: any) => key(o?.ocrData?.supplierInvoiceNumber);
    const mine = invoice.supplierInvoiceKey || readRef(invoice);
    const week = 7 * 86400000;
    const out: MatchException[] = [];
    for (const o of others) {
      const theirs = o.supplierInvoiceKey || readRef(o);
      if (mine && theirs && mine === theirs) {
        out.push({
          type: "DUPLICATE_INVOICE", severity: "BLOCKING",
          message: `Duplicate of ${o.invoiceNumber}: the same supplier invoice number (${invoice.supplierInvoiceNumber || o.supplierInvoiceNumber || mine}).`,
          detail: { otherInvoiceId: o.id, otherInvoiceNumber: o.invoiceNumber },
        });
      } else if (
        invoice.purchaseOrderId && o.purchaseOrderId === invoice.purchaseOrderId &&
        Math.abs(Number(o.totalAmount) - Number(invoice.totalAmount)) < 0.01 &&
        Math.abs(new Date(o.invoiceDate).getTime() - new Date(invoice.invoiceDate).getTime()) <= week
      ) {
        out.push({
          type: "POSSIBLE_DUPLICATE", severity: "WARNING",
          message: `Possible duplicate of ${o.invoiceNumber}: the same purchase order and total, dated within a week.`,
          detail: { otherInvoiceId: o.id, otherInvoiceNumber: o.invoiceNumber },
        });
      }
    }
    return out;
  }

  /** Blocking exceptions on the latest result, freshly evaluated: what approval and payment are held to. */
  static async blockingFor(invoiceId: string): Promise<MatchException[]> {
    const result = await this.evaluate(invoiceId);
    return (result?.exceptions ?? []).filter((e) => e.severity === "BLOCKING");
  }

  /** Re-evaluate every open invoice on a purchase order, after its receipts change. Never throws. */
  static async evaluateForPurchaseOrder(purchaseOrderId: string | null | undefined): Promise<void> {
    if (!purchaseOrderId) return;
    try {
      const invoices = await prisma.procurementInvoice.findMany({
        where: { purchaseOrderId, status: { notIn: ["REJECTED", "PAID"] } },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      for (const inv of invoices) await this.evaluate(inv.id);
    } catch (err) {
      console.error("ProcurementInvoiceMatchService.evaluateForPurchaseOrder:", (err as Error)?.message || err);
    }
  }

  /** Evaluate without letting a matching failure break the caller's own operation. */
  static async evaluateQuietly(invoiceId: string): Promise<ProcurementMatchResult | null> {
    try {
      return await this.evaluate(invoiceId);
    } catch (err) {
      console.error("ProcurementInvoiceMatchService.evaluate:", (err as Error)?.message || err);
      return null;
    }
  }

  private static async persist(invoice: any, result: ProcurementMatchResult, pairing: Map<string, any>) {
    const lineStatus = new Map<string, string>();
    for (const l of (result.detail.lines as any[]) ?? []) {
      const item = invoice.items[l.line - 1];
      if (item) lineStatus.set(item.id, l.status);
    }
    await prisma.$transaction([
      ...invoice.items.map((item: any) =>
        prisma.procurementInvoiceItem.update({
          where: { id: item.id },
          data: {
            matchedPOItemId: pairing.get(item.id)?.id ?? null,
            matchStatus: lineStatus.get(item.id) ?? (result.status === "NO_PO" ? "UNMATCHED" : "PENDING"),
          },
        })
      ),
      prisma.procurementInvoice.update({
        where: { id: invoice.id },
        data: {
          matchingStatus: result.status,
          matchResult: { status: result.status, exceptions: result.exceptions, ...result.detail, ...(invoice.matchResult?.overrideSignature ? { overrideSignature: invoice.matchResult.overrideSignature } : {}) } as object,
          matchedAt: new Date(),
          aiDiscrepancies: { flags: result.flags, ...result.detail } as object,
        },
      }),
    ]);
    // SRD §3: a flagged invoice alerts its reviewers (once per set of reasons).
    if (result.exceptions.length) {
      const { ProcurementInvoiceAlertService } = await import("./ProcurementInvoiceAlertService");
      await ProcurementInvoiceAlertService.alertQuietly(invoice.id);
    }
    // SRD §6.6: an exact match goes into the payment queue without a person, when the organisation has switched that on
    // and the supplier's document agrees. The reading re-runs this match once it is read.
    if (result.status === "MATCHED" && !result.exceptions.length) {
      const { ProcurementInvoiceAutoApprovalService } = await import("./ProcurementInvoiceAutoApprovalService");
      await ProcurementInvoiceAutoApprovalService.considerQuietly(invoice.id);
    }
  }
}
