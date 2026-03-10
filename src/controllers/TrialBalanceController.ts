// @ts-nocheck
import { Response } from 'express';
import { AuthRequest } from '../middleware/authenticate';
import { TrialBalanceService } from '../services/TrialBalanceService';
import { ResponseHelper } from '../utils/responseHelper';
import { extractPeriodFilter, periodFilterToDateRange } from '../utils/periodFilterHelper';

export class TrialBalanceController {
  /**
   * Generate trial balance for a specific date
   * Supports period filters (month/quarter/year) via URL query parameters OR legacy date range
   */
  static async generateTrialBalance(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Try to extract period filter first
      const periodFilter = extractPeriodFilter(req);
      
      let trialBalanceDate: Date | undefined;
      let start: Date | undefined;
      let end: Date | undefined;
      
      if (periodFilter) {
        // Use period filter (month/quarter/year)
        const dateRange = periodFilterToDateRange(periodFilter);
        start = dateRange.startDate;
        end = dateRange.endDate;
        trialBalanceDate = end; // Use endDate as the display date
      } else {
        // Fallback to legacy date range format
        const { date, startDate, endDate } = req.query;
        
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
      }

      const hideZeroBalances = req.query.hideZeroBalances === 'true' || req.query.hideZeroBalances === '1';
      const includeTransactionDetails = req.query.includeTransactionDetails !== 'false' && req.query.includeTransactionDetails !== '0';
      const trialBalance = await TrialBalanceService.generateTrialBalance(
        trialBalanceDate || new Date(),
        start,
        end,
        hideZeroBalances,
        includeTransactionDetails
      );
      
      return ResponseHelper.success(res, 'Trial balance generated successfully', trialBalance);
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to generate trial balance', error.message);
    }
  }

  /**
   * Get trial balance summary
   * Supports period filters (month/quarter/year) via URL query parameters OR legacy date
   */
  static async getTrialBalanceSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Try to extract period filter first
      const periodFilter = extractPeriodFilter(req);
      
      let trialBalanceDate: Date;
      let start: Date | undefined;
      let end: Date | undefined;
      
      if (periodFilter) {
        // Use period filter (month/quarter/year) - extract BOTH start and end dates
        const dateRange = periodFilterToDateRange(periodFilter);
        start = dateRange.startDate;
        end = dateRange.endDate;
        trialBalanceDate = end;
      } else {
        // Fallback to legacy date format
        const { date } = req.query;
        trialBalanceDate = date ? new Date(date as string) : new Date();
        
        if (isNaN(trialBalanceDate.getTime())) {
          return ResponseHelper.badRequest(res, 'Invalid date format');
        }
      }

      const summary = await TrialBalanceService.getTrialBalanceSummary(trialBalanceDate, start, end);
      
      return ResponseHelper.success(res, 'Trial balance summary retrieved successfully', summary);
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to get trial balance summary', error.message);
    }
  }

  /**
   * Get trial balance grouped by account type
   * Supports period filters (month/quarter/year) via URL query parameters OR legacy date
   */
  static async getTrialBalanceByAccountType(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Try to extract period filter first
      const periodFilter = extractPeriodFilter(req);
      
      let trialBalanceDate: Date;
      let start: Date | undefined;
      let end: Date | undefined;
      
      if (periodFilter) {
        // Use period filter (month/quarter/year) - extract BOTH start and end dates
        const dateRange = periodFilterToDateRange(periodFilter);
        start = dateRange.startDate;
        end = dateRange.endDate;
        trialBalanceDate = end;
      } else {
        // Fallback to legacy date format
        const { date } = req.query;
        trialBalanceDate = date ? new Date(date as string) : new Date();
        
        if (isNaN(trialBalanceDate.getTime())) {
          return ResponseHelper.badRequest(res, 'Invalid date format');
        }
      }

      const trialBalanceByType = await TrialBalanceService.getTrialBalanceByAccountType(trialBalanceDate, start, end);
      
      return ResponseHelper.success(res, 'Trial balance by account type retrieved successfully', trialBalanceByType);
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to get trial balance by account type', error.message);
    }
  }
}
