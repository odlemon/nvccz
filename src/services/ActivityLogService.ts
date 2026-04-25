// @ts-nocheck
import { prisma } from "../utils/database";

export interface CreateActivityLogRequest {
  activityType: string; // "goal_update", "task_completion", "kpi_update", "general"
  title: string;
  description?: string;
  goalId?: string;
  taskId?: string;
  kpiId?: string;
  monetaryValueAchieved?: number;
  percentValueAchieved?: number;
}

export class ActivityLogService {
  // Create a new activity log
  static async createActivityLog(request: CreateActivityLogRequest, userId: string) {
    try {
      // Validate associated entities if provided
      if (request.goalId) {
        const goal = await prisma.performanceGoal.findUnique({
          where: { id: request.goalId }
        });
        if (!goal) {
          throw new Error("Performance goal not found");
        }
      }

      if (request.taskId) {
        const task = await prisma.task.findUnique({
          where: { id: request.taskId }
        });
        if (!task) {
          throw new Error("Task not found");
        }
      }

      if (request.kpiId) {
        const kpi = await prisma.kPI.findUnique({
          where: { id: request.kpiId }
        });
        if (!kpi) {
          throw new Error("KPI not found");
        }
      }

      // Create the activity log
      const activityLog = await prisma.activityLog.create({
        data: {
          userId: userId,
          activityType: request.activityType,
          title: request.title,
          description: request.description,
          goalId: request.goalId,
          taskId: request.taskId,
          kpiId: request.kpiId,
          monetaryValueAchieved: request.monetaryValueAchieved,
          percentValueAchieved: request.percentValueAchieved,
          status: 'pending_approval'
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          goal: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
          task: {
            select: {
              id: true,
              title: true,
              stage: true,
              priority: true
            }
          },
          kpi: {
            select: {
              id: true,
              name: true,
              type: true,
              unitSymbol: true
            }
          }
        }
      });

      return activityLog;
    } catch (error) {
      throw error;
    }
  }

  // Get all activity logs with filtering
  static async getAllActivityLogs(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.userId) {
        where.userId = filters.userId;
      }

      if (filters.activityType) {
        where.activityType = filters.activityType;
      }

      if (filters.goalId) {
        where.goalId = filters.goalId;
      }

      if (filters.taskId) {
        where.taskId = filters.taskId;
      }

      if (filters.kpiId) {
        where.kpiId = filters.kpiId;
      }

      if (filters.startDate && filters.endDate) {
        where.createdAt = {
          gte: new Date(filters.startDate),
          lte: new Date(filters.endDate)
        };
      }

      if (filters.search) {
        where.OR = [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      const activityLogs = await prisma.activityLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          goal: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
          task: {
            select: {
              id: true,
              title: true,
              stage: true,
              priority: true
            }
          },
          kpi: {
            select: {
              id: true,
              name: true,
              type: true,
              unitSymbol: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return activityLogs;
    } catch (error) {
      throw error;
    }
  }

  // Get activity log by ID
  static async getActivityLogById(id: string) {
    try {
      const activityLog = await prisma.activityLog.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          goal: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
          task: {
            select: {
              id: true,
              title: true,
              stage: true,
              priority: true
            }
          },
          kpi: {
            select: {
              id: true,
              name: true,
              type: true,
              unitSymbol: true
            }
          }
        }
      });

      if (!activityLog) {
        throw new Error("Activity log not found");
      }

      return activityLog;
    } catch (error) {
      throw error;
    }
  }

  // Get activity log statistics
  static async getActivityLogStatistics() {
    try {
      const [
        totalActivityLogs,
        goalUpdates,
        taskCompletions,
        kpiUpdates,
        generalActivities
      ] = await Promise.all([
        prisma.activityLog.count(),
        prisma.activityLog.count({ where: { activityType: "goal_update" } }),
        prisma.activityLog.count({ where: { activityType: "task_completion" } }),
        prisma.activityLog.count({ where: { activityType: "kpi_update" } }),
        prisma.activityLog.count({ where: { activityType: "general" } })
      ]);

      // Get activity logs by user
      const activityLogsByUser = await prisma.activityLog.groupBy({
        by: ['userId'],
        _count: {
          id: true
        },
        orderBy: {
          _count: {
            id: 'desc'
          }
        },
        take: 10
      });

      // Get activity logs by type
      const activityLogsByType = await prisma.activityLog.groupBy({
        by: ['activityType'],
        _count: {
          id: true
        }
      });

      return {
        totalActivityLogs,
        goalUpdates,
        taskCompletions,
        kpiUpdates,
        generalActivities,
        activityLogsByUser,
        activityLogsByType
      };
    } catch (error) {
      throw error;
    }
  }
}


