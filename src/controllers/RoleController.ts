import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { dbConnection } from "../utils/database";

const prisma = dbConnection.getPrismaClient();

export class RoleController {
  // Create a new role
  async createRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, description, permissions } = req.body;

      // Validate required fields
      if (!name || !permissions) {
        res.status(400).json({
          success: false,
          message: "Name and permissions are required"
        });
        return;
      }

      // Check if role name already exists
      const existingRole = await prisma.role.findUnique({
        where: { name: name.toLowerCase() }
      });

      if (existingRole) {
        res.status(409).json({
          success: false,
          message: "Role with this name already exists"
        });
        return;
      }

      // Create the role
      const role = await prisma.role.create({
        data: {
          name: name.toLowerCase(),
          description: description || null,
          permissions: permissions
        }
      });

      res.status(201).json({
        success: true,
        message: "Role created successfully",
        data: role
      });
    } catch (error) {
      next(error);
    }
  }

  // Get all roles
  async getAllRoles(req: Request, res: Response, next: NextFunction) {
    try {
      const roles = await prisma.role.findMany({
        include: {
          _count: {
            select: {
              users: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      res.status(200).json({
        success: true,
        data: roles
      });
    } catch (error) {
      next(error);
    }
  }

  // Get role by ID
  async getRoleById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const role = await prisma.role.findUnique({
        where: { id },
        include: {
          users: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              createdAt: true
            }
          },
          _count: {
            select: {
              users: true
            }
          }
        }
      });

      if (!role) {
        res.status(404).json({
          success: false,
          message: "Role not found"
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: role
      });
    } catch (error) {
      next(error);
    }
  }

  // Update role
  async updateRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, description, permissions } = req.body;

      // Check if role exists
      const existingRole = await prisma.role.findUnique({
        where: { id }
      });

      if (!existingRole) {
        res.status(404).json({
          success: false,
          message: "Role not found"
        });
        return;
      }

      // If name is being updated, check for duplicates
      if (name && name !== existingRole.name) {
        const duplicateRole = await prisma.role.findUnique({
          where: { name: name.toLowerCase() }
        });

        if (duplicateRole) {
          res.status(409).json({
            success: false,
            message: "Role with this name already exists"
          });
          return;
        }
      }

      // Update the role
      const updatedRole = await prisma.role.update({
        where: { id },
        data: {
          name: name ? name.toLowerCase() : undefined,
          description: description !== undefined ? description : undefined,
          permissions: permissions || undefined
        }
      });

      res.status(200).json({
        success: true,
        message: "Role updated successfully",
        data: updatedRole
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete role
  async deleteRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // Check if role exists
      const existingRole = await prisma.role.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              users: true
            }
          }
        }
      });

      if (!existingRole) {
        res.status(404).json({
          success: false,
          message: "Role not found"
        });
        return;
      }

      // Check if role has users assigned
      if (existingRole._count.users > 0) {
        res.status(400).json({
          success: false,
          message: "Cannot delete role that has users assigned to it"
        });
        return;
      }

      // Delete the role
      await prisma.role.delete({
        where: { id }
      });

      res.status(200).json({
        success: true,
        message: "Role deleted successfully"
      });
    } catch (error) {
      next(error);
    }
  }

  // Get role permissions
  async getRolePermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const role = await prisma.role.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          permissions: true
        }
      });

      if (!role) {
        res.status(404).json({
          success: false,
          message: "Role not found"
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          roleId: role.id,
          roleName: role.name,
          permissions: role.permissions
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const roleController = new RoleController(); 