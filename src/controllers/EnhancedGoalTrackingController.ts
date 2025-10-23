// @ts-nocheck
import { Request, Response } from "express";
import { EnhancedGoalTrackingService } from "../services/EnhancedGoalTrackingService";

export class EnhancedGoalTrackingController {
  /**
   * Check goal status
   */
  static async checkGoalStatus(req: Request, res: Response) {
    try {
      const { goalId } = req.params;
      
      if (!goalId) {
        return res.status(400).json({
          success: false,
          message: "Goal ID is required"
        });
      }

      const result = await EnhancedGoalTrackingService.checkGoalStatus(goalId);
      
      res.status(200).json({
        success: true,
        message: "Goal status checked successfully",
        data: result
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Check all due goals
   */
  static async checkAllDueGoals(req: Request, res: Response) {
    try {
      const results = await EnhancedGoalTrackingService.checkAllDueGoals();
      
      res.status(200).json({
        success: true,
        message: "All due goals checked successfully",
        data: {
          totalChecked: results.length,
          results
        }
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Schedule goal tracking (for cron jobs)
   */
  static async scheduleGoalTracking(req: Request, res: Response) {
    try {
      await EnhancedGoalTrackingService.scheduleGoalTracking();
      
      res.status(200).json({
        success: true,
        message: "Goal tracking scheduled successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get goal tracking statistics
   */
  static async getGoalTrackingStats(req: Request, res: Response) {
    try {
      const results = await EnhancedGoalTrackingService.checkAllDueGoals();
      
      const stats = {
        totalGoals: results.length,
        achievedGoals: results.filter(r => r.isSuccess).length,
        behindGoals: results.filter(r => r.status === 'behind').length,
        aheadGoals: results.filter(r => r.status === 'ahead').length,
        averageProgress: results.length > 0 
          ? results.reduce((sum, r) => sum + r.progressPercentage, 0) / results.length 
          : 0
      };
      
      res.status(200).json({
        success: true,
        message: "Goal tracking statistics retrieved successfully",
        data: stats
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}
