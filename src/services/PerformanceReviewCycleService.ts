// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";

export interface CreateReviewCycleRequest {
  title: string;
  reviewPeriodStart: Date;
  reviewPeriodEnd: Date;
  selfAssessmentDeadline: Date;
  peerReviewDeadline: Date;
  managerReviewDeadline: Date;
  availableReviewTypes: string[]; // ["Self", "Manager", "Peer"]
  reviewRatingScale: string; // "1-5 Scale", "Meets/Exceeds/Needs Improvement"
}

export interface UpdateReviewCycleRequest {
  title?: string;
  reviewPeriodStart?: Date;
  reviewPeriodEnd?: Date;
  selfAssessmentDeadline?: Date;
  peerReviewDeadline?: Date;
  managerReviewDeadline?: Date;
  availableReviewTypes?: string[];
  reviewRatingScale?: string;
  isActive?: boolean;
}

export class PerformanceReviewCycleService {
  /**
   * Create a new performance review cycle
   */
  static async createReviewCycle(request: CreateReviewCycleRequest, createdById: string) {
    try {
      console.log('📋 Creating performance review cycle...');

      // Validate dates
      if (request.selfAssessmentDeadline >= request.peerReviewDeadline) {
        throw new Error("Self-assessment deadline must be before peer review deadline");
      }

      if (request.peerReviewDeadline >= request.managerReviewDeadline) {
        throw new Error("Peer review deadline must be before manager review deadline");
      }

      if (request.reviewPeriodStart >= request.reviewPeriodEnd) {
        throw new Error("Review period start must be before review period end");
      }

      const cycle = await prisma.performanceReviewCycle.create({
        data: {
          title: request.title,
          reviewPeriodStart: request.reviewPeriodStart,
          reviewPeriodEnd: request.reviewPeriodEnd,
          selfAssessmentDeadline: request.selfAssessmentDeadline,
          peerReviewDeadline: request.peerReviewDeadline,
          managerReviewDeadline: request.managerReviewDeadline,
          availableReviewTypes: request.availableReviewTypes,
          reviewRatingScale: request.reviewRatingScale,
          isActive: true
        }
      });

      console.log(`✅ Performance review cycle created: ${cycle.id}`);
      return cycle;

    } catch (error) {
      console.error('❌ Error creating review cycle:', error);
      throw error;
    }
  }

  /**
   * Get all performance review cycles
   */
  static async getAllReviewCycles(filters: any = {}) {
    try {
      const { isActive, page = 1, limit = 10 } = filters;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      const [cycles, total] = await Promise.all([
        prisma.performanceReviewCycle.findMany({
          where,
          include: {
            reviews: {
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
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.performanceReviewCycle.count({ where })
      ]);

      return {
        cycles,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };

    } catch (error) {
      console.error('❌ Error getting review cycles:', error);
      throw error;
    }
  }

  /**
   * Get review cycle by ID
   */
  static async getReviewCycleById(cycleId: string) {
    try {
      const cycle = await prisma.performanceReviewCycle.findUnique({
        where: { id: cycleId },
        include: {
          reviews: {
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
              }
            }
          }
        }
      });

      if (!cycle) {
        throw new Error("Review cycle not found");
      }

      return cycle;

    } catch (error) {
      console.error('❌ Error getting review cycle:', error);
      throw error;
    }
  }

  /**
   * Update performance review cycle
   */
  static async updateReviewCycle(cycleId: string, request: UpdateReviewCycleRequest) {
    try {
      console.log(`📝 Updating review cycle: ${cycleId}`);

      const cycle = await prisma.performanceReviewCycle.findUnique({
        where: { id: cycleId }
      });

      if (!cycle) {
        throw new Error("Review cycle not found");
      }

      const updatedCycle = await prisma.performanceReviewCycle.update({
        where: { id: cycleId },
        data: {
          ...request,
          updatedAt: new Date()
        }
      });

      console.log(`✅ Review cycle updated: ${cycleId}`);
      return updatedCycle;

    } catch (error) {
      console.error('❌ Error updating review cycle:', error);
      throw error;
    }
  }

  /**
   * Delete performance review cycle
   */
  static async deleteReviewCycle(cycleId: string) {
    try {
      console.log(`🗑️ Deleting review cycle: ${cycleId}`);

      const cycle = await prisma.performanceReviewCycle.findUnique({
        where: { id: cycleId },
        include: {
          reviews: true
        }
      });

      if (!cycle) {
        throw new Error("Review cycle not found");
      }

      if (cycle.reviews.length > 0) {
        throw new Error("Cannot delete review cycle with existing reviews");
      }

      await prisma.performanceReviewCycle.delete({
        where: { id: cycleId }
      });

      console.log(`✅ Review cycle deleted: ${cycleId}`);

    } catch (error) {
      console.error('❌ Error deleting review cycle:', error);
      throw error;
    }
  }

  /**
   * Get active review cycle
   */
  static async getActiveReviewCycle() {
    try {
      const cycle = await prisma.performanceReviewCycle.findFirst({
        where: {
          isActive: true
        },
        include: {
          reviews: {
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
              }
            }
          }
        }
      });

      return cycle;

    } catch (error) {
      console.error('❌ Error getting active review cycle:', error);
      throw error;
    }
  }

  /**
   * Check review cycle deadlines and send notifications
   */
  static async checkReviewCycleDeadlines(): Promise<void> {
    try {
      console.log('⏰ Checking review cycle deadlines...');

      const activeCycle = await this.getActiveReviewCycle();
      if (!activeCycle) {
        console.log('ℹ️ No active review cycle found');
        return;
      }

      const now = new Date();
      const notifications = [];

      // Check self-assessment deadline
      if (now >= activeCycle.selfAssessmentDeadline) {
        const overdueSelfAssessments = await this.getOverdueSelfAssessments(activeCycle.id);
        if (overdueSelfAssessments.length > 0) {
          notifications.push({
            type: 'SELF_ASSESSMENT_OVERDUE',
            count: overdueSelfAssessments.length,
            deadline: activeCycle.selfAssessmentDeadline
          });
        }
      }

      // Check peer review deadline
      if (now >= activeCycle.peerReviewDeadline) {
        const overduePeerReviews = await this.getOverduePeerReviews(activeCycle.id);
        if (overduePeerReviews.length > 0) {
          notifications.push({
            type: 'PEER_REVIEW_OVERDUE',
            count: overduePeerReviews.length,
            deadline: activeCycle.peerReviewDeadline
          });
        }
      }

      // Check manager review deadline
      if (now >= activeCycle.managerReviewDeadline) {
        const overdueManagerReviews = await this.getOverdueManagerReviews(activeCycle.id);
        if (overdueManagerReviews.length > 0) {
          notifications.push({
            type: 'MANAGER_REVIEW_OVERDUE',
            count: overdueManagerReviews.length,
            deadline: activeCycle.managerReviewDeadline
          });
        }
      }

      // Send notifications
      if (notifications.length > 0) {
        await this.sendDeadlineNotifications(notifications);
      }

      console.log(`✅ Deadline check completed. Found ${notifications.length} overdue items`);

    } catch (error) {
      console.error('❌ Error checking review cycle deadlines:', error);
      throw error;
    }
  }

  /**
   * Get overdue self-assessments
   */
  static async getOverdueSelfAssessments(cycleId: string) {
    try {
      const cycle = await this.getReviewCycleById(cycleId);
      
      const overdueReviews = await prisma.performanceReview.findMany({
        where: {
          cycleId: cycleId,
          reviewType: 'SELF',
          status: {
            not: 'COMPLETED'
          },
          createdAt: {
            lt: cycle.selfAssessmentDeadline
          }
        },
        include: {
          reviewee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      return overdueReviews;

    } catch (error) {
      console.error('❌ Error getting overdue self-assessments:', error);
      return [];
    }
  }

  /**
   * Get overdue peer reviews
   */
  static async getOverduePeerReviews(cycleId: string) {
    try {
      const cycle = await this.getReviewCycleById(cycleId);
      
      const overdueReviews = await prisma.performanceReview.findMany({
        where: {
          cycleId: cycleId,
          reviewType: 'PEER',
          status: {
            not: 'COMPLETED'
          },
          createdAt: {
            lt: cycle.peerReviewDeadline
          }
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
          }
        }
      });

      return overdueReviews;

    } catch (error) {
      console.error('❌ Error getting overdue peer reviews:', error);
      return [];
    }
  }

  /**
   * Get overdue manager reviews
   */
  static async getOverdueManagerReviews(cycleId: string) {
    try {
      const cycle = await this.getReviewCycleById(cycleId);
      
      const overdueReviews = await prisma.performanceReview.findMany({
        where: {
          cycleId: cycleId,
          reviewType: 'MANAGER',
          status: {
            not: 'COMPLETED'
          },
          createdAt: {
            lt: cycle.managerReviewDeadline
          }
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
          }
        }
      });

      return overdueReviews;

    } catch (error) {
      console.error('❌ Error getting overdue manager reviews:', error);
      return [];
    }
  }

  /**
   * Send deadline notifications
   */
  static async sendDeadlineNotifications(notifications: any[]): Promise<void> {
    try {
      console.log('📧 Sending deadline notifications...');

      for (const notification of notifications) {
        console.log(`📧 ${notification.type}: ${notification.count} overdue items (deadline: ${notification.deadline})`);
        
        // TODO: Implement actual notification sending
        // This would typically send emails, push notifications, etc.
      }

      console.log('✅ Deadline notifications sent');

    } catch (error) {
      console.error('❌ Error sending deadline notifications:', error);
      throw error;
    }
  }

  /**
   * Get review cycle statistics
   */
  static async getReviewCycleStats(cycleId: string) {
    try {
      const cycle = await this.getReviewCycleById(cycleId);
      
      const totalReviews = await prisma.performanceReview.count({
        where: { cycleId: cycleId }
      });

      const completedReviews = await prisma.performanceReview.count({
        where: {
          cycleId: cycleId,
          status: 'COMPLETED'
        }
      });

      const selfAssessments = await prisma.performanceReview.count({
        where: {
          cycleId: cycleId,
          reviewType: 'SELF'
        }
      });

      const peerReviews = await prisma.performanceReview.count({
        where: {
          cycleId: cycleId,
          reviewType: 'PEER'
        }
      });

      const managerReviews = await prisma.performanceReview.count({
        where: {
          cycleId: cycleId,
          reviewType: 'MANAGER'
        }
      });

      const completionRate = totalReviews > 0 ? (completedReviews / totalReviews) * 100 : 0;

      return {
        totalReviews,
        completedReviews,
        completionRate,
        selfAssessments,
        peerReviews,
        managerReviews,
        reviewPeriod: {
          start: cycle.reviewPeriodStart,
          end: cycle.reviewPeriodEnd
        },
        deadlines: {
          selfAssessment: cycle.selfAssessmentDeadline,
          peerReview: cycle.peerReviewDeadline,
          managerReview: cycle.managerReviewDeadline
        }
      };

    } catch (error) {
      console.error('❌ Error getting review cycle stats:', error);
      throw error;
    }
  }

  /**
   * Close review cycle (mark as inactive)
   */
  static async closeReviewCycle(cycleId: string): Promise<void> {
    try {
      console.log(`🔒 Closing review cycle: ${cycleId}`);

      const cycle = await prisma.performanceReviewCycle.findUnique({
        where: { id: cycleId }
      });

      if (!cycle) {
        throw new Error("Review cycle not found");
      }

      await prisma.performanceReviewCycle.update({
        where: { id: cycleId },
        data: {
          isActive: false,
          updatedAt: new Date()
        }
      });

      console.log(`✅ Review cycle closed: ${cycleId}`);

    } catch (error) {
      console.error('❌ Error closing review cycle:', error);
      throw error;
    }
  }
}
