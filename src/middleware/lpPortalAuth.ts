// @ts-nocheck
import { Response, NextFunction } from "express";
import type { AuthRequest } from "./authenticate";
import {
  LpPortalAccessService,
  isGpStaff,
  isSysAdmin,
  type LpPortalContext,
} from "../services/lpPortal/LpPortalAccessService";

export interface LpPortalRequest extends AuthRequest {
  lpPortal?: LpPortalContext;
}

export async function requireLpPortalAccess(req: LpPortalRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const staffClientId = typeof req.query.clientId === "string" ? req.query.clientId : undefined;
    if (isGpStaff(req.user) || isSysAdmin(req.user)) {
      if (!staffClientId) {
        return res.status(400).json({
          success: false,
          message: "GP staff must pass ?clientId= for LP portal impersonation",
        });
      }
      req.lpPortal = await LpPortalAccessService.resolveAccess(req.user.id, staffClientId);
      return next();
    }

    req.lpPortal = await LpPortalAccessService.resolveAccess(req.user.id);
    return next();
  } catch (e: any) {
    return res.status(e.statusCode || 401).json({ success: false, message: e.message || "Unauthorized" });
  }
}

export function requireLpManager(req: LpPortalRequest, res: Response, next: NextFunction) {
  const ctx = req.lpPortal;
  if (!ctx) return res.status(401).json({ success: false, message: "Unauthorized" });
  if (ctx.isStaff || ctx.lpRole === "MANAGER") return next();
  return res.status(403).json({ success: false, message: "LP Manager access required" });
}

export function requireGpAdmin(req: LpPortalRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
  if (isGpStaff(req.user) || isSysAdmin(req.user)) return next();
  return res.status(403).json({ success: false, message: "GP Ops access required" });
}

export function requireSysAdmin(req: LpPortalRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
  if (isSysAdmin(req.user)) return next();
  return res.status(403).json({ success: false, message: "SysAdmin access required" });
}
