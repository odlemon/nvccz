// @ts-nocheck
import { Request, Response } from "express";
import { PerformanceScorecardService } from "../services/PerformanceScorecardService";
import { ResponseHelper } from "../utils/responseHelper";

export class PerformanceScorecardController {
  /**
   * Get user performance scorecard
   */
  static async getUserScorecard(req: Request, res: Response) {
    try {
      const userId = req.user.id;

      const scorecard = await PerformanceScorecardService.getUserScorecard(userId);

      return ResponseHelper.success(res, "User scorecard retrieved successfully", scorecard);
    } catch (error: any) {
      console.error("Error getting user scorecard:", error);
      return ResponseHelper.error(res, error.message || "Failed to get user scorecard", undefined, 500);
    }
  }

  /**
   * Get department performance scorecard
   */
  static async getDepartmentScorecard(req: Request, res: Response) {
    try {
      const { department } = req.params;

      if (!department) {
        return ResponseHelper.error(res, "Department name is required", undefined, 400);
      }

      const scorecard = await PerformanceScorecardService.getDepartmentScorecard(department);

      return ResponseHelper.success(res, "Department scorecard retrieved successfully", scorecard);
    } catch (error: any) {
      console.error("Error getting department scorecard:", error);
      return ResponseHelper.error(res, error.message || "Failed to get department scorecard", undefined, 500);
    }
  }
}