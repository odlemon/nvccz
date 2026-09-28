// @ts-nocheck
import { PrismaClient, Prisma, Decimal } from "@prisma/client";
import { VendorGateService } from "./VendorGateService";
import AuditService from "./AuditService";
import { EmailNotificationService } from "./EmailNotificationService";
import { normalizeVatRate, computeTotals, assertDeclaredTotalsReconcile, submissionSnapshot, hashSnapshot } from "./sourcing/QuotationTotals";
import VATService from "./VATService";

import { prisma } from '../utils/database';
import { nextQuotationNumber } from "../utils/accountingDocumentNumbers";
import {
  verifyVendorPortalToken,
  VENDOR_PORTAL_KIND_RFQ_SUBMIT,
} from "../utils/vendorPortalToken";
import { assertValidProcurementLineItems } from "../utils/procurementLineItemValidation";

/**
 * Render a vendor quotation PDF (with letterhead + ACCEPTED/REJECTED watermark) for email attachment.
 * Returns `undefined` on any failure so callers can fall back to plain emails. The quotation argument
 * is the Prisma row including its `items` relation; missing fields are normalised to PDF-friendly defaults.
 */
async function buildVendorQuotationPdfAttachment(
  quotation: any,
  decision: "ACCEPTED" | "REJECTED"
): Promise<{ filename: string; content: Buffer } | undefined> {
  if (!quotation) return undefined;
  try {
    const [
      { loadCapitalCallAccountingLetterhead },
      { buildVendorQuotationPdfBuffer, safeVendorQuotationPdfFileBaseName },
    ] = await Promise.all([
      import("../utils/capitalCallAccountingLetterhead"),
      import("../utils/vendorQuotationPdf"),
    ]);
    const letterhead = await loadCapitalCallAccountingLetterhead().catch(() => null);
    const pdf = await buildVendorQuotationPdfBuffer({
      quotationNumber: quotation.quotationNumber,
      rfqNumber: quotation.rfqNumber ?? null,
      status: quotation.status ?? null,
      submittedAt: quotation.submittedAt ?? null,
      validUntil: quotation.validUntil ?? null,
      reviewedAt: quotation.reviewedAt ?? null,
      reviewNotes: quotation.reviewNotes ?? null,
      rejectionReason: quotation.rejectionReason ?? null,
      paymentTerms: quotation.paymentTerms ?? null,
      deliveryTerms: quotation.deliveryTerms ?? null,
      deliveryTime: quotation.deliveryTime ?? null,
      currencyCode: quotation.currencyCode || "USD",
      subtotal: Number(quotation.subtotal ?? 0),
      taxAmount: Number(quotation.taxAmount ?? 0),
      totalAmount: Number(quotation.totalAmount ?? 0),
      vendor: {
        name: quotation.vendorName || "Vendor",
        email: quotation.vendorEmail ?? null,
        companyName: quotation.companyName ?? null,
        contactPerson: quotation.contactPerson ?? null,
        phoneNumber: quotation.phoneNumber ?? null,
        address: quotation.address ?? null,
        taxEIN: quotation.taxEIN ?? null,
      },
      items: Array.isArray(quotation.items)
        ? quotation.items.map((it: any) => ({
            itemName: it.itemName,
            description: it.description ?? null,
            quantity: Number(it.quantity ?? 0),
            unit: it.unit ?? null,
            unitPrice: Number(it.unitPrice ?? 0),
            totalPrice: Number(it.totalPrice ?? 0),
            brand: it.brand ?? null,
            model: it.model ?? null,
            warranty: it.warranty ?? null,
          }))
        : null,
      letterhead,
      decision,
    });
    const safeBase = safeVendorQuotationPdfFileBaseName(quotation.quotationNumber || "Quotation");
    return { filename: `Quotation-${safeBase}-${decision}.pdf`, content: pdf };
  } catch (e: any) {
    console.warn("⚠️  buildVendorQuotationPdfAttachment failed:", e?.message || e);
    return undefined;
  }
}

export interface CreateVendorQuotationParams {
  rfqNumber?: string;
  requisitionId?: string;
  /**
   * Signed portal token (`RFQ_SUBMIT`) from the RFQ email link. Required.
   * Alias: `token` (same string) is also accepted by the controller body passthrough.
   */
  vendorPortalToken: string;
  vendorName: string;
  vendorEmail: string;
  companyName?: string;
  taxEIN?: string;
  contactPerson?: string;
  phoneNumber?: string;
  address?: string;
  validUntil?: Date;
  currencyCode?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  deliveryTime?: string;
  notes?: string;
  attachments?: any;
  /** Phase 2 — staged upload ids from POST /procurement/document-attachments/portal/upload */
  attachmentIds?: string[];
  items: {
    itemName: string;
    description?: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
    specifications?: any;
    brand?: string;
    model?: string;
    warranty?: string;
  }[];
  /** Suite 03.8 — warranty, ESG, local content, etc. */
  technicalScoreJson?: Record<string, unknown>;
  /** §15 record fields */
  quotationReference?: string;
  quotationDate?: string | Date;
  /** Percent (15) or decimal (0.15); defaults to the active VAT rate. */
  vatRate?: number | string;
  deliveryPeriodDays?: number | string;
  /** Optional figures the supplier read off their own document; they must reconcile with the lines. */
  declaredSubtotal?: number | string;
  declaredTaxAmount?: number | string;
  declaredTotalAmount?: number | string;
}

export interface ReviewQuotationParams {
  quotationId: string;
  action: "ACCEPT" | "REJECT";
  reviewedById: string;
  reviewNotes?: string;
  rejectionReason?: string;
  createPO?: boolean; // Whether to automatically create PO on acceptance (default: true)
  createInvoice?: boolean; // Whether to automatically create invoice on acceptance (default: false, creates after GRN)
}

/**
 * A vendor may declare technical attributes with its quotation (warranty, ESG, local content),
 * but never its own evaluation. `score` and `evaluation` belong to the evaluation team, set
 * through PUT /vendor-quotations/:id/evaluation; a vendor-supplied value for either is dropped.
 * PROC-FINDING-006: a vendor's self-declared score of 100 was counted as its technical evaluation.
 */
function vendorDeclarationsOnly(json: unknown): Record<string, unknown> | undefined {
  if (!json || typeof json !== "object" || Array.isArray(json)) return undefined;
  const { score: _score, evaluation: _evaluation, ...declarations } = json as Record<string, unknown>;
  return Object.keys(declarations).length ? declarations : undefined;
}

export class VendorQuotationService {
  /**
   * Prefer `vendorId` on the quotation; fall back to email match (legacy rows).
   * Used for RFQ award PO creation and reject emails.
   */
  static async resolveVendorForQuotation(quotation: {
    vendorId: string | null;
    vendorEmail: string;
  }) {
    let vendor =
      quotation.vendorId &&
      (await prisma.vendor.findUnique({
        where: { id: quotation.vendorId },
        select: { id: true, name: true, email: true, contactPerson: true },
      }));
    const fallbackEmail = String(quotation.vendorEmail || "").trim();
    if (!vendor?.email?.trim() && fallbackEmail) {
      vendor = await prisma.vendor.findFirst({
        where: { email: fallbackEmail },
        select: { id: true, name: true, email: true, contactPerson: true },
      });
    }
    if (!vendor?.email?.trim()) {
      throw new Error(
        "Vendor not found for this quotation (missing vendorId link or unknown email). Update the vendor master record."
      );
    }
    return vendor;
  }

  /**
   * Create a vendor quotation (no authentication required)
   * This is called when a vendor submits their quote through the public form
   */
  /** Email the supplier a receipt for their submission. Best effort: a mail failure never voids a submission. */
  static async sendSubmissionReceipt(quotation: any, to: string, name: string, rfqNumber: string, currency: string) {
    if (!to) return;
    const { emailTransport, getFromAddress } = await import("../config/email.config");
    const when = new Date(quotation.submittedAt || Date.now()).toISOString().replace("T", " ").slice(0, 16) + " UTC";
    await emailTransport.sendMail({
      from: getFromAddress(),
      to,
      subject: `Receipt: quotation ${quotation.quotationNumber} for ${rfqNumber}`,
      text:
        `Dear ${name},\n\nWe acknowledge receipt of your quotation ${quotation.quotationNumber} for ${rfqNumber}, submitted ${when}.\n` +
        `Total offered: ${currency} ${Number(quotation.totalAmount).toFixed(2)}.\n\n` +
        `This is an acknowledgement of receipt only; it is not an award. Until the deadline you may submit a revised quotation, ` +
        `which replaces this one. After the deadline your submission is locked.\n`,
    });
  }

  static async createVendorQuotation(params: CreateVendorQuotationParams) {
    try {
      const {
        rfqNumber,
        requisitionId,
        vendorPortalToken,
        vendorName,
        vendorEmail,
        companyName,
        taxEIN,
        contactPerson,
        phoneNumber,
        address,
        validUntil,
        currencyCode,
        paymentTerms,
        deliveryTerms,
        deliveryTime,
        notes,
        attachments,
        attachmentIds,
        items,
        technicalScoreJson,
      } = params;

      const portalRaw = String(vendorPortalToken || "").trim();
      if (!portalRaw) {
        throw new Error("vendorPortalToken is required");
      }
      const portalPayload = verifyVendorPortalToken(portalRaw);
      if (portalPayload.k !== VENDOR_PORTAL_KIND_RFQ_SUBMIT) {
        throw new Error("Invalid vendor portal token for quotation submission");
      }
      const vendorIdFromToken = portalPayload.v;
      const procurementRfqIdFromToken = portalPayload.r;

      const rfqRow = await prisma.procurementRfq.findUnique({
        where: { id: procurementRfqIdFromToken },
        select: {
          id: true,
          rfqNumber: true,
          status: true,
          closingAt: true,
          requisitionId: true,
        },
      });
      if (!rfqRow) {
        throw new Error("RFQ not found for this token");
      }
      if (rfqRow.status !== "OPEN") {
        throw new Error(`RFQ is not accepting quotations (status: ${rfqRow.status})`);
      }
      if (rfqRow.closingAt && new Date() > new Date(rfqRow.closingAt)) {
        throw new Error("RFQ submission deadline has passed");
      }

      const invite = await prisma.rfqVendorInvitation.findUnique({
        where: {
          procurementRfqId_vendorId: {
            procurementRfqId: procurementRfqIdFromToken,
            vendorId: vendorIdFromToken,
          },
        },
      });
      if (!invite) {
        throw new Error("This vendor is not invited to this RFQ");
      }

      const vendorRow = await prisma.vendor.findUnique({
        where: { id: vendorIdFromToken },
        select: {
          id: true,
          email: true,
          name: true,
          taxNumber: true,
          contactPerson: true,
          phone: true,
          address: true,
          paymentTerms: true,
          settlementCurrency: { select: { code: true } },
        },
      });
      if (!vendorRow) {
        throw new Error("Vendor not found");
      }
      // A vendor that is no longer Approved and compliant cannot quote, even on an invitation issued earlier.
      await VendorGateService.assertTransactable(vendorRow.id, "QUOTE");
      const recordEmail = String(vendorRow.email || "")
        .trim()
        .toLowerCase();
      const submittedEmail = String(vendorEmail || "")
        .trim()
        .toLowerCase();
      if (!recordEmail || recordEmail !== submittedEmail) {
        throw new Error("Vendor email does not match the invited vendor for this RFQ");
      }

      const trimIn = (v: unknown) => {
        const t = v == null ? "" : String(v).trim();
        return t.length > 0 ? t : undefined;
      };

      const resolvedVendorEmail = String(vendorRow.email).trim();
      const resolvedCompanyName =
        String(vendorRow.name || "").trim() || trimIn(companyName) || "Vendor";
      const resolvedVendorName =
        String(vendorRow.contactPerson || "").trim() ||
        trimIn(vendorName) ||
        resolvedCompanyName;
      const resolvedContactPerson =
        String(vendorRow.contactPerson || "").trim() ||
        trimIn(contactPerson) ||
        trimIn(vendorName) ||
        resolvedCompanyName;
      const resolvedTaxEIN =
        vendorRow.taxNumber?.trim() || trimIn(taxEIN) || undefined;
      const resolvedPhone =
        vendorRow.phone?.trim() || trimIn(phoneNumber) || undefined;
      const resolvedAddress =
        vendorRow.address?.trim() || trimIn(address) || undefined;
      // What the supplier states is what they offer; the vendor master is only the default when they state nothing.
      // PROC-FINDING-017: unlike name/tax EIN/phone/address (stable vendor identity fields the
      // server should trust over a resubmitted form value), payment terms are negotiated per
      // quotation and SRD-required as something the vendor states on *this* submission. The old
      // precedence here (vendor-master value first) meant every quotation silently recorded the
      // vendor master's default (e.g. "Net 30") and discarded whatever the vendor actually typed
      // on the RFQ response form - the vendor-typed value must win, with the master record only a
      // fallback for vendors who leave the field blank via a legacy client.
      const resolvedPaymentTerms =
        trimIn(paymentTerms) || vendorRow.paymentTerms?.trim() || undefined;

      if (rfqNumber && rfqRow.rfqNumber !== rfqNumber) {
        throw new Error("rfqNumber does not match this invitation token");
      }

      const effectiveRfqNumber = rfqRow.rfqNumber;
      const effectiveProcurementRfqId = rfqRow.id;
      // The requisition is the RFQ's own; a supplier-supplied id is ignored (it could attach the quote to someone else's requisition).
      const effectiveRequisitionId = rfqRow.requisitionId ?? undefined;

      let procurementRfqId: string | null = effectiveProcurementRfqId;

      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("📝 CREATING VENDOR QUOTATION");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📧 Vendor Email: ${resolvedVendorEmail}`);
      console.log(`🏢 Company: ${resolvedCompanyName}`);
      console.log(`📋 RFQ Number: ${effectiveRfqNumber}`);
      console.log(`📦 Items: ${items.length}`);
      console.log("");

      // Currency: the supplier's choice, else their vendor-master settlement currency; it must be a real currency.
      const resolvedCurrency = String(trimIn(currencyCode) || vendorRow.settlementCurrency?.code || "USD").toUpperCase();
      const currencyRow = await prisma.currency.findFirst({ where: { code: resolvedCurrency } });
      if (!currencyRow) throw new Error(`Currency ${resolvedCurrency} is not supported`);

      if (!Array.isArray(items) || items.length === 0) throw new Error("At least one priced line is required");
      if (items.length > 500) throw new Error("Too many lines");
      for (const [i, it] of items.entries()) {
        const q = Number(it?.quantity);
        const p = Number(it?.unitPrice);
        if (!String(it?.itemName ?? "").trim()) throw new Error(`Line ${i + 1}: item name is required`);
        if (!Number.isFinite(q) || q <= 0) throw new Error(`Line ${i + 1}: quantity must be a positive number`);
        if (!Number.isFinite(p) || p < 0 || p > 1e12) throw new Error(`Line ${i + 1}: unit price must be zero or more`);
      }
      let validUntilDate: Date | undefined;
      if (validUntil != null && String(validUntil).trim() !== "") {
        validUntilDate = new Date(validUntil as any);
        if (Number.isNaN(validUntilDate.getTime())) throw new Error("Quotation validity date is not a valid date");
        if (validUntilDate.getTime() < Date.now()) throw new Error("Quotation validity must be a date in the future");
      }

      // §15: subtotal, VAT and total come from the lines and a stated rate; a figure the supplier also states must agree.
      await VATService.refreshActiveVatRate(false).catch(() => undefined);
      const vatRateDecimal = normalizeVatRate(params.vatRate, VATService.getDecimalRate());
      const computed = computeTotals(items, vatRateDecimal);
      assertDeclaredTotalsReconcile(computed, { subtotal: params.declaredSubtotal, taxAmount: params.declaredTaxAmount, totalAmount: params.declaredTotalAmount });
      const subtotal = computed.subtotal;
      const taxAmount = computed.taxAmount;
      const totalAmount = computed.totalAmount;
      const processedItems = items.map((item, i) => ({ ...item, totalPrice: computed.lines[i].totalPrice }));
      let quotationDateValue: Date | undefined;
      if (params.quotationDate != null && String(params.quotationDate).trim() !== "") {
        quotationDateValue = new Date(params.quotationDate as any);
        if (Number.isNaN(quotationDateValue.getTime())) throw new Error("The quotation date is not a valid date");
        if (quotationDateValue.getTime() > Date.now() + 86400000) throw new Error("The quotation date cannot be in the future");
      }
      const deliveryDays = params.deliveryPeriodDays != null && String(params.deliveryPeriodDays).trim() !== "" ? Number(params.deliveryPeriodDays) : null;
      if (deliveryDays != null && (!Number.isInteger(deliveryDays) || deliveryDays < 0 || deliveryDays > 3650)) throw new Error("The delivery period must be a whole number of days");

      console.log("💰 Financial Summary:");
      console.log(`   Subtotal: $${subtotal.toFixed(2)}`);
      console.log(`   Tax: $${taxAmount.toFixed(2)}`);
      console.log(`   Total: $${totalAmount.toFixed(2)}`);
      console.log("");

      const quotationDataBase = {
        rfqNumber: effectiveRfqNumber,
        requisitionId: effectiveRequisitionId,
        vendorId: vendorIdFromToken,
        vendorName: resolvedVendorName,
        vendorEmail: resolvedVendorEmail,
        companyName: resolvedCompanyName,
        taxEIN: resolvedTaxEIN,
        contactPerson: resolvedContactPerson,
        phoneNumber: resolvedPhone,
        address: resolvedAddress,
        validUntil: validUntilDate,
        currencyCode: resolvedCurrency,
        paymentTerms: resolvedPaymentTerms,
        deliveryTerms,
        deliveryTime,
        notes,
        attachments,
        procurementRfqId,
        technicalScoreJson: vendorDeclarationsOnly(technicalScoreJson),
        quotationReference: trimIn(params.quotationReference)?.slice(0, 64),
        quotationDate: quotationDateValue,
        submissionMethod: "VENDOR_PORTAL",
        vatRate: new Decimal(vatRateDecimal),
        deliveryPeriodDays: deliveryDays,
        subtotal: new Decimal(subtotal),
        taxAmount: new Decimal(taxAmount),
        totalAmount: new Decimal(totalAmount),
        status: "SUBMITTED" as const,
        items: {
          create: processedItems.map(item => ({
            itemName: item.itemName,
            description: item.description,
            quantity: new Decimal(item.quantity),
            unit: item.unit,
            unitPrice: new Decimal(item.unitPrice),
            totalPrice: new Decimal(item.totalPrice),
            specifications: item.specifications,
            brand: item.brand,
            model: item.model,
            warranty: item.warranty
          }))
        }
      };

      let quotation = null;
      let lastQuotationErr: any = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        const quotationNumber = await nextQuotationNumber(prisma, new Date());
        try {
          quotation = await prisma.vendorQuotation.create({
            data: {
              quotationNumber,
              ...quotationDataBase
            },
            include: {
              items: true
            }
          });
          break;
        } catch (error: any) {
          lastQuotationErr = error;
          if (error?.code === "P2002") {
            const t = error.meta?.target;
            const fields = Array.isArray(t) ? t : t != null ? [t] : [];
            const hit = fields.some(
              (x: string) =>
                x === "quotationNumber" || String(x).includes("quotation_number")
            );
            if (hit) continue;
          }
          throw error;
        }
      }

      if (!quotation) {
        throw lastQuotationErr instanceof Error
          ? lastQuotationErr
          : new Error(String(lastQuotationErr));
      }

      // §15: the record as submitted, frozen with a hash, so it can be shown later that nothing in it has changed.
      {
        const snap = submissionSnapshot(quotation, quotation.items);
        quotation = await prisma.vendorQuotation.update({
          where: { id: quotation.id },
          data: { submittedSnapshot: snap as any, snapshotSha256: hashSnapshot(snap) },
          include: { items: true },
        });
      }

      // One live submission per supplier per event: a revision (allowed only while the event is open) replaces the earlier one.
      await prisma.vendorQuotation.updateMany({
        where: {
          procurementRfqId,
          vendorId: vendorIdFromToken,
          id: { not: quotation.id },
          status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
        },
        data: { status: "SUPERSEDED", supersededAt: new Date() },
      });
      // Acknowledgement receipt: recorded on the submission and sent to the supplier.
      await prisma.vendorQuotation.update({ where: { id: quotation.id }, data: { acknowledgedAt: new Date() } }).catch(() => undefined);
      VendorQuotationService.sendSubmissionReceipt(quotation, resolvedVendorEmail, resolvedVendorName, effectiveRfqNumber, resolvedCurrency).catch(() => undefined);

      if (attachmentIds?.length) {
        const { VendorDocumentAttachmentService } = await import(
          "./VendorDocumentAttachmentService"
        );
        await VendorDocumentAttachmentService.linkStagedAttachments({
          attachmentIds,
          entityType: "VENDOR_QUOTATION",
          entityId: quotation.id,
          vendorId: vendorIdFromToken
        });
        quotation = await prisma.vendorQuotation.findUnique({
          where: { id: quotation.id },
          include: { items: true }
        });
      }

      console.log("✅ Quotation Created Successfully!");
      console.log(`   Quotation Number: ${quotation.quotationNumber}`);
      console.log(`   Status: ${quotation.status}`);
      console.log("════════════════════════════════════════════════════════════════\n");

      // Notify procurement requester (if the requisition exists and has an owner)
      let requisitionForNotify: {
        requisitionNumber: string;
        title: string;
        requestedBy: { firstName: string; lastName: string; email: string } | null;
      } | null = null;

      // §16: while the event is sealed nobody on staff is told who quoted or how much, by any channel.
      const { phaseOf } = await import("./sourcing/SourcingAccessService");
      const eventSealed = phaseOf(await prisma.procurementRfq.findUnique({ where: { id: effectiveProcurementRfqId } })) !== "OPENED";

      if (effectiveRequisitionId && !eventSealed) {
        requisitionForNotify = await prisma.purchaseRequisition.findUnique({
          where: { id: effectiveRequisitionId },
          include: {
            requestedBy: {
              select: {
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        });

        if (requisitionForNotify && requisitionForNotify.requestedBy?.email) {
          const requesterName = `${requisitionForNotify.requestedBy.firstName} ${requisitionForNotify.requestedBy.lastName}`;
          await EmailNotificationService.sendQuotationSubmittedNotification({
            requesterName,
            requesterEmail: requisitionForNotify.requestedBy.email,
            vendorName: resolvedCompanyName,
            vendorEmail: resolvedVendorEmail,
            companyName: resolvedCompanyName,
            contactPerson: resolvedContactPerson,
            taxEIN: resolvedTaxEIN,
            phoneNumber: resolvedPhone,
            address: resolvedAddress,
            paymentTerms: resolvedPaymentTerms,
            deliveryTerms: trimIn(deliveryTerms),
            deliveryTime: trimIn(deliveryTime),
            rfqNumber: effectiveRfqNumber,
            quotationNumber: quotation.quotationNumber,
            totalAmount: Number(quotation.totalAmount),
            currencyCode,
            items: quotation.items.map(item => ({
              itemName: item.itemName,
              description: item.description,
              quantity: Number(item.quantity),
              unit: item.unit || 'unit',
              unitPrice: Number(item.unitPrice),
              totalPrice: Number(item.totalPrice)
            })),
            requisitionNumber: requisitionForNotify.requisitionNumber,
            requisitionTitle: requisitionForNotify.title,
            notes
          });
        }
      }

      try {
        if (eventSealed) throw Object.assign(new Error("sealed"), { sealed: true });
        const { ProcurementService } = await import("./ProcurementService");
        const deskRecipients = await ProcurementService.resolveProcurementDeskNotifyRecipients();
        const skipEmails = new Set<string>();
        if (requisitionForNotify?.requestedBy?.email) {
          skipEmails.add(requisitionForNotify.requestedBy.email.trim().toLowerCase());
        }
        const payloadBase = {
          vendorName: resolvedCompanyName,
          vendorEmail: resolvedVendorEmail,
          companyName: resolvedCompanyName,
          contactPerson: resolvedContactPerson,
          taxEIN: resolvedTaxEIN,
          phoneNumber: resolvedPhone,
          address: resolvedAddress,
          paymentTerms: resolvedPaymentTerms,
          deliveryTerms: trimIn(deliveryTerms),
          deliveryTime: trimIn(deliveryTime),
          rfqNumber: effectiveRfqNumber,
          quotationNumber: quotation.quotationNumber,
          totalAmount: Number(quotation.totalAmount),
          currencyCode,
          items: quotation.items.map(item => ({
            itemName: item.itemName,
            description: item.description,
            quantity: Number(item.quantity),
            unit: item.unit || "unit",
            unitPrice: Number(item.unitPrice),
            totalPrice: Number(item.totalPrice),
          })),
          requisitionNumber: requisitionForNotify?.requisitionNumber,
          requisitionTitle: requisitionForNotify?.title,
          notes,
        };
        for (const r of deskRecipients) {
          const em = r.email?.trim().toLowerCase();
          if (!em || skipEmails.has(em)) continue;
          try {
            await EmailNotificationService.sendQuotationSubmittedDeskCopy({
              recipientName: r.name,
              recipientEmail: r.email,
              ...payloadBase,
            });
          } catch (oneDeskErr) {
            console.error(
              `⚠️  Desk quotation notify failed for ${r.email}:`,
              (oneDeskErr as Error)?.message || oneDeskErr
            );
          }
        }
      } catch (deskErr) {
        if (!(deskErr as any)?.sealed) console.error("⚠️  Desk notification for new quotation failed:", (deskErr as Error)?.message || deskErr);
      }

      // The submission reaches the procurement audit trail. It comes through the vendor's signed link, so
      // there is no signed-in user; the vendor is named as the actor instead. A failed audit write must
      // not lose a quotation the vendor has already been told was received.
      if (quotation?.id) {
        try {
          await AuditService.log({
            userId: null,
            action: "SUBMIT",
            entityType: "VendorQuotation",
            entityId: quotation.id,
            newValues: {
              rfqNumber: quotation.rfqNumber,
              companyName: quotation.companyName,
              via: "vendor portal",
              actor: `${quotation.companyName || "Vendor"} (vendor portal)`,
            },
          });
        } catch (auditErr) {
          console.error("audit VendorQuotation SUBMIT:", (auditErr as Error)?.message || auditErr);
        }
      }

      return quotation;
    } catch (error: any) {
      console.error("❌ Error creating vendor quotation:", error);
      throw error;
    }
  }

  /**
   * Get all quotations (with optional filters)
   */
  static async getAllQuotations(filters?: {
    status?: string;
    rfqNumber?: string;
    vendorEmail?: string;
    limit?: number;
    offset?: number;
  }, actor?: any) {
    try {
      const {
        status,
        rfqNumber,
        vendorEmail,
        limit = 50,
        offset = 0
      } = filters || {};

      const where: any = {};

      if (status) where.status = status;
      if (rfqNumber) where.rfqNumber = rfqNumber;
      if (vendorEmail) where.vendorEmail = { contains: vendorEmail };

      const [quotations, count] = await Promise.all([
        prisma.vendorQuotation.findMany({
          where,
          include: {
            items: true,
            reviewedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                status: true,
                totalAmount: true
              }
            }
          },
          orderBy: { submittedAt: 'desc' },
          take: limit,
          skip: offset
        }),
        prisma.vendorQuotation.count({ where })
      ]);

      // §16: what the caller may read of each event's submissions; sealed ones are counted, not returned.
      const { SourcingAccessService } = await import("./sourcing/SourcingAccessService");
      const { visible, sealed } = await SourcingAccessService.forStaff(quotations, actor);

      return {
        quotations: visible,
        sealedEvents: sealed,
        count,
        limit,
        offset
      };
    } catch (error: any) {
      console.error("Error fetching quotations:", error);
      throw error;
    }
  }

  /**
   * Get quotation by ID
   */
  static async getQuotationById(quotationId: string, actor?: any) {
    try {
      const quotation = await prisma.vendorQuotation.findUnique({
        where: { id: quotationId },
        include: {
          items: true,
          reviewedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              totalAmount: true,
              createdAt: true
            }
          }
        }
      });

      if (!quotation) {
        throw new Error("Quotation not found");
      }

      if (quotation.procurementRfqId) {
        const { SourcingAccessService } = await import("./sourcing/SourcingAccessService");
        const ctx = await SourcingAccessService.assertCanSeeSubmissions(actor, quotation.procurementRfqId, `quotation ${quotationId}`);
        return SourcingAccessService.sanitizeQuotation(quotation, ctx);
      }
      return quotation;
    } catch (error: any) {
      console.error("Error fetching quotation:", error);
      throw error;
    }
  }

  /**
   * Accept or reject a vendor quotation
   */
  /**
   * The evaluation team's technical score for a bid (0–100).
   * Supports multi-evaluator + per-criterion scores (§17–18):
   * - `criteriaScores`: [{ id|name, score, weight? }] → weighted average becomes this evaluator's score
   * - Each call appends to `technicalScoreJson.evaluators[]`; team score is the average of evaluators
   * - Legacy: a plain `score` still works as a single-evaluator update (replaces own prior entry)
   */
  static async recordEvaluation(params: {
    quotationId: string;
    score?: number;
    criteriaScores?: Array<{ id?: string; name?: string; score: number; weight?: number }>;
    notes?: string;
    scoredById: string;
  }) {
    const { quotationId, notes, scoredById } = params;
    let score = params.score;

    if (params.criteriaScores && params.criteriaScores.length > 0) {
      let weightSum = 0;
      let weighted = 0;
      for (const c of params.criteriaScores) {
        const s = Number(c.score);
        if (!Number.isFinite(s) || s < 0 || s > 100) {
          throw new Error("Each criterion score must be a number from 0 to 100");
        }
        const w = c.weight != null && Number.isFinite(Number(c.weight)) ? Number(c.weight) : 1;
        weightSum += w;
        weighted += s * w;
      }
      score = weightSum > 0 ? weighted / weightSum : 0;
    }

    if (!Number.isFinite(score as number) || (score as number) < 0 || (score as number) > 100) {
      throw new Error("Technical score must be a number from 0 to 100");
    }
    score = Number(score);

    const quotation = await prisma.vendorQuotation.findUnique({
      where: { id: quotationId },
      select: { id: true, status: true, technicalScoreJson: true, procurementRfqId: true },
    });
    if (!quotation) throw new Error("Quotation not found");
    if (quotation.status !== "SUBMITTED" && quotation.status !== "UNDER_REVIEW") {
      throw new Error(`Quotation has already been ${String(quotation.status).toLowerCase()}`);
    }

    // Optional: validate criterion ids against RFQ scoringConfig.criteria
    if (params.criteriaScores?.length && quotation.procurementRfqId) {
      const rfq = await prisma.procurementRfq.findUnique({
        where: { id: quotation.procurementRfqId },
        select: { scoringConfig: true },
      });
      const cfg = rfq?.scoringConfig as { criteria?: Array<{ id?: string; name?: string }> } | null;
      if (cfg?.criteria?.length) {
        const allowed = new Set(
          cfg.criteria.flatMap((c) => [String(c.id || "").toLowerCase(), String(c.name || "").toLowerCase()].filter(Boolean))
        );
        for (const c of params.criteriaScores) {
          const key = String(c.id || c.name || "").toLowerCase();
          if (key && allowed.size && !allowed.has(key)) {
            throw new Error(`Criterion "${c.id || c.name}" is not on this RFQ's evaluation criteria`);
          }
        }
      }
    }

    const scorer = await prisma.user.findUnique({
      where: { id: scoredById },
      select: { firstName: true, lastName: true, email: true },
    });
    const existing =
      quotation.technicalScoreJson && typeof quotation.technicalScoreJson === "object" && !Array.isArray(quotation.technicalScoreJson)
        ? ({ ...(quotation.technicalScoreJson as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    const evaluatorEntry = {
      scoredById,
      scoredByName: scorer ? `${scorer.firstName ?? ""} ${scorer.lastName ?? ""}`.trim() || scorer.email : null,
      scoredAt: new Date().toISOString(),
      score,
      notes: notes ?? null,
      criteriaScores: params.criteriaScores ?? null,
    };

    const priorEvaluators = Array.isArray(existing.evaluators)
      ? (existing.evaluators as Array<{ scoredById?: string }>).filter((e) => e?.scoredById !== scoredById)
      : [];
    // Legacy single evaluation object: treat as prior entry from that scorer if same person
    const legacy = existing.evaluation as { scoredById?: string; score?: number } | undefined;
    if (legacy?.scoredById && legacy.scoredById !== scoredById && !priorEvaluators.some((e) => e.scoredById === legacy.scoredById)) {
      priorEvaluators.push(legacy as any);
    }
    const evaluators = [...priorEvaluators, evaluatorEntry];
    const teamScore =
      evaluators.reduce((s, e) => s + Number((e as any).score || 0), 0) / Math.max(1, evaluators.length);

    const evaluation = {
      score: teamScore,
      notes: notes ?? null,
      scoredById,
      scoredByName: evaluatorEntry.scoredByName,
      scoredAt: evaluatorEntry.scoredAt,
      evaluatorCount: evaluators.length,
      criteriaScores: params.criteriaScores ?? null,
    };

    const previous = (existing.evaluation as { score?: unknown } | undefined)?.score ?? null;
    const updated = await prisma.vendorQuotation.update({
      where: { id: quotationId },
      data: { technicalScoreJson: { ...existing, evaluation, evaluators } as any },
    });

    await AuditService.log({
      userId: scoredById,
      action: "SCORE",
      entityType: "VendorQuotation",
      entityId: quotationId,
      oldValues: { technicalScore: previous },
      newValues: { technicalScore: teamScore, evaluatorCount: evaluators.length, notes: notes ?? null },
    });

    return updated;
  }

  static async reviewQuotation(params: ReviewQuotationParams) {
    try {
      const {
        quotationId,
        action,
        reviewedById,
        reviewNotes,
        rejectionReason,
        createPO = true,
        createInvoice = false,
      } = params;

      console.log("\n════════════════════════════════════════════════════════════════");
      console.log(`📋 REVIEWING VENDOR QUOTATION - ${action}`);
      console.log("════════════════════════════════════════════════════════════════");

      // Get quotation
      const quotation = await prisma.vendorQuotation.findUnique({
        where: { id: quotationId },
        include: {
          items: true
        }
      });

      if (!quotation) {
        throw new Error("Quotation not found");
      }

      if (quotation.status !== "SUBMITTED" && quotation.status !== "UNDER_REVIEW") {
        throw new Error(`Quotation has already been ${quotation.status.toLowerCase()}`);
      }

      // §16/§20: an award is finalised only from an approved recommendation for this quotation, after formal opening; a
      // rejection needs the bids opened and released to the person rejecting.
      if (quotation.procurementRfqId) {
        const { AwardRecommendationService } = await import("./sourcing/AwardRecommendationService");
        if (action === "ACCEPT") {
          await AwardRecommendationService.assertAwardable(quotation, reviewedById);
        } else {
          const { SourcingAccessService } = await import("./sourcing/SourcingAccessService");
          const actorUser = await prisma.user.findUnique({ where: { id: reviewedById }, include: { role: true } });
          const ctx = await SourcingAccessService.assertCanSeeSubmissions(actorUser, quotation.procurementRfqId, `reject quotation ${quotationId}`);
          if (ctx.level !== "FULL") throw Object.assign(new Error("Only the procurement team can reject a quotation."), { status: 403 });
        }
      }

      // SRD §60 step 7 "Committee evaluates" before step 9 "Approver approves" (PROC-FINDING-014).
      // Only enforced when there is an actual comparison to make -- a sole-source/single-bid RFQ has
      // nothing to score against, and the SRD's own example journey frames scoring as a comparison
      // step, not an award gate in its own right. A competitive RFQ (2+ open quotations) must have
      // every one of them scored before any can be awarded, so a careless or rushed award can't skip
      // the evaluation step the UI itself expects to have already happened.
      if (action === "ACCEPT" && quotation.procurementRfqId) {
        const competingQuotations = await prisma.vendorQuotation.findMany({
          where: {
            procurementRfqId: quotation.procurementRfqId,
            status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
          },
          select: { id: true, quotationNumber: true, companyName: true, vendorName: true, technicalScoreJson: true },
        });
        if (competingQuotations.length > 1) {
          const hasScore = (q: (typeof competingQuotations)[number]) => {
            const evalScore = (q.technicalScoreJson as any)?.evaluation?.score;
            return typeof evalScore === "number" && Number.isFinite(evalScore);
          };
          const unscored = competingQuotations.filter((q) => !hasScore(q));
          if (unscored.length > 0) {
            const names = unscored.map((q) => q.companyName || q.vendorName || q.quotationNumber).join(", ");
            throw new Error(
              `All submitted quotations on this RFQ must be technically scored before one can be awarded. Missing evaluation for: ${names}.`
            );
          }
        }
      }

      console.log(`   Quotation: ${quotation.quotationNumber}`);
      console.log(`   Vendor: ${quotation.companyName || quotation.vendorName}`);
      console.log(`   Amount (stored): $${Number(quotation.totalAmount).toFixed(2)}`);
      console.log(`   Action: ${action}`);
      console.log("");

      if (action === "ACCEPT") {
        // Award gate, checked at the moment of award: the vendor must still be Approved, fully approved and compliant.
        const awardVendorId =
          quotation.vendorId ||
          (await VendorQuotationService.resolveVendorForQuotation(quotation).catch(() => null))?.id;
        if (!awardVendorId) {
          throw new Error("This quotation cannot be awarded: its vendor is not identified in the vendor master.");
        }
        await VendorGateService.assertTransactable(awardVendorId, "AWARD");
      }

      const newStatus = action === "ACCEPT" ? "ACCEPTED" : "REJECTED";

      // The figures are those the supplier submitted (or that were captured from their document): reviewing never recomputes them.
      const alignedSubtotal = Number(quotation.subtotal);
      const alignedTax = Number(quotation.taxAmount);
      const alignedTotal = Number(quotation.totalAmount);

      let rejectionFingerprint: string | null = null;
      if (action === "REJECT") {
        const { computeVendorQuotationRejectionFingerprint } = await import(
          "../utils/procurementEntityRejectionFingerprint"
        );
        rejectionFingerprint = computeVendorQuotationRejectionFingerprint(quotation);
      }

      // Update quotation status
      const updatedQuotation = await prisma.vendorQuotation.update({
        where: { id: quotationId },
        data: {
          status: newStatus,
          reviewedById,
          reviewedAt: new Date(),
          reviewNotes,
          rejectionReason: action === "REJECT" ? rejectionReason : null,
          rejectionContentFingerprint: action === "REJECT" ? rejectionFingerprint : null,
          subtotal: new Decimal(alignedSubtotal),
          taxAmount: new Decimal(alignedTax),
          totalAmount: new Decimal(alignedTotal),
        },
        include: {
          items: true,
          reviewedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      console.log(`✅ Quotation ${action === "ACCEPT" ? "accepted" : "rejected"}`);

      // Create audit log
      await AuditService.log({
        userId: reviewedById,
        action: action === "ACCEPT" ? "APPROVE" : "REJECT",
        entityType: "VendorQuotation",
        entityId: quotationId,
        newValues: {
          status: newStatus,
          reviewNotes,
          rejectionReason
        }
      });

      let masterVendor: {
        id: string;
        name: string;
        email: string;
        contactPerson: string | null;
      } | null = null;
      try {
        masterVendor = await VendorQuotationService.resolveVendorForQuotation(quotation);
      } catch (e: any) {
        console.warn(
          "⚠️  Could not resolve vendor master for this quotation (emails will use stored quotation fields):",
          e?.message || e
        );
      }

      const notifyVendorName = masterVendor
        ? masterVendor.contactPerson?.trim() || masterVendor.name
        : quotation.companyName || quotation.vendorName;
      const notifyVendorEmail = masterVendor?.email?.trim() || quotation.vendorEmail;

      if (action === "ACCEPT" && quotation.rfqNumber) {
        await this.rejectOtherQuotations(quotation.rfqNumber, quotation, reviewedById);
      }

      // Rejection email only here; acceptance with PO uses one combined PO email (no quotation PDF).
      if (action === "REJECT") {
        try {
          const pdfAttachment = await buildVendorQuotationPdfAttachment(updatedQuotation, "REJECTED").catch(
            (e: any) => {
              console.warn("⚠️  Failed to render quotation PDF (continuing without attachment):", e?.message || e);
              return undefined;
            }
          );
          await EmailNotificationService.sendQuotationRejectedEmail({
            vendorName: notifyVendorName,
            vendorEmail: notifyVendorEmail,
            quotationNumber: quotation.quotationNumber,
            quotationAmount: Number(updatedQuotation.totalAmount),
            currencyCode: quotation.currencyCode,
            rejectionReason,
            pdfAttachment,
          });
          console.log("✅ Rejection email sent to vendor");
        } catch (emailError: any) {
          console.error("⚠️  Failed to send rejection email:", emailError.message);
        }
      }

      let purchaseOrder = null;
      let invoice = null;

      // If accepted, create PO (default) or invoice (if explicitly requested)
      if (action === "ACCEPT") {
        if (!masterVendor) {
          throw new Error(
            "Vendor master record could not be resolved from vendorId or email; cannot create purchase order. Link the quotation to a vendor or fix the vendor email."
          );
        }
        const vendor = masterVendor;
        // Get currency by code
        const currency = await prisma.currency.findFirst({
          where: { code: quotation.currencyCode }
        });

        // Create Purchase Order (default behavior) — quotation line items, then email vendor
        if (createPO) {
          console.log("\n📦 Creating Purchase Order from accepted quotation...");

          let rfqRow: {
            requisitionId: string | null;
            deliveryAddress: string | null;
            expectedDeliveryDate: Date | null;
          } | null = null;

          if (quotation.procurementRfqId) {
            rfqRow = await prisma.procurementRfq.findUnique({
              where: { id: quotation.procurementRfqId },
              select: {
                requisitionId: true,
                deliveryAddress: true,
                expectedDeliveryDate: true,
              },
            });
          } else if (quotation.rfqNumber) {
            rfqRow = await prisma.procurementRfq.findUnique({
              where: { rfqNumber: quotation.rfqNumber },
              select: {
                requisitionId: true,
                deliveryAddress: true,
                expectedDeliveryDate: true,
              },
            });
          }

          const poItems = quotation.items.map((item) => ({
            itemName: item.itemName,
            description: item.description || undefined,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            unit: item.unit || undefined,
            specifications: item.specifications || undefined,
          }));

          const { ProcurementService } = await import("./ProcurementService");

          purchaseOrder = await ProcurementService.createPurchaseOrder({
            quotationId: quotation.id,
            requisitionId: quotation.requisitionId || rfqRow?.requisitionId || undefined,
            vendorId: vendor.id,
            currencyId: currency?.id,
            expectedDeliveryDate:
              rfqRow?.expectedDeliveryDate || quotation.validUntil || undefined,
            shippingAddress: rfqRow?.deliveryAddress || quotation.address || undefined,
            paymentTerms: quotation.paymentTerms || undefined,
            deliveryTerms: quotation.deliveryTerms || undefined,
            createdById: reviewedById,
            items: poItems,
          });

          try {
            await prisma.vendorQuotation.update({
              where: { id: quotationId },
              data: { purchaseOrder: { connect: { id: purchaseOrder.id } } },
            });
          } catch {
            // PO already linked via quotationId on purchase_orders
          }

          console.log(`✅ Purchase Order created: ${purchaseOrder.poNumber}`);

          // Record the award on the RFQ and close it. The RFQ stayed OPEN with no awarded
          // quotation, so vendors could keep quoting on a decided tender (PROC-FINDING-007);
          // quotation submit accepts only OPEN RFQs, so AWARDED also closes submissions.
          const awardedRfqId =
            quotation.procurementRfqId ||
            (quotation.rfqNumber
              ? (await prisma.procurementRfq.findUnique({ where: { rfqNumber: quotation.rfqNumber }, select: { id: true } }))?.id
              : null);
          if (awardedRfqId) {
            await prisma.procurementRfq.update({
              where: { id: awardedRfqId },
              data: { status: "AWARDED", awardedQuotationId: quotation.id, awardRationale: reviewNotes || null },
            });
            console.log(`   RFQ ${quotation.rfqNumber ?? awardedRfqId} marked AWARDED`);
          }
          console.log(`   PO ID: ${purchaseOrder.id}`);
          console.log(`   Lines: ${poItems.length} (from quotation)`);

          const { getP2pConfig } = await import("./p2p/P2pSettings");
          if ((await getP2pConfig()).poApprovalRequired) {
            // The award is decided; the order itself still needs its own approval before it reaches the supplier.
            console.log("   PO approval is required: the order is held as a draft until it is approved and sent.");
          } else {
          console.log("\n📧 Sending combined acceptance + PO email to vendor...");
          purchaseOrder = await ProcurementService.sendPurchaseOrder(purchaseOrder.id, reviewedById, {
            quotationAcceptContext: {
              quotationNumber: quotation.quotationNumber,
              quotationAmount: Number(updatedQuotation.totalAmount),
              currencyCode: quotation.currencyCode,
              reviewNotes,
              rfqNumber: quotation.rfqNumber || undefined,
            },
          });
          console.log(`   ✅ PO emailed to vendor (status: ${purchaseOrder.status})`);
          }
        } else if (action === "ACCEPT") {
          try {
            await EmailNotificationService.sendQuotationAcceptedEmail({
              vendorName: notifyVendorName,
              vendorEmail: notifyVendorEmail,
              quotationNumber: quotation.quotationNumber,
              quotationAmount: Number(updatedQuotation.totalAmount),
              currencyCode: quotation.currencyCode,
              rfqNumber: quotation.rfqNumber,
              reviewNotes,
            });
            console.log("✅ Acceptance email sent (no PO created)");
          } catch (emailError: any) {
            console.error("⚠️  Failed to send acceptance email:", emailError.message);
          }
        }

        // Create Invoice (optional - usually created after GRN)
        if (createInvoice) {
          console.log("\n💰 Creating invoice from quotation...");

          // Generate Purchase Invoice number (PI- prefix)
          const timestamp = Date.now();
          const random = Math.floor(Math.random() * 1000);
          const invoiceNumber = `PI-${timestamp}-${random}`;

          // Create Purchase Invoice
          invoice = await prisma.procurementInvoice.create({
            data: {
              invoiceNumber,
              vendorId: vendor.id,
              quotationId: quotation.id,
              purchaseOrderId: purchaseOrder?.id || undefined,
              currencyId: currency?.id,
              invoiceDate: new Date(),
              dueDate: quotation.validUntil,
              subtotal: quotation.subtotal,
              taxAmount: quotation.taxAmount,
              totalAmount: quotation.totalAmount,
              status: "DRAFT",
              createdById: reviewedById,
              items: {
                create: quotation.items.map(item => ({
                  itemName: item.itemName,
                  description: item.description,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  totalPrice: item.totalPrice,
                  unit: item.unit
                }))
              }
            },
            include: {
              items: true,
              vendor: true
            }
          });

          // Update quotation with invoice reference
          await prisma.vendorQuotation.update({
            where: { id: quotationId },
            data: { invoiceId: invoice.id }
          });

          console.log(`✅ Invoice created: ${invoice.invoiceNumber}`);
          console.log(`   Invoice ID: ${invoice.id}`);
          console.log(`   Status: ${invoice.status}`);
          console.log(`   Amount: $${Number(invoice.totalAmount).toFixed(2)}`);

          // Create audit log for invoice creation
          await AuditService.log({
            userId: reviewedById,
            action: "CREATE",
            entityType: "ProcurementInvoice",
            entityId: invoice.id,
            newValues: {
              invoiceNumber: invoice.invoiceNumber,
              source: "VendorQuotation",
              quotationId: quotation.id
            }
          });
        }
      }

      console.log("════════════════════════════════════════════════════════════════\n");

      return {
        quotation: updatedQuotation,
        purchaseOrder,
        invoice
      };
    } catch (error: any) {
      console.error("❌ Error reviewing quotation:", error);
      throw error;
    }
  }

  private static async rejectOtherQuotations(
    rfqNumber: string,
    acceptedQuotation: any,
    reviewedById: string
  ) {
    try {
      const remainingQuotations = await prisma.vendorQuotation.findMany({
        where: {
          rfqNumber,
          status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
          id: { not: acceptedQuotation.id }
        },
        include: { items: true },
      });

      if (remainingQuotations.length === 0) {
        return;
      }

      const { computeVendorQuotationRejectionFingerprint } = await import(
        "../utils/procurementEntityRejectionFingerprint"
      );

      const rejectionReason = `RFQ ${rfqNumber} — another vendor's quotation was accepted.`;

      for (const quote of remainingQuotations) {
        const rejectionFingerprint = computeVendorQuotationRejectionFingerprint(quote);
        const updated = await prisma.vendorQuotation.update({
          where: { id: quote.id },
          data: {
            status: "REJECTED",
            reviewedById,
            reviewedAt: new Date(),
            rejectionReason,
            rejectionContentFingerprint: rejectionFingerprint,
          },
          include: {
            items: true
          }
        });

        await AuditService.log({
          userId: reviewedById,
          action: "REJECT",
          entityType: "VendorQuotation",
          entityId: updated.id,
          newValues: {
            status: updated.status,
            rejectionReason
          }
        });

        const pdfAttachment = await buildVendorQuotationPdfAttachment(updated, "REJECTED").catch(() => undefined);

        let regVendor: { name: string; email: string; contactPerson: string | null } | null = null;
        try {
          regVendor = await VendorQuotationService.resolveVendorForQuotation(updated);
        } catch {
          regVendor = null;
        }
        const rejName = regVendor
          ? regVendor.contactPerson?.trim() || regVendor.name
          : updated.companyName || updated.vendorName;
        const rejEmail = regVendor?.email?.trim() || updated.vendorEmail;

        await EmailNotificationService.sendQuotationRejectedEmail({
          vendorName: rejName,
          vendorEmail: rejEmail,
          quotationNumber: updated.quotationNumber,
          quotationAmount: Number(updated.totalAmount),
          currencyCode: updated.currencyCode,
          rejectionReason,
          pdfAttachment,
        });
      }
    } catch (error: any) {
      console.error("⚠️  Failed to reject competing quotations:", error.message || error);
      // Continue even if auto rejection fails
    }
  }

  /**
   * Get quotations by RFQ number, plus the procurement RFQ header (so callers still see line items
   * from `itemsSnapshot` / PR when no vendor has submitted yet).
   */
  static async getQuotationsByRFQ(rfqNumber: string, actor?: any) {
    try {
      const rfq = await prisma.procurementRfq.findUnique({
        where: { rfqNumber },
        select: {
          id: true,
          rfqNumber: true,
          requisitionId: true,
          title: true,
          description: true,
          status: true,
          visibility: true,
          closingAt: true,
          expectedDeliveryDate: true,
          deliveryAddress: true,
          specialRequirements: true,
          itemsSnapshot: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const quotationsRaw = await prisma.vendorQuotation.findMany({
        where: { rfqNumber },
        include: {
          items: true,
          reviewedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
            },
          },
        },
        orderBy: { submittedAt: "desc" },
      });

      const fallbackRfqId = rfq?.id ?? null;
      const quotationsForRedaction = quotationsRaw.map((q: any) => ({
        ...q,
        procurementRfqId: q.procurementRfqId || fallbackRfqId,
      }));

      const { SourcingAccessService } = await import("./sourcing/SourcingAccessService");
      const { visible, sealed } = await SourcingAccessService.forStaff(quotationsForRedaction, actor);
      return { quotations: visible, sealedEvents: sealed, rfq };
    } catch (error: any) {
      console.error("Error fetching quotations by RFQ:", error);
      throw error;
    }
  }

  /**
   * Delete a quotation (only if not yet reviewed)
   */
  static async deleteQuotation(quotationId: string, deletedById: string) {
    try {
      const quotation = await prisma.vendorQuotation.findUnique({
        where: { id: quotationId }
      });

      if (!quotation) {
        throw new Error("Quotation not found");
      }

      // §15: what a supplier submitted is retained. A wrong or superseded submission is rejected or superseded, never removed.
      throw Object.assign(new Error("A submitted quotation is retained on record and cannot be deleted. Reject it with a reason instead."), { status: 409 });

      // Delete quotation (items will be cascade deleted)
      await prisma.vendorQuotation.delete({
        where: { id: quotationId }
      });

      // Create audit log
      await AuditService.log({
        userId: deletedById,
        action: "DELETE",
        entityType: "VendorQuotation",
        entityId: quotationId,
        oldValues: quotation
      });

      return { success: true };
    } catch (error: any) {
      console.error("Error deleting quotation:", error);
      throw error;
    }
  }
}






