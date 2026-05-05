// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "decimal.js";

export interface PerformanceDashboardParams {
  month?: number; // 1-12, defaults to current month
  year?: number; // defaults to current year
}

export interface PerformanceDashboardData {
  // Summary Cards
  summaryCards: {
    pendingTasks: {
      value: number;
      change: number;
      changePercent: number;
      progress: number; // current/total
      total: number;
    };
    inProgress: {
      value: number;
      change: number;
      changePercent: number;
      progress: number; // current/total
      total: number;
    };
    completed: {
      value: number;
      change: number;
      changePercent: number;
      progress: number; // current/total
      total: number;
    };
    completionRate: {
      value: number; // percentage
      change: number;
      changePercent: number;
    };
  };
  
  // Monthly Productivity Overview (Last 12 months)
  monthlyProductivity: {
    currentValue: number; // Total completed tasks in current period
    changeFromLastYear: number; // Percentage change from same period last year
    changePercent: number;
    data: Array<{
      month: string; // "Jan", "Feb", etc.
      monthNumber: number;
      year: number;
      taskCompletedRate: number; // number of completed tasks
    }>;
  };
  
  // Performance Distribution
  performanceDistribution: {
    highPerformers: number; // percentage
    average: number; // percentage
    needImprovement: number; // percentage
  };
  
  // Worker Performance Insights
  workerPerformance: Array<{
    userId: string;
    name: string;
    pictureUrl: string | null;
    role: string; // employment type: Full Time, Remote, Part Time
    department: string;
    taskCount: number;
    progressPercentage: number; // completion rate
  }>;
  
  // Budget Tracker
  budgetTracker: {
    totalBudget: number;
    totalSpend: number;
    remaining: number;
    percentageUsed: number;
  };
  
  // Employee Of The Month
  employeeOfTheMonth: {
    userId: string;
    name: string;
    pictureUrl: string | null;
    role: string;
    department: string;
    email: string;
      phone: string | null; // Note: phone field not available in User model, will be null
    totalTimeWorked: number; // Total hours worked (hours + minutes as decimal)
    timeBreakdown: {
      activeTime: number; // hours
      extraTime: number; // hours
      pauseTime: number; // hours
    };
    taskCount: number;
    completionRate: number;
  } | null;
  
  // Period Information
  period: {
    currentMonth: number;
    currentYear: number;
    startDate: Date;
    endDate: Date;
  };
  
  generatedAt: Date;
}

export class PerformanceDashboardService {
  /** Productivity: performance tasks and any task linked to a performance goal — completed in period by `updatedAt`. */
  private static completedPerfLinkedTasksWhere(monthStart: Date, monthEnd: Date) {
    return {
      isTrashed: false,
      stage: "completed",
      updatedAt: {
        gte: monthStart,
        lte: monthEnd
      },
      OR: [{ isPerformanceTask: true }, { goalId: { not: null } }]
    };
  }

  /**
   * Get comprehensive performance dashboard data
   */
  static async getDashboardData(params: PerformanceDashboardParams = {}): Promise<PerformanceDashboardData> {
    try {
      const now = new Date();
      const currentMonth = params.month || now.getMonth() + 1;
      const currentYear = params.year || now.getFullYear();
      
      // Calculate date ranges
      const currentMonthStart = new Date(currentYear, currentMonth - 1, 1);
      const currentMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
      
      const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      const lastMonthStart = new Date(lastMonthYear, lastMonth - 1, 1);
      const lastMonthEnd = new Date(lastMonthYear, lastMonth, 0, 23, 59, 59, 999);
      
      // Get all tasks (not trashed)
      const allTasks = await prisma.task.findMany({
        where: { isTrashed: false },
        select: {
          id: true,
          stage: true,
          team: true,
          createdAt: true,
          updatedAt: true
        }
      });
      
      // Get current month tasks
      const currentMonthTasks = allTasks.filter(task => {
        const taskDate = new Date(task.createdAt);
        return taskDate >= currentMonthStart && taskDate <= currentMonthEnd;
      });
      
      // Get last month tasks
      const lastMonthTasks = allTasks.filter(task => {
        const taskDate = new Date(task.createdAt);
        return taskDate >= lastMonthStart && taskDate <= lastMonthEnd;
      });
      
      // Calculate summary cards
      const pendingTasks = allTasks.filter(t => t.stage === 'todo').length;
      const inProgressTasks = allTasks.filter(t => t.stage === 'in_progress').length;
      const completedTasks = allTasks.filter(t => t.stage === 'completed').length;
      const totalTasks = allTasks.length;
      
      const lastMonthPending = lastMonthTasks.filter(t => t.stage === 'todo').length;
      const lastMonthInProgress = lastMonthTasks.filter(t => t.stage === 'in_progress').length;
      const lastMonthCompleted = lastMonthTasks.filter(t => t.stage === 'completed').length;
      
      const pendingChange = pendingTasks - lastMonthPending;
      const pendingChangePercent = lastMonthPending > 0 ? (pendingChange / lastMonthPending) * 100 : 0;
      
      const inProgressChange = inProgressTasks - lastMonthInProgress;
      const inProgressChangePercent = lastMonthInProgress > 0 ? (inProgressChange / lastMonthInProgress) * 100 : 0;
      
      const completedChange = completedTasks - lastMonthCompleted;
      const completedChangePercent = lastMonthCompleted > 0 ? (completedChange / lastMonthCompleted) * 100 : 0;
      
      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
      const lastMonthCompletionRate = lastMonthTasks.length > 0 
        ? (lastMonthCompleted / lastMonthTasks.length) * 100 
        : 0;
      const completionRateChange = completionRate - lastMonthCompletionRate;
      const completionRateChangePercent = lastMonthCompletionRate > 0 
        ? (completionRateChange / lastMonthCompletionRate) * 100 
        : 0;
      
      // Get monthly productivity (last 12 months)
      const monthlyProductivity = await this.getMonthlyProductivity(currentYear, currentMonth);
      
      // Get performance distribution
      const performanceDistribution = await this.getPerformanceDistribution(allTasks);
      
      // Get worker performance insights
      const workerPerformance = await this.getWorkerPerformance(allTasks);
      
      // Get budget tracker
      const budgetTracker = await this.getBudgetTracker(currentMonthStart, currentMonthEnd);
      
      // Get employee of the month
      const employeeOfTheMonth = await this.getEmployeeOfTheMonth(allTasks, currentMonthStart, currentMonthEnd);
      
      return {
        summaryCards: {
          pendingTasks: {
            value: pendingTasks,
            change: pendingChange,
            changePercent: Math.round(pendingChangePercent * 100) / 100,
            progress: totalTasks > 0 ? Math.round((pendingTasks / totalTasks) * 100) / 100 : 0,
            total: totalTasks
          },
          inProgress: {
            value: inProgressTasks,
            change: inProgressChange,
            changePercent: Math.round(inProgressChangePercent * 100) / 100,
            progress: totalTasks > 0 ? Math.round((inProgressTasks / totalTasks) * 100) / 100 : 0,
            total: totalTasks
          },
          completed: {
            value: completedTasks,
            change: completedChange,
            changePercent: Math.round(completedChangePercent * 100) / 100,
            progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) / 100 : 0,
            total: totalTasks
          },
          completionRate: {
            value: Math.round(completionRate * 100) / 100,
            change: Math.round(completionRateChange * 100) / 100,
            changePercent: Math.round(completionRateChangePercent * 100) / 100
          }
        },
        monthlyProductivity,
        performanceDistribution,
        workerPerformance,
        budgetTracker,
        employeeOfTheMonth,
        period: {
          currentMonth,
          currentYear,
          startDate: currentMonthStart,
          endDate: currentMonthEnd
        },
        generatedAt: new Date()
      };
    } catch (error) {
      console.error("Error generating performance dashboard:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to generate performance dashboard. Please try again.");
    }
  }
  
  /**
   * Get monthly productivity (last 12 months) with summary
   */
  private static async getMonthlyProductivity(
    currentYear: number,
    currentMonth: number
  ): Promise<{
    currentValue: number;
    changeFromLastYear: number;
    changePercent: number;
    data: Array<{
      month: string;
      monthNumber: number;
      year: number;
      taskCompletedRate: number;
    }>;
  }> {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const productivity: Array<{
      month: string;
      monthNumber: number;
      year: number;
      taskCompletedRate: number;
    }> = [];

    let rollingSumCurrent = 0;
    let rollingSumPriorYear = 0;

    for (let offset = 11; offset >= 0; offset--) {
      const d = new Date(currentYear, currentMonth - 1 - offset, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;

      const monthStart = new Date(y, m - 1, 1);
      const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);

      const completedCount = await prisma.task.count({
        where: PerformanceDashboardService.completedPerfLinkedTasksWhere(monthStart, monthEnd)
      });

      productivity.push({
        month: monthNames[m - 1],
        monthNumber: m,
        year: y,
        taskCompletedRate: completedCount
      });
      rollingSumCurrent += completedCount;

      const prevYearStart = new Date(y - 1, m - 1, 1);
      const prevYearEnd = new Date(y - 1, m, 0, 23, 59, 59, 999);
      const completedPriorYear = await prisma.task.count({
        where: PerformanceDashboardService.completedPerfLinkedTasksWhere(prevYearStart, prevYearEnd)
      });
      rollingSumPriorYear += completedPriorYear;
    }

    const currentValue = rollingSumCurrent;
    const changeFromLastYear = rollingSumCurrent - rollingSumPriorYear;
    const changePercent = rollingSumPriorYear > 0 ? (changeFromLastYear / rollingSumPriorYear) * 100 : 0;

    return {
      currentValue,
      changeFromLastYear,
      changePercent: Math.round(changePercent * 100) / 100,
      data: productivity
    };
  }
  
  /**
   * Get performance distribution (High/Average/Need Improvement)
   */
  private static async getPerformanceDistribution(
    allTasks: any[]
  ): Promise<{
    highPerformers: number;
    average: number;
    needImprovement: number;
  }> {
    // Get all users with tasks
    const userTaskMap = new Map<string, { total: number; completed: number }>();
    
    for (const task of allTasks) {
      const team = this.parseTeam(task.team);
      for (const userId of team) {
        if (!userTaskMap.has(userId)) {
          userTaskMap.set(userId, { total: 0, completed: 0 });
        }
        const userTasks = userTaskMap.get(userId)!;
        userTasks.total++;
        if (task.stage === 'completed') {
          userTasks.completed++;
        }
      }
    }
    
    // Calculate completion rates
    const completionRates: number[] = [];
    for (const [userId, data] of userTaskMap.entries()) {
      if (data.total > 0) {
        const rate = (data.completed / data.total) * 100;
        completionRates.push(rate);
      }
    }
    
    if (completionRates.length === 0) {
      return { highPerformers: 0, average: 0, needImprovement: 100 };
    }
    
    // Categorize: High (>=70%), Average (40-69%), Need Improvement (<40%)
    const highPerformers = completionRates.filter(r => r >= 70).length;
    const average = completionRates.filter(r => r >= 40 && r < 70).length;
    const needImprovement = completionRates.filter(r => r < 40).length;
    
    const total = completionRates.length;
    
    return {
      highPerformers: total > 0 ? Math.round(((highPerformers / total) * 100) * 100) / 100 : 0,
      average: total > 0 ? Math.round(((average / total) * 100) * 100) / 100 : 0,
      needImprovement: total > 0 ? Math.round(((needImprovement / total) * 100) * 100) / 100 : 0
    };
  }
  
  /**
   * Get worker performance insights
   */
  private static async getWorkerPerformance(
    allTasks: any[]
  ): Promise<Array<{
    userId: string;
    name: string;
    pictureUrl: string | null;
    role: string;
    department: string;
    taskCount: number;
    progressPercentage: number;
  }>> {
    // Get all users
    const users = await prisma.user.findMany({
      where: {
        role: {
          name: { notIn: ["admin", "applicant"] }
        }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        userDepartment: true,
        department: {
          select: {
            name: true
          }
        },
        employee: {
          select: {
            pictureUrl: true
          }
        },
        role: {
          select: {
            name: true
          }
        }
      }
    });
    
    // Calculate task counts per user
    const userTaskStats = new Map<string, { total: number; completed: number }>();
    
    for (const task of allTasks) {
      const team = this.parseTeam(task.team);
      for (const userId of team) {
        if (!userTaskStats.has(userId)) {
          userTaskStats.set(userId, { total: 0, completed: 0 });
        }
        const stats = userTaskStats.get(userId)!;
        stats.total++;
        if (task.stage === 'completed') {
          stats.completed++;
        }
      }
    }
    
    // Build worker performance list
    const workerPerformance = users.map(user => {
      const stats = userTaskStats.get(user.id) || { total: 0, completed: 0 };
      const progressPercentage = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
      
      // Determine role/employment type based on role name or default to Full Time
      let role = "Full Time";
      if (user.role?.name) {
        const roleName = user.role.name.toLowerCase();
        if (roleName.includes('remote')) role = "Remote";
        else if (roleName.includes('part')) role = "Part Time";
        else if (roleName.includes('contract')) role = "Contract";
        else if (roleName.includes('consultant')) role = "Consultant";
        else role = "Full Time";
      }
      
      return {
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`,
        pictureUrl: user.employee?.pictureUrl || null,
        role,
        department: user.department?.name || user.userDepartment || 'Unassigned',
        taskCount: stats.total,
        progressPercentage: Math.round(progressPercentage * 100) / 100
      };
    });
    
    // Sort by task count descending, then by completion rate
    workerPerformance.sort((a, b) => {
      if (b.taskCount !== a.taskCount) {
        return b.taskCount - a.taskCount;
      }
      return b.progressPercentage - a.progressPercentage;
    });
    
    // Return top performers (limit to reasonable number)
    return workerPerformance.slice(0, 20);
  }
  
  /**
   * Get budget tracker
   */
  private static async getBudgetTracker(
    windowStart: Date,
    windowEnd: Date
  ): Promise<{
    totalBudget: number;
    totalSpend: number;
    remaining: number;
    percentageUsed: number;
  }> {
    try {
      const notArchived = ["ARCHIVED", "CANCELLED", "archived", "cancelled"] as const;

      let contracts = await prisma.performanceContract.findMany({
        where: {
          status: { notIn: notArchived as unknown as string[] },
          periodStart: { lte: windowEnd },
          periodEnd: { gte: windowStart }
        },
        select: {
          allocatedBudget: true,
          actualSpend: true
        }
      });

      // Broader fallback: some tenants only set contract dates loosely — still surface portfolio budgets.
      if (contracts.length === 0) {
        contracts = await prisma.performanceContract.findMany({
          where: {
            status: { notIn: notArchived as unknown as string[] }
          },
          select: {
            allocatedBudget: true,
            actualSpend: true
          }
        });
      }

      if (contracts.length === 0) {
        const activeBudget = await prisma.budget.findFirst({
          where: { isActive: true },
          include: {
            budgetItems: true
          }
        });
        if (!activeBudget) {
          return {
            totalBudget: 0,
            totalSpend: 0,
            remaining: 0,
            percentageUsed: 0
          };
        }
        const totalBudget = parseFloat(activeBudget.totalBudgeted.toString());
        const totalSpend = parseFloat(activeBudget.totalActual.toString());
        const remaining = totalBudget - totalSpend;
        const percentageUsed = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0;
        return {
          totalBudget,
          totalSpend,
          remaining,
          percentageUsed
        };
      }

      let totalBudget = 0;
      let totalSpend = 0;
      for (const c of contracts) {
        totalBudget += c.allocatedBudget != null ? Number(c.allocatedBudget) : 0;
        totalSpend += c.actualSpend != null ? Number(c.actualSpend) : 0;
      }
      const remaining = totalBudget - totalSpend;
      const percentageUsed = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0;

      return {
        totalBudget,
        totalSpend,
        remaining,
        percentageUsed: Math.round(percentageUsed * 100) / 100
      };
    } catch (error) {
      console.error("Error getting budget tracker:", error);
      return {
        totalBudget: 0,
        totalSpend: 0,
        remaining: 0,
        percentageUsed: 0
      };
    }
  }
  
  /**
   * Get employee of the month
   */
  private static async getEmployeeOfTheMonth(
    allTasks: any[],
    monthStart: Date,
    monthEnd: Date
  ): Promise<{
    userId: string;
    name: string;
    pictureUrl: string | null;
    role: string;
    department: string;
    email: string;
      phone: string | null; // Note: phone field not available in User model, will be null
    totalTimeWorked: number;
    timeBreakdown: {
      activeTime: number;
      extraTime: number;
      pauseTime: number;
    };
    taskCount: number;
    completionRate: number;
  } | null> {
    // Get tasks for current month
    let monthTasks = allTasks.filter(task => {
      const taskDate = new Date(task.createdAt);
      return taskDate >= monthStart && taskDate <= monthEnd;
    });
    
    // If no tasks in current month, try to find the most recent month with tasks
    if (monthTasks.length === 0) {
      // Group tasks by month
      const tasksByMonth = new Map<string, any[]>();
      for (const task of allTasks) {
        const taskDate = new Date(task.createdAt);
        const monthKey = `${taskDate.getFullYear()}-${taskDate.getMonth()}`;
        if (!tasksByMonth.has(monthKey)) {
          tasksByMonth.set(monthKey, []);
        }
        tasksByMonth.get(monthKey)!.push(task);
      }
      
      // Get the most recent month with tasks
      const sortedMonths = Array.from(tasksByMonth.keys()).sort().reverse();
      if (sortedMonths.length > 0) {
        monthTasks = tasksByMonth.get(sortedMonths[0]) || [];
      }
    }
    
    // Calculate task counts per user for the month
    const userTaskStats = new Map<string, { total: number; completed: number }>();
    
    for (const task of monthTasks) {
      const team = this.parseTeam(task.team);
      for (const userId of team) {
        if (!userTaskStats.has(userId)) {
          userTaskStats.set(userId, { total: 0, completed: 0 });
        }
        const stats = userTaskStats.get(userId)!;
        stats.total++;
        if (task.stage === 'completed') {
          stats.completed++;
        }
      }
    }
    
    if (userTaskStats.size === 0) {
      return null;
    }
    
    // Find top performer (highest completion rate, then highest task count)
    let topUserId: string | null = null;
    let topScore = 0;
    
    for (const [userId, stats] of userTaskStats.entries()) {
      const completionRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
      const score = completionRate * 100 + stats.total; // Weighted score
      
      if (score > topScore) {
        topScore = score;
        topUserId = userId;
      }
    }
    
    if (!topUserId) {
      return null;
    }
    
    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: topUserId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        userDepartment: true,
        department: {
          select: {
            name: true
          }
        },
        employee: {
          select: {
            pictureUrl: true
          }
        },
        role: {
          select: {
            name: true
          }
        }
      }
    });
    
    if (!user) {
      return null;
    }
    
    const stats = userTaskStats.get(topUserId)!;
    const completionRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
    
    // Determine role based on role name or default to Full Time
    let role = "Full Time";
    if (user.role?.name) {
      const roleName = user.role.name.toLowerCase();
      if (roleName.includes('remote')) role = "Remote";
      else if (roleName.includes('part')) role = "Part Time";
      else if (roleName.includes('contract')) role = "Contract";
      else if (roleName.includes('consultant')) role = "Consultant";
      else role = "Full Time";
    }
    
    // Calculate total time worked (simplified - based on task count)
    // In a real system, this would come from time tracking
    // Estimate: 2 hours per task for active time
    const activeTime = stats.total * 2;
    // Extra time: 20% of active time for high performers
    const extraTime = completionRate >= 80 ? activeTime * 0.2 : 0;
    // Pause time: 10% of active time
    const pauseTime = activeTime * 0.1;
    const totalTimeWorked = activeTime + extraTime; // Total doesn't include pause time
    
    return {
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`,
      pictureUrl: user.employee?.pictureUrl || null,
      role,
      department: user.department?.name || user.userDepartment || 'Unassigned',
      email: user.email,
      phone: null, // Phone field not available in User model
      totalTimeWorked: Math.round((totalTimeWorked * 100) / 100), // Round to 2 decimals
      timeBreakdown: {
        activeTime: Math.round((activeTime * 100) / 100),
        extraTime: Math.round((extraTime * 100) / 100),
        pauseTime: Math.round((pauseTime * 100) / 100)
      },
      taskCount: stats.total,
      completionRate: Math.round(completionRate * 100) / 100
    };
  }
  
  /**
   * Parse team JSON field to array of user IDs
   */
  private static parseTeam(team: any): string[] {
    if (!team) return [];
    if (Array.isArray(team)) return team as string[];
    if (typeof team === 'string') {
      try {
        const parsed = JSON.parse(team);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}
