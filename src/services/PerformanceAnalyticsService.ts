// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import { HARDCODED_KPIS, HardcodedKPI } from "../config/hardcodedKPIs";
import {
  computeAchievementPercent,
  formatProgressPercent,
  isTargetMet,
  parseGoalCurrentAndTarget,
  resolveEffectiveReverseKpi,
  resolveKpiCurrentFromGoalsForAnalytics,
  resolveKpiProgressPercentForAnalytics,
  resolveKpiSyncStatus,
  resolveKpiTargetFromGoalsForAnalytics,
  filterCompanyGoalsForKpiAnalytics,
  parseGoalCurrentAndTargetForAnalytics
} from "./performanceGoalRollupUtils";
import {
  isDbOrCatalogFinancial,
  resolveKpiFinancialProfile
} from "./kpiFinancialAccountingRules";
import { FinancialKpiGlValueService } from "./FinancialKpiGlValueService";
import { getPostedPeriodNetForAccountNo } from "./AccountingGlPeriodTotalsService";

/** Prisma `KPI` has no `type` field — use `accountType` / `code`; expose legacy `type` on API payloads. */
const KPI_ANALYTICS_SELECT = {
  id: true,
  name: true,
  accountType: true,
  code: true,
  isFinancial: true,
  unitSymbol: true,
  unitPosition: true,
  isReverseKpi: true
} as const;

function kpiWithLegacyTypeField(kpi: any) {
  if (!kpi) return null;
  return {
    ...kpi,
    type: kpi.accountType ?? kpi.code ?? null
  };
}

export class PerformanceAnalyticsService {
  /**
   * Get KPI performance analysis
   */
  static async getKPIAnalysis(
    kpiId?: string,
    department?: string,
    dateRange?: { start: Date; end: Date },
    currencyId?: string
  ) {
    try {
      const whereClause: any = {
        type: "company"
      };
      
      if (kpiId) {
        whereClause.kpiId = kpiId;
      }
      
      if (department) {
        whereClause.departmentName = department;
      }

      if (dateRange) {
        // Analytics period should reflect goals that are relevant in the requested window.
        // Using createdAt breaks long-running goals (e.g. annual payroll KPI) and yields 0% progress for past months.
        // Use date-range overlap on goal.startDate/endDate, with createdAt as a fallback for legacy rows.
        whereClause.OR = [
          {
            AND: [
              { startDate: { lte: dateRange.end } },
              { endDate: { gte: dateRange.start } }
            ]
          },
          {
            createdAt: {
              gte: dateRange.start,
              lte: dateRange.end
            }
          }
        ];
      }

      const goals = await prisma.performanceGoal.findMany({
        where: whereClause,
        include: {
          kpi: {
            select: KPI_ANALYTICS_SELECT
          },
          subGoals: {
            include: {
              subGoals: true
            }
          }
        }
      });

      const financialKPIMap = HARDCODED_KPIS.reduce((map, kpi) => {
        if (kpi.isFinancial) {
          map.set(kpi.name.toLowerCase(), kpi);
        }
        return map;
      }, new Map<string, HardcodedKPI>());

      const financialKpiByCode = HARDCODED_KPIS.reduce((map, kpi) => {
        if (kpi.isFinancial && kpi.code) {
          map.set(String(kpi.code).toUpperCase(), kpi);
        }
        return map;
      }, new Map<string, HardcodedKPI>());

      // Group by KPI (company goals only — organisational goals must have kpiId)
      let goalsWithoutKpi = 0;
      const kpiGroups = goals.reduce((acc, goal) => {
        if (!goal.kpiId) {
          goalsWithoutKpi += 1;
          return acc;
        }
        const kpiId = goal.kpiId;

        if (!acc[kpiId]) {
          acc[kpiId] = {
            kpi: goal.kpi,
            goals: [],
            totalTargetValue: 0,
            totalCurrentValue: 0,
            goalCount: 0
          };
        }

        acc[kpiId].goals.push(goal);
        {
          const { target: t } = parseGoalCurrentAndTargetForAnalytics(goal);
          acc[kpiId].totalTargetValue += t;
        }
        acc[kpiId].goalCount += 1;

        return acc;
      }, {} as any);

      if (goalsWithoutKpi > 0) {
        console.warn(
          `[KPI analytics] Skipped ${goalsWithoutKpi} company goal(s) without kpiId. Run npm run db:backfill:company-goal-kpi-links`
        );
      }

      // Ensure *all* financial KPIs are present in analytics, even when no goals exist for them.
      // This makes the endpoint behave like a live accounting sync.
      const allFinancialKpis = await prisma.kPI.findMany({
        where: {
          OR: [
            { isFinancial: true },
            { code: { in: HARDCODED_KPIS.filter((k) => k.isFinancial).map((k) => k.code) } },
            // Backward compatibility: some environments have financial KPI rows without `code` / `isFinancial` set.
            // Include by catalog name match so analytics can still sync from accounting.
            { name: { in: HARDCODED_KPIS.filter((k) => k.isFinancial).map((k) => k.name) } },
          ],
          isActive: true,
        },
        select: KPI_ANALYTICS_SELECT,
      });
      for (const kpi of allFinancialKpis) {
        if (!kpi?.id) continue;
        if (!kpiGroups[kpi.id]) {
          kpiGroups[kpi.id] = {
            kpi,
            goals: [],
            totalTargetValue: 0,
            totalCurrentValue: 0,
            goalCount: 0,
          };
        }
      }

      // Determine if we need financial statements
      const resolveHardcodedKpiConfig = (kpi: any): HardcodedKPI | null => {
        const codeKey = String(kpi?.code || "").toUpperCase();
        if (codeKey && financialKpiByCode.has(codeKey)) return financialKpiByCode.get(codeKey)!;
        const nameKey = String(kpi?.name || "").toLowerCase();
        if (nameKey && financialKPIMap.has(nameKey)) return financialKPIMap.get(nameKey)!;
        return null;
      };

      const analyticsPeriod = this.resolveAnalyticsPeriod(dateRange);

      // Calculate analytics for each KPI
      const kpiAnalytics = await Promise.all(Object.values(kpiGroups).map(async (group: any) => {
        let accountingValue: number | null = null;
        const hardcodedConfig = resolveHardcodedKpiConfig(group.kpi);
        const catalogAccountType = hardcodedConfig?.accountType ?? group.kpi?.accountType ?? null;
        const isReverseKpi = resolveEffectiveReverseKpi(
          { isReverseKpi: group.kpi?.isReverseKpi, accountType: catalogAccountType },
          group.goals
        );

        const profile = resolveKpiFinancialProfile({
          name: group.kpi?.name ?? "",
          code: group.kpi?.code ?? hardcodedConfig?.code ?? null,
          catalogDescription: hardcodedConfig?.description ?? null,
          catalogDepartmentName: hardcodedConfig?.department ?? null,
          accountType: catalogAccountType,
          accountNumber: hardcodedConfig?.accountNumber ?? null,
          journalEntryType: hardcodedConfig?.journalEntryType ?? null,
          isFinancial: Boolean(group.kpi?.isFinancial || hardcodedConfig?.isFinancial)
        });

        if (isDbOrCatalogFinancial(profile)) {
          accountingValue = await this.getAccountingValueForKpiProfile(
            profile,
            analyticsPeriod,
            currencyId
          );
        }

        const companyGoals = filterCompanyGoalsForKpiAnalytics(group.goals);
        const goalCurrentTotal = resolveKpiCurrentFromGoalsForAnalytics(companyGoals);
        const companyTargetTotal = resolveKpiTargetFromGoalsForAnalytics(companyGoals);
        const hasGoals = companyGoals.length > 0;

        // Primary metrics always from performance goals (same as Total Revenue line).
        const totalCurrentValue = goalCurrentTotal;

        const goalProgressNum = hasGoals
          ? resolveKpiProgressPercentForAnalytics(companyGoals, {
              isReverseKpi,
              accountType: catalogAccountType
            })
          : 0;

        let accountingProgressPercentage: string | undefined;
        if (accountingValue !== null && companyTargetTotal > 0) {
          accountingProgressPercentage = formatProgressPercent(
            computeAchievementPercent({
              currentValue: accountingValue,
              targetValue: companyTargetTotal,
              targetOperator: isReverseKpi ? "<=" : ">=",
              isReverseKpi
            })
          );
        }

        const progressPercentage = formatProgressPercent(goalProgressNum);
        const progressSource: "goals" | "accounting" = "goals";
        const sourceCurrentValue: "performance_goals" | "accounting" = "performance_goals";

        const syncStatus = hasGoals ? resolveKpiSyncStatus(companyGoals) : undefined;

        const goalsTargetMet = companyGoals.filter((g: any) => {
          const { current, target } = parseGoalCurrentAndTargetForAnalytics(g);
          return isTargetMet(
            current,
            target,
            g.targetOperator,
            g.isReverseKpi ?? isReverseKpi
          );
        }).length;

        const completedGoals = companyGoals.filter(
          (g: any) => String(g.stage || "").toLowerCase() === "completed"
        ).length;
        const inProgressGoals = companyGoals.filter(
          (g: any) => String(g.stage || "").toLowerCase() === "in_progress"
        ).length;
        const notStartedGoals = companyGoals.filter(
          (g: any) => String(g.stage || "").toLowerCase() === "planning"
        ).length;

        const completionRate =
          companyGoals.length > 0
            ? formatProgressPercent((completedGoals / companyGoals.length) * 100)
            : "0.00";

        return {
          kpi: kpiWithLegacyTypeField({
            ...group.kpi,
            accountType: catalogAccountType,
            isReverseKpi
          }),
          totalGoals: companyGoals.length,
          completedGoals,
          inProgressGoals,
          notStartedGoals,
          goalsTargetMet,
          totalTargetValue: companyTargetTotal,
          totalCurrentValue,
          sourceCurrentValue,
          progressPercentage,
          progressSource,
          ...(hasGoals && syncStatus ? { syncStatus } : {}),
          ...(accountingValue !== null ? { accountingCurrentValue: accountingValue } : {}),
          ...(accountingProgressPercentage ? { accountingProgressPercentage } : {}),
          completionRate
        };
      }));

      const kpisWithGoals = kpiAnalytics.filter((k) => k.totalGoals > 0);

      return {
        kpiAnalytics,
        summary: {
          totalKPIs: kpiAnalytics.length,
          totalGoals: goals.length,
          goalsWithoutKpi,
          averageProgress:
            kpisWithGoals.length > 0
              ? formatProgressPercent(
                  kpisWithGoals.reduce((sum, kpi) => sum + parseFloat(kpi.progressPercentage), 0) /
                    kpisWithGoals.length
                )
              : "0.00"
        }
      };
    } catch (error) {
      console.error("Error getting KPI analysis:", error);
      throw error;
    }
  }

  /**
   * Get performance dashboard data
   */
  static async getPerformanceDashboard() {
    try {
      // Get all company goals
      const companyGoals = await prisma.performanceGoal.findMany({
        where: { type: 'company' },
        include: {
          kpi: {
            select: KPI_ANALYTICS_SELECT
          },
          subGoals: {
            include: {
              subGoals: true
            }
          }
        }
      });

      // Get department statistics
      const departmentStats = await prisma.performanceGoal.groupBy({
        by: ['departmentName'],
        where: {
          type: 'department',
          departmentName: { not: null }
        },
        _count: {
          id: true
        }
      });

      // Get user statistics
      const userStats = await prisma.user.groupBy({
        by: ['userDepartment'],
        where: {
          userDepartment: { not: null },
          role: {
            name: { notIn: ["admin", "applicant"] }
          }
        },
        _count: {
          id: true
        }
      });

      // Get task statistics
      const taskStats = await prisma.task.groupBy({
        by: ['stage'],
        where: {
          isPerformanceTask: true
        },
        _count: {
          id: true
        }
      });

      // Calculate overall metrics
      const totalGoals = companyGoals.length;
      const totalTargetValue = companyGoals.reduce((sum, goal) => 
        sum + parseFloat(goal.targetValue?.toString() || '0'), 0);
      const totalCurrentValue = companyGoals.reduce((sum, goal) => 
        sum + parseFloat(goal.currentValue?.toString() || '0'), 0);

      const totalTasks = taskStats.reduce((sum, stat) => sum + stat._count.id, 0);
      const completedTasks = taskStats.find(stat => stat.stage === 'completed')?._count.id || 0;

      return {
        overview: {
          totalCompanyGoals: totalGoals,
          totalDepartments: departmentStats.length,
          totalUsers: userStats.reduce((sum, stat) => sum + stat._count.id, 0),
          totalTasks,
          completedTasks,
          overallProgress: totalTargetValue > 0 ? 
            ((totalCurrentValue / totalTargetValue) * 100).toFixed(2) : "0"
        },
        companyGoals: companyGoals.map(goal => ({
          id: goal.id,
          title: goal.title,
          targetValue: goal.targetValue,
          currentValue: goal.currentValue,
          progressPercentage: computeAchievementPercent({
            currentValue: goal.currentValue,
            targetValue: goal.targetValue,
            targetOperator: goal.targetOperator,
            isReverseKpi: goal.isReverseKpi ?? goal.kpi?.isReverseKpi,
            progressPercentage: goal.progressPercentage
          }).toFixed(2),
          stage: goal.stage,
          kpi: kpiWithLegacyTypeField(goal.kpi),
          departmentCount: goal.subGoals.length
        })),
        departmentBreakdown: departmentStats.map(stat => ({
          department: stat.departmentName,
          goalCount: stat._count.id
        })),
        userBreakdown: userStats.map(stat => ({
          department: stat.userDepartment,
          userCount: stat._count.id
        })),
        taskBreakdown: taskStats.map(stat => ({
          stage: stat.stage,
          count: stat._count.id
        }))
      };
    } catch (error) {
      console.error("Error getting performance dashboard:", error);
      throw error;
    }
  }

  /**
   * Get goal progress reports
   */
  static async getGoalProgressReports(filters?: {
    type?: string;
    department?: string;
    stage?: string;
    dateRange?: { start: Date, end: Date };
  }) {
    try {
      const whereClause: any = {};

      if (filters?.type) {
        whereClause.type = filters.type;
      }

      if (filters?.department) {
        whereClause.departmentName = filters.department;
      }

      if (filters?.stage) {
        whereClause.stage = filters.stage;
      }

      if (filters?.dateRange) {
        whereClause.createdAt = {
          gte: filters.dateRange.start,
          lte: filters.dateRange.end
        };
      }

      const goals = await prisma.performanceGoal.findMany({
        where: whereClause,
        include: {
          kpi: {
            select: KPI_ANALYTICS_SELECT
          },
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      const reports = goals.map(goal => ({
        id: goal.id,
        title: goal.title,
        type: goal.type,
        scorecardPillar: goal.scorecardPillar,
        department: goal.departmentName,
        targetValue: goal.targetValue,
        currentValue: goal.currentValue,
        progressPercentage: computeAchievementPercent({
          currentValue: goal.currentValue,
          targetValue: goal.targetValue,
          targetOperator: goal.targetOperator,
          isReverseKpi: goal.isReverseKpi ?? goal.kpi?.isReverseKpi,
          progressPercentage: goal.progressPercentage
        }).toFixed(2),
        stage: goal.stage,
        priority: goal.priority,
        startDate: goal.startDate,
        endDate: goal.endDate,
        kpi: kpiWithLegacyTypeField(goal.kpi),
        assignedTo: goal.assignedTo,
        createdBy: goal.createdBy,
        createdAt: goal.createdAt,
        updatedAt: goal.updatedAt
      }));

      return {
        reports,
        summary: {
          total: reports.length,
          completed: reports.filter(r => r.stage === 'completed').length,
          inProgress: reports.filter(r => r.stage === 'in_progress').length,
          planning: reports.filter(r => r.stage === 'planning').length,
          averageProgress: reports.length > 0 ? 
            (reports.reduce((sum, r) => sum + parseFloat(r.progressPercentage), 0) / reports.length).toFixed(2) : "0"
        }
      };
    } catch (error) {
      console.error("Error getting goal progress reports:", error);
      throw error;
    }
  }

  /**
   * Get department performance comparison
   */
  static async getDepartmentComparison() {
    try {
      const departments = ["Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT", "Investments"];
      
      const comparison = await Promise.all(departments.map(async (dept) => {
        const goals = await prisma.performanceGoal.findMany({
          where: {
            type: 'department',
            departmentName: dept
          }
        });

        const individualGoals = await prisma.performanceGoal.findMany({
          where: {
            type: 'individual',
            parentGoal: {
              departmentName: dept
            }
          }
        });

        const users = await prisma.user.findMany({
          where: {
            userDepartment: dept,
            role: {
              name: { notIn: ["admin", "applicant"] }
            }
          }
        });

        const totalTargetValue = goals.reduce((sum, goal) => 
          sum + parseFloat(goal.targetValue?.toString() || '0'), 0);
        const totalCurrentValue = goals.reduce((sum, goal) => 
          sum + parseFloat(goal.currentValue?.toString() || '0'), 0);

        const completedGoals = goals.filter(g => g.stage === 'completed').length;
        const completedIndividualGoals = individualGoals.filter(g => g.stage === 'completed').length;

        return {
          department: dept,
          goals: {
            total: goals.length,
            completed: completedGoals,
            completionRate: goals.length > 0 ? 
              ((completedGoals / goals.length) * 100).toFixed(2) : "0"
          },
          individualGoals: {
            total: individualGoals.length,
            completed: completedIndividualGoals,
            completionRate: individualGoals.length > 0 ? 
              ((completedIndividualGoals / individualGoals.length) * 100).toFixed(2) : "0"
          },
          users: {
            total: users.length,
            managers: users.filter(u => u.roleCode?.includes('_MGR')).length,
            officers: users.filter(u => u.roleCode?.includes('_OFF')).length,
            members: users.filter(u => u.roleCode?.includes('_MEM')).length
          },
          progress: {
            totalTargetValue,
            totalCurrentValue,
            progressPercentage: totalTargetValue > 0 ? 
              ((totalCurrentValue / totalTargetValue) * 100).toFixed(2) : "0"
          }
        };
      }));

      return {
        departments: comparison,
        summary: {
          totalDepartments: departments.length,
          averageProgress: comparison.length > 0 ? 
            (comparison.reduce((sum, dept) => sum + parseFloat(dept.progress.progressPercentage), 0) / comparison.length).toFixed(2) : "0",
          bestPerformingDepartment: comparison.reduce((best, dept) => 
            parseFloat(dept.progress.progressPercentage) > parseFloat(best.progress.progressPercentage) ? dept : best, comparison[0] || null)
        }
      };
    } catch (error) {
      console.error("Error getting department comparison:", error);
      throw error;
    }
  }

  private static resolveAnalyticsPeriod(dateRange?: { start: Date; end: Date }): {
    periodStart: Date;
    periodEnd: Date;
  } {
    if (dateRange) {
      return { periodStart: dateRange.start, periodEnd: dateRange.end };
    }
    const periodEnd = new Date();
    const periodStart = new Date(
      Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), 1, 0, 0, 0, 0)
    );
    return { periodStart, periodEnd };
  }

  /**
   * GL current value for analytics — same strategies as login sync (per-account period net,
   * not whole P&L section totals shared across unrelated expense KPIs).
   */
  private static async getAccountingValueForKpiProfile(
    profile: ReturnType<typeof resolveKpiFinancialProfile>,
    period: { periodStart: Date; periodEnd: Date },
    currencyId?: string
  ): Promise<number | null> {
    if (!isDbOrCatalogFinancial(profile) || profile.syncStrategy === "unsupported") {
      return null;
    }

    let value = await FinancialKpiGlValueService.fetchNativeGlValue({
      profile,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      currencyId: currencyId?.trim() || undefined
    });

    if (value == null && profile.syncStrategy === "payroll_runs" && profile.accountNumber) {
      value = await getPostedPeriodNetForAccountNo(
        profile.accountNumber,
        period.periodStart,
        period.periodEnd,
        { excludePerformanceJournals: true }
      );
    }

    if (value == null) return null;
    return Math.abs(value);
  }
}
