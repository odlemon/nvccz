// @ts-nocheck
import { Request, Response } from "express";
import { RiskAssessmentService } from "../services/RiskAssessmentService";

export class RiskAssessmentController {
  // Create a new risk assessment
  static async createRiskAssessment(req: Request, res: Response) {
    try {
      const createdById = req.user.id;
      const assessment = await RiskAssessmentService.createRiskAssessment(req.body, createdById);
      
      res.status(201).json({
        success: true,
        message: "Risk assessment created successfully",
        assessment
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get all risk assessments
  static async getAllRiskAssessments(req: Request, res: Response) {
    try {
      const filters = req.query;
      const assessments = await RiskAssessmentService.getAllRiskAssessments(filters);
      
      res.status(200).json({
        success: true,
        assessments
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get risk assessment by ID
  static async getRiskAssessmentById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const assessment = await RiskAssessmentService.getRiskAssessmentById(id);
      
      res.status(200).json({
        success: true,
        assessment
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update risk assessment
  static async updateRiskAssessment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const assessment = await RiskAssessmentService.updateRiskAssessment(id, req.body);
      
      res.status(200).json({
        success: true,
        message: "Risk assessment updated successfully",
        assessment
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Delete risk assessment
  static async deleteRiskAssessment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await RiskAssessmentService.deleteRiskAssessment(id);
      
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

  // Create risk assessment sub-task
  static async createRiskAssessmentSubTask(req: Request, res: Response) {
    try {
      const subTask = await RiskAssessmentService.createRiskAssessmentSubTask(req.body);
      
      res.status(201).json({
        success: true,
        message: "Risk assessment sub-task created successfully",
        subTask
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update risk assessment sub-task
  static async updateRiskAssessmentSubTask(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const subTask = await RiskAssessmentService.updateRiskAssessmentSubTask(id, req.body);
      
      res.status(200).json({
        success: true,
        message: "Risk assessment sub-task updated successfully",
        subTask
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get risk assessment sub-tasks
  static async getRiskAssessmentSubTasks(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const subTasks = await RiskAssessmentService.getRiskAssessmentSubTasks(id);
      
      res.status(200).json({
        success: true,
        subTasks
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Add risk assessment history
  static async addRiskAssessmentHistory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const history = await RiskAssessmentService.addRiskAssessmentHistory(id, req.body);
      
      res.status(201).json({
        success: true,
        message: "Risk assessment history added successfully",
        history
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get risk assessment history
  static async getRiskAssessmentHistory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const history = await RiskAssessmentService.getRiskAssessmentHistory(id);
      
      res.status(200).json({
        success: true,
        history
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get risk assessment analytics
  static async getRiskAssessmentAnalytics(req: Request, res: Response) {
    try {
      const filters = req.query;
      const analytics = await RiskAssessmentService.getRiskAssessmentAnalytics(filters);
      
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
