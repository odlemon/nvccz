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
}
