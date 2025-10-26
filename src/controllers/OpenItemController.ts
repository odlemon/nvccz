// @ts-nocheck
// Open Item Controller
// Handles Open Item matching endpoints

import { Request, Response } from "express";
import { ResponseHelper } from "../utils/responseHelper";
import OpenItemService from "../services/OpenItemService";

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roleId: string;
  };
}

export default class OpenItemController {
  
  /**
   * Get customer invoices for Open Item matching
   * GET /api/cashbook/customers/:customerId/invoices
   */
  static async getCustomerInvoices(req: Request, res: Response) {
    try {
      const { customerId } = req.params;
      
      const invoices = await OpenItemService.getCustomerInvoices(customerId);
      
      return ResponseHelper.success(res, 'Customer invoices retrieved successfully', invoices);
      
    } catch (error: any) {
      console.error('Error in OpenItemController.getCustomerInvoices:', error);
      return ResponseHelper.error(res, 'Failed to get customer invoices', error.message);
    }
  }
  
  /**
   * Get vendor invoices for Open Item matching
   * GET /api/cashbook/vendors/:vendorId/invoices
   */
  static async getVendorInvoices(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;
      
      const invoices = await OpenItemService.getVendorInvoices(vendorId);
      
      return ResponseHelper.success(res, 'Vendor invoices retrieved successfully', invoices);
      
    } catch (error: any) {
      console.error('Error in OpenItemController.getVendorInvoices:', error);
      return ResponseHelper.error(res, 'Failed to get vendor invoices', error.message);
    }
  }
  
  /**
   * Allocate payment to invoices
   * POST /api/cashbook/receipts/:id/allocate
   * POST /api/cashbook/payments/:id/allocate
   */
  static async allocatePayment(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { id } = req.params;
      const { allocations } = req.body;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      if (!allocations || !Array.isArray(allocations)) {
        return ResponseHelper.badRequest(res, 'Allocations array is required');
      }
      
      const result = await OpenItemService.allocatePaymentToInvoices(id, allocations, userId);
      
      if (result.success) {
        return ResponseHelper.success(res, 'Payment allocated successfully');
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in OpenItemController.allocatePayment:', error);
      return ResponseHelper.error(res, 'Failed to allocate payment', error.message);
    }
  }
  
  /**
   * Get payment allocations
   * GET /api/cashbook/receipts/:id/allocations
   * GET /api/cashbook/payments/:id/allocations
   */
  static async getPaymentAllocations(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const allocations = await OpenItemService.getPaymentAllocations(id);
      
      return ResponseHelper.success(res, 'Payment allocations retrieved successfully', allocations);
      
    } catch (error: any) {
      console.error('Error in OpenItemController.getPaymentAllocations:', error);
      return ResponseHelper.error(res, 'Failed to get payment allocations', error.message);
    }
  }
  
  /**
   * Get Open Item aging report
   * GET /api/cashbook/open-items/aging
   */
  static async getOpenItemAging(req: Request, res: Response) {
    try {
      const aging = await OpenItemService.getOpenItemAging();
      
      return ResponseHelper.success(res, 'Open Item aging report retrieved successfully', aging);
      
    } catch (error: any) {
      console.error('Error in OpenItemController.getOpenItemAging:', error);
      return ResponseHelper.error(res, 'Failed to get Open Item aging report', error.message);
    }
  }
  
  /**
   * Get customer Open Items summary
   * GET /api/cashbook/customers/:customerId/open-items
   */
  static async getCustomerOpenItems(req: Request, res: Response) {
    try {
      const { customerId } = req.params;
      
      const openItems = await OpenItemService.getCustomerOpenItems(customerId);
      
      return ResponseHelper.success(res, 'Customer Open Items retrieved successfully', openItems);
      
    } catch (error: any) {
      console.error('Error in OpenItemController.getCustomerOpenItems:', error);
      return ResponseHelper.error(res, 'Failed to get customer Open Items', error.message);
    }
  }
  
  /**
   * Remove payment allocation
   * DELETE /api/cashbook/allocations/:allocationId
   */
  static async removePaymentAllocation(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { allocationId } = req.params;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const result = await OpenItemService.removePaymentAllocation(allocationId, userId);
      
      if (result.success) {
        return ResponseHelper.success(res, 'Payment allocation removed successfully');
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in OpenItemController.removePaymentAllocation:', error);
      return ResponseHelper.error(res, 'Failed to remove payment allocation', error.message);
    }
  }
}


