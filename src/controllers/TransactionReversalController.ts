// @ts-nocheck
import { Request, Response } from 'express';
import { TransactionReversalService } from '../services/TransactionReversalService';
import { ResponseHelper } from '../utils/ResponseHelper';

export class TransactionReversalController {
  
  /**
   * Reverse a posted transaction
   */
  static async reverseTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;
      const { reason, description, reverseDate } = req.body;
      const userId = (req as any).user?.userId;
      
      if (!transactionId) {
        ResponseHelper.badRequest(res, 'Transaction ID is required');
        return;
      }
      
      if (!reason) {
        ResponseHelper.badRequest(res, 'Reversal reason is required');
        return;
      }
      
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }
      
      const reversalRequest = {
        transactionId,
        reason,
        description,
        reverseDate: reverseDate ? new Date(reverseDate) : undefined
      };
      
      const result = await TransactionReversalService.reverseTransaction(
        reversalRequest, 
        userId
      );
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in reverseTransaction:', error.message);
      ResponseHelper.internalError(res, 'Failed to reverse transaction');
    }
  }
  
  /**
   * Get reversal history for a transaction
   */
  static async getReversalHistory(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;
      
      if (!transactionId) {
        ResponseHelper.badRequest(res, 'Transaction ID is required');
        return;
      }
      
      const result = await TransactionReversalService.getReversalHistory(transactionId);
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in getReversalHistory:', error.message);
      ResponseHelper.internalError(res, 'Failed to get reversal history');
    }
  }
  
  /**
   * Get all reversals for a user
   */
  static async getAllReversals(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.userId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }
      
      const result = await TransactionReversalService.getAllReversals(userId, page, limit);
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in getAllReversals:', error.message);
      ResponseHelper.internalError(res, 'Failed to get reversals');
    }
  }
  
  /**
   * Check if transaction can be reversed
   */
  static async canReverseTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;
      
      if (!transactionId) {
        ResponseHelper.badRequest(res, 'Transaction ID is required');
        return;
      }
      
      const result = await TransactionReversalService.canReverseTransaction(transactionId);
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in canReverseTransaction:', error.message);
      ResponseHelper.internalError(res, 'Failed to check reversal eligibility');
    }
  }
}

