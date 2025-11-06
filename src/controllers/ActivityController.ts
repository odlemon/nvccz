// @ts-nocheck
import { Request, Response } from "express";
import { ActivityService } from "../services/ActivityService";
import { FirebaseStorageService } from "../services/FirebaseStorageService";
import { EmailNotificationService } from "../services/EmailNotificationService";
import { prisma } from "../utils/database";
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
   * Create activity for task with optional document upload
   * Supports multipart/form-data for file uploads
   * Creates a new activity for the given task (like createActivity but with document support)
   */
  static async createActivityForTask(req: Request, res: Response) {
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
      
      // Handle file uploads - multer can store files as array or object
      let files: Express.Multer.File[] = [];
      
      if (req.files) {
        if (Array.isArray(req.files)) {
          // Files come as array when using upload.array()
          files = req.files;
        } else if (typeof req.files === 'object') {
          // Files come as object when using upload.fields() or upload.any()
          // Check for 'documents' field specifically
          const documentsField = (req.files as { [fieldname: string]: Express.Multer.File[] })['documents'];
          if (documentsField && Array.isArray(documentsField)) {
            files = documentsField;
          } else {
            // If no 'documents' field, get all files from the object
            files = Object.values(req.files).flat();
          }
        }
      }
      
      logger.info('File upload check', {
        taskId,
        filesCount: files.length,
        hasReqFiles: !!req.files,
        filesType: typeof req.files,
        filesIsArray: Array.isArray(req.files),
        fileNames: files.map(f => f.originalname)
      });

      // Upload documents if provided
      const uploadedDocuments: Array<{
        fileName: string;
        fileUrl: string;
        fileSize: number;
      }> = [];

      if (files.length > 0) {
        for (const file of files) {
          try {
            logger.info('Processing file upload', {
              taskId,
              fileName: file.originalname,
              fileSize: file.size,
              mimetype: file.mimetype
            });

            // Upload to Firebase Storage
            const { filePath, downloadURL } = await FirebaseStorageService.uploadApplicationDocument(
              file.buffer,
              file.originalname,
              `activity-task-${taskId}-${Date.now()}`, // Use task ID and timestamp as identifier
              'ACTIVITY_DOCUMENT'
            );

            uploadedDocuments.push({
              fileName: file.originalname,
              fileUrl: downloadURL,
              fileSize: file.size
            });

            logger.info('Activity document uploaded successfully', {
              taskId,
              fileName: file.originalname,
              fileUrl: downloadURL,
              fileSize: file.size
            });
          } catch (uploadError: any) {
            logger.error('Failed to upload activity document', {
              taskId,
              fileName: file.originalname,
              error: uploadError.message,
              stack: uploadError.stack
            });
            // Continue with other files even if one fails
          }
        }
      } else {
        logger.warn('No files found in request', {
          taskId,
          hasFiles: !!req.files,
          filesType: typeof req.files,
          filesIsArray: Array.isArray(req.files)
        });
      }

      // Prepare description with documents if any
      let finalDescription = description || '';
      if (uploadedDocuments.length > 0) {
        const documentsInfo = JSON.stringify(uploadedDocuments);
        finalDescription = finalDescription ? `${finalDescription}\n\n[DOCUMENTS:${documentsInfo}]` : `[DOCUMENTS:${documentsInfo}]`;
      }

      // Create activity using the existing createActivity method
      const activity = await ActivityService.createActivity({
        title: title || 'Task Activity',
        description: finalDescription,
        activityType: 'task',
        taskId: taskId,
        valueCollected: valueCollected ? parseFloat(valueCollected) : undefined,
        userId
      });

      // Get task creator for email notification
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Send email notification to task creator (CIO) about activity creation
      if (task && task.creator) {
        try {
          await EmailNotificationService.sendDueDiligenceActivityUpdateEmail({
            cioName: `${task.creator.firstName} ${task.creator.lastName}`,
            cioEmail: task.creator.email,
            assigneeName: `${activity.user.firstName} ${activity.user.lastName}`,
            taskTitle: task.title,
            activityTitle: activity.title,
            activityId: activity.id,
            taskId: taskId,
            hasDocuments: uploadedDocuments.length > 0
          });
          logger.info('Activity creation email sent to CIO', {
            activityId: activity.id,
            taskId: taskId,
            cioId: task.creator.id
          });
        } catch (emailError: any) {
          logger.error('Failed to send activity creation email', {
            error: emailError.message,
            activityId: activity.id
          });
          // Don't fail activity creation if email fails
        }
      }

      logger.info('Activity created with documents', {
        activityId: activity.id,
        taskId,
        userId,
        documentsCount: uploadedDocuments.length
      });

      // Extract documents from description and add to response
      let documents: Array<{ fileName: string; fileUrl: string; fileSize: number }> = [];
      if (activity.description) {
        const documentsMatch = activity.description.match(/\[DOCUMENTS:(.+?)\]/);
        if (documentsMatch) {
          try {
            documents = JSON.parse(documentsMatch[1]);
          } catch (e) {
            logger.error('Failed to parse documents from description', {
              activityId: activity.id,
              error: e
            });
          }
        }
      }

      // Add documents to the activity response
      const activityWithDocuments = {
        ...activity,
        documents
      };

      return ResponseHelper.success(res, "Activity created successfully", activityWithDocuments);
    } catch (error: any) {
      logger.error("Error creating activity with documents", { error: error.message });
      return ResponseHelper.error(res, error.message || "Failed to create activity", undefined, 500);
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
