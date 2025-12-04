// @ts-nocheck

import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { prisma } from "../utils/database";
import AuditService from "../services/AuditService";
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ 
          success: false, 
          message: "Email and password required." 
        });
      }

      const normalizedEmail = email.trim().toLowerCase();
      
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          password: true,
          userDepartment: true,
          roleCode: true,
          roleId: true,
          role: {
            select: {
              name: true
            }
          }
        }
      });

      if (!user) {
        return res.status(401).json({ 
          success: false, 
          message: "Invalid credentials." 
        });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ 
          success: false, 
          message: "Invalid credentials." 
        });
      }

      const token = jwt.sign({
        userId: user.id,
        roleId: user.roleId,
        roleName: user.roleCode,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        department: user.userDepartment,
        roleCode: user.roleCode
      }, JWT_SECRET, { expiresIn: "7d" });

      // Check if user is an applicant (applicants don't have roles - identified by having an application)
      const application = await prisma.application.findFirst({
        where: { applicantEmail: normalizedEmail }
      });
      const isApplicant = !!application;

      // Check if password has been changed by looking for PASSWORD_CHANGE audit log entry
      const passwordChangeLog = await prisma.auditLog.findFirst({
        where: {
          userId: user.id,
          action: "PASSWORD_CHANGE",
          entityType: "User",
          entityId: user.id
        },
        orderBy: {
          createdAt: "desc"
        }
      });
      const passwordChanged = !!passwordChangeLog;

      return res.status(200).json({
        success: true,
        message: "Logged in successfully",
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          department: user.userDepartment,
          role: user.roleCode,
          isApplicant: isApplicant,
          passwordChanged: passwordChanged // Flag to indicate if user has changed password from initial email
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.userId || (req as any).user?.id;
      const { currentPassword, newPassword } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized - user not found"
        });
      }

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password and new password are required"
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters long"
        });
      }

      // Get user with password
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          password: true
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect"
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password and set passwordChangedAt to invalidate old tokens
      await prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
          passwordChangedAt: new Date() // This will invalidate all existing tokens
        }
      });

      // Log password change in audit log (so we can track if password was changed)
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
      const userAgent = req.headers['user-agent'] || null;
      
      await AuditService.log({
        userId: userId,
        action: "PASSWORD_CHANGE",
        entityType: "User",
        entityId: userId,
        oldValues: { password: "***" }, // Don't log actual password
        newValues: { password: "***" }, // Don't log actual password
        ipAddress: typeof ipAddress === 'string' ? ipAddress : null,
        userAgent: typeof userAgent === 'string' ? userAgent : null
      });

      return res.status(200).json({
        success: true,
        message: "Password changed successfully"
      });
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          userDepartment: true,
          roleCode: true
        }
      });

      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: "User not found" 
        });
      }

      res.status(200).json({
        success: true,
        data: {
          userId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          department: user.userDepartment,
          role: user.roleCode
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();