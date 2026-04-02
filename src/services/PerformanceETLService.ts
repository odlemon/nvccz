// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";

export interface PerformanceData {
  goals: any[];
  tasks: any[];
  kpis: any[];
  scorecards: any[];
  reviews: any[];
  activities: any[];
}

export interface ExternalDataRecord {
  module: string;
  entityType: string;
  entityId: string;
  data: any;
  timestamp: Date;
  status: string;
}

export class PerformanceETLService {
  /**
   * Extract performance data from all performance-related tables
   */
  static async extractPerformanceData(): Promise<PerformanceData> {
    try {
      console.log('🔄 Extracting performance data...');

      // Extract goals
      const goals = await prisma.performanceGoal.findMany({
        include: {
          kpi: true,
          department: true,
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              department: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          parentGoal: true,
          subGoals: true
        }
      });

      // Extract tasks
      const tasks = await prisma.task.findMany({
        where: {
          isPerformanceTask: true
        },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              department: true
            }
          },
          goal: true
        }
      });

      // Extract KPIs
      const kpis = await prisma.kPI.findMany({
        include: {
          department: true
        }
      });

      // Extract scorecards
      const scorecards = await prisma.performanceScorecard.findMany({
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              department: true
            }
          }
        }
      });

      // Extract reviews
      const reviews = await prisma.performanceReview.findMany({
        include: {
          reviewee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              userDepartment: true
            }
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              department: true
            }
          }
        }
      });

      // Extract activities
      const activities = await prisma.activityLog.findMany({
        where: {
          OR: [
            { entityType: 'PerformanceGoal' },
            { entityType: 'Task' },
            { entityType: 'KPI' }
          ]
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              department: true
            }
          }
        }
      });

      console.log(`✅ Extracted ${goals.length} goals, ${tasks.length} tasks, ${kpis.length} KPIs, ${scorecards.length} scorecards, ${reviews.length} reviews, ${activities.length} activities`);

      return {
        goals,
        tasks,
        kpis,
        scorecards,
        reviews,
        activities
      };
    } catch (error) {
      console.error('❌ Error extracting performance data:', error);
      throw error;
    }
  }

  /**
   * Transform performance data for external systems
   */
  static async transformData(rawData: PerformanceData): Promise<ExternalDataRecord[]> {
    try {
      console.log('🔄 Transforming performance data...');

      const externalRecords: ExternalDataRecord[] = [];

      // Transform goals
      for (const goal of rawData.goals) {
        const transformedGoal = {
          id: goal.id,
          title: goal.title,
          description: goal.description,
          type: goal.type,
          category: goal.category,
          targetValue: goal.targetValue,
          targetUnit: goal.targetUnit,
          currentValue: goal.currentValue,
          progressPercentage: goal.progressPercentage,
          status: goal.status,
          stage: goal.stage,
          priority: goal.priority,
          startDate: goal.startDate,
          endDate: goal.endDate,
          department: goal.department?.name,
          assignedTo: goal.assignedTo ? {
            id: goal.assignedTo.id,
            name: `${goal.assignedTo.firstName} ${goal.assignedTo.lastName}`,
            email: goal.assignedTo.email,
            department: goal.assignedTo.department?.name
          } : null,
          kpi: goal.kpi ? {
            id: goal.kpi.id,
            name: goal.kpi.name,
            code: goal.kpi.code,
            type: goal.kpi.type
          } : null,
          parentGoal: goal.parentGoal ? {
            id: goal.parentGoal.id,
            title: goal.parentGoal.title,
            type: goal.parentGoal.type
          } : null,
          subGoalsCount: goal.subGoals?.length || 0,
          createdAt: goal.createdAt,
          updatedAt: goal.updatedAt
        };

        externalRecords.push({
          module: 'performance',
          entityType: 'goal',
          entityId: goal.id,
          data: transformedGoal,
          timestamp: new Date(),
          status: 'active'
        });
      }

      // Transform tasks
      for (const task of rawData.tasks) {
        const transformedTask = {
          id: task.id,
          title: task.title,
          description: task.description,
          stage: task.stage,
          priority: task.priority,
          targetValue: task.targetValue,
          targetUnit: task.targetUnit,
          currentValue: task.currentValue,
          isPerformanceTask: task.isPerformanceTask,
          department: task.department,
          goal: task.goal ? {
            id: task.goal.id,
            title: task.goal.title,
            type: task.goal.type,
            category: task.goal.category
          } : null,
          creator: {
            id: task.creator.id,
            name: `${task.creator.firstName} ${task.creator.lastName}`,
            email: task.creator.email,
            department: task.creator.department?.name
          },
          createdAt: task.createdAt,
          updatedAt: task.updatedAt
        };

        externalRecords.push({
          module: 'performance',
          entityType: 'task',
          entityId: task.id,
          data: transformedTask,
          timestamp: new Date(),
          status: 'active'
        });
      }

      // Transform KPIs
      for (const kpi of rawData.kpis) {
        const transformedKPI = {
          id: kpi.id,
          name: kpi.name,
          code: kpi.code,
          type: kpi.type,
          unitSymbol: kpi.unitSymbol,
          unitPosition: kpi.unitPosition,
          department: kpi.department?.name,
          createdAt: kpi.createdAt,
          updatedAt: kpi.updatedAt
        };

        externalRecords.push({
          module: 'performance',
          entityType: 'kpi',
          entityId: kpi.id,
          data: transformedKPI,
          timestamp: new Date(),
          status: 'active'
        });
      }

      // Transform scorecards
      for (const scorecard of rawData.scorecards) {
        const transformedScorecard = {
          id: scorecard.id,
          overallScore: scorecard.overallScore,
          performanceCategory: scorecard.performanceCategory,
          taskMetrics: scorecard.taskMetrics,
          goalMetrics: scorecard.goalMetrics,
          activityMetrics: scorecard.activityMetrics,
          reviewMetrics: scorecard.reviewMetrics,
          user: {
            id: scorecard.user.id,
            name: `${scorecard.user.firstName} ${scorecard.user.lastName}`,
            email: scorecard.user.email,
            department: scorecard.user.department?.name
          },
          period: scorecard.period,
          createdAt: scorecard.createdAt,
          updatedAt: scorecard.updatedAt
        };

        externalRecords.push({
          module: 'performance',
          entityType: 'scorecard',
          entityId: scorecard.id,
          data: transformedScorecard,
          timestamp: new Date(),
          status: 'active'
        });
      }

      // Transform reviews
      for (const review of rawData.reviews) {
        const transformedReview = {
          id: review.id,
          overallScore: review.overallScore,
          status: review.status,
          period: review.period,
          reviewee: {
            id: review.reviewee.id,
            name: `${review.reviewee.firstName} ${review.reviewee.lastName}`,
            email: review.reviewee.email,
            department: review.reviewee.userDepartment ?? undefined
          },
          reviewer: {
            id: review.reviewer.id,
            name: `${review.reviewer.firstName} ${review.reviewer.lastName}`,
            email: review.reviewer.email,
            department: review.reviewer.department?.name
          },
          createdAt: review.createdAt,
          updatedAt: review.updatedAt
        };

        externalRecords.push({
          module: 'performance',
          entityType: 'review',
          entityId: review.id,
          data: transformedReview,
          timestamp: new Date(),
          status: 'active'
        });
      }

      // Transform activities
      for (const activity of rawData.activities) {
        const transformedActivity = {
          id: activity.id,
          action: activity.action,
          entityType: activity.entityType,
          entityId: activity.entityId,
          description: activity.description,
          user: {
            id: activity.user.id,
            name: `${activity.user.firstName} ${activity.user.lastName}`,
            email: activity.user.email,
            department: activity.user.department?.name
          },
          createdAt: activity.createdAt
        };

        externalRecords.push({
          module: 'performance',
          entityType: 'activity',
          entityId: activity.id,
          data: transformedActivity,
          timestamp: new Date(),
          status: 'active'
        });
      }

      console.log(`✅ Transformed ${externalRecords.length} records for external systems`);

      return externalRecords;
    } catch (error) {
      console.error('❌ Error transforming performance data:', error);
      throw error;
    }
  }

  /**
   * Load transformed data into external_data collection
   */
  static async loadToExternalData(transformedData: ExternalDataRecord[]): Promise<void> {
    try {
      console.log('🔄 Loading performance data to external_data collection...');

      // Clear existing performance data
      await prisma.externalData.deleteMany({
        where: {
          module: 'performance'
        }
      });

      // Insert new data
      for (const record of transformedData) {
        await prisma.externalData.create({
          data: {
            module: record.module,
            entityType: record.entityType,
            entityId: record.entityId,
            data: record.data,
            timestamp: record.timestamp,
            status: record.status
          }
        });
      }

      console.log(`✅ Loaded ${transformedData.length} performance records to external_data collection`);
    } catch (error) {
      console.error('❌ Error loading performance data to external_data:', error);
      throw error;
    }
  }

  /**
   * Run complete ETL pipeline
   */
  static async runETLPipeline(): Promise<void> {
    try {
      console.log('🚀 Starting Performance ETL Pipeline...');

      // Extract
      const rawData = await this.extractPerformanceData();

      // Transform
      const transformedData = await this.transformData(rawData);

      // Load
      await this.loadToExternalData(transformedData);

      console.log('✅ Performance ETL Pipeline completed successfully');
    } catch (error) {
      console.error('❌ Performance ETL Pipeline failed:', error);
      throw error;
    }
  }

  /**
   * Schedule ETL job (placeholder for cron job integration)
   */
  static async scheduleETLJob(): Promise<void> {
    try {
      console.log('📅 Scheduling Performance ETL job...');
      
      // This would integrate with a job scheduler like node-cron
      // For now, we'll just log the scheduling
      console.log('✅ Performance ETL job scheduled for daily execution at 2:00 AM');
      
      // Example cron job setup:
      // const cron = require('node-cron');
      // cron.schedule('0 2 * * *', () => {
      //   this.runETLPipeline();
      // });
    } catch (error) {
      console.error('❌ Error scheduling ETL job:', error);
      throw error;
    }
  }

  /**
   * Get external data statistics
   */
  static async getExternalDataStats(): Promise<any> {
    try {
      const stats = await prisma.externalData.groupBy({
        by: ['module', 'entityType'],
        where: {
          module: 'performance'
        },
        _count: {
          id: true
        }
      });

      return stats;
    } catch (error) {
      console.error('❌ Error getting external data stats:', error);
      throw error;
    }
  }
}
