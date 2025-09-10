// @ts-nocheck
import { Request, Response } from "express";
import { PerformanceGoalService } from "../services/PerformanceGoalService";

export class PerformanceGoalController {
  // Create a new performance goal
  static async createPerformanceGoal(req: Request, res: Response) {
    try {
      const {
        title,
        description,
        type,
        category,
        parentGoalId,
        departmentId,
        monetaryValue,
        percentValue,
        kpiId,
        priority,
        startDate,
        endDate,
        assignedToId,
        cascadeMode
      } = req.body;
      const userId = req.user.id;

      if (!title || !type || !category || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "Title, type, category, start date, and end date are required"
        });
      }

      const goal = await PerformanceGoalService.createPerformanceGoal({
        title,
        description,
        type,
        category,
        parentGoalId,
        departmentId,
        monetaryValue,
        percentValue,
        kpiId,
        priority,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        assignedToId,
        cascadeMode
      }, userId);

      res.status(201).json({
        success: true,
        message: "Performance goal created successfully",
        goal
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get all performance goals
  static async getAllPerformanceGoals(req: Request, res: Response) {
    try {
      const {
        type,
        category,
        status,
        departmentId,
        assignedToId,
        parentGoalId,
        search
      } = req.query;

      const filters: any = {};
      if (type) filters.type = type as string;
      if (category) filters.category = category as string;
      if (status) filters.status = status as string;
      if (departmentId) filters.departmentId = departmentId as string;
      if (assignedToId) filters.assignedToId = assignedToId as string;
      if (parentGoalId) filters.parentGoalId = parentGoalId as string;
      if (search) filters.search = search as string;

      const goals = await PerformanceGoalService.getAllPerformanceGoals(filters);

      res.status(200).json({
        success: true,
        count: goals.length,
        goals
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get performance goal by ID
  static async getPerformanceGoalById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const goal = await PerformanceGoalService.getPerformanceGoalById(id);

      res.status(200).json({
        success: true,
        goal
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update performance goal
  static async updatePerformanceGoal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        title,
        description,
        type,
        category,
        monetaryValue,
        percentValue,
        monetaryValueAchieved,
        percentValueAchieved,
        kpiId,
        priority,
        status,
        stage,
        startDate,
        endDate,
        assignedToId
      } = req.body;

      const goal = await PerformanceGoalService.updatePerformanceGoal(id, {
        title,
        description,
        type,
        category,
        monetaryValue,
        percentValue,
        monetaryValueAchieved,
        percentValueAchieved,
        kpiId,
        priority,
        status,
        stage,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        assignedToId
      });

      res.status(200).json({
        success: true,
        message: "Performance goal updated successfully",
        goal
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Delete performance goal
  static async deletePerformanceGoal(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const result = await PerformanceGoalService.deletePerformanceGoal(id);

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get performance goal statistics
  static async getPerformanceGoalStatistics(req: Request, res: Response) {
    try {
      const statistics = await PerformanceGoalService.getPerformanceGoalStatistics();

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

