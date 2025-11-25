// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import { HARDCODED_KPIS, HardcodedKPI } from "../config/hardcodedKPIs";
import { IncomeStatementService } from "./IncomeStatementService";
import { BalanceSheetService } from "./BalanceSheetService";

export class PerformanceAnalyticsService {
  /**
   * Get KPI performance analysis
   */
  static async getKPIAnalysis(kpiId?: string, department?: string, dateRange?: { start: Date, end: Date }, currencyId?: string) {
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

      // Determine if we need financial statements
      const needsIncomeStatement = Object.values(kpiGroups).some((group: any) => {
        const config = HARDCODED_KPIS.find(k => k.name === group.kpi?.name);
        if (!config || !config.isFinancial) return false;
        return ['Revenue', 'Income', 'Expense'].includes(config.accountType);
      });

      const needsBalanceSheet = Object.values(kpiGroups).some((group: any) => {
        const config = HARDCODED_KPIS.find(k => k.name === group.kpi?.name);
        if (!config || !config.isFinancial) return false;
        return ['Asset', 'Current Asset', 'Fixed Asset', 'Long-Term Asset', 'Other Asset', 'Liability', 'Current Liability', 'Long-Term Liability', 'Equity'].includes(config.accountType);
      });

      let effectiveDateRange = dateRange;

      if (!effectiveDateRange && (needsIncomeStatement || needsBalanceSheet)) {
        const earliestEntry = await prisma.journalEntry.findFirst({
          where: { status: 'POSTED' },
          orderBy: { transactionDate: 'asc' },
          select: { transactionDate: true }
        });

        if (earliestEntry?.transactionDate) {
          effectiveDateRange = {
            start: earliestEntry.transactionDate,
            end: new Date()
          };
        }
      }

      const incomeStatementRange = (() => {
        if (!effectiveDateRange) {
          const end = new Date();
          const start = new Date(end.getFullYear(), end.getMonth(), 1);
          return { startDate: start, endDate: end, currencyId: currencyId || undefined };
        }
        return { startDate: effectiveDateRange.start, endDate: effectiveDateRange.end, currencyId: currencyId || undefined };
      })();

      const balanceSheetParams = {
        asOfDate: effectiveDateRange?.end ?? new Date(),
        currencyId: currencyId || undefined
      };

      let incomeStatementPromise: Promise<any> | null = null;
      let balanceSheetPromise: Promise<any> | null = null;

      const loadIncomeStatement = async () => {
        if (!incomeStatementPromise) {
          incomeStatementPromise = IncomeStatementService.generateIncomeStatement(incomeStatementRange);
        }
        return incomeStatementPromise;
      };

      const loadBalanceSheet = async () => {
        if (!balanceSheetPromise) {
          balanceSheetPromise = BalanceSheetService.generateBalanceSheet(balanceSheetParams);
        }
        return balanceSheetPromise;
      };

      // Calculate analytics for each KPI
      const kpiAnalytics = await Promise.all(Object.values(kpiGroups).map(async (group: any) => {
        let accountingValue: number | null = null;
        const kpiNameKey = group.kpi?.name?.toLowerCase();

        if (kpiNameKey && financialKPIMap.has(kpiNameKey)) {
          const kpiConfig = financialKPIMap.get(kpiNameKey)!;
          accountingValue = await this.getAccountingValueForKPI(
            kpiConfig,
            effectiveDateRange,
            needsIncomeStatement ? loadIncomeStatement : null,
            needsBalanceSheet ? loadBalanceSheet : null
          );
        }

        const totalCurrentValue = accountingValue !== null ? accountingValue : group.totalCurrentValue;

        const progressRatio = group.totalTargetValue > 0
          ? totalCurrentValue / group.totalTargetValue
          : 0;

        const progressPercentage = group.totalTargetValue > 0
          ? (progressRatio * 100).toFixed(2)
          : "0";
        
        let completedGoals = group.goals.filter((g: any) => g.stage === 'completed').length;
        let inProgressGoals = group.goals.filter((g: any) => g.stage === 'in_progress').length;
        let notStartedGoals = group.goals.filter((g: any) => g.stage === 'planning').length;

        if (group.goalCount > 0) {
          if (progressRatio >= 1) {
            completedGoals = group.goalCount;
            inProgressGoals = 0;
            notStartedGoals = 0;
          } else if (progressRatio > 0) {
            if (completedGoals === 0 && inProgressGoals === 0) {
              inProgressGoals = group.goalCount;
              notStartedGoals = 0;
            }
          } else {
            completedGoals = 0;
            inProgressGoals = 0;
            notStartedGoals = group.goalCount;
          }
        }

        const calculatedCompletionRate = group.goalCount > 0
          ? Math.min((completedGoals / group.goalCount) * 100, 100)
          : 0;

        const adjustedCompletionRate = progressRatio > 0
          ? Math.min(Math.max(calculatedCompletionRate, progressRatio * 100), 100)
          : calculatedCompletionRate;

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
          completionRate: adjustedCompletionRate.toFixed(2)
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

  private static async getAccountingValueForKPI(
    kpiConfig: HardcodedKPI,
    dateRange: { start: Date, end: Date } | undefined,
    incomeStatementLoader: (() => Promise<any>) | null,
    balanceSheetLoader: (() => Promise<any>) | null
  ): Promise<number> {
    if (!kpiConfig.isFinancial) {
      return 0;
    }

    const accountNumber = kpiConfig.accountNumber;
    const incomeTypes = ['Revenue', 'Income', 'Expense'];
    const balanceTypes = ['Asset', 'Current Asset', 'Fixed Asset', 'Long-Term Asset', 'Other Asset', 'Liability', 'Current Liability', 'Long-Term Liability', 'Equity'];

    const sectionTotalCodes = new Set([
      'TOTAL_REVENUE',
      'OPERATING_EXPENSES',
      'TOTAL_EXPENSES',
      'NET_PROFIT'
    ]);
    const shouldUseSectionTotal = sectionTotalCodes.has(kpiConfig.code);

    if (incomeTypes.includes(kpiConfig.accountType)) {
      if (!incomeStatementLoader) return 0;
      const incomeStatement = await incomeStatementLoader();
      const section = kpiConfig.accountType === 'Expense' ? incomeStatement.expenses : incomeStatement.revenue;
      const accounts = section?.accounts || [];

      if (accountNumber && !shouldUseSectionTotal) {
        const matches = accounts.filter((acc: any) => acc.accountNo === accountNumber);
        if (matches.length > 0) {
          return matches.reduce((sum: number, acc: any) => sum + Math.abs(Number(acc.netAmount ?? acc.total ?? 0)), 0);
        }
      }

      return Math.abs(Number(section?.total ?? 0));
    }

    if (balanceTypes.includes(kpiConfig.accountType)) {
      if (!balanceSheetLoader) return 0;
      const balanceSheet = await balanceSheetLoader();
      const allAccounts: Array<{ accountNo: string; balance: number }> = [];

      const pushAccounts = (list: any[]) => {
        if (!Array.isArray(list)) return;
        for (const acc of list) {
          allAccounts.push({ accountNo: acc.accountNo, balance: Number(acc.balance) });
        }
      };

      pushAccounts(balanceSheet.assets?.currentAssets?.accounts || []);
      pushAccounts(balanceSheet.assets?.fixedAssets?.accounts || []);
      pushAccounts(balanceSheet.assets?.otherAssets?.accounts || []);
      pushAccounts(balanceSheet.liabilities?.currentLiabilities?.accounts || []);
      pushAccounts(balanceSheet.liabilities?.longTermLiabilities?.accounts || []);
      pushAccounts(balanceSheet.equity?.accounts || []);

      if (accountNumber) {
        const matches = allAccounts.filter(acc => acc.accountNo === accountNumber);
        if (matches.length > 0) {
          return matches.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
        }

        if (accountNumber === 'RETAINED_EARNINGS') {
          return Math.abs(Number(balanceSheet.equity?.retainedEarnings ?? 0));
        }
      }

      switch (kpiConfig.accountType) {
        case 'Asset':
        case 'Current Asset':
        case 'Fixed Asset':
        case 'Long-Term Asset':
        case 'Other Asset':
          return Math.abs(Number(balanceSheet.assets?.totalAssets ?? 0));
        case 'Liability':
        case 'Current Liability':
        case 'Long-Term Liability':
          return Math.abs(Number(balanceSheet.liabilities?.totalLiabilities ?? 0));
        case 'Equity':
          return Math.abs(Number(balanceSheet.equity?.total ?? 0) + Number(balanceSheet.equity?.retainedEarnings ?? 0));
      }
    }

    return 0;
  }
}
