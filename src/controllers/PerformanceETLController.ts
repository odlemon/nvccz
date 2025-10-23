// @ts-nocheck
import { Request, Response } from "express";
import { PerformanceETLService } from "../services/PerformanceETLService";

export class PerformanceETLController {
  /**
   * Extract performance data from all performance-related tables
   */
  static async extractPerformanceData(req: Request, res: Response) {
    try {
      const data = await PerformanceETLService.extractPerformanceData();
      
      res.status(200).json({
        success: true,
        message: "Performance data extracted successfully",
        data: {
          goals: data.goals.length,
          tasks: data.tasks.length,
          kpis: data.kpis.length,
          scorecards: data.scorecards.length,
          reviews: data.reviews.length,
          activities: data.activities.length
        },
        extractedData: data
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Transform performance data for external systems
   */
  static async transformData(req: Request, res: Response) {
    try {
      const { rawData } = req.body;
      
      if (!rawData) {
        return res.status(400).json({
          success: false,
          message: "Raw data is required"
        });
      }

      const transformedData = await PerformanceETLService.transformData(rawData);
      
      res.status(200).json({
        success: true,
        message: "Performance data transformed successfully",
        data: {
          records: transformedData.length,
          entityTypes: [...new Set(transformedData.map(r => r.entityType))]
        },
        transformedData
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Load transformed data into external_data collection
   */
  static async loadToExternalData(req: Request, res: Response) {
    try {
      const { transformedData } = req.body;
      
      if (!transformedData) {
        return res.status(400).json({
          success: false,
          message: "Transformed data is required"
        });
      }

      await PerformanceETLService.loadToExternalData(transformedData);
      
      res.status(200).json({
        success: true,
        message: "Performance data loaded to external_data successfully",
        data: {
          recordsLoaded: transformedData.length
        }
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Run complete ETL pipeline
   */
  static async runETLPipeline(req: Request, res: Response) {
    try {
      await PerformanceETLService.runETLPipeline();
      
      res.status(200).json({
        success: true,
        message: "ETL pipeline completed successfully"
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
      await PerformanceETLService.scheduleETLJob();
      
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
   * Get external data statistics
   */
  static async getExternalDataStats(req: Request, res: Response) {
    try {
      const stats = await PerformanceETLService.getExternalDataStats();
      
      res.status(200).json({
        success: true,
        message: "External data statistics retrieved successfully",
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
