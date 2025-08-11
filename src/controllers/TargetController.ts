// @ts-nocheck
import { Request, Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import TargetService, { CreateTargetParams, UpdateTargetParams } from "../services/TargetService";

export class TargetController {
  /**
   * Create a new target
   */
  async createTarget(req: AuthRequest, res: Response) {
    try {
      const { type, value, deadline } = req.body;

      // Validate required fields
      if (!type || !value || !deadline) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: type, value, deadline"
        });
      }

      const targetParams: CreateTargetParams = {
        type,
        value: parseFloat(value),
        deadline: new Date(deadline),
        createdById: req.user!.id
      };

      const target = await TargetService.createTarget(targetParams);

      res.status(201).json({
        success: true,
        message: "Target created successfully",
        data: target
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to create target",
        error: error.message
      });
    }
  }

  /**
   * Get target by ID
   */
  async getTargetById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const target = await TargetService.getTargetById(id);

      if (!target) {
        return res.status(404).json({
          success: false,
          message: "Target not found"
        });
      }

      res.status(200).json({
        success: true,
        data: target
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to get target",
        error: error.message
      });
    }
  }

  /**
   * Get all targets with filtering and pagination
   */
  async getTargets(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        type,
        isActive
      } = req.query;

      const params = {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        type: type as string,
        isActive: isActive !== undefined ? isActive === "true" : undefined
      };

      const result = await TargetService.getTargets(params);

      res.status(200).json({
        success: true,
        data: result.targets,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to get targets",
        error: error.message
      });
    }
  }

  /**
   * Update target
   */
  async updateTarget(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { type, value, deadline, isActive } = req.body;

      const updateData: UpdateTargetParams = {};
      if (type) updateData.type = type;
      if (value !== undefined) updateData.value = parseFloat(value);
      if (deadline) updateData.deadline = new Date(deadline);
      if (isActive !== undefined) updateData.isActive = Boolean(isActive);

      const target = await TargetService.updateTarget(id, updateData);

      res.status(200).json({
        success: true,
        message: "Target updated successfully",
        data: target
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to update target",
        error: error.message
      });
    }
  }

  /**
   * Delete target
   */
  async deleteTarget(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      await TargetService.deleteTarget(id);

      res.status(200).json({
        success: true,
        message: "Target deleted successfully"
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to delete target",
        error: error.message
      });
    }
  }

  /**
   * Get target summary
   */
  async getTargetSummary(req: AuthRequest, res: Response) {
    try {
      const summary = await TargetService.getTargetSummary();

      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to get target summary",
        error: error.message
      });
    }
  }


}

export const targetController = new TargetController(); 