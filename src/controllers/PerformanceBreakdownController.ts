// @ts-nocheck
import { Request, Response } from "express";
import { PerformanceGoalService } from "../services/PerformanceGoalService";
import { prisma } from "../utils/database";

export class PerformanceBreakdownController {
  /**
   * Create breakdown goals for selected departments
   */
  static async createDepartmentBreakdown(req: Request, res: Response) {
    try {
      const { parentGoalId, selectedDepartments, breakdownData } = req.body;

      if (!parentGoalId || !selectedDepartments || !breakdownData) {
        return res.status(400).json({
          success: false,
          message: "Parent goal ID, selected departments, and breakdown data are required"
        });
      }

      if (selectedDepartments.length !== breakdownData.length) {
        return res.status(400).json({
          success: false,
          message: "Number of selected departments must match breakdown data length"
        });
      }

      // Validate department names are hardcoded
      const validDepartments = ["Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT"];
      const invalidDepartments = selectedDepartments.filter(dept => !validDepartments.includes(dept));
      
      if (invalidDepartments.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid department names: ${invalidDepartments.join(", ")}. Valid departments: ${validDepartments.join(", ")}`
        });
      }

      const createdGoals = await PerformanceGoalService.createBreakdownGoals(
        parentGoalId,
        selectedDepartments,
        breakdownData
      );

      res.status(201).json({
        success: true,
        message: `Successfully created ${createdGoals.length} department goals`,
        goals: createdGoals
      });
    } catch (error) {
      console.error("Error creating department breakdown:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to create department breakdown" 
      });
    }
  }

  /**
   * Create individual goals for selected users in a department
   */
  static async createIndividualBreakdown(req: Request, res: Response) {
    try {
      const { departmentGoalId, selectedUsers, individualData } = req.body;

      if (!departmentGoalId || !selectedUsers || !individualData) {
        return res.status(400).json({
          success: false,
          message: "Department goal ID, selected users, and individual data are required"
        });
      }

      if (selectedUsers.length !== individualData.length) {
        return res.status(400).json({
          success: false,
          message: "Number of selected users must match individual data length"
        });
      }

      const createdGoals = await PerformanceGoalService.createIndividualGoals(
        departmentGoalId,
        selectedUsers,
        individualData
      );

      res.status(201).json({
        success: true,
        message: `Successfully created ${createdGoals.length} individual goals`,
        goals: createdGoals
      });
    } catch (error) {
      console.error("Error creating individual breakdown:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to create individual breakdown" 
      });
    }
  }

  /**
   * Get available departments for breakdown
   */
  static async getAvailableDepartments(req: Request, res: Response) {
    try {
      const departments = [
        { name: "Finance", description: "Financial operations and accounting" },
        { name: "Sales", description: "Revenue generation and client acquisition" },
        { name: "Operations", description: "Business operations and processes" },
        { name: "Procurement", description: "Vendor management and purchasing" },
        { name: "Human Resources", description: "HR operations and talent management" },
        { name: "Marketing", description: "Marketing and brand management" },
        { name: "Legal", description: "Legal compliance and risk management" },
        { name: "IT", description: "Technology and systems management" }
      ];

      res.json({
        success: true,
        message: "Available departments retrieved successfully",
        departments
      });
    } catch (error) {
      console.error("Error getting available departments:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to get available departments" 
      });
    }
  }

  /**
   * Get users by department for individual goal assignment
   */
  static async getUsersByDepartment(req: Request, res: Response) {
    try {
      const { departmentName } = req.params;

      if (!departmentName) {
        return res.status(400).json({
          success: false,
          message: "Department name is required"
        });
      }

      // Validate department name
      const validDepartments = ["Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT"];
      if (!validDepartments.includes(departmentName)) {
        return res.status(400).json({
          success: false,
          message: `Invalid department name. Valid departments: ${validDepartments.join(", ")}`
        });
      }

      // Get users by department name using userDepartment field
      const users = await prisma.user.findMany({
        where: {
          userDepartment: departmentName,
          role: {
            name: { not: "admin" } // Exclude admins from individual goals
          }
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: {
            select: {
              name: true,
              level: true
            }
          }
        }
      });

      res.json({
        success: true,
        message: `Users in ${departmentName} department retrieved successfully`,
        users
      });
    } catch (error) {
      console.error("Error getting users by department:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to get users by department" 
      });
    }
  }
}
