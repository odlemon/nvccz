// @ts-nocheck
// Period Lockout Controller
// Handles period lockout functionality

import { Request, Response } from "express";
import { ResponseHelper } from "../utils/responseHelper";
import PeriodLockoutService from "../services/PeriodLockoutService";

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roleId: string;
  };
}

export default class PeriodLockoutController {
  
  /**
   * Lock/unlock accounting period
   * POST /api/cashbook/periods/lock
   */
  static async lockPeriod(req: AuthRequest, res: Response) {
    try {
      const {
        period,
        isLocked,
        reason
      } = req.body;

      if (!period || typeof isLocked !== 'boolean') {
        return ResponseHelper.badRequest(res, 'Missing required fields: period, isLocked');
      }

      if (!req.user?.id) {
        return ResponseHelper.unauthorized(res, 'User authentication required');
      }

      // Validate period format (YYYY-MM)
      const periodRegex = /^\d{4}-\d{2}$/;
      if (!periodRegex.test(period)) {
        return ResponseHelper.badRequest(res, 'Invalid period format. Use YYYY-MM');
      }

      const result = await PeriodLockoutService.lockPeriod({
        period,
        isLocked,
        lockedBy: req.user.id,
        reason
      });

      if (result.success) {
        return ResponseHelper.success(res, result.message, result.data);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
    } catch (error) {
      console.error('Error in lockPeriod:', error);
      return ResponseHelper.error(res, 'Internal server error');
    }
  }

  /**
   * Check if period is locked
   * GET /api/cashbook/periods/:period/status
   */
  static async getPeriodStatus(req: AuthRequest, res: Response) {
    try {
      const { period } = req.params;

      if (!period) {
        return ResponseHelper.badRequest(res, 'Missing required parameter: period');
      }

      // Validate period format
      const periodRegex = /^\d{4}-\d{2}$/;
      if (!periodRegex.test(period)) {
        return ResponseHelper.badRequest(res, 'Invalid period format. Use YYYY-MM');
      }

      const result = await PeriodLockoutService.getPeriodStatus(period);

      if (result.success) {
        return ResponseHelper.success(res, result.message, result.data);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
    } catch (error) {
      console.error('Error in getPeriodStatus:', error);
      return ResponseHelper.error(res, 'Internal server error');
    }
  }

  /**
   * Get all periods with lockout status
   * GET /api/cashbook/periods
   */
  static async getAllPeriods(req: AuthRequest, res: Response) {
    try {
      const { year, isLocked } = req.query;

      const filters: any = {};
      if (year) filters.year = parseInt(year as string);
      if (isLocked !== undefined) filters.isLocked = isLocked === 'true';

      const result = await PeriodLockoutService.getAllPeriods(filters);

      if (result.success) {
        return ResponseHelper.success(res, result.message, result.data);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
    } catch (error) {
      console.error('Error in getAllPeriods:', error);
      return ResponseHelper.error(res, 'Internal server error');
    }
  }

  /**
   * Validate transaction date
   * POST /api/cashbook/periods/validate-date
   */
  static async validateTransactionDate(req: AuthRequest, res: Response) {
    try {
      const { transactionDate } = req.body;

      if (!transactionDate) {
        return ResponseHelper.badRequest(res, 'Missing required field: transactionDate');
      }

      if (!req.user?.id) {
        return ResponseHelper.unauthorized(res, 'User authentication required');
      }

      const date = new Date(transactionDate);
      if (isNaN(date.getTime())) {
        return ResponseHelper.badRequest(res, 'Invalid date format');
      }

      const result = await PeriodLockoutService.validateTransactionDate(date, req.user.id);

      if (result.success) {
        return ResponseHelper.success(res, result.message, result.data);
      } else {
        return ResponseHelper.forbidden(res, result.message);
      }
    } catch (error) {
      console.error('Error in validateTransactionDate:', error);
      return ResponseHelper.error(res, 'Internal server error');
    }
  }

  /**
   * Get lockout history for a period
   * GET /api/cashbook/periods/:period/history
   */
  static async getLockoutHistory(req: AuthRequest, res: Response) {
    try {
      const { period } = req.params;

      if (!period) {
        return ResponseHelper.badRequest(res, 'Missing required parameter: period');
      }

      // Validate period format
      const periodRegex = /^\d{4}-\d{2}$/;
      if (!periodRegex.test(period)) {
        return ResponseHelper.badRequest(res, 'Invalid period format. Use YYYY-MM');
      }

      const result = await PeriodLockoutService.getLockoutHistory(period);

      if (result.success) {
        return ResponseHelper.success(res, result.message, result.data);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
    } catch (error) {
      console.error('Error in getLockoutHistory:', error);
      return ResponseHelper.error(res, 'Internal server error');
    }
  }
}

