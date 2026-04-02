// @ts-nocheck
import { Request, Response } from "express";
import { TaskService } from "../services/TaskService";
import { TaskCollaborationService } from "../services/TaskCollaborationService";
import { parseDate } from "../utils/dateHelper";

export class TaskController {
  // Create a new task
  static async createTask(req: Request, res: Response) {
    try {
      const {
        title,
        description,
        team,
        stage,
        date,
        priority,
        assets,
        branch,
        department,
        ruleset,
        goalId,
        performanceCategory,
        isPerformanceTask,
        monetaryValue,
        percentValue,
        kpi
      } = req.body;
      const userId = req.user.id;

      if (!title || !team || !date) {
        return res.status(400).json({
          success: false,
          message: "Title, team, and date are required"
        });
      }

      const task = await TaskService.createTask({
        title,
        description,
        team,
        stage,
        date: parseDate(date),
        priority,
        assets,
        branch,
        department,
        ruleset,
        goalId,
        performanceCategory,
        isPerformanceTask,
        monetaryValue,
        percentValue,
        kpi
      }, userId);

      res.status(201).json({
        success: true,
        message: "Task created successfully",
        task
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get all tasks
  static async getAllTasks(req: Request, res: Response) {
    try {
      const {
        stage,
        priority,
        department,
        performanceCategory,
        isPerformanceTask,
        goalId,
        isOverdue,
        search
      } = req.query;

      const filters: any = {};
      if (stage) filters.stage = stage as string;
      if (priority) filters.priority = priority as string;
      if (department) filters.department = department as string;
      if (performanceCategory) filters.performanceCategory = performanceCategory as string;
      if (isPerformanceTask !== undefined) filters.isPerformanceTask = isPerformanceTask === 'true';
      if (goalId) filters.goalId = goalId as string;
      if (isOverdue !== undefined) filters.isOverdue = isOverdue === 'true';
      if (search) filters.search = search as string;

      const tasks = await TaskService.getAllTasks(filters);

      res.status(200).json({
        success: true,
        count: tasks.length,
        tasks
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get current user's tasks
  static async getMyTasks(req: Request, res: Response) {
    try {
      const userId = req.user.id;
      const {
        stage,
        priority,
        department,
        performanceCategory,
        isPerformanceTask,
        goalId,
        isOverdue,
        search
      } = req.query;

      const filters: any = {
        userId // Filter by current user
      };
      if (stage) filters.stage = stage as string;
      if (priority) filters.priority = priority as string;
      if (department) filters.department = department as string;
      if (performanceCategory) filters.performanceCategory = performanceCategory as string;
      if (isPerformanceTask !== undefined) filters.isPerformanceTask = isPerformanceTask === 'true';
      if (goalId) filters.goalId = goalId as string;
      if (isOverdue !== undefined) filters.isOverdue = isOverdue === 'true';
      if (search) filters.search = search as string;

      const tasks = await TaskService.getUserTasks(userId, filters);

      res.status(200).json({
        success: true,
        message: "Your tasks retrieved successfully",
        count: tasks.length,
        tasks
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get task by ID
  static async getTaskById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const task = await TaskService.getTaskById(id);

      res.status(200).json({
        success: true,
        task
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update task
  static async updateTask(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        title,
        description,
        team,
        stage,
        date,
        priority,
        assets,
        branch,
        department,
        ruleset,
        goalId,
        performanceCategory,
        isPerformanceTask,
        monetaryValue,
        percentValue,
        monetaryValueAchieved,
        percentValueAchieved,
        kpi
      } = req.body;

      const task = await TaskService.updateTask(id, {
        title,
        description,
        team,
        stage,
        date: date ? parseDate(date) : undefined,
        priority,
        assets,
        branch,
        department,
        ruleset,
        goalId,
        performanceCategory,
        isPerformanceTask,
        monetaryValue,
        percentValue,
        monetaryValueAchieved,
        percentValueAchieved,
        kpi
      }, req.user.id);

      res.status(200).json({
        success: true,
        message: "Task updated successfully",
        task
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update task stage
  static async updateTaskStage(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { stage, monetaryValueAchieved, percentValueAchieved } = req.body;

      if (!stage) {
        return res.status(400).json({
          success: false,
          message: "Stage is required"
        });
      }

      const task = await TaskService.updateTaskStage(
        id,
        stage,
        {
          monetaryValueAchieved,
          percentValueAchieved
        },
        req.user.id
      );

      res.status(200).json({
        success: true,
        message: "Task stage updated successfully",
        task
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Post task activity
  static async postTaskActivity(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        activityType,
        title,
        description,
        monetaryValueAchieved,
        percentValueAchieved,
        notes,
        approverId,
        approvedDate
      } = req.body;

      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!activityType || !title) {
        return res.status(400).json({
          success: false,
          message: "Activity type and title are required"
        });
      }

      const task = await TaskService.postTaskActivity(id, {
        type: activityType,
        activity: title,
        description: description || notes, // Use description or notes
        monetaryValueAchieved,
        percentValueAchieved,
        userId,
        approverId,
        approvedDate
      });

      res.status(200).json({
        success: true,
        message: "Activity posted successfully",
        task
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get task statistics
  static async getTaskStatistics(req: Request, res: Response) {
    try {
      const statistics = await TaskService.getTaskStatistics();

      res.status(200).json({
        success: true,
        statistics
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  static async getTaskStageOptions(req: Request, res: Response) {
    try {
      return res.status(200).json({
        success: true,
        statuses: TaskCollaborationService.getTaskStageOptions()
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  static async getTaskComments(req: Request, res: Response) {
    try {
      const comments = await TaskCollaborationService.listTaskComments(req.params.id, req.user.id);
      return res.status(200).json({
        success: true,
        comments
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /** E.03 — one chat row at logical path tasks/{taskId}/chats/{msgId} (stored in activity_logs). */
  static async getTaskChatMessage(req: Request, res: Response) {
    try {
      const message = await TaskCollaborationService.getTaskChatMessage(
        req.params.id,
        req.params.msgId,
        req.user.id
      );
      return res.status(200).json({
        success: true,
        message
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  static async getMentionSuggestions(req: Request, res: Response) {
    try {
      const users = await TaskCollaborationService.getMentionSuggestions(
        req.params.id,
        req.user.id,
        req.query.q as string
      );

      return res.status(200).json({
        success: true,
        users
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /** JSON-only task chat (no attachments). Same persistence + Socket.IO as multipart comments. */
  static async createTaskMessage(req: Request, res: Response) {
    try {
      const { content, mentionUserIds: rawMentions } = req.body || {};
      const mentionUserIds = Array.isArray(rawMentions)
        ? rawMentions
        : rawMentions != null && rawMentions !== ""
          ? [String(rawMentions)]
          : [];

      const message = await TaskCollaborationService.createTaskComment({
        taskId: req.params.id,
        actorId: req.user.id,
        content: String(content || ""),
        mentionUserIds,
        files: []
      });

      return res.status(201).json({
        success: true,
        message: "Task message sent successfully",
        data: message,
        realtime: {
          event: "task_message",
          room: `task:${req.params.id}`,
          hint: "Subscribe via Socket.IO after emit join_task { taskId }"
        }
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  static async getTaskMessages(req: Request, res: Response) {
    try {
      const messages = await TaskCollaborationService.listTaskComments(req.params.id, req.user.id);
      return res.status(200).json({
        success: true,
        messages,
        realtime: {
          subscribeEvent: "task_message",
          roomPattern: `task:${req.params.id}`
        }
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  static async createTaskComment(req: Request, res: Response) {
    try {
      const mentionUserIds = Array.isArray(req.body.mentionUserIds)
        ? req.body.mentionUserIds
        : typeof req.body.mentionUserIds === "string"
          ? JSON.parse(req.body.mentionUserIds)
          : [];

      const comment = await TaskCollaborationService.createTaskComment({
        taskId: req.params.id,
        actorId: req.user.id,
        content: req.body.content,
        mentionUserIds,
        files: Array.isArray(req.files) ? req.files : []
      });

      return res.status(201).json({
        success: true,
        message: "Task comment created successfully",
        comment
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  static async deleteTaskComment(req: Request, res: Response) {
    try {
      const result = await TaskCollaborationService.deleteTaskComment(
        req.params.id,
        req.params.commentId,
        req.user.id
      );

      return res.status(200).json({
        success: true,
        message: "Task comment deleted successfully",
        result
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /** E.08 — same as DELETE .../comments/:id; alias for JSON task chat ("messages"). */
  static async deleteTaskMessage(req: Request, res: Response) {
    try {
      const result = await TaskCollaborationService.deleteTaskComment(
        req.params.id,
        req.params.msgId,
        req.user.id
      );

      return res.status(200).json({
        success: true,
        message: "Task message deleted successfully",
        result,
        realtime: {
          events: ["task_message", "task_comment_deleted"],
          roomPattern: `task:${req.params.id}`,
          hint: "Payload includes isDeleted: true; remove row from UI by id"
        }
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  static async uploadTaskAttachments(req: Request, res: Response) {
    try {
      const result = await TaskCollaborationService.uploadTaskAttachments({
        taskId: req.params.id,
        actorId: req.user.id,
        files: Array.isArray(req.files) ? req.files : []
      });

      return res.status(200).json({
        success: true,
        message: "Task attachments uploaded successfully",
        result
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  static async uploadTaskAttachmentBase64(req: Request, res: Response) {
    try {
      const { fileName, contentBase64, mimeType } = req.body;
      const result = await TaskCollaborationService.uploadTaskAttachmentBase64({
        taskId: req.params.id,
        actorId: req.user.id,
        fileName,
        contentBase64,
        mimeType
      });

      return res.status(200).json({
        success: true,
        message: "Task attachment uploaded successfully",
        result
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  static async bulkUpdateTaskStage(req: Request, res: Response) {
    try {
      const { taskIds, stage, monetaryValueAchieved, percentValueAchieved } = req.body;

      if (!Array.isArray(taskIds) || taskIds.length === 0 || !stage) {
        return res.status(400).json({
          success: false,
          message: "taskIds and stage are required"
        });
      }

      const tasks = await TaskService.bulkUpdateTaskStage(
        taskIds,
        stage,
        {
          monetaryValueAchieved,
          percentValueAchieved
        },
        req.user.id
      );

      return res.status(200).json({
        success: true,
        message: "Tasks updated successfully",
        count: tasks.length,
        tasks
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Dedicated endpoint for D.05 multi-select stage moves
  static async bulkStatusUpdate(req: Request, res: Response) {
    try {
      const { taskIds, stage, monetaryValueAchieved, percentValueAchieved } = req.body;

      if (!Array.isArray(taskIds) || taskIds.length === 0 || !stage) {
        return res.status(400).json({
          success: false,
          message: "taskIds and stage are required"
        });
      }

      const tasks = await TaskService.bulkUpdateTaskStage(
        taskIds,
        stage,
        {
          monetaryValueAchieved,
          percentValueAchieved
        },
        req.user.id
      );

      const affectedGoalIds = Array.from(
        new Set(
          tasks
            .map((t: any) => t.goalId)
            .filter((id: string | null | undefined) => Boolean(id))
        )
      );

      return res.status(200).json({
        success: true,
        message: "Bulk status update completed successfully",
        count: tasks.length,
        affectedGoalCount: affectedGoalIds.length,
        affectedGoalIds,
        tasks
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  static async bulkTrashTasks(req: Request, res: Response) {
    try {
      const { taskIds } = req.body;

      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "taskIds are required"
        });
      }

      const result = await TaskService.bulkTrashTasks(taskIds, req.user.id);

      return res.status(200).json({
        success: true,
        message: "Tasks deleted successfully",
        data: result
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  static async recordHistoricalEntry(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        historicalDate,
        stage,
        monetaryValueAchieved,
        percentValueAchieved,
        note,
        source
      } = req.body;

      if (!historicalDate) {
        return res.status(400).json({
          success: false,
          message: "historicalDate is required"
        });
      }

      const task = await TaskService.recordHistoricalTaskEntry(
        id,
        {
          historicalDate: parseDate(historicalDate),
          stage,
          monetaryValueAchieved,
          percentValueAchieved,
          note,
          source
        },
        req.user.id
      );

      return res.status(200).json({
        success: true,
        message: "Historical task entry recorded successfully",
        task
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

}

