// @ts-nocheck
import { Request, Response } from "express";
import { KPIService } from "../services/KPIService";

export class KPIController {
  // Create a new KPI
  static async createKPI(req: Request, res: Response) {
    try {
      const {
        name,
        type,
        branch,
        weightValue,
        hasUnit,
        unitCategory,
        unit,
        unitSymbol,
        unitPosition
      } = req.body;

      if (!name || !type) {
        return res.status(400).json({
          success: false,
          message: "KPI name and type are required"
        });
      }

      if (!["Metric", "Percentage"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "KPI type must be either 'Metric' or 'Percentage'"
        });
      }

      const kpi = await KPIService.createKPI({
        name,
        type,
        branch,
        weightValue,
        hasUnit,
        unitCategory,
        unit,
        unitSymbol,
        unitPosition
      });

      res.status(201).json({
        success: true,
        message: "KPI created successfully",
        kpi
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get all KPIs
  static async getAllKPIs(req: Request, res: Response) {
    try {
      const {
        type,
        branch,
        isActive,
        hasUnit,
        search
      } = req.query;

      const filters: any = {};
      if (type) filters.type = type as string;
      if (branch) filters.branch = branch as string;
      if (isActive !== undefined) filters.isActive = isActive === 'true';
      if (hasUnit !== undefined) filters.hasUnit = hasUnit === 'true';
      if (search) filters.search = search as string;

      const kpis = await KPIService.getAllKPIs(filters);

      res.status(200).json({
        success: true,
        count: kpis.length,
        kpis
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get KPI by ID
  static async getKPIById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const kpi = await KPIService.getKPIById(id);

      res.status(200).json({
        success: true,
        kpi
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update KPI
  static async updateKPI(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        name,
        type,
        branch,
        weightValue,
        hasUnit,
        unitCategory,
        unit,
        unitSymbol,
        unitPosition,
        isActive
      } = req.body;

      if (type && !["Metric", "Percentage"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "KPI type must be either 'Metric' or 'Percentage'"
        });
      }

      const kpi = await KPIService.updateKPI(id, {
        name,
        type,
        branch,
        weightValue,
        hasUnit,
        unitCategory,
        unit,
        unitSymbol,
        unitPosition,
        isActive
      });

      res.status(200).json({
        success: true,
        message: "KPI updated successfully",
        kpi
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Delete KPI
  static async deleteKPI(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const result = await KPIService.deleteKPI(id);

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get KPI statistics
  static async getKPIStatistics(req: Request, res: Response) {
    try {
      const statistics = await KPIService.getKPIStatistics();

      res.status(200).json({
        success: true,
        statistics
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}
