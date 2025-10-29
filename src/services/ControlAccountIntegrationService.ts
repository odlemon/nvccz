import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import OpenItemService from './OpenItemService';

/**
 * Service to handle Control Account integrations for Cashbook
 * This service automatically handles payment allocation to customer/supplier accounts
 * when payments are created in the cashbook, maintaining the integrity of subsidiary ledgers.
 */
export class ControlAccountIntegrationService {
  
  /**
   * Apply customer payment to outstanding invoices
   * This is called when a customer receipt is created in cashbook
   */
  static async applyCustomerPayment(
    cashbookEntryId: string,
    customerId: string,
    amount: number,
    userId: string,
    autoAllocate: boolean = false
  ): Promise<{ success: boolean; message: string; allocations?: any[] }> {
    try {
      console.log(`💰 Applying customer payment: ${amount} for customer: ${customerId}`);
      
      // Get customer's outstanding invoices
      const openInvoices = await OpenItemService.getCustomerInvoices(customerId);
      
      if (openInvoices.length === 0) {
        console.log(`ℹ️ No outstanding invoices for customer: ${customerId}`);
        return {
          success: true,
          message: 'No outstanding invoices to allocate payment to',
          allocations: []
        };
      }
      
      // If auto-allocate is enabled, automatically allocate to oldest invoices first
      if (autoAllocate) {
        const allocations = this.autoAllocatePayment(openInvoices, amount);
        
        if (allocations.length > 0) {
          const result = await OpenItemService.allocatePaymentToInvoices(
            cashbookEntryId,
            allocations,
            userId
          );
          
          if (result.success) {
            console.log(`✅ Auto-allocated payment to ${allocations.length} invoices`);
            return {
              success: true,
              message: `Payment auto-allocated to ${allocations.length} invoices`,
              allocations
            };
          } else {
            console.log(`⚠️ Auto-allocation failed: ${result.message}`);
            return {
              success: false,
              message: `Auto-allocation failed: ${result.message}`,
              allocations: []
            };
          }
        }
      }
      
      // Return success but indicate manual allocation is needed
      return {
        success: true,
        message: 'Payment recorded. Manual allocation to invoices required.',
        allocations: []
      };
      
    } catch (error: any) {
      console.error('❌ Error applying customer payment:', error.message);
      return {
        success: false,
        message: `Failed to apply customer payment: ${error.message}`,
        allocations: []
      };
    }
  }
  
  /**
   * Apply supplier payment to outstanding bills
   * This is called when a supplier payment is created in cashbook
   */
  static async applySupplierPayment(
    cashbookEntryId: string,
    vendorId: string,
    amount: number,
    userId: string,
    autoAllocate: boolean = false
  ): Promise<{ success: boolean; message: string; allocations?: any[] }> {
    try {
      console.log(`💰 Applying supplier payment: ${amount} for vendor: ${vendorId}`);
      
      // Get vendor's outstanding invoices
      const openInvoices = await OpenItemService.getVendorInvoices(vendorId);
      
      if (openInvoices.length === 0) {
        console.log(`ℹ️ No outstanding bills for vendor: ${vendorId}`);
        return {
          success: true,
          message: 'No outstanding bills to allocate payment to',
          allocations: []
        };
      }
      
      // If auto-allocate is enabled, automatically allocate to oldest invoices first
      if (autoAllocate) {
        const allocations = this.autoAllocatePayment(openInvoices, amount);
        
        if (allocations.length > 0) {
          const result = await OpenItemService.allocatePaymentToInvoices(
            cashbookEntryId,
            allocations,
            userId
          );
          
          if (result.success) {
            console.log(`✅ Auto-allocated payment to ${allocations.length} bills`);
            return {
              success: true,
              message: `Payment auto-allocated to ${allocations.length} bills`,
              allocations
            };
          } else {
            console.log(`⚠️ Auto-allocation failed: ${result.message}`);
            return {
              success: false,
              message: `Auto-allocation failed: ${result.message}`,
              allocations: []
            };
          }
        }
      }
      
      // Return success but indicate manual allocation is needed
      return {
        success: true,
        message: 'Payment recorded. Manual allocation to bills required.',
        allocations: []
      };
      
    } catch (error: any) {
      console.error('❌ Error applying supplier payment:', error.message);
      return {
        success: false,
        message: `Failed to apply supplier payment: ${error.message}`,
        allocations: []
      };
    }
  }
  
  /**
   * Auto-allocate payment to outstanding invoices using FIFO (oldest first)
   */
  private static autoAllocatePayment(
    openInvoices: any[],
    totalAmount: number
  ): { invoiceId: string; allocatedAmount: number; discountAmount?: number; notes?: string }[] {
    const allocations: { invoiceId: string; allocatedAmount: number; discountAmount?: number; notes?: string }[] = [];
    let remainingAmount = totalAmount;
    
    // Sort invoices by date (oldest first) for FIFO allocation
    const sortedInvoices = openInvoices.sort((a, b) => 
      new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime()
    );
    
    for (const invoice of sortedInvoices) {
      if (remainingAmount <= 0) break;
      
      const outstandingAmount = Number(invoice.outstandingAmount);
      const allocationAmount = Math.min(remainingAmount, outstandingAmount);
      
      if (allocationAmount > 0) {
        allocations.push({
          invoiceId: invoice.id,
          allocatedAmount: allocationAmount,
          discountAmount: 0,
          notes: `Auto-allocated payment to ${invoice.invoiceNumber}`
        });
        
        remainingAmount -= allocationAmount;
      }
    }
    
    return allocations;
  }
  
  /**
   * Get customer payment summary for display
   */
  static async getCustomerPaymentSummary(customerId: string): Promise<{
    totalOutstanding: number;
    invoiceCount: number;
    oldestInvoice: Date | null;
    newestInvoice: Date | null;
  }> {
    try {
      return await OpenItemService.getCustomerOpenItems(customerId);
    } catch (error: any) {
      console.error('❌ Error getting customer payment summary:', error.message);
      return {
        totalOutstanding: 0,
        invoiceCount: 0,
        oldestInvoice: null,
        newestInvoice: null
      };
    }
  }
  
  /**
   * Get supplier payment summary for display
   */
  static async getSupplierPaymentSummary(vendorId: string): Promise<{
    totalOutstanding: number;
    invoiceCount: number;
    oldestInvoice: Date | null;
    newestInvoice: Date | null;
  }> {
    try {
      return await OpenItemService.getCustomerOpenItems(vendorId);
    } catch (error: any) {
      console.error('❌ Error getting supplier payment summary:', error.message);
      return {
        totalOutstanding: 0,
        invoiceCount: 0,
        oldestInvoice: null,
        newestInvoice: null
      };
    }
  }
}

export default ControlAccountIntegrationService;
