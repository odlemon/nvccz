// @ts-nocheck
import { Request, Response } from "express";
import { ActivityLogService } from "../services/ActivityLogService";

export class ActivityLogController {
  // Create a new activity log
  static async createActivityLog(req: Request, res: Response) {
    try {
      const {
        activityType,
        title,
        description,
        goalId,
        taskId,
        kpiId,
        monetaryValueAchieved,
        percentValueAchieved
      } = req.body;
      const userId = req.user.id;

      if (!activityType || !title) {
        return res.status(400).json({
          success: false,
          message: "Activity type and title are required"
        });
      }

      const activityLog = await ActivityLogService.createActivityLog({
        activityType,
        title,
        description,
        goalId,
        taskId,
        kpiId,
        monetaryValueAchieved,
        percentValueAchieved
      }, userId);

      res.status(201).json({
        success: true,
        message: "Activity log created successfully",
        activityLog
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get all activity logs
  static async getAllActivityLogs(req: Request, res: Response) {
    try {
      const {
        userId,
        activityType,
        goalId,
        taskId,
        kpiId,
        startDate,
        endDate,
        search
      } = req.query;

      const filters: any = {};
      if (userId) filters.userId = userId as string;
      if (activityType) filters.activityType = activityType as string;
      if (goalId) filters.goalId = goalId as string;
      if (taskId) filters.taskId = taskId as string;
      if (kpiId) filters.kpiId = kpiId as string;
      if (startDate) filters.startDate = startDate as string;
      if (endDate) filters.endDate = endDate as string;
      if (search) filters.search = search as string;

      const activityLogs = await ActivityLogService.getAllActivityLogs(filters);

      res.status(200).json({
        success: true,
        count: activityLogs.length,
        activityLogs
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get activity log by ID
  static async getActivityLogById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const activityLog = await ActivityLogService.getActivityLogById(id);

      res.status(200).json({
        success: true,
        activityLog
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get activity log statistics
  static async getActivityLogStatistics(req: Request, res: Response) {
    try {
      const statistics = await ActivityLogService.getActivityLogStatistics();

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


