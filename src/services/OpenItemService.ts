// @ts-nocheck
// Open Item Service
// Handles Open Item matching for customer receipts and supplier payments

import { PrismaClient, Decimal } from '@prisma/client';
import { dbConnection } from '../utils/database';

const prisma = dbConnection.getPrismaClient();

export interface OpenItemInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: string;
  customerId?: string;
  vendorId?: string;
  currency: string;
}

export interface PaymentAllocation {
  id: string;
  cashbookEntryId: string;
  invoiceId: string;
  allocatedAmount: number;
  discountAmount: number;
  notes?: string;
}

export interface OpenItemAging {
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  total: number;
}

export class OpenItemService {
  
  /**
   * Get customer invoices for Open Item matching
   */
  static async getCustomerInvoices(customerId: string): Promise<OpenItemInvoice[]> {
    try {
      console.log(`📋 Getting customer invoices for Open Item matching: ${customerId}`);
      
      const invoices = await prisma.invoice.findMany({
        where: {
          customerId,
          status: 'OPEN', // Only open invoices
          isActive: true
        },
        include: {
          currency: true
        },
        orderBy: { invoiceDate: 'asc' }
      });
      
      const openItemInvoices = invoices.map(invoice => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber || `INV-${invoice.id.substring(0, 8)}`,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        totalAmount: Number(invoice.totalAmount),
        paidAmount: Number(invoice.paidAmount || 0),
        outstandingAmount: Number(invoice.outstandingAmount || invoice.totalAmount),
        status: invoice.status,
        customerId: invoice.customerId,
        currency: invoice.currency.code
      }));
      
      console.log(`✅ Found ${openItemInvoices.length} open customer invoices`);
      return openItemInvoices;
      
    } catch (error: any) {
      console.error('❌ Error getting customer invoices:', error.message);
      return [];
    }
  }
  
  /**
   * Get vendor invoices for Open Item matching
   */
  static async getVendorInvoices(vendorId: string): Promise<OpenItemInvoice[]> {
    try {
      console.log(`📋 Getting vendor invoices for Open Item matching: ${vendorId}`);
      
      // Note: Your existing Invoice model doesn't have vendorId field
      // This would need to be added to the schema or we need a different approach
      console.log('⚠️ Note: Invoice model needs vendorId field for supplier invoices');
      
      // For now, return empty array until schema is updated
      return [];
      
    } catch (error: any) {
      console.error('❌ Error getting vendor invoices:', error.message);
      return [];
    }
  }
  
  /**
   * Allocate payment to invoices
   */
  static async allocatePaymentToInvoices(
    cashbookEntryId: string, 
    allocations: {
      invoiceId: string;
      allocatedAmount: number;
      discountAmount?: number;
      notes?: string;
    }[],
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`💰 Allocating payment to invoices for cashbook entry: ${cashbookEntryId}`);
      
      // Validate cashbook entry exists
      const cashbookEntry = await prisma.cashbookEntry.findUnique({
        where: { id: cashbookEntryId }
      });
      
      if (!cashbookEntry) {
        return {
          success: false,
          message: 'Cashbook entry not found'
        };
      }
      
      // Create allocations
      for (const allocation of allocations) {
        await prisma.paymentAllocation.create({
          data: {
            cashbookEntryId,
            invoiceId: allocation.invoiceId,
            allocatedAmount: new Decimal(allocation.allocatedAmount),
            discountAmount: new Decimal(allocation.discountAmount || 0),
            notes: allocation.notes,
            createdById: userId
          }
        });
        
        // Update invoice paid amount
        await prisma.invoice.update({
          where: { id: allocation.invoiceId },
          data: {
            paidAmount: {
              increment: new Decimal(allocation.allocatedAmount)
            },
            outstandingAmount: {
              decrement: new Decimal(allocation.allocatedAmount)
            }
          }
        });
      }
      
      console.log(`✅ Payment allocated to ${allocations.length} invoices`);
      
      return {
        success: true,
        message: 'Payment allocated successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error allocating payment:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Get payment allocations for a cashbook entry
   */
  static async getPaymentAllocations(cashbookEntryId: string): Promise<PaymentAllocation[]> {
    try {
      console.log(`📋 Getting payment allocations for cashbook entry: ${cashbookEntryId}`);
      
      const allocations = await prisma.paymentAllocation.findMany({
        where: { cashbookEntryId },
        include: {
          invoice: {
            include: {
              currency: true
            }
          }
        }
      });
      
      const paymentAllocations = allocations.map(allocation => ({
        id: allocation.id,
        cashbookEntryId: allocation.cashbookEntryId,
        invoiceId: allocation.invoiceId,
        allocatedAmount: Number(allocation.allocatedAmount),
        discountAmount: Number(allocation.discountAmount),
        notes: allocation.notes
      }));
      
      console.log(`✅ Found ${paymentAllocations.length} payment allocations`);
      return paymentAllocations;
      
    } catch (error: any) {
      console.error('❌ Error getting payment allocations:', error.message);
      return [];
    }
  }
  
  /**
   * Get Open Item aging report
   */
  static async getOpenItemAging(): Promise<{
    customers: { [customerId: string]: OpenItemAging };
    vendors: { [vendorId: string]: OpenItemAging };
  }> {
    try {
      console.log('📊 Getting Open Item aging report...');
      
      // Get all open invoices
      const openInvoices = await prisma.invoice.findMany({
        where: {
          status: 'OPEN',
          isActive: true
        },
        include: {
          currency: true
        }
      });
      
      const customerAging: { [customerId: string]: OpenItemAging } = {};
      const vendorAging: { [vendorId: string]: OpenItemAging } = {};
      
      const now = new Date();
      
      for (const invoice of openInvoices) {
        const daysOverdue = Math.floor((now.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const outstandingAmount = Number(invoice.outstandingAmount || invoice.totalAmount);
        
        if (invoice.customerId) {
          if (!customerAging[invoice.customerId]) {
            customerAging[invoice.customerId] = {
              current: 0,
              days30: 0,
              days60: 0,
              days90: 0,
              over90: 0,
              total: 0
            };
          }
          
          if (daysOverdue <= 0) {
            customerAging[invoice.customerId].current += outstandingAmount;
          } else if (daysOverdue <= 30) {
            customerAging[invoice.customerId].days30 += outstandingAmount;
          } else if (daysOverdue <= 60) {
            customerAging[invoice.customerId].days60 += outstandingAmount;
          } else if (daysOverdue <= 90) {
            customerAging[invoice.customerId].days90 += outstandingAmount;
          } else {
            customerAging[invoice.customerId].over90 += outstandingAmount;
          }
          
          customerAging[invoice.customerId].total += outstandingAmount;
        }
        
        // Note: Vendor aging would need vendorId field in Invoice model
      }
      
      console.log(`✅ Open Item aging report generated for ${Object.keys(customerAging).length} customers`);
      
      return {
        customers: customerAging,
        vendors: vendorAging
      };
      
    } catch (error: any) {
      console.error('❌ Error getting Open Item aging:', error.message);
      return {
        customers: {},
        vendors: {}
      };
    }
  }
  
  /**
   * Get customer Open Items summary
   */
  static async getCustomerOpenItems(customerId: string): Promise<{
    totalOutstanding: number;
    invoiceCount: number;
    oldestInvoice: Date | null;
    newestInvoice: Date | null;
  }> {
    try {
      console.log(`📋 Getting customer Open Items summary: ${customerId}`);
      
      const invoices = await prisma.invoice.findMany({
        where: {
          customerId,
          status: 'OPEN',
          isActive: true
        },
        orderBy: { invoiceDate: 'asc' }
      });
      
      const totalOutstanding = invoices.reduce((sum, invoice) => 
        sum + Number(invoice.outstandingAmount || invoice.totalAmount), 0
      );
      
      const oldestInvoice = invoices.length > 0 ? invoices[0].invoiceDate : null;
      const newestInvoice = invoices.length > 0 ? invoices[invoices.length - 1].invoiceDate : null;
      
      console.log(`✅ Customer has ${invoices.length} open invoices, $${totalOutstanding.toFixed(2)} outstanding`);
      
      return {
        totalOutstanding,
        invoiceCount: invoices.length,
        oldestInvoice,
        newestInvoice
      };
      
    } catch (error: any) {
      console.error('❌ Error getting customer Open Items:', error.message);
      return {
        totalOutstanding: 0,
        invoiceCount: 0,
        oldestInvoice: null,
        newestInvoice: null
      };
    }
  }
  
  /**
   * Remove payment allocation
   */
  static async removePaymentAllocation(
    allocationId: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🗑️ Removing payment allocation: ${allocationId}`);
      
      // Get allocation details
      const allocation = await prisma.paymentAllocation.findUnique({
        where: { id: allocationId },
        include: { invoice: true }
      });
      
      if (!allocation) {
        return {
          success: false,
          message: 'Payment allocation not found'
        };
      }
      
      // Update invoice paid amount
      await prisma.invoice.update({
        where: { id: allocation.invoiceId },
        data: {
          paidAmount: {
            decrement: allocation.allocatedAmount
          },
          outstandingAmount: {
            increment: allocation.allocatedAmount
          }
        }
      });
      
      // Delete allocation
      await prisma.paymentAllocation.delete({
        where: { id: allocationId }
      });
      
      console.log(`✅ Payment allocation removed: ${allocationId}`);
      
      return {
        success: true,
        message: 'Payment allocation removed successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error removing payment allocation:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

export default OpenItemService;


