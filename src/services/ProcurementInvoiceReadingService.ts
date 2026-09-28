//@ts-nocheck
import path from "path";
import { prisma } from "../utils/database";
import { logger } from "../utils/logger";
import AuditService from "./AuditService";
import { getLlmConfig } from "./LlmChatService";
import { VendorInvoiceExtractionService } from "./VendorInvoiceExtractionService";

/**
 * Every supplier invoice that arrives with a document is read by the LLM, and what it read is compared with the invoice
 * as it was captured. A vendor typing lines into the portal, or a clerk capturing by hand, can differ from the
 * supplier's own document — a price, a quantity, a missing line, a total, another supplier's paper — and until now
 * nothing read the document at all.
 *
 * The reading is stored on the invoice (ocrProcessed, ocrData); aiMatched, aiMatchScore and aiDiscrepancies stay the
 * three-way match's:
 *   ocrData = { status: "READ" | "FAILED" | "NOT_CONFIGURED", source: "LLM", model, readAt, fromOcr, intakeId,
 *               supplierInvoiceNumber, payload, comparison: { agrees, differences: [{ field, read, captured, message }] },
 *               message }
 */
export class ProcurementInvoiceReadingService {
  private static inFlight = new Set<string>();

  /** After an invoice is created: read it without holding up the request. Never throws. */
  static scheduleRead(invoiceId: string, opts: { actorUserId?: string | null } = {}) {
    setImmediate(() => {
      this.readInvoice(invoiceId, opts).catch((e) =>
        logger.error("Invoice document reading failed", { invoiceId, error: String(e?.message || e) })
      );
    });
  }

  /**
   * Read the invoice's document (or reuse the reading AI Invoice Capture already made from it) and store the
   * comparison. Returns the stored reading, or null when there is nothing to read or a reading is already running.
   */
  static async readInvoice(invoiceId: string, opts: { intakeId?: string | null; actorUserId?: string | null } = {}) {
    if (this.inFlight.has(invoiceId)) return null;
    this.inFlight.add(invoiceId);
    try {
      const invoice = await prisma.procurementInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          items: true,
          vendor: { select: { name: true, taxNumber: true } },
          purchaseOrder: { select: { poNumber: true } },
          currency: { select: { code: true } },
        },
      });
      if (!invoice) throw new Error("Invoice not found");
      const cfg = getLlmConfig();

      let payload = null;
      let fromOcr = false;
      let intakeId = null;
      if (opts.intakeId) {
        const intake = await prisma.vendorInvoiceIntake.findUnique({
          where: { id: opts.intakeId },
          select: { id: true, vendorId: true, extractedPayloadJson: true, llmMetaJson: true },
        });
        // Only a reading of this vendor's invoice is reused.
        if (intake && intake.vendorId === invoice.vendorId && intake.extractedPayloadJson) {
          payload = intake.extractedPayloadJson;
          fromOcr = Boolean(intake.llmMetaJson?.ocr || payload?.readFromOcr);
          intakeId = intake.id;
        }
      }

      if (!payload) {
        if (!invoice.documentPath) return null;
        if (!cfg.configured) {
          const ocrData = { status: "NOT_CONFIGURED", source: "LLM", readAt: new Date().toISOString(), message: "Invoice reading is not configured on this server" };
          await prisma.procurementInvoice.update({ where: { id: invoiceId }, data: { ocrProcessed: false, ocrData } });
          return ocrData;
        }
        const fileName = path.basename(String(invoice.documentPath).split("?")[0]) || "invoice.pdf";
        // §29-§31: reading is AI use. It is switched off with the AI layer, held to the limits, and recorded (a supplier's own
        // submission is recorded as "system").
        const { AiControlService } = await import("./p2p/AiControlService");
        const actor = opts.actorUserId ? await prisma.user.findUnique({ where: { id: opts.actorUserId } }) : null;
        const read = await AiControlService.track(
          actor,
          { feature: "invoice_reading", documentType: "INVOICE", documentName: fileName, entityType: "ProcurementInvoice", entityId: invoiceId },
          async () => {
            const { text, ocr } = await VendorInvoiceExtractionService.extractTextFromUrlDetailed(invoice.documentPath, fileName);
            return { payload: (await VendorInvoiceExtractionService.parseExtractedTextWithLlm(text, { ocr })).payload, ocr };
          }
        );
        payload = read.payload;
        fromOcr = read.ocr;
      }

      const comparison = this.compare(invoice, payload);
      const ocrData = {
        status: "READ",
        source: "LLM",
        model: cfg.model,
        readAt: new Date().toISOString(),
        fromOcr,
        intakeId,
        supplierInvoiceNumber: payload?.invoiceNumber ?? null,
        payload,
        comparison,
      };
      await prisma.procurementInvoice.update({ where: { id: invoiceId }, data: { ocrProcessed: true, ocrData } });
      await AuditService.log({
        userId: opts.actorUserId ?? invoice.createdById,
        action: "READ",
        entityType: "ProcurementInvoice",
        entityId: invoiceId,
        newValues: {
          reading: comparison.agrees ? "agrees with the captured invoice" : `${comparison.differences.length} difference(s) from the captured invoice`,
          supplierInvoiceNumber: payload?.invoiceNumber ?? null,
          fromOcr,
        },
      });
      // The reading gives the supplier's own invoice number, which the duplicate check needs, and its differences are
      // reasons to alert: match again, then alert (once per set of reasons).
      const { ProcurementInvoiceMatchService } = await import("./ProcurementInvoiceMatchService");
      await ProcurementInvoiceMatchService.evaluateQuietly(invoiceId);
      const { ProcurementInvoiceAlertService } = await import("./ProcurementInvoiceAlertService");
      await ProcurementInvoiceAlertService.alertQuietly(invoiceId);
      return ocrData;
    } catch (e: any) {
      const message = String(e?.message || e).slice(0, 300);
      // The AI layer being off, or a limit reached, is not a failed reading: the invoice simply is not AI-read.
      if (/^AI_(DISABLED|LIMIT_REACHED|GROUP|DOCUMENT_TYPE)/.test(String(e?.code || ""))) {
        await prisma.procurementInvoice.update({ where: { id: invoiceId }, data: { ocrProcessed: false, ocrData: { status: "NOT_READ", source: "LLM", readAt: new Date().toISOString(), message } } }).catch(() => {});
        return null;
      }
      await prisma.procurementInvoice
        .update({ where: { id: invoiceId }, data: { ocrProcessed: false, ocrData: { status: "FAILED", source: "LLM", readAt: new Date().toISOString(), message } } })
        .catch(() => {});
      throw e;
    } finally {
      this.inFlight.delete(invoiceId);
    }
  }

  /** Where the document and the captured invoice disagree, said in words an approver can act on. */
  static compare(invoice: any, payload: any) {
    const differences = [];
    const add = (field: string, read: any, captured: any, message: string) => differences.push({ field, read, captured, message });
    const n = (v: any) => (v == null ? null : Number(v));
    const money = (v: any) => Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.001);
    const norm = (s: any) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const STOP = new Set(["pvt", "private", "ltd", "limited", "the", "and", "co", "inc", "plc"]);
    const words = (s: any) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
    const similarity = (a: any, b: any) => {
      const A = new Set(words(a));
      const B = words(b);
      const shorter = Math.min(A.size, B.length) || 1;
      return B.filter((w) => A.has(w)).length / shorter;
    };

    const vendorName = invoice.vendor?.name;
    if (payload?.supplierName && vendorName && similarity(payload.supplierName, vendorName) < 0.6) {
      add("supplier", payload.supplierName, vendorName, `The document is from "${payload.supplierName}", but the invoice is recorded against ${vendorName}`);
    }
    if (payload?.supplierTaxNumber && invoice.vendor?.taxNumber && norm(payload.supplierTaxNumber).replace(/\D/g, "") !== norm(invoice.vendor.taxNumber).replace(/\D/g, "")) {
      add("supplierTaxNumber", payload.supplierTaxNumber, invoice.vendor.taxNumber, `The supplier's tax number on the document is ${payload.supplierTaxNumber}; the vendor record holds ${invoice.vendor.taxNumber}`);
    }
    const poNumber = invoice.purchaseOrder?.poNumber;
    if (payload?.purchaseOrderReference && poNumber && norm(payload.purchaseOrderReference) !== norm(poNumber)) {
      add("purchaseOrder", payload.purchaseOrderReference, poNumber, `The document quotes order ${payload.purchaseOrderReference}; the invoice is against ${poNumber}`);
    }
    if (payload?.currencyCode && invoice.currency?.code && String(payload.currencyCode).toUpperCase() !== String(invoice.currency.code).toUpperCase()) {
      add("currency", payload.currencyCode, invoice.currency.code, `The document is in ${payload.currencyCode}; the invoice is captured in ${invoice.currency.code}`);
    }
    for (const [field, label, read, captured] of [
      ["subtotal", "subtotal", n(payload?.subtotal), n(invoice.subtotal)],
      ["taxAmount", "VAT", n(payload?.taxAmount), n(invoice.taxAmount)],
      ["totalAmount", "total", n(payload?.totalAmount), n(invoice.totalAmount)],
    ]) {
      if (read != null && captured != null && !near(read, captured)) {
        add(field, read, captured, `The document's ${label} is ${money(read)}; the captured invoice has ${money(captured)}`);
      }
    }

    const readLines = Array.isArray(payload?.lines) ? payload.lines : [];
    const used = new Set<number>();
    for (const [i, item] of (invoice.items || []).entries()) {
      let best = -1;
      let bestScore = 0;
      readLines.forEach((l, j) => {
        if (used.has(j)) return;
        const s = similarity(l.description, item.itemName);
        if (s > bestScore) { best = j; bestScore = s; }
      });
      // OCR can mangle a description beyond recognition; the same row is then paired by position, but only when its
      // figures agree or some of its words survive. Otherwise another supplier's document would be read as the same
      // lines with different quantities, instead of different lines.
      if (bestScore < 0.5 && readLines.length === (invoice.items || []).length && !used.has(i)) {
        const l = readLines[i];
        const figuresAgree = near(Number(l.quantity), Number(item.quantity)) && near(Number(l.unitPrice), Number(item.unitPrice));
        if (figuresAgree || similarity(l.description, item.itemName) >= 0.25) {
          best = i;
          bestScore = 0.5;
        }
      }
      if (best < 0 || bestScore < 0.5) {
        add("line", null, item.itemName, `"${item.itemName}" was captured but is not on the document`);
        continue;
      }
      used.add(best);
      const l = readLines[best];
      if (Number(l.quantity) > 0 && !near(Number(l.quantity), Number(item.quantity))) {
        add("lineQuantity", Number(l.quantity), Number(item.quantity), `"${item.itemName}": the document invoices ${Number(l.quantity)}, the capture ${Number(item.quantity)}`);
      }
      if (Number(l.unitPrice) > 0 && !near(Number(l.unitPrice), Number(item.unitPrice))) {
        add("linePrice", Number(l.unitPrice), Number(item.unitPrice), `"${item.itemName}": the document's unit price is ${money(l.unitPrice)}, the capture's ${money(item.unitPrice)}`);
      }
    }
    readLines.forEach((l, j) => {
      if (!used.has(j)) add("line", l.description, null, `"${l.description}" is on the document but was not captured`);
    });
    for (const c of payload?.checks || []) add("arithmetic", c.message, null, c.message);

    return {
      agrees: differences.length === 0,
      differences,
      readLines: readLines.length,
      capturedLines: (invoice.items || []).length,
    };
  }
}
