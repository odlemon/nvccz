// @ts-nocheck
import { Request, Response } from 'express';
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";
import { ResponseHelper } from "../utils/responseHelper";
import { logger } from "../utils/logger";

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

const vendorTransactionsInclude = {
  procurementInvoices: {
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      totalAmount: true,
      subtotal: true,
      taxAmount: true,
      status: true,
      paymentStatus: true,
      dueDate: true,
      currency: {
        select: {
          code: true
        }
      },
      journalEntry: {
        select: {
          id: true,
          referenceNumber: true,
          status: true
        }
      }
    },
    orderBy: {
      invoiceDate: "desc"
    }
  },
  purchaseOrders: {
    select: {
      id: true,
      poNumber: true,
      orderDate: true,
      totalAmount: true,
      status: true,
      currency: {
        select: {
          code: true
        }
      }
    },
    orderBy: {
      orderDate: "desc"
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
          status: true
        }
      }
    },
    orderBy: {
      transactionDate: "desc"
    }
  }
};

const formatVendorWithTransactions = (vendor: any) => {
  if (!vendor) return null;
  const {
    procurementInvoices = [],
    purchaseOrders = [],
    cashbookEntries = [],
    ...rest
  } = vendor;

  const invoiceTransactions = procurementInvoices.map((invoice: any) => ({
    id: invoice.id,
    source: "PROCUREMENT_INVOICE",
    type: "INVOICE",
    reference: invoice.invoiceNumber,
    description: `Vendor Invoice ${invoice.invoiceNumber}`,
    date: invoice.invoiceDate,
    amount: decimalToNumber(invoice.totalAmount),
    subtotal: decimalToNumber(invoice.subtotal),
    taxAmount: decimalToNumber(invoice.taxAmount),
    status: invoice.status,
    paymentStatus: invoice.paymentStatus,
    dueDate: invoice.dueDate,
    currency: invoice.currency?.code || null,
    journalEntry: invoice.journalEntry
      ? {
          id: invoice.journalEntry.id,
          referenceNumber: invoice.journalEntry.referenceNumber,
          status: invoice.journalEntry.status
        }
      : null
  }));

  const purchaseOrderTransactions = purchaseOrders.map((po: any) => ({
    id: po.id,
    source: "PURCHASE_ORDER",
    type: "PURCHASE_ORDER",
    reference: po.poNumber,
    description: `Purchase Order ${po.poNumber}`,
    date: po.orderDate,
    amount: decimalToNumber(po.totalAmount),
    status: po.status,
    currency: po.currency?.code || null
  }));

  const cashbookTransactions = cashbookEntries.map((entry: any) => {
    const amount = decimalToNumber(entry.amount);
    const direction = entry.type === "PAYMENT" ? "OUT" : "IN";
    return {
      id: entry.id,
      source: "CASHBOOK",
      type: entry.type,
      reference: entry.reference,
      description: entry.description,
      date: entry.transactionDate,
      amount: direction === "OUT" ? amount * -1 : amount,
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
        : null
    };
  });

  const transactions = [
    ...invoiceTransactions,
    ...purchaseOrderTransactions,
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
    purchaseOrderCount: purchaseOrderTransactions.length,
    purchaseOrderTotal: purchaseOrderTransactions.reduce(
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

export class CashbookVendorController {
  
  /**
   * Get vendors for cashbook with transaction data
   * Same response as accounting vendors but with cashbook-specific naming and transactions
   */
  static async getVendors(req: Request, res: Response): Promise<void> {
    try {
      const vendors = await prisma.vendor.findMany({
        where: { isActive: true },
        include: vendorTransactionsInclude,
        orderBy: { name: 'asc' }
      });

      const vendorsWithTransactions = vendors.map((vendor: any) =>
        formatVendorWithTransactions(vendor)
      );

      return ResponseHelper.success(res, 'Vendors retrieved successfully', vendorsWithTransactions);
    } catch (error: any) {
      logger.error('Error in CashbookVendorController.getVendors:', error);
      return ResponseHelper.error(res, 'Failed to get vendors', error.message);
    }
  }

  /**
   * Get vendor by ID for cashbook with transaction data
   * Same response as accounting vendors but with cashbook-specific naming and transactions
   */
  static async getVendorById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        return ResponseHelper.badRequest(res, 'Vendor ID is required');
      }

      const vendor = await prisma.vendor.findUnique({
        where: { id },
        include: vendorTransactionsInclude
      });

      if (!vendor) {
        return ResponseHelper.notFound(res, 'Vendor not found');
      }

      const formattedVendor = formatVendorWithTransactions(vendor);

      return ResponseHelper.success(res, 'Vendor details retrieved successfully', formattedVendor);
    } catch (error: any) {
      logger.error('Error in CashbookVendorController.getVendorById:', error);
      return ResponseHelper.error(res, 'Failed to get vendor details', error.message);
    }
  }
}
