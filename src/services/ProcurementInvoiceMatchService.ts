// @ts-nocheck
import { prisma } from "../utils/database";
import { getSuite06PriceVariancePct } from "../config/suite06Config";

/**
 * Three-way match for procurement invoices: invoice lines against the purchase order and the
 * quantities accepted on its goods received notes.
 *
 * Deterministic and re-runnable. It is evaluated when an invoice is created (staff capture or the
 * vendor's link) and again whenever a GRN on the same purchase order is recorded, approved or
 * rejected, so the status follows the receipts rather than freezing at capture time.
 *
 * `ProcurementInvoice.matchingStatus` (DISCREPANCY is the value the OCR path already uses):
 *   MATCHED           every line is on the PO, within the price tolerance, and covered by accepted receipts
 *   DISCREPANCY       at least one line is over the PO price, over the ordered or accepted quantity, or not on the PO
 *   AWAITING_RECEIPT  no goods received note (other than rejected ones) exists for the PO yet
 *   NO_PO             the invoice is not linked to a purchase order, so there is nothing to match
 *
 * The per-line result is written to the invoice items (matchedPOItemId, matchStatus MATCHED |
 * VARIANCE | UNMATCHED) and the detail (flags, per-line figures, tolerance) to `aiDiscrepancies`.
 */

export type ProcurementMatchFlag =
  | { type: "LINE_NOT_ON_PO"; line: number; itemName: string }
  | { type: "PRICE_OVER_PO"; line: number; itemName: string; poUnitPrice: number; invoiceUnitPrice: number; variancePct: number }
  | { type: "QTY_OVER_RECEIVED"; line: number; itemName: string; invoicedQty: number; acceptedQty: number }
  | { type: "QTY_OVER_ORDERED"; line: number; itemName: string; invoicedQty: number; orderedQty: number }
  | { type: "POSSIBLE_DUPLICATE"; otherInvoiceId: string; otherInvoiceNumber: string; reason: string };

export type ProcurementMatchResult = {
  status: "MATCHED" | "DISCREPANCY" | "AWAITING_RECEIPT" | "NO_PO";
  flags: ProcurementMatchFlag[];
  detail: Record<string, unknown>;
};

const QTY_EPSILON = 1e-6;

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export class ProcurementInvoiceMatchService {
  /** Evaluate one invoice and persist the result. Returns null when the invoice does not exist. */
  static async evaluate(invoiceId: string): Promise<ProcurementMatchResult | null> {
    const invoice = await prisma.procurementInvoice.findUnique({
      where: { id: invoiceId },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    if (!invoice) return null;

    const evaluatedAt = new Date().toISOString();
    const tolerancePct = getSuite06PriceVariancePct();

    if (!invoice.purchaseOrderId) {
      const result: ProcurementMatchResult = {
        status: "NO_PO",
        flags: await this.duplicateFlags(invoice),
        detail: { evaluatedAt, reason: "The invoice is not linked to a purchase order." },
      };
      await this.persist(invoice, result, new Map());
      return result;
    }

    const [po, grns] = await Promise.all([
      prisma.purchaseOrder.findUnique({
        where: { id: invoice.purchaseOrderId },
        include: { items: { orderBy: { createdAt: "asc" } } },
      }),
      prisma.goodsReceivedNote.findMany({
        where: { purchaseOrderId: invoice.purchaseOrderId, status: { not: "REJECTED" } },
        include: { items: true },
      }),
    ]);
    if (!po) {
      const result: ProcurementMatchResult = {
        status: "NO_PO",
        flags: [],
        detail: { evaluatedAt, reason: "The linked purchase order no longer exists." },
      };
      await this.persist(invoice, result, new Map());
      return result;
    }

    const poLines = po.items.filter((l) => String(l.lineStatus || "ACTIVE") !== "CANCELLED");

    // Accepted quantity per PO line across every GRN that has not been rejected. Receipts still
    // awaiting inspection count, and are reported so an approver can see they are not yet passed.
    const accepted = new Map<string, number>();
    for (const g of grns) {
      for (const gi of g.items) {
        accepted.set(gi.purchaseOrderItemId, (accepted.get(gi.purchaseOrderItemId) ?? 0) + Number(gi.quantityAccepted ?? 0));
      }
    }
    const pendingInspection = grns.filter((g) => String(g.status).toUpperCase() !== "APPROVED").map((g) => g.grnNumber);

    // Pair invoice lines with PO lines by item name; fall back to position when the line counts agree.
    const byName = new Map<string, typeof poLines>();
    for (const l of poLines) {
      const k = norm(l.itemName);
      byName.set(k, [...(byName.get(k) ?? []), l]);
    }
    const used = new Set<string>();
    const pairing = new Map<string, (typeof poLines)[number] | null>();
    invoice.items.forEach((item, idx) => {
      const candidates = (byName.get(norm(item.itemName)) ?? []).filter((l) => !used.has(l.id));
      let hit = candidates[0] ?? null;
      if (!hit && invoice.items.length === poLines.length && poLines[idx] && !used.has(poLines[idx].id)) hit = poLines[idx];
      if (hit) used.add(hit.id);
      pairing.set(item.id, hit);
    });

    // The invoice is measured on its own against everything accepted so far on the PO.
    const flags: ProcurementMatchFlag[] = [];
    const lines = invoice.items.map((item, idx) => {
      const line = idx + 1;
      const poLine = pairing.get(item.id);
      const invoicedQty = Number(item.quantity ?? 0);
      const invoiceUnitPrice = Number(item.unitPrice ?? 0);
      if (!poLine) {
        flags.push({ type: "LINE_NOT_ON_PO", line, itemName: item.itemName });
        return { line, itemName: item.itemName, purchaseOrderItemId: null, invoicedQty, invoiceUnitPrice, status: "UNMATCHED" };
      }
      const poUnitPrice = Number(poLine.unitPrice ?? 0);
      const orderedQty = Number(poLine.quantity ?? 0);
      const acceptedQty = accepted.get(poLine.id) ?? 0;
      let lineOk = true;
      if (poUnitPrice > 0 && invoiceUnitPrice > poUnitPrice * (1 + tolerancePct / 100) + 1e-9) {
        flags.push({
          type: "PRICE_OVER_PO",
          line,
          itemName: item.itemName,
          poUnitPrice,
          invoiceUnitPrice,
          variancePct: Math.round(((invoiceUnitPrice - poUnitPrice) / poUnitPrice) * 10000) / 100,
        });
        lineOk = false;
      }
      if (invoicedQty > orderedQty + QTY_EPSILON) {
        flags.push({ type: "QTY_OVER_ORDERED", line, itemName: item.itemName, invoicedQty, orderedQty });
        lineOk = false;
      }
      if (grns.length && invoicedQty > acceptedQty + QTY_EPSILON) {
        flags.push({ type: "QTY_OVER_RECEIVED", line, itemName: item.itemName, invoicedQty, acceptedQty });
        lineOk = false;
      }
      return {
        line,
        itemName: item.itemName,
        purchaseOrderItemId: poLine.id,
        invoicedQty,
        orderedQty,
        acceptedQty,
        invoiceUnitPrice,
        poUnitPrice,
        status: lineOk ? "MATCHED" : "VARIANCE",
      };
    });

    // SRD §2: flag potential duplicate invoices.
    flags.push(...(await this.duplicateFlags(invoice)));

    const status: ProcurementMatchResult["status"] = flags.length ? "DISCREPANCY" : grns.length ? "MATCHED" : "AWAITING_RECEIPT";
    const result: ProcurementMatchResult = {
      status,
      flags,
      detail: {
        evaluatedAt,
        poNumber: po.poNumber,
        grnNumbers: grns.map((g) => g.grnNumber),
        receiptsPendingInspection: pendingInspection,
        priceTolerancePct: tolerancePct,
        lines,
      },
    };
    await this.persist(invoice, result, pairing);
    return result;
  }

  /**
   * Another invoice from the same vendor that looks like this one: the same supplier invoice number (read off the
   * supplier's document by the LLM), or the same purchase order and total dated within a week. Rejected invoices do not
   * count. Flagged as possible, for a person to decide.
   */
  static async duplicateFlags(invoice: any): Promise<ProcurementMatchFlag[]> {
    const others = await prisma.procurementInvoice.findMany({
      where: { vendorId: invoice.vendorId, id: { not: invoice.id }, status: { not: "REJECTED" } },
      select: { id: true, invoiceNumber: true, ocrData: true, totalAmount: true, invoiceDate: true, purchaseOrderId: true },
    });
    const ref = (o: any) => String(o?.ocrData?.supplierInvoiceNumber ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const mine = ref(invoice);
    const week = 7 * 86400000;
    const flags: ProcurementMatchFlag[] = [];
    for (const o of others) {
      if (mine && ref(o) === mine) {
        flags.push({
          type: "POSSIBLE_DUPLICATE",
          otherInvoiceId: o.id,
          otherInvoiceNumber: o.invoiceNumber,
          reason: `the same supplier invoice number (${invoice.ocrData.supplierInvoiceNumber})`,
        });
      } else if (
        invoice.purchaseOrderId &&
        o.purchaseOrderId === invoice.purchaseOrderId &&
        Math.abs(Number(o.totalAmount) - Number(invoice.totalAmount)) < 0.01 &&
        Math.abs(new Date(o.invoiceDate).getTime() - new Date(invoice.invoiceDate).getTime()) <= week
      ) {
        flags.push({
          type: "POSSIBLE_DUPLICATE",
          otherInvoiceId: o.id,
          otherInvoiceNumber: o.invoiceNumber,
          reason: "the same purchase order and total, dated within a week",
        });
      }
    }
    return flags;
  }

  /** Re-evaluate every open invoice on a purchase order, after its receipts change. Never throws. */
  static async evaluateForPurchaseOrder(purchaseOrderId: string | null | undefined): Promise<void> {
    if (!purchaseOrderId) return;
    try {
      const invoices = await prisma.procurementInvoice.findMany({
        where: { purchaseOrderId, status: { notIn: ["REJECTED", "PAID"] } },
        select: { id: true },
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
          aiDiscrepancies: { flags: result.flags, ...result.detail } as object,
        },
      }),
    ]);
    // SRD §3: a flagged invoice alerts its reviewers (once per set of reasons).
    if (result.flags.length) {
      const { ProcurementInvoiceAlertService } = await import("./ProcurementInvoiceAlertService");
      await ProcurementInvoiceAlertService.alertQuietly(invoice.id);
    }
  }
}
