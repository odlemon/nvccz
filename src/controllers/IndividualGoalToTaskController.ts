// @ts-nocheck
import { Request, Response } from "express";
import { IndividualGoalToTaskService } from "../services/IndividualGoalToTaskService";

export class IndividualGoalToTaskController {
  /**
   * Convert individual goal to tasks
   */
  static async convertIndividualGoalToTasks(req: Request, res: Response) {
    try {
      const { individualGoalId } = req.params;

      if (!individualGoalId) {
        return res.status(400).json({
          success: false,
          message: "Individual goal ID is required"
        });
      }

      await IndividualGoalToTaskService.convertIndividualGoalsToTasks(individualGoalId, req.user?.id);

      res.json({
        success: true,
        message: "Individual goal converted to tasks successfully"
      });
    } catch (error) {
      console.error("Error converting individual goal to tasks:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to convert individual goal to tasks" 
      });
    }
  }

  /**
   * Convert all individual goals for a user to tasks
   */
  static async convertUserGoalsToTasks(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required"
        });
      }

      await IndividualGoalToTaskService.convertUserIndividualGoalsToTasks(userId);

      res.json({
        success: true,
        message: "User individual goals converted to tasks successfully"
      });
    } catch (error) {
      console.error("Error converting user goals to tasks:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to convert user goals to tasks" 
      });
    }
  }

  /**
   * Convert all individual goals for a department to tasks
   */
  static async convertDepartmentGoalsToTasks(req: Request, res: Response) {
    try {
      const { departmentName } = req.params;

      if (!departmentName) {
        return res.status(400).json({
          success: false,
          message: "Department name is required"
        });
      }

      // Validate department name
      const validDepartments = ["Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT", "Investments"];
      if (!validDepartments.includes(departmentName)) {
        return res.status(400).json({
          success: false,
          message: `Invalid department name. Valid departments: ${validDepartments.join(", ")}`
        });
      }

      await IndividualGoalToTaskService.convertDepartmentIndividualGoalsToTasks(departmentName);

      res.json({
        success: true,
        message: `Department ${departmentName} individual goals converted to tasks successfully`
      });
    } catch (error) {
      console.error("Error converting department goals to tasks:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to convert department goals to tasks" 
      });
    }
  }

  /**
   * Get user's performance tasks
   */
  static async getUserPerformanceTasks(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required"
        });
      }

      const tasks = await IndividualGoalToTaskService.getUserPerformanceTasks(userId);

      res.json({
        success: true,
        message: "User performance tasks retrieved successfully",
        tasks
      });
    } catch (error) {
      console.error("Error getting user performance tasks:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to get user performance tasks" 
      });
    }
  }

  /**
   * Get department's performance tasks
   */
  static async getDepartmentPerformanceTasks(req: Request, res: Response) {
    try {
      const { departmentName } = req.params;

      if (!departmentName) {
        return res.status(400).json({
          success: false,
          message: "Department name is required"
        });
      }

      // Validate department name
      const validDepartments = ["Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT", "Investments"];
      if (!validDepartments.includes(departmentName)) {
        return res.status(400).json({
          success: false,
          message: `Invalid department name. Valid departments: ${validDepartments.join(", ")}`
        });
      }

      const tasks = await IndividualGoalToTaskService.getDepartmentPerformanceTasks(departmentName);

      res.json({
        success: true,
        message: `Department ${departmentName} performance tasks retrieved successfully`,
        tasks
      });
    } catch (error) {
      console.error("Error getting department performance tasks:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to get department performance tasks" 
      });
    }
  }
}
