// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";
import { inferKpiScorecardPillar } from "../utils/inferKpiScorecardPillar";
import { normalizeOrgBscScorecardPillar } from "./performanceScorecardSupport";

export interface CreateKPIRequest {
  name: string;
  type: string; // "Metric", "Percentage"
  departmentId?: string;
  /** When true, performance goals linked to this KPI default to reverse scoring (lower actual is better). */
  isReverseKpi: boolean;
  weightValue: number;
  hasUnit: boolean;
  unitCategory: string;
  unit: string;
  unitSymbol: string;
  unitPosition: string; // "prefix", "suffix"
  /** Stable code, e.g. TRAINING_EXPENSE (maps `kpis.kpi_code`). */
  code: string;
  /** Long description (maps `catalog_description`). */
  description: string;
  /** Department label, e.g. Human Resources (maps `catalog_department_name`). */
  catalogDepartmentName: string;
  /** Revenue | Expense | Asset | Liability | Equity */
  accountType: string;
  /** GL / chart identifier for journal lines when `isFinancial` is true. */
  accountNumber?: string | null;
  /** Debit | Credit */
  journalEntryType: string;
  /** When true, goal completion may post journals if `accountNumber` is set (or legacy hardcoded match). */
  isFinancial: boolean;
  /** BSC org pillar; if omitted, inferred from name/department/financial flags. */
  scorecardPillar?: string;
}

export interface UpdateKPIRequest {
  name?: string;
  type?: string;
  departmentId?: string;
  isReverseKpi?: boolean;
  weightValue?: number;
  hasUnit?: boolean;
  unitCategory?: string;
  unit?: string;
  unitSymbol?: string;
  unitPosition?: string;
  isActive?: boolean;
  code?: string;
  description?: string;
  catalogDepartmentName?: string;
  accountType?: string;
  accountNumber?: string | null;
  journalEntryType?: string;
  isFinancial?: boolean;
  scorecardPillar?: string | null;
}

export class KPIService {
  /**
   * Resolves `departments.id` from an exact `departments.name` match (must match catalog / HR label).
   */
  static async resolveDepartmentIdByCatalogDepartmentName(
    catalogDepartmentName: string
  ): Promise<string | null> {
    const n = String(catalogDepartmentName).trim();
    if (!n) return null;
    const dept = await prisma.department.findUnique({
      where: { name: n }
    });
    return dept?.id ?? null;
  }

  /**
   * Sum goal targets/achieved the same way as task-linked goal updates:
   * prefer monetary* fields, else fall back to targetValue / currentValue so KPI % moves when tasks update goals.
   */
  static aggregateGoalsForKpiProgress(goals: any[]) {
    let totalMonetaryTarget = 0;
    let totalMonetaryAchieved = 0;
    let totalPercentTarget = 0;
    let totalPercentAchieved = 0;

    for (const goal of goals) {
      const useMonetaryPair =
        goal.monetaryValue != null && String(goal.monetaryValue) !== "";

      const monetaryTarget = useMonetaryPair
        ? parseFloat(String(goal.monetaryValue))
        : goal.targetValue != null && String(goal.targetValue) !== ""
          ? parseFloat(String(goal.targetValue))
          : 0;

      const monetaryAchieved = useMonetaryPair
        ? parseFloat(String(goal.monetaryValueAchieved ?? 0))
        : goal.currentValue != null && String(goal.currentValue) !== ""
          ? parseFloat(String(goal.currentValue))
          : 0;

      totalMonetaryTarget += monetaryTarget;
      totalMonetaryAchieved += monetaryAchieved;

      if (goal.percentValue != null && String(goal.percentValue) !== "") {
        totalPercentTarget += parseFloat(String(goal.percentValue));
      }
      if (goal.percentValueAchieved != null && String(goal.percentValueAchieved) !== "") {
        totalPercentAchieved += parseFloat(String(goal.percentValueAchieved));
      }
    }

    return {
      totalMonetaryTarget,
      totalMonetaryAchieved,
      totalPercentTarget,
      totalPercentAchieved
    };
  }

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

      const codeTrim = String(request.code).trim();
      const codeTaken = await prisma.kPI.findFirst({
        where: { code: codeTrim }
      });
      if (codeTaken) {
        throw new Error("KPI code already exists");
      }

      const fromRequest =
        request.scorecardPillar && String(request.scorecardPillar).trim()
          ? normalizeOrgBscScorecardPillar(request.scorecardPillar)
          : null;
      const resolvedPillar =
        fromRequest ||
        inferKpiScorecardPillar({
          name: request.name,
          code: codeTrim,
          catalogDescription: request.description,
          accountType: request.accountType,
          catalogDepartmentName: request.catalogDepartmentName,
          isFinancial: request.isFinancial,
          unitCategory: request.unitCategory
        });

      // Create the KPI
      const kpi = await prisma.kPI.create({
        data: {
          name: request.name,
          type: request.type,
          departmentId: request.departmentId,
          isReverseKpi: request.isReverseKpi,
          weightValue: request.weightValue,
          hasUnit: request.hasUnit,
          unitCategory: request.unitCategory,
          unit: request.unit,
          unitSymbol: request.unitSymbol,
          unitPosition: request.unitPosition,
          isActive: true,
          code: codeTrim,
          catalogDescription: request.description,
          catalogDepartmentName: request.catalogDepartmentName,
          accountType: request.accountType,
          accountNumber: request.accountNumber ?? null,
          journalEntryType: request.journalEntryType,
          isFinancial: request.isFinancial,
          scorecardPillar: resolvedPillar
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
          { unit: { contains: filters.search, mode: 'insensitive' } },
          { code: { contains: filters.search } },
          { catalogDescription: { contains: filters.search } }
        ];
      }

      if (filters.scorecardPillar) {
        const p = String(filters.scorecardPillar).trim();
        if (p) {
          where.scorecardPillar = p;
        }
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
      const effectiveDeptIdForUniqueness =
        request.departmentId !== undefined ? request.departmentId : existingKPI.departmentId;
      if (request.name && request.name !== existingKPI.name) {
        const nameConflict = await prisma.kPI.findFirst({
          where: {
            name: request.name,
            departmentId: effectiveDeptIdForUniqueness ?? null,
            id: { not: id }
          }
        });

        if (nameConflict) {
          throw new Error("KPI with this name already exists in this department");
        }
      }

      if (request.code !== undefined && request.code !== existingKPI.code) {
        const nextCode = String(request.code).trim();
        const codeTaken = await prisma.kPI.findFirst({
          where: { code: nextCode, id: { not: id } }
        });
        if (codeTaken) {
          throw new Error("KPI code already exists");
        }
      }

      // Update the KPI
      const updatedKPI = await prisma.kPI.update({
        where: { id },
        data: {
          ...(request.name && { name: request.name }),
          ...(request.type && { type: request.type }),
          ...(request.departmentId !== undefined && { departmentId: request.departmentId }),
          ...(request.isReverseKpi !== undefined && { isReverseKpi: request.isReverseKpi }),
          ...(request.weightValue !== undefined && { weightValue: request.weightValue }),
          ...(request.hasUnit !== undefined && { hasUnit: request.hasUnit }),
          ...(request.unitCategory !== undefined && { unitCategory: request.unitCategory }),
          ...(request.unit !== undefined && { unit: request.unit }),
          ...(request.unitSymbol !== undefined && { unitSymbol: request.unitSymbol }),
          ...(request.unitPosition !== undefined && { unitPosition: request.unitPosition }),
          ...(request.isActive !== undefined && { isActive: request.isActive }),
          ...(request.code !== undefined && { code: String(request.code).trim() || null }),
          ...(request.description !== undefined && { catalogDescription: request.description }),
          ...(request.catalogDepartmentName !== undefined && {
            catalogDepartmentName: request.catalogDepartmentName
          }),
          ...(request.accountType !== undefined && { accountType: request.accountType }),
          ...(request.accountNumber !== undefined && { accountNumber: request.accountNumber }),
          ...(request.journalEntryType !== undefined && { journalEntryType: request.journalEntryType }),
          ...(request.isFinancial !== undefined && { isFinancial: request.isFinancial }),
          ...(request.scorecardPillar !== undefined && {
            scorecardPillar:
              request.scorecardPillar == null
                ? null
                : normalizeOrgBscScorecardPillar(String(request.scorecardPillar)) ||
                  String(request.scorecardPillar).trim() ||
                  null
          })
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

      const kpisByScorecardPillar = await prisma.kPI.groupBy({
        by: ['scorecardPillar'],
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
        kpisByType,
        kpisByScorecardPillar
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
      if (filters.scorecardPillar) {
        const p = String(filters.scorecardPillar).trim();
        if (p) {
          where.scorecardPillar = p;
        }
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
        
        const {
          totalMonetaryTarget,
          totalMonetaryAchieved,
          totalPercentTarget,
          totalPercentAchieved
        } = KPIService.aggregateGoalsForKpiProgress(kpi.performanceGoals);
        
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
      if (filters.scorecardPillar) {
        const p = String(filters.scorecardPillar).trim();
        if (p) {
          where.scorecardPillar = p;
        }
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
        const completedGoals = kpi.performanceGoals.filter(goal => goal.status === 'completed').length;
        
        const {
          totalMonetaryTarget,
          totalMonetaryAchieved,
          totalPercentTarget,
          totalPercentAchieved
        } = KPIService.aggregateGoalsForKpiProgress(kpi.performanceGoals);

        const monetaryProgress = totalMonetaryTarget > 0 
          ? (totalMonetaryAchieved / totalMonetaryTarget) * 100 
          : 0;
        const percentProgress = totalPercentTarget > 0 
          ? (totalPercentAchieved / totalPercentTarget) * 100 
          : 0;
        
        const overallProgress = Math.max(monetaryProgress, percentProgress);
        
        return {
          id: kpi.id,
          name: kpi.name,
          type: kpi.type,
          scorecardPillar: kpi.scorecardPillar,
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
          scorecardPillar: kpi.scorecardPillar,
          progress: kpi.progress
        }));

      const needsAttentionKPIsList = kpisWithProgress
        .filter(kpi => kpi.needsAttention)
        .sort((a, b) => a.progress - b.progress)
        .slice(0, 5)
        .map(kpi => ({
          id: kpi.id,
          name: kpi.name,
          scorecardPillar: kpi.scorecardPillar,
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
