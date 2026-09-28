// @ts-nocheck
// src/middleware/authenticate.ts
import { currentRequestContext } from "../utils/requestContext";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import {
  cfoPassesLegacyAuthorize,
  userMatchesAuthorizeRoleList,
} from "../config/cfoModulePermissions";
import { prisma } from "../utils/database";
import { userAvailability } from "../config/userMasterAccess";
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_here";
const DEBUG_AUTH = process.env.DEBUG_AUTH === "1" || process.env.DEBUG_AUTH === "true";

export interface AuthRequest extends Request {
  user?: any;
  file?: any;
}

export function createToken(userId: string): string {
  return jwt.sign(
    { userId }, 
    JWT_SECRET, 
    { expiresIn: "7d" } // 7 days expiration
  );
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  // Already verified earlier in this same request (e.g. by a module access guard in front of the router): the user was
  // loaded and checked moments ago, so do not load it again.
  if ((req as any).__authenticated && req.user) return next();
  if (DEBUG_AUTH) {
    console.log(`🔐 Auth check for ${req.method} ${req.path}`);
    console.log(`📋 Headers:`, req.headers.authorization ? "Authorization header present" : "No Authorization header");
  }

  const authHeader = req.headers.authorization;

  // Check if authorization header exists and has correct format
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    if (DEBUG_AUTH) console.log(`❌ No valid auth header for ${req.path}`);
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  const token = authHeader.split(" ")[1]; 

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (DEBUG_AUTH) console.log("decoded", decoded);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        role: true
      }
    });

    if (DEBUG_AUTH) console.log("the user", user);
    if (!user) {
      if (DEBUG_AUTH) console.log(`❌ User not found for ${req.path}`);
      res.status(401).json({ 
        success: false,
        message: "Unauthorized"     
      });
      return;
    }

    // User Master: status plus the effective/end-date validity window, checked on every request.
    const availability = userAvailability(user);
    if (availability.ok === false) {
      res.status(403).json({
        success: false,
        code: availability.code,
        message: availability.message
      });
      return;
    }

    const tokenVersionClaim = decoded.tokenVersion ?? 0;
    const dbTokenVersion = (user as any).tokenVersion ?? 0;
    if (tokenVersionClaim !== dbTokenVersion) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    
    req.user = user;
    Object.defineProperty(req, "__authenticated", { value: true, enumerable: false, configurable: true });
    // The audit writer reads the actor from here when a caller did not pass one, so no row is written anonymously.
    const _ctx = currentRequestContext();
    if (_ctx) _ctx.userId = (user as any)?.id;
    if (DEBUG_AUTH) console.log(`✅ Auth successful for ${req.path}`);

    next();
  } catch (err) {
    if (DEBUG_AUTH) console.log(`❌ JWT error for ${req.path}:`, err.message);
    // All JWT errors (expired, invalid, malformed) return the same message
    res.status(401).json({ 
      success: false,
      message: "Unauthorized" 
    });
    return;
  }
}

export function authorize(roles: string[] | string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
      return;
    }

    const allowedRoles = typeof roles === "string" ? [roles] : roles;

    if (userMatchesAuthorizeRoleList(req.user, allowedRoles)) {
      next();
      return;
    }

    if (cfoPassesLegacyAuthorize(req.user, allowedRoles)) {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      message: "Forbidden: insufficient permissions"
    });
    return;
  };
}

/** JWT user is CFO by roleCode or canonical role name (not JSON permissions). */
export function authorizeCfo(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Unauthorized"
    });
    return;
  }
  const name = req.user.role?.name;
  const code = req.user.roleCode;
  const ok =
    code === "CFO" ||
    name === "Chief Financial Officer" ||
    name === "CFO";
  if (!ok) {
    res.status(403).json({
      success: false,
      message: "Forbidden: CFO role required"
    });
    return;
  }
  next();
}