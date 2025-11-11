// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import { HARDCODED_KPIS, HardcodedKPI } from "../config/hardcodedKPIs";

export class PerformanceAnalyticsService {
  /**
   * Get KPI performance analysis
   */
  static async getKPIAnalysis(kpiId?: string, department?: string, dateRange?: { start: Date, end: Date }) {
    try {
      const whereClause: any = {};
      
      if (kpiId) {
        whereClause.kpiId = kpiId;
      }
      
      if (department) {
        whereClause.departmentName = department;
      }

      if (dateRange) {
        whereClause.createdAt = {
          gte: dateRange.start,
          lte: dateRange.end
        };
      }

      const goals = await prisma.performanceGoal.findMany({
        where: whereClause,
        include: {
          kpi: {
            select: {
              id: true,
              name: true,
              type: true,
              unitSymbol: true,
              unitPosition: true
            }
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

      // Group by KPI
      const kpiGroups = goals.reduce((acc, goal) => {
        const kpiId = goal.kpiId || 'no-kpi';
        const kpiName = goal.kpi?.name || 'No KPI';
        
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
        acc[kpiId].totalTargetValue += parseFloat(goal.targetValue?.toString() || '0');
        acc[kpiId].totalCurrentValue += parseFloat(goal.currentValue?.toString() || '0');
        acc[kpiId].goalCount += 1;
        
        return acc;
      }, {} as any);

      // Calculate analytics for each KPI
      const kpiAnalytics = await Promise.all(Object.values(kpiGroups).map(async (group: any) => {
        let accountingValue: number | null = null;
        const kpiNameKey = group.kpi?.name?.toLowerCase();

        if (kpiNameKey && financialKPIMap.has(kpiNameKey)) {
          const kpiConfig = financialKPIMap.get(kpiNameKey)!;
          accountingValue = await this.getAccountingValueForKPI(kpiConfig, dateRange);
        }

        const totalCurrentValue = accountingValue !== null ? accountingValue : group.totalCurrentValue;

        const progressPercentage = group.totalTargetValue > 0 ? 
          ((totalCurrentValue / group.totalTargetValue) * 100).toFixed(2) : "0";
        
        const completedGoals = group.goals.filter((g: any) => g.stage === 'completed').length;
        const inProgressGoals = group.goals.filter((g: any) => g.stage === 'in_progress').length;
        const notStartedGoals = group.goals.filter((g: any) => g.stage === 'planning').length;

        return {
          kpi: group.kpi,
          totalGoals: group.goalCount,
          completedGoals,
          inProgressGoals,
          notStartedGoals,
          totalTargetValue: group.totalTargetValue,
          totalCurrentValue,
          sourceCurrentValue: accountingValue !== null ? 'accounting' : 'performance_goals',
          progressPercentage,
          completionRate: group.goalCount > 0 ? 
            ((completedGoals / group.goalCount) * 100).toFixed(2) : "0"
        };
      }));

      return {
        kpiAnalytics,
        summary: {
          totalKPIs: kpiAnalytics.length,
          totalGoals: goals.length,
          averageProgress: kpiAnalytics.length > 0 ? 
            (kpiAnalytics.reduce((sum, kpi) => sum + parseFloat(kpi.progressPercentage), 0) / kpiAnalytics.length).toFixed(2) : "0"
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
            select: {
              id: true,
              name: true,
              type: true,
              unitSymbol: true,
              unitPosition: true
            }
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
          progressPercentage: goal.targetValue ? 
            ((goal.currentValue || 0) / parseFloat(goal.targetValue.toString()) * 100).toFixed(2) : "0",
          stage: goal.stage,
          kpi: goal.kpi,
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
            select: {
              id: true,
              name: true,
              type: true,
              unitSymbol: true,
              unitPosition: true
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
        category: goal.category,
        department: goal.departmentName,
        targetValue: goal.targetValue,
        currentValue: goal.currentValue,
        progressPercentage: goal.targetValue ? 
          ((goal.currentValue || 0) / parseFloat(goal.targetValue.toString()) * 100).toFixed(2) : "0",
        stage: goal.stage,
        priority: goal.priority,
        startDate: goal.startDate,
        endDate: goal.endDate,
        kpi: goal.kpi,
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

  private static async getAccountingValueForKPI(kpiConfig: HardcodedKPI, dateRange?: { start: Date, end: Date }): Promise<number> {
    if (!kpiConfig.accountNumber) {
      return 0;
    }

    const account = await prisma.chartOfAccounts.findUnique({
      where: { accountNo: kpiConfig.accountNumber }
    });

    if (!account) {
      return 0;
    }

    const journalEntryLines = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: account.id,
        journalEntry: {
          status: 'POSTED',
          ...(dateRange ? {
            transactionDate: {
              gte: dateRange.start,
              lte: dateRange.end
            }
          } : {})
        }
      },
      select: {
        debitAmount: true,
        creditAmount: true
      }
    });

    const totals = journalEntryLines.reduce((acc, line) => {
      acc.debit += Number(line.debitAmount);
      acc.credit += Number(line.creditAmount);
      return acc;
    }, { debit: 0, credit: 0 });

    let net = 0;
    const accountType = kpiConfig.accountType;

    if (accountType === 'Asset' || accountType === 'Expense') {
      net = totals.debit - totals.credit;
    } else {
      net = totals.credit - totals.debit;
    }

    return Math.abs(net);
  }
}
