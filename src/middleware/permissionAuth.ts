// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "./authenticate";

export function requirePermission(permissionName: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
      return;
    }

    const userPermissions = req.user.role.permissions;
    
    if (!userPermissions || !Array.isArray(userPermissions)) {
      res.status(403).json({ 
        success: false,
        message: "No permissions found" 
      });
      return;
    }

    const hasPermission = userPermissions.some(
      (permission: any) => 
        permission.name === permissionName && permission.value === true
    );

    if (!hasPermission) {
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

    const userPermissions = req.user.role.permissions;
    
    if (!userPermissions || !Array.isArray(userPermissions)) {
      res.status(403).json({ 
        success: false,
        message: "No permissions found" 
      });
      return;
    }

    const hasAnyPermission = permissionNames.some(permissionName =>
      userPermissions.some(
        (permission: any) => 
          permission.name === permissionName && permission.value === true
      )
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

    const userPermissions = req.user.role.permissions;
    
    if (!userPermissions || !Array.isArray(userPermissions)) {
      res.status(403).json({ 
        success: false,
        message: "No permissions found" 
      });
      return;
    }

    const hasAllPermissions = permissionNames.every(permissionName =>
      userPermissions.some(
        (permission: any) => 
          permission.name === permissionName && permission.value === true
      )
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

export function authorize(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
      return;
    }

    const userRole = req.user.role?.name;
    
    if (!userRole || !roles.includes(userRole)) {
      res.status(403).json({ 
        success: false,
        message: `Insufficient permissions. Required role: ${roles.join(', ')}` 
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