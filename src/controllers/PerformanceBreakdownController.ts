// @ts-nocheck
import { Request, Response } from "express";
import { PerformanceGoalService } from "../services/PerformanceGoalService";
import { TaskService } from "../services/TaskService";
import { prisma } from "../utils/database";
import { getRoleByCode } from "../config/hardcodedRoles";

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
      const validDepartments = ["Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT", "Investments"];
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
      const message =
        error instanceof Error ? error.message : "Failed to create department breakdown";
      res.status(400).json({
        success: false,
        message
      });
    }
  }

  /**
   * Create individual goals for selected users in a department
   */
  static async createIndividualBreakdown(req: Request, res: Response) {
    try {
      const { departmentGoalId, selectedUsers, individualData, breakdownData } = req.body;
      const rows = Array.isArray(breakdownData)
        ? breakdownData
        : Array.isArray(individualData)
          ? individualData
          : null;

      if (!departmentGoalId || !selectedUsers || !rows) {
        return res.status(400).json({
          success: false,
          message:
            "Department goal ID, selected users, and per-user rows are required (use `individualData` or `breakdownData` — same array shape)"
        });
      }

      if (selectedUsers.length !== rows.length) {
        return res.status(400).json({
          success: false,
          message: "Number of selected users must match individualData / breakdownData length"
        });
      }

      const actingUserId = req.user?.id;
      const createdGoals = await PerformanceGoalService.createIndividualGoals(
        departmentGoalId,
        selectedUsers,
        rows,
        { actingUserId }
      );

      res.status(201).json({
        success: true,
        message: `Successfully created ${createdGoals.length} individual goals`,
        goals: createdGoals
      });
    } catch (error) {
      console.error("Error creating individual breakdown:", error);
      const message =
        error instanceof Error ? error.message : "Failed to create individual breakdown";
      res.status(400).json({
        success: false,
        message
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
        { name: "IT", description: "Technology and systems management" },
        { name: "Investments", description: "Investment portfolio management and fund operations" }
      ];

      const dueDiligenceTasks = await TaskService.getAllTasks({
        fromDueDiligence: true
      });

      const tasksByDepartment = dueDiligenceTasks.reduce((acc, task) => {
        const departmentKey = (task.department || "unassigned").toLowerCase();
        if (!acc.has(departmentKey)) {
          acc.set(departmentKey, []);
        }
        acc.get(departmentKey)!.push(task);
        return acc;
      }, new Map<string, any[]>());

      const departmentsWithTasks = departments.map(department => {
        const key = department.name.toLowerCase();
        return {
          ...department,
          dueDiligenceTasks: tasksByDepartment.get(key) || []
        };
      });

      const unassignedDueDiligenceTasks = tasksByDepartment.get("unassigned") || [];

      res.json({
        success: true,
        message: "Available departments retrieved successfully",
        departments: departmentsWithTasks,
        unassignedDueDiligenceTasks
      });
    } catch (error) {
      console.error("Error getting available departments:", error);
      const message =
        error instanceof Error ? error.message : "Failed to get available departments";
      res.status(500).json({
        success: false,
        message
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
      const validDepartments = ["Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT", "Investments"];
      if (!validDepartments.includes(departmentName)) {
        return res.status(400).json({
          success: false,
          message: `Invalid department name. Valid departments: ${validDepartments.join(", ")}`
        });
      }

      // Get users by department name using userDepartment field
      // Exclude admins and applicants, only include users with hardcoded role codes
      const users = await prisma.user.findMany({
        where: {
          userDepartment: departmentName,
          role: {
            name: { 
              notIn: ["admin", "applicant"] // Exclude admins and applicants
            }
          },
          roleCode: {
            not: null // Only include users with hardcoded role codes assigned
          }
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userDepartment: true,
          departmentRole: true,
          roleCode: true, // Include the hardcoded role code
          role: {
            select: {
              id: true,
              name: true,
              description: true
            }
          }
        }
      });

      // Enrich users with hardcoded role details
      const enrichedUsers = users.map(user => {
        const hardcodedRole = user.roleCode ? getRoleByCode(user.roleCode) : null;
        return {
          ...user,
          hardcodedRole: hardcodedRole ? {
            code: hardcodedRole.code,
            name: hardcodedRole.name,
            level: hardcodedRole.level,
            department: hardcodedRole.department,
            description: hardcodedRole.description
          } : null
        };
      });

      res.json({
        success: true,
        message: `Users in ${departmentName} department retrieved successfully`,
        users: enrichedUsers,
        count: enrichedUsers.length
      });
    } catch (error) {
      console.error("Error getting users by department:", error);
      const message =
        error instanceof Error ? error.message : "Failed to get users by department";
      res.status(500).json({
        success: false,
        message
      });
    }
  }
}
