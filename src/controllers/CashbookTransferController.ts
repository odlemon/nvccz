// @ts-nocheck
import { Request, Response } from 'express';
import { CashbookTransferService } from '../services/CashbookTransferService';
import { ResponseHelper } from '../utils/responseHelper';

export class CashbookTransferController {
  
  /**
   * Create a transfer between cashbooks
   */
  static async createTransfer(req: Request, res: Response): Promise<void> {
    try {
      const { fromBankId, toBankId, amount, transferDate, description, reference, projectCode } = req.body;
      const userId = (req as any).user?.userId;
      
      if (!fromBankId) {
        ResponseHelper.badRequest(res, 'Source bank ID is required');
        return;
      }
      
      if (!toBankId) {
        ResponseHelper.badRequest(res, 'Destination bank ID is required');
        return;
      }
      
      if (!amount || amount <= 0) {
        ResponseHelper.badRequest(res, 'Valid amount is required');
        return;
      }
      
      if (!description) {
        ResponseHelper.badRequest(res, 'Description is required');
        return;
      }
      
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }
      
      const transferRequest = {
        fromBankId,
        toBankId,
        amount: parseFloat(amount),
        transferDate: transferDate ? new Date(transferDate) : new Date(),
        description,
        reference,
        projectCode
      };
      
      const result = await CashbookTransferService.createTransfer(transferRequest, userId);
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in createTransfer:', error.message);
      ResponseHelper.internalError(res, 'Failed to create transfer');
    }
  }
  
  /**
   * Get transfer details
   */
  static async getTransfer(req: Request, res: Response): Promise<void> {
    try {
      const { transferId } = req.params;
      
      if (!transferId) {
        ResponseHelper.badRequest(res, 'Transfer ID is required');
        return;
      }
      
      const result = await CashbookTransferService.getTransfer(transferId);
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in getTransfer:', error.message);
      ResponseHelper.internalError(res, 'Failed to get transfer');
    }
  }
  
  /**
   * List transfers for a user
   */
  static async listTransfers(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.userId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const fromBankId = req.query.fromBankId as string;
      const toBankId = req.query.toBankId as string;
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
      
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }
      
      const result = await CashbookTransferService.listTransfers(
        userId, 
        page, 
        limit, 
        fromBankId, 
        toBankId, 
        dateFrom, 
        dateTo
      );
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in listTransfers:', error.message);
      ResponseHelper.internalError(res, 'Failed to list transfers');
    }
  }
  
  /**
   * Get transfer summary
   */
  static async getTransferSummary(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.userId;
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
      
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }
      
      const result = await CashbookTransferService.getTransferSummary(userId, dateFrom, dateTo);
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in getTransferSummary:', error.message);
      ResponseHelper.internalError(res, 'Failed to get transfer summary');
    }
  }
}

