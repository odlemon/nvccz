// @ts-nocheck

import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { prisma } from "../utils/database";
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
        include: {
          role: true
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
        roleName: user.role.name,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        permissions: user.role.permissions
      }, JWT_SECRET, { expiresIn: "7d" });

      return res.status(200).json({
        success: true,
        message: "Logged in successfully",
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role.name,
          permissions: user.role.permissions
        }
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
        include: {
          role: true
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
          role: user.role.name,
          permissions: user.role.permissions
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();