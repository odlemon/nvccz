// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";

export interface CreateKPIRequest {
  name: string;
  type: string; // "Metric", "Percentage"
  departmentId?: string;
  weightValue?: number;
  hasUnit?: boolean;
  unitCategory?: string;
  unit?: string;
  unitSymbol?: string;
  unitPosition?: string; // "prefix", "suffix"
}

export interface UpdateKPIRequest {
  name?: string;
  type?: string;
  departmentId?: string;
  weightValue?: number;
  hasUnit?: boolean;
  unitCategory?: string;
  unit?: string;
  unitSymbol?: string;
  unitPosition?: string;
  isActive?: boolean;
}

export class KPIService {
  // Create a new KPI
  static async createKPI(request: CreateKPIRequest) {
    try {
      // Check if KPI name already exists
      const existingKPI = await prisma.kPI.findFirst({
        where: { 
          name: request.name,
          departmentId: request.departmentId || null
        }
      });

      if (existingKPI) {
        throw new Error("KPI with this name already exists in this department");
      }

      // Create the KPI
      const kpi = await prisma.kPI.create({
        data: {
          name: request.name,
          type: request.type,
          departmentId: request.departmentId,
          weightValue: request.weightValue,
          hasUnit: request.hasUnit || false,
          unitCategory: request.unitCategory,
          unit: request.unit,
          unitSymbol: request.unitSymbol,
          unitPosition: request.unitPosition || "suffix",
          isActive: true
        }
      });

      return kpi;
    } catch (error) {
      throw error;
    }
  }

  // Get all KPIs
  static async getAllKPIs(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.type) {
        where.type = filters.type;
      }

      if (filters.departmentId) {
        where.departmentId = filters.departmentId;
      }

      if (filters.isActive !== undefined) {
        where.isActive = filters.isActive;
      }

      if (filters.hasUnit !== undefined) {
        where.hasUnit = filters.hasUnit;
      }

      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { unitCategory: { contains: filters.search, mode: 'insensitive' } },
          { unit: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      const kpis = await prisma.kPI.findMany({
        where,
        include: {
          performanceGoals: {
            select: {
              id: true,
              title: true,
              status: true,
              stage: true
            }
          },
          _count: {
            select: {
              performanceGoals: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return kpis;
    } catch (error) {
      throw error;
    }
  }

  // Get KPI by ID
  static async getKPIById(id: string) {
    try {
      const kpi = await prisma.kPI.findUnique({
        where: { id },
        include: {
          performanceGoals: {
            include: {
              department: {
                select: {
                  id: true,
                  name: true
                }
              },
              assignedTo: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          },
          _count: {
            select: {
              performanceGoals: true
            }
          }
        }
      });

      if (!kpi) {
        throw new Error("KPI not found");
      }

      return kpi;
    } catch (error) {
      throw error;
    }
  }

  // Update KPI
  static async updateKPI(id: string, request: UpdateKPIRequest) {
    try {
      const existingKPI = await prisma.kPI.findUnique({
        where: { id }
      });

      if (!existingKPI) {
        throw new Error("KPI not found");
      }

      // Check if new name conflicts with existing KPI
      if (request.name && request.name !== existingKPI.name) {
        const nameConflict = await prisma.kPI.findFirst({
          where: { 
            name: request.name,
            departmentId: request.departmentId || existingKPI.departmentId,
            id: { not: id }
          }
        });

        if (nameConflict) {
          throw new Error("KPI with this name already exists in this department");
        }
      }

      // Update the KPI
      const updatedKPI = await prisma.kPI.update({
        where: { id },
        data: {
          ...(request.name && { name: request.name }),
          ...(request.type && { type: request.type }),
          ...(request.departmentId !== undefined && { departmentId: request.departmentId }),
          ...(request.weightValue !== undefined && { weightValue: request.weightValue }),
          ...(request.hasUnit !== undefined && { hasUnit: request.hasUnit }),
          ...(request.unitCategory !== undefined && { unitCategory: request.unitCategory }),
          ...(request.unit !== undefined && { unit: request.unit }),
          ...(request.unitSymbol !== undefined && { unitSymbol: request.unitSymbol }),
          ...(request.unitPosition !== undefined && { unitPosition: request.unitPosition }),
          ...(request.isActive !== undefined && { isActive: request.isActive })
        },
        include: {
          performanceGoals: {
            select: {
              id: true,
              title: true,
              status: true,
              stage: true
            }
          },
          _count: {
            select: {
              performanceGoals: true
            }
          }
        }
      });

      return updatedKPI;
    } catch (error) {
      throw error;
    }
  }

  // Delete KPI
  static async deleteKPI(id: string) {
    try {
      const existingKPI = await prisma.kPI.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              performanceGoals: true
            }
          }
        }
      });

      if (!existingKPI) {
        throw new Error("KPI not found");
      }

      // Check if KPI has associated performance goals
      if (existingKPI._count.performanceGoals > 0) {
        throw new Error("Cannot delete KPI with associated performance goals");
      }

      await prisma.kPI.delete({
        where: { id }
      });

      return { message: "KPI deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // Get KPI statistics
  static async getKPIStatistics() {
    try {
      const [
        totalKPIs,
        metricKPIs,
        percentageKPIs,
        activeKPIs,
        kpisWithUnits
      ] = await Promise.all([
        prisma.kPI.count(),
        prisma.kPI.count({ where: { type: "Metric" } }),
        prisma.kPI.count({ where: { type: "Percentage" } }),
        prisma.kPI.count({ where: { isActive: true } }),
        prisma.kPI.count({ where: { hasUnit: true } })
      ]);

      // Get KPIs by department
      const kpisByDepartment = await prisma.kPI.groupBy({
        by: ['departmentId'],
        _count: {
          id: true
        },
        where: {
          departmentId: { not: null }
        }
      });

      // Get KPIs by type
      const kpisByType = await prisma.kPI.groupBy({
        by: ['type'],
        _count: {
          id: true
        }
      });

      return {
        totalKPIs,
        metricKPIs,
        percentageKPIs,
        activeKPIs,
        kpisWithUnits,
        kpisByDepartment,
        kpisByType
      };
    } catch (error) {
      throw error;
    }
  }

  // Get comprehensive KPI tracking data
  static async getKPITracking(filters: any = {}) {
    try {
      const where: any = {};
      
      // Apply filters
      if (filters.kpiId) {
        where.id = filters.kpiId;
      }
      if (filters.type) {
        where.type = filters.type;
      }
      if (filters.departmentId) {
        where.departmentId = filters.departmentId;
      }
      if (filters.isActive !== undefined) {
        where.isActive = filters.isActive;
      }

      // Get KPIs with comprehensive tracking data
      const kpis = await prisma.kPI.findMany({
        where,
        include: {
          performanceGoals: {
            include: {
              department: {
                select: {
                  id: true,
                  name: true
                }
              },
              assignedTo: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              },
              _count: {
                select: {
                  tasks: true,
                  activityLogs: true
                }
              }
            }
          },
          activityLogs: {
            select: {
              id: true,
              activityType: true,
              title: true,
              description: true,
              monetaryValueAchieved: true,
              percentValueAchieved: true,
              createdAt: true
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 10 // Last 10 activities
          },
          _count: {
            select: {
              performanceGoals: true,
              activityLogs: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Calculate tracking metrics for each KPI
      const kpisWithTracking = kpis.map(kpi => {
        const totalGoals = kpi.performanceGoals.length;
        const activeGoals = kpi.performanceGoals.filter(goal => goal.status === 'active').length;
        const completedGoals = kpi.performanceGoals.filter(goal => goal.status === 'completed').length;
        
        // Calculate total target values
        const totalMonetaryTarget = kpi.performanceGoals.reduce((sum, goal) => 
          sum + (goal.monetaryValue || 0), 0
        );
        const totalPercentTarget = kpi.performanceGoals.reduce((sum, goal) => 
          sum + (goal.percentValue || 0), 0
        );
        
        // Calculate total achieved values
        const totalMonetaryAchieved = kpi.performanceGoals.reduce((sum, goal) => 
          sum + (goal.monetaryValueAchieved || 0), 0
        );
        const totalPercentAchieved = kpi.performanceGoals.reduce((sum, goal) => 
          sum + (goal.percentValueAchieved || 0), 0
        );
        
        // Calculate progress percentages
        const monetaryProgress = totalMonetaryTarget > 0 
          ? (totalMonetaryAchieved / totalMonetaryTarget) * 100 
          : 0;
        const percentProgress = totalPercentTarget > 0 
          ? (totalPercentAchieved / totalPercentTarget) * 100 
          : 0;
        
        // Get recent activity summary
        const recentActivities = kpi.activityLogs.slice(0, 5);
        const totalActivities = kpi._count.activityLogs;
        
        // Calculate goal completion rate
        const goalCompletionRate = totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0;
        
        return {
          ...kpi,
          tracking: {
            totalGoals,
            activeGoals,
            completedGoals,
            goalCompletionRate: Math.round(goalCompletionRate * 100) / 100,
            totalMonetaryTarget,
            totalPercentTarget,
            totalMonetaryAchieved,
            totalPercentAchieved,
            monetaryProgress: Math.round(monetaryProgress * 100) / 100,
            percentProgress: Math.round(percentProgress * 100) / 100,
            totalActivities,
            recentActivities,
            isOnTrack: monetaryProgress >= 80 || percentProgress >= 80,
            needsAttention: monetaryProgress < 50 || percentProgress < 50
          }
        };
      });

      // Calculate overall system metrics
      const totalKPIs = kpisWithTracking.length;
      const activeKPIs = kpisWithTracking.filter(kpi => kpi.isActive).length;
      const onTrackKPIs = kpisWithTracking.filter(kpi => kpi.tracking.isOnTrack).length;
      const needsAttentionKPIs = kpisWithTracking.filter(kpi => kpi.tracking.needsAttention).length;
      
      const totalGoals = kpisWithTracking.reduce((sum, kpi) => sum + kpi.tracking.totalGoals, 0);
      const totalActiveGoals = kpisWithTracking.reduce((sum, kpi) => sum + kpi.tracking.activeGoals, 0);
      const totalCompletedGoals = kpisWithTracking.reduce((sum, kpi) => sum + kpi.tracking.completedGoals, 0);
      
      const overallProgress = totalGoals > 0 
        ? kpisWithTracking.reduce((sum, kpi) => sum + kpi.tracking.monetaryProgress + kpi.tracking.percentProgress, 0) / (totalKPIs * 2)
        : 0;

      return {
        kpis: kpisWithTracking,
        summary: {
          totalKPIs,
          activeKPIs,
          onTrackKPIs,
          needsAttentionKPIs,
          totalGoals,
          totalActiveGoals,
          totalCompletedGoals,
          overallProgress: Math.round(overallProgress * 100) / 100,
          systemHealth: overallProgress >= 70 ? 'healthy' : overallProgress >= 50 ? 'warning' : 'critical'
        },
        filters: {
          applied: filters,
          available: {
            types: ['Metric', 'Percentage'],
            departments: await prisma.kPI.findMany({
              select: { departmentId: true },
              where: { departmentId: { not: null } },
              distinct: ['departmentId']
            }).then(results => results.map(r => r.departmentId).filter(Boolean))
          }
        }
      };
    } catch (error) {
      throw error;
    }
  }

  // Get KPI analytics summary
  static async getKPIAnalyticsSummary(filters: any = {}, period: string = 'month') {
    try {
      const where: any = {};
      
      // Apply filters
      if (filters.departmentId) {
        where.departmentId = filters.departmentId;
      }
      if (filters.isActive !== undefined) {
        where.isActive = filters.isActive;
      }

      // Get all KPIs with their performance goals and activity logs
      const kpis = await prisma.kPI.findMany({
        where,
        include: {
          performanceGoals: {
            include: {
              activityLogs: true
            }
          },
          activityLogs: {
            orderBy: { createdAt: 'desc' },
            take: 10
          },
          _count: {
            select: {
              performanceGoals: true,
              activityLogs: true
            }
          }
        }
      });

      // Calculate summary statistics
      const totalKPIs = kpis.length;
      const activeKPIs = kpis.filter(kpi => kpi.isActive).length;
      
      // Calculate progress for each KPI
      const kpisWithProgress = kpis.map(kpi => {
        const totalGoals = kpi.performanceGoals.length;
        const completedGoals = kpi.performanceGoals.filter(goal => goal.status === 'COMPLETED').length;
        
        // Calculate monetary progress
        const totalMonetaryTarget = kpi.performanceGoals.reduce((sum, goal) => 
          sum + (goal.monetaryValue || 0), 0
        );
        const totalMonetaryAchieved = kpi.performanceGoals.reduce((sum, goal) => 
          sum + (goal.monetaryValueAchieved || 0), 0
        );
        const monetaryProgress = totalMonetaryTarget > 0 
          ? (totalMonetaryAchieved / totalMonetaryTarget) * 100 
          : 0;
        
        // Calculate percentage progress
        const totalPercentTarget = kpi.performanceGoals.reduce((sum, goal) => 
          sum + (goal.percentValue || 0), 0
        );
        const totalPercentAchieved = kpi.performanceGoals.reduce((sum, goal) => 
          sum + (goal.percentValueAchieved || 0), 0
        );
        const percentProgress = totalPercentTarget > 0 
          ? (totalPercentAchieved / totalPercentTarget) * 100 
          : 0;
        
        const overallProgress = Math.max(monetaryProgress, percentProgress);
        
        return {
          id: kpi.id,
          name: kpi.name,
          type: kpi.type,
          departmentId: kpi.departmentId,
          progress: overallProgress,
          isOnTrack: overallProgress >= 80,
          needsAttention: overallProgress < 50
        };
      });

      const completedKPIs = kpisWithProgress.filter(kpi => kpi.progress >= 100).length;
      const onTrackKPIs = kpisWithProgress.filter(kpi => kpi.isOnTrack).length;
      const needsAttentionKPIs = kpisWithProgress.filter(kpi => kpi.needsAttention).length;
      
      const averageProgress = kpisWithProgress.length > 0 
        ? kpisWithProgress.reduce((sum, kpi) => sum + kpi.progress, 0) / kpisWithProgress.length 
        : 0;
      
      const onTrackPercentage = totalKPIs > 0 ? (onTrackKPIs / totalKPIs) * 100 : 0;

      // Department breakdown
      const departmentStats = await prisma.kPI.groupBy({
        by: ['departmentId'],
        where: {
          ...where,
          departmentId: { not: null }
        },
        _count: { id: true }
      });

      // Get department names
      const departmentIds = departmentStats.map(stat => stat.departmentId).filter(Boolean);
      const departments = await prisma.department.findMany({
        where: { id: { in: departmentIds } },
        select: { id: true, name: true }
      });

      const departmentBreakdown = departmentStats.map(stat => {
        const department = departments.find(d => d.id === stat.departmentId);
        const departmentKPIs = kpisWithProgress.filter(kpi => kpi.departmentId === stat.departmentId);
        const departmentProgress = departmentKPIs.length > 0 
          ? departmentKPIs.reduce((sum, kpi) => sum + kpi.progress, 0) / departmentKPIs.length 
          : 0;
        
        return {
          departmentId: stat.departmentId,
          departmentName: department?.name || 'Unknown Department',
          kpiCount: stat._count.id,
          averageProgress: departmentProgress
        };
      });

      // Performance metrics
      const topPerformingKPIs = kpisWithProgress
        .filter(kpi => kpi.progress > 0)
        .sort((a, b) => b.progress - a.progress)
        .slice(0, 5)
        .map(kpi => ({
          id: kpi.id,
          name: kpi.name,
          progress: kpi.progress
        }));

      const needsAttentionKPIsList = kpisWithProgress
        .filter(kpi => kpi.needsAttention)
        .sort((a, b) => a.progress - b.progress)
        .slice(0, 5)
        .map(kpi => ({
          id: kpi.id,
          name: kpi.name,
          progress: kpi.progress
        }));

      // Calculate trends (simplified - in a real implementation, you'd compare with previous periods)
      const trends = {
        period,
        improvementRate: 0, // Would need historical data
        declineRate: 0,     // Would need historical data
        stableRate: 100     // Would need historical data
      };

      return {
        summary: {
          totalKPIs,
          activeKPIs,
          completedKPIs,
          averageProgress: Math.round(averageProgress * 100) / 100,
          onTrackPercentage: Math.round(onTrackPercentage * 100) / 100
        },
        departmentBreakdown,
        performanceMetrics: {
          topPerformingKPIs,
          needsAttentionKPIs: needsAttentionKPIsList
        },
        trends
      };
    } catch (error) {
      console.error("Error getting KPI analytics summary:", error);
      throw error;
    }
  }

}
