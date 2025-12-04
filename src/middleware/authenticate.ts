// @ts-nocheck
// src/middleware/authenticate.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/database";
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_here";

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
  console.log(`🔐 Auth check for ${req.method} ${req.path}`);
  console.log(`📋 Headers:`, req.headers.authorization ? 'Authorization header present' : 'No Authorization header');
  
  const authHeader = req.headers.authorization;
  
  // Check if authorization header exists and has correct format
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log(`❌ No valid auth header for ${req.path}`);
    res.status(401).json({ 
      success: false,
      message: "Unauthorized" 
    });
    return;
  }

  const token = authHeader.split(" ")[1]; 

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    console.log("decoded", decoded);
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        passwordChangedAt: true, // CRITICAL: Must select this field
        role: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    console.log("the user", user);
    if (!user) {
      console.log(`❌ User not found for ${req.path}`);
      res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
      return;
    }
    
    // FORCE INVALIDATE: Check if password was changed - if passwordChangedAt exists, invalidate ALL tokens
    // This ensures all existing sessions are logged out when password changes
    if (user.passwordChangedAt) {
      const passwordChangedAt = new Date(user.passwordChangedAt);
      console.log(`🔐 Password change detected for user ${user.email}`);
      console.log(`   Password changed at: ${passwordChangedAt.toISOString()}`);
      
      // If token has iat (issued at), check if it was issued before password change
      if (decoded.iat) {
        const tokenIssuedAt = new Date(decoded.iat * 1000); // JWT iat is in seconds, convert to milliseconds
        console.log(`   Token issued at: ${tokenIssuedAt.toISOString()}`);
        
        if (tokenIssuedAt < passwordChangedAt) {
          console.log(`❌ TOKEN INVALIDATED: Token issued before password change for ${req.path}`);
          console.log(`   Token issued: ${tokenIssuedAt.toISOString()}`);
          console.log(`   Password changed: ${passwordChangedAt.toISOString()}`);
          res.status(401).json({ 
            success: false,
            message: "Session expired. Please login again." 
          });
          return;
        } else {
          console.log(`✅ Token issued after password change - allowing access`);
        }
      } else {
        // If token doesn't have iat, invalidate it anyway if passwordChangedAt exists
        // This is a safety measure - if password was changed, all tokens should be invalid
        console.log(`❌ TOKEN INVALIDATED: Token missing iat claim and password was changed - invalidating for ${req.path}`);
        res.status(401).json({ 
          success: false,
          message: "Session expired. Please login again." 
        });
        return;
      }
    } else {
      console.log(`✅ No password change detected - token valid`);
    }
    
    req.user = user;
    console.log(`✅ Auth successful for ${req.path}`);
    
    next();
  } catch (err) {
    console.log(`❌ JWT error for ${req.path}:`, err.message);
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

    const userRole = req.user.role.name;
    const allowedRoles = typeof roles === "string" ? [roles] : roles;

    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({ 
        success: false,
        message: "Forbidden: insufficient permissions" 
      });
      return;
    }

    next();
  };
}