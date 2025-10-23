// @ts-nocheck
import { Request, Response } from "express";
import { EnhancedETLService } from "../services/EnhancedETLService";

export class EnhancedETLController {
  /**
   * Run enhanced ETL pipeline
   */
  static async runETLPipeline(req: Request, res: Response) {
    try {
      await EnhancedETLService.runETLPipeline();
      
      res.status(200).json({
        success: true,
        message: "Enhanced ETL pipeline completed successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Extract data from all source modules
   */
  static async extractFromAllModules(req: Request, res: Response) {
    try {
      const sourceData = await EnhancedETLService.extractFromAllModules();
      
      res.status(200).json({
        success: true,
        message: "Data extracted from all source modules successfully",
        data: sourceData
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get current metrics from external data
   */
  static async getCurrentMetrics(req: Request, res: Response) {
    try {
      const metrics = await EnhancedETLService.getCurrentMetrics();
      
      if (!metrics) {
        return res.status(404).json({
          success: false,
          message: "No current metrics found"
        });
      }
      
      res.status(200).json({
        success: true,
        message: "Current metrics retrieved successfully",
        data: metrics
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Schedule ETL job
   */
  static async scheduleETLJob(req: Request, res: Response) {
    try {
      await EnhancedETLService.scheduleETLJob();
      
      res.status(200).json({
        success: true,
        message: "ETL job scheduled successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get ETL pipeline statistics
   */
  static async getETLStats(req: Request, res: Response) {
    try {
      const metrics = await EnhancedETLService.getCurrentMetrics();
      
      if (!metrics) {
        return res.status(404).json({
          success: false,
          message: "No ETL statistics available"
        });
      }

      const stats = {
        financial: {
          revenueGrowth: metrics.revenueGrowth,
          operatingExpenses: metrics.operatingExpenses,
          netProfit: metrics.netProfit,
          grossProfitMargin: metrics.grossProfitMargin,
          netProfitMargin: metrics.netProfitMargin
        },
        operational: {
          taskCompletionRate: metrics.taskCompletionRate,
          trainingCompletionRate: metrics.trainingCompletionRate,
          eventRSVPRate: metrics.eventRSVPRate,
          userOnboardingRate: metrics.userOnboardingRate,
          timeToHire: metrics.timeToHire
        },
        procurement: {
          invoiceProcessingTime: metrics.invoiceProcessingTime,
          contractApprovalTime: metrics.contractApprovalTime
        }
      };
      
      res.status(200).json({
        success: true,
        message: "ETL statistics retrieved successfully",
        data: stats
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}
