// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import AuditService from "./AuditService";
import {
  resolveReviewWorkflowStatus,
  validateManagerRatings,
  validateManagerScaleInteger,
  validateQualitativeFeedbackMinimum
} from "./performanceBackendSupport";
import { isCEO, isHRLeader, isSysAdmin } from "./performanceScorecardSupport";
import { EmailNotificationService } from "./EmailNotificationService";
import { renderPerformanceReviewPdf } from "./performanceDocumentRenderer";

/** HR / exec / admin may manage reviews across departments. */
function canBypassPerformanceDepartmentGate(user: any): boolean {
  if (!user) return false;
  if (isCEO(user) || isHRLeader(user) || isSysAdmin(user)) return true;
  const rn = String(user?.role?.name || "").toLowerCase();
  return rn === "admin" || rn === "superadmin";
}

/** True when both users belong to the same dept (FK or matching dept name / userDepartment). */
function usersSharePerformanceDepartment(a: any, b: any): boolean {
  if (!a || !b) return false;
  const idA = a.departmentId ? String(a.departmentId).trim() : "";
  const idB = b.departmentId ? String(b.departmentId).trim() : "";
  if (idA && idB && idA === idB) return true;

  const nameSet = (u: any) => {
    const s = new Set<string>();
    if (u.userDepartment) s.add(String(u.userDepartment).trim().toLowerCase());
    if (u.department?.name) s.add(String(u.department.name).trim().toLowerCase());
    return s;
  };
  const na = nameSet(a);
  const nb = nameSet(b);
  for (const x of na) {
    if (nb.has(x)) return true;
  }
  return false;
}

function reviewOverlapsCycleWindow(review: any, cycle: any): boolean {
  const cStart = new Date(cycle.reviewPeriodStart).getTime();
  const cEnd = new Date(cycle.reviewPeriodEnd).getTime();
  const rStart = review.reviewStartDate
    ? new Date(review.reviewStartDate).getTime()
    : new Date(review.createdAt).getTime();
  let rEnd: number;
  if (review.reviewEndDate) {
    rEnd = new Date(review.reviewEndDate).getTime();
  } else if (review.dueDate) {
    rEnd = new Date(review.dueDate).getTime();
  } else {
    rEnd = cEnd;
  }
  return rStart <= cEnd && rEnd >= cStart;
}

/** True when the reviewee has not meaningfully started self-assessment yet. */
function selfAssessmentNotStarted(review: any): boolean {
  if (review.selfFeedback != null && String(review.selfFeedback).trim().length > 0) {
    return false;
  }
  for (const field of ["strengths", "achievements", "goals", "areasForImprovement", "developmentPlan"]) {
    const v = review[field];
    if (v != null && String(v).trim().length > 0) {
      return false;
    }
  }
  const scores = review.scores;
  if (
    Array.isArray(scores) &&
    scores.some((s: any) => s != null && s.selfRating != null && String(s.selfRating).trim() !== "")
  ) {
    return false;
  }
  return true;
}

/** Reviewee shape for list/detail/create/update — single department field for clients. */
const PERFORMANCE_REVIEW_REVIEWEE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  userDepartment: true
} as const;

export interface CreatePerformanceReviewRequest {
  reviewType: string;
  reviewPeriod: string;
  title: string;
  description?: string;
  revieweeId: string;
  /** Set by controller from JWT when omitted on create. */
  reviewerId: string;
  stakeholderId?: string;
  reviewStartDate?: string;
  reviewEndDate?: string;
  dueDate?: string;
  criteria?: any[];
  scores?: any[];
  strengths?: string;
  areasForImprovement?: string;
  achievements?: string;
  goals?: string;
  developmentPlan?: string;
  managerFeedback?: string;
  selfFeedback?: string;
  peerFeedback?: string;
  stakeholderFeedback?: string;
  actionItems?: any[];
  nextReviewDate?: string;
}

export interface UpdatePerformanceReviewRequest {
  reviewType?: string;
  reviewPeriod?: string;
  title?: string;
  description?: string;
  reviewerId?: string;
  stakeholderId?: string;
  status?: string;
  stage?: string;
  reviewStartDate?: string;
  reviewEndDate?: string;
  dueDate?: string;
  completedDate?: string;
  criteria?: any[];
  scores?: any[];
  overallScore?: number;
  ratingValue?: number;
  rating?: string;
  strengths?: string;
  areasForImprovement?: string;
  achievements?: string;
  goals?: string;
  developmentPlan?: string;
  managerFeedback?: string;
  selfFeedback?: string;
  peerFeedback?: string;
  stakeholderFeedback?: string;
  actionItems?: any[];
  nextReviewDate?: string;
}

export interface CreatePerformanceReviewFeedbackRequest {
  reviewId: string;
  feedbackProviderId: string;
  feedbackProviderType: string;
  feedbackType: string;
  content: string;
  rating?: number;
  isPrivate?: boolean;
  isAnonymous?: boolean;
}

export interface UpdatePerformanceReviewFeedbackRequest {
  feedbackType?: string;
  content?: string;
  rating?: number;
  isPrivate?: boolean;
  isAnonymous?: boolean;
  status?: string;
}

export class PerformanceReviewService {
  // ===== PERFORMANCE REVIEW CRUD OPERATIONS =====

  private static validateReviewPayload(request: any) {
    const ratingValidation = validateManagerRatings(request?.scores || []);
    if (!ratingValidation.valid) {
      throw new Error("Manager ratings must be whole numbers between 1 and 5.");
    }

    const ratingValueCheck = validateManagerScaleInteger(request?.ratingValue);
    if (!ratingValueCheck.valid) {
      throw new Error(ratingValueCheck.message);
    }

    const qualitativeFields = [
      request?.managerFeedback,
      request?.selfFeedback,
      request?.peerFeedback,
      request?.stakeholderFeedback
    ].filter((value) => value !== undefined && value !== null && String(value).trim().length > 0);

    for (const field of qualitativeFields) {
      const validation = validateQualitativeFeedbackMinimum(field, 50);
      if (!validation.valid) {
        throw new Error("Qualitative feedback must be at least 50 characters.");
      }
    }
  }

  private static async getReviewWithAccessContext(reviewId: string) {
    return prisma.performanceReview.findUnique({
      where: { id: reviewId },
      include: {
        reviewee: {
          include: {
            role: true,
            department: true,
            employee: true
          }
        },
        reviewer: {
          include: {
            role: true
          }
        },
        reviewFeedback: true
      }
    });
  }

  /**
   * Reviewee always sees their review. Assigned reviewer always sees their review (cross-department external evaluators).
   * Line manager only if same department as reviewee.
   * CEO, HR lead, sysadmin, and role `admin` may access any review.
   */
  private static async assertPerformanceReviewAccess(review: any, actorRef: { id: string }) {
    const actor = await prisma.user.findUnique({
      where: { id: actorRef.id },
      include: { department: true, role: true, employee: true }
    });
    if (!actor) {
      throw new Error("Access denied: user not found.");
    }

    if (canBypassPerformanceDepartmentGate(actor)) {
      return;
    }

    const isOwner = review.revieweeId === actor.id;
    if (isOwner) {
      return;
    }

    if (review.reviewerId === actor.id) {
      return;
    }

    const isDirectManager = review.reviewee?.employee?.lineManagerUserId === actor.id;

    if (isDirectManager) {
      if (usersSharePerformanceDepartment(review.reviewee, actor)) {
        return;
      }
      throw new Error(
        "Access denied: you must be in the same department as the reviewee to access this performance review."
      );
    }

    throw new Error("Access denied: you are not permitted to access this performance review.");
  }

  private static async assertPerformanceReviewAccessByReviewId(reviewId: string, actorRef: { id: string }) {
    const review = await prisma.performanceReview.findUnique({
      where: { id: reviewId },
      include: {
        reviewee: { include: { department: true, employee: true } },
        reviewer: { include: { department: true } }
      }
    });
    if (!review) {
      throw new Error(`Performance review with ID ${reviewId} not found`);
    }
    await this.assertPerformanceReviewAccess(review, actorRef);
  }

  /** After general access checks: finalize only for line manager or HR/exec/admin bypass. */
  private static async assertFinalizePerformanceReviewPermission(review: any, actorRef: { id: string }) {
    const actor = await prisma.user.findUnique({
      where: { id: actorRef.id },
      include: { department: true, role: true, employee: true }
    });
    if (!actor) {
      throw new Error("Access denied: user not found.");
    }
    if (canBypassPerformanceDepartmentGate(actor)) {
      return;
    }
    const lineManagerId = review.reviewee?.employee?.lineManagerUserId;
    if (lineManagerId && actor.id === lineManagerId) {
      return;
    }
    throw new Error(
      "Access denied: only the reviewee's line manager or HR leadership may finalize this performance review."
    );
  }

  static async createPerformanceReview(request: CreatePerformanceReviewRequest, actor?: { id: string }) {
    try {
      const revieweeId = request.revieweeId != null ? String(request.revieweeId).trim() : "";
      const reviewerId = request.reviewerId != null ? String(request.reviewerId).trim() : "";
      if (!revieweeId) {
        throw new Error("revieweeId is required — use the user's id from GET /api/users (JSON key: revieweeId).");
      }
      if (!reviewerId) {
        throw new Error(
          "reviewerId is required — omit it on POST and the API uses the logged-in user, or pass reviewerId explicitly."
        );
      }
      if (!String(request.reviewType || "").trim()) {
        throw new Error("reviewType is required.");
      }
      if (!String(request.reviewPeriod || "").trim()) {
        throw new Error("reviewPeriod is required.");
      }
      if (!String(request.title || "").trim()) {
        throw new Error("title is required.");
      }
      request.revieweeId = revieweeId;
      request.reviewerId = reviewerId;

      if (actor?.id && actor.id === revieweeId) {
        throw new Error("You cannot create a performance review that targets you as the reviewee.");
      }

      this.validateReviewPayload(request);

      // Validate reviewee exists
      const reviewee = await prisma.user.findUnique({
        where: { id: revieweeId },
        include: { department: true }
      });

      if (!reviewee) {
        throw new Error(`User with ID ${request.revieweeId} not found`);
      }

      // Validate reviewer exists
      const reviewer = await prisma.user.findUnique({
        where: { id: reviewerId },
        include: { department: true }
      });

      if (!reviewer) {
        throw new Error(`User with ID ${request.reviewerId} not found`);
      }

      // Validate stakeholder if provided
      if (request.stakeholderId) {
        const stakeholder = await prisma.stakeholder.findUnique({
          where: { id: request.stakeholderId }
        });

        if (!stakeholder) {
          throw new Error(`Stakeholder with ID ${request.stakeholderId} not found`);
        }
      }

      if (actor?.id) {
        const actorFull = await prisma.user.findUnique({
          where: { id: actor.id },
          include: { department: true, role: true }
        });
        if (actorFull && !canBypassPerformanceDepartmentGate(actorFull)) {
          if (!usersSharePerformanceDepartment(reviewee, reviewer)) {
            throw new Error("Reviewer must be in the same department as the reviewee.");
          }
        }
      }

      const performanceReview = await prisma.performanceReview.create({
        data: {
          reviewType: request.reviewType,
          reviewPeriod: request.reviewPeriod,
          title: request.title,
          description: request.description,
          revieweeId: request.revieweeId,
          reviewerId: request.reviewerId,
          stakeholderId: request.stakeholderId,
          reviewStartDate: request.reviewStartDate ? new Date(request.reviewStartDate) : null,
          reviewEndDate: request.reviewEndDate ? new Date(request.reviewEndDate) : null,
          dueDate: request.dueDate ? new Date(request.dueDate) : null,
          criteria: request.criteria || [],
          scores: request.scores ?? [],
          strengths: request.strengths,
          areasForImprovement: request.areasForImprovement,
          achievements: request.achievements,
          goals: request.goals,
          developmentPlan: request.developmentPlan,
          managerFeedback: request.managerFeedback,
          selfFeedback: request.selfFeedback,
          peerFeedback: request.peerFeedback,
          stakeholderFeedback: request.stakeholderFeedback,
          actionItems: request.actionItems || [],
          nextReviewDate: request.nextReviewDate ? new Date(request.nextReviewDate) : null,
          status: "PENDING",
          stage: "SELF_REVIEW",
          documentStatus: "DRAFT"
        },
        include: {
          reviewee: {
            select: PERFORMANCE_REVIEW_REVIEWEE_SELECT
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          stakeholder: {
            select: {
              id: true,
              stakeholderId: true,
              legalName: true,
              email: true
            }
          },
          reviewFeedback: {
            include: {
              feedbackProvider: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      return performanceReview;
    } catch (error) {
      throw new Error(`Failed to create performance review: ${error.message}`);
    }
  }

  static async getAllPerformanceReviews(page: number = 1, limit: number = 10, filters?: any, actor?: { id: string }) {
    try {
      const skip = (page - 1) * limit;
      
      const where: any = {};
      
      if (filters?.reviewType) {
        where.reviewType = filters.reviewType;
      }
      
      if (filters?.status) {
        where.status = filters.status;
      }
      
      if (filters?.stage) {
        where.stage = filters.stage;
      }
      
      if (filters?.revieweeId) {
        where.revieweeId = filters.revieweeId;
      }
      
      if (filters?.reviewerId) {
        where.reviewerId = filters.reviewerId;
      }
      
      if (filters?.reviewPeriod) {
        where.reviewPeriod = filters.reviewPeriod;
      }
      
      if (filters?.search) {
        where.OR = [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      if (actor?.id) {
        const gateUser = await prisma.user.findUnique({
          where: { id: actor.id },
          include: { role: true, department: true, employee: true }
        });
        if (gateUser && !canBypassPerformanceDepartmentGate(gateUser)) {
          const accessClause = {
            OR: [
              { revieweeId: actor.id },
              { reviewerId: actor.id },
              { reviewee: { employee: { lineManagerUserId: actor.id } } }
            ]
          };
          const previous = { ...where };
          Object.keys(where).forEach((k) => delete (where as any)[k]);
          where.AND = [previous, accessClause];
        }
      }

      const [reviews, total] = await Promise.all([
        prisma.performanceReview.findMany({
          where,
          skip,
          take: limit,
          include: {
            reviewee: {
              select: PERFORMANCE_REVIEW_REVIEWEE_SELECT
            },
            reviewer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            stakeholder: {
              select: {
                id: true,
                stakeholderId: true,
                legalName: true,
                email: true
              }
            },
            reviewFeedback: {
              take: 3,
              include: {
                feedbackProvider: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.performanceReview.count({ where })
      ]);

      return {
        reviews,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw new Error(`Failed to get performance reviews: ${error.message}`);
    }
  }

  static async getPerformanceReviewById(id: string, actor: { id: string }) {
    try {
      await this.assertPerformanceReviewAccessByReviewId(id, actor);

      const review = await prisma.performanceReview.findUnique({
        where: { id },
        include: {
          reviewee: {
            select: PERFORMANCE_REVIEW_REVIEWEE_SELECT
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          stakeholder: {
            select: {
              id: true,
              stakeholderId: true,
              legalName: true,
              email: true
            }
          },
          reviewFeedback: {
            include: {
              feedbackProvider: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (!review) {
        throw new Error(`Performance review with ID ${id} not found`);
      }

      return review;
    } catch (error) {
      throw new Error(`Failed to get performance review: ${error.message}`);
    }
  }

  static async updatePerformanceReview(
    id: string,
    request: UpdatePerformanceReviewRequest,
    actor: { id: string }
  ) {
    try {
      await this.assertPerformanceReviewAccessByReviewId(id, actor);

      const existingReview = await prisma.performanceReview.findUnique({
        where: { id }
      });

      if (!existingReview) {
        throw new Error(`Performance review with ID ${id} not found`);
      }

      if (existingReview.isLocked) {
        throw new Error("This review has been finalised and is locked.");
      }

      this.validateReviewPayload(request);

      // Validate reviewer if provided
      if (request.reviewerId) {
        const reviewer = await prisma.user.findUnique({
          where: { id: request.reviewerId }
        });

        if (!reviewer) {
          throw new Error(`User with ID ${request.reviewerId} not found`);
        }
      }

      // Validate stakeholder if provided
      if (request.stakeholderId) {
        const stakeholder = await prisma.stakeholder.findUnique({
          where: { id: request.stakeholderId }
        });

        if (!stakeholder) {
          throw new Error(`Stakeholder with ID ${request.stakeholderId} not found`);
        }
      }

      const updateData: any = { ...request };
      
      if (request.reviewStartDate) {
        updateData.reviewStartDate = new Date(request.reviewStartDate);
      }
      
      if (request.reviewEndDate) {
        updateData.reviewEndDate = new Date(request.reviewEndDate);
      }
      
      if (request.dueDate) {
        updateData.dueDate = new Date(request.dueDate);
      }
      
      if (request.completedDate) {
        updateData.completedDate = new Date(request.completedDate);
      }
      
      if (request.nextReviewDate) {
        updateData.nextReviewDate = new Date(request.nextReviewDate);
      }
      
      if (request.overallScore !== undefined) {
        updateData.overallScore = request.overallScore ? new Decimal(request.overallScore) : null;
      }

      if (request.stage || request.status) {
        const workflow = resolveReviewWorkflowStatus({
          currentStatus: request.status || existingReview.status,
          currentStage: request.stage || existingReview.stage,
          hasExternalStakeholder: Boolean(existingReview.stakeholderId)
        });
        updateData.status = workflow.status;
        updateData.stage = workflow.stage;
      }

      const review = await prisma.performanceReview.update({
        where: { id },
        data: updateData,
        include: {
          reviewee: {
            select: PERFORMANCE_REVIEW_REVIEWEE_SELECT
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          stakeholder: {
            select: {
              id: true,
              stakeholderId: true,
              legalName: true,
              email: true
            }
          },
          reviewFeedback: {
            include: {
              feedbackProvider: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      return review;
    } catch (error) {
      throw new Error(`Failed to update performance review: ${error.message}`);
    }
  }

  /**
   * Moves the review forward one workflow step using the current `stage` only
   * (e.g. SELF_REVIEW → MANAGER_REVIEW → FINAL_REVIEW). No body required.
   * After FINAL_REVIEW, use finalize (PDF lock), not this method.
   */
  static async completeCurrentPerformanceReviewStage(id: string, actor: { id: string }) {
    try {
      await this.assertPerformanceReviewAccessByReviewId(id, actor);

      const existing = await prisma.performanceReview.findUnique({
        where: { id }
      });

      if (!existing) {
        throw new Error(`Performance review with ID ${id} not found`);
      }

      if (existing.isLocked) {
        throw new Error("This review has been finalised and is locked.");
      }

      const stageNorm = String(existing.stage || "").toUpperCase();
      const statusNorm = String(existing.status || "").toUpperCase();
      if (stageNorm === "FINALIZED" || statusNorm === "FINALIZED") {
        throw new Error("This review is already finalized.");
      }

      const workflow = resolveReviewWorkflowStatus({
        currentStatus: existing.status,
        currentStage: existing.stage,
        hasExternalStakeholder: Boolean(existing.stakeholderId)
      });

      const nextStage = String(workflow.stage || "").toUpperCase();
      const nextStatus = String(workflow.status || "").toUpperCase();
      if (nextStage === stageNorm && nextStatus === statusNorm) {
        throw new Error(
          "No further stage to advance to from here. When the final review content is ready, use POST /api/performance-reviews/{id}/finalize."
        );
      }

      const review = await prisma.performanceReview.update({
        where: { id },
        data: {
          status: workflow.status,
          stage: workflow.stage
        },
        include: {
          reviewee: {
            select: PERFORMANCE_REVIEW_REVIEWEE_SELECT
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          stakeholder: {
            select: {
              id: true,
              stakeholderId: true,
              legalName: true,
              email: true
            }
          },
          reviewFeedback: {
            include: {
              feedbackProvider: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      return review;
    } catch (error) {
      throw new Error(`Failed to advance performance review stage: ${error.message}`);
    }
  }

  static async deletePerformanceReview(id: string, actor: { id: string }) {
    try {
      await this.assertPerformanceReviewAccessByReviewId(id, actor);

      const existingReview = await prisma.performanceReview.findUnique({
        where: { id }
      });

      if (!existingReview) {
        throw new Error(`Performance review with ID ${id} not found`);
      }

      await prisma.performanceReview.delete({
        where: { id }
      });

      return { message: "Performance review deleted successfully" };
    } catch (error) {
      throw new Error(`Failed to delete performance review: ${error.message}`);
    }
  }

  // ===== PERFORMANCE REVIEW FEEDBACK OPERATIONS =====

  static async createPerformanceReviewFeedback(request: CreatePerformanceReviewFeedbackRequest) {
    try {
      // Validate review exists
      const review = await prisma.performanceReview.findUnique({
        where: { id: request.reviewId }
      });

      if (!review) {
        throw new Error(`Performance review with ID ${request.reviewId} not found`);
      }

      // Validate feedback provider exists
      const feedbackProvider = await prisma.user.findUnique({
        where: { id: request.feedbackProviderId }
      });

      if (!feedbackProvider) {
        throw new Error(`User with ID ${request.feedbackProviderId} not found`);
      }

      if (String(request.feedbackProviderType || "").toUpperCase() === "MANAGER") {
        const r = validateManagerScaleInteger(request.rating);
        if (!r.valid) {
          throw new Error(r.message);
        }
      }

      const feedback = await prisma.performanceReviewFeedback.create({
        data: {
          reviewId: request.reviewId,
          feedbackProviderId: request.feedbackProviderId,
          feedbackProviderType: request.feedbackProviderType,
          feedbackType: request.feedbackType,
          content: request.content,
          rating: request.rating,
          isPrivate: request.isPrivate || false,
          isAnonymous: request.isAnonymous || false
        },
        include: {
          review: {
            select: {
              id: true,
              title: true,
              reviewType: true,
              reviewPeriod: true
            }
          },
          feedbackProvider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      return feedback;
    } catch (error) {
      throw new Error(`Failed to create performance review feedback: ${error.message}`);
    }
  }

  static async updatePerformanceReviewFeedback(id: string, request: UpdatePerformanceReviewFeedbackRequest) {
    try {
      const existingFeedback = await prisma.performanceReviewFeedback.findUnique({
        where: { id }
      });

      if (!existingFeedback) {
        throw new Error(`Performance review feedback with ID ${id} not found`);
      }

      const providerType = String(existingFeedback.feedbackProviderType || "").toUpperCase();
      if (providerType === "MANAGER" && request.rating !== undefined) {
        const r = validateManagerScaleInteger(request.rating);
        if (!r.valid) {
          throw new Error(r.message);
        }
      }

      const feedback = await prisma.performanceReviewFeedback.update({
        where: { id },
        data: request,
        include: {
          review: {
            select: {
              id: true,
              title: true,
              reviewType: true,
              reviewPeriod: true
            }
          },
          feedbackProvider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      return feedback;
    } catch (error) {
      throw new Error(`Failed to update performance review feedback: ${error.message}`);
    }
  }

  static async deletePerformanceReviewFeedback(id: string) {
    try {
      const existingFeedback = await prisma.performanceReviewFeedback.findUnique({
        where: { id }
      });

      if (!existingFeedback) {
        throw new Error(`Performance review feedback with ID ${id} not found`);
      }

      await prisma.performanceReviewFeedback.delete({
        where: { id }
      });

      return { message: "Performance review feedback deleted successfully" };
    } catch (error) {
      throw new Error(`Failed to delete performance review feedback: ${error.message}`);
    }
  }

  // ===== PERFORMANCE REVIEW ANALYTICS =====

  static async getPerformanceReviewAnalytics() {
    try {
      const [
        totalReviews,
        reviewsByType,
        reviewsByStatus,
        reviewsByStage,
        completionRates,
        averageScores
      ] = await Promise.all([
        prisma.performanceReview.count(),
        
        prisma.performanceReview.groupBy({
          by: ['reviewType'],
          _count: { reviewType: true }
        }),
        
        prisma.performanceReview.groupBy({
          by: ['status'],
          _count: { status: true }
        }),
        
        prisma.performanceReview.groupBy({
          by: ['stage'],
          _count: { stage: true }
        }),
        
        prisma.performanceReview.groupBy({
          by: ['reviewType'],
          _count: { reviewType: true },
          where: {
            status: 'COMPLETED'
          }
        }),
        
        prisma.performanceReview.aggregate({
          _avg: { overallScore: true },
          _min: { overallScore: true },
          _max: { overallScore: true }
        })
      ]);

      // Calculate completion rates
      const completionRateByType = reviewsByType.map(typeGroup => {
        const completed = completionRates.find(c => c.reviewType === typeGroup.reviewType);
        const completionRate = typeGroup._count.reviewType > 0 
          ? ((completed?._count.reviewType || 0) / typeGroup._count.reviewType) * 100 
          : 0;
        
        return {
          reviewType: typeGroup.reviewType,
          total: typeGroup._count.reviewType,
          completed: completed?._count.reviewType || 0,
          completionRate: Number(completionRate.toFixed(2))
        };
      });

      return {
        totalReviews,
        reviewsByType: reviewsByType.map(item => ({
          reviewType: item.reviewType,
          count: item._count.reviewType
        })),
        reviewsByStatus: reviewsByStatus.map(item => ({
          status: item.status,
          count: item._count.status
        })),
        reviewsByStage: reviewsByStage.map(item => ({
          stage: item.stage,
          count: item._count.stage
        })),
        completionRateByType,
        averageScores: {
          average: averageScores._avg.overallScore ? Number(averageScores._avg.overallScore.toFixed(2)) : null,
          minimum: averageScores._min.overallScore ? Number(averageScores._min.overallScore.toFixed(2)) : null,
          maximum: averageScores._max.overallScore ? Number(averageScores._max.overallScore.toFixed(2)) : null
        }
      };
    } catch (error) {
      throw new Error(`Failed to get performance review analytics: ${error.message}`);
    }
  }

  // ===== PERFORMANCE REVIEW COMPLETION TRACKING =====

  static async getPerformanceReviewCompletionRates() {
    try {
      const reviews = await prisma.performanceReview.findMany({
        include: {
          reviewee: {
            select: PERFORMANCE_REVIEW_REVIEWEE_SELECT
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      // Group by department and calculate completion rates
      const departmentStats = reviews.reduce((acc, review) => {
        const departmentId = review.reviewee.userDepartment || "no-department";
        const departmentName = review.reviewee.userDepartment || "No Department";
        
        if (!acc[departmentId]) {
          acc[departmentId] = {
            departmentId,
            departmentName,
            total: 0,
            completed: 0,
            inProgress: 0,
            overdue: 0
          };
        }
        
        acc[departmentId].total++;
        
        if (review.status === 'COMPLETED') {
          acc[departmentId].completed++;
        } else if (review.status === 'IN_PROGRESS') {
          acc[departmentId].inProgress++;
        } else if (review.dueDate && new Date() > new Date(review.dueDate)) {
          acc[departmentId].overdue++;
        }
        
        return acc;
      }, {} as Record<string, any>);

      // Calculate completion rates
      const departmentCompletionRates = Object.values(departmentStats).map((dept: any) => ({
        ...dept,
        completionRate: dept.total > 0 ? Number(((dept.completed / dept.total) * 100).toFixed(2)) : 0
      }));

      return departmentCompletionRates;
    } catch (error) {
      throw new Error(`Failed to get performance review completion rates: ${error.message}`);
    }
  }

  /**
   * HR "company-wide" cycle run: does **not** bulk-create reviews or tasks.
   * Finds **existing** manager-created reviews (another user is reviewer) where the
   * reviewee is an **active Employee**, the review **overlaps the cycle window**,
   * is still at **self-assessment stage**, **not locked**, and the reviewee has
   * **not started** self-assessment — then sends **email** to those reviewees.
   * On success, optionally emails the **assigned reviewer** (manager) and linked **stakeholder** (external contact) for awareness.
   * Reviews with `cycleId` null are linked to this cycle after a successful email
   * (and `dueDate` set from the cycle if missing).
   */
  static async initiateCycleForAllEmployees(cycleId: string, initiatedById: string) {
    try {
      const cycle = await prisma.performanceReviewCycle.findUnique({
        where: { id: cycleId }
      });

      if (!cycle) {
        throw new Error("Review cycle not found");
      }

      const candidates = await prisma.performanceReview.findMany({
        where: {
          isLocked: false,
          stage: { in: ["SELF_REVIEW", "SELF_ASSESSMENT"] },
          OR: [{ cycleId: null }, { cycleId: cycleId }]
        },
        include: {
          reviewee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          stakeholder: {
            select: {
              id: true,
              legalName: true,
              email: true
            }
          }
        }
      });

      const activeEmployeeUserIds = new Set(
        (
          await prisma.employee.findMany({
            where: { isActive: true, terminated: false },
            select: { userId: true }
          })
        ).map((e) => e.userId)
      );

      let emailsSent = 0;
      let emailsFailed = 0;
      let reviewerEmailsSent = 0;
      let stakeholderEmailsSent = 0;
      let skippedIneligible = 0;
      const errors: string[] = [];

      for (const review of candidates) {
        if (review.cycleId != null && review.cycleId !== cycleId) {
          skippedIneligible += 1;
          continue;
        }
        if (review.reviewerId === review.revieweeId) {
          skippedIneligible += 1;
          continue;
        }
        if (!activeEmployeeUserIds.has(review.revieweeId)) {
          skippedIneligible += 1;
          continue;
        }
        if (!reviewOverlapsCycleWindow(review, cycle)) {
          skippedIneligible += 1;
          continue;
        }
        if (!selfAssessmentNotStarted(review)) {
          skippedIneligible += 1;
          continue;
        }

        const email = review.reviewee?.email?.trim();
        if (!email) {
          emailsFailed += 1;
          errors.push(`Review ${review.id}: reviewee has no email`);
          continue;
        }

        const name =
          `${review.reviewee.firstName || ""} ${review.reviewee.lastName || ""}`.trim() || "Colleague";
        const deadline = new Date(cycle.selfAssessmentDeadline);
        const selfAssessmentDeadlineDisplay = deadline.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric"
        });

        try {
          await EmailNotificationService.sendPerformanceReviewSelfAssessmentReminderEmail({
            revieweeName: name,
            revieweeEmail: email,
            reviewTitle: review.title,
            reviewPeriod: review.reviewPeriod,
            cycleTitle: cycle.title,
            selfAssessmentDeadlineDisplay,
            reviewId: review.id
          });
          emailsSent += 1;

          if (review.cycleId == null) {
            await prisma.performanceReview.update({
              where: { id: review.id },
              data: {
                cycleId,
                dueDate: review.dueDate ?? cycle.selfAssessmentDeadline
              }
            });
          }

          try {
            const sentRv = await EmailNotificationService.sendPerformanceReviewCycleReviewerAwarenessEmail({
              reviewerName:
                `${review.reviewer?.firstName || ""} ${review.reviewer?.lastName || ""}`.trim() || "Reviewer",
              reviewerEmail: String(review.reviewer?.email || "").trim(),
              revieweeName: name,
              reviewTitle: review.title,
              reviewPeriod: review.reviewPeriod,
              cycleTitle: cycle.title,
              reviewId: review.id
            });
            if (sentRv) reviewerEmailsSent += 1;
          } catch (e: any) {
            errors.push(`Review ${review.id} reviewer notice: ${e?.message || String(e)}`);
          }

          try {
            const sentSh = await EmailNotificationService.sendPerformanceReviewCycleStakeholderAwarenessEmail({
              stakeholderName: String(review.stakeholder?.legalName || "").trim() || "Stakeholder",
              stakeholderEmail: String(review.stakeholder?.email || "").trim(),
              revieweeName: name,
              reviewTitle: review.title,
              reviewPeriod: review.reviewPeriod,
              cycleTitle: cycle.title,
              reviewId: review.id
            });
            if (sentSh) stakeholderEmailsSent += 1;
          } catch (e: any) {
            errors.push(`Review ${review.id} stakeholder notice: ${e?.message || String(e)}`);
          }
        } catch (e: any) {
          emailsFailed += 1;
          errors.push(`Review ${review.id}: ${e?.message || String(e)}`);
        }
      }

      const result = {
        cycleId,
        emailsSent,
        emailsFailed,
        reviewerEmailsSent,
        stakeholderEmailsSent,
        skippedIneligible,
        candidatesConsidered: candidates.length,
        activeEmployeesWithLogin: activeEmployeeUserIds.size,
        ...(errors.length > 0 ? { errors: errors.slice(0, 25) } : {})
      };

      await AuditService.log({
        userId: initiatedById,
        action: "PERFORMANCE_REVIEW_CYCLE_REMINDERS",
        entityType: "PerformanceReviewCycle",
        entityId: cycleId,
        newValues: {
          emailsSent,
          emailsFailed,
          reviewerEmailsSent,
          stakeholderEmailsSent,
          skippedIneligible,
          candidatesConsidered: candidates.length
        }
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to initiate review cycle: ${error.message}`);
    }
  }

  static async autopopulateQuantitativeSnapshot(reviewId: string, actor: { id: string }) {
    try {
      await this.assertPerformanceReviewAccessByReviewId(reviewId, actor);

      const review = await prisma.performanceReview.findUnique({
        where: { id: reviewId }
      });

      if (!review) {
        throw new Error("Performance review not found");
      }

      const periodStart = review.reviewStartDate || new Date(`${review.reviewPeriod}-01-01`);
      const periodEnd = review.reviewEndDate || review.dueDate || new Date();

      const [goals, tasks] = await Promise.all([
        prisma.performanceGoal.findMany({
          where: {
            assignedToId: review.revieweeId,
            startDate: {
              lte: periodEnd
            },
            endDate: {
              gte: periodStart
            }
          },
          orderBy: {
            title: "asc"
          }
        }),
        prisma.task.findMany({
          where: {
            isTrashed: false,
            team: {
              array_contains: review.revieweeId
            },
            date: {
              lte: periodEnd
            }
          },
          orderBy: {
            title: "asc"
          }
        })
      ]);

      const snapshot = {
        goals: goals.map((goal) => ({
          goalId: goal.id,
          title: goal.title,
          progressPercentage: goal.progressPercentage ? Number(goal.progressPercentage) : 0,
          currentValue: goal.preciseCurrentValue ?? goal.currentValue,
          targetValue: goal.preciseTargetValue ?? goal.targetValue
        })),
        tasks: tasks.map((task) => ({
          taskId: task.id,
          title: task.title,
          stage: task.stage,
          linkedGoalId: task.goalId
        })),
        generatedAt: new Date().toISOString()
      };

      const updated = await prisma.performanceReview.update({
        where: { id: reviewId },
        data: {
          quantitativeSnapshot: snapshot
        }
      });

      return {
        reviewId: updated.id,
        quantitativeSnapshot: snapshot
      };
    } catch (error) {
      throw new Error(`Failed to auto-populate quantitative review data: ${error.message}`);
    }
  }

  static async finalizePerformanceReview(reviewId: string, actor: any) {
    try {
      const review = await this.getReviewWithAccessContext(reviewId);

      if (!review) {
        throw new Error("Performance review not found");
      }

      if (review.isLocked) {
        return review;
      }

      await this.assertPerformanceReviewAccess(review, actor);
      await this.assertFinalizePerformanceReviewPermission(review, actor);
      this.validateReviewPayload(review);

      const sections = [
        {
          heading: "Scores",
          lines: [
            `Overall Score: ${review.overallScore ?? "N/A"}`,
            `Rating Value: ${review.ratingValue ?? "N/A"}`,
            `Rating: ${review.rating ?? "N/A"}`
          ]
        },
        {
          heading: "Qualitative Feedback",
          lines: [
            `Self Feedback: ${review.selfFeedback || "N/A"}`,
            `Manager Feedback: ${review.managerFeedback || "N/A"}`,
            `Peer Feedback: ${review.peerFeedback || "N/A"}`,
            `Stakeholder / External Feedback: ${review.stakeholderFeedback || "N/A"}`
          ]
        },
        {
          heading: "Quantitative Snapshot",
          lines: JSON.stringify(review.quantitativeSnapshot || {}, null, 2).split("\n")
        }
      ];

      const subjectName = `${review.reviewee.firstName || ""} ${review.reviewee.lastName || ""}`.trim();
      const documentPayload = {
        documentTitle: "Performance Review",
        subjectName,
        reviewPeriod: review.reviewPeriod,
        reviewId: review.id,
        generatedAt: new Date().toISOString(),
        sections
      };

      const workflow = resolveReviewWorkflowStatus({
        currentStatus: review.status,
        currentStage: review.stage,
        finalize: true,
        hasExternalStakeholder: Boolean(review.stakeholderId)
      });

      const pdfPath = await renderPerformanceReviewPdf({
        documentTitle: documentPayload.documentTitle,
        subjectName: documentPayload.subjectName,
        reviewPeriod: documentPayload.reviewPeriod,
        sections: documentPayload.sections
      });

      const updated = await prisma.performanceReview.update({
        where: { id: review.id },
        data: {
          status: workflow.status,
          stage: workflow.stage,
          documentPath: pdfPath,
          documentStatus: "FINAL",
          documentPayload,
          isLocked: true,
          lockedAt: new Date(),
          finalizedAt: new Date(),
          finalizedById: actor.id
        }
      });

      await AuditService.log({
        userId: actor.id,
        action: "FINALIZE",
        entityType: "PerformanceReview",
        entityId: updated.id,
        oldValues: {
          status: review.status,
          stage: review.stage,
          isLocked: review.isLocked
        },
        newValues: {
          status: updated.status,
          stage: updated.stage,
          documentPath: updated.documentPath,
          hasDocumentPayload: Boolean(updated.documentPayload),
          isLocked: updated.isLocked
        }
      });

      return updated;
    } catch (error) {
      throw new Error(`Failed to finalize performance review: ${error.message}`);
    }
  }

  static async getPerformanceReviewDocument(reviewId: string, actor: any) {
    try {
      const review = await this.getReviewWithAccessContext(reviewId);

      if (!review) {
        throw new Error("Performance review not found");
      }

      await this.assertPerformanceReviewAccess(review, actor);

      const payload = review.documentPayload;
      const hasPayload =
        payload != null && typeof payload === "object" && Object.keys(payload as object).length > 0;
      if (!review.documentPath && !hasPayload) {
        throw new Error("This review does not have document data yet. Finalize the review first.");
      }

      return {
        reviewId: review.id,
        documentPath: review.documentPath ?? null,
        documentPayload: hasPayload ? review.documentPayload : null,
        documentStatus: review.documentStatus,
        archived: review.documentStatus === "ARCHIVED" || review.status === "ARCHIVED"
      };
    } catch (error) {
      throw new Error(`Failed to retrieve performance review document: ${error.message}`);
    }
  }

  static async getDepartmentRatingDistribution(
    departmentName: string | null | undefined,
    reviewPeriod?: string,
    options?: { organizationWide?: boolean; actor?: { id: string } }
  ) {
    try {
      const orgWide = Boolean(options?.organizationWide);
      const dept = String(departmentName || "").trim();
      if (!orgWide && !dept) {
        throw new Error("departmentName is required unless organizationWide is true");
      }

      if (orgWide) {
        const actor = options?.actor;
        if (!actor?.id) {
          throw new Error("Authentication required for organization-wide rating distribution.");
        }
        const gateUser = await prisma.user.findUnique({
          where: { id: actor.id },
          include: { role: true, department: true, employee: true }
        });
        if (!gateUser || !canBypassPerformanceDepartmentGate(gateUser)) {
          throw new Error(
            "Organization-wide rating distribution is restricted to HR leadership or administrators."
          );
        }
      }

      const reviews = await prisma.performanceReview.findMany({
        where: {
          ...(reviewPeriod ? { reviewPeriod } : {}),
          ...(orgWide
            ? {}
            : {
                reviewee: {
                  OR: [{ department: { name: dept } }, { userDepartment: dept }]
                }
              })
        },
        include: {
          reviewee: {
            include: {
              department: true
            }
          }
        }
      });

      const buckets = [1, 2, 3, 4, 5].map((value) => ({
        rating: value,
        count: 0
      }));

      for (const review of reviews) {
        const ratingValue = Number(review.ratingValue || 0);
        const bucket = buckets.find((item) => item.rating === ratingValue);
        if (bucket) {
          bucket.count += 1;
        }
      }

      return {
        organizationWide: orgWide,
        departmentName: orgWide ? null : dept,
        reviewPeriod: reviewPeriod || null,
        totalReviews: reviews.length,
        distribution: buckets
      };
    } catch (error) {
      throw new Error(`Failed to get rating distribution: ${error.message}`);
    }
  }
}
