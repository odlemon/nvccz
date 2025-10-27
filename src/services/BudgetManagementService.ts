// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";

export interface CreateBudgetRequest {
  name: string;
  description?: string;
  budgetType: string; // "monthly", "quarterly", "annual"
  period: string; // "2025-01", "Q1 2025", "2025"
  startDate: Date;
  endDate: Date;
  budgetItems: CreateBudgetItemRequest[];
}

export interface CreateBudgetItemRequest {
  category: string; // "salary", "software_licenses", "office_rent", "travel", "marketing"
  subcategory?: string;
  description: string;
  accountCode?: string;
  budgetedAmount: number;
}

export interface UpdateBudgetRequest {
  name?: string;
  description?: string;
  status?: string;
  isActive?: boolean;
}

export interface UpdateBudgetItemRequest {
  category?: string;
  subcategory?: string;
  description?: string;
  accountCode?: string;
  budgetedAmount?: number;
  actualAmount?: number;
  varianceExplanation?: string;
}

export interface CreateVarianceReportRequest {
  budgetId: string;
  reportPeriod: string;
  significantVariances: any;
  explanations: any;
  actionItems: any;
}

export class BudgetManagementService {
  // Create a new budget with items
  static async createBudget(request: CreateBudgetRequest, createdById: string) {
    try {
      // Calculate total budgeted amount
      const totalBudgeted = request.budgetItems.reduce((sum, item) => sum + item.budgetedAmount, 0);

      // Create budget and items in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the budget
        const budget = await tx.budget.create({
          data: {
            name: request.name,
            description: request.description,
            budgetType: request.budgetType,
            period: request.period,
            totalBudgeted: totalBudgeted,
            startDate: request.startDate,
            endDate: request.endDate,
            createdById: createdById,
            status: "draft",
            isActive: false
          }
        });

        // Create budget items
        const budgetItems = [];
        for (const item of request.budgetItems) {
          const budgetItem = await tx.budgetItem.create({
            data: {
              budgetId: budget.id,
              category: item.category,
              subcategory: item.subcategory,
              description: item.description,
              accountCode: item.accountCode,
              budgetedAmount: item.budgetedAmount,
              actualAmount: 0,
              variance: -item.budgetedAmount, // Initially negative (under budget)
              variancePercentage: 0,
              isSignificantVariance: false,
              createdById: createdById
            }
          });
          budgetItems.push(budgetItem);
        }

        return { budget, budgetItems };
      });

      // Fetch the complete budget with items
      const completeBudget = await prisma.budget.findUnique({
        where: { id: result.budget.id },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          budgetItems: {
            orderBy: {
              category: 'asc'
            }
          }
        }
      });

      return completeBudget;
    } catch (error) {
      throw error;
    }
  }

  // Get all budgets with filtering
  static async getAllBudgets(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.budgetType) {
        where.budgetType = filters.budgetType;
      }

      if (filters.period) {
        where.period = filters.period;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.isActive !== undefined) {
        where.isActive = filters.isActive === 'true';
      }

      const budgets = await prisma.budget.findMany({
        where,
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          budgetItems: {
            orderBy: {
              category: 'asc'
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return budgets;
    } catch (error) {
      throw error;
    }
  }

  // Get budget by ID
  static async getBudgetById(id: string) {
    try {
      const budget = await prisma.budget.findUnique({
        where: { id },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          budgetItems: {
            orderBy: {
              category: 'asc'
            }
          },
          varianceReports: {
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      });

      if (!budget) {
        throw new Error("Budget not found");
      }

      return budget;
    } catch (error) {
      throw error;
    }
  }

  // Update budget
  static async updateBudget(id: string, request: UpdateBudgetRequest) {
    try {
      const budget = await prisma.budget.findUnique({
        where: { id }
      });

      if (!budget) {
        throw new Error("Budget not found");
      }

      const updatedBudget = await prisma.budget.update({
        where: { id },
        data: {
          name: request.name,
          description: request.description,
          status: request.status,
          isActive: request.isActive
        },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          budgetItems: {
            orderBy: {
              category: 'asc'
            }
          }
        }
      });

      return updatedBudget;
    } catch (error) {
      throw error;
    }
  }

  // Delete budget
  static async deleteBudget(id: string) {
    try {
      const budget = await prisma.budget.findUnique({
        where: { id }
      });

      if (!budget) {
        throw new Error("Budget not found");
      }

      await prisma.budget.delete({
        where: { id }
      });

      return { message: "Budget deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // Create budget item
  static async createBudgetItem(budgetId: string, request: CreateBudgetItemRequest, createdById: string) {
    try {
      // Validate budget
      const budget = await prisma.budget.findUnique({
        where: { id: budgetId }
      });

      if (!budget) {
        throw new Error("Budget not found");
      }

      const budgetItem = await prisma.budgetItem.create({
        data: {
          budgetId: budgetId,
          category: request.category,
          subcategory: request.subcategory,
          description: request.description,
          accountCode: request.accountCode,
          budgetedAmount: request.budgetedAmount,
          actualAmount: 0,
          variance: -request.budgetedAmount,
          variancePercentage: 0,
          isSignificantVariance: false,
          createdById: createdById
        }
      });

      // Update budget totals
      await this.updateBudgetTotals(budgetId);

      return budgetItem;
    } catch (error) {
      throw error;
    }
  }

  // Update budget item
  static async updateBudgetItem(id: string, request: UpdateBudgetItemRequest) {
    try {
      const budgetItem = await prisma.budgetItem.findUnique({
        where: { id }
      });

      if (!budgetItem) {
        throw new Error("Budget item not found");
      }

      // Calculate variance
      const actualAmount = request.actualAmount !== undefined ? request.actualAmount : budgetItem.actualAmount;
      const budgetedAmount = request.budgetedAmount !== undefined ? request.budgetedAmount : budgetItem.budgetedAmount;
      const variance = actualAmount - budgetedAmount;
      const variancePercentage = budgetedAmount > 0 ? (variance / budgetedAmount) * 100 : 0;
      const isSignificantVariance = Math.abs(variancePercentage) > 5;

      const updatedBudgetItem = await prisma.budgetItem.update({
        where: { id },
        data: {
          category: request.category,
          subcategory: request.subcategory,
          description: request.description,
          accountCode: request.accountCode,
          budgetedAmount: request.budgetedAmount,
          actualAmount: request.actualAmount,
          variance: variance,
          variancePercentage: variancePercentage,
          isSignificantVariance: isSignificantVariance,
          varianceExplanation: request.varianceExplanation
        }
      });

      // Update budget totals
      await this.updateBudgetTotals(budgetItem.budgetId);

      return updatedBudgetItem;
    } catch (error) {
      throw error;
    }
  }

  // Update budget totals
  static async updateBudgetTotals(budgetId: string) {
    try {
      const budgetItems = await prisma.budgetItem.findMany({
        where: { budgetId }
      });

      const totalBudgeted = budgetItems.reduce((sum, item) => sum + Number(item.budgetedAmount), 0);
      const totalActual = budgetItems.reduce((sum, item) => sum + Number(item.actualAmount), 0);
      const totalVariance = totalActual - totalBudgeted;
      const variancePercentage = totalBudgeted > 0 ? (totalVariance / totalBudgeted) * 100 : 0;

      await prisma.budget.update({
        where: { id: budgetId },
        data: {
          totalBudgeted: totalBudgeted,
          totalActual: totalActual,
          totalVariance: totalVariance,
          variancePercentage: variancePercentage
        }
      });
    } catch (error) {
      throw error;
    }
  }

  // Get budget items
  static async getBudgetItems(budgetId: string) {
    try {
      const budgetItems = await prisma.budgetItem.findMany({
        where: { budgetId },
        orderBy: {
          category: 'asc'
        }
      });

      return budgetItems;
    } catch (error) {
      throw error;
    }
  }

  // Delete budget item
  static async deleteBudgetItem(id: string) {
    try {
      const budgetItem = await prisma.budgetItem.findUnique({
        where: { id }
      });

      if (!budgetItem) {
        throw new Error("Budget item not found");
      }

      await prisma.budgetItem.delete({
        where: { id }
      });

      // Update budget totals
      await this.updateBudgetTotals(budgetItem.budgetId);

      return { message: "Budget item deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // Create variance report
  static async createVarianceReport(request: CreateVarianceReportRequest, preparedById: string) {
    try {
      // Validate budget
      const budget = await prisma.budget.findUnique({
        where: { id: request.budgetId }
      });

      if (!budget) {
        throw new Error("Budget not found");
      }

      // Get significant variances
      const significantVariances = await prisma.budgetItem.findMany({
        where: {
          budgetId: request.budgetId,
          isSignificantVariance: true
        }
      });

      const varianceReport = await prisma.varianceReport.create({
        data: {
          reportPeriod: request.reportPeriod,
          reportType: "budget_variance",
          status: "draft",
          actualExpenses: budget.totalActual,
          budgetedExpenses: budget.totalBudgeted,
          variance: budget.totalVariance,
          variancePercentage: budget.variancePercentage,
          significantVariances: request.significantVariances || significantVariances,
          explanations: request.explanations,
          actionItems: request.actionItems,
          preparedBy: preparedById
        },
        include: {
          preparer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          approver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      return varianceReport;
    } catch (error) {
      throw error;
    }
  }

  // Get variance reports
  static async getVarianceReports(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.reportPeriod) {
        where.reportPeriod = filters.reportPeriod;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      const varianceReports = await prisma.varianceReport.findMany({
        where,
        include: {
          preparer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          approver: {
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

      return varianceReports;
    } catch (error) {
      throw error;
    }
  }

  // Get budget analytics
  static async getBudgetAnalytics(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.budgetType) {
        where.budgetType = filters.budgetType;
      }

      if (filters.timeRange) {
        const days = parseInt(filters.timeRange);
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        where.createdAt = {
          gte: startDate
        };
      }

      const budgets = await prisma.budget.findMany({
        where,
        include: {
          budgetItems: true
        }
      });

      // Calculate analytics
      const totalBudgets = budgets.length;
      const activeBudgets = budgets.filter(b => b.isActive).length;
      const totalBudgeted = budgets.reduce((sum, b) => sum + Number(b.totalBudgeted), 0);
      const totalActual = budgets.reduce((sum, b) => sum + Number(b.totalActual), 0);
      const totalVariance = totalActual - totalBudgeted;
      const averageVariancePercentage = totalBudgets > 0 ? 
        budgets.reduce((sum, b) => sum + Number(b.variancePercentage), 0) / totalBudgets : 0;

      // Category breakdown
      const categoryBreakdown = budgets.reduce((acc, budget) => {
        budget.budgetItems.forEach(item => {
          acc[item.category] = (acc[item.category] || 0) + Number(item.budgetedAmount);
        });
        return acc;
      }, {} as Record<string, number>);

      // Significant variances
      const significantVariances = budgets.reduce((sum, budget) => {
        return sum + budget.budgetItems.filter(item => item.isSignificantVariance).length;
      }, 0);

      return {
        totalBudgets,
        activeBudgets,
        totalBudgeted,
        totalActual,
        totalVariance,
        averageVariancePercentage,
        categoryBreakdown,
        significantVariances
      };
    } catch (error) {
      throw error;
    }
  }
}
