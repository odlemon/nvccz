// @ts-nocheck
import { Request, Response } from "express";
import { EnhancedGoalTrackingService } from "../services/EnhancedGoalTrackingService";
import { prisma } from "../utils/database";

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
      // Get all goals instead of just "due" goals
      const allGoals = await prisma.performanceGoal.findMany({
        where: {
          status: { not: 'deleted' } // Exclude deleted goals
        },
        include: {
          kpi: true
        }
      });

      // Calculate statistics from all goals
      const stats = {
        totalGoals: allGoals.length,
        achievedGoals: allGoals.filter(g => g.stage === 'completed').length,
        inProgressGoals: allGoals.filter(g => g.stage === 'in_progress').length,
        planningGoals: allGoals.filter(g => g.stage === 'planning').length,
        averageProgress: allGoals.length > 0 
          ? allGoals.reduce((sum, g) => {
              const progress = g.targetValue ? 
                ((g.currentValue || 0) / parseFloat(g.targetValue.toString()) * 100) : 0;
              return sum + progress;
            }, 0) / allGoals.length 
          : 0,
        goalsByType: {
          company: allGoals.filter(g => g.type === 'company').length,
          department: allGoals.filter(g => g.type === 'department').length,
          individual: allGoals.filter(g => g.type === 'individual').length
        },
        goalsByStage: {
          planning: allGoals.filter(g => g.stage === 'planning').length,
          in_progress: allGoals.filter(g => g.stage === 'in_progress').length,
          completed: allGoals.filter(g => g.stage === 'completed').length
        }
      };
      
      res.status(200).json({
        success: true,
        message: "Goal tracking statistics retrieved successfully",
        data: stats
      });
    } catch (error: any) {
      console.error("Error getting goal tracking stats:", error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}
