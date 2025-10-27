// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";

export interface CreatePerformanceReviewRequest {
  reviewType: string;
  reviewPeriod: string;
  title: string;
  description?: string;
  revieweeId: string;
  reviewerId: string;
  stakeholderId?: string;
  reviewStartDate?: string;
  reviewEndDate?: string;
  dueDate?: string;
  criteria?: any[];
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

  static async createPerformanceReview(request: CreatePerformanceReviewRequest) {
    try {
      // Validate reviewee exists
      const reviewee = await prisma.user.findUnique({
        where: { id: request.revieweeId }
      });

      if (!reviewee) {
        throw new Error(`User with ID ${request.revieweeId} not found`);
      }

      // Validate reviewer exists
      const reviewer = await prisma.user.findUnique({
        where: { id: request.reviewerId }
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
          nextReviewDate: request.nextReviewDate ? new Date(request.nextReviewDate) : null
        },
        include: {
          reviewee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              department: {
                select: {
                  id: true,
                  name: true
                }
              }
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

  static async getAllPerformanceReviews(page: number = 1, limit: number = 10, filters?: any) {
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

      const [reviews, total] = await Promise.all([
        prisma.performanceReview.findMany({
          where,
          skip,
          take: limit,
          include: {
            reviewee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                department: {
                  select: {
                    id: true,
                    name: true
                  }
                }
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

  static async getPerformanceReviewById(id: string) {
    try {
      const review = await prisma.performanceReview.findUnique({
        where: { id },
        include: {
          reviewee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              department: {
                select: {
                  id: true,
                  name: true
                }
              }
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

  static async updatePerformanceReview(id: string, request: UpdatePerformanceReviewRequest) {
    try {
      const existingReview = await prisma.performanceReview.findUnique({
        where: { id }
      });

      if (!existingReview) {
        throw new Error(`Performance review with ID ${id} not found`);
      }

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

      const review = await prisma.performanceReview.update({
        where: { id },
        data: updateData,
        include: {
          reviewee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              department: {
                select: {
                  id: true,
                  name: true
                }
              }
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

  static async deletePerformanceReview(id: string) {
    try {
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
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
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
        const departmentId = review.reviewee.department?.id || 'no-department';
        const departmentName = review.reviewee.department?.name || 'No Department';
        
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
}
