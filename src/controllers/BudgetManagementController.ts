// @ts-nocheck
import { Request, Response } from "express";
import { BudgetManagementService } from "../services/BudgetManagementService";

export class BudgetManagementController {
  // Create a new budget
  static async createBudget(req: Request, res: Response) {
    try {
      const createdById = req.user.id;
      const budget = await BudgetManagementService.createBudget(req.body, createdById);
      
      res.status(201).json({
        success: true,
        message: "Budget created successfully",
        budget
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get all budgets
  static async getAllBudgets(req: Request, res: Response) {
    try {
      const filters = req.query;
      const budgets = await BudgetManagementService.getAllBudgets(filters);
      
      res.status(200).json({
        success: true,
        budgets
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get budget by ID
  static async getBudgetById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const budget = await BudgetManagementService.getBudgetById(id);
      
      res.status(200).json({
        success: true,
        budget
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update budget
  static async updateBudget(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const budget = await BudgetManagementService.updateBudget(id, req.body);
      
      res.status(200).json({
        success: true,
        message: "Budget updated successfully",
        budget
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Delete budget
  static async deleteBudget(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await BudgetManagementService.deleteBudget(id);
      
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

  // Create budget item
  static async createBudgetItem(req: Request, res: Response) {
    try {
      const { budgetId } = req.params;
      const createdById = req.user.id;
      const budgetItem = await BudgetManagementService.createBudgetItem(budgetId, req.body, createdById);
      
      res.status(201).json({
        success: true,
        message: "Budget item created successfully",
        budgetItem
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update budget item
  static async updateBudgetItem(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const budgetItem = await BudgetManagementService.updateBudgetItem(id, req.body);
      
      res.status(200).json({
        success: true,
        message: "Budget item updated successfully",
        budgetItem
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get budget items
  static async getBudgetItems(req: Request, res: Response) {
    try {
      const { budgetId } = req.params;
      const budgetItems = await BudgetManagementService.getBudgetItems(budgetId);
      
      res.status(200).json({
        success: true,
        budgetItems
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Delete budget item
  static async deleteBudgetItem(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await BudgetManagementService.deleteBudgetItem(id);
      
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

  // Create variance report
  static async createVarianceReport(req: Request, res: Response) {
    try {
      const preparedById = req.user.id;
      const varianceReport = await BudgetManagementService.createVarianceReport(req.body, preparedById);
      
      res.status(201).json({
        success: true,
        message: "Variance report created successfully",
        varianceReport
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get variance reports
  static async getVarianceReports(req: Request, res: Response) {
    try {
      const filters = req.query;
      const varianceReports = await BudgetManagementService.getVarianceReports(filters);
      
      res.status(200).json({
        success: true,
        varianceReports
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get budget analytics
  static async getBudgetAnalytics(req: Request, res: Response) {
    try {
      const filters = req.query;
      const analytics = await BudgetManagementService.getBudgetAnalytics(filters);
      
      res.status(200).json({
        success: true,
        analytics
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}
