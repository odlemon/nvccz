// @ts-nocheck
import { Request, Response } from "express";
import { RollupCalculationService } from "../services/RollupCalculationService";
import { ResponseHelper } from "../utils/responseHelper";

export class RollupCalculationController {
  /**
   * Get goal with roll-up data
   */
  static async getGoalWithRollup(req: Request, res: Response) {
    try {
      const { goalId } = req.params;

      if (!goalId) {
        return ResponseHelper.error(res, "Goal ID is required", undefined, 400);
      }

      const rollupData = await RollupCalculationService.calculateGoalRollup(goalId);

      return ResponseHelper.success(res, "Goal roll-up data retrieved successfully", rollupData);
    } catch (error: any) {
      console.error("Error getting goal roll-up:", error);
      return ResponseHelper.error(res, error.message || "Failed to get goal roll-up data", undefined, 500);
    }
  }

  /**
   * Recalculate all roll-up data for a goal hierarchy
   */
  static async recalculateRollups(req: Request, res: Response) {
    try {
      const { goalId } = req.params;

      if (!goalId) {
        return ResponseHelper.error(res, "Goal ID is required", undefined, 400);
      }

      const rollupData = await RollupCalculationService.recalculateAllRollups(goalId);

      return ResponseHelper.success(res, "Roll-up data recalculated successfully", rollupData);
    } catch (error: any) {
      console.error("Error recalculating roll-ups:", error);
      return ResponseHelper.error(res, error.message || "Failed to recalculate roll-up data", undefined, 500);
    }
  }
}
