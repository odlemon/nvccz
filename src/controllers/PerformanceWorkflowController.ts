// @ts-nocheck
import { Request, Response } from "express";
import { PerformanceWorkflowService } from "../services/PerformanceWorkflowService";

export class PerformanceWorkflowController {
  /** Items waiting on the signed-in person: self-scoped, so no resource permission gates it. */
  static async pendingForMe(req: Request, res: Response) {
    try {
      const result = await PerformanceWorkflowService.pendingForMe(req.user);
      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Auto-assign organizational goals to departments
   */
  static async autoAssignGoals(req: Request, res: Response) {
    try {
      const { goalId } = req.params;
      
      if (!goalId) {
        return res.status(400).json({
          success: false,
          message: "Goal ID is required"
        });
      }

      await PerformanceWorkflowService.autoAssignGoals(goalId);
      
      res.status(200).json({
        success: true,
        message: "Goals auto-assigned successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Auto-assign department goals to team members
   */
  static async autoAssignDepartmentGoals(req: Request, res: Response) {
    try {
      const { goalId } = req.params;
      
      if (!goalId) {
        return res.status(400).json({
          success: false,
          message: "Goal ID is required"
        });
      }

      await PerformanceWorkflowService.autoAssignDepartmentGoals(goalId);
      
      res.status(200).json({
        success: true,
        message: "Department goals auto-assigned successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Update goal progress from task completion
   */
  static async updateProgressFromTasks(req: Request, res: Response) {
    try {
      const { taskId } = req.params;
      
      if (!taskId) {
        return res.status(400).json({
          success: false,
          message: "Task ID is required"
        });
      }

      await PerformanceWorkflowService.updateProgressFromTasks(taskId);
      
      res.status(200).json({
        success: true,
        message: "Goal progress updated from task completion"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Check KPI thresholds and trigger accounting
   */
  static async checkKPIThresholds(req: Request, res: Response) {
    try {
      const { goalId } = req.params;
      
      if (!goalId) {
        return res.status(400).json({
          success: false,
          message: "Goal ID is required"
        });
      }

      await PerformanceWorkflowService.checkKPIThresholds(goalId);
      
      res.status(200).json({
        success: true,
        message: "KPI thresholds checked successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Check for overdue goals
   */
  static async checkOverdueGoals(req: Request, res: Response) {
    try {
      await PerformanceWorkflowService.checkOverdueGoals();
      
      res.status(200).json({
        success: true,
        message: "Overdue goals checked successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Run all workflow automation tasks
   */
  static async runWorkflowAutomation(req: Request, res: Response) {
    try {
      await PerformanceWorkflowService.runWorkflowAutomation();
      
      res.status(200).json({
        success: true,
        message: "Workflow automation completed successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}
