// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import { PerformanceReviewCycleService } from "../services/PerformanceReviewCycleService";
import { isAdminViewer, isCEO, isHRLeader, isSysAdmin } from "../services/performanceScorecardSupport";

export class PerformanceReviewCycleController {
  /**
   * Create a new performance review cycle
   */
  static async createReviewCycle(req: Request, res: Response) {
    try {
      const {
        title,
        reviewPeriodStart,
        reviewPeriodEnd,
        selfAssessmentDeadline,
        peerReviewDeadline,
        managerReviewDeadline,
        availableReviewTypes,
        reviewRatingScale
      } = req.body;

      const userId = req.user.id;

      const actor = await prisma.user.findUnique({
        where: { id: userId },
        include: { role: true }
      });
      if (!actor || !(isCEO(actor) || isHRLeader(actor) || isSysAdmin(actor) || isAdminViewer(actor))) {
        return res.status(403).json({
          success: false,
          message:
            "Only HR leadership, CEO, administrators, or system administrators may create performance review cycles."
        });
      }

      if (!title || !reviewPeriodStart || !reviewPeriodEnd || !selfAssessmentDeadline || 
          !peerReviewDeadline || !managerReviewDeadline || !availableReviewTypes || !reviewRatingScale) {
        return res.status(400).json({
          success: false,
          message: "All fields are required"
        });
      }

      const cycle = await PerformanceReviewCycleService.createReviewCycle({
        title,
        reviewPeriodStart: new Date(reviewPeriodStart),
        reviewPeriodEnd: new Date(reviewPeriodEnd),
        selfAssessmentDeadline: new Date(selfAssessmentDeadline),
        peerReviewDeadline: new Date(peerReviewDeadline),
        managerReviewDeadline: new Date(managerReviewDeadline),
        availableReviewTypes,
        reviewRatingScale
      }, userId);

      res.status(201).json({
        success: true,
        message: "Performance review cycle created successfully",
        data: cycle
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get all performance review cycles
   */
  static async getAllReviewCycles(req: Request, res: Response) {
    try {
      const { isActive, page, limit } = req.query;
      
      const filters = {
        isActive: isActive ? isActive === 'true' : undefined,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 10
      };

      const result = await PerformanceReviewCycleService.getAllReviewCycles(filters);
      
      res.status(200).json({
        success: true,
        message: "Performance review cycles retrieved successfully",
        data: result
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get review cycle by ID
   */
  static async getReviewCycleById(req: Request, res: Response) {
    try {
      const { cycleId } = req.params;
      
      if (!cycleId) {
        return res.status(400).json({
          success: false,
          message: "Cycle ID is required"
        });
      }

      const cycle = await PerformanceReviewCycleService.getReviewCycleById(cycleId);
      
      res.status(200).json({
        success: true,
        message: "Performance review cycle retrieved successfully",
        data: cycle
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Update performance review cycle
   */
  static async updateReviewCycle(req: Request, res: Response) {
    try {
      const { cycleId } = req.params;
      const updateData = req.body;
      
      if (!cycleId) {
        return res.status(400).json({
          success: false,
          message: "Cycle ID is required"
        });
      }

      const cycle = await PerformanceReviewCycleService.updateReviewCycle(cycleId, updateData);
      
      res.status(200).json({
        success: true,
        message: "Performance review cycle updated successfully",
        data: cycle
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Delete performance review cycle
   */
  static async deleteReviewCycle(req: Request, res: Response) {
    try {
      const { cycleId } = req.params;
      
      if (!cycleId) {
        return res.status(400).json({
          success: false,
          message: "Cycle ID is required"
        });
      }

      await PerformanceReviewCycleService.deleteReviewCycle(cycleId);
      
      res.status(200).json({
        success: true,
        message: "Performance review cycle deleted successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get active review cycle
   */
  static async getActiveReviewCycle(req: Request, res: Response) {
    try {
      const cycle = await PerformanceReviewCycleService.getActiveReviewCycle();
      
      if (!cycle) {
        return res.status(404).json({
          success: false,
          message: "No active review cycle found"
        });
      }
      
      res.status(200).json({
        success: true,
        message: "Active review cycle retrieved successfully",
        data: cycle
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Check review cycle deadlines
   */
  static async checkReviewCycleDeadlines(req: Request, res: Response) {
    try {
      await PerformanceReviewCycleService.checkReviewCycleDeadlines();
      
      res.status(200).json({
        success: true,
        message: "Review cycle deadlines checked successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get review cycle statistics
   */
  static async getReviewCycleStats(req: Request, res: Response) {
    try {
      const { cycleId } = req.params;
      
      if (!cycleId) {
        return res.status(400).json({
          success: false,
          message: "Cycle ID is required"
        });
      }

      const stats = await PerformanceReviewCycleService.getReviewCycleStats(cycleId);
      
      res.status(200).json({
        success: true,
        message: "Review cycle statistics retrieved successfully",
        data: stats
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Close review cycle
   */
  static async closeReviewCycle(req: Request, res: Response) {
    try {
      const { cycleId } = req.params;
      
      if (!cycleId) {
        return res.status(400).json({
          success: false,
          message: "Cycle ID is required"
        });
      }

      await PerformanceReviewCycleService.closeReviewCycle(cycleId);
      
      res.status(200).json({
        success: true,
        message: "Review cycle closed successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}
