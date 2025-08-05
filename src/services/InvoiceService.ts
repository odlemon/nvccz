// @ts-nocheck
import { PrismaClient, Invoice, Customer, InvoiceCategory, Currency } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { dbConnection } from "../utils/database";
import VATService from "./VATService";
import JournalEntryService, { CreateInvoiceJournalEntryParams } from "./JournalEntryService";

const prisma = dbConnection.getPrismaClient();

export interface CreateInvoiceParams {
  customerId: string;
  categoryId: string;
  amount: number;
  currencyId: string;
  transactionDate: Date;
  description: string;
  invoiceNumber?: string;
  isTaxable: boolean;
  createdById: string;
}

export interface InvoiceWithRelations extends Invoice {
  customer: Customer;
  category: InvoiceCategory;
  currency: Currency;
  journalEntry?: {
    id: string;
    referenceNumber: string;
    status: string;
  } | null;
}

export class InvoiceService {
  /**
   * Generate a unique invoice number
   */
  private static generateInvoiceNumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `INV-${timestamp}-${random}`;
  }

  /**
   * Create a new invoice with automatic VAT calculation and journal entry creation
   */
  static async createInvoice(params: CreateInvoiceParams): Promise<InvoiceWithRelations> {
    try {
      const {
        customerId,
        categoryId,
        amount,
        currencyId,
        transactionDate,
        description,
        invoiceNumber,
        isTaxable,
        createdById
      } = params;

      // Validate input parameters
      if (!amount || amount <= 0) {
        throw new Error("Amount must be greater than zero");
      }
      if (!description || description.trim().length === 0) {
        throw new Error("Description is required");
      }
      
      // Validate that customer, category, and currency exist
      await this.validateInvoiceData(customerId, categoryId, currencyId);

      // Calculate VAT if taxable (as number)
      const vatAmount: number = VATService.isVATEligible(amount, isTaxable)
        ? VATService.calculateVAT(amount)
        : 0;
      const totalAmount: number = Number(amount) + Number(vatAmount);

      // Generate invoice number if not provided
      const finalInvoiceNumber = invoiceNumber || this.generateInvoiceNumber();

      // Create the invoice record (convert to Decimal at DB write)
      const invoice = await prisma.invoice.create({
        data: {
          customerId,
          categoryId,
          amount: new Decimal(amount),
          vatAmount: new Decimal(vatAmount),
          totalAmount: new Decimal(totalAmount),
          currencyId,
          transactionDate,
          description,
          invoiceNumber: finalInvoiceNumber,
          isTaxable,
          status: "DRAFT",
          createdById
        },
        include: {
          customer: true,
          category: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          }
        }
      });

      // Create journal entry for double-entry bookkeeping
      const journalEntryResult = await JournalEntryService.createInvoiceJournalEntry({
        customerId,
        categoryId,
        amount,
        vatAmount,
        totalAmount,
        currencyId,
        transactionDate,
        description,
        invoiceNumber: finalInvoiceNumber,
        isTaxable,
        createdById
      });

      // Update invoice with journal entry reference
      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: { journalEntryId: journalEntryResult.journalEntry.id },
        include: {
          customer: true,
          category: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          }
        }
      });

      return updatedInvoice;
    } catch (error: any) {
      throw new Error(`Failed to create invoice: ${error.message}`);
    }
  }

  /**
   * Validate that customer, category, and currency exist
   */
  private static async validateInvoiceData(customerId: string, categoryId: string, currencyId: string): Promise<void> {
    const [customer, category, currency] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId } }),
      prisma.invoiceCategory.findUnique({ where: { id: categoryId } }),
      prisma.currency.findUnique({ where: { id: currencyId } })
    ]);

    if (!customer) {
      throw new Error("Customer not found");
    }
    if (!category) {
      throw new Error("Invoice category not found");
    }
    if (!currency) {
      throw new Error("Currency not found");
    }
  }

  /**
   * Get invoice by ID with relations
   */
  static async getInvoiceById(id: string): Promise<InvoiceWithRelations | null> {
    try {
      return await prisma.invoice.findUnique({
        where: { id },
        include: {
          customer: true,
          category: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          }
        }
      });
    } catch (error: any) {
      throw new Error(`Failed to get invoice: ${error.message}`);
    }
  }

  /**
   * Get invoices with filtering and pagination
   */
  static async getInvoices(params: {
    page?: number;
    limit?: number;
    customerId?: string;
    categoryId?: string;
    currencyId?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
  }): Promise<{
    invoices: InvoiceWithRelations[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const {
        page = 1,
        limit = 10,
        customerId,
        categoryId,
        currencyId,
        startDate,
        endDate,
        status
      } = params;

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = { isActive: true };

      if (customerId) where.customerId = customerId;
      if (categoryId) where.categoryId = categoryId;
      if (currencyId) where.currencyId = currencyId;
      if (status) where.status = status;
      if (startDate || endDate) {
        where.transactionDate = {};
        if (startDate) where.transactionDate.gte = startDate;
        if (endDate) where.transactionDate.lte = endDate;
      }

      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            customer: true,
            category: true,
            currency: true,
            journalEntry: {
              select: {
                id: true,
                referenceNumber: true,
                status: true
              }
            }
          }
        }),
        prisma.invoice.count({ where })
      ]);

      return {
        invoices,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error: any) {
      throw new Error(`Failed to get invoices: ${error.message}`);
    }
  }

  /**
   * Update an invoice with proper double-entry bookkeeping
   */
  static async updateInvoice(id: string, updateData: Partial<CreateInvoiceParams>): Promise<InvoiceWithRelations> {
    try {
      // Get the current invoice
      const currentInvoice = await this.getInvoiceById(id);
      if (!currentInvoice) {
        throw new Error("Invoice not found");
      }

      // Check if this is a financial update (amount, VAT, taxable status)
      const isFinancialUpdate = updateData.amount !== undefined || 
                               updateData.isTaxable !== undefined ||
                               updateData.vatAmount !== undefined;

      // If invoice is POSTED and this is a financial update, we need to create reversals
      if (currentInvoice.status === "SENT" && isFinancialUpdate) {
        // Create reversal journal entry for the current invoice
        await JournalEntryService.createReversalInvoiceJournalEntry({
          customerId: currentInvoice.customerId,
          categoryId: currentInvoice.categoryId,
          amount: Number(currentInvoice.amount),
          vatAmount: Number(currentInvoice.vatAmount),
          totalAmount: Number(currentInvoice.totalAmount),
          currencyId: currentInvoice.currencyId,
          transactionDate: currentInvoice.transactionDate,
          description: currentInvoice.description,
          invoiceNumber: currentInvoice.invoiceNumber || "",
          isTaxable: currentInvoice.isTaxable,
          createdById: currentInvoice.createdById
        });
      }

      // Calculate new amounts if amount or taxable status changed
      let newAmount = Number(currentInvoice.amount);
      let newVatAmount = Number(currentInvoice.vatAmount);
      let newTotalAmount = Number(currentInvoice.totalAmount);
      let newIsTaxable = currentInvoice.isTaxable;

      if (updateData.amount !== undefined) {
        newAmount = updateData.amount;
      }
      if (updateData.isTaxable !== undefined) {
        newIsTaxable = updateData.isTaxable;
      }

      // Recalculate VAT and total if needed
      if (updateData.amount !== undefined || updateData.isTaxable !== undefined) {
        newVatAmount = VATService.isVATEligible(newAmount, newIsTaxable)
          ? VATService.calculateVAT(newAmount)
          : 0;
        newTotalAmount = newAmount + newVatAmount;
      }

      // Update the invoice
      const updatedInvoice = await prisma.invoice.update({
        where: { id },
        data: {
          ...updateData,
          amount: new Decimal(newAmount),
          vatAmount: new Decimal(newVatAmount),
          totalAmount: new Decimal(newTotalAmount),
          isTaxable: newIsTaxable
        },
        include: {
          customer: true,
          category: true,
          currency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          }
        }
      });

      // If this was a financial update on a POSTED invoice, create new journal entry
      if (currentInvoice.status === "SENT" && isFinancialUpdate) {
        const journalEntryResult = await JournalEntryService.createInvoiceJournalEntry({
          customerId: updatedInvoice.customerId,
          categoryId: updatedInvoice.categoryId,
          amount: newAmount,
          vatAmount: newVatAmount,
          totalAmount: newTotalAmount,
          currencyId: updatedInvoice.currencyId,
          transactionDate: updatedInvoice.transactionDate,
          description: updatedInvoice.description,
          invoiceNumber: updatedInvoice.invoiceNumber || "",
          isTaxable: newIsTaxable,
          createdById: updatedInvoice.createdById
        });

        // Update invoice with new journal entry reference
        return await prisma.invoice.update({
          where: { id },
          data: { journalEntryId: journalEntryResult.journalEntry.id },
          include: {
            customer: true,
            category: true,
            currency: true,
            journalEntry: {
              select: {
                id: true,
                referenceNumber: true,
                status: true
              }
            }
          }
        });
      }

      return updatedInvoice;
    } catch (error: any) {
      throw new Error(`Failed to update invoice: ${error.message}`);
    }
  }

  /**
   * Delete an invoice with proper journal entry handling
   */
  static async deleteInvoice(id: string): Promise<void> {
    try {
      const invoice = await this.getInvoiceById(id);
      if (!invoice) {
        throw new Error("Invoice not found");
      }

      // If invoice is POSTED, create reversal journal entry
      if (invoice.status === "SENT" && invoice.journalEntry) {
        await JournalEntryService.createReversalInvoiceJournalEntry({
          customerId: invoice.customerId,
          categoryId: invoice.categoryId,
          amount: Number(invoice.amount),
          vatAmount: Number(invoice.vatAmount),
          totalAmount: Number(invoice.totalAmount),
          currencyId: invoice.currencyId,
          transactionDate: invoice.transactionDate,
          description: invoice.description,
          invoiceNumber: invoice.invoiceNumber || "",
          isTaxable: invoice.isTaxable,
          createdById: invoice.createdById
        });
      }

      // Soft delete the invoice
      await prisma.invoice.update({
        where: { id },
        data: { isActive: false }
      });
    } catch (error: any) {
      throw new Error(`Failed to delete invoice: ${error.message}`);
    }
  }

  /**
   * Get invoice summary statistics
   */
  static async getInvoiceSummary(params: {
    startDate?: Date;
    endDate?: Date;
    currencyId?: string;
  }): Promise<{
    totalInvoices: number;
    totalVAT: number;
    averageInvoice: number;
    invoiceCount: number;
    byCategory: Array<{
      categoryName: string;
      total: number;
      count: number;
    }>;
    byCustomer: Array<{
      customerName: string;
      total: number;
      count: number;
    }>;
  }> {
    try {
      const { startDate, endDate, currencyId } = params;

      // Build where clause
      const where: any = { isActive: true };
      if (startDate || endDate) {
        where.transactionDate = {};
        if (startDate) where.transactionDate.gte = startDate;
        if (endDate) where.transactionDate.lte = endDate;
      }
      if (currencyId) where.currencyId = currencyId;

      const invoices = await prisma.invoice.findMany({
        where,
        include: {
          category: true,
          customer: true
        }
      });

      const totalInvoices = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
      const totalVAT = invoices.reduce((sum, inv) => sum + Number(inv.vatAmount), 0);
      const averageInvoice = invoices.length > 0 ? totalInvoices / invoices.length : 0;

      // Group by category
      const byCategory = invoices.reduce((acc, inv) => {
        const categoryName = inv.category.name;
        const existing = acc.find(item => item.categoryName === categoryName);
        if (existing) {
          existing.total += Number(inv.totalAmount);
          existing.count += 1;
        } else {
          acc.push({
            categoryName,
            total: Number(inv.totalAmount),
            count: 1
          });
        }
        return acc;
      }, [] as Array<{ categoryName: string; total: number; count: number }>);

      // Group by customer
      const byCustomer = invoices.reduce((acc, inv) => {
        const customerName = inv.customer.name;
        const existing = acc.find(item => item.customerName === customerName);
        if (existing) {
          existing.total += Number(inv.totalAmount);
          existing.count += 1;
        } else {
          acc.push({
            customerName,
            total: Number(inv.totalAmount),
            count: 1
          });
        }
        return acc;
      }, [] as Array<{ customerName: string; total: number; count: number }>);

      return {
        totalInvoices,
        totalVAT,
        averageInvoice,
        invoiceCount: invoices.length,
        byCategory,
        byCustomer
      };
    } catch (error: any) {
      throw new Error(`Failed to get invoice summary: ${error.message}`);
    }
  }
} 