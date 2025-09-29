// @ts-nocheck
import { PrismaClient, Decimal } from "@prisma/client";
import { dbConnection } from "../utils/database";
import JournalEntryService from "./JournalEntryService";
import AuditService from "./AuditService";

const prisma = dbConnection.getPrismaClient();

export interface CreatePurchaseRequisitionParams {
  title: string;
  description?: string;
  departmentId?: string;
  requestedById: string;
  priority?: string;
  justification?: string;
  currencyId?: string;
  items: {
    itemName: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    unit?: string;
    preferredVendorId?: string;
    specifications?: any;
  }[];
}

export interface CreatePurchaseOrderParams {
  requisitionId?: string;
  vendorId: string;
  priority?: string;
  currencyId?: string;
  expectedDeliveryDate?: Date;
  shippingAddress?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  createdById: string;
  items: {
    itemName: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    unit?: string;
    specifications?: any;
  }[];
}

export interface CreateProcurementInvoiceParams {
  purchaseOrderId?: string;
  vendorId: string;
  invoiceDate: Date;
  dueDate?: Date;
  currencyId?: string;
  documentPath?: string;
  documentType?: string;
  createdById: string;
  items: {
    itemName: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    unit?: string;
  }[];
}

export interface OCRProcessedData {
  invoiceNumber: string;
  invoiceDate: string;
  vendorName: string;
  vendorAddress?: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  items: {
    itemName: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    unit?: string;
  }[];
}

export interface AIMatchingResult {
  matched: boolean;
  matchScore: number;
  discrepancies: {
    type: string;
    description: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
  }[];
}

export class ProcurementService {
  /**
   * Generate unique requisition number
   */
  private static generateRequisitionNumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `REQ-${timestamp}-${random}`;
  }

  /**
   * Generate unique PO number
   */
  private static generatePONumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `PO-${timestamp}-${random}`;
  }

  /**
   * Generate unique GRN number
   */
  private static generateGRNNumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `GRN-${timestamp}-${random}`;
  }

  /**
   * Create a new purchase requisition
   */
  static async createPurchaseRequisition(params: CreatePurchaseRequisitionParams) {
    try {
      const {
        title,
        description,
        departmentId,
        requestedById,
        priority = "MEDIUM",
        justification,
        currencyId,
        items
      } = params;

      // Validate items
      if (!items || items.length === 0) {
        throw new Error("At least one item is required");
      }

      // Calculate total amount
      const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

      // Create requisition
      const requisition = await prisma.purchaseRequisition.create({
        data: {
          requisitionNumber: this.generateRequisitionNumber(),
          title,
          description,
          departmentId,
          requestedById,
          priority,
          justification,
          currencyId,
          totalAmount: new Decimal(totalAmount),
          status: "DRAFT",
          items: {
            create: items.map(item => ({
              itemName: item.itemName,
              description: item.description,
              quantity: new Decimal(item.quantity),
              unitPrice: new Decimal(item.unitPrice),
              totalPrice: new Decimal(item.quantity * item.unitPrice),
              unit: item.unit,
              preferredVendorId: item.preferredVendorId,
              specifications: item.specifications
            }))
          }
        },
        include: {
          requestedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          department: {
            select: {
              id: true,
              name: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true
            }
          },
          items: {
            include: {
              preferredVendor: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      // Audit log
      await AuditService.log({
        userId: requestedById,
        action: "CREATE",
        entityType: "PurchaseRequisition",
        entityId: requisition.id,
        newValues: requisition,
      });

      return requisition;
    } catch (error) {
      console.error("Error creating purchase requisition:", error);
      throw error;
    }
  }

  /**
   * Submit a purchase requisition for approval
   */
  static async submitPurchaseRequisition(requisitionId: string, submittedById: string) {
    try {
      const requisition = await prisma.purchaseRequisition.findUnique({
        where: { id: requisitionId }
      });

      if (!requisition) {
        throw new Error("Purchase requisition not found");
      }

      if (requisition.status !== "DRAFT") {
        throw new Error("Requisition is not in draft status");
      }

      const updatedRequisition = await prisma.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
          status: "PENDING_APPROVAL"
        },
        include: {
          requestedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          department: {
            select: {
              id: true,
              name: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true
            }
          },
          items: {
            include: {
              preferredVendor: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      // Audit log
      await AuditService.log({
        userId: submittedById,
        action: "SUBMIT",
        entityType: "PurchaseRequisition",
        entityId: requisitionId,
        newValues: updatedRequisition,
      });

      return updatedRequisition;
    } catch (error) {
      console.error("Error submitting purchase requisition:", error);
      throw error;
    }
  }

  /**
   * Approve a purchase requisition
   */
  static async approvePurchaseRequisition(requisitionId: string, approvedById: string) {
    try {
      const requisition = await prisma.purchaseRequisition.findUnique({
        where: { id: requisitionId },
        include: {
          items: true
        }
      });

      if (!requisition) {
        throw new Error("Purchase requisition not found");
      }

      if (requisition.status !== "PENDING_APPROVAL") {
        throw new Error("Requisition is not pending approval");
      }

      const updatedRequisition = await prisma.purchaseRequisition.update({
        where: { id: requisitionId },
        data: {
          status: "APPROVED",
          approvedById,
          approvedAt: new Date()
        },
        include: {
          requestedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          approvedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          department: {
            select: {
              id: true,
              name: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true
            }
          },
          items: {
            include: {
              preferredVendor: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      // Audit log
      await AuditService.log({
        userId: approvedById,
        action: "APPROVE",
        entityType: "PurchaseRequisition",
        entityId: requisitionId,
        newValues: updatedRequisition,
      });

      return updatedRequisition;
    } catch (error) {
      console.error("Error approving purchase requisition:", error);
      throw error;
    }
  }

  /**
   * Create a purchase order from an approved requisition
   */
  static async createPurchaseOrder(params: CreatePurchaseOrderParams) {
    try {
      const {
        requisitionId,
        vendorId,
        priority = "MEDIUM",
        currencyId,
        expectedDeliveryDate,
        shippingAddress,
        paymentTerms,
        deliveryTerms,
        createdById,
        items
      } = params;

      // Validate vendor exists
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId }
      });

      if (!vendor) {
        throw new Error("Vendor not found");
      }

      // Calculate totals
      const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      const taxAmount = subtotal * 0.15; // Assuming 15% tax rate
      const totalAmount = subtotal + taxAmount;

      // Create purchase order
      const purchaseOrder = await prisma.purchaseOrder.create({
        data: {
          poNumber: this.generatePONumber(),
          requisitionId,
          vendorId,
          priority,
          subtotal: new Decimal(subtotal),
          taxAmount: new Decimal(taxAmount),
          totalAmount: new Decimal(totalAmount),
          currencyId,
          expectedDeliveryDate,
          shippingAddress,
          paymentTerms,
          deliveryTerms,
          createdById,
          status: "DRAFT",
          items: {
            create: items.map(item => ({
              itemName: item.itemName,
              description: item.description,
              quantity: new Decimal(item.quantity),
              unitPrice: new Decimal(item.unitPrice),
              totalPrice: new Decimal(item.quantity * item.unitPrice),
              unit: item.unit,
              quantityReceived: new Decimal(0),
              quantityPending: new Decimal(item.quantity),
              specifications: item.specifications
            }))
          }
        },
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true
            }
          },
          requisition: {
            select: {
              id: true,
              requisitionNumber: true,
              title: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          items: true
        }
      });

      // Update requisition status if it exists
      if (requisitionId) {
        await prisma.purchaseRequisition.update({
          where: { id: requisitionId },
          data: { status: "CONVERTED_TO_PO" }
        });
      }

      // Audit log
      await AuditService.log({
        userId: createdById,
        action: "CREATE",
        entityType: "PurchaseOrder",
        entityId: purchaseOrder.id,
        newValues: purchaseOrder,
      });

      return purchaseOrder;
    } catch (error) {
      console.error("Error creating purchase order:", error);
      throw error;
    }
  }

  /**
   * Process OCR data for invoice
   */
  static async processOCRData(invoiceId: string, ocrData: OCRProcessedData) {
    try {
      const invoice = await prisma.procurementInvoice.findUnique({
        where: { id: invoiceId }
      });

      if (!invoice) {
        throw new Error("Invoice not found");
      }

      // Update invoice with OCR data
      const updatedInvoice = await prisma.procurementInvoice.update({
        where: { id: invoiceId },
        data: {
          ocrProcessed: true,
          ocrData: ocrData,
          invoiceNumber: ocrData.invoiceNumber,
          invoiceDate: new Date(ocrData.invoiceDate),
          subtotal: new Decimal(ocrData.subtotal),
          taxAmount: new Decimal(ocrData.taxAmount),
          totalAmount: new Decimal(ocrData.totalAmount),
          status: "PROCESSING",
          items: {
            deleteMany: {}, // Remove existing items
            create: ocrData.items.map(item => ({
              itemName: item.itemName,
              description: item.description,
              quantity: new Decimal(item.quantity),
              unitPrice: new Decimal(item.unitPrice),
              totalPrice: new Decimal(item.totalPrice),
              unit: item.unit
            }))
          }
        },
        include: {
          vendor: true,
          purchaseOrder: {
            include: {
              items: true
            }
          },
          items: true
        }
      });

      // Audit log
      await AuditService.log({
        userId: invoice.createdById,
        action: "OCR_PROCESS",
        entityType: "ProcurementInvoice",
        entityId: invoiceId,
        newValues: { ocrData },
      });

      return updatedInvoice;
    } catch (error) {
      console.error("Error processing OCR data:", error);
      throw error;
    }
  }

  /**
   * Perform AI matching between invoice and purchase order
   */
  static async performAIMatching(invoiceId: string, aiResult: AIMatchingResult) {
    try {
      const invoice = await prisma.procurementInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          purchaseOrder: {
            include: {
              items: true
            }
          },
          items: true
        }
      });

      if (!invoice) {
        throw new Error("Invoice not found");
      }

      if (!invoice.purchaseOrder) {
        throw new Error("No purchase order found for matching");
      }

      // Update invoice with AI matching results
      const updatedInvoice = await prisma.procurementInvoice.update({
        where: { id: invoiceId },
        data: {
          aiMatched: aiResult.matched,
          aiMatchScore: new Decimal(aiResult.matchScore),
          aiDiscrepancies: aiResult.discrepancies,
          matchingStatus: aiResult.matched ? "MATCHED" : "DISCREPANCY",
          status: aiResult.matched ? "MATCHED" : "DISCREPANCY"
        },
        include: {
          vendor: true,
          purchaseOrder: {
            include: {
              items: true
            }
          },
          items: true
        }
      });

      // Audit log
      await AuditService.log({
        userId: invoice.createdById,
        action: "AI_MATCH",
        entityType: "ProcurementInvoice",
        entityId: invoiceId,
        newValues: { aiResult },
      });

      return updatedInvoice;
    } catch (error) {
      console.error("Error performing AI matching:", error);
      throw error;
    }
  }

  /**
   * Approve a procurement invoice and create journal entry
   */
  static async approveProcurementInvoice(invoiceId: string, approvedById: string) {
    try {
      const invoice = await prisma.procurementInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          vendor: true,
          currency: true,
          items: true
        }
      });

      if (!invoice) {
        throw new Error("Invoice not found");
      }

      if (invoice.status !== "MATCHED" && invoice.status !== "DISCREPANCY") {
        throw new Error("Invoice is not ready for approval");
      }

      // Create journal entry for the invoice
      const journalEntryParams = {
        vendorId: invoice.vendorId,
        categoryId: "PROCUREMENT", // You might want to create a specific category
        amount: Number(invoice.subtotal),
        vatAmount: Number(invoice.taxAmount),
        totalAmount: Number(invoice.totalAmount),
        currencyId: invoice.currencyId || "default-currency",
        transactionDate: invoice.invoiceDate,
        description: `Procurement Invoice: ${invoice.invoiceNumber}`,
        receiptNumber: invoice.invoiceNumber,
        isTaxable: Number(invoice.taxAmount) > 0,
        paymentMethod: "BANK" as const,
        createdById: approvedById
      };

      const journalEntryResult = await JournalEntryService.createExpenseJournalEntry(journalEntryParams);

      // Update invoice with approval and journal entry
      const updatedInvoice = await prisma.procurementInvoice.update({
        where: { id: invoiceId },
        data: {
          status: "APPROVED",
          approvedById,
          approvedAt: new Date(),
          journalEntryId: journalEntryResult.journalEntry.id,
          paymentStatus: "PENDING"
        },
        include: {
          vendor: true,
          currency: true,
          items: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          }
        }
      });

      // Audit log
      await AuditService.log({
        userId: approvedById,
        action: "APPROVE",
        entityType: "ProcurementInvoice",
        entityId: invoiceId,
        newValues: updatedInvoice,
      });

      return updatedInvoice;
    } catch (error) {
      console.error("Error approving procurement invoice:", error);
      throw error;
    }
  }

  /**
   * Generate unique invoice number
   */
  private static generateInvoiceNumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `INV-${timestamp}-${random}`;
  }

  /**
   * Create a procurement invoice
   */
  static async createProcurementInvoice(params: CreateProcurementInvoiceParams) {
    try {
      const {
        purchaseOrderId,
        vendorId,
        invoiceDate,
        dueDate,
        currencyId,
        documentPath,
        documentType,
        createdById,
        items
      } = params;

      // Validate vendor exists
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId }
      });

      if (!vendor) {
        throw new Error("Vendor not found");
      }

      // Calculate totals
      const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      const taxAmount = subtotal * 0.15; // Assuming 15% tax rate
      const totalAmount = subtotal + taxAmount;

      // Create procurement invoice
      const invoice = await prisma.procurementInvoice.create({
        data: {
          invoiceNumber: this.generateInvoiceNumber(),
          purchaseOrderId,
          vendorId,
          invoiceDate,
          dueDate,
          subtotal: new Decimal(subtotal),
          taxAmount: new Decimal(taxAmount),
          totalAmount: new Decimal(totalAmount),
          currencyId,
          documentPath,
          documentType,
          createdById,
          status: "RECEIVED",
          items: {
            create: items.map(item => ({
              itemName: item.itemName,
              description: item.description,
              quantity: new Decimal(item.quantity),
              unitPrice: new Decimal(item.unitPrice),
              totalPrice: new Decimal(item.quantity * item.unitPrice),
              unit: item.unit
            }))
          }
        },
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true
            }
          },
          purchaseOrder: {
            select: {
              id: true,
              poNumber: true,
              status: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          items: true
        }
      });

      // Audit log
      await AuditService.log({
        userId: createdById,
        action: "CREATE",
        entityType: "ProcurementInvoice",
        entityId: invoice.id,
        newValues: invoice,
      });

      return invoice;
    } catch (error) {
      console.error("Error creating procurement invoice:", error);
      throw error;
    }
  }

  /**
   * Create a goods received note
   */
  static async createGoodsReceivedNote(purchaseOrderId: string, receivedById: string, items: {
    purchaseOrderItemId: string;
    quantityReceived: number;
    quantityAccepted: number;
    quantityRejected: number;
    qualityStatus: string;
    qualityNotes?: string;
  }[]) {
    try {
      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: {
          items: true
        }
      });

      if (!purchaseOrder) {
        throw new Error("Purchase order not found");
      }

      // Create GRN
      const grn = await prisma.goodsReceivedNote.create({
        data: {
          grnNumber: this.generateGRNNumber(),
          purchaseOrderId,
          receivedById,
          status: "RECEIVED",
          qualityStatus: "PENDING",
          items: {
            create: items.map(item => ({
              purchaseOrderItemId: item.purchaseOrderItemId,
              quantityOrdered: new Decimal(0), // Will be populated from PO item
              quantityReceived: new Decimal(item.quantityReceived),
              quantityAccepted: new Decimal(item.quantityAccepted),
              quantityRejected: new Decimal(item.quantityRejected),
              qualityStatus: item.qualityStatus,
              qualityNotes: item.qualityNotes
            }))
          }
        },
        include: {
          purchaseOrder: {
            include: {
              vendor: true,
              items: true
            }
          },
          receivedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          items: {
            include: {
              purchaseOrderItem: true
            }
          }
        }
      });

      // Update purchase order items with received quantities
      for (const item of items) {
        await prisma.purchaseOrderItem.update({
          where: { id: item.purchaseOrderItemId },
          data: {
            quantityReceived: {
              increment: item.quantityReceived
            },
            quantityPending: {
              decrement: item.quantityReceived
            }
          }
        });
      }

      // Check if all items are received
      const allItemsReceived = await prisma.purchaseOrderItem.findMany({
        where: {
          purchaseOrderId,
          quantityPending: { gt: 0 }
        }
      });

      if (allItemsReceived.length === 0) {
        await prisma.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: {
            status: "RECEIVED",
            actualDeliveryDate: new Date()
          }
        });
      }

      // Audit log
      await AuditService.log({
        userId: receivedById,
        action: "CREATE",
        entityType: "GoodsReceivedNote",
        entityId: grn.id,
        newValues: grn,
      });

      return grn;
    } catch (error) {
      console.error("Error creating goods received note:", error);
      throw error;
    }
  }

  /**
   * Get procurement dashboard data
   */
  static async getProcurementDashboard() {
    try {
      const [
        totalRequisitions,
        pendingRequisitions,
        approvedRequisitions,
        totalPurchaseOrders,
        pendingPOs,
        receivedPOs,
        totalInvoices,
        pendingInvoices,
        approvedInvoices,
        totalGRNs,
        pendingGRNs
      ] = await Promise.all([
        prisma.purchaseRequisition.count(),
        prisma.purchaseRequisition.count({ where: { status: "PENDING_APPROVAL" } }),
        prisma.purchaseRequisition.count({ where: { status: "APPROVED" } }),
        prisma.purchaseOrder.count(),
        prisma.purchaseOrder.count({ where: { status: "SENT" } }),
        prisma.purchaseOrder.count({ where: { status: "RECEIVED" } }),
        prisma.procurementInvoice.count(),
        prisma.procurementInvoice.count({ where: { status: "PROCESSING" } }),
        prisma.procurementInvoice.count({ where: { status: "APPROVED" } }),
        prisma.goodsReceivedNote.count(),
        prisma.goodsReceivedNote.count({ where: { status: "RECEIVED" } })
      ]);

      return {
        requisitions: {
          total: totalRequisitions,
          pending: pendingRequisitions,
          approved: approvedRequisitions
        },
        purchaseOrders: {
          total: totalPurchaseOrders,
          pending: pendingPOs,
          received: receivedPOs
        },
        invoices: {
          total: totalInvoices,
          pending: pendingInvoices,
          approved: approvedInvoices
        },
        grns: {
          total: totalGRNs,
          pending: pendingGRNs
        }
      };
    } catch (error) {
      console.error("Error getting procurement dashboard:", error);
      throw error;
    }
  }
}
