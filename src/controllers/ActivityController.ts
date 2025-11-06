// @ts-nocheck
import { Request, Response } from "express";
import { ActivityService } from "../services/ActivityService";
import { FirebaseStorageService } from "../services/FirebaseStorageService";
import { ResponseHelper } from "../utils/responseHelper";
import { logger } from "../utils/logger";

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

  /**
   * Update activity with optional document upload
   * Supports multipart/form-data for file uploads
   * Finds or creates an activity for the given task and user
   */
  static async updateActivityWithDocuments(req: Request, res: Response) {
    try {
      const { taskId } = req.params;
      const userId = (req as any).user?.id;

      if (!taskId) {
        return ResponseHelper.error(res, "Task ID is required", undefined, 400);
      }

      if (!userId) {
        return ResponseHelper.error(res, "User not authenticated", undefined, 401);
      }

      const { title, description, valueCollected } = req.body;
      const files = (req.files as { [fieldname: string]: Express.Multer.File[] })?.['documents'] || [];

      // Upload documents if provided
      const uploadedDocuments: Array<{
        fileName: string;
        fileUrl: string;
        fileSize: number;
      }> = [];

      if (files.length > 0) {
        for (const file of files) {
          try {
            // Upload to Firebase Storage
            const { filePath, downloadURL } = await FirebaseStorageService.uploadApplicationDocument(
              file.buffer,
              file.originalname,
              `activity-task-${taskId}`, // Use task ID as identifier
              'ACTIVITY_DOCUMENT'
            );

            uploadedDocuments.push({
              fileName: file.originalname,
              fileUrl: downloadURL,
              fileSize: file.size
            });

            logger.info('Activity document uploaded', {
              taskId,
              fileName: file.originalname,
              fileSize: file.size
            });
          } catch (uploadError: any) {
            logger.error('Failed to upload activity document', {
              taskId,
              fileName: file.originalname,
              error: uploadError.message
            });
            // Continue with other files even if one fails
          }
        }
      }

      // Update or create activity
      const updatedActivity = await ActivityService.updateActivityWithDocuments(
        taskId,
        {
          title,
          description,
          valueCollected: valueCollected ? parseFloat(valueCollected) : undefined,
          documents: uploadedDocuments.length > 0 ? uploadedDocuments : undefined
        },
        userId
      );

      logger.info('Activity updated with documents', {
        activityId: updatedActivity.id,
        taskId,
        userId,
        documentsCount: uploadedDocuments.length
      });

      return ResponseHelper.success(res, "Activity created or updated successfully", updatedActivity);
    } catch (error: any) {
      logger.error("Error updating activity with documents", { error: error.message });
      return ResponseHelper.error(res, error.message || "Failed to update activity", undefined, 500);
    }
  }

  /**
   * Get activity for approval (view documents)
   */
  static async getActivityForApproval(req: Request, res: Response) {
    try {
      const { activityId } = req.params;
      const approverId = (req as any).user?.id;

      if (!activityId) {
        return ResponseHelper.error(res, "Activity ID is required", undefined, 400);
      }

      if (!approverId) {
        return ResponseHelper.error(res, "User not authenticated", undefined, 401);
      }

      const activity = await ActivityService.getActivityForApproval(activityId, approverId);

      logger.info('Activity retrieved for approval', {
        activityId,
        approverId
      });

      return ResponseHelper.success(res, "Activity retrieved successfully", activity);
    } catch (error: any) {
      logger.error("Error getting activity for approval", { error: error.message });
      return ResponseHelper.error(res, error.message || "Failed to get activity", undefined, 500);
    }
  }

  /**
   * Approve activity (view documents and approve)
   */
  static async approveActivity(req: Request, res: Response) {
    try {
      const { activityId } = req.params;
      const approverId = (req as any).user?.id;
      const { comments, approved } = req.body;

      if (!activityId) {
        return ResponseHelper.error(res, "Activity ID is required", undefined, 400);
      }

      if (!approverId) {
        return ResponseHelper.error(res, "User not authenticated", undefined, 401);
      }

      const approvedActivity = await ActivityService.approveActivity(
        activityId,
        approverId,
        {
          comments,
          approved: approved !== false // Default to approved if not specified
        }
      );

      logger.info('Activity approved', {
        activityId,
        approverId,
        approved: approved !== false
      });

      return ResponseHelper.success(res, "Activity approved successfully", approvedActivity);
    } catch (error: any) {
      logger.error("Error approving activity", { error: error.message });
      return ResponseHelper.error(res, error.message || "Failed to approve activity", undefined, 500);
    }
  }
}
