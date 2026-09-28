// @ts-nocheck
import { PrismaClient, Decimal } from '@prisma/client';
import { prisma } from '../utils/database';

export interface OpenItem {
  id: string;
  customerId?: string;
  supplierId?: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  originalAmount: Decimal;
  outstandingAmount: Decimal;
  currency: string;
  description: string;
  status: 'OPEN' | 'PARTIALLY_PAID' | 'FULLY_PAID' | 'OVERDUE';
}

export interface PaymentAllocation {
  openItemId: string;
  allocatedAmount: Decimal;
  discountAmount?: Decimal;
  description?: string;
}

export interface MatchingResult {
  success: boolean;
  message: string;
  data?: {
    paymentId: string;
    allocations: PaymentAllocation[];
    totalAllocated: Decimal;
    remainingAmount: Decimal;
  };
}

export class OpenItemMatchingService {
  
  /**
   * Get open invoices for a customer
   */
  static async getCustomerOpenItems(customerId: string): Promise<{ success: boolean; data?: OpenItem[]; message: string }> {
    try {
      // invoices the customer owes: sent (posted) and not fully paid; a draft is not a receivable yet
      const invoices = await prisma.invoice.findMany({
        where: { customerId, isActive: true, status: { in: ['SENT', 'PARTIALLY_PAID'] }, outstandingAmount: { gt: 0 } },
        include: { currency: true },
        orderBy: [{ dueDate: 'asc' }, { transactionDate: 'asc' }],
      });
      const now = new Date();
      const data = invoices.map((inv) => ({
        id: inv.id,
        customerId: inv.customerId,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.transactionDate,
        dueDate: inv.dueDate,
        originalAmount: inv.totalAmount,
        outstandingAmount: inv.outstandingAmount,
        currency: inv.currency?.code || null,
        currencyId: inv.currencyId,
        description: inv.description || `Invoice ${inv.invoiceNumber}`,
        status: (inv.dueDate && inv.dueDate < now ? 'OVERDUE' : 'OPEN') as any,
      }));
      return { success: true, data, message: `Found ${data.length} open invoice(s)` };
    } catch (error: any) {
      return { success: false, message: `Failed to get open items: ${error.message}` };
    }
  }
  
  /**
   * Get open invoices for a supplier
   */
  static async getSupplierOpenItems(supplierId: string): Promise<{ success: boolean; data?: OpenItem[]; message: string }> {
    try {
      
      // Get supplier invoices that are not fully paid
      const openItems = await prisma.invoice.findMany({
        where: {
          vendorId: supplierId,
          status: {
            in: ['DRAFT', 'SENT', 'PARTIALLY_PAID']
          }
        },
        include: {
          vendor: true,
          currency: true,
          allocations: {
            include: {
              cashbookEntry: true
            }
          }
        },
        orderBy: {
          dueDate: 'asc'
        }
      });
      
      // Calculate outstanding amounts
      const openItemsWithOutstanding = await Promise.all(
        openItems.map(async (invoice) => {
          // Calculate total allocated amount from payment allocations
          const totalAllocated = invoice.allocations.reduce((sum, allocation) => 
            sum.add(allocation.allocatedAmount), new Decimal(0)
          );
          
          const outstandingAmount = invoice.totalAmount.sub(totalAllocated);
          
          return {
            id: invoice.id,
            supplierId: invoice.vendorId,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            dueDate: invoice.dueDate,
            originalAmount: invoice.totalAmount,
            outstandingAmount: outstandingAmount,
            currency: invoice.currency?.code || 'USD',
            description: `Invoice ${invoice.invoiceNumber}`,
            status: outstandingAmount.gt(0) ? 
              (invoice.dueDate < new Date() ? 'OVERDUE' : 'OPEN') : 
              'FULLY_PAID'
          };
        })
      );
      
      // Filter out fully paid invoices
      const openItemsOnly = openItemsWithOutstanding.filter(item => 
        item.outstandingAmount.gt(0)
      );
      
      return {
        success: true,
        data: openItemsOnly,
        message: `Found ${openItemsOnly.length} open invoices for supplier`
      };
      
    } catch (error: any) {
      console.error('❌ Error getting supplier open items:', error.message);
      return { success: false, message: `Failed to get open items: ${error.message}` };
    }
  }
  
  /**
   * Match payment to specific invoices
   */
  static async matchPaymentToInvoices(
    paymentId: string,
    allocations: PaymentAllocation[],
    userId: string
  ): Promise<MatchingResult> {
    try {
      const payment = await prisma.cashbookEntry.findUnique({ where: { id: paymentId }, include: { bank: true } });
      if (!payment) return { success: false, message: 'Receipt not found' };
      if (payment.status !== 'POSTED' && payment.status !== 'PENDING') return { success: false, message: 'Only a posted receipt can be allocated.' };
      if (payment.type !== 'RECEIPT' || payment.counterpartyType !== 'CUSTOMER' || !payment.customerId) return { success: false, message: 'Only a customer receipt is allocated to customer invoices.' };
      const lines = (allocations || []).filter((a) => Number(a.allocatedAmount) > 0);
      if (!lines.length) return { success: false, message: 'Give an amount to allocate.' };
      const already = await prisma.paymentAllocation.aggregate({ where: { cashbookEntryId: paymentId }, _sum: { allocatedAmount: true } });
      const alreadyAllocated = Number(already._sum.allocatedAmount || 0);
      const asked = lines.reduce((t, a) => t + Number(a.allocatedAmount), 0);
      if (alreadyAllocated + asked > Number(payment.amount) + 0.005) {
        return { success: false, message: `The receipt is ${Number(payment.amount).toFixed(2)}; ${alreadyAllocated.toFixed(2)} is already allocated, so at most ${(Number(payment.amount) - alreadyAllocated).toFixed(2)} can be.` };
      }
      const bankCurrencyId = payment.bank?.currencyId || null;
      const processed = [];
      await prisma.$transaction(async (tx) => {
        for (const a of lines) {
          const inv = await tx.invoice.findUnique({ where: { id: a.openItemId } });
          if (!inv || !inv.isActive) throw new Error(`Invoice not found: ${a.openItemId}`);
          if (inv.customerId !== payment.customerId) throw new Error(`${inv.invoiceNumber} is another customer's invoice.`);
          if (inv.status !== 'SENT' && inv.status !== 'PARTIALLY_PAID') throw new Error(`${inv.invoiceNumber} is ${String(inv.status).toLowerCase()}; only a sent, unpaid invoice takes a receipt.`);
          if (bankCurrencyId && inv.currencyId !== bankCurrencyId) throw new Error(`${inv.invoiceNumber} is in another currency than the receipt.`);
          const amt = Number(a.allocatedAmount);
          const outstanding = Number(inv.outstandingAmount);
          if (amt > outstanding + 0.005) throw new Error(`${inv.invoiceNumber} has ${outstanding.toFixed(2)} outstanding; ${amt.toFixed(2)} is more than that.`);
          await tx.paymentAllocation.create({ data: { cashbookEntryId: paymentId, invoiceId: inv.id, allocatedAmount: new Decimal(amt), discountAmount: new Decimal(a.discountAmount || 0), notes: a.description || `Receipt allocated to ${inv.invoiceNumber}`, createdById: userId } });
          const left = Math.round((outstanding - amt) * 100) / 100;
          await tx.invoice.update({ where: { id: inv.id }, data: { paidAmount: { increment: new Decimal(amt) }, outstandingAmount: new Decimal(left), status: left <= 0.005 ? 'PAID' : 'PARTIALLY_PAID', ...(left <= 0.005 ? { paymentDate: payment.transactionDate } : {}) } });
          processed.push({ openItemId: inv.id, allocatedAmount: amt, discountAmount: a.discountAmount, description: a.description });
        }
      });
      return { success: true, message: 'Receipt allocated', data: { paymentId, allocations: processed as any, totalAllocated: asked as any, remainingAmount: (Number(payment.amount) - alreadyAllocated - asked) as any } };
    } catch (error: any) {
      return { success: false, message: error.message || 'Failed to allocate the receipt' };
    }
  }
  
  /**
   * Unmatch payment from invoices
   */
  static async unmatchPaymentFromInvoices(
    paymentId: string,
    allocationIds: string[],
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const rows = await prisma.paymentAllocation.findMany({ where: { id: { in: allocationIds || [] }, cashbookEntryId: paymentId } });
      if (!rows.length) return { success: false, message: 'No such allocation on this receipt.' };
      await prisma.$transaction(async (tx) => {
        for (const r of rows) {
          const inv = await tx.invoice.findUnique({ where: { id: r.invoiceId } });
          await tx.paymentAllocation.delete({ where: { id: r.id } });
          if (!inv) continue;
          const paid = Math.max(0, Number(inv.paidAmount) - Number(r.allocatedAmount));
          const outstanding = Math.round((Number(inv.outstandingAmount) + Number(r.allocatedAmount)) * 100) / 100;
          await tx.invoice.update({ where: { id: inv.id }, data: { paidAmount: new Decimal(paid), outstandingAmount: new Decimal(outstanding), status: paid > 0.005 ? 'PARTIALLY_PAID' : 'SENT', paymentDate: null } });
        }
      });
      return { success: true, message: `${rows.length} allocation(s) undone` };
    } catch (error: any) {
      return { success: false, message: error.message || 'Failed to undo the allocation' };
    }
  }
  
  /**
   * Get payment allocations for a payment
   */
  static async getPaymentAllocations(paymentId: string): Promise<{ success: boolean; data?: any[]; message: string }> {
    try {
      
      const allocations = await prisma.paymentAllocation.findMany({
        where: { cashbookEntryId: paymentId },
        include: {
          invoice: {
            include: {
              customer: true,
              vendor: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      return {
        success: true,
        data: allocations,
        message: `Found ${allocations.length} payment allocations`
      };
      
    } catch (error: any) {
      console.error('❌ Error getting payment allocations:', error.message);
      return { success: false, message: `Failed to get payment allocations: ${error.message}` };
    }
  }
  
  /**
   * Get open item matching summary
   */
  static async getMatchingSummary(customerId?: string, supplierId?: string): Promise<{ success: boolean; data?: any; message: string }> {
    try {
      
      let whereClause: any = {};
      
      if (customerId) {
        whereClause.customerId = customerId;
      } else if (supplierId) {
        whereClause.vendorId = supplierId;
      }
      
      // Get open invoices
      const openInvoices = await prisma.invoice.findMany({
        where: {
          ...whereClause,
          status: {
            in: ['SENT', 'PARTIALLY_PAID']
          }
        },
        include: {
          customer: true,
          vendor: true,
          currency: true
        }
      });
      
      // Calculate totals
      const totalOutstanding = openInvoices.reduce((sum, invoice) => 
        sum.add(invoice.totalAmount), new Decimal(0)
      );
      
      const overdueCount = openInvoices.filter(invoice => 
        invoice.dueDate < new Date()
      ).length;
      
      const overdueAmount = openInvoices
        .filter(invoice => invoice.dueDate < new Date())
        .reduce((sum, invoice) => sum.add(invoice.totalAmount), new Decimal(0));
      
      return {
        success: true,
        data: {
          totalOpenInvoices: openInvoices.length,
          totalOutstanding: totalOutstanding,
          overdueCount: overdueCount,
          overdueAmount: overdueAmount,
          currency: openInvoices[0]?.currency?.code || 'USD'
        },
        message: 'Matching summary retrieved successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error getting matching summary:', error.message);
      return { success: false, message: `Failed to get matching summary: ${error.message}` };
    }
  }
}
