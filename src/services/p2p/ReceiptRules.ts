//@ts-nocheck
/**
 * §22 Goods and service receipts.
 *
 * Quantities: a PO line's `quantityReceived` is what has been ACCEPTED against it across every receipt that stands, and
 * `quantityPending` is what is still owed. Both are recomputed from the receipts themselves after every receipt, rejection or
 * reversal, so they cannot drift. A receipt that is rejected at inspection no longer counts, and what it carried is owed again.
 *
 * Services: a service line is confirmed by AMOUNT, not by quantity. A service receipt states the period the service was completed
 * in, the amount confirmed and the evidence of it; the amount is turned into a fraction of the line so the same outstanding
 * arithmetic applies. The person who approves the receipt is the confirming user.
 */
import { prisma } from "../../utils/database";
import { isPlatformMediaReference } from "../../utils/safeFetchUrl";

const EPS = 1e-6;
const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;
const fail = (message: string, status = 400, code?: string) => Object.assign(new Error(message), { status, statusCode: status, code });

export type ReceiptLineInput = {
  purchaseOrderItemId: string;
  quantityReceived?: number;
  quantityAccepted?: number;
  quantityRejected?: number;
  qualityStatus?: string;
  qualityNotes?: string;
  lineType?: string;
  milestoneDescription?: string;
  serialNumbers?: unknown;
  servicePeriodStart?: string | Date | null;
  servicePeriodEnd?: string | Date | null;
  serviceAmount?: number | null;
  serviceEvidence?: unknown;
};

export type ReceiptLine = ReceiptLineInput & {
  quantityReceived: number;
  quantityAccepted: number;
  quantityRejected: number;
  qualityStatus: string;
  lineType: "GOODS" | "SERVICE";
  servicePeriodStart: Date | null;
  servicePeriodEnd: Date | null;
  serviceAmount: number | null;
  serviceEvidence: unknown;
};

/** Accepted quantity (or amount fraction) already standing against each PO line, from the receipts. */
export async function acceptedByLine(purchaseOrderId: string, exceptGrnId?: string): Promise<Map<string, { accepted: number; amount: number }>> {
  const rows = await prisma.goodsReceivedNoteItem.findMany({
    where: { grn: { purchaseOrderId, status: { notIn: ["REJECTED", "DRAFT"] }, ...(exceptGrnId ? { id: { not: exceptGrnId } } : {}) } },
    select: { purchaseOrderItemId: true, quantityAccepted: true, serviceAmount: true },
  });
  const out = new Map<string, { accepted: number; amount: number }>();
  for (const r of rows) {
    const cur = out.get(r.purchaseOrderItemId) ?? { accepted: 0, amount: 0 };
    cur.accepted += Number(r.quantityAccepted ?? 0);
    cur.amount += Number(r.serviceAmount ?? 0);
    out.set(r.purchaseOrderItemId, cur);
  }
  return out;
}

const asDate = (v: unknown): Date | null => {
  if (v == null || v === "") return null;
  const d = new Date(v as any);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Validates a receipt against its purchase order and returns the lines to store. Throws a plain message for anything that would
 * make the receipt wrong: an unknown or cancelled line, quantities that do not add up, receiving more than was ordered, a service
 * receipt with no period, amount or evidence.
 */
export async function validateReceipt(po: any, lines: ReceiptLineInput[], cfg: { overDeliveryTolerancePct: number }): Promise<ReceiptLine[]> {
  if (!Array.isArray(lines) || !lines.length) throw fail("A receipt needs at least one line.");
  const poLines = new Map<string, any>(po.items.map((i: any) => [i.id, i]));
  const already = await acceptedByLine(po.id);
  const seen = new Set<string>();
  const out: ReceiptLine[] = [];
  for (const [idx, raw] of lines.entries()) {
    const label = `Line ${idx + 1}`;
    const poi = poLines.get(raw.purchaseOrderItemId);
    if (!poi) throw fail(`${label}: that line is not on purchase order ${po.poNumber}.`);
    if (poi.lineStatus === "CANCELLED") throw fail(`${label} (${poi.itemName}): the purchase order line is cancelled, so nothing can be received against it.`);
    if (seen.has(poi.id)) throw fail(`${label} (${poi.itemName}): the same purchase order line appears twice on this receipt.`);
    seen.add(poi.id);
    const ordered = Number(poi.quantity);
    const tol = 1 + cfg.overDeliveryTolerancePct / 100;
    const before = already.get(poi.id) ?? { accepted: 0, amount: 0 };
    const lineType = String(raw.lineType || "GOODS").toUpperCase() === "SERVICE" ? "SERVICE" : "GOODS";

    if (lineType === "SERVICE") {
      const start = asDate(raw.servicePeriodStart);
      const end = asDate(raw.servicePeriodEnd);
      const amount = Number(raw.serviceAmount);
      const description = String(raw.milestoneDescription ?? "").trim();
      if (!description) throw fail(`${label} (${poi.itemName}): describe the service that was completed.`);
      if (!start || !end) throw fail(`${label} (${poi.itemName}): a service receipt states the period the service was completed in (from and to).`);
      if (end.getTime() < start.getTime()) throw fail(`${label} (${poi.itemName}): the completion period ends before it starts.`);
      if (!Number.isFinite(amount) || amount <= 0) throw fail(`${label} (${poi.itemName}): state the amount confirmed for this service.`);
      const evidence = Array.isArray(raw.serviceEvidence) ? raw.serviceEvidence : [];
      const usable = evidence.filter((e: any) => e && (typeof e === "string" ? e : e.url));
      if (!usable.length) throw fail(`${label} (${poi.itemName}): attach the evidence that the service was performed (a completion certificate, timesheet or signed report).`);
      for (const e of usable) {
        const url = typeof e === "string" ? e : e.url;
        if (!isPlatformMediaReference(String(url))) throw fail(`${label}: evidence must be a file uploaded through the platform.`);
      }
      const lineTotal = Number(poi.totalPrice ?? Number(poi.quantity) * Number(poi.unitPrice));
      if (before.amount + amount > lineTotal * tol + 0.005) {
        throw fail(`Over-receipt blocked: ${poi.itemName} would be confirmed for ${round(before.amount + amount, 2)} against ${round(lineTotal, 2)} ordered (tolerance ${cfg.overDeliveryTolerancePct}%).`, 409, "OVER_RECEIPT");
      }
      const unit = Number(poi.unitPrice);
      const fraction = unit > 0 ? amount / unit : ordered > 0 ? (amount / lineTotal) * ordered : 0;
      out.push({
        ...raw,
        lineType,
        quantityReceived: round(fraction),
        quantityAccepted: round(fraction),
        quantityRejected: 0,
        qualityStatus: raw.qualityStatus || "PENDING",
        servicePeriodStart: start,
        servicePeriodEnd: end,
        serviceAmount: round(amount, 2),
        serviceEvidence: usable,
        milestoneDescription: description,
      });
      continue;
    }

    const received = Number(raw.quantityReceived);
    const rejected = Number(raw.quantityRejected ?? 0);
    const accepted = raw.quantityAccepted == null ? received - rejected : Number(raw.quantityAccepted);
    if (![received, rejected, accepted].every((n) => Number.isFinite(n))) throw fail(`${label} (${poi.itemName}): quantities must be numbers.`);
    if (received < 0 || rejected < 0 || accepted < 0) throw fail(`${label} (${poi.itemName}): quantities cannot be negative.`);
    if (Math.abs(accepted + rejected - received) > EPS) {
      throw fail(`${label} (${poi.itemName}): accepted (${accepted}) plus rejected (${rejected}) must equal the quantity received (${received}).`);
    }
    if (received <= 0) throw fail(`${label} (${poi.itemName}): the quantity received must be above zero. Leave the line off if nothing arrived.`);
    if (before.accepted + received > ordered * tol + EPS) {
      throw fail(
        `Over-receipt blocked: ${poi.itemName} would stand at ${round(before.accepted + received, 2)} against ${round(ordered, 2)} ordered (tolerance ${cfg.overDeliveryTolerancePct}%, ${round(Math.max(0, ordered * tol - before.accepted), 2)} can still be received).`,
        409,
        "OVER_RECEIPT"
      );
    }
    out.push({
      ...raw,
      lineType: "GOODS",
      quantityReceived: received,
      quantityAccepted: accepted,
      quantityRejected: rejected,
      qualityStatus: raw.qualityStatus || "PENDING",
      servicePeriodStart: null,
      servicePeriodEnd: null,
      serviceAmount: null,
      serviceEvidence: null,
    });
  }
  return out;
}

/** The receipt header type from its lines. */
export function receiptTypeOf(lines: Array<{ lineType: string }>): "GOODS" | "SERVICE" | "MIXED" {
  const services = lines.filter((l) => l.lineType === "SERVICE").length;
  return services === 0 ? "GOODS" : services === lines.length ? "SERVICE" : "MIXED";
}

/** Attachments on a receipt (delivery note, photos) must be files uploaded through the platform. */
export function checkAttachmentUrls(value: unknown): unknown {
  if (value == null) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  const cleaned = arr.filter((v) => v && (typeof v === "string" ? v : v.url));
  for (const a of cleaned) {
    const url = typeof a === "string" ? a : a.url;
    if (!isPlatformMediaReference(String(url))) throw fail("Attachments must be files uploaded through the platform, not links to other addresses.");
  }
  return cleaned.length ? cleaned : undefined;
}

/**
 * Recomputes every PO line's received and pending quantities from the receipts that stand, and moves the order's delivery status
 * to match (including back, when a receipt was rejected). Returns the new status when it changed.
 */
export async function recomputePoDelivery(purchaseOrderId: string): Promise<string | null> {
  const [po, lines, standing] = await Promise.all([
    prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, select: { id: true, status: true, sentAt: true } }),
    prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId } }),
    acceptedByLine(purchaseOrderId),
  ]);
  if (!po) return null;
  for (const l of lines) {
    const got = standing.get(l.id)?.accepted ?? 0;
    const cancelled = String(l.lineStatus || "ACTIVE") === "CANCELLED";
    const pending = cancelled ? 0 : Math.max(0, Number(l.quantity) - got);
    if (Math.abs(Number(l.quantityReceived) - got) > EPS || Math.abs(Number(l.quantityPending) - pending) > EPS) {
      await prisma.purchaseOrderItem.update({ where: { id: l.id }, data: { quantityReceived: got, quantityPending: pending } });
    }
  }
  const active = lines.filter((l) => String(l.lineStatus || "ACTIVE") !== "CANCELLED");
  const anyReceived = active.some((l) => (standing.get(l.id)?.accepted ?? 0) > EPS);
  const allDone = active.length > 0 && active.every((l) => Number(l.quantity) - (standing.get(l.id)?.accepted ?? 0) <= EPS);
  const status = String(po.status);
  const delivering = ["DELIVERED", "PARTIALLY_DELIVERED", "RECEIVED", "PARTIALLY_RECEIVED"].includes(status);
  let next: string | null = null;
  if (allDone) next = "DELIVERED";
  else if (anyReceived) next = "PARTIALLY_DELIVERED";
  else if (delivering) {
    // Every receipt was reversed: back to where the order stood before anything arrived.
    const invoiced = await prisma.procurementInvoice.count({ where: { purchaseOrderId } });
    next = invoiced ? "ACKNOWLEDGED" : "SENT";
  }
  if (next && next !== status && !["BILLED"].includes(status)) {
    await prisma.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: next, ...(next === "DELIVERED" ? { actualDeliveryDate: new Date() } : next === "SENT" || next === "ACKNOWLEDGED" ? { actualDeliveryDate: null } : {}) } });
    return next;
  }
  return null;
}
