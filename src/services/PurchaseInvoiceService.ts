// @ts-nocheck
import { PrismaClient, PurchaseInvoice, Vendor, Currency } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { prismaJournalEntryRateSelect } from "../config/accountingSnapshotResponseSelect";
import VATService from "./VATService";
import JournalEntryService from "./JournalEntryService";
import { CashbookService } from "./CashbookService";
import AuditService from "./AuditService";
import { assignNextAuditIdAndCreateJournal, createJournalEntryWithAuditSequence } from "./AuditTrailSequenceService";
import { parseDate } from "../utils/dateHelper";
import { assertPurchaseInvoicePaymentAllowedForSuite06 } from "../utils/suite06PaymentGuard";
import PeriodLockService from "./PeriodLockService";
import {
  isUnifiedInvoiceNumberInUse,
  nextUnifiedInvoiceNumber,
} from "../utils/accountingDocumentNumbers";
import { userHasEffectivePermission } from "../config/cfoModulePermissions";

/** User-facing duplicate vendor bill reference (vendor invoice number) message. */
export const DUPLICATE_VENDOR_BILL_REFERENCE_MESSAGE =
  "A bill with this reference already exists for this vendor";

/** Three-way match: bill must not exceed linked PO total by more than this ratio without override. */
export const PO_VARIANCE_MAX_RATIO = 1.2;

export const PO_VARIANCE_WARNING_MESSAGE =
  "Variance Warning: vendor bill exceeds the linked purchase order by more than 20%. Manager override is required to post.";

export type POVarianceWarningDetails = {
  poNumber: string;
  purchaseOrderId: string;
  poTotal: number;
  billTotal: number;
  maxAllowedWithoutOverride: number;
  overPoPercent: number;
};

export class POVarianceWarningError extends Error {
  readonly code = "PO_VARIANCE_WARNING" as const;
  readonly details: POVarianceWarningDetails;
  constructor(details: POVarianceWarningDetails) {
    super(PO_VARIANCE_WARNING_MESSAGE);
    this.name = "POVarianceWarningError";
    this.details = details;
  }
}

export class POVarianceOverrideForbiddenError extends Error {
  readonly code = "PO_VARIANCE_OVERRIDE_FORBIDDEN" as const;
  constructor() {
    super(
      "Manager override denied: your role cannot post a vendor bill more than 20% above the linked PO (requires admin or manage_accounting / manage_ledger)."
    );
    this.name = "POVarianceOverrideForbiddenError";
  }
}

export interface CreatePurchaseInvoiceParams {
  vendorId: string;
  invoiceDate: Date;
  dueDate?: Date;
  currencyId: string;
  description?: string;
  items: {
    itemName: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    unit?: string;
    vatRate?: number;
  }[];
  isTaxable?: boolean;
  /** Supplier / vendor invoice number; must be unique per vendor when provided. */
  vendorInvoiceReference?: string | null;
  notes?: string;
  createdById: string;
  /** Links AP vendor bill to PO for variance check on submit (three-way match). */
  sourcePurchaseOrderId?: string | null;
  /** Suite 06: GRN for PO vs GRN vs bill line match. */
  sourceGoodsReceivedNoteId?: string | null;
  /** Phase 2 — attachment ids to link after bill create */
  attachmentIds?: string[];
}

export interface PurchaseInvoiceWithRelations extends PurchaseInvoice {
  vendor: Vendor;
  currency: Currency;
  journalEntry?: {
    id: string;
    referenceNumber: string;
    status: string;
  } | null;
  paymentJournalEntry?: {
    id: string;
    referenceNumber: string;
    status: string;
  } | null;
  items: any[];
}

export class PurchaseInvoiceService {
  /**
   * Internal vendor bill number: unified `INV_YYYYMMDD_NNNN` (same sequence as AR and procurement invoices).
   */
  private static async generateInvoiceNumber(invoiceDate: Date): Promise<string> {
    return nextUnifiedInvoiceNumber(prisma, invoiceDate);
  }

  /**
   * Validate vendor and currency exist
   */
  private static async validateInvoiceData(vendorId: string, currencyId: string): Promise<void> {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId }
    });
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    const currency = await prisma.currency.findUnique({
      where: { id: currencyId }
    });
    if (!currency) {
      throw new Error("Currency not found");
    }
  }

  private static normalizeVendorInvoiceReference(
    ref: string | null | undefined
  ): string | null {
    if (ref == null) return null;
    const t = String(ref).trim();
    return t.length ? t : null;
  }

  /**
   * Blocks save when the same vendor already has a bill with this reference (new column or legacy
   * rows that stored the supplier number in `invoiceNumber`).
   */
  private static async assertUniqueVendorBillReference(
    vendorId: string,
    reference: string | null,
    excludeInvoiceId?: string
  ): Promise<void> {
    if (!reference) return;
    const existing = await prisma.purchaseInvoice.findFirst({
      where: {
        vendorId,
        id: excludeInvoiceId ? { not: excludeInvoiceId } : undefined,
        OR: [
          { vendorInvoiceReference: reference },
          { invoiceNumber: reference }
        ]
      }
    });
    if (existing) {
      throw new Error(DUPLICATE_VENDOR_BILL_REFERENCE_MESSAGE);
    }
  }

  private static isVendorRefUniqueConstraintError(error: any): boolean {
    if (error?.code !== "P2002") return false;
    const t = error.meta?.target;
    const fields = Array.isArray(t) ? t : t != null ? [t] : [];
    return fields.some(
      (x: string) =>
        x === "vendor_invoice_reference" || x === "vendorInvoiceReference"
    );
  }

  private static isInvoiceNumberUniqueConstraintError(error: any): boolean {
    if (error?.code !== "P2002") return false;
    const t = error.meta?.target;
    const fields = Array.isArray(t) ? t : t != null ? [t] : [];
    return fields.some(
      (x: string) =>
        x === "invoice_number" || x === "invoiceNumber" || String(x).includes("invoice_number")
    );
  }

  /**
   * Create a new purchase invoice
   */
  static async createPurchaseInvoice(params: CreatePurchaseInvoiceParams): Promise<PurchaseInvoiceWithRelations> {
    try {
      await VATService.refreshActiveVatRate().catch(() => undefined);
      const {
        vendorId,
        invoiceDate,
        dueDate,
        currencyId,
        description,
        items,
        isTaxable = false,
        vendorInvoiceReference,
        notes,
        createdById,
        sourcePurchaseOrderId,
        sourceGoodsReceivedNoteId,
        attachmentIds,
      } = params;

      // Validate input
      if (!items || items.length === 0) {
        throw new Error("At least one item is required");
      }

      // Validate vendor and currency
      await this.validateInvoiceData(vendorId, currencyId);

      if (sourcePurchaseOrderId) {
        const srcPo = await prisma.purchaseOrder.findUnique({
          where: { id: sourcePurchaseOrderId },
          select: { id: true, vendorId: true }
        });
        if (!srcPo) {
          throw new Error("Source purchase order not found");
        }
        if (srcPo.vendorId !== vendorId) {
          throw new Error("Vendor must match the linked purchase order");
        }
      }

      if (sourceGoodsReceivedNoteId) {
        const grn = await prisma.goodsReceivedNote.findUnique({
          where: { id: sourceGoodsReceivedNoteId },
          include: { purchaseOrder: { select: { id: true, vendorId: true } } },
        });
        if (!grn) {
          throw new Error("Source goods received note not found");
        }
        if (grn.purchaseOrder.vendorId !== vendorId) {
          throw new Error("Vendor must match the GRN purchase order");
        }
        if (sourcePurchaseOrderId && grn.purchaseOrderId !== sourcePurchaseOrderId) {
          throw new Error("GRN must belong to the linked purchase order");
        }
      }

      const normalizedVendorRef =
        this.normalizeVendorInvoiceReference(vendorInvoiceReference);
      await this.assertUniqueVendorBillReference(vendorId, normalizedVendorRef);

      // Calculate totals from items
      let subtotal = new Decimal(0);
      let totalVAT = new Decimal(0);

      // Create items and calculate totals
      const invoiceItems = items.map(item => {
        const quantity = new Decimal(item.quantity);
        const unitPrice = new Decimal(item.unitPrice);
        const itemTotal = quantity.times(unitPrice);
        const vatRate = item.vatRate ?? (isTaxable ? VATService.getDecimalRate() : 0);
        const itemVAT = itemTotal.times(new Decimal(vatRate));

        subtotal = subtotal.add(itemTotal);
        totalVAT = totalVAT.add(itemVAT);

        return {
          itemName: item.itemName,
          description: item.description || null,
          quantity: quantity,
          unitPrice: unitPrice,
          totalPrice: itemTotal,
          unit: item.unit || null,
          vatRate: new Decimal(vatRate)
        };
      });

      const totalAmount = subtotal.add(totalVAT);

      // Internal document number (`INV_YYYYMMDD_NNNN`); always generated here — supplier reference is `vendorInvoiceReference`.
      let finalInvoiceNumber: string | null = null;
      let invoice = null;
      let attempts = 0;
      const maxAttempts = 5;

      while (!invoice && attempts < maxAttempts) {
        try {
          finalInvoiceNumber = await this.generateInvoiceNumber(invoiceDate);

          if (await isUnifiedInvoiceNumberInUse(prisma, finalInvoiceNumber)) {
            attempts++;
            await new Promise((resolve) => setTimeout(resolve, 10 * attempts));
            continue;
          }

          // Create the invoice
          invoice = await prisma.purchaseInvoice.create({
            data: {
              invoiceNumber: finalInvoiceNumber,
              vendorInvoiceReference: normalizedVendorRef,
              vendorId,
              invoiceDate,
              dueDate: dueDate || null,
              subtotal: subtotal,
              vatAmount: totalVAT,
              totalAmount: totalAmount,
              currencyId,
              description: description || null,
              status: "DRAFT",
              paymentStatus: "PENDING",
              isTaxable,
              outstandingAmount: totalAmount,
              paidAmount: new Decimal(0),
              notes: notes || null,
              createdById,
              sourcePurchaseOrderId: sourcePurchaseOrderId || null,
              sourceGoodsReceivedNoteId: sourceGoodsReceivedNoteId || null,
              items: {
                create: invoiceItems.map(item => ({
                  itemName: item.itemName,
                  description: item.description,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  totalPrice: item.totalPrice,
                  unit: item.unit,
                  vatRate: item.vatRate
                }))
              }
            },
            include: {
              vendor: true,
              currency: true,
              journalEntry: {
                select: {
                  id: true,
                  referenceNumber: true,
                  status: true,
                  ...prismaJournalEntryRateSelect
                }
              },
              paymentJournalEntry: {
                select: {
                  id: true,
                  referenceNumber: true,
                  status: true,
                  ...prismaJournalEntryRateSelect
                }
              },
              items: true
            }
          });
        } catch (error: any) {
          if (this.isVendorRefUniqueConstraintError(error)) {
            throw new Error(DUPLICATE_VENDOR_BILL_REFERENCE_MESSAGE);
          }
          if (this.isInvoiceNumberUniqueConstraintError(error)) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 10 * attempts));
            continue;
          }
          throw error;
        }
      }

      if (!invoice) {
        throw new Error("Failed to generate unique invoice number after multiple attempts");
      }

      if (attachmentIds?.length) {
        const { VendorDocumentAttachmentService } = await import(
          "./VendorDocumentAttachmentService"
        );
        await VendorDocumentAttachmentService.linkStagedAttachments({
          attachmentIds,
          entityType: "PURCHASE_INVOICE",
          entityId: invoice.id,
          vendorId,
          actorUserId: createdById
        });
      }

      // Audit log
      await AuditService.log({
        userId: createdById,
        action: "CREATE",
        entityType: "PurchaseInvoice",
        entityId: invoice.id,
        oldValues: null,
        newValues: invoice
      });

      return invoice;
    } catch (error: any) {
      if (error?.message === DUPLICATE_VENDOR_BILL_REFERENCE_MESSAGE) {
        throw error;
      }
      throw new Error(`Failed to create purchase invoice: ${error.message}`);
    }
  }

  /**
   * PO to Bill Conversion: create a Vendor Bill (Purchase Invoice) from an approved Purchase Order.
   * Items, quantities, and prices carry over; only supplier invoice number is required.
   */
  static async createVendorBillFromPurchaseOrder(params: {
    purchaseOrderId: string;
    supplierInvoiceNumber: string;
    createdById: string;
    dueDate?: Date;
  }): Promise<PurchaseInvoiceWithRelations> {
    const { purchaseOrderId, supplierInvoiceNumber, createdById, dueDate } = params;

    if (!supplierInvoiceNumber?.trim()) {
      throw new Error("Supplier Invoice Number is required");
    }

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        items: true,
        vendor: true,
        currency: true,
      },
    });

    if (!po) {
      throw new Error("Purchase order not found");
    }

    if (po.status === "BILLED") {
      throw new Error(
        "Purchase order already converted to a vendor bill (status BILLED)"
      );
    }

    const { canConvertPoToVendorBill } = await import("../constants/purchaseOrderStatus");
    const convertible = canConvertPoToVendorBill(po.status) || po.approvedById != null;
    if (!convertible) {
      throw new Error(
        `Purchase order cannot be converted to a vendor bill (status: ${po.status}). Send the PO to the vendor (SENT) or mark it APPROVED first.`
      );
    }

    if (!po.items || po.items.length === 0) {
      throw new Error("Purchase order has no line items; cannot create vendor bill");
    }

    let currencyId = po.currencyId;
    if (!currencyId) {
      const defaultCurrency = await prisma.currency.findFirst({
        where: { code: "ZIG" },
      }) || await prisma.currency.findFirst({ where: { isActive: true } });
      if (!defaultCurrency) {
        throw new Error("Purchase order has no currency and no default currency is configured");
      }
      currencyId = defaultCurrency.id;
    }

    const poHadVat = Number(po.taxAmount) > 0;
    const items = po.items.map((item) => ({
      itemName: item.itemName,
      description: item.description ?? undefined,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      unit: item.unit ?? undefined,
    }));

    const invoice = await this.createPurchaseInvoice({
      vendorId: po.vendorId,
      invoiceDate: po.orderDate,
      dueDate: dueDate ?? po.expectedDeliveryDate ?? undefined,
      currencyId,
      description: `From PO ${po.poNumber}`,
      items,
      isTaxable: poHadVat,
      vendorInvoiceReference: supplierInvoiceNumber.trim(),
      notes: `Converted from Purchase Order ${po.poNumber}`,
      createdById,
      sourcePurchaseOrderId: purchaseOrderId,
    });

    await prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: "BILLED" },
    });

    return invoice;
  }

  /**
   * Get purchase invoice by ID
   */
  static async getPurchaseInvoiceById(invoiceId: string): Promise<PurchaseInvoiceWithRelations | null> {
    try {
      const invoice = await prisma.purchaseInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          vendor: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true,
              ...prismaJournalEntryRateSelect
            }
          },
          paymentJournalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true,
              ...prismaJournalEntryRateSelect
            }
          },
          items: true,
          vendorBillPayments: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              amount: true,
              paymentDate: true,
              paymentReference: true,
              cashbookEntryId: true,
              createdAt: true,
            },
          },
        },
      });

      return invoice;
    } catch (error: any) {
      throw new Error(`Failed to get purchase invoice: ${error.message}`);
    }
  }

  /**
   * Get all purchase invoices
   */
  static async getAllPurchaseInvoices(
    page: number = 1,
    limit: number = 10,
    status?: string,
    paymentStatus?: string,
    currencyId?: string
  ): Promise<{ invoices: PurchaseInvoiceWithRelations[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = (page - 1) * limit;
      const where: any = {};

      if (status) {
        where.status = status;
      }
      if (paymentStatus) {
        where.paymentStatus = paymentStatus;
      }
      if (currencyId) {
        where.currencyId = currencyId;
      }

      const [invoices, total] = await Promise.all([
        prisma.purchaseInvoice.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            vendor: true,
            currency: true,
            journalEntry: {
              select: {
                id: true,
                referenceNumber: true,
                status: true,
                ...prismaJournalEntryRateSelect
              }
            },
            paymentJournalEntry: {
              select: {
                id: true,
                referenceNumber: true,
                status: true,
                ...prismaJournalEntryRateSelect
              }
            },
            items: true
          }
        }),
        prisma.purchaseInvoice.count({ where })
      ]);

      return {
        invoices,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error: any) {
      throw new Error(`Failed to get purchase invoices: ${error.message}`);
    }
  }

  /**
   * Update purchase invoice
   */
  static async updatePurchaseInvoice(
    invoiceId: string,
    params: Partial<CreatePurchaseInvoiceParams>,
    updatedById: string
  ): Promise<PurchaseInvoiceWithRelations> {
    try {
      await VATService.refreshActiveVatRate().catch(() => undefined);
      const existingInvoice = await prisma.purchaseInvoice.findUnique({
        where: { id: invoiceId },
        include: { items: true }
      });

      if (!existingInvoice) {
        throw new Error("Purchase invoice not found");
      }

      if (existingInvoice.status !== "DRAFT") {
        throw new Error("Only DRAFT invoices can be updated. Invoice is already submitted.");
      }

      // Prevent currency changes
      if (params.currencyId && params.currencyId !== existingInvoice.currencyId) {
        throw new Error("Currency cannot be changed after invoice creation");
      }

      // If items are being updated, recalculate totals
      let updateData: any = {};
      
      if (params.items && params.items.length > 0) {
        let subtotal = new Decimal(0);
        let totalVAT = new Decimal(0);

        const isTaxable = params.isTaxable !== undefined ? params.isTaxable : existingInvoice.isTaxable;

        const invoiceItems = params.items.map(item => {
          const quantity = new Decimal(item.quantity);
          const unitPrice = new Decimal(item.unitPrice);
          const itemTotal = quantity.times(unitPrice);
          const vatRate = item.vatRate ?? (isTaxable ? VATService.getDecimalRate() : 0);
          const itemVAT = itemTotal.times(new Decimal(vatRate));

          subtotal = subtotal.add(itemTotal);
          totalVAT = totalVAT.add(itemVAT);

          return {
            itemName: item.itemName,
            description: item.description || null,
            quantity: quantity,
            unitPrice: unitPrice,
            totalPrice: itemTotal,
            unit: item.unit || null,
            vatRate: new Decimal(vatRate)
          };
        });

        const totalAmount = subtotal.add(totalVAT);
        updateData.subtotal = subtotal;
        updateData.vatAmount = totalVAT;
        updateData.totalAmount = totalAmount;
        updateData.outstandingAmount = totalAmount;
        updateData.isTaxable = isTaxable;
      }

      // Update other fields (currency is excluded - cannot be changed)
      if (params.vendorId) updateData.vendorId = params.vendorId;
      if (params.invoiceDate) updateData.invoiceDate = params.invoiceDate;
      if (params.dueDate !== undefined) updateData.dueDate = params.dueDate;
      // currencyId is explicitly excluded - cannot be changed
      if (params.description !== undefined) updateData.description = params.description;
      if (params.notes !== undefined) updateData.notes = params.notes;

      const nextVendorId = params.vendorId ?? existingInvoice.vendorId;
      let nextVendorRef: string | null;
      if (params.vendorInvoiceReference !== undefined) {
        nextVendorRef = this.normalizeVendorInvoiceReference(
          params.vendorInvoiceReference
        );
      } else {
        nextVendorRef = this.normalizeVendorInvoiceReference(
          existingInvoice.vendorInvoiceReference
        );
      }
      await this.assertUniqueVendorBillReference(
        nextVendorId,
        nextVendorRef,
        invoiceId
      );

      if (params.vendorInvoiceReference !== undefined) {
        updateData.vendorInvoiceReference = nextVendorRef;
      }

      if (params.sourcePurchaseOrderId !== undefined) {
        if (params.sourcePurchaseOrderId === null || params.sourcePurchaseOrderId === "") {
          updateData.sourcePurchaseOrderId = null;
        } else {
          const srcPo = await prisma.purchaseOrder.findUnique({
            where: { id: params.sourcePurchaseOrderId },
            select: { id: true, vendorId: true },
          });
          if (!srcPo) throw new Error("Source purchase order not found");
          if (srcPo.vendorId !== nextVendorId) {
            throw new Error("Vendor must match the linked purchase order");
          }
          updateData.sourcePurchaseOrderId = params.sourcePurchaseOrderId;
        }
      }

      if (params.sourceGoodsReceivedNoteId !== undefined) {
        if (params.sourceGoodsReceivedNoteId === null || params.sourceGoodsReceivedNoteId === "") {
          updateData.sourceGoodsReceivedNoteId = null;
        } else {
          const grn = await prisma.goodsReceivedNote.findUnique({
            where: { id: params.sourceGoodsReceivedNoteId },
            include: { purchaseOrder: { select: { id: true, vendorId: true } } },
          });
          if (!grn) throw new Error("Source goods received note not found");
          if (grn.purchaseOrder.vendorId !== nextVendorId) {
            throw new Error("Vendor must match the GRN purchase order");
          }
          const poId =
            params.sourcePurchaseOrderId !== undefined && params.sourcePurchaseOrderId
              ? params.sourcePurchaseOrderId
              : existingInvoice.sourcePurchaseOrderId;
          if (poId && grn.purchaseOrderId !== poId) {
            throw new Error("GRN must belong to the linked purchase order");
          }
          updateData.sourceGoodsReceivedNoteId = params.sourceGoodsReceivedNoteId;
        }
      }

      // Update invoice
      const updatedInvoice = await prisma.$transaction(async (tx) => {
        // Delete existing items
        await tx.purchaseInvoiceItem.deleteMany({
          where: { invoiceId }
        });

        // Update invoice
        const invoice = await tx.purchaseInvoice.update({
          where: { id: invoiceId },
          data: {
            ...updateData,
            items: params.items ? {
              create: params.items.map(item => ({
                itemName: item.itemName,
                description: item.description || null,
                quantity: new Decimal(item.quantity),
                unitPrice: new Decimal(item.unitPrice),
                totalPrice: new Decimal(item.quantity * item.unitPrice),
                unit: item.unit || null,
                vatRate: new Decimal(item.vatRate ?? (params.isTaxable ? VATService.getDecimalRate() : 0))
              }))
            } : undefined
          },
          include: {
            vendor: true,
            currency: true,
            journalEntry: {
              select: {
                id: true,
                referenceNumber: true,
                status: true,
                ...prismaJournalEntryRateSelect
              }
            },
            paymentJournalEntry: {
              select: {
                id: true,
                referenceNumber: true,
                status: true,
                ...prismaJournalEntryRateSelect
              }
            },
            items: true
          }
        });

        return invoice;
      });

      // Audit log
      await AuditService.log({
        userId: updatedById,
        action: "UPDATE",
        entityType: "PurchaseInvoice",
        entityId: invoiceId,
        oldValues: existingInvoice,
        newValues: updatedInvoice
      });

      return updatedInvoice;
    } catch (error: any) {
      if (error?.message === DUPLICATE_VENDOR_BILL_REFERENCE_MESSAGE) {
        throw error;
      }
      if (
        error?.code === "P2002" &&
        this.isVendorRefUniqueConstraintError(error)
      ) {
        throw new Error(DUPLICATE_VENDOR_BILL_REFERENCE_MESSAGE);
      }
      throw new Error(`Failed to update purchase invoice: ${error.message}`);
    }
  }

  /**
   * Delete purchase invoice
   */
  static async deletePurchaseInvoice(invoiceId: string, deletedById: string): Promise<void> {
    try {
      const invoice = await prisma.purchaseInvoice.findUnique({
        where: { id: invoiceId }
      });

      if (!invoice) {
        throw new Error("Purchase invoice not found");
      }

      if (invoice.status !== "DRAFT") {
        throw new Error("Only DRAFT invoices can be deleted");
      }

      await prisma.purchaseInvoice.delete({
        where: { id: invoiceId }
      });

      // Audit log
      await AuditService.log({
        userId: deletedById,
        action: "DELETE",
        entityType: "PurchaseInvoice",
        entityId: invoiceId,
        oldValues: invoice,
        newValues: null
      });
    } catch (error: any) {
      throw new Error(`Failed to delete purchase invoice: ${error.message}`);
    }
  }

  private static userCanOverridePoVariance(user: {
    role?: { name?: string | null; permissions?: unknown } | null;
    roleCode?: string | null;
  } | null): boolean {
    if (!user?.role) return false;
    const rn = (user.role.name || "").toLowerCase();
    if (rn === "admin") return true;
    return (
      userHasEffectivePermission(user, "manage_accounting") ||
      userHasEffectivePermission(user, "manage_ledger") ||
      userHasEffectivePermission(user, "manage_financial_reports")
    );
  }

  /**
   * Three-way match: if bill is linked to a PO and total > PO * 120%, block post unless manager override.
   */
  private static async assertPoVarianceAllowsSubmit(
    invoice: {
      sourcePurchaseOrderId: string | null;
      totalAmount: Decimal;
    },
    submitData: { acknowledgePoVarianceOverride?: boolean },
    processedById: string
  ): Promise<void> {
    if (!invoice.sourcePurchaseOrderId) return;

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: invoice.sourcePurchaseOrderId },
      select: { poNumber: true, totalAmount: true }
    });
    if (!po) return;

    const poTotal = Number(po.totalAmount);
    const billTotal = Number(invoice.totalAmount);
    if (poTotal <= 0) return;

    const maxAllowed = poTotal * PO_VARIANCE_MAX_RATIO + 1e-9;
    if (billTotal <= maxAllowed) return;

    const overPct = ((billTotal - poTotal) / poTotal) * 100;

    if (!submitData.acknowledgePoVarianceOverride) {
      throw new POVarianceWarningError({
        poNumber: po.poNumber,
        purchaseOrderId: invoice.sourcePurchaseOrderId,
        poTotal,
        billTotal,
        maxAllowedWithoutOverride: maxAllowed,
        overPoPercent: Math.round(overPct * 100) / 100
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: processedById },
      include: { role: true }
    });
    if (!this.userCanOverridePoVariance(user)) {
      throw new POVarianceOverrideForbiddenError();
    }
  }

  /**
   * Submit invoice - creates journal entries based on payment method
   * For BANK/CASH: Dr Expense, Dr VAT Input, Cr Bank/Cash
   * For CREDIT: Dr Expense, Dr VAT Input, Cr Accounts Payable
   */
  static async submitInvoice(
    invoiceId: string,
    submitData: {
      paymentMethod: "BANK" | "CASH" | "CREDIT";
      expenseAccountId: string;
      bankId?: string; // Required for BANK payment method
      /** Required when bill total exceeds linked PO by >20% (three-way match). */
      acknowledgePoVarianceOverride?: boolean;
      /**
       * Bank/cash payment value date (YYYY-MM-DD or ISO). When set for BANK/CASH, cashbook + linked journal use this;
       * otherwise they use `invoice.invoiceDate` (legacy behaviour).
       */
      paymentDate?: string;
    },
    processedById: string
  ): Promise<PurchaseInvoiceWithRelations> {
    try {
      const invoice = await prisma.purchaseInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          vendor: true,
          currency: true,
          items: true
        }
      });

      if (!invoice) {
        throw new Error("Purchase invoice not found");
      }

      if (invoice.status !== "DRAFT") {
        throw new Error("Only DRAFT invoices can be submitted");
      }

      if (invoice.journalEntryId) {
        throw new Error("Invoice already has a journal entry");
      }

      await this.assertPoVarianceAllowsSubmit(
        {
          sourcePurchaseOrderId: invoice.sourcePurchaseOrderId ?? null,
          totalAmount: invoice.totalAmount
        },
        submitData,
        processedById
      );

      await assertPurchaseInvoicePaymentAllowedForSuite06(invoiceId);

      // Validate payment method
      if (!["BANK", "CASH", "CREDIT"].includes(submitData.paymentMethod)) {
        throw new Error("Payment method must be BANK, CASH, or CREDIT");
      }

      // Validate bankId for BANK payment method
      if (submitData.paymentMethod === "BANK" && !submitData.bankId) {
        throw new Error("Bank ID is required for BANK payment method");
      }

      // Get expense account
      const expenseAccount = await prisma.chartOfAccounts.findUnique({
        where: { id: submitData.expenseAccountId }
      });

      if (!expenseAccount) {
        throw new Error("Expense account not found");
      }

      // Guardrail: Purchase invoices are vendor procurement spend, not payroll.
      // Prevent mis-posting vendor payments into payroll expense accounts (5010/5030),
      // which corrupts payroll reporting and KPI rollups.
      const expenseNo = String(expenseAccount.accountNo || "").trim();
      if (expenseNo === "5010" || expenseNo === "5030") {
        throw new Error(
          `Invalid expense account for purchase invoice payment: ${expenseAccount.accountNo} (${expenseAccount.accountName}). ` +
            "Payroll expense accounts are reserved for payroll journals; choose the correct procurement expense GL."
        );
      }

      // Get VAT Input account (2110)
      const vatInputAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountNo: "2110" },
            { accountName: { contains: "VAT Input" } }
          ],
          isActive: true
        }
      });

      let journalEntry: any = null;
      let cashbookEntry: any = null;

      /** Value date for BANK/CASH payment; null for CREDIT (no payment yet). */
      let bankCashPaymentDate: Date | null =
        submitData.paymentMethod === "CREDIT"
          ? null
          : submitData.paymentDate != null && String(submitData.paymentDate).trim() !== ""
            ? parseDate(String(submitData.paymentDate).trim())
            : invoice.invoiceDate;

      await PeriodLockService.assertModuleDateOpen({
        moduleCode: "AP",
        accountingDate: invoice.invoiceDate,
        userId: processedById,
        source: "API",
        actionType: "SUBMIT_PURCHASE_INVOICE",
      });
      if (bankCashPaymentDate) {
        await PeriodLockService.assertModuleDateOpen({
          moduleCode: "BANK",
          accountingDate: bankCashPaymentDate,
          userId: processedById,
          source: "API",
          actionType: "SUBMIT_PURCHASE_INVOICE_BANK",
        });
      }

      if (submitData.paymentMethod === "CREDIT") {
        // CREDIT: Create journal entry directly (no cashbook needed)
        const accountsPayableAccount = await prisma.chartOfAccounts.findFirst({
          where: {
            OR: [
              { accountNo: "2000" },
              { accountName: { contains: "Accounts Payable" } }
            ],
            isActive: true
          }
        });

        if (!accountsPayableAccount) {
          throw new Error("Accounts Payable account (2000) not found in chart of accounts");
        }

        // Create journal entry lines
        const journalEntryLines: any[] = [
          // Debit Expense Account
          {
            chartOfAccountId: submitData.expenseAccountId,
            debitAmount: invoice.subtotal,
            creditAmount: new Decimal(0),
            description: `Expense - ${invoice.description || invoice.invoiceNumber}`
          }
        ];

        // Debit VAT Input (if applicable)
        if (invoice.vatAmount.gt(0)) {
          const vatAccountId = vatInputAccount?.id || submitData.expenseAccountId;
          journalEntryLines.push({
            chartOfAccountId: vatAccountId,
            debitAmount: invoice.vatAmount,
            creditAmount: new Decimal(0),
            description: `VAT Input - ${invoice.invoiceNumber}`
          });
        }

        // Credit Accounts Payable
        journalEntryLines.push({
          chartOfAccountId: accountsPayableAccount.id,
          debitAmount: new Decimal(0),
          creditAmount: invoice.totalAmount,
          description: `Accounts Payable - ${invoice.vendor.name} - ${invoice.invoiceNumber}`
        });

        // Create journal entry
        journalEntry = await createJournalEntryWithAuditSequence({
          transactionDate: invoice.invoiceDate,
          referenceNumber: `AP-CREDIT-${invoice.invoiceNumber}`,
          description: `Purchase Invoice - ${invoice.vendor.name} - ${invoice.invoiceNumber}`,
          totalAmount: invoice.totalAmount,
          currencyId: invoice.currencyId,
          status: "POSTED",
          createdById: processedById,
          journalEntryLines: {
            create: journalEntryLines,
          },
        });
      } else {
        // BANK or CASH: Use cashbook to record payment, then create journal entry
        let bankId: string;
        let bankName: string;

        if (submitData.paymentMethod === "BANK") {
          const bank = await prisma.bank.findUnique({
            where: { id: submitData.bankId! },
            include: { glAccount: true }
          });

          if (!bank) {
            throw new Error("Bank account not found");
          }

          if (!bank.glAccount) {
            throw new Error("Bank account does not have a GL account configured");
          }

          bankId = bank.id;
          bankName = bank.name;
        } else {
          // CASH - For cash payments, we need a bank account for cashbook entry
          // But the journal entry will credit Petty Cash GL account (1030), not the bank account
          // Find a bank account (preferably one named "Cash" or use first available)
          const cashBank = await prisma.bank.findFirst({
            where: {
              name: { contains: "Cash" }
            },
            include: { glAccount: true }
          });

          if (!cashBank) {
            // Fallback: use first bank account
            const firstBank = await prisma.bank.findFirst({
              include: { glAccount: true }
            });

            if (!firstBank) {
              throw new Error("No bank account found for cash payment");
            }

            bankId = firstBank.id;
            bankName = firstBank.name;
          } else {
            bankId = cashBank.id;
            bankName = cashBank.name;
          }
        }

        // Create cashbook payment entry
        // Note: We use the expense account as glAccountId, but we'll create custom journal entry lines
        const vatCode = invoice.vatAmount.gt(0) ? '15%' : '0%';
        const cashbookResult = await CashbookService.createCashPayment({
          bankId: bankId,
          transactionDate: bankCashPaymentDate!,
          description: `Purchase Invoice Payment - ${invoice.vendor.name} - ${invoice.invoiceNumber}`,
          amount: Number(invoice.totalAmount),
          reference: `AP-PAY-${submitData.paymentMethod}-${invoice.invoiceNumber}`,
          counterpartyType: 'GL',
          glAccountId: submitData.expenseAccountId, // This will be used but we'll override journal entry lines
          vatCode: vatCode,
          createdById: processedById
        });

        if (!cashbookResult.success || !cashbookResult.transaction) {
          throw new Error(cashbookResult.message || "Failed to create cashbook payment");
        }

        cashbookEntry = cashbookResult.transaction;

        // Get the journal entry created by cashbook
        if (cashbookEntry.journalEntryId) {
          // Delete the default journal entry lines created by cashbook
          await prisma.journalEntryLine.deleteMany({
            where: { journalEntryId: cashbookEntry.journalEntryId }
          });

          // Create correct journal entry lines: Dr Expense (subtotal), Dr VAT Input, Cr Bank/Cash
          const journalEntryLines: any[] = [
            // Debit Expense Account (subtotal, not net)
            {
              journalEntryId: cashbookEntry.journalEntryId,
              chartOfAccountId: submitData.expenseAccountId,
              debitAmount: invoice.subtotal,
              creditAmount: new Decimal(0),
              description: `Expense - ${invoice.description || invoice.invoiceNumber}`
            }
          ];

          // Debit VAT Input (if applicable)
          if (invoice.vatAmount.gt(0)) {
            const vatAccountId = vatInputAccount?.id || submitData.expenseAccountId;
            journalEntryLines.push({
              journalEntryId: cashbookEntry.journalEntryId,
              chartOfAccountId: vatAccountId,
              debitAmount: invoice.vatAmount,
              creditAmount: new Decimal(0),
              description: `VAT Input - ${invoice.invoiceNumber}`
            });
          }

          // Credit Bank/Cash Account
          let creditAccountId: string;
          let creditAccountName: string;

          if (submitData.paymentMethod === "BANK") {
            // For BANK: Credit the bank's GL account
            const bank = await prisma.bank.findUnique({
              where: { id: bankId },
              include: { glAccount: true }
            });

            if (!bank || !bank.glAccount) {
              throw new Error("Bank GL account not found");
            }

            creditAccountId = bank.glAccount.id;
            creditAccountName = bank.glAccount.accountName;
          } else {
            // For CASH: Credit Petty Cash GL account (1030)
            const cashAccount = await prisma.chartOfAccounts.findFirst({
              where: {
                OR: [
                  { accountNo: "1030" },
                  { accountName: { contains: "Petty Cash" } }
                ],
                isActive: true
              }
            });

            if (!cashAccount) {
              throw new Error("Petty Cash account (1030) not found in chart of accounts");
            }

            creditAccountId = cashAccount.id;
            creditAccountName = cashAccount.accountName;
          }

          journalEntryLines.push({
            journalEntryId: cashbookEntry.journalEntryId,
            chartOfAccountId: creditAccountId,
            debitAmount: new Decimal(0),
            creditAmount: invoice.totalAmount,
            description: `${creditAccountName} - ${invoice.vendor.name} - ${invoice.invoiceNumber}`
          });

          // Create the journal entry lines
          await prisma.journalEntryLine.createMany({
            data: journalEntryLines
          });

          journalEntry = await prisma.journalEntry.findUnique({
            where: { id: cashbookEntry.journalEntryId }
          });
        } else {
          throw new Error("Cashbook entry did not create journal entry");
        }
      }

      // Update invoice
      const updatedInvoice = await prisma.purchaseInvoice.update({
        where: { id: invoiceId },
        data: {
          status: "POSTED",
          paymentMethod: submitData.paymentMethod,
          paymentStatus: submitData.paymentMethod === "CREDIT" ? "PENDING" : "PAID",
          paidAmount: submitData.paymentMethod === "CREDIT" ? new Decimal(0) : invoice.totalAmount,
          outstandingAmount: submitData.paymentMethod === "CREDIT" ? invoice.totalAmount : new Decimal(0),
          paymentDate: bankCashPaymentDate,
          journalEntryId: journalEntry.id,
          cashbookEntryId: cashbookEntry?.id || null
        },
        include: {
          vendor: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true,
              ...prismaJournalEntryRateSelect
            }
          },
          paymentJournalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true,
              ...prismaJournalEntryRateSelect
            }
          },
          items: true
        }
      });

      // Audit log
      await AuditService.log({
        userId: processedById,
        action: "UPDATE",
        entityType: "PurchaseInvoice",
        entityId: invoiceId,
        oldValues: invoice,
        newValues: updatedInvoice
      });

      return updatedInvoice;
    } catch (error: any) {
      if (
        error instanceof POVarianceWarningError ||
        error instanceof POVarianceOverrideForbiddenError
      ) {
        throw error;
      }
      throw new Error(`Failed to submit invoice: ${error.message}`);
    }
  }

  /**
   * Pay invoice - creates cashbook payment entry (only for CREDIT invoices)
   * Dr. Accounts Payable, Cr. Bank/Cash Account
   */
  static async payInvoice(
    invoiceId: string,
    paymentData: {
      paymentMethod: "BANK" | "CASH";
      bankId?: string; // Required for BANK payment method
      paymentDate: Date;
      paymentReference?: string;
      notes?: string;
    },
    processedById: string
  ): Promise<PurchaseInvoiceWithRelations> {
    try {
      const invoice = await prisma.purchaseInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          vendor: true,
          currency: true,
          journalEntry: true
        }
      });

      if (!invoice) {
        throw new Error("Purchase invoice not found");
      }

      if (invoice.paymentStatus === "PAID") {
        throw new Error("Invoice is already paid");
      }

      if (invoice.status !== "POSTED") {
        throw new Error("Invoice must be submitted before payment");
      }

      if (invoice.paymentMethod !== "CREDIT") {
        throw new Error("Only CREDIT invoices can be paid. Invoice was submitted with payment method: " + invoice.paymentMethod);
      }

      if (!invoice.journalEntryId) {
        throw new Error("Invoice must be submitted before payment");
      }

      await assertPurchaseInvoicePaymentAllowedForSuite06(invoiceId);

      // Validate payment method
      if (!["BANK", "CASH"].includes(paymentData.paymentMethod)) {
        throw new Error("Payment method must be BANK or CASH");
      }

      // Validate bankId for BANK payment method
      if (paymentData.paymentMethod === "BANK" && !paymentData.bankId) {
        throw new Error("Bank ID is required for BANK payment method");
      }

      // Get Accounts Payable account (2000) for the debit
      const accountsPayableAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountNo: "2000" },
            { accountName: { contains: "Accounts Payable" } }
          ],
          isActive: true
        }
      });

      if (!accountsPayableAccount) {
        throw new Error("Accounts Payable account (2000) not found");
      }

      let bankId: string;
      let bankName: string;

      if (paymentData.paymentMethod === "BANK") {
        // Get bank account
        const bank = await prisma.bank.findUnique({
          where: { id: paymentData.bankId! },
          include: { glAccount: true }
        });

        if (!bank) {
          throw new Error("Bank account not found");
        }

        bankId = bank.id;
        bankName = bank.name;
      } else {
        // CASH - Find a bank account linked to Petty Cash (1030) or use first available bank
        // For cash payments, we still need a bank record for cashbook entry
        // In practice, you might have a "Petty Cash" bank account
        const cashBank = await prisma.bank.findFirst({
          where: {
            name: { contains: "Cash" }
          },
          include: { glAccount: true }
        });

        if (!cashBank) {
          // Fallback: use first bank account
          const firstBank = await prisma.bank.findFirst({
            include: { glAccount: true }
          });

          if (!firstBank) {
            throw new Error("No bank account found for cash payment");
          }

          bankId = firstBank.id;
          bankName = firstBank.name;
        } else {
          bankId = cashBank.id;
          bankName = cashBank.name;
        }
      }

      // Create cashbook payment entry
      const cashbookResult = await CashbookService.createCashPayment({
        bankId: bankId,
        transactionDate: paymentData.paymentDate,
        description: `Payment for Purchase Invoice ${invoice.invoiceNumber} - ${invoice.vendor.name}`,
        amount: Number(invoice.outstandingAmount),
        reference: paymentData.paymentReference || `PAY-${invoice.invoiceNumber}`,
        counterpartyType: 'GL',
        glAccountId: accountsPayableAccount.id, // Debit Accounts Payable
        createdById: processedById
      });

      if (!cashbookResult.success || !cashbookResult.transaction) {
        throw new Error(cashbookResult.message || "Failed to create cashbook payment");
      }

      const paymentJeId = cashbookResult.transaction.journalEntryId ?? null;

      // Update invoice payment status
      const paymentAmount = invoice.outstandingAmount;
      const updatedInvoice = await prisma.purchaseInvoice.update({
        where: { id: invoiceId },
        data: {
          paymentStatus: paymentAmount.gte(invoice.totalAmount) ? "PAID" : "PARTIALLY_PAID",
          paidAmount: invoice.paidAmount.add(paymentAmount),
          outstandingAmount: invoice.outstandingAmount.minus(paymentAmount),
          paymentDate: paymentData.paymentDate,
          paymentReference: paymentData.paymentReference || null,
          cashbookEntryId: cashbookResult.transaction.id,
          ...(paymentJeId ? { paymentJournalEntryId: paymentJeId } : {}),
          notes: paymentData.notes || invoice.notes
        },
        include: {
          vendor: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true,
              ...prismaJournalEntryRateSelect
            }
          },
          paymentJournalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true,
              ...prismaJournalEntryRateSelect
            }
          },
          items: true
        }
      });

      // Audit log
      await AuditService.log({
        userId: processedById,
        action: "UPDATE",
        entityType: "PurchaseInvoice",
        entityId: invoiceId,
        oldValues: invoice,
        newValues: updatedInvoice
      });

      return updatedInvoice;
    } catch (error: any) {
      throw new Error(`Failed to pay invoice: ${error.message}`);
    }
  }

  /**
   * Pay multiple CREDIT vendor bills in one bank/cashbook movement.
   * Creates one POSTED cashbook payment + journal (Dr AP, Cr Bank) and one `PurchaseInvoicePayment` row per bill.
   */
  static async payInvoicesBatch(
    invoiceIds: string[],
    paymentData: {
      paymentMethod: "BANK" | "CASH";
      bankId?: string;
      paymentDate: Date;
      paymentReference?: string;
      notes?: string;
    },
    processedById: string
  ): Promise<{
    cashbookEntryId: string;
    journalEntryId: string;
    batchReference: string;
    totalAmount: string;
    invoices: PurchaseInvoiceWithRelations[];
  }> {
    const ids = [...new Set((invoiceIds || []).filter(Boolean))];
    if (ids.length < 1) {
      throw new Error("At least one invoice is required");
    }
    if (ids.length > 100) {
      throw new Error("Maximum 100 invoices per batch");
    }

    if (!["BANK", "CASH"].includes(paymentData.paymentMethod)) {
      throw new Error("Payment method must be BANK or CASH");
    }
    if (paymentData.paymentMethod === "BANK" && !paymentData.bankId) {
      throw new Error("Bank ID is required for BANK payment method");
    }

    const invoices = await prisma.purchaseInvoice.findMany({
      where: { id: { in: ids } },
      include: {
        vendor: true,
        currency: true,
        journalEntry: true,
        items: true,
      },
    });

    if (invoices.length !== ids.length) {
      throw new Error("One or more purchase invoices were not found");
    }

    const currencyId = invoices[0].currencyId;
    for (const inv of invoices) {
      if (inv.paymentStatus === "PAID") {
        throw new Error(`Invoice ${inv.invoiceNumber} is already paid`);
      }
      if (inv.status !== "POSTED") {
        throw new Error(`Invoice ${inv.invoiceNumber} must be submitted before payment`);
      }
      if (inv.paymentMethod !== "CREDIT") {
        throw new Error(
          `Only CREDIT invoices can be batch-paid (${inv.invoiceNumber} is ${inv.paymentMethod})`
        );
      }
      if (!inv.journalEntryId) {
        throw new Error(`Invoice ${inv.invoiceNumber} must be submitted before payment`);
      }
      const out = Number(inv.outstandingAmount);
      if (!Number.isFinite(out) || out <= 0) {
        throw new Error(`Invoice ${inv.invoiceNumber} has nothing to pay`);
      }
      if (inv.cashbookEntryId) {
        throw new Error(
          `Invoice ${inv.invoiceNumber} already has a single-invoice cashbook link; pay the remainder individually or reverse that payment first`
        );
      }
      if (inv.currencyId !== currencyId) {
        throw new Error("All invoices in a batch must use the same currency");
      }
      await assertPurchaseInvoicePaymentAllowedForSuite06(inv.id);
    }

    const accountsPayableAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [{ accountNo: "2000" }, { accountName: { contains: "Accounts Payable" } }],
        isActive: true,
      },
    });
    if (!accountsPayableAccount) {
      throw new Error("Accounts Payable account (2000) not found");
    }

    let bankId: string;
    if (paymentData.paymentMethod === "BANK") {
      const bank = await prisma.bank.findUnique({
        where: { id: paymentData.bankId! },
        include: { glAccount: true, currency: true },
      });
      if (!bank) {
        throw new Error("Bank account not found");
      }
      if (!bank.glAccountId) {
        throw new Error("Bank account has no GL account linked");
      }
      if (bank.currencyId !== currencyId) {
        throw new Error("Bank account currency must match invoice currency");
      }
      bankId = bank.id;
    } else {
      const cashBank = await prisma.bank.findFirst({
        where: { name: { contains: "Cash" } },
        include: { glAccount: true, currency: true },
      });
      const pick = cashBank
        ? cashBank
        : await prisma.bank.findFirst({ include: { glAccount: true, currency: true } });
      if (!pick || !pick.glAccountId) {
        throw new Error("No bank account found for cash payment");
      }
      if (pick.currencyId !== currencyId) {
        throw new Error("Cash/petty bank account currency must match invoice currency");
      }
      bankId = pick.id;
    }

    const bank = await prisma.bank.findUnique({
      where: { id: bankId },
      include: { glAccount: true, currency: true },
    });
    if (!bank?.glAccountId) {
      throw new Error("Bank account not found or has no GL account");
    }

    let total = new Decimal(0);
    for (const inv of invoices) {
      total = total.add(inv.outstandingAmount);
    }
    const totalDec = new Decimal(total.toFixed(2));

    const batchRef =
      paymentData.paymentReference || `BATCH-PAY-${Date.now()}`;
    const invNums = invoices.map((i) => i.invoiceNumber).join(", ");
    const description = `Batch vendor payment (${invoices.length} bills): ${invNums}`.slice(0, 65000);
    /** Journal header/lines use a short description — DB column is limited (e.g. VARCHAR 191). Detail stays on cashbook. */
    const journalDescription = `Bank Payment: Batch ${invoices.length} bills ${batchRef}`.slice(0, 190);

    const auditSnapshots = new Map(
      invoices.map((inv) => [
        inv.id,
        {
          paymentStatus: inv.paymentStatus,
          paidAmount: inv.paidAmount.toString(),
          outstandingAmount: inv.outstandingAmount.toString(),
        },
      ])
    );

    const result = await prisma.$transaction(
      async (tx) => {
        const cashbookRow = await tx.cashbookEntry.create({
          data: {
            bankId,
            transactionDate: paymentData.paymentDate,
            type: "PAYMENT",
            amount: totalDec,
            reference: batchRef,
            description,
            status: "PENDING",
            counterpartyType: "GL",
            glAccountId: accountsPayableAccount.id,
            createdById: processedById,
          },
        });

        const refNo = `CB-${cashbookRow.id.slice(-8).toUpperCase()}`;
        const je = await assignNextAuditIdAndCreateJournal(tx, {
          transactionDate: paymentData.paymentDate,
          referenceNumber: refNo,
          description: journalDescription,
          totalAmount: totalDec,
          currencyId: bank.currencyId,
          status: "POSTED",
          createdById: processedById,
        });

        await tx.journalEntryLine.create({
          data: {
            journalEntryId: je.id,
            chartOfAccountId: accountsPayableAccount.id,
            debitAmount: totalDec,
            creditAmount: new Decimal(0),
            description: `Batch AP: ${journalDescription}`.slice(0, 500),
          },
        });
        await tx.journalEntryLine.create({
          data: {
            journalEntryId: je.id,
            chartOfAccountId: bank.glAccountId,
            debitAmount: new Decimal(0),
            creditAmount: totalDec,
            description: `Bank: ${journalDescription}`.slice(0, 500),
          },
        });

        await tx.cashbookEntry.update({
          where: { id: cashbookRow.id },
          data: { journalEntryId: je.id, status: "POSTED" },
        });

        const updatedInvoices: PurchaseInvoiceWithRelations[] = [];
        for (const inv of invoices) {
          const payAmt = inv.outstandingAmount;
          await tx.purchaseInvoicePayment.create({
            data: {
              purchaseInvoiceId: inv.id,
              cashbookEntryId: cashbookRow.id,
              amount: payAmt,
              paymentDate: paymentData.paymentDate,
              paymentReference: batchRef,
              notes: paymentData.notes ?? null,
              createdById: processedById,
            },
          });
          const newPaid = inv.paidAmount.add(payAmt);
          const newOutstanding = inv.outstandingAmount.minus(payAmt);
          const paidFully = newOutstanding.abs().lt(0.005) || newOutstanding.lte(0);
          const updated = await tx.purchaseInvoice.update({
            where: { id: inv.id },
            data: {
              paymentStatus: paidFully ? "PAID" : "PARTIALLY_PAID",
              paidAmount: newPaid,
              outstandingAmount: paidFully ? new Decimal(0) : newOutstanding,
              paymentDate: paymentData.paymentDate,
              paymentReference: batchRef,
              paymentJournalEntryId: je.id,
              notes: paymentData.notes || inv.notes,
            },
            include: {
              vendor: true,
              currency: true,
              journalEntry: {
                select: {
                  id: true,
                  referenceNumber: true,
                  status: true,
                  ...prismaJournalEntryRateSelect,
                },
              },
              paymentJournalEntry: {
                select: {
                  id: true,
                  referenceNumber: true,
                  status: true,
                  ...prismaJournalEntryRateSelect,
                },
              },
              items: true,
            },
          });
          updatedInvoices.push(updated as PurchaseInvoiceWithRelations);
        }

        return {
          cashbookEntryId: cashbookRow.id,
          journalEntryId: je.id,
          batchReference: batchRef,
          invoices: updatedInvoices,
        };
      },
      { maxWait: 60000, timeout: 120000 }
    );

    for (const inv of result.invoices) {
      await AuditService.log({
        userId: processedById,
        action: "UPDATE",
        entityType: "PurchaseInvoice",
        entityId: inv.id,
        oldValues: auditSnapshots.get(inv.id),
        newValues: {
          paymentStatus: inv.paymentStatus,
          paidAmount: inv.paidAmount?.toString?.() ?? inv.paidAmount,
          outstandingAmount: inv.outstandingAmount?.toString?.() ?? inv.outstandingAmount,
          batchPayCashbookEntryId: result.cashbookEntryId,
          batchReference: result.batchReference,
        },
      });
    }

    return {
      cashbookEntryId: result.cashbookEntryId,
      journalEntryId: result.journalEntryId,
      batchReference: result.batchReference,
      totalAmount: totalDec.toFixed(2),
      invoices: result.invoices,
    };
  }

  /**
   * Get all expense accounts from chart of accounts
   */
  static async getExpenseAccounts(): Promise<any[]> {
    try {
      const expenseAccounts = await prisma.chartOfAccounts.findMany({
        where: {
          accountType: "Expense",
          isActive: true
        },
        orderBy: [
          { accountNo: 'asc' }
        ],
        select: {
          id: true,
          accountNo: true,
          accountName: true,
          accountType: true,
          financialStatement: true,
          notes: true,
          isActive: true
        }
      });

      return expenseAccounts;
    } catch (error: any) {
      throw new Error(`Failed to get expense accounts: ${error.message}`);
    }
  }

  /**
   * Get all active bank accounts
   */
  static async getBanks(): Promise<any[]> {
    try {
      const banks = await prisma.bank.findMany({
        where: {
          isActive: true
        },
        include: {
          currency: {
            select: {
              id: true,
              code: true,
              symbol: true,
              name: true
            }
          },
          glAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true
            }
          }
        },
        orderBy: [
          { name: 'asc' }
        ]
      });

      return banks.map(bank => ({
        id: bank.id,
        name: bank.name,
        accountNumber: bank.accountNumber,
        branchCode: bank.branchCode,
        swiftCode: bank.swiftCode,
        currency: bank.currency,
        glAccount: bank.glAccount,
        isActive: bank.isActive
      }));
    } catch (error: any) {
      throw new Error(`Failed to get banks: ${error.message}`);
    }
  }
}

