// @ts-nocheck
import { Request, Response } from "express";
import { PerformanceGoalService } from "../services/PerformanceGoalService";
import { parseDate } from "../utils/dateHelper";

export class PerformanceGoalController {
  // Create a new performance goal
  static async createPerformanceGoal(req: Request, res: Response) {
    try {
      const {
        title,
        description,
        type,
        parentGoalId,
        departmentName,
        targetValue,
        targetUnit,
        currentValue,
        kpiName,
        priority,
        startDate,
        endDate,
        assignedToId,
        cascadeMode,
        // NEW: Enhanced Goal Definition Form Fields
        targetOperator,
        dataSourceModule,
        dataSourceField,
        trackingFrequency,
        scorecardPillar,
        performanceContractId,
        contributionWeightPercent,
        isReverseKpi,
        strategyId,
        scorecardWeight
      } = req.body;
      const userId = req.user.id;

      if (!title || !type || !startDate || !endDate || !targetValue || !targetUnit) {
        return res.status(400).json({
          success: false,
          message: "Title, type, start date, end date, target value, and target unit are required"
        });
      }

      const goal = await PerformanceGoalService.createPerformanceGoal({
        title,
        description,
        type,
        parentGoalId,
        departmentName,
        targetValue,
        targetUnit,
        currentValue,
        kpiName,
        priority,
        startDate: parseDate(startDate),
        endDate: parseDate(endDate),
        assignedToId,
        cascadeMode,
        // NEW: Enhanced Goal Definition Form Fields
        targetOperator,
        dataSourceModule,
        dataSourceField,
        trackingFrequency,
        scorecardPillar,
        performanceContractId,
        contributionWeightPercent,
        isReverseKpi,
        strategyId,
        scorecardWeight
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
        status,
        department,
        assignedToId,
        parentGoalId,
        kpiId,
        strategicThemeId,
        scorecardPillar,
        pillarId,
        search
      } = req.query;

      const filters: any = {};
      if (type) filters.type = type as string;
      if (status) filters.status = status as string;
      if (department) filters.departmentName = department as string;
      if (assignedToId) filters.assignedToId = assignedToId as string;
      if (parentGoalId) filters.parentGoalId = parentGoalId as string;
      if (kpiId) filters.kpiId = kpiId as string;
      if (strategicThemeId) filters.strategicThemeId = strategicThemeId as string;
      if (scorecardPillar) filters.scorecardPillar = scorecardPillar as string;
      if (pillarId) filters.pillarId = pillarId as string;
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

  // Get performance goals by KPI id
  static async getGoalsByKpiId(req: Request, res: Response) {
    try {
      const { kpiId } = req.params;
      const goals = await PerformanceGoalService.getGoalsByKpiId(kpiId);
      return res.status(200).json({
        success: true,
        count: goals.length,
        goals
      });
    } catch (error: any) {
      return res.status(400).json({
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
        parentGoalId,
        departmentName,
        monetaryValue,
        percentValue,
        monetaryValueAchieved,
        percentValueAchieved,
        kpiId,
        kpiName,
        priority,
        status,
        stage,
        startDate,
        endDate,
        assignedToId,
        targetValue,
        targetUnit,
        currentValue,
        targetOperator,
        dataSourceModule,
        dataSourceField,
        trackingFrequency,
        contributionWeightPercent,
        stretchTargetValue,
        isReverseKpi,
        scorecardPillar
      } = req.body;

      const goal = await PerformanceGoalService.updatePerformanceGoal(id, {
        title,
        description,
        type,
        parentGoalId,
        departmentName,
        monetaryValue,
        percentValue,
        monetaryValueAchieved,
        percentValueAchieved,
        kpiId,
        kpiName,
        priority,
        status,
        stage,
        startDate: startDate ? parseDate(startDate) : undefined,
        endDate: endDate ? parseDate(endDate) : undefined,
        assignedToId,
        targetValue,
        targetUnit,
        currentValue,
        targetOperator,
        dataSourceModule,
        dataSourceField,
        trackingFrequency,
        contributionWeightPercent,
        stretchTargetValue,
        isReverseKpi,
        scorecardPillar
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

  static async uploadGoalAttachmentBase64(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { fileName, contentBase64, mimeType } = req.body;

      const result = await PerformanceGoalService.uploadGoalAttachmentBase64(
        id,
        { fileName, contentBase64, mimeType },
        req.user.id
      );

      return res.status(200).json({
        success: true,
        message: "Goal attachment uploaded successfully",
        result
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  static async uploadGoalAttachments(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const files = Array.isArray(req.files) ? req.files : [];
      const result = await PerformanceGoalService.uploadGoalAttachments(id, files, req.user.id);
      return res.status(200).json({
        success: true,
        message: "Goal attachments uploaded successfully",
        result
      });
    } catch (error: any) {
      return res.status(400).json({
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

  // Update goal progress: body `value` (or `currentValue`) is added to achieved amount; server uses goal targetUnit / legacy fields for baseline.
  static async updateGoalProgress(req: Request, res: Response) {
    try {
      const { id: goalId } = req.params;
      const raw = req.body.value ?? req.body.currentValue;
      const userId = req.user.id;

      if (raw === undefined || raw === null || raw === "") {
        return res.status(400).json({
          success: false,
          message: "value is required (alias: currentValue)"
        });
      }

      const num = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (Number.isNaN(num)) {
        return res.status(400).json({
          success: false,
          message: "value must be a number"
        });
      }

      const updatedGoal = await PerformanceGoalService.updateGoalProgress(goalId, num, userId);

      res.json({
        success: true,
        message: "Goal progress updated successfully",
        goal: updatedGoal
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

