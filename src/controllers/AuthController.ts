// @ts-nocheck

import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { prisma } from "../utils/database";
import AuditService from "../services/AuditService";
import { emailTransport, getFromAddress } from "../config/email.config";
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

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword
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

  /**
   * Request password reset - public endpoint
   * Sends a password reset email with a secure token link
   */
  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required"
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true, firstName: true, lastName: true }
      });

      // For security, always return success, even if user doesn't exist
      if (!user) {
        return res.status(200).json({
          success: true,
          message: "If an account with that email exists, a password reset link has been sent"
        });
      }

      // Invalidate any existing tokens for this user
      await prisma.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: {
            gt: new Date()
          }
        },
        data: {
          usedAt: new Date()
        }
      });

      // Generate secure token
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt
        }
      });

      const frontendUrl = process.env.FRONTEND_URL || "http://app.kyntaro.com";
      const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

      const from = getFromAddress("it");
      const subject = "Reset your NVCCZ account password";
      const html = `
        <h1>Reset Your Password</h1>
        <p>Hi ${user.firstName || "there"},</p>
        <p>We received a request to reset the password for your NVCCZ account.</p>
        <p>If you made this request, click the button below to reset your password:</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:4px;">
            Reset Password
          </a>
        </p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p>${resetUrl}</p>
        <p>This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
        <p>Best regards,<br/>NVCCZ IT Team</p>
      `;

      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${user.firstName} ${user.lastName}" <${user.email}>`,
        subject,
        html
      });

      return res.status(200).json({
        success: true,
        message: "If an account with that email exists, a password reset link has been sent"
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reset password using token - public endpoint
   */
  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Token and new password are required"
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters long"
        });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const resetRecord = await prisma.passwordResetToken.findFirst({
        where: {
          tokenHash,
          usedAt: null,
          expiresAt: {
            gt: new Date()
          }
        }
      });

      if (!resetRecord) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired reset token"
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: resetRecord.userId },
        select: { id: true }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { password: hashedPassword }
        }),
        prisma.passwordResetToken.update({
          where: { id: resetRecord.id },
          data: { usedAt: new Date() }
        })
      ]);

      return res.status(200).json({
        success: true,
        message: "Password has been reset successfully"
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