// @ts-nocheck
// src/middleware/authenticate.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { dbConnection } from "../utils/database";


const prisma = dbConnection.getPrismaClient();
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
      include: {
        role: true
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