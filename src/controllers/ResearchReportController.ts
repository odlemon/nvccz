// @ts-nocheck
import { Request, Response } from "express";
import { ResearchReportService } from "../services/ResearchReportService";

export class ResearchReportController {
  // Create a new research report
  static async createResearchReport(req: Request, res: Response) {
    try {
      const createdById = req.user.id;
      const report = await ResearchReportService.createResearchReport(req.body, createdById);
      
      res.status(201).json({
        success: true,
        message: "Research report created successfully",
        report
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get all research reports
  static async getAllResearchReports(req: Request, res: Response) {
    try {
      const filters = req.query;
      const reports = await ResearchReportService.getAllResearchReports(filters);
      
      res.status(200).json({
        success: true,
        reports
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get research report by ID
  static async getResearchReportById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const report = await ResearchReportService.getResearchReportById(id);
      
      res.status(200).json({
        success: true,
        report
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update research report
  static async updateResearchReport(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const report = await ResearchReportService.updateResearchReport(id, req.body);
      
      res.status(200).json({
        success: true,
        message: "Research report updated successfully",
        report
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Delete research report
  static async deleteResearchReport(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await ResearchReportService.deleteResearchReport(id);
      
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

  // Create research report activity
  static async createResearchReportActivity(req: Request, res: Response) {
    try {
      const userId = req.user.id;
      const activity = await ResearchReportService.createResearchReportActivity(req.body, userId);
      
      res.status(201).json({
        success: true,
        message: "Research report activity created successfully",
        activity
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get research report activities
  static async getResearchReportActivities(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const activities = await ResearchReportService.getResearchReportActivities(id);
      
      res.status(200).json({
        success: true,
        activities
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get quarterly report summary
  static async getQuarterlyReportSummary(req: Request, res: Response) {
    try {
      const { quarter, year } = req.query;
      
      if (!quarter || !year) {
        return res.status(400).json({
          success: false,
          message: "Quarter and year are required"
        });
      }

      const summary = await ResearchReportService.getQuarterlyReportSummary(
        quarter as string, 
        parseInt(year as string)
      );
      
      res.status(200).json({
        success: true,
        summary
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}
