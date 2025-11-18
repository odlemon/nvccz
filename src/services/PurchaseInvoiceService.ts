// @ts-nocheck
import { PrismaClient, PurchaseInvoice, Vendor, Currency } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import VATService from "./VATService";
import JournalEntryService from "./JournalEntryService";
import { CashbookService } from "./CashbookService";
import AuditService from "./AuditService";

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
  invoiceNumber?: string;
  notes?: string;
  createdById: string;
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
   * Generate a unique invoice number
   */
  private static async generateInvoiceNumber(): Promise<string> {
    try {
      const currentYear = new Date().getFullYear();
      const lastInvoice = await prisma.purchaseInvoice.findFirst({
        where: {
          invoiceNumber: {
            startsWith: `PINV-${currentYear}-`
          }
        },
        orderBy: {
          invoiceNumber: 'desc'
        }
      });

      let nextNumber = 1;
      if (lastInvoice && lastInvoice.invoiceNumber) {
        const match = lastInvoice.invoiceNumber.match(/PINV-\d{4}-(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      const formattedNumber = nextNumber.toString().padStart(3, '0');
      return `PINV-${currentYear}-${formattedNumber}`;
    } catch (error) {
      console.error("Error generating invoice number:", error);
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      return `PINV-${timestamp}-${random}`;
    }
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

  /**
   * Create a new purchase invoice
   */
  static async createPurchaseInvoice(params: CreatePurchaseInvoiceParams): Promise<PurchaseInvoiceWithRelations> {
    try {
      const {
        vendorId,
        invoiceDate,
        dueDate,
        currencyId,
        description,
        items,
        isTaxable = false,
        invoiceNumber,
        notes,
        createdById
      } = params;

      // Validate input
      if (!items || items.length === 0) {
        throw new Error("At least one item is required");
      }

      // Validate vendor and currency
      await this.validateInvoiceData(vendorId, currencyId);

      // Calculate totals from items
      let subtotal = new Decimal(0);
      let totalVAT = new Decimal(0);

      // Create items and calculate totals
      const invoiceItems = items.map(item => {
        const quantity = new Decimal(item.quantity);
        const unitPrice = new Decimal(item.unitPrice);
        const itemTotal = quantity.times(unitPrice);
        const vatRate = item.vatRate || (isTaxable ? 0.15 : 0);
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

      // Generate invoice number if not provided
      const finalInvoiceNumber = invoiceNumber || await this.generateInvoiceNumber();

      // Create the invoice
      const invoice = await prisma.purchaseInvoice.create({
        data: {
          invoiceNumber: finalInvoiceNumber,
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
              status: true
            }
          },
          paymentJournalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          },
          items: true
        }
      });

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
      throw new Error(`Failed to create purchase invoice: ${error.message}`);
    }
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
              status: true
            }
          },
          paymentJournalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          },
          items: true
        }
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
    paymentStatus?: string
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
                status: true
              }
            },
            paymentJournalEntry: {
              select: {
                id: true,
                referenceNumber: true,
                status: true
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
          const vatRate = item.vatRate || (isTaxable ? 0.15 : 0);
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
                vatRate: new Decimal(item.vatRate || (params.isTaxable ? 0.15 : 0))
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
                status: true
              }
            },
            paymentJournalEntry: {
              select: {
                id: true,
                referenceNumber: true,
                status: true
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

      // Determine credit account based on payment method
      let creditAccountId: string;
      let creditAccountName: string;
      let referencePrefix: string;

      if (submitData.paymentMethod === "CREDIT") {
        // Get Accounts Payable account (2000)
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

        creditAccountId = accountsPayableAccount.id;
        creditAccountName = accountsPayableAccount.accountName;
        referencePrefix = "PINV-CREDIT";
      } else if (submitData.paymentMethod === "BANK") {
        // Get bank account's GL account
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

        creditAccountId = bank.glAccount.id;
        creditAccountName = bank.glAccount.accountName;
        referencePrefix = "PINV-BANK";
      } else {
        // CASH - Get Petty Cash account (1030)
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
        referencePrefix = "PINV-CASH";
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

      // Credit account (Bank/Cash/Accounts Payable)
      journalEntryLines.push({
        chartOfAccountId: creditAccountId,
        debitAmount: new Decimal(0),
        creditAmount: invoice.totalAmount,
        description: `${creditAccountName} - ${invoice.vendor.name} - ${invoice.invoiceNumber}`
      });

      // Create journal entry
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate: invoice.invoiceDate,
          referenceNumber: `${referencePrefix}-${invoice.invoiceNumber}`,
          description: `Purchase Invoice - ${invoice.vendor.name} - ${invoice.invoiceNumber}`,
          totalAmount: invoice.totalAmount,
          currencyId: invoice.currencyId,
          status: "POSTED",
          createdById: processedById,
          journalEntryLines: {
            create: journalEntryLines
          }
        }
      });

      // Update invoice
      const updatedInvoice = await prisma.purchaseInvoice.update({
        where: { id: invoiceId },
        data: {
          status: "POSTED",
          paymentMethod: submitData.paymentMethod,
          paymentStatus: submitData.paymentMethod === "CREDIT" ? "PENDING" : "PAID",
          paidAmount: submitData.paymentMethod === "CREDIT" ? new Decimal(0) : invoice.totalAmount,
          outstandingAmount: submitData.paymentMethod === "CREDIT" ? invoice.totalAmount : new Decimal(0),
          paymentDate: submitData.paymentMethod === "CREDIT" ? null : invoice.invoiceDate,
          journalEntryId: journalEntry.id
        },
        include: {
          vendor: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          },
          paymentJournalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
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
          notes: paymentData.notes || invoice.notes
        },
        include: {
          vendor: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          },
          paymentJournalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
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
}

