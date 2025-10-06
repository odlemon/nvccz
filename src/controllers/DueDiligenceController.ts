//@ts-nocheck
import { Request, Response } from 'express';
import { DueDiligenceService } from '../services/DueDiligenceService';
import { EmailNotificationService } from '../services/EmailNotificationService';
import { ResponseHelper } from '../utils/responseHelper';
import { logger } from '../utils/logger';

export class DueDiligenceController {
  /**
   * Initiate due diligence for an application (PROTECTED)
   */
  static async initiateDueDiligence(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;

      if (!id) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      if (!userId) {
        ResponseHelper.error(res, "User not authenticated", undefined, 401);
        return;
      }

      const dueDiligence = await DueDiligenceService.initiateDueDiligence({
        applicationId: id,
        reviewerId: userId
      });

      // Send due diligence started email notification
      try {
        await EmailNotificationService.sendDueDiligenceStartedEmail({
          applicantName: dueDiligence.application.applicantName,
          applicantEmail: dueDiligence.application.applicantEmail,
          businessName: dueDiligence.application.businessName,
          applicationId: dueDiligence.application.id,
          currentStage: 'UNDER_DUE_DILIGENCE'
        });
        logger.info("Due diligence started email sent successfully", {
          applicationId: id,
          applicantEmail: dueDiligence.application.applicantEmail
        });
      } catch (emailError) {
        logger.error("Failed to send due diligence started email", {
          applicationId: id,
          error: emailError.message
        });
        // Don't fail the due diligence initiation if email fails
      }

      logger.info("Due diligence initiated", {
        applicationId: id,
        reviewerId: userId,
        dueDiligenceId: dueDiligence.id
      });

      ResponseHelper.success(res, "Due diligence initiated successfully", dueDiligence);
    } catch (error: any) {
      logger.error("Error initiating due diligence", { error: error.message });
      ResponseHelper.error(res, `Failed to initiate due diligence: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Update due diligence data (PROTECTED)
   */
  static async updateDueDiligence(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;

      if (!id) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      const dueDiligence = await DueDiligenceService.updateDueDiligence(id, updateData);

      logger.info("Due diligence updated", {
        applicationId: id,
        updatedBy: (req as any).user?.id,
        updatedFields: Object.keys(updateData)
      });

      ResponseHelper.success(res, "Due diligence updated successfully", dueDiligence);
    } catch (error: any) {
      logger.error("Error updating due diligence", { error: error.message });
      ResponseHelper.error(res, `Failed to update due diligence: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get due diligence report (PROTECTED)
   */
  static async getDueDiligenceReport(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      const dueDiligence = await DueDiligenceService.getDueDiligenceReport(id);

      if (!dueDiligence) {
        ResponseHelper.error(res, "Due diligence report not found", undefined, 404);
        return;
      }

      logger.info("Due diligence report retrieved", {
        applicationId: id,
        requestedBy: (req as any).user?.id
      });

      ResponseHelper.success(res, "Due diligence report retrieved successfully", dueDiligence);
    } catch (error: any) {
      logger.error("Error getting due diligence report", { error: error.message });
      ResponseHelper.error(res, `Failed to get due diligence report: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Complete due diligence (PROTECTED)
   */
  static async completeDueDiligence(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      const dueDiligence = await DueDiligenceService.completeDueDiligence(id);

      // Send due diligence completed email notification
      try {
        await EmailNotificationService.sendDueDiligenceCompletedEmail({
          applicantName: dueDiligence.application.applicantName,
          applicantEmail: dueDiligence.application.applicantEmail,
          businessName: dueDiligence.application.businessName,
          applicationId: dueDiligence.application.id,
          currentStage: 'DUE_DILIGENCE_COMPLETED'
        });
        logger.info("Due diligence completed email sent successfully", {
          applicationId: id,
          applicantEmail: dueDiligence.application.applicantEmail
        });
      } catch (emailError) {
        logger.error("Failed to send due diligence completed email", {
          applicationId: id,
          error: emailError.message
        });
        // Don't fail the due diligence completion if email fails
      }

      logger.info("Due diligence completed", {
        applicationId: id,
        completedBy: (req as any).user?.id,
        overallScore: dueDiligence.overallScore,
        recommendation: dueDiligence.recommendation
      });

      ResponseHelper.success(res, "Due diligence completed successfully", dueDiligence);
    } catch (error: any) {
      logger.error("Error completing due diligence", { error: error.message });
      ResponseHelper.error(res, `Failed to complete due diligence: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get all due diligence reviews (PROTECTED - admin/fund manager)
   */
  static async getAllDueDiligenceReviews(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 10,
        status
      } = req.query;

      const { reviews, total, totalPages } = await DueDiligenceService.getAllDueDiligenceReviews(
        Number(page),
        Number(limit),
        status as string
      );

      logger.info("Due diligence reviews retrieved", {
        requestedBy: (req as any).user?.id,
        total,
        page: Number(page),
        limit: Number(limit)
      });

      ResponseHelper.success(res, "Due diligence reviews retrieved successfully", {
        reviews,
        total,
        page: Number(page),
        totalPages
      });
    } catch (error: any) {
      logger.error("Error getting due diligence reviews", { error: error.message });
      ResponseHelper.error(res, `Failed to get due diligence reviews: ${error.message}`, undefined, 500);
    }
  }
}

