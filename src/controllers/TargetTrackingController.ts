// @ts-nocheck
import { Request, Response } from "express";
import TargetTrackingService from "../services/TargetTrackingService";
import { ResponseHelper } from "../utils/responseHelper";

export class TargetTrackingController {
  /**
   * Get actual revenue, expenses, and profit data
   */
  static async getActualData(req: Request, res: Response) {
    try {
      // Add cache-busting headers
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      const actualData = await TargetTrackingService.getActualData();

      return ResponseHelper.success(res, "Actual data retrieved successfully", actualData);
    } catch (error: any) {
      console.error("Error getting actual data:", error);
      return ResponseHelper.error(res, "Failed to get actual data", error.message);
    }
  }

  /**
   * Get detailed transaction data for revenue or expenses
   */
  static async getTransactionDetails(req: Request, res: Response) {
    try {
      const { type } = req.query;

      // Validate type parameter
      if (!type || !["Revenue", "Expenses"].includes(type as string)) {
        return ResponseHelper.badRequest(res, "Type must be either 'Revenue' or 'Expenses'");
      }

      const transactionDetails = await TargetTrackingService.getTransactionDetails({
        type: type as "Revenue" | "Expenses"
      });

      return ResponseHelper.success(res, `${type} transaction details retrieved successfully`, transactionDetails);
    } catch (error: any) {
      console.error("Error getting transaction details:", error);
      return ResponseHelper.error(res, "Failed to get transaction details", error.message);
    }
  }

  /**
   * Get revenue data only
   */
  static async getRevenueData(req: Request, res: Response) {
    try {
      const actualData = await TargetTrackingService.getActualData();

      return ResponseHelper.success(res, "Revenue data retrieved successfully", actualData.revenue);
    } catch (error: any) {
      console.error("Error getting revenue data:", error);
      return ResponseHelper.error(res, "Failed to get revenue data", error.message);
    }
  }

  /**
   * Get expenses data only
   */
  static async getExpensesData(req: Request, res: Response) {
    try {
      const actualData = await TargetTrackingService.getActualData();

      return ResponseHelper.success(res, "Expenses data retrieved successfully", actualData.expenses);
    } catch (error: any) {
      console.error("Error getting expenses data:", error);
      return ResponseHelper.error(res, "Failed to get expenses data", error.message);
    }
  }

  /**
   * Get profit data only
   */
  static async getProfitData(req: Request, res: Response) {
    try {
      const actualData = await TargetTrackingService.getActualData();

      return ResponseHelper.success(res, "Profit data retrieved successfully", actualData.profit);
    } catch (error: any) {
      console.error("Error getting profit data:", error);
      return ResponseHelper.error(res, "Failed to get profit data", error.message);
    }
  }
}

export default TargetTrackingController;
