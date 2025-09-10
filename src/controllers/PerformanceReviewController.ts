// @ts-nocheck
import { Request, Response } from "express";
import { PerformanceReviewService } from "../services/PerformanceReviewService";
import { responseHelper } from "../utils/responseHelper";

export class PerformanceReviewController {
  // ===== PERFORMANCE REVIEW CRUD OPERATIONS =====

  static async createPerformanceReview(req: Request, res: Response) {
    try {
      const {
        reviewType,
        reviewPeriod,
        title,
        description,
        revieweeId,
        reviewerId,
        stakeholderId,
        reviewStartDate,
        reviewEndDate,
        dueDate,
        criteria,
        strengths,
        areasForImprovement,
        achievements,
        goals,
        developmentPlan,
        managerFeedback,
        selfFeedback,
        peerFeedback,
        stakeholderFeedback,
        actionItems,
        nextReviewDate
      } = req.body;

      const request = {
        reviewType,
        reviewPeriod,
        title,
        description,
        revieweeId,
        reviewerId,
        stakeholderId,
        reviewStartDate,
        reviewEndDate,
        dueDate,
        criteria,
        strengths,
        areasForImprovement,
        achievements,
        goals,
        developmentPlan,
        managerFeedback,
        selfFeedback,
        peerFeedback,
        stakeholderFeedback,
        actionItems,
        nextReviewDate
      };

      const review = await PerformanceReviewService.createPerformanceReview(request);
      
      return responseHelper.success(res, review, "Performance review created successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async getAllPerformanceReviews(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const filters: any = {};
      
      if (req.query.reviewType) {
        filters.reviewType = req.query.reviewType as string;
      }
      
      if (req.query.status) {
        filters.status = req.query.status as string;
      }
      
      if (req.query.stage) {
        filters.stage = req.query.stage as string;
      }
      
      if (req.query.revieweeId) {
        filters.revieweeId = req.query.revieweeId as string;
      }
      
      if (req.query.reviewerId) {
        filters.reviewerId = req.query.reviewerId as string;
      }
      
      if (req.query.reviewPeriod) {
        filters.reviewPeriod = req.query.reviewPeriod as string;
      }
      
      if (req.query.search) {
        filters.search = req.query.search as string;
      }

      const result = await PerformanceReviewService.getAllPerformanceReviews(page, limit, filters);
      
      return responseHelper.success(res, result, "Performance reviews retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async getPerformanceReviewById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const review = await PerformanceReviewService.getPerformanceReviewById(id);
      
      return responseHelper.success(res, review, "Performance review retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async updatePerformanceReview(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        reviewType,
        reviewPeriod,
        title,
        description,
        reviewerId,
        stakeholderId,
        status,
        stage,
        reviewStartDate,
        reviewEndDate,
        dueDate,
        completedDate,
        criteria,
        scores,
        overallScore,
        rating,
        strengths,
        areasForImprovement,
        achievements,
        goals,
        developmentPlan,
        managerFeedback,
        selfFeedback,
        peerFeedback,
        stakeholderFeedback,
        actionItems,
        nextReviewDate
      } = req.body;

      const request = {
        reviewType,
        reviewPeriod,
        title,
        description,
        reviewerId,
        stakeholderId,
        status,
        stage,
        reviewStartDate,
        reviewEndDate,
        dueDate,
        completedDate,
        criteria,
        scores,
        overallScore,
        rating,
        strengths,
        areasForImprovement,
        achievements,
        goals,
        developmentPlan,
        managerFeedback,
        selfFeedback,
        peerFeedback,
        stakeholderFeedback,
        actionItems,
        nextReviewDate
      };

      const review = await PerformanceReviewService.updatePerformanceReview(id, request);
      
      return responseHelper.success(res, review, "Performance review updated successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async deletePerformanceReview(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const result = await PerformanceReviewService.deletePerformanceReview(id);
      
      return responseHelper.success(res, result, "Performance review deleted successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  // ===== PERFORMANCE REVIEW FEEDBACK OPERATIONS =====

  static async createPerformanceReviewFeedback(req: Request, res: Response) {
    try {
      const {
        reviewId,
        feedbackProviderId,
        feedbackProviderType,
        feedbackType,
        content,
        rating,
        isPrivate,
        isAnonymous
      } = req.body;

      const request = {
        reviewId,
        feedbackProviderId,
        feedbackProviderType,
        feedbackType,
        content,
        rating,
        isPrivate,
        isAnonymous
      };

      const feedback = await PerformanceReviewService.createPerformanceReviewFeedback(request);
      
      return responseHelper.success(res, feedback, "Performance review feedback created successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async updatePerformanceReviewFeedback(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        feedbackType,
        content,
        rating,
        isPrivate,
        isAnonymous,
        status
      } = req.body;

      const request = {
        feedbackType,
        content,
        rating,
        isPrivate,
        isAnonymous,
        status
      };

      const feedback = await PerformanceReviewService.updatePerformanceReviewFeedback(id, request);
      
      return responseHelper.success(res, feedback, "Performance review feedback updated successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async deletePerformanceReviewFeedback(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const result = await PerformanceReviewService.deletePerformanceReviewFeedback(id);
      
      return responseHelper.success(res, result, "Performance review feedback deleted successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  // ===== PERFORMANCE REVIEW ANALYTICS =====

  static async getPerformanceReviewAnalytics(req: Request, res: Response) {
    try {
      const analytics = await PerformanceReviewService.getPerformanceReviewAnalytics();
      
      return responseHelper.success(res, analytics, "Performance review analytics retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async getPerformanceReviewCompletionRates(req: Request, res: Response) {
    try {
      const completionRates = await PerformanceReviewService.getPerformanceReviewCompletionRates();
      
      return responseHelper.success(res, completionRates, "Performance review completion rates retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }
}
