// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { userHasEffectivePermission } from "../config/cfoModulePermissions";
import { AuthRequest, authorize } from "./authenticate";
import { isExternalPortalUser } from "../utils/portalAuth";

export { authorize };

/**
 * Refuses accounts that belong to an external portal (investee, applicant, LP).
 *
 * `authenticate` only proves a token is valid, not that its holder is one of
 * our own staff. userRoutes applied nothing else, so an INVESTEE account that
 * reached the staff portal could list every user and create new ones. Use this
 * on any route whose data is internal but whose audience is "all staff", where
 * a specific permission would be too narrow -- assignment pickers and directory
 * lookups being the usual case.
 */
export function requireInternalStaffUser() {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    if (isExternalPortalUser(req.user)) {
      res.status(403).json({
        success: false,
        message: "This account is not authorized for staff resources.",
      });
      return;
    }
    next();
  };
}

/**
 * FP&A is not a generic internal-staff module. Keep this role allowlist aligned
 * with the frontend FP&A policy; Investment Analysts are intentionally excluded
 * by the restricted ERP access policy. This check is route-wide so newly added
 * endpoints inherit the module boundary.
 */
export function requireFpaModuleAccess() {
  const allowedRoleCodes = new Set([
    "CEO", "CFO", "FIN_MGR", "FIN_OFF", "ACCOUNTANT", "FIN_ASST",
    "OPS_MGR", "HR_MGR", "SALES_MGR", "MKT_MGR", "BOARD_CHAIR",
    "BOARD_MEMBER", "LIMITED_PARTNER", "ADMIN", "ADMINISTRATOR", "SYSADMIN", "IT_MGR",
  ]);
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    if (!allowedRoleCodes.has(String(req.user.roleCode || "").trim().toUpperCase())) {
      res.status(403).json({ success: false, message: "This account is not authorized for FP&A." });
      return;
    }
    next();
  };
}

/** Staff, or any signed-in account reading its own record (`req.params[param]` is its own user id). */
export function requireInternalStaffUserOrSelf(param = "id") {
  const staffOnly = requireInternalStaffUser();
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (req.user && req.params[param] && req.params[param] === req.user.id) {
      next();
      return;
    }
    staffOnly(req, res, next);
  };
}

/** Identity and access administration is restricted to the CEO and platform admins. */
export function requireCeoOrAdmin() {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    const roleCode = String(req.user.roleCode || "").trim().toUpperCase();
    if (!["CEO", "ADMIN", "ADMINISTRATOR", "SYSADMIN"].includes(roleCode)) {
      res.status(403).json({ success: false, message: "Only the CEO or an administrator may view or manage user access." });
      return;
    }
    next();
  };
}

export function requirePermission(permissionName: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
      return;
    }

    if (!userHasEffectivePermission(req.user, permissionName)) {
      res.status(403).json({ 
        success: false,
        message: `Insufficient permissions. Required: ${permissionName}` 
      });
      return;
    }

    next();
  };
}

export function requireAnyPermission(permissionNames: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
      return;
    }

    const hasAnyPermission = permissionNames.some((permissionName) =>
      userHasEffectivePermission(req.user, permissionName)
    );

    if (!hasAnyPermission) {
      res.status(403).json({ 
        success: false,
        message: `Insufficient permissions. Required one of: ${permissionNames.join(', ')}` 
      });
      return;
    }

    next();
  };
}

export function requireAllPermissions(permissionNames: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
      return;
    }

    const hasAllPermissions = permissionNames.every((permissionName) =>
      userHasEffectivePermission(req.user, permissionName)
    );

    if (!hasAllPermissions) {
      res.status(403).json({ 
        success: false,
        message: `Insufficient permissions. Required all: ${permissionNames.join(', ')}` 
      });
      return;
    }

    next();
  };
}

export function requireApplicantRole() {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
      return;
    }

    const roleName = req.user.role?.name?.toLowerCase();
    const roleCode = req.user.roleCode?.toString().toUpperCase();

    const isApplicant = roleName === "applicant" || roleCode === "APPLICANT";

    if (!isApplicant) {
      res.status(403).json({
        success: false,
        message: "Forbidden: applicants only"
      });
      return;
    }

    next();
  };
}

/** Merge role permissions with employee compliance blocks (cert expiry revocations). */
export async function getEffectivePermissionsForUser(
  userId: string,
  rolePermissions: Array<{ name: string; value: boolean }>
): Promise<Array<{ name: string; value: boolean }>> {
  const { CompliancePermissionService, filterPermissionsByCompliance } = await import(
    "../services/payroll/CompliancePermissionService"
  );
  const blocked = await CompliancePermissionService.getBlockedPermissionsForUser(userId);
  return filterPermissionsByCompliance(rolePermissions || [], blocked);
}
