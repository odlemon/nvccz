import { Request, Response } from 'express';
import { AuthRequest } from '../types/auth';
import ResponseHelper from '../utils/responseHelper';
import ControlAccountIntegrationService from '../services/ControlAccountIntegrationService';

/**
 * Controller for Control Account Integration
 * Handles automatic payment allocation to customer/supplier accounts
 */
export default class ControlAccountController {
  
  /**
   * Get customer payment summary
   * GET /api/cashbook/customers/:customerId/payment-summary
   */
  static async getCustomerPaymentSummary(req: Request, res: Response) {
    try {
      const { customerId } = req.params;
      
      if (!customerId) {
        return ResponseHelper.badRequest(res, 'Customer ID is required');
      }
      
      const summary = await ControlAccountIntegrationService.getCustomerPaymentSummary(customerId);
      
      return ResponseHelper.success(res, 'Customer payment summary retrieved successfully', summary);
      
    } catch (error: any) {
      console.error('Error in ControlAccountController.getCustomerPaymentSummary:', error);
      return ResponseHelper.error(res, 'Failed to get customer payment summary', error.message);
    }
  }
  
  /**
   * Get supplier payment summary
   * GET /api/cashbook/suppliers/:vendorId/payment-summary
   */
  static async getSupplierPaymentSummary(req: Request, res: Response) {
    try {
      const { vendorId } = req.params;
      
      if (!vendorId) {
        return ResponseHelper.badRequest(res, 'Vendor ID is required');
      }
      
      const summary = await ControlAccountIntegrationService.getSupplierPaymentSummary(vendorId);
      
      return ResponseHelper.success(res, 'Supplier payment summary retrieved successfully', summary);
      
    } catch (error: any) {
      console.error('Error in ControlAccountController.getSupplierPaymentSummary:', error);
      return ResponseHelper.error(res, 'Failed to get supplier payment summary', error.message);
    }
  }
  
  /**
   * Manually apply customer payment to invoices
   * POST /api/cashbook/customers/:customerId/apply-payment
   */
  static async applyCustomerPayment(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { customerId } = req.params;
      const { cashbookEntryId, amount, autoAllocate = false } = req.body;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated');
      }
      
      if (!customerId || !cashbookEntryId || !amount) {
        return ResponseHelper.badRequest(res, 'Customer ID, cashbook entry ID, and amount are required');
      }
      
      const result = await ControlAccountIntegrationService.applyCustomerPayment(
        cashbookEntryId,
        customerId,
        amount,
        userId,
        autoAllocate
      );
      
      if (result.success) {
        return ResponseHelper.success(res, result.message, result);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in ControlAccountController.applyCustomerPayment:', error);
      return ResponseHelper.error(res, 'Failed to apply customer payment', error.message);
    }
  }
  
  /**
   * Manually apply supplier payment to bills
   * POST /api/cashbook/suppliers/:vendorId/apply-payment
   */
  static async applySupplierPayment(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { vendorId } = req.params;
      const { cashbookEntryId, amount, autoAllocate = false } = req.body;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated');
      }
      
      if (!vendorId || !cashbookEntryId || !amount) {
        return ResponseHelper.badRequest(res, 'Vendor ID, cashbook entry ID, and amount are required');
      }
      
      const result = await ControlAccountIntegrationService.applySupplierPayment(
        cashbookEntryId,
        vendorId,
        amount,
        userId,
        autoAllocate
      );
      
      if (result.success) {
        return ResponseHelper.success(res, result.message, result);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in ControlAccountController.applySupplierPayment:', error);
      return ResponseHelper.error(res, 'Failed to apply supplier payment', error.message);
    }
  }
}
