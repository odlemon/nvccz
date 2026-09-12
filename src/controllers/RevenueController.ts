// @ts-nocheck
import { Request, Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import RevenueService, { CreateRevenueParams } from "../services/RevenueService";
import { parseDate } from "../utils/dateHelper";

export class RevenueController {
  /**
   * Create a new revenue
   */
  async createRevenue(req: AuthRequest, res: Response) {
    try {
      const {
        sourceId,
        categoryId,
        amount,
        currencyId,
        transactionDate,
        description,
        isTaxable,
        paymentMethod,
        paymentBankId,
      } = req.body;

      // Validate required fields
      if (!sourceId || !amount || !currencyId || !transactionDate || !description) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: sourceId, amount, currencyId, transactionDate, description"
        });
      }

      const revenueParams: CreateRevenueParams = {
        sourceId,
        categoryId,
        amount: parseFloat(amount),
        currencyId,
        transactionDate: parseDate(transactionDate),
        description,
        isTaxable: Boolean(isTaxable),
        paymentMethod,
        createdById: req.user!.id,
        paymentBankId,
      };

      const revenue = await RevenueService.createRevenue(revenueParams);

      res.status(201).json({
        success: true,
        message: "Revenue created successfully",
        data: revenue
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to create revenue",
        error: error.message
      });
    }
  }

  /**
   * Get all revenues with optional filtering
   */
  async getRevenues(req: AuthRequest, res: Response) {
    try {
      const {
        sourceId,
        categoryId,
        currencyId,
        isTaxable,
        paymentMethod,
        status,
        isActive,
        startDate,
        endDate
      } = req.query;

      const filters: any = {};
      if (sourceId) filters.sourceId = sourceId as string;
      if (categoryId) filters.categoryId = categoryId as string;
      if (currencyId) filters.currencyId = currencyId as string;
      if (isTaxable !== undefined) filters.isTaxable = isTaxable === 'true';
      if (paymentMethod) filters.paymentMethod = paymentMethod as string;
      if (status) filters.status = status as string;
      if (isActive !== undefined) filters.isActive = isActive === 'true';
      if (startDate) filters.startDate = parseDate(startDate as string);
      if (endDate) filters.endDate = parseDate(endDate as string);

      const revenues = await RevenueService.getRevenues(filters);

      res.status(200).json({
        success: true,
        message: "Revenues retrieved successfully",
        data: revenues
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve revenues",
        error: error.message
      });
    }
  }

  /**
   * Get a single revenue by ID
   */
  async getRevenueById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const revenue = await RevenueService.getRevenueById(id);

      if (!revenue) {
        return res.status(404).json({
          success: false,
          message: "Revenue not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "Revenue retrieved successfully",
        data: revenue
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to retrieve revenue",
        error: error.message
      });
    }
  }

  /**
   * Update a revenue
   */
  async updateRevenue(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const revenue = await RevenueService.updateRevenue(id, updateData);

      res.status(200).json({
        success: true,
        message: "Revenue updated successfully",
        data: revenue
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to update revenue",
        error: error.message
      });
    }
  }

  /**
   * Delete a revenue (soft delete)
   */
  async deleteRevenue(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const revenue = await RevenueService.deleteRevenue(id);

      res.status(200).json({
        success: true,
        message: "Revenue deleted successfully",
        data: revenue
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to delete revenue",
        error: error.message
      });
    }
  }
}

export default RevenueController; 