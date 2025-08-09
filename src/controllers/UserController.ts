// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { dbConnection } from "../utils/database";

const prisma = dbConnection.getPrismaClient();

export class UserController {
  // Create a new user
  async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { firstName, lastName, email, password, roleId, backgroundImage } = req.body;

      // Validate required fields
      if (!firstName || !lastName || !email || !password || !roleId) {
        res.status(400).json({
          success: false,
          message: "All fields are required"
        });
        return;
      }

      // Check if email already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (existingUser) {
        res.status(409).json({
          success: false,
          message: "User with this email already exists"
        });
        return;
      }

      // Check if role exists
      const role = await prisma.role.findUnique({
        where: { id: roleId }
      });

      if (!role) {
        res.status(404).json({
          success: false,
          message: "Role not found"
        });
        return;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await prisma.user.create({
        data: {
          firstName,
          lastName,
          email: email.toLowerCase(),
          password: hashedPassword,
          roleId,
          backgroundImage
        },
        include: {
          role: {
            select: {
              id: true,
              name: true,
              description: true
            }
          }
        }
      });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: userWithoutPassword
      });
    } catch (error) {
      next(error);
    }
  }

  // Get all users
  async getAllUsers(req: Request, res: Response, next: NextFunction) {
    try {
      // Update user's last seen
      const userId = (req as any).user?.id;
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: { lastSeen: new Date() }
        });
      }

      const users = await prisma.user.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          backgroundImage: true,
          createdAt: true,
          updatedAt: true,
          lastSeen: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      res.status(200).json({
        success: true,
        data: users
      });
    } catch (error) {
      next(error);
    }
  }

  // Get user by ID
  async getUserById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          backgroundImage: true,
          createdAt: true,
          updatedAt: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              permissions: true
            }
          }
        }
      });

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found"
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  // Update user
  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { firstName, lastName, email, roleId, backgroundImage } = req.body;

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });

      if (!existingUser) {
        res.status(404).json({
          success: false,
          message: "User not found"
        });
        return;
      }

      // If email is being updated, check for duplicates
      if (email && email !== existingUser.email) {
        const duplicateUser = await prisma.user.findUnique({
          where: { email: email.toLowerCase() }
        });

        if (duplicateUser) {
          res.status(409).json({
            success: false,
            message: "User with this email already exists"
          });
          return;
        }
      }

      // If roleId is being updated, check if role exists
      if (roleId && roleId !== existingUser.roleId) {
        const role = await prisma.role.findUnique({
          where: { id: roleId }
        });

        if (!role) {
          res.status(404).json({
            success: false,
            message: "Role not found"
          });
          return;
        }
      }

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          email: email ? email.toLowerCase() : undefined,
          roleId: roleId || undefined,
          backgroundImage: backgroundImage || undefined
        },
        include: {
          role: {
            select: {
              id: true,
              name: true,
              description: true
            }
          }
        }
      });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = updatedUser;

      res.status(200).json({
        success: true,
        message: "User updated successfully",
        data: userWithoutPassword
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete user
  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });

      if (!existingUser) {
        res.status(404).json({
          success: false,
          message: "User not found"
        });
        return;
      }

      // Prevent deleting the last admin user
      if (existingUser.roleId) {
        const role = await prisma.role.findUnique({
          where: { id: existingUser.roleId }
        });

        if (role?.name === 'admin') {
          const adminUsers = await prisma.user.count({
            where: {
              role: {
                name: 'admin'
              }
            }
          });

          if (adminUsers <= 1) {
            res.status(400).json({
              success: false,
              message: "Cannot delete the last admin user"
            });
            return;
          }
        }
      }

      // Delete user
      await prisma.user.delete({
        where: { id }
      });

      res.status(200).json({
        success: true,
        message: "User deleted successfully"
      });
    } catch (error) {
      next(error);
    }
  }

  // Change user password
  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({
          success: false,
          message: "Current password and new password are required"
        });
        return;
      }

      // Get user with password
      const user = await prisma.user.findUnique({
        where: { id }
      });

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found"
        });
        return;
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        res.status(400).json({
          success: false,
          message: "Current password is incorrect"
        });
        return;
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      await prisma.user.update({
        where: { id },
        data: {
          password: hashedNewPassword
        }
      });

      res.status(200).json({
        success: true,
        message: "Password changed successfully"
      });
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController(); 