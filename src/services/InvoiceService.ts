// @ts-nocheck
import { Prisma, PrismaClient, Invoice, Customer, Currency } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { prismaJournalEntryRateSelect } from "../config/accountingSnapshotResponseSelect";
import VATService from "./VATService";
import JournalEntryService, { CreateInvoiceJournalEntryParams } from "./JournalEntryService";
import AuditService from "./AuditService";
import { resolveUsdZwgAvgForSnapshot } from "./UsdZwgRateResolver";
import { MultiCurrencyService } from "./MultiCurrencyService";
import {
  buildInvoiceEquivalentAtCreation,
  type InvoiceEquivalentAtCreation
} from "../utils/invoiceEquivalentAtCreation";
import PeriodLockService from "./PeriodLockService";
import { nextUnifiedInvoiceNumber } from "../utils/accountingDocumentNumbers";

export type { InvoiceEquivalentAtCreation };

export interface CreateInvoiceParams {
  customerId: string;
  /** When payment is due; defaults to the invoice date plus the customer's payment terms (30 days if none). */
  dueDate?: Date | null;
  amount: number;
  currencyId: string;
  transactionDate: Date;
  description: string;
  items?: any[]; // JSON array of invoice line items
  invoiceNumber?: string;
  isTaxable: boolean;
  createdById: string;
  /** Optional override; normally omitted so middleware sets USD/ZWG from Zimrate / stored snapshot. */
  exchangeRateAtCreation?: number;
  /**
   * When set with exchangeRateAtCreation, skips extra Zimrate calls in Prisma middleware and invoice JE create.
   * Use the same USD/ZWG avg you already fetched (e.g. scripts / bulk jobs).
   */
  usdZwgRateSnapshot?: number;
}

export interface MarkAsPaidParams {
  paymentMethod?: string;
  paymentCurrencyId?: string; // Currency used for payment
  /** Required for cross-currency: actual amount received in payment currency (e.g. ZAR). */
  paymentAmount?: number;
  /** ZAR bank used for settlement (USD invoice paid in ZAR). */
  bankId?: string;
  /**
   * Optional USD→ZWL (ZiG) rate at payment for `ForexGainLoss.exchangeRate` when paying USD in ZWL.
   * Omit to resolve from `exchange_rates` (may fail if none configured).
   */
  paymentExchangeRate?: number;
}

/** Populated on successful mark-as-paid: normalized conversion + realized FX for API clients. */
export type PaymentSettlementPath =
  | "SAME_CURRENCY"
  | "LEGACY_INVOICE_RATE"
  | "USD_ZWL"
  | "USD_ZWL_ZAR";

export interface PaymentSettlementConvertedAmounts {
  invoiceTotalInInvoiceCurrency: number;
  invoiceCurrencyCode: string;
  /** Functional/book amount at invoice (e.g. USD total × exchangeRateAtCreation → ZWL). */
  bookValueAtInvoiceCreation?: number;
  bookCurrencyCode?: string;
  /** Actual or implied settlement in payment currency. */
  paymentAmountInPaymentCurrency: number;
  paymentCurrencyCode: string;
  /** Payment expressed in book currency when different from payment currency (e.g. ZWL equivalent of ZAR received). */
  paymentEquivalentInBookCurrency?: number;
  /** Obligation in payment currency at payment-date cross (USD→ZAR path). */
  obligationInPaymentCurrency?: number;
  /** Snapshot rate: local (ZWL/ZWG) per 1 invoice unit at creation, when set on invoice. */
  exchangeRateAtCreation?: number;
}

export interface PaymentSettlementRealizedFx {
  forexGainLossId: string;
  gainLossType: "GAIN" | "LOSS";
  /** Magnitude in book/functional currency (matches `ForexGainLoss.gainLossAmount` semantics). */
  amountInBookCurrency: number;
  bookCurrencyCode: string;
  /** Optional: absolute ZAR difference between cash received and AR clearance (USD→ZAR path). */
  amountInPaymentCurrency?: number;
  paymentCurrencyCode?: string;
  paymentJournalEntryId?: string;
}

export interface PaymentSettlementSummary {
  path: PaymentSettlementPath;
  convertedAmounts: PaymentSettlementConvertedAmounts;
  realizedGainLoss?: PaymentSettlementRealizedFx | null;
  /** Short note for non–forex paths (legacy conversion). */
  note?: string;
  /** Same-currency partial payment (open-item); full settlement omits this. */
  partialPayment?: {
    amountPaidThisCall: number;
    outstandingAfter: number;
    invoiceTotal: number;
  };
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
  /** Total in the paired currency at creation-time USD/ZWG snapshot (USD ↔ ZWL/ZWG only). */
  equivalentAtCreation?: InvoiceEquivalentAtCreation | null;
  /** Populated when mark-as-paid used a cross-currency path (e.g. USD invoice settled in ZAR). */
  crossCurrencyPayment?: Record<string, unknown>;
  /** Populated on mark-as-paid: stable fields for conversions + realized gain/loss. */
  paymentSettlement?: PaymentSettlementSummary;
  /** Related forex rows when included (list/detail). */
  forexGainLoss?: unknown[];
}

export class InvoiceService {
  private static async getUsdLocalCurrencyLookup(): Promise<{
    usd: { id: string; code: string; name: string; symbol: string } | null;
    local: { id: string; code: string; name: string; symbol: string } | null;
  }> {
    const rows = await prisma.currency.findMany({
      where: { isActive: true, code: { in: ["USD", "ZWL", "ZWG", "ZIG"] } },
      select: { id: true, code: true, name: true, symbol: true }
    });
    const usd = rows.find((r) => r.code.toUpperCase() === "USD") ?? null;
    const local =
      rows.find((r) => r.code.toUpperCase() === "ZWG") ??
      rows.find((r) => r.code.toUpperCase() === "ZWL") ??
      rows.find((r) => r.code.toUpperCase() === "ZIG") ??
      null;
    return { usd, local };
  }

  /** Include graph for invoice API (list, detail, mark-as-paid response). */
  private static invoiceApiInclude() {
    return {
      customer: true,
      vendor: true,
      currency: true,
      paymentCurrency: true,
      forexGainLoss: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          transactionDate: true,
          gainLossType: true,
          gainLossAmount: true,
          originalAmount: true,
          convertedAmount: true,
          exchangeRate: true,
          journalEntryId: true,
          description: true,
          createdAt: true,
          fromCurrency: { select: { id: true, code: true, symbol: true } },
          toCurrency: { select: { id: true, code: true, symbol: true } }
        }
      },
      journalEntry: {
        select: {
          id: true,
          referenceNumber: true,
          status: true,
          ...prismaJournalEntryRateSelect
        }
      }
    };
  }

  private static paymentSnapshotsForDb(
    paymentSettlement: PaymentSettlementSummary | null | undefined,
    crossCurrencyPayment: Record<string, unknown> | null | undefined
  ) {
    return {
      paymentSettlementSnapshot:
        paymentSettlement == null ? null : JSON.parse(JSON.stringify(paymentSettlement)),
      crossCurrencyPaymentSnapshot:
        crossCurrencyPayment == null ? null : JSON.parse(JSON.stringify(crossCurrencyPayment))
    };
  }

  /** Map DB JSON columns to API fields `paymentSettlement` / `crossCurrencyPayment`. */
  private static applyPaymentSnapshotFields(inv: Record<string, unknown> | null) {
    if (!inv) return null;
    const o = { ...inv };
    if (o.paymentSettlementSnapshot != null && typeof o.paymentSettlementSnapshot === "object") {
      o.paymentSettlement = o.paymentSettlementSnapshot;
    }
    if (o.crossCurrencyPaymentSnapshot != null && typeof o.crossCurrencyPaymentSnapshot === "object") {
      o.crossCurrencyPayment = o.crossCurrencyPaymentSnapshot;
    }
    delete o.paymentSettlementSnapshot;
    delete o.crossCurrencyPaymentSnapshot;
    return o;
  }

  private static async attachEquivalent<T extends InvoiceWithRelations>(
    invoice: T | null
  ): Promise<(T & { equivalentAtCreation: InvoiceEquivalentAtCreation | null }) | null> {
    if (!invoice) return null;
    const lookup = await this.getUsdLocalCurrencyLookup();
    const merged = {
      ...invoice,
      equivalentAtCreation: buildInvoiceEquivalentAtCreation(invoice, lookup)
    };
    return this.applyPaymentSnapshotFields(merged) as any;
  }

  private static async attachEquivalentMany<T extends InvoiceWithRelations>(
    invoices: T[]
  ): Promise<Array<T & { equivalentAtCreation: InvoiceEquivalentAtCreation | null }>> {
    if (!invoices.length) return [];
    const lookup = await this.getUsdLocalCurrencyLookup();
    return invoices.map((inv) =>
      this.applyPaymentSnapshotFields({
        ...inv,
        equivalentAtCreation: buildInvoiceEquivalentAtCreation(inv, lookup)
      }) as any
    );
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

      let lineItems = Array.isArray(items) ? items : [];
      if (lineItems.length === 0 && Number(amount) > 0) {
        lineItems = [{ quantity: 1, unitPrice: Number(amount), description: "Line" }];
      }
      this.validateInvoiceLineItems(lineItems, amount);

      // Calculate VAT if taxable (as number)
      const vatAmount: number = VATService.isVATEligible(amount, isTaxable)
        ? VATService.calculateVAT(amount)
        : 0;
      const totalAmount: number = Number(amount) + Number(vatAmount);

      // Omit exchangeRateAtCreation unless client supplied a finite number; otherwise middleware fills from Zimrate/DB snapshot.
      const manualExRate =
        params.exchangeRateAtCreation != null && Number.isFinite(Number(params.exchangeRateAtCreation))
          ? new Decimal(params.exchangeRateAtCreation)
          : undefined;
      const manualUsdZwgSnap =
        params.usdZwgRateSnapshot != null && Number.isFinite(Number(params.usdZwgRateSnapshot))
          ? new Decimal(params.usdZwgRateSnapshot)
          : undefined;

      await PeriodLockService.assertModuleDateOpen({
        moduleCode: "AR",
        accountingDate: transactionDate,
        userId: createdById,
        source: "API",
        actionType: "CREATE_INVOICE",
      });

      const { updatedInvoice, journalEntryResult } = await prisma.$transaction(
        async (tx) => {
          const finalInvoiceNumber =
            invoiceNumber ||
            (await nextUnifiedInvoiceNumber(tx, new Date(transactionDate)));

          const invoice = await tx.invoice.create({
            data: {
              customerId,
              amount: new Decimal(amount),
              vatAmount: new Decimal(vatAmount),
              totalAmount: new Decimal(totalAmount),
              currencyId,
              transactionDate,
              dueDate: await (async () => {
                if (params.dueDate && !Number.isNaN(new Date(params.dueDate).getTime())) return new Date(params.dueDate);
                const c = await tx.customer.findUnique({ where: { id: customerId }, select: { paymentTerms: true } }).catch(() => null);
                const m = String(c?.paymentTerms ?? '').match(/\d+/); // terms are text ("30", "Net 30")
                const days = m && Number(m[0]) > 0 ? Number(m[0]) : 30;
                return new Date(new Date(transactionDate).getTime() + days * 86400000);
              })(),
              description,
              items: lineItems,
              invoiceNumber: finalInvoiceNumber,
              isTaxable,
              status: "DRAFT",
              createdById,
              ...(manualExRate != null ? { exchangeRateAtCreation: manualExRate } : {}),
              ...(manualUsdZwgSnap != null ? { usdZwgRateSnapshot: manualUsdZwgSnap } : {}),
              outstandingAmount: new Decimal(totalAmount)
            },
            include: this.invoiceApiInclude()
          });

          const journalEntryResult = await JournalEntryService.createInvoiceJournalEntry(
            {
              customerId,
              amount,
              vatAmount,
              totalAmount,
              currencyId,
              transactionDate,
              description,
              invoiceNumber: finalInvoiceNumber,
              isTaxable,
              createdById,
              ...(manualUsdZwgSnap != null
                ? { usdZwgRateSnapshot: Number(manualUsdZwgSnap) }
                : {})
            },
            tx
          );

          const updated = await tx.invoice.update({
            where: { id: invoice.id },
            data: { journalEntryId: journalEntryResult.journalEntry.id },
            include: this.invoiceApiInclude()
          });

          return { updatedInvoice: updated, journalEntryResult };
        },
        {
          maxWait: 10000,
          timeout: 30000,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      );

      await AuditService.log({
        userId: createdById,
        action: "CREATE",
        entityType: "JournalEntry",
        entityId: journalEntryResult.journalEntry.id,
        newValues: journalEntryResult.journalEntry
      });

      await AuditService.log({
        userId: createdById,
        action: "CREATE",
        entityType: "Invoice",
        entityId: updatedInvoice.id,
        newValues: updatedInvoice
      });

      return (await this.attachEquivalent(updatedInvoice)) as InvoiceWithRelations;
    } catch (error: any) {
      throw new Error(`Failed to create invoice: ${error.message}`);
    }
  }

  /**
   * Fail fast before any DB write: lines must be valid and sum to the header net amount.
   */
  private static validateInvoiceLineItems(items: unknown, netAmount: number): void {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("At least one invoice line item is required");
    }
    let sum = 0;
    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      if (row == null || typeof row !== "object") {
        throw new Error(`Invoice line ${i + 1} is invalid`);
      }
      const q = Number(row.quantity);
      const u = Number(row.unitPrice);
      if (!Number.isFinite(q) || q <= 0) {
        throw new Error(`Invoice line ${i + 1}: quantity must be a positive number`);
      }
      if (!Number.isFinite(u) || u < 0) {
        throw new Error(`Invoice line ${i + 1}: unitPrice must be a non-negative number`);
      }
      sum += q * u;
    }
    const net = Number(netAmount);
    if (Math.abs(sum - net) > 0.02) {
      throw new Error(
        `Line item totals (${sum.toFixed(2)}) do not match invoice net amount (${net.toFixed(2)})`
      );
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
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: this.invoiceApiInclude()
      });
      return (await this.attachEquivalent(invoice)) as InvoiceWithRelations | null;
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
      if (status) {
        const s = String(status).toUpperCase();
        if (s === "OPEN") {
          where.status = { in: ["SENT", "PARTIALLY_PAID"] };
          where.outstandingAmount = { gt: 0 };
        } else {
          where.status = status;
        }
      }
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
          include: this.invoiceApiInclude()
        }),
        prisma.invoice.count({ where })
      ]);

      const withEquiv = await this.attachEquivalentMany(invoices);

      return {
        invoices: withEquiv as InvoiceWithRelations[],
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
      if (
        (currentInvoice.status === "SENT" || currentInvoice.status === "PARTIALLY_PAID") &&
        isFinancialUpdate
      ) {
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

      // Build Prisma-safe update payload — strip fields that aren't direct scalar columns
      const {
        customerId: newCustomerId,
        currencyId: newCurrencyId,
        items: _items,
        invoiceDate: _invoiceDate,
        createdById: _createdById,
        invoiceNumber: _invoiceNumber,
        exchangeRateAtCreation: _rateAtCreation,
        usdZwgRateSnapshot: _rateSnapshot,
        ...safeUpdateFields
      } = updateData as Record<string, any>;

      const prismaData: Record<string, any> = {
        ...safeUpdateFields,
        amount: new Decimal(newAmount),
        vatAmount: new Decimal(newVatAmount),
        totalAmount: new Decimal(newTotalAmount),
        isTaxable: newIsTaxable,
      };

      if (newCustomerId && newCustomerId !== currentInvoice.customerId) {
        prismaData.customer = { connect: { id: newCustomerId } };
      }
      if (newCurrencyId && newCurrencyId !== currentInvoice.currencyId) {
        prismaData.currency = { connect: { id: newCurrencyId } };
      }

      const before = currentInvoice;
      const updatedInvoice = await prisma.invoice.update({
        where: { id },
        data: prismaData,
        include: this.invoiceApiInclude()
      });

      // If this was a financial update on a POSTED invoice, create new journal entry
      if (
        (currentInvoice.status === "SENT" || currentInvoice.status === "PARTIALLY_PAID") &&
        isFinancialUpdate
      ) {
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
        const finalUpdatedInvoice = await prisma.invoice.update({
          where: { id },
          data: { journalEntryId: journalEntryResult.journalEntry.id },
          include: this.invoiceApiInclude()
        });

        // Audit: UPDATE invoice (SENT with financial changes)
        await AuditService.log({
          userId: finalUpdatedInvoice.createdById,
          action: "UPDATE",
          entityType: "Invoice",
          entityId: id,
          oldValues: currentInvoice,
          newValues: finalUpdatedInvoice,
        });

        return (await this.attachEquivalent(finalUpdatedInvoice)) as InvoiceWithRelations;
      }

      // Audit: UPDATE invoice (no financial changes)
      await AuditService.log({
        userId: updatedInvoice.createdById,
        action: "UPDATE",
        entityType: "Invoice",
        entityId: id,
        oldValues: before,
        newValues: updatedInvoice,
      });

      return (await this.attachEquivalent(updatedInvoice)) as InvoiceWithRelations;
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
      if (
        (invoice.status === "SENT" || invoice.status === "PARTIALLY_PAID") &&
        invoice.journalEntry
      ) {
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
      const before = invoice;
      const deleted = await prisma.invoice.update({
        where: { id },
        data: { isActive: false }
      });

      // Audit: DELETE invoice (soft)
      await AuditService.log({
        userId: invoice.createdById,
        action: "DELETE",
        entityType: "Invoice",
        entityId: id,
        oldValues: before,
        newValues: deleted,
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
   * @param options.usdZwgSnapshotForSend When set, skips Zimrate/DB resolver (use pre-fetched USD/ZWG avg).
   */
  static async sendInvoice(
    id: string,
    options?: { usdZwgSnapshotForSend?: number; user?: unknown; performedById?: string }
  ): Promise<InvoiceWithRelations> {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: this.invoiceApiInclude()
      });

      if (!invoice) {
        throw new Error("Invoice not found");
      }

      if (invoice.status !== "DRAFT") {
        throw new Error(`Cannot send invoice with status: ${invoice.status}. Only DRAFT invoices can be sent.`);
      }

      const before = invoice;
      const preSend = options?.usdZwgSnapshotForSend;
      const rateAtSend =
        preSend != null && Number.isFinite(preSend) && preSend > 0
          ? preSend
          : await resolveUsdZwgAvgForSnapshot(prisma);
      const rateDecSend =
        rateAtSend != null && Number.isFinite(rateAtSend) && rateAtSend > 0
          ? new Decimal(rateAtSend)
          : null;

      const updatedInvoice = await prisma.invoice.update({
        where: { id },
        data: {
          status: "SENT",
          ...(rateDecSend != null
            ? {
                exchangeRateAtSent: rateDecSend,
                usdZwgRateSnapshotSent: rateDecSend
              }
            : {})
        },
        include: this.invoiceApiInclude()
      });

      // Post linked journal so GL Debtors Control (e.g. 1200) moves with the same amount as customer open balance
      if (updatedInvoice.journalEntryId) {
        const je = await prisma.journalEntry.findUnique({
          where: { id: updatedInvoice.journalEntryId }
        });
        if (je?.status === "PENDING") {
          try {
            // Pass the acting user (not only createdById): postJournalEntry requires options.user for
            // manage_ledger. Invoice create already made this PENDING JE; allowCreatorPost lets the
            // same finance user complete send without a second maker-checker hop.
            const posterId = options?.performedById || updatedInvoice.createdById;
            await JournalEntryService.postJournalEntry(je.id, posterId, {
              user: options?.user,
              allowCreatorPost: true,
            });
          } catch (postErr: any) {
            await prisma.invoice.update({
              where: { id },
              data: {
                status: "DRAFT",
                ...(rateDecSend != null
                  ? {
                      exchangeRateAtSent: null,
                      usdZwgRateSnapshotSent: null
                    }
                  : {})
              }
            });
            throw new Error(
              `Failed to post invoice to the ledger (Debtors Control must match customer balance): ${postErr?.message || postErr}`
            );
          }
        }
      }

      // Audit: SEND invoice (status change)
      const afterSend = await prisma.invoice.findUnique({
        where: { id },
        include: this.invoiceApiInclude()
      });
      await AuditService.log({
        userId: updatedInvoice.createdById,
        action: "SEND",
        entityType: "Invoice",
        entityId: id,
        oldValues: before,
        newValues: afterSend ?? updatedInvoice,
      });

      // Best-effort: email the customer a branded PDF copy. Failures here must NOT roll back the SEND.
      try {
        const inv = afterSend ?? updatedInvoice;
        const customerEmail = String(inv?.customer?.email || "").trim();
        const vendorEmail = String(inv?.vendor?.email || "").trim();
        if (customerEmail || vendorEmail) {
          const [{ loadCapitalCallAccountingLetterhead }, { buildInvoicePdfBuffer, safeInvoicePdfFileBaseName }, { EmailNotificationService }] =
            await Promise.all([
              import("../utils/capitalCallAccountingLetterhead"),
              import("../utils/invoicePdf"),
              import("./EmailNotificationService"),
            ]);
          const letterhead = await loadCapitalCallAccountingLetterhead().catch(() => null);
          const pdf = await buildInvoicePdfBuffer({
            invoiceNumber: inv.invoiceNumber || inv.id,
            transactionDate: inv.transactionDate,
            dueDate: inv.dueDate ?? null,
            description: inv.description ?? null,
            status: inv.status,
            currencyCode: inv.currency?.code || "",
            amount: Number(inv.amount ?? 0),
            vatAmount: Number(inv.vatAmount ?? 0),
            totalAmount: Number(inv.totalAmount ?? 0),
            paidAmount: Number(inv.paidAmount ?? 0),
            outstandingAmount: Number(inv.outstandingAmount ?? 0),
            customer: {
              name: inv.customer?.name || "Customer",
              email: inv.customer?.email ?? null,
              phone: inv.customer?.phone ?? null,
              address: inv.customer?.address ?? null,
            },
            items: Array.isArray(inv.items) ? (inv.items as any[]) : null,
            letterhead,
          });
          const fileBase = safeInvoicePdfFileBaseName(inv.invoiceNumber || inv.id);
          if (customerEmail) {
            await EmailNotificationService.sendInvoiceToCustomer({
              customerName: inv.customer?.name || "Customer",
              customerEmail,
              invoiceNumber: inv.invoiceNumber || inv.id,
              invoiceDate: inv.transactionDate,
              totalAmount: Number(inv.totalAmount ?? 0),
              currencyCode: inv.currency?.code || "",
              dueDate: inv.dueDate ?? null,
              description: inv.description ?? null,
              pdfAttachment: { filename: `Invoice-${fileBase}.pdf`, content: pdf },
            });
          } else if (vendorEmail) {
            await EmailNotificationService.sendProcurementInvoiceToVendor({
              vendorName: inv.vendor?.name || "Vendor",
              vendorEmail,
              invoiceNumber: inv.invoiceNumber || inv.id,
              invoiceDate: inv.transactionDate,
              totalAmount: Number(inv.totalAmount ?? 0),
              currencyCode: inv.currency?.code || "",
              dueDate: inv.dueDate ?? null,
              poNumber: null,
              pdfAttachment: { filename: `Invoice-${fileBase}.pdf`, content: pdf },
            });
          }
        } else {
          console.warn(
            `[InvoiceService.sendInvoice] Skipping invoice email — invoice ${id} has no customer or vendor email on file`
          );
        }
      } catch (mailErr: any) {
        console.warn(`[InvoiceService.sendInvoice] Best-effort customer email failed for invoice ${id}:`, mailErr?.message || mailErr);
      }

      return (await this.attachEquivalent(afterSend ?? updatedInvoice)) as InvoiceWithRelations;
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
    const { paymentMethod = "BANK", paymentCurrencyId, paymentAmount, bankId, paymentExchangeRate } = params;
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: this.invoiceApiInclude()
      });

      if (!invoice) {
        throw new Error("Invoice not found");
      }

      if (invoice.status !== "SENT" && invoice.status !== "PARTIALLY_PAID") {
        throw new Error(
          `Cannot record payment for invoice with status: ${invoice.status}. Only SENT or PARTIALLY_PAID invoices accept payments.`
        );
      }

      const outstandingDec = new Decimal(invoice.outstandingAmount ?? invoice.totalAmount);
      if (outstandingDec.lte(0)) {
        throw new Error("Invoice has no outstanding balance to pay.");
      }

      const invCur = invoice.currency.code.toUpperCase();
      let paymentCurCode: string | null = null;
      if (paymentCurrencyId) {
        const pc = await prisma.currency.findUnique({ where: { id: paymentCurrencyId } });
        paymentCurCode = pc?.code?.toUpperCase() ?? null;
      }

      const rateAtPaid = await resolveUsdZwgAvgForSnapshot(prisma);
      const rateDecPaid =
        rateAtPaid != null && Number.isFinite(rateAtPaid) && rateAtPaid > 0
          ? new Decimal(rateAtPaid)
          : null;

      const before = invoice;
      let crossCurrencyPayment: Record<string, unknown> | undefined;

      const { local: localCurrency } = await this.getUsdLocalCurrencyLookup();
      const bookCurrencyCodeDefault = localCurrency?.code?.toUpperCase() ?? "ZWL";

      // --- USD invoice settled in ZAR via ZAR bank: USD → ZWL (creation) → ZAR (payment cross) ---
      if (
        paymentCurrencyId &&
        paymentCurrencyId !== invoice.currencyId &&
        invCur === "USD" &&
        paymentCurCode === "ZAR"
      ) {
        if (paymentAmount == null || !Number.isFinite(Number(paymentAmount)) || Number(paymentAmount) <= 0) {
          throw new Error("paymentAmount (ZAR received) is required when paying a USD invoice in ZAR");
        }
        if (!bankId) {
          throw new Error("bankId is required for ZAR settlement (must be a ZAR cashbook bank)");
        }
        if (!invoice.exchangeRateAtCreation) {
          throw new Error("Invoice is missing exchangeRateAtCreation; cannot value ZWL leg at creation");
        }

        const zarResult = await MultiCurrencyService.processUsdInvoicePaidWithZarBank({
          invoiceId: id,
          paymentAmountZar: Number(paymentAmount),
          bankId,
          createdById: invoice.createdById
        });
        crossCurrencyPayment = {
          path: "USD_ZWL_ZAR",
          ...zarResult.breakdown,
          forexGainLossId: zarResult.forexGainLoss?.id,
          paymentJournalEntryId: zarResult.journalEntryId
        };

        const b = zarResult.breakdown;
        const payZarNum = Number(b.paymentZar);
        const zarObNum = Number(b.zarObligationAtPayment);
        const glType: "GAIN" | "LOSS" = b.gainLossType === "LOSS" ? "LOSS" : "GAIN";
        const paymentSettlement: PaymentSettlementSummary = {
          path: "USD_ZWL_ZAR",
          convertedAmounts: {
            invoiceTotalInInvoiceCurrency: Number(b.invoiceTotalUsd),
            invoiceCurrencyCode: invCur,
            bookValueAtInvoiceCreation: Number(b.originalZwlAtCreation),
            bookCurrencyCode: bookCurrencyCodeDefault,
            paymentAmountInPaymentCurrency: payZarNum,
            paymentCurrencyCode: paymentCurCode!,
            paymentEquivalentInBookCurrency: Number(b.paymentZwlEquivalent),
            obligationInPaymentCurrency: zarObNum,
            exchangeRateAtCreation: Number(b.usdZwlAtCreation)
          },
          realizedGainLoss: zarResult.forexGainLoss
            ? {
                forexGainLossId: zarResult.forexGainLoss.id,
                gainLossType: glType,
                amountInBookCurrency: Math.abs(Number(b.gainLossZwl)),
                bookCurrencyCode: bookCurrencyCodeDefault,
                amountInPaymentCurrency: Math.abs(payZarNum - zarObNum),
                paymentCurrencyCode: paymentCurCode!,
                paymentJournalEntryId: zarResult.journalEntryId
              }
            : null
        };

        const updatedInvoice = await prisma.invoice.update({
          where: { id },
          data: {
            status: "PAID",
            paidAmount: new Decimal(invoice.totalAmount),
            outstandingAmount: new Decimal(0),
            paymentMethod,
            paymentCurrencyId,
            amountInPaymentCurrency: new Decimal(Number(paymentAmount)),
            paymentDate: new Date(),
            ...(rateDecPaid != null
              ? {
                  exchangeRateAtPaid: rateDecPaid,
                  usdZwgRateSnapshotPaid: rateDecPaid
                }
              : {}),
            ...this.paymentSnapshotsForDb(paymentSettlement, crossCurrencyPayment)
          },
          include: this.invoiceApiInclude()
        });

        await AuditService.log({
          userId: updatedInvoice.createdById,
          action: "MARK_AS_PAID",
          entityType: "Invoice",
          entityId: id,
          oldValues: before,
          newValues: updatedInvoice
        });

        return (await this.attachEquivalent(updatedInvoice)) as InvoiceWithRelations;
      }

      // --- USD invoice paid in ZWL/ZWG/ZIG (local): existing forex + journal path ---
      if (
        paymentCurrencyId &&
        paymentCurrencyId !== invoice.currencyId &&
        invCur === "USD" &&
        (paymentCurCode === "ZWL" || paymentCurCode === "ZWG" || paymentCurCode === "ZIG")
      ) {
        if (!invoice.exchangeRateAtCreation) {
          throw new Error("Exchange rate at creation is required for currency conversion");
        }
        const payZwl =
          paymentAmount != null && Number.isFinite(Number(paymentAmount)) && Number(paymentAmount) > 0
            ? Number(paymentAmount)
            : Number(invoice.totalAmount) * Number(invoice.exchangeRateAtCreation);

        const mc = await MultiCurrencyService.processMultiCurrencyPayment({
          invoiceId: id,
          paymentCurrencyId,
          paymentAmount: payZwl,
          exchangeRate:
            paymentExchangeRate != null &&
            Number.isFinite(Number(paymentExchangeRate)) &&
            Number(paymentExchangeRate) > 0
              ? Number(paymentExchangeRate)
              : undefined,
          createdById: invoice.createdById
        });

        crossCurrencyPayment = {
          path: "USD_ZWL",
          paymentZwlAmount: payZwl,
          forexGainLossId: mc.forexGainLoss?.id,
          paymentJournalEntryId: mc.journalEntryId
        };

        const originalZwlBook =
          Number(invoice.totalAmount) * Number(invoice.exchangeRateAtCreation);
        const fxGlType: "GAIN" | "LOSS" =
          mc.forexGainLoss?.gainLossType === "LOSS" ? "LOSS" : "GAIN";
        const paymentSettlement: PaymentSettlementSummary = {
          path: "USD_ZWL",
          convertedAmounts: {
            invoiceTotalInInvoiceCurrency: Number(invoice.totalAmount),
            invoiceCurrencyCode: invCur,
            bookValueAtInvoiceCreation: originalZwlBook,
            bookCurrencyCode: paymentCurCode!,
            paymentAmountInPaymentCurrency: payZwl,
            paymentCurrencyCode: paymentCurCode!,
            exchangeRateAtCreation: Number(invoice.exchangeRateAtCreation)
          },
          realizedGainLoss:
            mc.forexGainLoss != null
              ? {
                  forexGainLossId: mc.forexGainLoss.id,
                  gainLossType: fxGlType,
                  amountInBookCurrency: Number(mc.forexGainLoss.gainLossAmount),
                  bookCurrencyCode: paymentCurCode!,
                  paymentJournalEntryId: mc.journalEntryId
                }
              : null
        };

        const updatedInvoice = await prisma.invoice.update({
          where: { id },
          data: {
            status: "PAID",
            paidAmount: new Decimal(invoice.totalAmount),
            outstandingAmount: new Decimal(0),
            paymentMethod,
            paymentCurrencyId,
            amountInPaymentCurrency: new Decimal(payZwl),
            paymentDate: new Date(),
            ...(rateDecPaid != null
              ? {
                  exchangeRateAtPaid: rateDecPaid,
                  usdZwgRateSnapshotPaid: rateDecPaid
                }
              : {}),
            ...this.paymentSnapshotsForDb(paymentSettlement, crossCurrencyPayment)
          },
          include: this.invoiceApiInclude()
        });

        await AuditService.log({
          userId: updatedInvoice.createdById,
          action: "MARK_AS_PAID",
          entityType: "Invoice",
          entityId: id,
          oldValues: before,
          newValues: updatedInvoice
        });

        return (await this.attachEquivalent(updatedInvoice)) as InvoiceWithRelations;
      }

      // --- Same currency or legacy single-step conversion (non-ZAR) ---
      let amountInPaymentCurrency = Number(invoice.amount);
      let vatAmountInPaymentCurrency = Number(invoice.vatAmount);
      let totalAmountInPaymentCurrency = Number(invoice.totalAmount);
      let finalCurrencyId = invoice.currencyId;

      if (paymentCurrencyId && paymentCurrencyId !== invoice.currencyId) {
        if (!invoice.exchangeRateAtCreation) {
          throw new Error("Exchange rate at creation is required for currency conversion");
        }
        const exchangeRate = Number(invoice.exchangeRateAtCreation);
        amountInPaymentCurrency = Number(invoice.amount) * exchangeRate;
        vatAmountInPaymentCurrency = Number(invoice.vatAmount) * exchangeRate;
        totalAmountInPaymentCurrency = Number(invoice.totalAmount) * exchangeRate;
        finalCurrencyId = paymentCurrencyId;
      }

      const payCode = paymentCurCode ?? invCur;
      const crossLegacy = !!(paymentCurrencyId && paymentCurrencyId !== invoice.currencyId);

      const invTotalDec = new Decimal(invoice.totalAmount);
      const paidSoFarDec = new Decimal(invoice.paidAmount ?? 0);
      let paymentSettlementLegacy: PaymentSettlementSummary;

      if (!crossLegacy) {
        // Money received in the invoice's own currency is a cashbook receipt allocated to the invoice: this path posted a
        // second, unlinked "Dr bank / Cr receivables" journal with no cashbook line (receivables credited twice when a
        // receipt was also recorded, and the bank never reconcilable). Cross-currency settlements keep their own paths.
        throw Object.assign(new Error("Record the money received in the cashbook (a customer receipt) and allocate it to this invoice."), { statusCode: 409 });
        const outstandingNow = Decimal.min(outstandingDec, invTotalDec.minus(paidSoFarDec));
        if (outstandingNow.lte(0)) {
          throw new Error("Invoice has no outstanding balance to pay.");
        }
        let payTotalDec: Decimal;
        if (
          paymentAmount != null &&
          Number.isFinite(Number(paymentAmount)) &&
          Number(paymentAmount) > 0
        ) {
          payTotalDec = Decimal.min(new Decimal(paymentAmount), outstandingNow);
        } else {
          payTotalDec = outstandingNow;
        }
        if (payTotalDec.lte(0)) {
          throw new Error("Payment amount must be greater than zero.");
        }

        const ratio =
          invTotalDec.gt(0) ? payTotalDec.div(invTotalDec) : new Decimal(1);
        amountInPaymentCurrency = new Decimal(invoice.amount)
          .mul(ratio)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          .toNumber();
        vatAmountInPaymentCurrency = new Decimal(invoice.vatAmount)
          .mul(ratio)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          .toNumber();
        totalAmountInPaymentCurrency = payTotalDec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

        const newOutstanding = outstandingNow.minus(payTotalDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const newPaid = paidSoFarDec.plus(payTotalDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const fullySettled = newOutstanding.lte(new Decimal(0.005));

        paymentSettlementLegacy = {
          path: "SAME_CURRENCY",
          convertedAmounts: {
            invoiceTotalInInvoiceCurrency: Number(invoice.totalAmount),
            invoiceCurrencyCode: invCur,
            paymentAmountInPaymentCurrency: totalAmountInPaymentCurrency,
            paymentCurrencyCode: payCode
          },
          realizedGainLoss: null,
          ...(fullySettled
            ? {}
            : {
                partialPayment: {
                  amountPaidThisCall: totalAmountInPaymentCurrency,
                  outstandingAfter: Math.max(0, newOutstanding.toNumber()),
                  invoiceTotal: Number(invoice.totalAmount)
                },
                note: "Partial payment; invoice remains open until outstanding is cleared."
              })
        };

        await JournalEntryService.createInvoicePaymentJournalEntry({
          invoiceId: id,
          amount: amountInPaymentCurrency,
          vatAmount: vatAmountInPaymentCurrency,
          totalAmount: totalAmountInPaymentCurrency,
          currencyId: finalCurrencyId,
          transactionDate: new Date(),
          description: `Payment for invoice: ${invoice.invoiceNumber}`,
          paymentMethod,
          createdById: invoice.createdById,
          paymentBankId: bankId,
        });

        const updatedInvoice = await prisma.invoice.update({
          where: { id },
          data: {
            status: fullySettled ? "PAID" : "PARTIALLY_PAID",
            paidAmount: newPaid,
            outstandingAmount: fullySettled
              ? new Decimal(0)
              : Decimal.max(new Decimal(0), newOutstanding),
            paymentMethod,
            paymentCurrencyId: paymentCurrencyId || invoice.currencyId,
            amountInPaymentCurrency: null,
            paymentDate: new Date(),
            ...(rateDecPaid != null
              ? {
                  exchangeRateAtPaid: rateDecPaid,
                  usdZwgRateSnapshotPaid: rateDecPaid
                }
              : {}),
            ...this.paymentSnapshotsForDb(paymentSettlementLegacy, null)
          },
          include: this.invoiceApiInclude()
        });

        await AuditService.log({
          userId: updatedInvoice.createdById,
          action: "MARK_AS_PAID",
          entityType: "Invoice",
          entityId: id,
          oldValues: before,
          newValues: updatedInvoice
        });

        return (await this.attachEquivalent(updatedInvoice)) as InvoiceWithRelations;
      }

      paymentSettlementLegacy = {
        path: "LEGACY_INVOICE_RATE",
        convertedAmounts: {
          invoiceTotalInInvoiceCurrency: Number(invoice.totalAmount),
          invoiceCurrencyCode: invCur,
          paymentAmountInPaymentCurrency: totalAmountInPaymentCurrency,
          paymentCurrencyCode: payCode,
          ...(invoice.exchangeRateAtCreation != null
            ? { exchangeRateAtCreation: Number(invoice.exchangeRateAtCreation) }
            : {})
        },
        realizedGainLoss: null,
        note:
          "Converted using invoice exchangeRateAtCreation only; no separate forex gain/loss record for this path."
      };

      await JournalEntryService.createInvoicePaymentJournalEntry({
        invoiceId: id,
        amount: amountInPaymentCurrency,
        vatAmount: vatAmountInPaymentCurrency,
        totalAmount: totalAmountInPaymentCurrency,
        currencyId: finalCurrencyId,
        transactionDate: new Date(),
        description: `Payment for invoice: ${invoice.invoiceNumber}`,
        paymentMethod,
        createdById: invoice.createdById,
        paymentBankId: bankId,
      });

      const updatedInvoice = await prisma.invoice.update({
        where: { id },
        data: {
          status: "PAID",
          paidAmount: invTotalDec,
          outstandingAmount: new Decimal(0),
          paymentMethod,
          paymentCurrencyId: paymentCurrencyId || null,
          amountInPaymentCurrency:
            paymentCurrencyId && paymentCurrencyId !== invoice.currencyId
              ? new Decimal(amountInPaymentCurrency)
              : null,
          paymentDate: new Date(),
          ...(rateDecPaid != null
            ? {
                exchangeRateAtPaid: rateDecPaid,
                usdZwgRateSnapshotPaid: rateDecPaid
              }
            : {}),
          ...this.paymentSnapshotsForDb(paymentSettlementLegacy, null)
        },
        include: this.invoiceApiInclude()
      });

      await AuditService.log({
        userId: updatedInvoice.createdById,
        action: "MARK_AS_PAID",
        entityType: "Invoice",
        entityId: id,
        oldValues: before,
        newValues: updatedInvoice
      });

      return (await this.attachEquivalent(updatedInvoice)) as InvoiceWithRelations;
    } catch (error: any) {
      console.error("Error marking invoice as paid:", error);
      throw error; // Return the actual error instead of wrapping it
    }
  }

  /**
   * Void invoice (any status -> VOID)
   * Creates reversal journal entry to cancel the original invoice entry
   */
  static async voidInvoice(id: string, reason?: string, actorId?: string): Promise<InvoiceWithRelations> {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: this.invoiceApiInclude()
      });

      if (!invoice) {
        throw new Error("Invoice not found");
      }

      if (invoice.status === "VOID") {
        throw new Error("Invoice is already voided");
      }
      if (invoice.status === "PAID" || invoice.status === "PARTIALLY_PAID" || Number(invoice.paidAmount || 0) > 0.005) {
        throw new Error("Receipts are allocated to this invoice; undo those allocations (or issue a credit note) before voiding it.");
      }
      // its own journal is what gets undone: a draft's (never posted) is withdrawn, a sent one's is reversed — dated in
      // an open period (JournalEntryService.voidJournalEntry checks the lock)
      if (invoice.journalEntryId) {
        const je = await prisma.journalEntry.findUnique({ where: { id: invoice.journalEntryId }, select: { status: true } });
        if (je && je.status !== "VOID") await JournalEntryService.voidJournalEntry(invoice.journalEntryId, actorId || invoice.createdById, { reason: reason || "Invoice voided" });
        const updatedInvoice = await prisma.invoice.update({ where: { id }, data: { status: "VOID", outstandingAmount: new Decimal(0) }, include: this.invoiceApiInclude() });
        await AuditService.log({ userId: actorId || updatedInvoice.createdById, action: "VOID", entityType: "Invoice", entityId: id, oldValues: invoice, newValues: { ...updatedInvoice, voidReason: reason || null } });
        return (await this.attachEquivalent(updatedInvoice)) as InvoiceWithRelations;
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
        include: this.invoiceApiInclude()
      });

      // Audit: VOID invoice
      await AuditService.log({
        userId: updatedInvoice.createdById,
        action: "VOID",
        entityType: "Invoice",
        entityId: id,
        oldValues: invoice,
        newValues: updatedInvoice,
      });

      return (await this.attachEquivalent(updatedInvoice)) as InvoiceWithRelations;
    } catch (error: any) {
      throw new Error(`Failed to void invoice: ${error.message}`);
    }
  }
} 