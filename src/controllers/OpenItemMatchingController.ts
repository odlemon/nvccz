// @ts-nocheck
import { Request, Response } from 'express';
import { OpenItemMatchingService } from '../services/OpenItemMatchingService';
import { ResponseHelper } from '../utils/responseHelper';

export class OpenItemMatchingController {
  
  /**
   * Get open invoices for a customer
   */
  static async getCustomerOpenItems(req: Request, res: Response): Promise<void> {
    try {
      const { customerId } = req.params;
      
      if (!customerId) {
        ResponseHelper.badRequest(res, 'Customer ID is required');
        return;
      }
      
      const result = await OpenItemMatchingService.getCustomerOpenItems(customerId);
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in getCustomerOpenItems:', error.message);
      ResponseHelper.internalError(res, 'Failed to get customer open items');
    }
  }
  
  /**
   * Get open invoices for a supplier
   */
  static async getSupplierOpenItems(req: Request, res: Response): Promise<void> {
    try {
      const { supplierId } = req.params;
      
      if (!supplierId) {
        ResponseHelper.badRequest(res, 'Supplier ID is required');
        return;
      }
      
      const result = await OpenItemMatchingService.getSupplierOpenItems(supplierId);
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in getSupplierOpenItems:', error.message);
      ResponseHelper.internalError(res, 'Failed to get supplier open items');
    }
  }
  
  /**
   * Match payment to specific invoices
   */
  static async matchPaymentToInvoices(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;
      const { allocations } = req.body;
      const userId = (req as any).user?.id;
      
      if (!paymentId) {
        ResponseHelper.badRequest(res, 'Payment ID is required');
        return;
      }
      
      if (!allocations || !Array.isArray(allocations)) {
        ResponseHelper.badRequest(res, 'Allocations array is required');
        return;
      }
      
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }
      
      const result = await OpenItemMatchingService.matchPaymentToInvoices(
        paymentId, 
        allocations, 
        userId
      );
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in matchPaymentToInvoices:', error.message);
      ResponseHelper.internalError(res, 'Failed to match payment to invoices');
    }
  }
  
  /**
   * Unmatch payment from invoices
   */
  static async unmatchPaymentFromInvoices(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;
      const { allocationIds } = req.body;
      const userId = (req as any).user?.id;
      
      if (!paymentId) {
        ResponseHelper.badRequest(res, 'Payment ID is required');
        return;
      }
      
      if (!allocationIds || !Array.isArray(allocationIds)) {
        ResponseHelper.badRequest(res, 'Allocation IDs array is required');
        return;
      }
      
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }
      
      const result = await OpenItemMatchingService.unmatchPaymentFromInvoices(
        paymentId, 
        allocationIds, 
        userId
      );
      
      if (result.success) {
        ResponseHelper.success(res, null, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in unmatchPaymentFromInvoices:', error.message);
      ResponseHelper.internalError(res, 'Failed to unmatch payment from invoices');
    }
  }
  
  /**
   * Get payment allocations for a payment
   */
  static async getPaymentAllocations(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;
      
      if (!paymentId) {
        ResponseHelper.badRequest(res, 'Payment ID is required');
        return;
      }
      
      const result = await OpenItemMatchingService.getPaymentAllocations(paymentId);
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in getPaymentAllocations:', error.message);
      ResponseHelper.internalError(res, 'Failed to get payment allocations');
    }
  }
  
  /**
   * Get open item matching summary
   */
  static async getMatchingSummary(req: Request, res: Response): Promise<void> {
    try {
      const { customerId, supplierId } = req.query;
      
      const result = await OpenItemMatchingService.getMatchingSummary(
        customerId as string, 
        supplierId as string
      );
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in getMatchingSummary:', error.message);
      ResponseHelper.internalError(res, 'Failed to get matching summary');
    }
  }
}
