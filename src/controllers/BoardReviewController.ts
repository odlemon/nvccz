//@ts-nocheck
import { Request, Response } from 'express';
import {
  BoardReviewService,
  BoardReviewWithRelations,
  CreateBoardReviewRequest,
  UpdateBoardReviewRequest
} from '../services/BoardReviewService';
import { EmailNotificationService } from '../services/EmailNotificationService';
import { UserService } from '../services/UserService';
import { ResponseHelper } from '../utils/responseHelper';
import { logger } from '../utils/logger';

function dispatchApplicantEmailsAfterBoardReviewCreate(
  boardReview: BoardReviewWithRelations,
  p: { investmentApproved: boolean; investmentRejected: boolean; conditionalApproval: boolean }
): void {
  let emailMethod: typeof EmailNotificationService.sendBoardReviewStartedEmail;
  let currentStage: string;

  if (p.investmentApproved) {
    emailMethod = EmailNotificationService.sendInvestmentDecisionEmail;
    currentStage = "BOARD_APPROVED";
  } else if (p.investmentRejected) {
    emailMethod = EmailNotificationService.sendApplicationRejectedEmail;
    currentStage = "BOARD_REJECTED";
  } else if (p.conditionalApproval) {
    emailMethod = EmailNotificationService.sendInvestmentDecisionEmail;
    currentStage = "BOARD_CONDITIONAL";
  } else {
    emailMethod = EmailNotificationService.sendBoardReviewStartedEmail;
    currentStage = "UNDER_BOARD_REVIEW";
  }

  void emailMethod({
    applicantName: boardReview.application.applicantName,
    applicantEmail: boardReview.application.applicantEmail,
    businessName: boardReview.application.businessName,
    applicationId: boardReview.application.id,
    currentStage: currentStage
  })
    .then(() => {
      logger.info("Board review applicant email dispatched", {
        applicationId: boardReview.applicationId,
        applicantEmail: boardReview.application.applicantEmail,
        decision: currentStage
      });
    })
    .catch((emailError: any) => {
      logger.error("Failed to send board review decision email", {
        applicationId: boardReview.applicationId,
        error: emailError?.message
      });
    });
}

export class BoardReviewController {
  /**
   * Create board review + upload final IM. **Multipart:** required field `document` only. Recommendation, scores, and decision flags are updated later via **PUT** `/board-reviews/:applicationId`.
   */
    static async createBoardReview(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;
      const file = (req as any).file;

      if (!applicationId) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      if (!file?.buffer?.length) {
        ResponseHelper.error(
          res,
          "Multipart field `document` (final Investment Memorandum) is required",
          undefined,
          400
        );
        return;
      }

      const userId = (req as any).user.id;

      const boardReviewParams: CreateBoardReviewRequest = {
        applicationId,
        reviewerId: userId,
        memorandumFile: {
          buffer: file.buffer,
          originalname: file.originalname || "investment-memorandum.pdf"
        }
      };

      const boardReview = await BoardReviewService.createBoardReview(boardReviewParams);

      dispatchApplicantEmailsAfterBoardReviewCreate(boardReview, {
        investmentApproved: boardReview.investmentApproved,
        investmentRejected: boardReview.investmentRejected,
        conditionalApproval: boardReview.conditionalApproval
      });

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

      const userId = (req as any).user?.id;
      if (!userId) {
        ResponseHelper.error(res, "User not authenticated", undefined, 401);
        return;
      }

      const strictBoard = process.env.NVCCZ_STRICT_BOARD_VOTE === "true";
      if (strictBoard) {
        const approvingUser = await UserService.getUserById(userId);
        if (
          approvingUser.userDepartment !== "Investments" ||
          approvingUser.roleCode !== "BOARD_CHAIR"
        ) {
          ResponseHelper.error(res, "Only the Board Chairman can finalize the board review", undefined, 403);
          return;
        }
      }

      const boardReview = await BoardReviewService.completeBoardReview(applicationId);

      const voteSummary = await BoardReviewService.getVoteSummary(applicationId, userId);

      // Check if user was created (for BOARD_APPROVED which includes both approved and conditional approval)
      // If user was created, the credentials email was already sent from createUserAndPortfolioCompany
      // We only need to send the generic decision email if no user was created (rejected)
      const { prisma } = await import('../utils/database');
      const userWasCreated = await prisma.user.findUnique({
        where: { email: boardReview.application.applicantEmail }
      });

      // Only send generic decision email if user wasn't created (e.g., rejected)
      // For BOARD_APPROVED (both approved and conditional), user is created and credentials email is sent
      // So we should NOT send the generic email if user was created
      if (!userWasCreated && boardReview.application.currentStage === "BOARD_REJECTED") {
        void EmailNotificationService.sendInvestmentDecisionEmail({
          applicantName: boardReview.application.applicantName,
          applicantEmail: boardReview.application.applicantEmail,
          businessName: boardReview.application.businessName,
          applicationId: boardReview.application.id,
          currentStage: boardReview.application.currentStage
        })
          .then(() => {
            logger.info("Investment decision email dispatched", {
              applicationId: boardReview.applicationId,
              applicantEmail: boardReview.application.applicantEmail,
              decision: boardReview.application.currentStage
            });
          })
          .catch((emailError: any) => {
            logger.error("Failed to send investment decision email", {
              applicationId: boardReview.applicationId,
              error: emailError?.message
            });
          });
      } else if (userWasCreated) {
        logger.info("User account created - credentials email already sent from createUserAndPortfolioCompany", {
          applicationId: boardReview.applicationId,
          applicantEmail: boardReview.application.applicantEmail,
          userId: userWasCreated.id,
          stage: boardReview.application.currentStage
        });
      }

      logger.info("Board review completed successfully", {
        boardReviewId: boardReview.id,
        applicationId: boardReview.applicationId,
        completedBy: (req as any).user?.id,
        newStage: boardReview.application.currentStage
      });

      ResponseHelper.success(res, "Board review completed successfully", {
        boardReview,
        voteSummary
      });
    } catch (error: any) {
      logger.error("Error completing board review", { error: error.message });
      ResponseHelper.error(res, `Failed to complete board review: ${error.message}`, undefined, 500);
    }
  }

  static async submitBoardVote(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;
      const { vote, comment } = req.body;
      const voterId = (req as any).user?.id;

      if (!applicationId) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      if (!voterId) {
        ResponseHelper.error(res, "User not authenticated", undefined, 401);
        return;
      }

      if (!vote) {
        ResponseHelper.error(res, "Vote is required", undefined, 400);
        return;
      }

      const summary = await BoardReviewService.submitVote(applicationId, voterId, vote, comment);

      ResponseHelper.success(res, "Vote recorded successfully", summary);
    } catch (error: any) {
      logger.error("Error submitting board vote", { error: error.message });
      ResponseHelper.error(res, `Failed to submit vote: ${error.message}`, undefined, 400);
    }
  }

  static async getBoardVoteSummary(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;
      const requesterId = (req as any).user?.id;

      if (!applicationId) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }

      if (!requesterId) {
        ResponseHelper.error(res, "User not authenticated", undefined, 401);
        return;
      }

      const strictBoard = process.env.NVCCZ_STRICT_BOARD_VOTE === "true";
      if (strictBoard) {
        const requester = await UserService.getUserById(requesterId);
        const privilegedRoles = ["admin", "fund_manager"];
        const isPrivilegedRole = requester.role?.name
          ? privilegedRoles.includes(requester.role.name)
          : false;
        const isBoardRole =
          requester.userDepartment === "Investments" &&
          (requester.roleCode === "BOARD_MEMBER" || requester.roleCode === "BOARD_CHAIR");

        if (!isPrivilegedRole && !isBoardRole) {
          ResponseHelper.error(res, "You are not authorized to view board vote summaries", undefined, 403);
          return;
        }
      }

      const summary = await BoardReviewService.getVoteSummary(applicationId, requesterId);
      ResponseHelper.success(res, "Vote summary retrieved successfully", summary);
    } catch (error: any) {
      logger.error("Error getting board vote summary", { error: error.message });
      ResponseHelper.error(res, `Failed to get vote summary: ${error.message}`, undefined, 400);
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

  static async getBoardVotingMembers(req: Request, res: Response): Promise<void> {
    try {
      const members = await UserService.getBoardVotingMembers();
      ResponseHelper.success(res, "Board voting members retrieved successfully", members);
    } catch (error: any) {
      logger.error("Error fetching board voting members", { error: error.message });
      ResponseHelper.error(res, `Failed to get board voting members: ${error.message}`, undefined, 500);
    }
  }

  static async updateVotingPower(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { votingPower } = req.body;

      if (!userId) {
        ResponseHelper.error(res, "User ID is required", undefined, 400);
        return;
      }

      const parsedValue = votingPower === null || votingPower === undefined ? null : Number(votingPower);

      if (parsedValue !== null && (Number.isNaN(parsedValue))) {
        ResponseHelper.error(res, "Voting power must be a valid number or null", undefined, 400);
        return;
      }

      const updated = await UserService.setVotingPower(userId, parsedValue);

      ResponseHelper.success(res, "Voting power updated successfully", updated);
    } catch (error: any) {
      logger.error("Error updating voting power", { error: error.message });
      ResponseHelper.error(res, `Failed to update voting power: ${error.message}`, undefined, 400);
    }
  }

  static async uploadInvestmentMemorandum(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;
      const actorId = (req as any).user?.id;
      const file = (req as any).file;

      if (!applicationId) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }
      if (!actorId) {
        ResponseHelper.error(res, "User not authenticated", undefined, 401);
        return;
      }
      if (!file?.buffer) {
        ResponseHelper.error(res, "Multipart file field `document` is required", undefined, 400);
        return;
      }

      const rawBody = (req.body || {}) as Record<string, unknown>;
      const resendNotifications =
        rawBody.resendNotifications === true ||
        String(rawBody.resendNotifications ?? "").toLowerCase() === "true" ||
        String(rawBody.resendNotifications ?? "").toLowerCase() === "1";

      const { boardReview, createdNew } = await BoardReviewService.uploadInvestmentMemorandumAndCallToVote(
        applicationId,
        { buffer: file.buffer, originalname: file.originalname || "investment-memorandum.pdf" },
        actorId,
        { resendNotifications }
      );

      if (createdNew) {
        dispatchApplicantEmailsAfterBoardReviewCreate(boardReview, {
          investmentApproved: boardReview.investmentApproved,
          investmentRejected: boardReview.investmentRejected,
          conditionalApproval: boardReview.conditionalApproval
        });
      }

      logger.info("Investment memorandum submitted (upload + call to vote)", {
        applicationId,
        createdNew,
        boardReviewId: boardReview.id
      });

      ResponseHelper.success(
        res,
        createdNew
          ? "Board review created, investment memorandum uploaded, and call to vote completed"
          : "Investment memorandum uploaded and call to vote completed",
        boardReview,
        createdNew ? 201 : 200
      );
    } catch (error: any) {
      logger.error("Error uploading investment memorandum", { error: error.message });
      ResponseHelper.error(res, error.message || "Upload failed", undefined, 400);
    }
  }

  static async callToVote(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;
      const actorId = (req as any).user?.id;
      const resendNotifications = Boolean(req.body?.resendNotifications);

      if (!applicationId) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }
      if (!actorId) {
        ResponseHelper.error(res, "User not authenticated", undefined, 401);
        return;
      }

      const boardReview = await BoardReviewService.callToVote(applicationId, actorId, {
        resendNotifications
      });
      ResponseHelper.success(res, "Call to vote completed", boardReview);
    } catch (error: any) {
      logger.error("Error in call to vote", { error: error.message });
      ResponseHelper.error(res, error.message || "Call to vote failed", undefined, 400);
    }
  }

  static async getInvestmentMemorandumAccess(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;
      const actorId = (req as any).user?.id;

      if (!applicationId) {
        ResponseHelper.error(res, "Application ID is required", undefined, 400);
        return;
      }
      if (!actorId) {
        ResponseHelper.error(res, "User not authenticated", undefined, 401);
        return;
      }

      const payload = await BoardReviewService.getInvestmentMemorandumAccess(applicationId, actorId);
      ResponseHelper.success(res, "Investment memorandum access recorded", payload);
    } catch (error: any) {
      logger.error("Error accessing investment memorandum", { error: error.message });
      ResponseHelper.error(res, error.message || "Access failed", undefined, 400);
    }
  }
}
