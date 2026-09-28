import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../utils/database";
import AuditService from "../AuditService";
import VATService from "../VATService";
import { VendorGateService } from "../VendorGateService";
import { VendorDocumentAttachmentService } from "../VendorDocumentAttachmentService";
import { VENDOR_DOCUMENT_ENTITY_TYPES } from "../../constants/vendorDocumentAttachment";
import { nextQuotationNumber } from "../../utils/accountingDocumentNumbers";
import { SourcingAccessService } from "./SourcingAccessService";
import { normalizeVatRate, computeTotals, assertDeclaredTotalsReconcile, submissionSnapshot, hashSnapshot } from "./QuotationTotals";

const fail = (message: string, status = 400, code?: string) => Object.assign(new Error(message), { status, code });

/** Approved alternative channels through which a quotation may reach procurement outside the vendor portal. */
export const CAPTURE_CHANNELS = ["EMAIL", "HAND_DELIVERY", "COURIER", "POST", "PORTAL_UNAVAILABLE"] as const;

/**
 * SRD §15: capture of a quotation received through an approved alternative channel, on the supplier's behalf, by an authorised
 * procurement user. It produces the same quotation record as the vendor portal (same fields, same derived totals, same frozen
 * snapshot and hash, same supersession rule), with Submission Method STAFF_CAPTURE, the channel, the capturing user and the time
 * it was actually received. The supplier's original document is required and is retained unaltered.
 */
export class QuotationCaptureService {
  static async capture(
    user: any,
    rfqId: string,
    input: any,
    files: Array<{ buffer: Buffer; originalname: string; mimetype: string; size?: number; envelope?: "TECHNICAL" | "COMMERCIAL" }>
  ) {
    const ctx = await SourcingAccessService.resolve(user, rfqId);
    if (!ctx.canCapture) throw fail("You are not authorised to capture quotations on a supplier's behalf.", 403, "NOT_AUTHORISED_TO_CAPTURE");
    const rfq: any = ctx.rfq;
    if (rfq.bidOpenedAt) throw fail("The bids of this event have been opened; no further quotation can be captured.", 409, "ALREADY_OPENED");
    if (String(rfq.status).toUpperCase() !== "OPEN") throw fail(`This event is ${String(rfq.status).toLowerCase()} and is not accepting quotations.`, 409);

    const vendorId = String(input.vendorId ?? "").trim();
    if (!vendorId) throw fail("Choose the supplier the quotation is from.");
    const invite = await prisma.rfqVendorInvitation.findUnique({ where: { procurementRfqId_vendorId: { procurementRfqId: rfq.id, vendorId } } });
    if (!invite) throw fail("That supplier was not invited to this event.", 400, "NOT_INVITED");
    const vendor: any = await prisma.vendor.findUnique({ where: { id: vendorId }, include: { settlementCurrency: { select: { code: true } } } });
    if (!vendor) throw fail("Supplier not found.", 404);
    await VendorGateService.assertTransactable(vendor.id, "QUOTE");

    const channel = String(input.channel ?? "").toUpperCase();
    if (!(CAPTURE_CHANNELS as readonly string[]).includes(channel)) throw fail(`Say how the quotation arrived: ${CAPTURE_CHANNELS.join(", ")}.`, 400, "CHANNEL_REQUIRED");
    const receivedAt = new Date(input.receivedAt);
    if (!input.receivedAt || Number.isNaN(receivedAt.getTime())) throw fail("Record when the quotation was actually received (date and time).", 400, "RECEIVED_AT_REQUIRED");
    if (receivedAt.getTime() > Date.now() + 60000) throw fail("The time received cannot be in the future.");
    if (rfq.closingAt && receivedAt.getTime() > new Date(rfq.closingAt).getTime()) {
      throw fail("The quotation was received after the closing deadline and cannot be accepted.", 409, "RECEIVED_AFTER_DEADLINE");
    }
    const reason = String(input.reason ?? "").trim();
    const capturedLate = !!rfq.closingAt && Date.now() > new Date(rfq.closingAt).getTime();
    if (capturedLate && reason.length < 10) throw fail("It is being captured after the deadline: say why (received in time, but not entered until now).", 400, "REASON_REQUIRED");
    if (!files.length) throw fail("Attach the supplier's original quotation document. It is kept exactly as received.", 400, "DOCUMENT_REQUIRED");

    const items = Array.isArray(input.items) ? input.items : [];
    if (!items.length) throw fail("At least one priced line is required.");
    if (items.length > 500) throw fail("Too many lines.");
    items.forEach((it: any, i: number) => {
      if (!String(it?.itemName ?? "").trim()) throw fail(`Line ${i + 1}: item name is required.`);
      const q = Number(it?.quantity);
      const p = Number(it?.unitPrice);
      if (!Number.isFinite(q) || q <= 0) throw fail(`Line ${i + 1}: quantity must be a positive number.`);
      if (!Number.isFinite(p) || p < 0 || p > 1e12) throw fail(`Line ${i + 1}: unit price must be zero or more.`);
    });
    const currencyCode = String(input.currencyCode || vendor.settlementCurrency?.code || "USD").toUpperCase();
    if (!(await prisma.currency.findFirst({ where: { code: currencyCode } }))) throw fail(`Currency ${currencyCode} is not supported.`);
    let validUntil: Date | undefined;
    if (input.validUntil) {
      validUntil = new Date(input.validUntil);
      if (Number.isNaN(validUntil.getTime())) throw fail("Quotation validity is not a valid date.");
      if (validUntil.getTime() < Date.now()) throw fail("Quotation validity must be a date in the future.");
    }
    let quotationDate: Date | undefined;
    if (input.quotationDate) {
      quotationDate = new Date(input.quotationDate);
      if (Number.isNaN(quotationDate.getTime())) throw fail("The quotation date is not a valid date.");
      if (quotationDate.getTime() > receivedAt.getTime() + 86400000) throw fail("The quotation date cannot be after it was received.");
    }
    const days = input.deliveryPeriodDays != null && String(input.deliveryPeriodDays).trim() !== "" ? Number(input.deliveryPeriodDays) : null;
    if (days != null && (!Number.isInteger(days) || days < 0 || days > 3650)) throw fail("The delivery period must be a whole number of days.");

    // Same derivation as the portal: totals come from the lines and a stated rate; anything read off the document must agree.
    await VATService.refreshActiveVatRate(false).catch(() => undefined);
    const rate = normalizeVatRate(input.vatRate, VATService.getDecimalRate());
    const totals = computeTotals(items, rate);
    assertDeclaredTotalsReconcile(totals, { subtotal: input.declaredSubtotal, taxAmount: input.declaredTaxAmount, totalAmount: input.declaredTotalAmount });

    const trim = (v: any) => (v == null || String(v).trim() === "" ? undefined : String(v).trim());
    let quotation: any = null;
    for (let attempt = 0; attempt < 10 && !quotation; attempt++) {
      const quotationNumber = await nextQuotationNumber(prisma, new Date());
      try {
        quotation = await prisma.vendorQuotation.create({
          data: {
            quotationNumber,
            rfqNumber: rfq.rfqNumber,
            requisitionId: rfq.requisitionId ?? undefined,
            procurementRfqId: rfq.id,
            vendorId: vendor.id,
            vendorName: vendor.contactPerson?.trim() || vendor.name,
            vendorEmail: vendor.email,
            companyName: vendor.name,
            taxEIN: vendor.taxNumber ?? undefined,
            contactPerson: vendor.contactPerson ?? undefined,
            phoneNumber: vendor.phone ?? undefined,
            address: vendor.address ?? undefined,
            validUntil,
            currencyCode,
            paymentTerms: trim(input.paymentTerms) || vendor.paymentTerms?.trim() || undefined,
            deliveryTerms: trim(input.deliveryTerms),
            deliveryTime: trim(input.deliveryTime),
            notes: trim(input.notes),
            quotationReference: trim(input.quotationReference)?.slice(0, 64),
            quotationDate,
            submissionMethod: "STAFF_CAPTURE",
            captureChannel: channel,
            capturedById: user.id,
            captureReason: reason || null,
            receivedAt,
            vatRate: new Decimal(rate),
            deliveryPeriodDays: days,
            subtotal: new Decimal(totals.subtotal),
            taxAmount: new Decimal(totals.taxAmount),
            totalAmount: new Decimal(totals.totalAmount),
            status: "SUBMITTED",
            // The instant the quotation reached us is its submission time, as it would be for the portal.
            submittedAt: receivedAt,
            items: {
              create: items.map((it: any, i: number) => ({
                itemName: String(it.itemName).trim(),
                description: trim(it.description),
                quantity: new Decimal(Number(it.quantity)),
                unit: trim(it.unit),
                unitPrice: new Decimal(Number(it.unitPrice)),
                totalPrice: new Decimal(totals.lines[i].totalPrice),
                brand: trim(it.brand),
                model: trim(it.model),
                warranty: trim(it.warranty),
              })),
            },
          },
          include: { items: true },
        });
      } catch (e: any) {
        if (e?.code === "P2002" && String(e.meta?.target || "").includes("quotation")) continue;
        throw e;
      }
    }
    if (!quotation) throw fail("Could not allocate a quotation number; try again.", 503);

    // The original documents, retained as received.
    for (const f of files) {
      await VendorDocumentAttachmentService.upload({
        file: f as any,
        entityType: VENDOR_DOCUMENT_ENTITY_TYPES.VENDOR_QUOTATION,
        entityId: quotation.id,
        actor: { kind: "staff", userId: user.id },
        overrides: { uploadSource: "STAFF_CAPTURE", envelope: f.envelope || "COMMERCIAL", captureChannel: channel },
      });
    }

    const snap = submissionSnapshot(quotation, quotation.items);
    quotation = await prisma.vendorQuotation.update({ where: { id: quotation.id }, data: { submittedSnapshot: snap as any, snapshotSha256: hashSnapshot(snap), acknowledgedAt: new Date() }, include: { items: true } });
    await prisma.vendorQuotation.updateMany({
      where: { procurementRfqId: rfq.id, vendorId: vendor.id, id: { not: quotation.id }, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      data: { status: "SUPERSEDED", supersededAt: new Date() },
    });
    await AuditService.log({
      userId: user.id,
      action: "CAPTURE_QUOTATION",
      entityType: "VendorQuotation",
      entityId: quotation.id,
      newValues: { rfqNumber: rfq.rfqNumber, supplier: vendor.name, channel, receivedAt: receivedAt.toISOString(), reason: reason || null, documents: files.map((f) => f.originalname), sha256: quotation.snapshotSha256 },
    });
    // The capturing user is told it was recorded, never the figures back: the event stays sealed to them too.
    return { id: quotation.id, quotationNumber: quotation.quotationNumber, supplier: vendor.name, submissionMethod: "STAFF_CAPTURE", captureChannel: channel, receivedAt, submittedAt: quotation.submittedAt, documents: files.length };
  }
}
