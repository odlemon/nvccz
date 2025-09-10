// @ts-nocheck
import { Request, Response } from "express";
import { PortfolioValuationService } from "../services/PortfolioValuationService";

export class PortfolioValuationController {
  // Create a new portfolio valuation
  static async createPortfolioValuation(req: Request, res: Response) {
    try {
      const createdById = req.user.id;
      const valuation = await PortfolioValuationService.createPortfolioValuation(req.body, createdById);
      
      res.status(201).json({
        success: true,
        message: "Portfolio valuation created successfully",
        valuation
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get all portfolio valuations
  static async getAllPortfolioValuations(req: Request, res: Response) {
    try {
      const filters = req.query;
      const valuations = await PortfolioValuationService.getAllPortfolioValuations(filters);
      
      res.status(200).json({
        success: true,
        valuations
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get portfolio valuation by ID
  static async getPortfolioValuationById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const valuation = await PortfolioValuationService.getPortfolioValuationById(id);
      
      res.status(200).json({
        success: true,
        valuation
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update portfolio valuation
  static async updatePortfolioValuation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const valuation = await PortfolioValuationService.updatePortfolioValuation(id, req.body);
      
      res.status(200).json({
        success: true,
        message: "Portfolio valuation updated successfully",
        valuation
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Delete portfolio valuation
  static async deletePortfolioValuation(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await PortfolioValuationService.deletePortfolioValuation(id);
      
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

  // Create portfolio valuation activity
  static async createPortfolioValuationActivity(req: Request, res: Response) {
    try {
      const userId = req.user.id;
      const activity = await PortfolioValuationService.createPortfolioValuationActivity(req.body, userId);
      
      res.status(201).json({
        success: true,
        message: "Portfolio valuation activity created successfully",
        activity
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get portfolio valuation activities
  static async getPortfolioValuationActivities(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const activities = await PortfolioValuationService.getPortfolioValuationActivities(id);
      
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

  // Get quarterly valuation summary
  static async getQuarterlyValuationSummary(req: Request, res: Response) {
    try {
      const { quarter, year } = req.query;
      
      if (!quarter || !year) {
        return res.status(400).json({
          success: false,
          message: "Quarter and year are required"
        });
      }

      const summary = await PortfolioValuationService.getQuarterlyValuationSummary(
        parseInt(quarter as string), 
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

  // Get valuation analytics
  static async getValuationAnalytics(req: Request, res: Response) {
    try {
      const filters = req.query;
      const analytics = await PortfolioValuationService.getValuationAnalytics(filters);
      
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
