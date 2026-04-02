// @ts-nocheck
import { Request, Response } from "express";
import { PerformanceReviewService } from "../services/PerformanceReviewService";
import { responseHelper } from "../utils/responseHelper";

function performanceReviewErrorStatus(message: unknown): number {
  const m = String(message || "");
  if (/access denied/i.test(m)) return 403;
  if (/must be in the same department/i.test(m)) return 403;
  return 500;
}

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
        scores,
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

      const effectiveReviewerId =
        reviewerId != null && String(reviewerId).trim() !== ""
          ? String(reviewerId).trim()
          : req.user?.id;
      if (!effectiveReviewerId) {
        return responseHelper.error(res, "Could not determine reviewer (logged-in user missing).", undefined, 401);
      }

      const request = {
        reviewType,
        reviewPeriod,
        title,
        description,
        revieweeId,
        reviewerId: effectiveReviewerId,
        stakeholderId,
        reviewStartDate,
        reviewEndDate,
        dueDate,
        criteria,
        scores,
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

      const review = await PerformanceReviewService.createPerformanceReview(request, req.user);

      return responseHelper.success(res, review, "Performance review created successfully");
    } catch (error) {
      return responseHelper.error(res, error.message, undefined, performanceReviewErrorStatus(error.message));
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
      
      const review = await PerformanceReviewService.getPerformanceReviewById(id, req.user);

      return responseHelper.success(res, review, "Performance review retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message, undefined, performanceReviewErrorStatus(error.message));
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
        ratingValue,
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
        ratingValue,
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

      const review = await PerformanceReviewService.updatePerformanceReview(id, request, req.user);

      return responseHelper.success(res, review, "Performance review updated successfully");
    } catch (error) {
      return responseHelper.error(res, error.message, undefined, performanceReviewErrorStatus(error.message));
    }
  }

  static async deletePerformanceReview(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const result = await PerformanceReviewService.deletePerformanceReview(id, req.user);

      return responseHelper.success(res, result, "Performance review deleted successfully");
    } catch (error) {
      return responseHelper.error(res, error.message, undefined, performanceReviewErrorStatus(error.message));
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

  static async initiateCycleForAllEmployees(req: Request, res: Response) {
    try {
      const data = await PerformanceReviewService.initiateCycleForAllEmployees(req.params.cycleId, req.user.id);
      return responseHelper.success(
        res,
        data,
        "Review cycle reminders processed (emails sent to eligible reviewees who have not started self-assessment)"
      );
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async autopopulateQuantitativeSnapshot(req: Request, res: Response) {
    try {
      const data = await PerformanceReviewService.autopopulateQuantitativeSnapshot(req.params.id, req.user);
      return responseHelper.success(res, data, "Review quantitative snapshot generated successfully");
    } catch (error) {
      return responseHelper.error(res, error.message, undefined, performanceReviewErrorStatus(error.message));
    }
  }

  static async completePerformanceReviewStage(req: Request, res: Response) {
    try {
      const review = await PerformanceReviewService.completeCurrentPerformanceReviewStage(
        req.params.id,
        req.user
      );
      return responseHelper.success(
        res,
        review,
        "Performance review moved to the next stage"
      );
    } catch (error) {
      return responseHelper.error(res, error.message, undefined, performanceReviewErrorStatus(error.message));
    }
  }

  static async finalizePerformanceReview(req: Request, res: Response) {
    try {
      const data = await PerformanceReviewService.finalizePerformanceReview(req.params.id, req.user);
      return responseHelper.success(res, data, "Performance review finalised successfully");
    } catch (error) {
      return responseHelper.error(res, error.message, undefined, performanceReviewErrorStatus(error.message));
    }
  }

  static async getPerformanceReviewDocument(req: Request, res: Response) {
    try {
      const data = await PerformanceReviewService.getPerformanceReviewDocument(req.params.id, req.user);
      return responseHelper.success(res, data, "Performance review document retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message, undefined, performanceReviewErrorStatus(error.message));
    }
  }

  static async getDepartmentRatingDistribution(req: Request, res: Response) {
    try {
      const departmentName = String(req.query.departmentName ?? "").trim();
      if (!departmentName) {
        return responseHelper.error(res, "departmentName query parameter is required.", undefined, 400);
      }
      const reviewPeriodRaw = req.query.reviewPeriod as string | undefined;
      const reviewPeriod =
        reviewPeriodRaw != null && String(reviewPeriodRaw).trim() !== ""
          ? String(reviewPeriodRaw).trim()
          : undefined;
      const data = await PerformanceReviewService.getDepartmentRatingDistribution(
        departmentName,
        reviewPeriod
      );
      return responseHelper.success(res, data, "Department rating distribution retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }
}
