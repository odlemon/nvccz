// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import {
  prismaCashbookEntrySnapshotSelect,
  prismaCreditNoteSnapshotSelect,
  prismaInvoiceSnapshotSelect,
  prismaJournalEntryRateSelect
} from "../config/accountingSnapshotResponseSelect";
import { ResponseHelper } from "../utils/responseHelper";
import { logger } from "../utils/logger";
import { VcCacSyncService } from "../services/VcCacSyncService";

const decimalToNumber = (value: any) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value);
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && typeof value?.toNumber === "function") {
    return value.toNumber();
  }
  return Number(value);
};

const customerTransactionsInclude = {
  invoices: {
    select: {
      id: true,
      invoiceNumber: true,
      description: true,
      transactionDate: true,
      totalAmount: true,
      outstandingAmount: true,
      status: true,
      ...prismaInvoiceSnapshotSelect,
      currency: {
        select: {
          code: true
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
    },
    orderBy: {
      transactionDate: "desc"
    }
  },
  creditNotes: {
    select: {
      id: true,
      creditNoteNumber: true,
      reason: true,
      totalAmount: true,
      status: true,
      createdAt: true,
      ...prismaCreditNoteSnapshotSelect,
      currency: {
        select: {
          code: true
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
    },
    orderBy: {
      createdAt: "desc"
    }
  },
  cashbookEntries: {
    select: {
      id: true,
      transactionDate: true,
      description: true,
      reference: true,
      amount: true,
      type: true,
      status: true,
      counterpartyType: true,
      ...prismaCashbookEntrySnapshotSelect,
      bank: {
        select: {
          id: true,
          name: true,
          accountNumber: true
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
    },
    orderBy: {
      transactionDate: "desc"
    }
  }
};

const formatCustomerWithTransactions = (customer: any) => {
  if (!customer) return null;
  const {
    invoices = [],
    creditNotes = [],
    cashbookEntries = [],
    ...rest
  } = customer;

  const invoiceTransactions = invoices.map((invoice: any) => ({
    id: invoice.id,
    source: "INVOICE",
    type: "INVOICE",
    reference: invoice.invoiceNumber,
    description: invoice.description,
    date: invoice.transactionDate,
    amount: decimalToNumber(invoice.totalAmount),
    balance: decimalToNumber(invoice.outstandingAmount),
    status: invoice.status,
    currency: invoice.currency?.code || null,
    journalEntry: invoice.journalEntry
      ? {
          id: invoice.journalEntry.id,
          referenceNumber: invoice.journalEntry.referenceNumber,
          status: invoice.journalEntry.status
        }
      : null
  }));

  const creditNoteTransactions = creditNotes.map((credit: any) => ({
    id: credit.id,
    source: "CREDIT_NOTE",
    type: "CREDIT_NOTE",
    reference: credit.creditNoteNumber,
    description: credit.reason,
    date: credit.createdAt,
    amount: decimalToNumber(credit.totalAmount) * -1,
    status: credit.status,
    currency: credit.currency?.code || null,
    journalEntry: credit.journalEntry
      ? {
          id: credit.journalEntry.id,
          referenceNumber: credit.journalEntry.referenceNumber,
          status: credit.journalEntry.status
        }
      : null
  }));

  const cashbookTransactions = cashbookEntries.map((entry: any) => {
    const amount = decimalToNumber(entry.amount);
    const direction = entry.type === "RECEIPT" ? "IN" : "OUT";
    return {
      id: entry.id,
      source: "CASHBOOK",
      type: entry.type,
      reference: entry.reference,
      description: entry.description,
      date: entry.transactionDate,
      amount: direction === "IN" ? amount : amount * -1,
      direction,
      status: entry.status,
      counterpartyType: entry.counterpartyType,
      bank: entry.bank
        ? {
            id: entry.bank.id,
            name: entry.bank.name,
            accountNumber: entry.bank.accountNumber
          }
        : null,
      journalEntry: entry.journalEntry
        ? {
            id: entry.journalEntry.id,
            referenceNumber: entry.journalEntry.referenceNumber,
            status: entry.journalEntry.status
          }
        : null,
      receiptAttachmentUrl: entry.receiptAttachmentUrl,
      receiptAttachmentPath: entry.receiptAttachmentPath,
      receiptAttachmentFileName: entry.receiptAttachmentFileName,
      receiptAttachmentMimeType: entry.receiptAttachmentMimeType
    };
  });

  const transactions = [
    ...invoiceTransactions,
    ...creditNoteTransactions,
    ...cashbookTransactions
  ].sort(
    (a, b) =>
      new Date(b.date as any).getTime() - new Date(a.date as any).getTime()
  );

  const summary = {
    invoiceCount: invoiceTransactions.length,
    invoiceTotal: invoiceTransactions.reduce(
      (sum, tx) => sum + decimalToNumber(tx.amount),
      0
    ),
    creditNoteCount: creditNoteTransactions.length,
    creditNoteTotal: creditNoteTransactions.reduce(
      (sum, tx) => sum + decimalToNumber(tx.amount),
      0
    ),
    cashbookCount: cashbookTransactions.length,
    cashbookInTotal: cashbookTransactions
      .filter((tx: any) => tx.direction === "IN")
      .reduce((sum: number, tx: any) => sum + decimalToNumber(tx.amount), 0),
    cashbookOutTotal: cashbookTransactions
      .filter((tx: any) => tx.direction === "OUT")
      .reduce((sum: number, tx: any) => sum + Math.abs(decimalToNumber(tx.amount)), 0)
  };

  return {
    ...rest,
    transactions,
    summary
  };
};

export class CustomerController {
  /**
   * Create a new customer
   */
  static async createCustomer(req: Request, res: Response): Promise<void> {
    try {
      const {
        name,
        taxNumber,
        contactPerson,
        email,
        phone,
        address,
        paymentTerms
      } = req.body;

      // Validate required fields
      if (!name) {
        ResponseHelper.error(res, "Customer name is required", undefined, 400);
        return;
      }

      const customer = await prisma.customer.create({
        data: {
          name,
          taxNumber,
          contactPerson,
          email,
          phone,
          address,
          paymentTerms
        }
      });

      logger.info("Customer created successfully", {
        customerId: customer.id,
        name: customer.name
      });

      await VcCacSyncService.recomputeAndPersist({ source: "customers" }).catch((err: any) => {
        logger.error("VcCacSyncService.recomputeAndPersist failed after customer create", {
          error: err?.message
        });
      });

      ResponseHelper.success(res, "Customer created successfully", customer, 201);
    } catch (error: any) {
      logger.error("Error creating customer", { error: error.message });
      ResponseHelper.error(res, `Failed to create customer: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get customer by ID
   */
  static async getCustomerById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        ResponseHelper.error(res, "Customer ID is required", undefined, 400);
        return;
      }

      const customer = await prisma.customer.findUnique({
        where: { id },
        include: customerTransactionsInclude
      });

      if (!customer) {
        ResponseHelper.error(res, "Customer not found", undefined, 404);
        return;
      }

      const formattedCustomer = formatCustomerWithTransactions(customer);

      ResponseHelper.success(
        res,
        "Customer retrieved successfully",
        formattedCustomer
      );
    } catch (error: any) {
      logger.error("Error getting customer", { error: error.message });
      ResponseHelper.error(res, `Failed to get customer: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get customers with filtering and pagination
   */
  static async getCustomers(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 10,
        search
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      // Build where clause
      const where: any = { isActive: true };
      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { contactPerson: { contains: search as string, mode: "insensitive" } },
          { email: { contains: search as string, mode: "insensitive" } }
        ];
      }

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { name: 'asc' },
          include: customerTransactionsInclude
        }),
        prisma.customer.count({ where })
      ]);

      const customersWithTransactions = customers.map((customer: any) =>
        formatCustomerWithTransactions(customer)
      );

      const result = {
        customers: customersWithTransactions,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      };

      ResponseHelper.success(res, "Customers retrieved successfully", result);
    } catch (error: any) {
      logger.error("Error getting customers", { error: error.message });
      ResponseHelper.error(res, `Failed to get customers: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Update a customer
   */
  static async updateCustomer(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;

      if (!id) {
        ResponseHelper.error(res, "Customer ID is required", undefined, 400);
        return;
      }

      const updatedCustomer = await prisma.customer.update({
        where: { id },
        data: updateData
      });

      logger.info("Customer updated successfully", {
        customerId: id
      });

      ResponseHelper.success(res, "Customer updated successfully", updatedCustomer);
    } catch (error: any) {
      logger.error("Error updating customer", { error: error.message });
      ResponseHelper.error(res, `Failed to update customer: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Delete a customer (soft delete)
   */
  static async deleteCustomer(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        ResponseHelper.error(res, "Customer ID is required", undefined, 400);
        return;
      }

      await prisma.customer.update({
        where: { id },
        data: { isActive: false }
      });

      logger.info("Customer deleted successfully", {
        customerId: id
      });

      ResponseHelper.success(res, "Customer deleted successfully");
    } catch (error: any) {
      logger.error("Error deleting customer", { error: error.message });
      ResponseHelper.error(res, `Failed to delete customer: ${error.message}`, undefined, 500);
    }
  }
} 