// @ts-nocheck
import { Request, Response } from "express";
import { UserService } from "../services/UserService";

export class UserController {
  /**
   * Get users filtered by department and/or role
   * Used for approval configuration UI
   */
  static async getUsersByDepartmentAndRole(req: Request, res: Response) {
    try {
      const { department, departmentRole } = req.query;

      const users = await UserService.getUsersByDepartmentAndRole(
        department as string,
        departmentRole as string
      );

      res.status(200).json({
        success: true,
        message: "Users retrieved successfully",
        data: users,
        count: users.length
      });
    } catch (error: any) {
      console.error("Error getting users by department and role:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get users"
      });
    }
  }

  /**
   * Create a new user with auto-generated password and email credentials
   */
  static async createUser(req: Request, res: Response) {
    try {
      const {
        firstName,
        lastName,
        email,
        department,
        roleCode,
        departmentRole
      } = req.body;

      // Validate required fields
      if (!firstName || !lastName || !email || !department || !roleCode || !departmentRole) {
        return res.status(400).json({
          success: false,
          message: "All fields are required: firstName, lastName, email, department, roleCode, departmentRole"
        });
      }

      // Validate department
      const validDepartments = ["Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT"];
      if (!validDepartments.includes(department)) {
        return res.status(400).json({
          success: false,
          message: `Invalid department. Valid departments: ${validDepartments.join(", ")}`
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: "Invalid email format"
        });
      }

      const result = await UserService.createUser({
        firstName,
        lastName,
        email: email.toLowerCase().trim(),
        department,
        roleCode,
        departmentRole
      });

      res.status(201).json({
        success: true,
        message: result.message,
        data: {
          user: {
            id: result.user.id,
            firstName: result.user.firstName,
            lastName: result.user.lastName,
            email: result.user.email,
            userDepartment: result.user.userDepartment,
            departmentRole: result.user.departmentRole,
            roleCode: result.user.roleCode
          },
          // Include password in response for immediate use (remove in production)
          temporaryPassword: result.password
        }
      });
    } catch (error: any) {
      console.error("Error creating user:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to create user"
      });
    }
  }
}
