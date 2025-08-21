// @ts-nocheck
import { PrismaClient, Invoice, Customer, Currency } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { dbConnection } from "../utils/database";
import VATService from "./VATService";
import JournalEntryService, { CreateInvoiceJournalEntryParams } from "./JournalEntryService";

const prisma = dbConnection.getPrismaClient();

export interface CreateInvoiceParams {
  customerId: string;
  amount: number;
  currencyId: string;
  transactionDate: Date;
  description: string;
  items?: any[]; // JSON array of invoice line items
  invoiceNumber?: string;
  isTaxable: boolean;
  createdById: string;
  exchangeRateAtCreation?: number; // Rate when invoice was created
}

export interface MarkAsPaidParams {
  paymentMethod?: string;
  paymentCurrencyId?: string; // Currency used for payment
}

export interface InvoiceWithRelations extends Invoice {
  customer: Customer;
  currency: Currency;
  paymentCurrency?: Currency | null;
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
        amount,
        currencyId,
        transactionDate,
        description,
        items,
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
      
      // Validate that customer and currency exist
      await this.validateInvoiceData(customerId, currencyId);

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
          amount: new Decimal(amount),
          vatAmount: new Decimal(vatAmount),
          totalAmount: new Decimal(totalAmount),
          currencyId,
          transactionDate,
          description,
          items: items || [],
          invoiceNumber: finalInvoiceNumber,
          isTaxable,
          status: "DRAFT",
          createdById,
          exchangeRateAtCreation: params.exchangeRateAtCreation ? new Decimal(params.exchangeRateAtCreation) : null
        },
        include: {
          customer: true,
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
  private static async validateInvoiceData(customerId: string, currencyId: string): Promise<void> {
    const [customer, currency] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId } }),
      prisma.currency.findUnique({ where: { id: currencyId } })
    ]);

    if (!customer) {
      throw new Error("Customer not found");
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
        currencyId,
        startDate,
        endDate,
        status
      } = params;

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = { isActive: true };

      if (customerId) where.customerId = customerId;
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
      const whereClause: any = {
        isActive: true
      };

      if (startDate || endDate) {
        whereClause.transactionDate = {};
        if (startDate) whereClause.transactionDate.gte = startDate;
        if (endDate) whereClause.transactionDate.lte = endDate;
      }

      if (currencyId) {
        whereClause.currencyId = currencyId;
      }

      // Get basic statistics
      const invoices = await prisma.invoice.findMany({
        where: whereClause,
        include: {
          customer: true,
          currency: true
        }
      });

      const totalInvoices = invoices.length;
      const totalAmount = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
      const totalVAT = invoices.reduce((sum, inv) => sum + Number(inv.vatAmount), 0);
      const averageInvoice = totalInvoices > 0 ? totalAmount / totalInvoices : 0;

      // Group by category (from items)
      const categoryTotals: { [key: string]: { total: number; count: number } } = {};
      invoices.forEach(invoice => {
        if (invoice.items && Array.isArray(invoice.items)) {
          invoice.items.forEach((item: any) => {
            const category = item.category || 'Unknown';
            if (!categoryTotals[category]) {
              categoryTotals[category] = { total: 0, count: 0 };
            }
            categoryTotals[category].total += Number(item.amount || 0);
            categoryTotals[category].count += 1;
          });
        }
      });

      const byCategory = Object.entries(categoryTotals).map(([categoryName, data]) => ({
        categoryName,
        total: data.total,
        count: data.count
      }));

      // Group by customer
      const customerTotals: { [key: string]: { total: number; count: number; name: string } } = {};
      invoices.forEach(invoice => {
        const customerId = invoice.customerId;
        const customerName = invoice.customer.name;
        if (!customerTotals[customerId]) {
          customerTotals[customerId] = { total: 0, count: 0, name: customerName };
        }
        customerTotals[customerId].total += Number(invoice.totalAmount);
        customerTotals[customerId].count += 1;
      });

      const byCustomer = Object.values(customerTotals).map(data => ({
        customerName: data.name,
        total: data.total,
        count: data.count
      }));

      return {
        totalInvoices,
        totalVAT,
        averageInvoice,
        invoiceCount: totalInvoices,
        byCategory,
        byCustomer
      };
    } catch (error: any) {
      throw new Error(`Failed to get invoice summary: ${error.message}`);
    }
  }

  /**
   * Send invoice to customer (DRAFT -> SENT)
   * No accounting impact - just status change
   */
  static async sendInvoice(id: string): Promise<InvoiceWithRelations> {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          customer: true,
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

      if (!invoice) {
        throw new Error("Invoice not found");
      }

      if (invoice.status !== "DRAFT") {
        throw new Error(`Cannot send invoice with status: ${invoice.status}. Only DRAFT invoices can be sent.`);
      }

      const updatedInvoice = await prisma.invoice.update({
        where: { id },
        data: { status: "SENT" },
        include: {
          customer: true,
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
      throw new Error(`Failed to send invoice: ${error.message}`);
    }
  }

  /**
   * Mark invoice as paid (SENT -> PAID)
   * Creates payment journal entry: Dr Cash/Bank, Cr Accounts Receivable
   * Supports multi-currency payments with conversion
   */
  static async markAsPaid(id: string, params: MarkAsPaidParams = {}): Promise<InvoiceWithRelations> {
    const { paymentMethod = "BANK", paymentCurrencyId } = params;
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          customer: true,
          currency: true,
          paymentCurrency: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              status: true
            }
          }
        }
      });

      if (!invoice) {
        throw new Error("Invoice not found");
      }

      if (invoice.status !== "SENT") {
        throw new Error(`Cannot mark invoice as paid with status: ${invoice.status}. Only SENT invoices can be marked as paid.`);
      }

      // Handle currency conversion if payment currency is different from invoice currency
      let amountInPaymentCurrency = Number(invoice.totalAmount);
      let finalCurrencyId = invoice.currencyId;

      if (paymentCurrencyId && paymentCurrencyId !== invoice.currencyId) {
        // Use the exchange rate from invoice creation date for conversion
        if (!invoice.exchangeRateAtCreation) {
          throw new Error("Exchange rate at creation is required for currency conversion");
        }

        // Convert using the rate from invoice creation date
        amountInPaymentCurrency = Number(invoice.totalAmount) * Number(invoice.exchangeRateAtCreation);
        finalCurrencyId = paymentCurrencyId;
      }

      // Create payment journal entry
      const paymentJournalEntry = await JournalEntryService.createInvoicePaymentJournalEntry({
        invoiceId: id,
        amount: amountInPaymentCurrency,
        currencyId: finalCurrencyId,
        transactionDate: new Date(),
        description: `Payment for invoice: ${invoice.invoiceNumber}`,
        paymentMethod,
        createdById: invoice.createdById
      });

      // Update invoice status to PAID and save payment details
      const updatedInvoice = await prisma.invoice.update({
        where: { id },
        data: { 
          status: "PAID",
          paymentMethod,
          paymentCurrencyId: paymentCurrencyId || null,
          amountInPaymentCurrency: paymentCurrencyId && paymentCurrencyId !== invoice.currencyId 
            ? new Decimal(amountInPaymentCurrency) 
            : null,
          paymentDate: new Date()
        },
        include: {
          customer: true,
          currency: true,
          paymentCurrency: true,
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
      console.error("Error marking invoice as paid:", error);
      throw error; // Return the actual error instead of wrapping it
    }
  }

  /**
   * Void invoice (any status -> VOID)
   * Creates reversal journal entry to cancel the original invoice entry
   */
  static async voidInvoice(id: string, reason?: string): Promise<InvoiceWithRelations> {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          customer: true,
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

      if (!invoice) {
        throw new Error("Invoice not found");
      }

      if (invoice.status === "VOID") {
        throw new Error("Invoice is already voided");
      }

      // Create reversal journal entry
      const reversalJournalEntry = await JournalEntryService.createReversalInvoiceJournalEntry({
        customerId: invoice.customerId,
        amount: Number(invoice.amount),
        vatAmount: Number(invoice.vatAmount),
        totalAmount: Number(invoice.totalAmount),
        currencyId: invoice.currencyId,
        transactionDate: new Date(),
        description: `VOID: ${invoice.description}${reason ? ` - Reason: ${reason}` : ''}`,
        invoiceNumber: invoice.invoiceNumber,
        isTaxable: invoice.isTaxable,
        createdById: invoice.createdById
      });

      // Update invoice status to VOID
      const updatedInvoice = await prisma.invoice.update({
        where: { id },
        data: { 
          status: "VOID",
          // Note: We don't link the reversal journal entry to the invoice
          // as it's a separate transaction
        },
        include: {
          customer: true,
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
      throw new Error(`Failed to void invoice: ${error.message}`);
    }
  }
} 