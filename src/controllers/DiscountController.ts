// @ts-nocheck
// Discount Controller
// Handles discount management endpoints

import { Request, Response } from "express";
import { ResponseHelper } from "../utils/responseHelper";
import DiscountService from "../services/DiscountService";

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roleId: string;
  };
}

export default class DiscountController {
  
  /**
   * Calculate discount
   * POST /api/cashbook/discounts/calculate
   */
  static async calculateDiscount(req: Request, res: Response) {
    try {
      const {
        entityType,
        entityId,
        amount,
        transactionDate
      } = req.body;
      
      if (!entityType || !entityId || !amount || !transactionDate) {
        return ResponseHelper.badRequest(res, 'Missing required fields: entityType, entityId, amount, transactionDate');
      }
      
      if (!['CUSTOMER', 'SUPPLIER'].includes(entityType)) {
        return ResponseHelper.badRequest(res, 'Entity type must be CUSTOMER or SUPPLIER');
      }
      
      const result = await DiscountService.calculateDiscount({
        entityType: entityType as 'CUSTOMER' | 'SUPPLIER',
        entityId,
        amount: parseFloat(amount),
        transactionDate: new Date(transactionDate)
      });
      
      return ResponseHelper.success(res, 'Discount calculated successfully', {
        discountAmount: result.discountAmount,
        netAmount: result.netAmount,
        discountConfig: result.discountConfig
      });
      
    } catch (error: any) {
      console.error('Error in DiscountController.calculateDiscount:', error);
      return ResponseHelper.error(res, 'Failed to calculate discount', error.message);
    }
  }
  
  /**
   * Get customer discount
   * GET /api/cashbook/discounts/customer/:customerId
   */
  static async getCustomerDiscount(req: Request, res: Response) {
    try {
      const { customerId } = req.params;
      
      const discounts = await DiscountService.getCustomerDiscount(customerId);
      
      return ResponseHelper.success(res, 'Customer discount retrieved successfully', discounts);
      
    } catch (error: any) {
      console.error('Error in DiscountController.getCustomerDiscount:', error);
      return ResponseHelper.error(res, 'Failed to get customer discount', error.message);
    }
  }
  
  /**
   * Get supplier discount
   * GET /api/cashbook/discounts/supplier/:supplierId
   */
  static async getSupplierDiscount(req: Request, res: Response) {
    try {
      const { supplierId } = req.params;
      
      const discounts = await DiscountService.getSupplierDiscount(supplierId);
      
      return ResponseHelper.success(res, 'Supplier discount retrieved successfully', discounts);
      
    } catch (error: any) {
      console.error('Error in DiscountController.getSupplierDiscount:', error);
      return ResponseHelper.error(res, 'Failed to get supplier discount', error.message);
    }
  }
  
  /**
   * Create discount configuration
   * POST /api/cashbook/discounts
   */
  static async createDiscountConfig(req: Request, res: Response) {
    try {
      const {
        entityType,
        entityId,
        discountType,
        discountValue,
        minAmount,
        maxAmount,
        validFrom,
        validTo
      } = req.body;
      
      if (!entityType || !entityId || !discountType || !discountValue || !validFrom) {
        return ResponseHelper.badRequest(res, 'Missing required fields: entityType, entityId, discountType, discountValue, validFrom');
      }
      
      if (!['CUSTOMER', 'SUPPLIER'].includes(entityType)) {
        return ResponseHelper.badRequest(res, 'Entity type must be CUSTOMER or SUPPLIER');
      }
      
      if (!['PERCENTAGE', 'FIXED'].includes(discountType)) {
        return ResponseHelper.badRequest(res, 'Discount type must be PERCENTAGE or FIXED');
      }
      
      const result = await DiscountService.createDiscountConfig({
        entityType: entityType as 'CUSTOMER' | 'SUPPLIER',
        entityId,
        discountType: discountType as 'PERCENTAGE' | 'FIXED',
        discountValue: parseFloat(discountValue),
        minAmount: minAmount ? parseFloat(minAmount) : undefined,
        maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
        validFrom: new Date(validFrom),
        validTo: validTo ? new Date(validTo) : undefined
      });
      
      if (result.success) {
        return ResponseHelper.success(res, 'Discount configuration created successfully', result.discountConfig);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in DiscountController.createDiscountConfig:', error);
      return ResponseHelper.error(res, 'Failed to create discount configuration', error.message);
    }
  }
  
  /**
   * Update discount configuration
   * PUT /api/cashbook/discounts/:id
   */
  static async updateDiscountConfig(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const result = await DiscountService.updateDiscountConfig(id, updates);
      
      if (result.success) {
        return ResponseHelper.success(res, 'Discount configuration updated successfully');
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in DiscountController.updateDiscountConfig:', error);
      return ResponseHelper.error(res, 'Failed to update discount configuration', error.message);
    }
  }
  
  /**
   * Delete discount configuration
   * DELETE /api/cashbook/discounts/:id
   */
  static async deleteDiscountConfig(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const result = await DiscountService.deleteDiscountConfig(id);
      
      if (result.success) {
        return ResponseHelper.success(res, 'Discount configuration deleted successfully');
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in DiscountController.deleteDiscountConfig:', error);
      return ResponseHelper.error(res, 'Failed to delete discount configuration', error.message);
    }
  }
  
  /**
   * Get all discount configurations
   * GET /api/cashbook/discounts
   */
  static async getAllDiscountConfigs(req: Request, res: Response) {
    try {
      const discounts = await DiscountService.getAllDiscountConfigs();
      
      return ResponseHelper.success(res, 'Discount configurations retrieved successfully', discounts);
      
    } catch (error: any) {
      console.error('Error in DiscountController.getAllDiscountConfigs:', error);
      return ResponseHelper.error(res, 'Failed to get discount configurations', error.message);
    }
  }
  
  /**
   * Get discount summary
   * GET /api/cashbook/discounts/summary
   */
  static async getDiscountSummary(req: Request, res: Response) {
    try {
      const { dateFrom, dateTo } = req.query;
      
      if (!dateFrom || !dateTo) {
        return ResponseHelper.badRequest(res, 'Date range is required: dateFrom, dateTo');
      }
      
      const summary = await DiscountService.getDiscountSummary(
        new Date(dateFrom as string),
        new Date(dateTo as string)
      );
      
      return ResponseHelper.success(res, 'Discount summary retrieved successfully', summary);
      
    } catch (error: any) {
      console.error('Error in DiscountController.getDiscountSummary:', error);
      return ResponseHelper.error(res, 'Failed to get discount summary', error.message);
    }
  }
}


