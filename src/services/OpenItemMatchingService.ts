// @ts-nocheck
import { PrismaClient, Decimal } from '@prisma/client';
import { dbConnection } from '../utils/database';

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
      const prisma = dbConnection.getPrismaClient();
      
      // Get customer invoices that are not fully paid
      const openItems = await prisma.invoice.findMany({
        where: {
          customerId: customerId,
          status: {
            in: ['DRAFT', 'SENT', 'PARTIALLY_PAID']
          }
        },
        include: {
          customer: true,
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
            customerId: invoice.customerId,
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
        message: `Found ${openItemsOnly.length} open invoices for customer`
      };
      
    } catch (error: any) {
      console.error('❌ Error getting customer open items:', error.message);
      return { success: false, message: `Failed to get open items: ${error.message}` };
    }
  }
  
  /**
   * Get open invoices for a supplier
   */
  static async getSupplierOpenItems(supplierId: string): Promise<{ success: boolean; data?: OpenItem[]; message: string }> {
    try {
      const prisma = dbConnection.getPrismaClient();
      
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
      const prisma = dbConnection.getPrismaClient();
      
      // Get the payment
      const payment = await prisma.cashbookEntry.findUnique({
        where: { id: paymentId },
        include: {
          bank: true,
          customer: true,
          vendor: true
        }
      });
      
      if (!payment) {
        return { success: false, message: 'Payment not found' };
      }
      
      if (payment.status !== 'POSTED') {
        return { success: false, message: 'Payment must be posted before matching' };
      }
      
      // Validate allocations
      const totalAllocated = allocations.reduce((sum, alloc) => 
        sum + Number(alloc.allocatedAmount), 0
      );
      
      if (totalAllocated > Number(payment.amount)) {
        return { success: false, message: 'Total allocated amount exceeds payment amount' };
      }
      
      // Process each allocation
      const processedAllocations = [];
      
      for (const allocation of allocations) {
        // Get the open item (invoice)
        const invoice = await prisma.invoice.findUnique({
          where: { id: allocation.openItemId }
        });
        
        if (!invoice) {
          return { success: false, message: `Invoice not found: ${allocation.openItemId}` };
        }
        
        // Check if allocation amount is valid
        if (allocation.allocatedAmount <= 0) {
          continue; // Skip zero or negative allocations
        }
        
        // Create payment allocation record
        const paymentAllocation = await prisma.paymentAllocation.create({
          data: {
            cashbookEntryId: paymentId,
            invoiceId: allocation.openItemId,
            allocatedAmount: new Decimal(allocation.allocatedAmount),
            discountAmount: new Decimal(allocation.discountAmount || 0),
            notes: allocation.description || `Payment allocation for ${invoice.invoiceNumber}`,
            createdById: userId
          }
        });
        
        processedAllocations.push({
          openItemId: allocation.openItemId,
          allocatedAmount: allocation.allocatedAmount,
          discountAmount: allocation.discountAmount,
          description: allocation.description
        });
        
        // Update invoice status if fully paid
        const totalAllocatedToInvoice = await prisma.paymentAllocation.aggregate({
          where: { invoiceId: allocation.openItemId },
          _sum: { allocatedAmount: true }
        });
        
        const totalAllocatedAmount = totalAllocatedToInvoice._sum.allocatedAmount || new Decimal(0);
        
        if (totalAllocatedAmount.gte(invoice.totalAmount)) {
          await prisma.invoice.update({
            where: { id: allocation.openItemId },
            data: { status: 'PAID' }
          });
        } else if (totalAllocatedAmount.gt(0)) {
          await prisma.invoice.update({
            where: { id: allocation.openItemId },
            data: { status: 'PARTIALLY_PAID' }
          });
        }
      }
      
      const remainingAmount = payment.amount.sub(totalAllocated);
      
      console.log(`✅ Payment matched: ${paymentId} - ${processedAllocations.length} allocations`);
      
      return {
        success: true,
        message: 'Payment successfully matched to invoices',
        data: {
          paymentId: paymentId,
          allocations: processedAllocations,
          totalAllocated: totalAllocated,
          remainingAmount: remainingAmount
        }
      };
      
    } catch (error: any) {
      console.error('❌ Error matching payment to invoices:', error.message);
      return { success: false, message: `Failed to match payment: ${error.message}` };
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
      const prisma = dbConnection.getPrismaClient();
      
      // Delete payment allocations
      await prisma.paymentAllocation.deleteMany({
        where: {
          id: { in: allocationIds },
          cashbookEntryId: paymentId
        }
      });
      
      // Update invoice statuses back to their previous state
      const affectedInvoices = await prisma.paymentAllocation.findMany({
        where: { cashbookEntryId: paymentId },
        select: { invoiceId: true }
      });
      
      for (const allocation of affectedInvoices) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: allocation.invoiceId }
        });
        
        if (invoice) {
          // Calculate remaining allocated amount
          const remainingAllocated = await prisma.paymentAllocation.aggregate({
            where: { invoiceId: allocation.invoiceId },
            _sum: { allocatedAmount: true }
          });
          
          const totalAllocated = remainingAllocated._sum.allocatedAmount || new Decimal(0);
          
          if (totalAllocated.gte(invoice.totalAmount)) {
            await prisma.invoice.update({
              where: { id: allocation.invoiceId },
              data: { status: 'PAID' }
            });
          } else if (totalAllocated.gt(0)) {
            await prisma.invoice.update({
              where: { id: allocation.invoiceId },
              data: { status: 'PARTIALLY_PAID' }
            });
          } else {
            await prisma.invoice.update({
              where: { id: allocation.invoiceId },
              data: { status: 'SENT' }
            });
          }
        }
      }
      
      console.log(`✅ Payment unmatched: ${paymentId} - ${allocationIds.length} allocations removed`);
      
      return {
        success: true,
        message: 'Payment successfully unmatched from invoices'
      };
      
    } catch (error: any) {
      console.error('❌ Error unmatching payment from invoices:', error.message);
      return { success: false, message: `Failed to unmatch payment: ${error.message}` };
    }
  }
  
  /**
   * Get payment allocations for a payment
   */
  static async getPaymentAllocations(paymentId: string): Promise<{ success: boolean; data?: any[]; message: string }> {
    try {
      const prisma = dbConnection.getPrismaClient();
      
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
      const prisma = dbConnection.getPrismaClient();
      
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
