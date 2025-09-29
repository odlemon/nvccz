// @ts-nocheck
import { Request, Response } from "express";
import { TaskService } from "../services/TaskService";

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
        date: new Date(date),
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
        date: date ? new Date(date) : undefined,
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

      const task = await TaskService.updateTaskStage(id, stage, {
        monetaryValueAchieved,
        percentValueAchieved
      });

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
}

