// @ts-nocheck
import { Request, Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { PrismaClient } from "@prisma/client";
import { ResponseHelper } from "../utils/responseHelper";

import { dbConnection } from '../utils/database';
const prisma = dbConnection.getPrismaClient();

export class RevenueCategoryController {
  /**
   * Create a new revenue category
   */
  static async createRevenueCategory(req: AuthRequest, res: Response) {
    try {
      const { name, description, parentId } = req.body;

      // Validate required fields
      if (!name || name.trim().length === 0) {
        return ResponseHelper.badRequest(res, "Name is required");
      }

      // Check if revenue category with same name already exists
      const existingCategory = await prisma.revenueCategory.findUnique({
        where: { name: name.trim() }
      });

      if (existingCategory) {
        return ResponseHelper.conflict(res, "Revenue category with this name already exists");
      }

      // Validate parent category if provided
      if (parentId) {
        const parentCategory = await prisma.revenueCategory.findUnique({
          where: { id: parentId }
        });

        if (!parentCategory) {
          return ResponseHelper.badRequest(res, "Parent category not found");
        }
      }

      const revenueCategory = await prisma.revenueCategory.create({
        data: {
          name: name.trim(),
          description: description?.trim(),
          parentId
        }
      });

      return ResponseHelper.created(res, "Revenue category created successfully", revenueCategory);
    } catch (error: any) {
      console.error("Error creating revenue category:", error);
      return ResponseHelper.serverError(res, "Failed to create revenue category", error.message);
    }
  }

  /**
   * Get all revenue categories
   */
  static async getAllRevenueCategories(req: AuthRequest, res: Response) {
    try {
      const { isActive, parentId } = req.query;

      const where: any = {};
      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }
      if (parentId) {
        where.parentId = parentId as string;
      }

      const revenueCategories = await prisma.revenueCategory.findMany({
        where,
        include: {
          parent: {
            select: {
              id: true,
              name: true
            }
          },
          children: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { name: 'asc' }
      });

      return ResponseHelper.success(res, "Revenue categories retrieved successfully", revenueCategories);
    } catch (error: any) {
      console.error("Error getting revenue categories:", error);
      return ResponseHelper.serverError(res, "Failed to retrieve revenue categories", error.message);
    }
  }

  /**
   * Get revenue category by ID
   */
  static async getRevenueCategoryById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const revenueCategory = await prisma.revenueCategory.findUnique({
        where: { id },
        include: {
          parent: {
            select: {
              id: true,
              name: true
            }
          },
          children: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      if (!revenueCategory) {
        return ResponseHelper.notFound(res, "Revenue category not found");
      }

      return ResponseHelper.success(res, "Revenue category retrieved successfully", revenueCategory);
    } catch (error: any) {
      console.error("Error getting revenue category:", error);
      return ResponseHelper.serverError(res, "Failed to retrieve revenue category", error.message);
    }
  }

  /**
   * Update revenue category
   */
  static async updateRevenueCategory(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, parentId, isActive } = req.body;

      // Check if revenue category exists
      const existingCategory = await prisma.revenueCategory.findUnique({
        where: { id }
      });

      if (!existingCategory) {
        return ResponseHelper.notFound(res, "Revenue category not found");
      }

      // If name is being updated, check for duplicates
      if (name && name.trim() !== existingCategory.name) {
        const duplicateCategory = await prisma.revenueCategory.findUnique({
          where: { name: name.trim() }
        });

        if (duplicateCategory) {
          return ResponseHelper.conflict(res, "Revenue category with this name already exists");
        }
      }

      // Validate parent category if provided
      if (parentId) {
        const parentCategory = await prisma.revenueCategory.findUnique({
          where: { id: parentId }
        });

        if (!parentCategory) {
          return ResponseHelper.badRequest(res, "Parent category not found");
        }

        // Prevent circular references
        if (parentId === id) {
          return ResponseHelper.badRequest(res, "Category cannot be its own parent");
        }
      }

      const updatedCategory = await prisma.revenueCategory.update({
        where: { id },
        data: {
          ...(name && { name: name.trim() }),
          ...(description !== undefined && { description: description?.trim() }),
          ...(parentId !== undefined && { parentId }),
          ...(isActive !== undefined && { isActive })
        },
        include: {
          parent: {
            select: {
              id: true,
              name: true
            }
          },
          children: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      return ResponseHelper.success(res, "Revenue category updated successfully", updatedCategory);
    } catch (error: any) {
      console.error("Error updating revenue category:", error);
      return ResponseHelper.serverError(res, "Failed to update revenue category", error.message);
    }
  }

  /**
   * Delete revenue category (soft delete)
   */
  static async deleteRevenueCategory(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      // Check if revenue category exists
      const existingCategory = await prisma.revenueCategory.findUnique({
        where: { id }
      });

      if (!existingCategory) {
        return ResponseHelper.notFound(res, "Revenue category not found");
      }

      // Check if revenue category is being used
      const revenuesUsingCategory = await prisma.revenue.findFirst({
        where: { categoryId: id }
      });

      if (revenuesUsingCategory) {
        return ResponseHelper.badRequest(res, "Cannot delete revenue category that is being used by revenues");
      }

      // Check if category has children
      const childrenCategories = await prisma.revenueCategory.findMany({
        where: { parentId: id }
      });

      if (childrenCategories.length > 0) {
        return ResponseHelper.badRequest(res, "Cannot delete revenue category that has child categories");
      }

      const deletedCategory = await prisma.revenueCategory.update({
        where: { id },
        data: { isActive: false }
      });

      return ResponseHelper.success(res, "Revenue category deleted successfully", deletedCategory);
    } catch (error: any) {
      console.error("Error deleting revenue category:", error);
      return ResponseHelper.serverError(res, "Failed to delete revenue category", error.message);
    }
  }
}

export default RevenueCategoryController; 