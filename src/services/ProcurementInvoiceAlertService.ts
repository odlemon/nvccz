//@ts-nocheck
import crypto from "crypto";
import { prisma } from "../utils/database";
import { logger } from "../utils/logger";

/** Invoices still awaiting a decision; a flag on an approved, paid or rejected invoice alerts nobody. */
const OPEN_STATUSES = ["DRAFT", "PENDING", "PENDING_APPROVAL"];
/** Who reviews a flagged invoice: those who capture and those who approve supplier invoices. */
const REVIEW_GRANTS = ["procurement.invoices.approve", "procurement.intake.manage"];
const NOTIFICATION_TYPE = "PROCUREMENT_INVOICE_FLAGGED";

/**
 * SRD §3 and §6.6: when an invoice is flagged — the three-way match finds a price or quantity over the order or the
 * receipts, a line not on the order, a possible duplicate, or the supplier's own document disagrees with the capture —
 * the procurement officers who review invoices are told, in the app and by email. Until now the flags were stored and
 * nobody was notified.
 *
 * An alert names the reasons. The same set of reasons is not sent twice to the same person (a fingerprint of the
 * reasons is kept on the notification), so re-running the match after every receipt does not repeat it; a new or
 * changed reason alerts again.
 */
export class ProcurementInvoiceAlertService {
  static async alertQuietly(invoiceId: string) {
    try {
      return await this.alert(invoiceId);
    } catch (e: any) {
      logger.error("Flagged invoice alert failed", { invoiceId, error: String(e?.message || e) });
      return null;
    }
  }

  /**
   * SRD §7 Invoice Processing Screen, "Flag for Review": a person marks an open invoice for review and says why. It joins
   * Invoices to review with that reason, and the invoice reviewers are alerted as for any other flag.
   */
  static async flagForReview(invoiceId: string, userId: string, note: string) {
    const text = String(note ?? "").trim();
    const fail = (message: string, status: number) => Object.assign(new Error(message), { status });
    if (!text) throw fail("Say why the invoice needs review.", 400);
    if (text.length > 1000) throw fail("Keep the reason under 1,000 characters.", 400);
    const invoice = await prisma.procurementInvoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true, invoiceNumber: true },
    });
    if (!invoice) throw fail("Invoice not found", 404);
    if (!OPEN_STATUSES.includes(String(invoice.status).toUpperCase())) {
      throw fail(`${invoice.invoiceNumber} is already ${String(invoice.status).toLowerCase()}, so there is nothing left to review.`, 400);
    }
    const updated = await prisma.procurementInvoice.update({
      where: { id: invoiceId },
      data: { reviewNote: text, reviewFlaggedAt: new Date(), reviewFlaggedById: userId },
    });
    const { default: AuditService } = await import("./AuditService");
    await AuditService.log({
      userId,
      action: "FLAG_FOR_REVIEW",
      entityType: "ProcurementInvoice",
      entityId: invoiceId,
      newValues: { reviewNote: text },
    });
    await this.alertQuietly(invoiceId);
    return updated;
  }

  /** Each reason the invoice needs a person's eyes, in words a reviewer can act on. */
  static reasonsFor(invoice: any): { code: string; message: string }[] {
    const money = (v: any) => Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const out = [];
    // A person flagged it for review on the invoice processing screen (SRD §7), with why.
    if (invoice?.reviewNote) out.push({ code: "FLAGGED_FOR_REVIEW", message: `Flagged for review: ${invoice.reviewNote}` });
    for (const f of invoice?.aiDiscrepancies?.flags || []) {
      switch (f?.type) {
        case "LINE_NOT_ON_PO":
          out.push({ code: f.type, message: `Line ${f.line}: "${f.itemName}" is not on the purchase order` });
          break;
        case "PRICE_OVER_PO":
          out.push({ code: f.type, message: `Line ${f.line}: "${f.itemName}" is invoiced at ${money(f.invoiceUnitPrice)}; the order says ${money(f.poUnitPrice)} (+${f.variancePct}%)` });
          break;
        case "QTY_OVER_ORDERED":
          out.push({ code: f.type, message: `Line ${f.line}: "${f.itemName}" invoices ${f.invoicedQty}; the order has ${f.orderedQty}` });
          break;
        case "QTY_OVER_RECEIVED":
          out.push({ code: f.type, message: `Line ${f.line}: "${f.itemName}" invoices ${f.invoicedQty}; receipts accepted ${f.acceptedQty}` });
          break;
        case "POSSIBLE_DUPLICATE":
          out.push({ code: f.type, message: f.message || `Possible duplicate of ${f.otherInvoiceNumber}: ${f.reason}` });
          break;
        default:
          // The §24 exceptions (missing PO or receipt, quantity, value, tax, excess, duplicate) carry their own wording.
          if (f?.message) out.push({ code: String(f.type), message: f.message });
      }
    }
    const reading = invoice?.ocrData;
    if (reading?.status === "READ" && reading.comparison && reading.comparison.agrees === false) {
      for (const d of reading.comparison.differences || []) {
        out.push({ code: `DOCUMENT_${String(d?.field || "difference").toUpperCase()}`, message: `Supplier's document: ${d?.message}` });
      }
    }
    return out;
  }

  /** The reviewers: users whose role holds an invoice review grant, and whoever raised the purchase order. */
  static async recipients(invoice: any) {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, firstName: true, lastName: true, role: { select: { permissions: true } } },
    });
    return users.filter((u) => {
      if (invoice?.purchaseOrder?.createdById && u.id === invoice.purchaseOrder.createdById) return true;
      const perms = Array.isArray(u.role?.permissions) ? u.role.permissions : [];
      return perms.some((p: any) => REVIEW_GRANTS.includes(p?.name) && p?.value === true);
    });
  }

  static async alert(invoiceId: string) {
    const invoice = await prisma.procurementInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: { select: { name: true } },
        purchaseOrder: { select: { poNumber: true, createdById: true } },
        currency: { select: { code: true } },
      },
    });
    if (!invoice || !OPEN_STATUSES.includes(String(invoice.status).toUpperCase())) return null;
    const reasons = this.reasonsFor(invoice);
    if (!reasons.length) return null;

    const fingerprint = crypto.createHash("sha256").update(reasons.map((r) => r.message).sort().join("|")).digest("hex").slice(0, 24);
    const people = await this.recipients(invoice);
    const title = `Invoice ${invoice.invoiceNumber} needs review`.slice(0, 180);
    // The column holds a short line; every reason goes in the notification's data and the email.
    const message = `${invoice.vendor?.name ?? "A vendor"}: ${reasons.length} reason${reasons.length === 1 ? "" : "s"} to check${invoice.purchaseOrder?.poNumber ? ` against ${invoice.purchaseOrder.poNumber}` : ""}`.slice(0, 180);

    // one query for everyone's last notice about this invoice (not one per person)
    const lastNotices = people.length
      ? await prisma.notification.findMany({
          where: { userId: { in: people.map((u) => u.id) }, relatedEntityId: invoiceId, type: { in: [NOTIFICATION_TYPE, "PROCUREMENT_INVOICE_EXCEPTION"] } },
          orderBy: { createdAt: "desc" },
          select: { userId: true, data: true },
        })
      : [];
    const lastByUser = new Map<string, any>();
    for (const n of lastNotices) if (!lastByUser.has(n.userId)) lastByUser.set(n.userId, n.data);
    const notified = people.filter((u) => (lastByUser.get(u.id) as any)?.fingerprint !== fingerprint);

    if (notified.length) {
      // the one shared dispatcher: the rule, the in-app row, the branded email and the log
      const { notify } = await import("./notifications/ProcurementNotifier");
      await notify("INVOICE_EXCEPTION", {
        // the person who captured the invoice sees its exceptions on their own screen; they are not told again
        userIds: notified.map((u) => u.id), actorId: (invoice as any).createdById ?? null, entityType: "ProcurementInvoice", entityId: invoiceId,
        data: { path: "/procurement/invoices", invoiceId, invoiceNumber: invoice.invoiceNumber, poNumber: invoice.purchaseOrder?.poNumber ?? null, reasons: reasons.map((r) => r.message), fingerprint },
        vars: {
          ref: invoice.invoiceNumber, vendor: invoice.vendor?.name ?? "Vendor", po: invoice.purchaseOrder?.poNumber ?? "",
          amount: `${invoice.currency?.code ?? ""} ${Number(invoice.totalAmount).toFixed(2)}`.trim(), summary: reasons.map((r) => r.message).join("; ").slice(0, 900), reasons: reasons.map((r) => r.message),
        },
      });
    }
    logger.info("Flagged invoice alert", { invoiceId, reasons: reasons.length, notified: notified.length });
    return { notified: notified.length, reasons, fingerprint };
  }
}
