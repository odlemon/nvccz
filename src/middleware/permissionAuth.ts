// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "./authenticate";

export function requirePermission(permissionName: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    const userPermissions = req.user.role.permissions;
    
    if (!userPermissions || !Array.isArray(userPermissions)) {
      return res.status(403).json({ 
        success: false,
        message: "No permissions found" 
      });
    }

    const hasPermission = userPermissions.some(
      (permission: any) => 
        permission.name === permissionName && permission.value === true
    );

    if (!hasPermission) {
      return res.status(403).json({ 
        success: false,
        message: `Insufficient permissions. Required: ${permissionName}` 
      });
    }

    next();
  };
}

export function requireAnyPermission(permissionNames: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    const userPermissions = req.user.role.permissions;
    
    if (!userPermissions || !Array.isArray(userPermissions)) {
      return res.status(403).json({ 
        success: false,
        message: "No permissions found" 
      });
    }

    const hasAnyPermission = permissionNames.some(permissionName =>
      userPermissions.some(
        (permission: any) => 
          permission.name === permissionName && permission.value === true
      )
    );

    if (!hasAnyPermission) {
      return res.status(403).json({ 
        success: false,
        message: `Insufficient permissions. Required one of: ${permissionNames.join(', ')}` 
      });
    }

    next();
  };
}

export function requireAllPermissions(permissionNames: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    const userPermissions = req.user.role.permissions;
    
    if (!userPermissions || !Array.isArray(userPermissions)) {
      return res.status(403).json({ 
        success: false,
        message: "No permissions found" 
      });
    }

    const hasAllPermissions = permissionNames.every(permissionName =>
      userPermissions.some(
        (permission: any) => 
          permission.name === permissionName && permission.value === true
      )
    );

    if (!hasAllPermissions) {
      return res.status(403).json({ 
        success: false,
        message: `Insufficient permissions. Required all: ${permissionNames.join(', ')}` 
      });
    }

    next();
  };
}

export function authorize(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    const userRole = req.user.role?.name;
    
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({ 
        success: false,
        message: `Insufficient permissions. Required role: ${roles.join(', ')}` 
      });
    }

    next();
  };
} 