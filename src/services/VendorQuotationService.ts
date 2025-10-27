// @ts-nocheck
import { PrismaClient, Prisma, Decimal } from "@prisma/client";
import { AuditService } from "./AuditService";
import { EmailNotificationService } from "./EmailNotificationService";

import { dbConnection } from '../utils/database';
const prisma = dbConnection.getPrismaClient();

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
}

export interface ReviewQuotationParams {
  quotationId: string;
  action: "ACCEPT" | "REJECT";
  reviewedById: string;
  reviewNotes?: string;
  rejectionReason?: string;
  createInvoice?: boolean; // Whether to automatically create invoice on acceptance
}

export class VendorQuotationService {
  /**
   * Generate unique quotation number
   */
  private static generateQuotationNumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `QUOTE-${timestamp}-${random}`;
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
        items
      } = params;

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

      // Generate quotation number
      const quotationNumber = this.generateQuotationNumber();

      // Create quotation
      const quotation = await prisma.vendorQuotation.create({
        data: {
          quotationNumber,
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
          subtotal: new Decimal(subtotal),
          taxAmount: new Decimal(taxAmount),
          totalAmount: new Decimal(totalAmount),
          status: "SUBMITTED",
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
        },
        include: {
          items: true
        }
      });

      console.log("✅ Quotation Created Successfully!");
      console.log(`   Quotation Number: ${quotation.quotationNumber}`);
      console.log(`   Status: ${quotation.status}`);
      console.log("════════════════════════════════════════════════════════════════\n");

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

      return {
        quotations,
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

      return quotation;
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
        createInvoice = true // Default to true - auto-create invoice on acceptance
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
            reviewNotes
          });
          console.log("✅ Acceptance email sent to vendor");
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

      let invoice = null;

      // If accepted and createInvoice is true, automatically create an invoice
      if (action === "ACCEPT" && createInvoice) {
        console.log("\n💰 Creating invoice from quotation...");
        
        // We need to find or create a vendor in the system
        // For now, we'll look up by email, or you might want to create a new vendor
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

        // Generate invoice number
        const invoiceNumber = `INV-${quotation.quotationNumber}`;

        // Create invoice
        invoice = await prisma.procurementInvoice.create({
          data: {
            invoiceNumber,
            vendorId: vendor.id,
            quotationId: quotation.id,
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

      console.log("════════════════════════════════════════════════════════════════\n");

      return {
        quotation: updatedQuotation,
        invoice
      };
    } catch (error: any) {
      console.error("❌ Error reviewing quotation:", error);
      throw error;
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

      return quotations;
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






