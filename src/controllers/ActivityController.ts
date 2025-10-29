// @ts-nocheck
import { Request, Response } from "express";
import { ActivityService } from "../services/ActivityService";
import { ResponseHelper } from "../utils/responseHelper";

export class ActivityController {
  /**
   * Create a new activity for a task or goal
   */
  static async createActivity(req: Request, res: Response) {
    try {
      const userId = req.user.id;
      const {
        title,
        description,
        activityType,
        taskId,
        goalId,
        valueCollected
      } = req.body;

      // Validate required fields
      if (!title || !activityType) {
        return ResponseHelper.error(res, "Title and activity type are required", undefined, 400);
      }

      if (activityType === 'task' && !taskId) {
        return ResponseHelper.error(res, "Task ID is required for task activities", undefined, 400);
      }

      if (activityType === 'goal' && !goalId) {
        return ResponseHelper.error(res, "Goal ID is required for goal activities", undefined, 400);
      }

      const activity = await ActivityService.createActivity({
        title,
        description,
        activityType,
        taskId,
        goalId,
        valueCollected: valueCollected ? parseFloat(valueCollected) : undefined,
        userId
      });

      return ResponseHelper.success(res, "Activity created successfully", activity);
    } catch (error: any) {
      console.error("Error creating activity:", error);
      return ResponseHelper.error(res, error.message || "Failed to create activity", undefined, 500);
    }
  }

  /**
   * Get activities for a specific task
   */
  static async getTaskActivities(req: Request, res: Response) {
    try {
      const { taskId } = req.params;

      if (!taskId) {
        return ResponseHelper.error(res, "Task ID is required", undefined, 400);
      }

      const activities = await ActivityService.getTaskActivities(taskId);

      return ResponseHelper.success(res, "Task activities retrieved successfully", activities);
    } catch (error: any) {
      console.error("Error getting task activities:", error);
      return ResponseHelper.error(res, error.message || "Failed to get task activities", undefined, 500);
    }
  }

  /**
   * Get activities for a specific goal
   */
  static async getGoalActivities(req: Request, res: Response) {
    try {
      const { goalId } = req.params;

      if (!goalId) {
        return ResponseHelper.error(res, "Goal ID is required", undefined, 400);
      }

      const activities = await ActivityService.getGoalActivities(goalId);

      return ResponseHelper.success(res, "Goal activities retrieved successfully", activities);
    } catch (error: any) {
      console.error("Error getting goal activities:", error);
      return ResponseHelper.error(res, error.message || "Failed to get goal activities", undefined, 500);
    }
  }

  /**
   * Get department goals for managers/heads
   */
  static async getDepartmentGoals(req: Request, res: Response) {
    try {
      const userId = req.user.id;
      const { department } = req.params;

      if (!department) {
        return ResponseHelper.error(res, "Department name is required", undefined, 400);
      }

      const goals = await ActivityService.getDepartmentGoals(department, userId);

      return ResponseHelper.success(res, "Department goals retrieved successfully", goals);
    } catch (error: any) {
      console.error("Error getting department goals:", error);
      return ResponseHelper.error(res, error.message || "Failed to get department goals", undefined, 500);
    }
  }

  /**
   * Get tasks created by a manager for their department
   */
  static async getManagerCreatedTasks(req: Request, res: Response) {
    try {
      const userId = req.user.id;

      const tasks = await ActivityService.getManagerCreatedTasks(userId);

      return ResponseHelper.success(res, "Manager created tasks retrieved successfully", tasks);
    } catch (error: any) {
      console.error("Error getting manager created tasks:", error);
      return ResponseHelper.error(res, error.message || "Failed to get manager created tasks", undefined, 500);
    }
  }
}
