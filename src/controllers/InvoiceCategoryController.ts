// @ts-nocheck
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { dbConnection } from "../utils/database";
import { responseHelper } from "../utils/responseHelper";
import { logger } from "../utils/logger";

const prisma = dbConnection.getPrismaClient();

export class InvoiceCategoryController {
  /**
   * Create a new invoice category
   */
  static async createInvoiceCategory(req: Request, res: Response): Promise<void> {
    try {
      const {
        name,
        description,
        parentId
      } = req.body;

      // Validate required fields
      if (!name) {
        responseHelper.sendError(res, 400, "Category name is required");
        return;
      }

      const category = await prisma.invoiceCategory.create({
        data: {
          name,
          description,
          parentId
        }
      });

      logger.info("Invoice category created successfully", {
        categoryId: category.id,
        name: category.name
      });

      responseHelper.sendSuccess(res, 201, "Invoice category created successfully", category);
    } catch (error: any) {
      logger.error("Error creating invoice category", { error: error.message });
      responseHelper.sendError(res, 500, `Failed to create invoice category: ${error.message}`);
    }
  }

  /**
   * Get invoice category by ID
   */
  static async getInvoiceCategoryById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        responseHelper.sendError(res, 400, "Category ID is required");
        return;
      }

      const category = await prisma.invoiceCategory.findUnique({
        where: { id },
        include: {
          parent: true,
          children: true
        }
      });

      if (!category) {
        responseHelper.sendError(res, 404, "Invoice category not found");
        return;
      }

      responseHelper.sendSuccess(res, 200, "Invoice category retrieved successfully", category);
    } catch (error: any) {
      logger.error("Error getting invoice category", { error: error.message });
      responseHelper.sendError(res, 500, `Failed to get invoice category: ${error.message}`);
    }
  }

  /**
   * Get invoice categories with filtering and pagination
   */
  static async getInvoiceCategories(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        parentId
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      // Build where clause
      const where: any = { isActive: true };
      if (search) {
        where.name = { contains: search as string, mode: "insensitive" };
      }
      if (parentId) {
        where.parentId = parentId;
      }

      const [categories, total] = await Promise.all([
        prisma.invoiceCategory.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { name: 'asc' },
          include: {
            parent: true,
            children: true
          }
        }),
        prisma.invoiceCategory.count({ where })
      ]);

      const result = {
        categories,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      };

      responseHelper.sendSuccess(res, 200, "Invoice categories retrieved successfully", result);
    } catch (error: any) {
      logger.error("Error getting invoice categories", { error: error.message });
      responseHelper.sendError(res, 500, `Failed to get invoice categories: ${error.message}`);
    }
  }

  /**
   * Update an invoice category
   */
  static async updateInvoiceCategory(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;

      if (!id) {
        responseHelper.sendError(res, 400, "Category ID is required");
        return;
      }

      const updatedCategory = await prisma.invoiceCategory.update({
        where: { id },
        data: updateData
      });

      logger.info("Invoice category updated successfully", {
        categoryId: id
      });

      responseHelper.sendSuccess(res, 200, "Invoice category updated successfully", updatedCategory);
    } catch (error: any) {
      logger.error("Error updating invoice category", { error: error.message });
      responseHelper.sendError(res, 500, `Failed to update invoice category: ${error.message}`);
    }
  }

  /**
   * Delete an invoice category (soft delete)
   */
  static async deleteInvoiceCategory(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        responseHelper.sendError(res, 400, "Category ID is required");
        return;
      }

      await prisma.invoiceCategory.update({
        where: { id },
        data: { isActive: false }
      });

      logger.info("Invoice category deleted successfully", {
        categoryId: id
      });

      responseHelper.sendSuccess(res, 200, "Invoice category deleted successfully");
    } catch (error: any) {
      logger.error("Error deleting invoice category", { error: error.message });
      responseHelper.sendError(res, 500, `Failed to delete invoice category: ${error.message}`);
    }
  }
} 