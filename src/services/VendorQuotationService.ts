// @ts-nocheck
import { PrismaClient, Prisma, Decimal } from "@prisma/client";
import AuditService from "./AuditService";
import { EmailNotificationService } from "./EmailNotificationService";
import VATService from "./VATService";

import { prisma } from '../utils/database';
import { nextQuotationNumber } from "../utils/accountingDocumentNumbers";
import {
  verifyVendorPortalToken,
  VENDOR_PORTAL_KIND_RFQ_SUBMIT,
} from "../utils/vendorPortalToken";

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
        currencyCode = "USD",
        paymentTerms,
        deliveryTerms,
        deliveryTime,
        notes,
        attachments,
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
        },
      });
      if (!vendorRow) {
        throw new Error("Vendor not found");
      }
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
      const resolvedPaymentTerms =
        vendorRow.paymentTerms?.trim() || trimIn(paymentTerms) || undefined;

      if (rfqNumber && rfqRow.rfqNumber !== rfqNumber) {
        throw new Error("rfqNumber does not match this invitation token");
      }

      const effectiveRfqNumber = rfqRow.rfqNumber;
      const effectiveProcurementRfqId = rfqRow.id;
      const effectiveRequisitionId = requisitionId ?? rfqRow.requisitionId ?? undefined;

      let procurementRfqId: string | null = effectiveProcurementRfqId;

      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("📝 CREATING VENDOR QUOTATION");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📧 Vendor Email: ${resolvedVendorEmail}`);
      console.log(`🏢 Company: ${resolvedCompanyName}`);
      console.log(`📋 RFQ Number: ${effectiveRfqNumber}`);
      console.log(`📦 Items: ${items.length}`);
      console.log("");

      // Calculate totals
      let subtotal = 0;
      const processedItems = items.map(item => {
        const totalPrice = Number(item.quantity) * Number(item.unitPrice);
        subtotal += totalPrice;
        return {
          ...item,
          totalPrice
        };
      });

      // Same VAT logic as Purchase Order creation so quotation subtotal/tax/total match the PO totals.
      await VATService.refreshActiveVatRate(false).catch(() => undefined);
      const taxAmount = VATService.calculateVAT(subtotal);
      const totalAmount = subtotal + taxAmount;

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
        validUntil,
        currencyCode,
        paymentTerms: resolvedPaymentTerms,
        deliveryTerms,
        deliveryTime,
        notes,
        attachments,
        procurementRfqId,
        technicalScoreJson: technicalScoreJson ?? undefined,
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

      if (effectiveRequisitionId) {
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
        console.error("⚠️  Desk notification for new quotation failed:", (deskErr as Error)?.message || deskErr);
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
  }) {
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

      const { maybeRedactQuotationsListForStaff } = await import("../utils/quotationRedaction");
      const redacted = await maybeRedactQuotationsListForStaff(quotations);

      return {
        quotations: redacted,
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
  static async getQuotationById(quotationId: string) {
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

      const { maybeRedactQuotationForStaff } = await import("../utils/quotationRedaction");
      return maybeRedactQuotationForStaff(quotation);
    } catch (error: any) {
      console.error("Error fetching quotation:", error);
      throw error;
    }
  }

  /**
   * Accept or reject a vendor quotation
   */
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

      console.log(`   Quotation: ${quotation.quotationNumber}`);
      console.log(`   Vendor: ${quotation.companyName || quotation.vendorName}`);
      console.log(`   Amount (stored): $${Number(quotation.totalAmount).toFixed(2)}`);
      console.log(`   Action: ${action}`);
      console.log("");

      const newStatus = action === "ACCEPT" ? "ACCEPTED" : "REJECTED";

      // Reconcile subtotal/VAT/total with the same rules as `ProcurementService.createPurchaseOrder`,
      // so legacy quotations (stored with taxAmount=0) and new PO-from-quotation flows show equal figures.
      await VATService.refreshActiveVatRate(false).catch(() => undefined);
      const alignedSubtotal = quotation.items.reduce(
        (sum, item: { quantity: any; unitPrice: any }) =>
          sum + Number(item.quantity) * Number(item.unitPrice),
        0
      );
      const alignedTax = VATService.calculateVAT(alignedSubtotal);
      const alignedTotal = alignedSubtotal + alignedTax;

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

      // Send email notification to vendor (best-effort: failures here must not roll back the review)
      try {
        const pdfAttachment = await buildVendorQuotationPdfAttachment(updatedQuotation, action === "ACCEPT" ? "ACCEPTED" : "REJECTED").catch((e: any) => {
          console.warn("⚠️  Failed to render quotation PDF (continuing without attachment):", e?.message || e);
          return undefined;
        });

        if (action === "ACCEPT") {
          await EmailNotificationService.sendQuotationAcceptedEmail({
            vendorName: notifyVendorName,
            vendorEmail: notifyVendorEmail,
            quotationNumber: quotation.quotationNumber,
            quotationAmount: Number(updatedQuotation.totalAmount),
            currencyCode: quotation.currencyCode,
            rfqNumber: quotation.rfqNumber,
            reviewNotes,
            pdfAttachment,
          });
          console.log("✅ Acceptance email sent to vendor");

          if (quotation.rfqNumber) {
            await this.rejectOtherQuotations(quotation.rfqNumber, quotation, reviewedById);
          }
        } else {
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
        }
      } catch (emailError: any) {
        console.error("⚠️  Failed to send email notification:", emailError.message);
        // Don't fail the entire operation if email fails
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
          console.log(`   PO ID: ${purchaseOrder.id}`);
          console.log(`   Lines: ${poItems.length} (from quotation)`);

          console.log("\n📧 Sending Purchase Order to vendor...");
          purchaseOrder = await ProcurementService.sendPurchaseOrder(
            purchaseOrder.id,
            reviewedById
          );
          console.log(`   ✅ PO emailed to vendor (status: ${purchaseOrder.status})`);
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
  static async getQuotationsByRFQ(rfqNumber: string) {
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

      const { maybeRedactQuotationsListForStaff } = await import("../utils/quotationRedaction");
      const quotations = await maybeRedactQuotationsListForStaff(quotationsForRedaction);
      return { quotations, rfq };
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

      if (quotation.status !== "SUBMITTED") {
        throw new Error("Cannot delete a quotation that has been reviewed");
      }

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






