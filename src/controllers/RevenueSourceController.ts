// @ts-nocheck
import { Request, Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { PrismaClient } from "@prisma/client";
import { ResponseHelper } from "../utils/responseHelper";

const prisma = new PrismaClient();

export class RevenueSourceController {
  /**
   * Create a new revenue source
   */
  static async createRevenueSource(req: AuthRequest, res: Response) {
    try {
      const { name, description } = req.body;

      // Validate required fields
      if (!name || name.trim().length === 0) {
        return ResponseHelper.badRequest(res, "Name is required");
      }

      // Check if revenue source with same name already exists
      const existingSource = await prisma.revenueSource.findUnique({
        where: { name: name.trim() }
      });

      if (existingSource) {
        return ResponseHelper.conflict(res, "Revenue source with this name already exists");
      }

      const revenueSource = await prisma.revenueSource.create({
        data: {
          name: name.trim(),
          description: description?.trim()
        }
      });

      return ResponseHelper.created(res, "Revenue source created successfully", revenueSource);
    } catch (error: any) {
      console.error("Error creating revenue source:", error);
      return ResponseHelper.serverError(res, "Failed to create revenue source", error.message);
    }
  }

  /**
   * Get all revenue sources
   */
  static async getAllRevenueSources(req: AuthRequest, res: Response) {
    try {
      const { isActive } = req.query;

      const where: any = {};
      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const revenueSources = await prisma.revenueSource.findMany({
        where,
        orderBy: { name: 'asc' }
      });

      return ResponseHelper.success(res, "Revenue sources retrieved successfully", revenueSources);
    } catch (error: any) {
      console.error("Error getting revenue sources:", error);
      return ResponseHelper.serverError(res, "Failed to retrieve revenue sources", error.message);
    }
  }

  /**
   * Get revenue source by ID
   */
  static async getRevenueSourceById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const revenueSource = await prisma.revenueSource.findUnique({
        where: { id }
      });

      if (!revenueSource) {
        return ResponseHelper.notFound(res, "Revenue source not found");
      }

      return ResponseHelper.success(res, "Revenue source retrieved successfully", revenueSource);
    } catch (error: any) {
      console.error("Error getting revenue source:", error);
      return ResponseHelper.serverError(res, "Failed to retrieve revenue source", error.message);
    }
  }

  /**
   * Update revenue source
   */
  static async updateRevenueSource(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, isActive } = req.body;

      // Check if revenue source exists
      const existingSource = await prisma.revenueSource.findUnique({
        where: { id }
      });

      if (!existingSource) {
        return ResponseHelper.notFound(res, "Revenue source not found");
      }

      // If name is being updated, check for duplicates
      if (name && name.trim() !== existingSource.name) {
        const duplicateSource = await prisma.revenueSource.findUnique({
          where: { name: name.trim() }
        });

        if (duplicateSource) {
          return ResponseHelper.conflict(res, "Revenue source with this name already exists");
        }
      }

      const updatedSource = await prisma.revenueSource.update({
        where: { id },
        data: {
          ...(name && { name: name.trim() }),
          ...(description !== undefined && { description: description?.trim() }),
          ...(isActive !== undefined && { isActive })
        }
      });

      return ResponseHelper.success(res, "Revenue source updated successfully", updatedSource);
    } catch (error: any) {
      console.error("Error updating revenue source:", error);
      return ResponseHelper.serverError(res, "Failed to update revenue source", error.message);
    }
  }

  /**
   * Delete revenue source (soft delete)
   */
  static async deleteRevenueSource(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      // Check if revenue source exists
      const existingSource = await prisma.revenueSource.findUnique({
        where: { id }
      });

      if (!existingSource) {
        return ResponseHelper.notFound(res, "Revenue source not found");
      }

      // Check if revenue source is being used
      const revenuesUsingSource = await prisma.revenue.findFirst({
        where: { sourceId: id }
      });

      if (revenuesUsingSource) {
        return ResponseHelper.badRequest(res, "Cannot delete revenue source that is being used by revenues");
      }

      const deletedSource = await prisma.revenueSource.update({
        where: { id },
        data: { isActive: false }
      });

      return ResponseHelper.success(res, "Revenue source deleted successfully", deletedSource);
    } catch (error: any) {
      console.error("Error deleting revenue source:", error);
      return ResponseHelper.serverError(res, "Failed to delete revenue source", error.message);
    }
  }
}

export default RevenueSourceController; 