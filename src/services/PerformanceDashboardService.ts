// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "decimal.js";
import { getPostedPeriodExpenseByAccount } from "./AccountingGlPeriodTotalsService";

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
      /** Ratio 0..1 (value/total). */
      progress: number;
      /** Percentage 0..100 (value/total*100). */
      progressPercent: number;
      /** Convenience label e.g. "9/21". */
      ratioText: string;
      total: number;
    };
    inProgress: {
      value: number;
      change: number;
      changePercent: number;
      progress: number;
      progressPercent: number;
      ratioText: string;
      total: number;
    };
    completed: {
      value: number;
      change: number;
      changePercent: number;
      progress: number;
      progressPercent: number;
      ratioText: string;
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
  
  // Budget Tracker (month: GL actuals; budgeted from accounting budget lines)
  budgetTracker: {
    totalBudget: number;
    totalSpend: number;
    remaining: number;
    /** 0–100 for charts; capped when spend exceeds budget. */
    percentageUsed: number;
    /** True when spend in the period is above total budgeted. */
    overBudget: boolean;
    lineItems: Array<{
      name: string;
      budgeted: number;
      actual: number;
    }>;
  };
  
  // Employee Of The Month
  // NOTE: We do not track real clock-in/out hours, so time-based fields have been removed.
  // Selection and reported numbers are derived purely from task completion in the period.
  employeeOfTheMonth: {
    userId: string;
    name: string;
    role: string;
    department: string;
    email: string;
    taskCount: number;        // total tasks the user was on this month
    tasksCompleted: number;   // tasks at stage='completed'
    tasksInProgress: number;  // tasks at stage='in_progress'
    tasksPending: number;     // tasks at any other stage (todo / planning / blocked / etc.)
    completionRate: number;   // tasksCompleted / taskCount * 100
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
  /**
   * Productivity: completed tasks in period by `updatedAt`.
   * This is intentionally NOT limited to performance-linked tasks, otherwise the dashboard shows 0 despite completed work.
   */
  private static completedTasksWhere(monthStart: Date, monthEnd: Date) {
    return {
      isTrashed: false,
      stage: "completed",
      updatedAt: {
        gte: monthStart,
        lte: monthEnd
      }
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
      
      // Calculate summary cards (STRICTLY within requested period)
      const pendingTasks = currentMonthTasks.filter(t => t.stage === 'todo').length;
      const inProgressTasks = currentMonthTasks.filter(t => t.stage === 'in_progress').length;
      const completedTasks = currentMonthTasks.filter(t => t.stage === 'completed').length;
      const totalTasks = currentMonthTasks.length;
      
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
      
      // Get performance distribution (within period)
      const performanceDistribution = await this.getPerformanceDistribution(currentMonthTasks);
      
      // Get worker performance insights (within period)
      const workerPerformance = await this.getWorkerPerformance(currentMonthTasks);
      
      // Get budget tracker
      const budgetTracker = await this.getBudgetTracker(currentMonthStart, currentMonthEnd);
      
      // Get employee of the month (within period)
      const employeeOfTheMonth = await this.getEmployeeOfTheMonth(currentMonthTasks, currentMonthStart, currentMonthEnd);
      
      return {
        summaryCards: {
          pendingTasks: {
            value: pendingTasks,
            change: pendingChange,
            changePercent: Math.round(pendingChangePercent * 100) / 100,
            progress: totalTasks > 0 ? Math.round((pendingTasks / totalTasks) * 100) / 100 : 0,
            progressPercent: totalTasks > 0 ? Math.round(((pendingTasks / totalTasks) * 100) * 100) / 100 : 0,
            ratioText: `${pendingTasks}/${totalTasks}`,
            total: totalTasks
          },
          inProgress: {
            value: inProgressTasks,
            change: inProgressChange,
            changePercent: Math.round(inProgressChangePercent * 100) / 100,
            progress: totalTasks > 0 ? Math.round((inProgressTasks / totalTasks) * 100) / 100 : 0,
            progressPercent: totalTasks > 0 ? Math.round(((inProgressTasks / totalTasks) * 100) * 100) / 100 : 0,
            ratioText: `${inProgressTasks}/${totalTasks}`,
            total: totalTasks
          },
          completed: {
            value: completedTasks,
            change: completedChange,
            changePercent: Math.round(completedChangePercent * 100) / 100,
            progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) / 100 : 0,
            progressPercent: totalTasks > 0 ? Math.round(((completedTasks / totalTasks) * 100) * 100) / 100 : 0,
            ratioText: `${completedTasks}/${totalTasks}`,
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
        where: PerformanceDashboardService.completedTasksWhere(monthStart, monthEnd)
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
        where: PerformanceDashboardService.completedTasksWhere(prevYearStart, prevYearEnd)
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
  
  private static emptyBudgetTracker(): PerformanceDashboardData["budgetTracker"] {
    return {
      totalBudget: 0,
      totalSpend: 0,
      remaining: 0,
      percentageUsed: 0,
      overBudget: false,
      lineItems: []
    };
  }

  /**
   * Progress % for UI: 0–100. Raw ratio can exceed 100% when spend >> budget (e.g. tiny test budget).
   */
  private static computePercentageUsed(
    totalBudget: number,
    totalSpend: number
  ): { percentageUsed: number; overBudget: boolean } {
    if (totalBudget <= 0) {
      return {
        percentageUsed: totalSpend > 0 ? 100 : 0,
        overBudget: totalSpend > 0
      };
    }
    const raw = (totalSpend / totalBudget) * 100;
    return {
      percentageUsed: Math.min(100, Math.round(raw * 100) / 100),
      overBudget: totalSpend > totalBudget
    };
  }

  private static toBudgetTrackerLine(
    name: string,
    budgeted: number,
    actual: number
  ): PerformanceDashboardData["budgetTracker"]["lineItems"][0] {
    return {
      name,
      budgeted: Math.round(budgeted * 100) / 100,
      actual: Math.round(actual * 100) / 100
    };
  }

  /**
   * Resolve the accounting budget that overlaps the dashboard period (prefer active, then newest).
   */
  private static async getAccountingBudgetForPeriod(windowStart: Date, windowEnd: Date) {
    const budgets = await prisma.budget.findMany({
      where: {
        startDate: { lte: windowEnd },
        endDate: { gte: windowStart }
      },
      include: {
        budgetItems: {
          orderBy: { category: "asc" }
        }
      },
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      take: 1
    });
    return budgets[0] ?? null;
  }

  /** Map budget category labels to GL account name hints (payroll, rent, etc.). */
  private static readonly BUDGET_CATEGORY_GL_HINTS: Record<string, string[]> = {
    salary: ["payroll", "salaries", "wages", "staff cost", "personnel"],
    salaries: ["payroll", "salaries", "wages", "staff cost", "personnel"],
    office_rent: ["rent", "lease"],
    rent: ["rent", "lease"],
    travel: ["travel"],
    marketing: ["market", "advert"],
    software_licenses: ["software", "licence", "license"],
    utilities: ["utilit", "electric", "water"],
    insurance: ["insur"],
    depreciation: ["depreciat"],
    professional_fees: ["legal", "audit", "consult"]
  };

  private static glAccountMatchesBudgetItem(
    account: { accountNo: string; accountName: string },
    item: {
      category: string;
      subcategory: string | null;
      description: string;
      accountCode?: string | null;
    }
  ): boolean {
    const accountNo = (account.accountNo || "").trim();
    const accountName = (account.accountName || "").toLowerCase();
    if (item.accountCode && accountNo === String(item.accountCode).trim()) {
      return true;
    }
    const cat = (item.category || "").toLowerCase().replace(/\s+/g, "_");
    const sub = (item.subcategory || "").toLowerCase();
    const desc = (item.description || "").toLowerCase();
    if (cat && (accountName.includes(cat.replace(/_/g, " ")) || accountName.includes(cat))) {
      return true;
    }
    if (sub && accountName.includes(sub)) return true;
    if (desc && accountName.includes(desc)) return true;
    const hints = this.BUDGET_CATEGORY_GL_HINTS[cat] || [];
    return hints.some((h) => accountName.includes(h));
  }

  /**
   * Merge budget line items with posted GL expense for the dashboard month.
   */
  private static mergeBudgetWithGlActuals(
    budgetItems: Array<{
      id: string;
      category: string;
      subcategory: string | null;
      description: string;
      accountCode?: string | null;
      budgetedAmount: unknown;
      actualAmount: unknown;
      variance: unknown;
      variancePercentage: unknown;
      isSignificantVariance: boolean;
    }>,
    glAccounts: Awaited<ReturnType<typeof getPostedPeriodExpenseByAccount>>
  ): PerformanceDashboardData["budgetTracker"]["lineItems"] {
    const matchedGlIds = new Set<string>();
    const lineItems: PerformanceDashboardData["budgetTracker"]["lineItems"] = [];

    for (const item of budgetItems) {
      const budgeted = Number(item.budgetedAmount);
      let actualFromGl = 0;
      for (const gl of glAccounts) {
        if (this.glAccountMatchesBudgetItem(gl, item)) {
          actualFromGl += gl.actualAmount;
          matchedGlIds.add(gl.chartOfAccountId);
        }
      }
      const storedActual = Number(item.actualAmount);
      const actual = actualFromGl > 0 ? actualFromGl : storedActual;
      const name =
        (item.description && item.description.trim()) ||
        (item.category && item.category.trim()) ||
        "Other";
      if (budgeted > 0 || actual > 0) {
        lineItems.push(this.toBudgetTrackerLine(name, budgeted, actual));
      }
    }

    for (const gl of glAccounts) {
      if (matchedGlIds.has(gl.chartOfAccountId)) continue;
      if (gl.actualAmount <= 0) continue;
      lineItems.push(
        this.toBudgetTrackerLine(gl.accountName, 0, gl.actualAmount)
      );
    }

    return lineItems.sort((a, b) => b.actual - a.actual);
  }

  /**
   * Budget tracker: planned amounts from accounting budget; actuals from posted GL in the month.
   */
  private static async getBudgetTracker(
    windowStart: Date,
    windowEnd: Date
  ): Promise<PerformanceDashboardData["budgetTracker"]> {
    try {
      const glAccounts = await getPostedPeriodExpenseByAccount(windowStart, windowEnd);
      const totalGlExpense = Math.round(
        glAccounts.reduce((s, a) => s + a.actualAmount, 0) * 100
      ) / 100;

      const budget = await this.getAccountingBudgetForPeriod(windowStart, windowEnd);
      if (!budget) {
        const lineItems = glAccounts
          .filter((gl) => gl.actualAmount > 0)
          .map((gl) => this.toBudgetTrackerLine(gl.accountName, 0, gl.actualAmount));
        const { percentageUsed, overBudget } = this.computePercentageUsed(0, totalGlExpense);
        return {
          totalBudget: 0,
          totalSpend: totalGlExpense,
          remaining: -totalGlExpense,
          percentageUsed,
          overBudget,
          lineItems
        };
      }

      const lineItems = this.mergeBudgetWithGlActuals(budget.budgetItems, glAccounts);
      const totalBudget = lineItems.reduce((sum, i) => sum + i.budgeted, 0);
      const totalSpend = lineItems.reduce((sum, i) => sum + i.actual, 0);
      const remaining = totalBudget - totalSpend;
      const { percentageUsed, overBudget } = this.computePercentageUsed(
        totalBudget,
        totalSpend
      );

      return {
        totalBudget: Math.round(totalBudget * 100) / 100,
        totalSpend: Math.round(totalSpend * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        percentageUsed,
        overBudget,
        lineItems
      };
    } catch (error) {
      console.error("Error getting budget tracker:", error);
      return this.emptyBudgetTracker();
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
    role: string;
    department: string;
    email: string;
    taskCount: number;
    tasksCompleted: number;
    tasksInProgress: number;
    tasksPending: number;
    completionRate: number;
  } | null> {
    // `allTasks` here is already filtered to the requested month window.
    const monthTasks = allTasks;
    if (!monthTasks.length) return null;

    // Per-user task breakdown for the month: total / completed / in_progress / other.
    type UserStats = {
      total: number;
      completed: number;
      inProgress: number;
      pending: number; // todo / planning / blocked / null / etc.
    };
    const userTaskStats = new Map<string, UserStats>();

    for (const task of monthTasks) {
      const team = this.parseTeam(task.team);
      const stage = String(task.stage || '').toLowerCase();
      for (const userId of team) {
        if (!userTaskStats.has(userId)) {
          userTaskStats.set(userId, {
            total: 0,
            completed: 0,
            inProgress: 0,
            pending: 0,
          });
        }
        const stats = userTaskStats.get(userId)!;
        stats.total++;
        if (stage === 'completed') {
          stats.completed++;
        } else if (stage === 'in_progress') {
          stats.inProgress++;
        } else {
          stats.pending++;
        }
      }
    }

    if (userTaskStats.size === 0) {
      return null;
    }

    // Pick top performer: highest completion rate, tie-break on # completed, then on total tasks.
    // Users with zero completed tasks are excluded so we never crown someone who shipped nothing.
    let topUserId: string | null = null;
    let topRate = -1;
    let topCompleted = -1;
    let topTotal = -1;

    for (const [userId, stats] of userTaskStats.entries()) {
      if (stats.completed <= 0) continue; // must have at least one completed task to qualify
      const completionRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
      const better =
        completionRate > topRate ||
        (completionRate === topRate && stats.completed > topCompleted) ||
        (completionRate === topRate &&
          stats.completed === topCompleted &&
          stats.total > topTotal);
      if (better) {
        topRate = completionRate;
        topCompleted = stats.completed;
        topTotal = stats.total;
        topUserId = userId;
      }
    }

    if (!topUserId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: topUserId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        userDepartment: true,
        department: { select: { name: true } },
        role: { select: { name: true } },
      },
    });

    if (!user) {
      return null;
    }

    const stats = userTaskStats.get(topUserId)!;
    const completionRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

    // Determine role based on role name or default to Full Time
    let role = 'Full Time';
    if (user.role?.name) {
      const roleName = user.role.name.toLowerCase();
      if (roleName.includes('remote')) role = 'Remote';
      else if (roleName.includes('part')) role = 'Part Time';
      else if (roleName.includes('contract')) role = 'Contract';
      else if (roleName.includes('consultant')) role = 'Consultant';
      else role = 'Full Time';
    }

    return {
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`,
      role,
      department: user.department?.name || user.userDepartment || 'Unassigned',
      email: user.email,
      taskCount: stats.total,
      tasksCompleted: stats.completed,
      tasksInProgress: stats.inProgress,
      tasksPending: stats.pending,
      completionRate: Math.round(completionRate * 100) / 100,
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
