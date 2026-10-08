// @ts-nocheck
import { Request, Response } from "express";
import { UserService } from "../services/UserService";
import { userHasEffectivePermission } from "../config/cfoModulePermissions";

/** User Master fields accepted from the admin form (validated in UserService). */
const MASTER_KEYS = [
  "employeeCode",
  "fullName",
  "mobileNumber",
  "location",
  "jobTitle",
  "branch",
  "businessUnit",
  "costCentre",
  "reportingManagerId",
  "procurementFunction",
  "accessProfile",
  "approvalLevel",
  "approvalLimitAmount",
  "delegatedApproverId",
  "sodRestrictions",
  "ssoUsername",
  "uatRole",
  "effectiveDate",
  "endDate",
] as const;

function pickMaster(body: any) {
  const out: Record<string, any> = {};
  for (const k of MASTER_KEYS) if (body && body[k] !== undefined) out[k] = body[k];
  return out;
}

function auditCtx(req: any) {
  return {
    actorUserId: req.user?.id,
    ipAddress: req.ip || (req.socket?.remoteAddress as string) || null,
    userAgent: (req.headers["user-agent"] as string) || null
  };
}

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
        departmentRole,
        status
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
        departmentRole,
        status,
        ...pickMaster(req.body)
      }, auditCtx(req));

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
            roleCode: result.user.roleCode,
            employeeCode: result.user.employeeCode,
            status: result.user.status
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

  /** Option lists for the User Master form (statuses, procurement functions, access profiles, SoD restrictions). */
  static async getMasterOptions(_req: Request, res: Response) {
    res.status(200).json({ success: true, data: UserService.masterOptions() });
  }

  /**
   * Get all users
   *
   * PROC-FINDING-010: this directory listing is intentionally open to every internal
   * staff account (see requireInternalStaffUser()'s own comment -- assignment pickers
   * and directory lookups across Performance, FPA, Payroll, Fundraising, Portfolio V11
   * and Accounting V52 all depend on it), so it cannot be gated behind manage_users
   * without breaking those pickers platform-wide. Instead, a caller who does not hold
   * manage_users gets a trimmed shape -- enough to render a "pick a colleague" list --
   * with email, roleCode, the role's internal id/description and both timestamps left
   * out. A caller who holds manage_users (real admins, e.g. the Admin -> Users page)
   * gets the full record, unchanged.
   */
  static async getAllUsers(req: Request, res: Response) {
    try {
      const users = await UserService.getAllUsers();
      const canManageUsers = userHasEffectivePermission((req as any).user, "manage_users");

      const data = canManageUsers
        ? users
        : users.map((u: any) => ({
            id: u.id,
            firstName: u.firstName,
            lastName: u.lastName,
            userDepartment: u.userDepartment,
            role: u.role ? { name: u.role.name } : null
          }));

      res.status(200).json({
        success: true,
        message: "Users retrieved successfully",
        data,
        count: data.length
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
        roleId,
        status,
        approvalLimit
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
          roleId,
          status,
          ...pickMaster(req.body),
          // Only forward when the caller actually sent the key -- `undefined` here means "leave it alone",
          // while an explicit `null` in the body (still !== undefined) means "clear the personal limit".
          ...(Object.prototype.hasOwnProperty.call(req.body, "approvalLimit") ? { approvalLimit } : {})
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
   * Reset a staff user's password to a new temporary one and email it with the login link
   */
  static async resendCredentials(req: Request, res: Response) {
    try {
      const result = await UserService.resendCredentials(req.params.id, auditCtx(req));
      res.status(200).json({ success: true, message: result.message, data: { email: result.email } });
    } catch (error: any) {
      console.error("Error resending credentials:", error);
      const message = error?.message || "Failed to resend credentials";
      res.status(message === "User not found" ? 404 : message.startsWith("Password was reset") ? 502 : 400).json({
        success: false,
        message,
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

      const result = await UserService.deleteUser(id, auditCtx(req));

      res.status(200).json({
        success: true,
        message: result.message,
        deactivated: Boolean(result.deactivated)
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
