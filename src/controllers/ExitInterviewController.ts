// @ts-nocheck
import { Request, Response } from "express";
import { ExitInterviewService } from "../services/ExitInterviewService";

export class ExitInterviewController {
  // Create a new exit interview
  static async createExitInterview(req: Request, res: Response) {
    try {
      const conductedById = req.user.id;
      const exitInterview = await ExitInterviewService.createExitInterview(req.body, conductedById);
      
      res.status(201).json({
        success: true,
        message: "Exit interview created successfully",
        exitInterview
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get all exit interviews
  static async getAllExitInterviews(req: Request, res: Response) {
    try {
      const filters = req.query;
      const exitInterviews = await ExitInterviewService.getAllExitInterviews(filters);
      
      res.status(200).json({
        success: true,
        exitInterviews
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get exit interview by ID
  static async getExitInterviewById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const exitInterview = await ExitInterviewService.getExitInterviewById(id);
      
      res.status(200).json({
        success: true,
        exitInterview
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update exit interview
  static async updateExitInterview(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const exitInterview = await ExitInterviewService.updateExitInterview(id, req.body);
      
      res.status(200).json({
        success: true,
        message: "Exit interview updated successfully",
        exitInterview
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Delete exit interview
  static async deleteExitInterview(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await ExitInterviewService.deleteExitInterview(id);
      
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

  // Get turnover analysis
  static async getTurnoverAnalysis(req: Request, res: Response) {
    try {
      const filters = req.query;
      const analysis = await ExitInterviewService.getTurnoverAnalysis(filters);
      
      res.status(200).json({
        success: true,
        analysis
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get turnover analytics
  static async getTurnoverAnalytics(req: Request, res: Response) {
    try {
      const filters = req.query;
      const analytics = await ExitInterviewService.getTurnoverAnalytics(filters);
      
      res.status(200).json({
        success: true,
        analytics
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}
