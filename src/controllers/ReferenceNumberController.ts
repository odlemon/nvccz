// @ts-nocheck
// Reference Number Controller
// Handles reference number management endpoints

import { Request, Response } from "express";
import { ResponseHelper } from "../utils/responseHelper";
import ReferenceNumberService from "../services/ReferenceNumberService";

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roleId: string;
  };
}

export default class ReferenceNumberController {
  
  /**
   * Get next reference number
   * GET /api/cashbook/reference/next
   */
  static async getNextReference(req: Request, res: Response) {
    try {
      const { type } = req.query;
      
      if (!type || !['RECEIPT', 'PAYMENT', 'BATCH'].includes(type as string)) {
        return ResponseHelper.badRequest(res, 'Type must be RECEIPT, PAYMENT, or BATCH');
      }
      
      const result = await ReferenceNumberService.getNextReference(type as 'RECEIPT' | 'PAYMENT' | 'BATCH');
      
      if (result.success) {
        return ResponseHelper.success(res, 'Reference number generated successfully', {
          referenceNumber: result.referenceNumber,
          config: result.config
        });
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in ReferenceNumberController.getNextReference:', error);
      return ResponseHelper.error(res, 'Failed to get next reference number', error.message);
    }
  }
  
  /**
   * Configure reference number settings
   * POST /api/cashbook/reference/configure
   */
  static async configureReference(req: Request, res: Response) {
    try {
      const {
        type,
        prefix,
        currentNumber,
        incrementBy,
        resetPeriod
      } = req.body;
      
      if (!type || !prefix || currentNumber === undefined || !incrementBy || !resetPeriod) {
        return ResponseHelper.badRequest(res, 'Missing required fields: type, prefix, currentNumber, incrementBy, resetPeriod');
      }
      
      if (!['RECEIPT', 'PAYMENT', 'BATCH'].includes(type)) {
        return ResponseHelper.badRequest(res, 'Type must be RECEIPT, PAYMENT, or BATCH');
      }
      
      if (!['DAILY', 'MONTHLY', 'YEARLY', 'NEVER'].includes(resetPeriod)) {
        return ResponseHelper.badRequest(res, 'Reset period must be DAILY, MONTHLY, YEARLY, or NEVER');
      }
      
      const result = await ReferenceNumberService.configureReference({
        type,
        prefix,
        currentNumber: parseInt(currentNumber),
        incrementBy: parseInt(incrementBy),
        resetPeriod
      });
      
      if (result.success) {
        return ResponseHelper.success(res, 'Reference number configuration updated successfully');
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in ReferenceNumberController.configureReference:', error);
      return ResponseHelper.error(res, 'Failed to configure reference number', error.message);
    }
  }
  
  /**
   * Get reference number settings
   * GET /api/cashbook/reference/settings
   */
  static async getReferenceSettings(req: Request, res: Response) {
    try {
      const settings = await ReferenceNumberService.getReferenceSettings();
      
      return ResponseHelper.success(res, 'Reference number settings retrieved successfully', settings);
      
    } catch (error: any) {
      console.error('Error in ReferenceNumberController.getReferenceSettings:', error);
      return ResponseHelper.error(res, 'Failed to get reference settings', error.message);
    }
  }
  
  /**
   * Reset reference number
   * POST /api/cashbook/reference/reset
   */
  static async resetReference(req: Request, res: Response) {
    try {
      const { configId } = req.body;
      
      if (!configId) {
        return ResponseHelper.badRequest(res, 'Config ID is required');
      }
      
      const config = await ReferenceNumberService.resetReferenceNumber(configId);
      
      return ResponseHelper.success(res, 'Reference number reset successfully', config);
      
    } catch (error: any) {
      console.error('Error in ReferenceNumberController.resetReference:', error);
      return ResponseHelper.error(res, 'Failed to reset reference number', error.message);
    }
  }
  
  /**
   * Validate reference number
   * POST /api/cashbook/reference/validate
   */
  static async validateReference(req: Request, res: Response) {
    try {
      const { reference, type } = req.body;
      
      if (!reference || !type) {
        return ResponseHelper.badRequest(res, 'Reference and type are required');
      }
      
      if (!['RECEIPT', 'PAYMENT', 'BATCH'].includes(type)) {
        return ResponseHelper.badRequest(res, 'Type must be RECEIPT, PAYMENT, or BATCH');
      }
      
      const result = await ReferenceNumberService.validateReference(reference, type as 'RECEIPT' | 'PAYMENT' | 'BATCH');
      
      return ResponseHelper.success(res, 'Reference validation completed', {
        isValid: result.isValid,
        message: result.message
      });
      
    } catch (error: any) {
      console.error('Error in ReferenceNumberController.validateReference:', error);
      return ResponseHelper.error(res, 'Failed to validate reference', error.message);
    }
  }
}


