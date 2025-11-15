// @ts-nocheck
import { Response } from 'express';
import { AuthRequest } from '../middleware/authenticate';
import { TrialBalanceService } from '../services/TrialBalanceService';
import { ResponseHelper } from '../utils/responseHelper';

export class TrialBalanceController {
  /**
   * Generate trial balance for a specific date
   */
  static async generateTrialBalance(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { date, startDate, endDate } = req.query;
      
      // Parse dates
      let trialBalanceDate: Date | undefined;
      let start: Date | undefined;
      let end: Date | undefined;
      
      if (startDate && endDate) {
        // Use date range
        start = new Date(startDate as string);
        end = new Date(endDate as string);
        trialBalanceDate = end; // Use endDate as the display date
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return ResponseHelper.badRequest(res, 'Invalid date format for startDate or endDate');
        }
      } else if (date) {
        // Legacy: use date as endDate
        trialBalanceDate = new Date(date as string);
        if (isNaN(trialBalanceDate.getTime())) {
          return ResponseHelper.badRequest(res, 'Invalid date format');
        }
      } else {
        // Default to current date
        trialBalanceDate = new Date();
      }

      const trialBalance = await TrialBalanceService.generateTrialBalance(
        trialBalanceDate || new Date(),
        start,
        end
      );
      
      return ResponseHelper.success(res, 'Trial balance generated successfully', trialBalance);
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to generate trial balance', error.message);
    }
  }

  /**
   * Get trial balance summary
   */
  static async getTrialBalanceSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { date } = req.query;
      
      // Use current date if no date provided
      const trialBalanceDate = date ? new Date(date as string) : new Date();
      
      if (isNaN(trialBalanceDate.getTime())) {
        return ResponseHelper.badRequest(res, 'Invalid date format');
      }

      const summary = await TrialBalanceService.getTrialBalanceSummary(trialBalanceDate);
      
      return ResponseHelper.success(res, 'Trial balance summary retrieved successfully', summary);
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to get trial balance summary', error.message);
    }
  }

  /**
   * Get trial balance grouped by account type
   */
  static async getTrialBalanceByAccountType(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { date } = req.query;
      
      // Use current date if no date provided
      const trialBalanceDate = date ? new Date(date as string) : new Date();
      
      if (isNaN(trialBalanceDate.getTime())) {
        return ResponseHelper.badRequest(res, 'Invalid date format');
      }

      const trialBalanceByType = await TrialBalanceService.getTrialBalanceByAccountType(trialBalanceDate);
      
      return ResponseHelper.success(res, 'Trial balance by account type retrieved successfully', trialBalanceByType);
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to get trial balance by account type', error.message);
    }
  }
}
