// @ts-nocheck
import { Request, Response } from "express";
import { UserService } from "../services/UserService";
import { userHasEffectivePermission } from "../config/cfoModulePermissions";

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
      const validDepartments = ["Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT", "Investments"];
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

      const boardVotingRoleCodes = ["BOARD_CHAIR", "BOARD_MEMBER"];
      const isBoardRole = roleCode && boardVotingRoleCodes.includes(roleCode);

      if (isBoardRole && department !== "Investments") {
        return res.status(400).json({
          success: false,
          message: "Board roles must belong to the Investments department"
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

  /**
   * Get all users
   *
   * Stays open to every internal staff account (see `requireInternalStaffUser()`
   * on the route -- assignment pickers/directory lookups across Performance,
   * FPA, Payroll, Fundraising, Portfolio and Accounting all depend on this
   * being staff-wide, not admin-only). PROC-FINDING-010: a caller without
   * `manage_users` gets a trimmed directory shape instead (id/name/department/
   * role name) -- no email, role code, internal role id, or timestamps.
   */
  static async getAllUsers(req: Request, res: Response) {
    try {
      const hasManageUsers = userHasEffectivePermission((req as any).user, "manage_users");
      const users = await UserService.getAllUsers({ directoryOnly: !hasManageUsers });

      res.status(200).json({
        success: true,
        message: "Users retrieved successfully",
        data: users,
        count: users.length
      });
    } catch (error: any) {
      console.error("Error getting all users:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to get users"
      });
    }
  }

  /**
   * Get user by ID
   */
  static async getUserById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "User ID is required"
        });
      }

      const user = await UserService.getUserById(id);

      res.status(200).json({
        success: true,
        message: "User retrieved successfully",
        data: user
      });
    } catch (error: any) {
      console.error("Error getting user by ID:", error);
      res.status(404).json({
        success: false,
        message: error.message || "User not found"
      });
    }
  }

  /**
   * Update user
   */
  static async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        firstName,
        lastName,
        email,
        department,
        roleCode,
        departmentRole,
        roleId
      } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "User ID is required"
        });
      }

      const user = await UserService.updateUser(
        id,
        {
          firstName,
          lastName,
          email,
          department,
          roleCode,
          departmentRole,
          roleId
        },
        {
          actorUserId: req.user.id,
          ipAddress: req.ip || (req.socket?.remoteAddress as string) || null,
          userAgent: (req.headers["user-agent"] as string) || null
        }
      );

      res.status(200).json({
        success: true,
        message: "User updated successfully",
        data: user
      });
    } catch (error: any) {
      console.error("Error updating user:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to update user"
      });
    }
  }

  /**
   * Delete user
   */
  static async deleteUser(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "User ID is required"
        });
      }

      const result = await UserService.deleteUser(id);

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to delete user"
      });
    }
  }
}
