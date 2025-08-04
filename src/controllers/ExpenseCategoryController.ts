// @ts-nocheck
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { dbConnection } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";

const prisma = dbConnection.getPrismaClient();

export class ExpenseCategoryController {
  /**
   * Create a new expense category
   */
  async createCategory(req: AuthRequest, res: Response) {
    try {
      const { name, description, parentId } = req.body;

      // Validation
      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Category name is required"
        });
      }

      // Check if category name already exists
      const existingCategory = await prisma.expenseCategory.findFirst({
        where: { 
          name: { equals: name },
          isActive: true
        }
      });

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: "Category with this name already exists"
        });
      }

      // If parentId is provided, check if parent exists
      if (parentId) {
        const parentCategory = await prisma.expenseCategory.findUnique({
          where: { id: parentId }
        });

        if (!parentCategory) {
          return res.status(400).json({
            success: false,
            message: "Parent category not found"
          });
        }
      }

      const category = await prisma.expenseCategory.create({
        data: {
          name,
          description,
          parentId
        }
      });

      res.status(201).json({
        success: true,
        message: "Category created successfully",
        data: category
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to create category",
        error: error.message
      });
    }
  }

  /**
   * Get all categories
   */
  async getCategories(req: AuthRequest, res: Response) {
    try {
      const { isActive, parentId, includeChildren } = req.query;
      
      const where: any = {};
      
      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      } else {
        where.isActive = true; // Default to active categories
      }

      if (parentId !== undefined) {
        if (parentId === 'null' || parentId === '') {
          where.parentId = null; // Root categories only
        } else {
          where.parentId = parentId;
        }
      }

      const include: any = {};
      if (includeChildren === 'true') {
        include.children = {
          where: { isActive: true },
          orderBy: { name: 'asc' }
        };
      }

      const categories = await prisma.expenseCategory.findMany({
        where,
        include,
        orderBy: { name: 'asc' }
      });

      res.status(200).json({
        success: true,
        data: categories
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch categories",
        error: error.message
      });
    }
  }

  /**
   * Get category by ID
   */
  async getCategoryById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const category = await prisma.expenseCategory.findUnique({
        where: { id },
        include: {
          parent: true,
          children: {
            where: { isActive: true },
            orderBy: { name: 'asc' }
          },
          expenses: {
            orderBy: { transactionDate: 'desc' },
            take: 10 // Get last 10 expenses
          }
        }
      });

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found"
        });
      }

      res.status(200).json({
        success: true,
        data: category
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch category",
        error: error.message
      });
    }
  }

  /**
   * Update category
   */
  async updateCategory(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, parentId, isActive } = req.body;

      // Check if category exists
      const existingCategory = await prisma.expenseCategory.findUnique({
        where: { id }
      });

      if (!existingCategory) {
        return res.status(404).json({
          success: false,
          message: "Category not found"
        });
      }

      // If updating name, check if new name already exists
      if (name && name !== existingCategory.name) {
        const nameExists = await prisma.expenseCategory.findFirst({
          where: { 
            name: { equals: name },
            id: { not: id },
            isActive: true
          }
        });

        if (nameExists) {
          return res.status(400).json({
            success: false,
            message: "Category with this name already exists"
          });
        }
      }

      // If updating parentId, check if parent exists and prevent circular reference
      if (parentId !== undefined && parentId !== existingCategory.parentId) {
        if (parentId) {
          const parentCategory = await prisma.expenseCategory.findUnique({
            where: { id: parentId }
          });

          if (!parentCategory) {
            return res.status(400).json({
              success: false,
              message: "Parent category not found"
            });
          }

          // Prevent circular reference (category cannot be its own parent)
          if (parentId === id) {
            return res.status(400).json({
              success: false,
              message: "Category cannot be its own parent"
            });
          }
        }
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (parentId !== undefined) updateData.parentId = parentId;
      if (isActive !== undefined) updateData.isActive = isActive;

      const category = await prisma.expenseCategory.update({
        where: { id },
        data: updateData
      });

      res.status(200).json({
        success: true,
        message: "Category updated successfully",
        data: category
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to update category",
        error: error.message
      });
    }
  }

  /**
   * Delete category (soft delete)
   */
  async deleteCategory(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      // Check if category exists
      const category = await prisma.expenseCategory.findUnique({
        where: { id }
      });

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found"
        });
      }

      // Check if category has expenses
      const expenseCount = await prisma.expense.count({
        where: { categoryId: id }
      });

      if (expenseCount > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete category that has associated expenses"
        });
      }

      // Check if category has children
      const childrenCount = await prisma.expenseCategory.count({
        where: { parentId: id, isActive: true }
      });

      if (childrenCount > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete category that has subcategories"
        });
      }

      // Soft delete by setting isActive to false
      await prisma.expenseCategory.update({
        where: { id },
        data: { isActive: false }
      });

      res.status(200).json({
        success: true,
        message: "Category deleted successfully"
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to delete category",
        error: error.message
      });
    }
  }

  /**
   * Get category expenses
   */
  async getCategoryExpenses(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      // Check if category exists
      const category = await prisma.expenseCategory.findUnique({
        where: { id }
      });

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found"
        });
      }

      const [expenses, total] = await Promise.all([
        prisma.expense.findMany({
          where: { categoryId: id },
          include: {
            vendor: true,
            currency: true
          },
          orderBy: { transactionDate: 'desc' },
          skip,
          take: Number(limit)
        }),
        prisma.expense.count({
          where: { categoryId: id }
        })
      ]);

      res.status(200).json({
        success: true,
        data: {
          expenses,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch category expenses",
        error: error.message
      });
    }
  }
}

export const expenseCategoryController = new ExpenseCategoryController(); 