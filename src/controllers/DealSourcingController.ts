// @ts-nocheck
import { Request, Response } from "express";
import { DealSourcingService } from "../services/DealSourcingService";

export class DealSourcingController {
  // Create a new deal sourcing goal
  static async createDealSourcingGoal(req: Request, res: Response) {
    try {
      const createdById = req.user.id;
      const goal = await DealSourcingService.createDealSourcingGoal(req.body, createdById);
      
      res.status(201).json({
        success: true,
        message: "Deal sourcing goal created successfully",
        goal
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get all deal sourcing goals
  static async getAllDealSourcingGoals(req: Request, res: Response) {
    try {
      const filters = req.query;
      const goals = await DealSourcingService.getAllDealSourcingGoals(filters);
      
      res.status(200).json({
        success: true,
        goals
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get deal sourcing goal by ID
  static async getDealSourcingGoalById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const goal = await DealSourcingService.getDealSourcingGoalById(id);
      
      res.status(200).json({
        success: true,
        goal
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update deal sourcing goal
  static async updateDealSourcingGoal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const goal = await DealSourcingService.updateDealSourcingGoal(id, req.body);
      
      res.status(200).json({
        success: true,
        message: "Deal sourcing goal updated successfully",
        goal
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Delete deal sourcing goal
  static async deleteDealSourcingGoal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await DealSourcingService.deleteDealSourcingGoal(id);
      
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

  // Create deal progress
  static async createDealProgress(req: Request, res: Response) {
    try {
      const dealProgress = await DealSourcingService.createDealProgress(req.body);
      
      res.status(201).json({
        success: true,
        message: "Deal progress created successfully",
        dealProgress
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get all deal progress
  static async getAllDealProgress(req: Request, res: Response) {
    try {
      const filters = req.query;
      const dealProgress = await DealSourcingService.getAllDealProgress(filters);
      
      res.status(200).json({
        success: true,
        dealProgress
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get deal progress by ID
  static async getDealProgressById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const dealProgress = await DealSourcingService.getDealProgressById(id);
      
      res.status(200).json({
        success: true,
        dealProgress
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update deal progress
  static async updateDealProgress(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const dealProgress = await DealSourcingService.updateDealProgress(id, req.body);
      
      res.status(200).json({
        success: true,
        message: "Deal progress updated successfully",
        dealProgress
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Post deal progress update
  static async postDealProgressUpdate(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const progressUpdate = await DealSourcingService.postDealProgressUpdate(id, req.body, userId);
      
      res.status(201).json({
        success: true,
        message: "Deal progress update posted successfully",
        progressUpdate
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Delete deal progress
  static async deleteDealProgress(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await DealSourcingService.deleteDealProgress(id);
      
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
}
