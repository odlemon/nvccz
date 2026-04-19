// @ts-nocheck
import { PrismaClient, Prisma, Decimal } from "@prisma/client";
import AuditService from "./AuditService";
import { EmailNotificationService } from "./EmailNotificationService";

import { prisma } from '../utils/database';
import { nextQuotationNumber } from "../utils/accountingDocumentNumbers";

export interface CreateVendorQuotationParams {
  rfqNumber?: string;
  requisitionId?: string;
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
   * Create a vendor quotation (no authentication required)
   * This is called when a vendor submits their quote through the public form
   */
  static async createVendorQuotation(params: CreateVendorQuotationParams) {
    try {
      const {
        rfqNumber,
        requisitionId,
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

      let procurementRfqId: string | null = null;
      if (rfqNumber) {
        const rfqRow = await prisma.procurementRfq.findUnique({
          where: { rfqNumber },
          select: { id: true },
        });
        procurementRfqId = rfqRow?.id ?? null;
      }

      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("📝 CREATING VENDOR QUOTATION");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📧 Vendor Email: ${vendorEmail}`);
      console.log(`🏢 Company: ${companyName || vendorName}`);
      console.log(`📋 RFQ Number: ${rfqNumber || 'N/A'}`);
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

      // For now, we'll assume a default tax rate of 0
      // Vendors can specify tax in their notes or we can calculate later
      const taxAmount = 0;
      const totalAmount = subtotal + taxAmount;

      console.log("💰 Financial Summary:");
      console.log(`   Subtotal: $${subtotal.toFixed(2)}`);
      console.log(`   Tax: $${taxAmount.toFixed(2)}`);
      console.log(`   Total: $${totalAmount.toFixed(2)}`);
      console.log("");

      const quotationDataBase = {
        rfqNumber,
        requisitionId,
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
      if (requisitionId) {
        const requisition = await prisma.purchaseRequisition.findUnique({
          where: { id: requisitionId },
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

        if (requisition && requisition.requestedBy?.email) {
          const requesterName = `${requisition.requestedBy.firstName} ${requisition.requestedBy.lastName}`;
          await EmailNotificationService.sendQuotationSubmittedNotification({
            requesterName,
            requesterEmail: requisition.requestedBy.email,
            vendorName: companyName || vendorName,
            vendorEmail,
            rfqNumber,
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
            requisitionNumber: requisition.requisitionNumber,
            requisitionTitle: requisition.title,
            notes
          });
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
        createPO = true, // Default to true - auto-create PO on acceptance
        createInvoice = false // Default to false - invoice created after GRN
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
      console.log(`   Amount: $${Number(quotation.totalAmount).toFixed(2)}`);
      console.log(`   Action: ${action}`);
      console.log("");

      const newStatus = action === "ACCEPT" ? "ACCEPTED" : "REJECTED";

      // Update quotation status
      const updatedQuotation = await prisma.vendorQuotation.update({
        where: { id: quotationId },
        data: {
          status: newStatus,
          reviewedById,
          reviewedAt: new Date(),
          reviewNotes,
          rejectionReason: action === "REJECT" ? rejectionReason : null
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

      // Send email notification to vendor
      try {
        if (action === "ACCEPT") {
          await EmailNotificationService.sendQuotationAcceptedEmail({
            vendorName: quotation.companyName || quotation.vendorName,
            vendorEmail: quotation.vendorEmail,
            quotationNumber: quotation.quotationNumber,
            quotationAmount: Number(quotation.totalAmount),
            currencyCode: quotation.currencyCode,
          rfqNumber: quotation.rfqNumber,
            reviewNotes
          });
          console.log("✅ Acceptance email sent to vendor");

          if (quotation.rfqNumber) {
            await this.rejectOtherQuotations(quotation.rfqNumber, quotation, reviewedById);
          }
        } else {
          await EmailNotificationService.sendQuotationRejectedEmail({
            vendorName: quotation.companyName || quotation.vendorName,
            vendorEmail: quotation.vendorEmail,
            quotationNumber: quotation.quotationNumber,
            quotationAmount: Number(quotation.totalAmount),
            currencyCode: quotation.currencyCode,
            rejectionReason
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
        // Find vendor in the system
        const vendor = await prisma.vendor.findFirst({
          where: { email: quotation.vendorEmail }
        });

        if (!vendor) {
          throw new Error(
            `Vendor with email ${quotation.vendorEmail} not found in system. ` +
            `Please add this vendor before accepting the quotation, or the system admin should create the vendor account.`
          );
        }

        // Get currency by code
        const currency = await prisma.currency.findFirst({
          where: { code: quotation.currencyCode }
        });

        // Create Purchase Order (default behavior)
        if (createPO) {
          console.log("\n📦 Creating Purchase Order from quotation...");
          
          const { ProcurementService } = await import('./ProcurementService');
          
          purchaseOrder = await ProcurementService.createPurchaseOrder({
            quotationId: quotation.id,
            requisitionId: quotation.requisitionId || undefined,
            vendorId: vendor.id,
            currencyId: currency?.id,
            expectedDeliveryDate: quotation.validUntil || undefined,
            paymentTerms: quotation.paymentTerms || undefined,
            deliveryTerms: quotation.deliveryTerms || undefined,
            createdById: reviewedById,
            items: quotation.items.map(item => ({
              itemName: item.itemName,
              description: item.description || undefined,
              quantity: Number(item.quantity),
              unitPrice: Number(item.unitPrice),
              unit: item.unit || undefined,
              specifications: item.specifications || undefined
            }))
          });

          // Update quotation with PO reference (optional - PO already has quotationId)
          // This updates the reverse relation if Prisma client supports it
          try {
            await prisma.vendorQuotation.update({
              where: { id: quotationId },
              data: { purchaseOrder: { connect: { id: purchaseOrder.id } } }
            });
          } catch (error: any) {
            // If Prisma client hasn't been regenerated yet, this will fail silently
            // The PO already has quotationId, so the link is established
            console.log('   ⚠️  Could not update quotation reverse relation (Prisma client may need regeneration)');
            console.log('   ✅ PO-quotation link already established via quotationId field');
          }

          console.log(`✅ Purchase Order created: ${purchaseOrder.poNumber}`);
          console.log(`   PO ID: ${purchaseOrder.id}`);
          console.log(`   Status: ${purchaseOrder.status}`);
          console.log(`   Amount: $${Number(purchaseOrder.totalAmount).toFixed(2)}`);
          console.log(`   📌 Next step: Send PO to vendor using POST /api/procurement/purchase-orders/${purchaseOrder.id}/send`);
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
        }
      });

      if (remainingQuotations.length === 0) {
        return;
      }

      const rejectionReason = `RFQ ${rfqNumber} was awarded to ${acceptedQuotation.companyName || acceptedQuotation.vendorName}.`;

      for (const quote of remainingQuotations) {
        const updated = await prisma.vendorQuotation.update({
          where: { id: quote.id },
          data: {
            status: "REJECTED",
            reviewedById,
            reviewedAt: new Date(),
            rejectionReason
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

        await EmailNotificationService.sendQuotationRejectedEmail({
          vendorName: updated.companyName || updated.vendorName,
          vendorEmail: updated.vendorEmail,
          quotationNumber: updated.quotationNumber,
          quotationAmount: Number(updated.totalAmount),
          currencyCode: updated.currencyCode,
          rejectionReason
        });
      }
    } catch (error: any) {
      console.error("⚠️  Failed to reject competing quotations:", error.message || error);
      // Continue even if auto rejection fails
    }
  }

  /**
   * Get quotations by RFQ number
   */
  static async getQuotationsByRFQ(rfqNumber: string) {
    try {
      const quotations = await prisma.vendorQuotation.findMany({
        where: { rfqNumber },
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
              status: true
            }
          }
        },
        orderBy: { submittedAt: 'desc' }
      });

      const { maybeRedactQuotationsListForStaff } = await import("../utils/quotationRedaction");
      return maybeRedactQuotationsListForStaff(quotations);
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






