//@ts-nocheck
import { Request, Response } from 'express';
import { BoardReviewService, CreateBoardReviewRequest, UpdateBoardReviewRequest } from '../services/BoardReviewService';
import { ResponseHelper } from '../utils/responseHelper';
import { logger } from '../utils/logger';

export class BoardReviewController {
  /**
   * Create a new board review (PROTECTED - admin/fund manager access)
   */
    static async createBoardReview(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;
      const {
        investmentApproved,
        investmentRejected,
        conditionalApproval,
        recommendationReport,
        additionalInformation,
        decisionReason,
        conditions,
        nextSteps,
        overallScore,
        finalComments
      } = req.body;

      // Validate required fields
      if (!applicationId) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      const userId = (req as any).user.id;

             const boardReviewParams: CreateBoardReviewRequest = {
         applicationId,
         reviewerId: userId,
         investmentApproved,
         investmentRejected,
         conditionalApproval,
         recommendationReport,
         additionalInformation,
         decisionReason,
         conditions,
         nextSteps,
         overallScore,
         finalComments
       };

      const boardReview = await BoardReviewService.createBoardReview(boardReviewParams);

      logger.info("Board review created successfully", {
        boardReviewId: boardReview.id,
        applicationId: boardReview.applicationId,
        reviewerId: boardReview.reviewerId
      });

      ResponseHelper.success(res, "Board review created successfully", boardReview, 201);
    } catch (error: any) {
      logger.error("Error creating board review", { error: error.message });
      ResponseHelper.error(res, `Failed to create board review: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get board review by application ID (PROTECTED - admin/fund manager access)
   */
  static async getBoardReviewByApplicationId(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;

      if (!applicationId) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      const boardReview = await BoardReviewService.getBoardReviewByApplicationId(applicationId);

      if (!boardReview) {
        ResponseHelper.error(res, "Board review not found", undefined, 404);
        return;
      }

      ResponseHelper.success(res, "Board review retrieved successfully", boardReview);
    } catch (error: any) {
      logger.error("Error getting board review", { error: error.message });
      ResponseHelper.error(res, `Failed to get board review: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Update board review (PROTECTED - admin/fund manager access)
   */
  static async updateBoardReview(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;
      const updateData = req.body;

      if (!applicationId) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

             const updateParams: UpdateBoardReviewRequest = {
         investmentApproved: updateData.investmentApproved,
         investmentRejected: updateData.investmentRejected,
         conditionalApproval: updateData.conditionalApproval,
         recommendationReport: updateData.recommendationReport,
         additionalInformation: updateData.additionalInformation,
         decisionReason: updateData.decisionReason,
         conditions: updateData.conditions,
         nextSteps: updateData.nextSteps,
         overallScore: updateData.overallScore,
         finalComments: updateData.finalComments
       };

      const boardReview = await BoardReviewService.updateBoardReview(applicationId, updateParams);

      logger.info("Board review updated successfully", {
        boardReviewId: boardReview.id,
        applicationId: boardReview.applicationId,
        updatedBy: (req as any).user?.id
      });

      ResponseHelper.success(res, "Board review updated successfully", boardReview);
    } catch (error: any) {
      logger.error("Error updating board review", { error: error.message });
      ResponseHelper.error(res, `Failed to update board review: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Complete board review and update application stage (PROTECTED - admin/fund manager access)
   */
  static async completeBoardReview(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;

      if (!applicationId) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      const boardReview = await BoardReviewService.completeBoardReview(applicationId);

      logger.info("Board review completed successfully", {
        boardReviewId: boardReview.id,
        applicationId: boardReview.applicationId,
        completedBy: (req as any).user?.id,
        newStage: boardReview.application.currentStage
      });

      ResponseHelper.success(res, "Board review completed successfully", boardReview);
    } catch (error: any) {
      logger.error("Error completing board review", { error: error.message });
      ResponseHelper.error(res, `Failed to complete board review: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get all board reviews (PROTECTED - admin/fund manager access)
   */
  static async getAllBoardReviews(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 10,
        status
      } = req.query;

      const result = await BoardReviewService.getAllBoardReviews(
        Number(page),
        Number(limit),
        status as string
      );

      logger.info("Board reviews retrieved successfully", {
        total: result.total,
        page: result.page,
        requestedBy: (req as any).user?.id
      });

      ResponseHelper.success(res, "Board reviews retrieved successfully", result);
    } catch (error: any) {
      logger.error("Error getting board reviews", { error: error.message });
      ResponseHelper.error(res, `Failed to get board reviews: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get board reviews by current reviewer (PROTECTED - admin/fund manager access)
   */
  static async getMyBoardReviews(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 10
      } = req.query;

      const userId = (req as any).user.id;

      const result = await BoardReviewService.getBoardReviewsByReviewer(
        userId,
        Number(page),
        Number(limit)
      );

      logger.info("My board reviews retrieved successfully", {
        total: result.total,
        page: result.page,
        reviewerId: userId
      });

      ResponseHelper.success(res, "My board reviews retrieved successfully", result);
    } catch (error: any) {
      logger.error("Error getting my board reviews", { error: error.message });
      ResponseHelper.error(res, `Failed to get my board reviews: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get board review summary for dashboard (PROTECTED - admin/fund manager access)
   */
  static async getBoardReviewSummary(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;

      // Get summary statistics
      const [totalReviews, completedReviews, pendingReviews, myReviews] = await Promise.all([
        // Total board reviews
        BoardReviewService.getAllBoardReviews(1, 1),
        // Completed reviews
        BoardReviewService.getAllBoardReviews(1, 1, "COMPLETED"),
        // Pending reviews
        BoardReviewService.getAllBoardReviews(1, 1, "IN_PROGRESS"),
        // My reviews
        BoardReviewService.getBoardReviewsByReviewer(userId, 1, 1)
      ]);

      const summary = {
        total: totalReviews.total,
        completed: completedReviews.total,
        pending: pendingReviews.total,
        myReviews: myReviews.total,
        completionRate: totalReviews.total > 0 ? Math.round((completedReviews.total / totalReviews.total) * 100) : 0
      };

      ResponseHelper.success(res, "Board review summary retrieved successfully", summary);
    } catch (error: any) {
      logger.error("Error getting board review summary", { error: error.message });
      ResponseHelper.error(res, `Failed to get board review summary: ${error.message}`, undefined, 500);
    }
  }
}
