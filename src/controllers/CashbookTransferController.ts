// @ts-nocheck
import { Request, Response } from 'express';
import { CashbookTransferService } from '../services/CashbookTransferService';
import { ResponseHelper } from '../utils/responseHelper';
import { parseDate } from "../utils/dateHelper";

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roleId: string;
  };
}

export class CashbookTransferController {
  
  /**
   * Create a transfer between cashbooks
   */
  static async createTransfer(req: Request, res: Response): Promise<void> {
    try {
      const { fromBankId, toBankId, amount, transferDate, description, reference, projectCode } = req.body;
      if (transferDate) {
        const { default: FiscalCalendarService } = await import("../services/FiscalCalendarService");
        const tz = await FiscalCalendarService.getFiscalTimezone().catch(() => "Africa/Harare");
        const key = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
        const d = new Date(transferDate);
        if (!Number.isNaN(d.getTime()) && key(d) > key(new Date())) {
          return ResponseHelper.badRequest(res, 'A transfer cannot be dated after today.');
        }
      }
      const userId = (req as AuthRequest).user?.id;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      if (!fromBankId) {
        return ResponseHelper.badRequest(res, 'Source bank ID is required');
      }
      
      if (!toBankId) {
        return ResponseHelper.badRequest(res, 'Destination bank ID is required');
      }
      
      if (!amount || amount <= 0) {
        return ResponseHelper.badRequest(res, 'Valid amount is required');
      }
      
      if (!description) {
        return ResponseHelper.badRequest(res, 'Description is required');
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
        return ResponseHelper.success(res, 'Transfer created successfully', result.data);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in CashbookTransferController.createTransfer:', error);
      return ResponseHelper.error(res, 'Failed to create transfer', error.message);
    }
  }
  
  /**
   * Get transfer details
   */
  static async getTransfer(req: Request, res: Response): Promise<void> {
    try {
      const { transferId } = req.params;
      
      if (!transferId) {
        return ResponseHelper.badRequest(res, 'Transfer ID is required');
      }
      
      const result = await CashbookTransferService.getTransfer(transferId);
      
      if (result.success) {
        return ResponseHelper.success(res, 'Transfer retrieved successfully', result.data);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in CashbookTransferController.getTransfer:', error);
      return ResponseHelper.error(res, 'Failed to get transfer', error.message);
    }
  }
  
  /**
   * List transfers for a user
   */
  static async listTransfers(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthRequest).user?.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const fromBankId = req.query.fromBankId as string;
      const toBankId = req.query.toBankId as string;
      const dateFrom = req.query.dateFrom ? parseDate(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? parseDate(req.query.dateTo as string) : undefined;
      const currencyId = req.query.currencyId as string | undefined;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated');
      }
      
      const result = await CashbookTransferService.listTransfers(
        userId, 
        page, 
        limit, 
        fromBankId, 
        toBankId, 
        dateFrom, 
        dateTo,
        currencyId
      );
      
      if (result.success) {
        return ResponseHelper.success(res, 'Transfers retrieved successfully', result.data);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in CashbookTransferController.listTransfers:', error);
      return ResponseHelper.error(res, 'Failed to list transfers', error.message);
    }
  }
  
  /**
   * Get transfer summary
   */
  static async getTransferSummary(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as AuthRequest).user?.id;
      const dateFrom = req.query.dateFrom ? parseDate(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? parseDate(req.query.dateTo as string) : undefined;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated');
      }
      
      const result = await CashbookTransferService.getTransferSummary(userId, dateFrom, dateTo);
      
      if (result.success) {
        return ResponseHelper.success(res, 'Transfer summary retrieved successfully', result.data);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in CashbookTransferController.getTransferSummary:', error);
      return ResponseHelper.error(res, 'Failed to get transfer summary', error.message);
    }
  }
}

