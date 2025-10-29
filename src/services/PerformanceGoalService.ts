// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";

export interface CreatePerformanceGoalRequest {
  title: string;
  description?: string;
  type: string; // "company", "department", "individual"
  category: string; // "financial", "operational", "strategic"
  parentGoalId?: string;
  departmentName?: string; // Use hardcoded department names
  // Absolute value targets (replacing percentage-based)
  targetValue: number; // Absolute target value
  targetUnit: string; // "USD", "clients", "invoices", "percentage", "hours", etc.
  currentValue?: number; // Current progress value
  kpiName?: string; // KPI name instead of ID
  priority?: string;
  startDate: Date;
  endDate: Date;
  assignedToId?: string;
  cascadeMode?: string; // "automatic", "manual", "both"
  // NEW: Enhanced Goal Definition Form Fields
  targetOperator?: string; // ">=", "<=", "=" comparison operators
  dataSourceModule?: string; // "Accounting", "Procurement", "PortfolioManagement", "TaskManagement", "Events", "Manual"
  dataSourceField?: string; // Specific field path in source module
  trackingFrequency?: string; // "Daily", "Weekly", "Monthly"
}

export interface UpdatePerformanceGoalRequest {
  title?: string;
  description?: string;
  type?: string;
  category?: string;
  // Absolute value targets (replacing percentage-based)
  targetValue?: number; // Updated target value
  targetUnit?: string; // Updated target unit
  currentValue?: number; // Current progress value
  kpiId?: string;
  priority?: string;
  status?: string;
  stage?: string;
  startDate?: Date;
  endDate?: Date;
  assignedToId?: string;
  // NEW: Enhanced Goal Definition Form Fields
  targetOperator?: string; // ">=", "<=", "=" comparison operators
  dataSourceModule?: string; // "Accounting", "Procurement", "PortfolioManagement", "TaskManagement", "Events", "Manual"
  dataSourceField?: string; // Specific field path in source module
  trackingFrequency?: string; // "Daily", "Weekly", "Monthly"
}

export class PerformanceGoalService {
  // Calculate progress percentage based on absolute values
  static calculateProgressPercentage(currentValue: number, targetValue: number): number {
    if (targetValue === 0) return 0;
    return Math.min((currentValue / targetValue) * 100, 100);
  }

  // Calculate next check date based on tracking frequency
  static calculateNextCheckDate(frequency: string): Date {
    const now = new Date();
    
    switch (frequency.toLowerCase()) {
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'monthly':
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      default:
        console.log(`⚠️ Unknown frequency: ${frequency}, defaulting to weekly`);
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
  }

  // Update goal progress with absolute values
  static async updateGoalProgress(goalId: string, currentValue: number, updatedById: string) {
    try {
      const goal = await prisma.performanceGoal.findUnique({
        where: { id: goalId }
      });

      if (!goal) {
        throw new Error("Goal not found");
      }

      const progressPercentage = this.calculateProgressPercentage(currentValue, goal.targetValue);
      const isCompleted = currentValue >= goal.targetValue;

      const updatedGoal = await prisma.performanceGoal.update({
        where: { id: goalId },
        data: {
          currentValue: currentValue,
          progressPercentage: progressPercentage,
          status: isCompleted ? "completed" : "active",
          stage: isCompleted ? "completed" : goal.stage,
          updatedAt: new Date()
        }
      });

      // If goal is completed and has KPI integration, trigger accounting
      if (isCompleted && goal.kpiId) {
        await this.triggerAccountingIntegration(goalId, currentValue, updatedById);
      }

      return updatedGoal;
    } catch (error) {
      throw new Error(`Failed to update goal progress: ${error.message}`);
    }
  }

  // Trigger accounting integration when KPI goals are completed
  static async triggerAccountingIntegration(goalId: string, achievedValue: number, updatedById: string) {
    try {
      const goal = await prisma.performanceGoal.findUnique({
        where: { id: goalId },
        include: { kpi: true }
      });

      if (!goal || !goal.kpi) {
        return;
      }

      // Import the hardcoded KPIs to get accounting details
      const { HARDCODED_KPIS } = await import("../config/hardcodedKPIs");
      const kpiConfig = HARDCODED_KPIS.find(k => k.code === goal.kpi.code);

      if (kpiConfig && kpiConfig.isFinancial) {
        // Create journal entry based on KPI completion
        const journalEntry = await prisma.journalEntry.create({
          data: {
            description: `KPI Achievement: ${goal.title} - ${achievedValue} ${goal.targetUnit}`,
            totalAmount: achievedValue,
            currencyId: "USD", // Default currency
            status: "POSTED",
            createdById: updatedById,
            journalEntryLines: {
              create: [
                {
                  chartOfAccountId: kpiConfig.journalEntryType === "Debit" ? kpiConfig.accountNumber : "1000", // Cash
                  debitAmount: kpiConfig.journalEntryType === "Debit" ? achievedValue : 0,
                  creditAmount: kpiConfig.journalEntryType === "Credit" ? achievedValue : 0,
                  description: `KPI: ${goal.kpi.name}`
                },
                {
                  chartOfAccountId: kpiConfig.journalEntryType === "Credit" ? kpiConfig.accountNumber : "1000", // Cash
                  debitAmount: kpiConfig.journalEntryType === "Credit" ? achievedValue : 0,
                  creditAmount: kpiConfig.journalEntryType === "Debit" ? achievedValue : 0,
                  description: `KPI: ${goal.kpi.name}`
                }
              ]
            }
          }
        });

        console.log(`✅ Accounting integration triggered for goal ${goalId}: Journal Entry ${journalEntry.id} created`);
      }
    } catch (error) {
      console.error(`❌ Failed to trigger accounting integration for goal ${goalId}:`, error);
    }
  }

  // Create a new performance goal
  static async createPerformanceGoal(request: CreatePerformanceGoalRequest, createdById: string) {
    try {
      let kpiId = null;
      
      // Validate KPI if provided by name
      if (request.kpiName) {
        const kpi = await prisma.kPI.findFirst({
          where: { name: request.kpiName }
        });

        if (!kpi) {
          throw new Error(`KPI '${request.kpiName}' not found`);
        }
        
        kpiId = kpi.id;
      }

      // Validate department if provided
      if (request.departmentName) {
        // Validate department name is in hardcoded list
        const validDepartments = ["Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT"];
        if (!validDepartments.includes(request.departmentName)) {
          throw new Error(`Invalid department name: ${request.departmentName}. Valid departments: ${validDepartments.join(", ")}`);
        }
      }

      // Validate parent goal if provided
      if (request.parentGoalId) {
        const parentGoal = await prisma.performanceGoal.findUnique({
          where: { id: request.parentGoalId }
        });

        if (!parentGoal) {
          throw new Error("Parent goal not found");
        }
      }

      // Create the performance goal with absolute value targets
      const goal = await prisma.performanceGoal.create({
        data: {
          title: request.title,
          description: request.description,
          type: request.type,
          category: request.category,
          parentGoalId: request.parentGoalId,
          departmentName: request.departmentName,
          // Store absolute value targets
          targetValue: request.targetValue,
          targetUnit: request.targetUnit,
          currentValue: request.currentValue || 0,
          kpiId: kpiId,
          priority: request.priority || "medium",
          startDate: request.startDate,
          endDate: request.endDate,
          assignedToId: request.assignedToId,
          createdById: createdById,
          status: "active", // Goals are active by default
          stage: "planning",
          // NEW: Enhanced Goal Definition Form Fields
          targetOperator: request.targetOperator,
          dataSourceModule: request.dataSourceModule,
          dataSourceField: request.dataSourceField,
          trackingFrequency: request.trackingFrequency,
          nextCheckDate: request.trackingFrequency ? this.calculateNextCheckDate(request.trackingFrequency) : null
        },
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
          },
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
          subGoals: {
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
              stage: true
            }
          },
          _count: {
            select: {
              subGoals: true,
              tasks: true
            }
          }
        }
      });

      // Note: Cascading is now manual - use createBreakdownGoals() method separately

      return goal;
    } catch (error) {
      throw error;
    }
  }

  // Create manual breakdown goals for selected departments
  static async createBreakdownGoals(parentGoalId: string, selectedDepartments: string[], breakdownData: any[]) {
    try {
      const parentGoal = await prisma.performanceGoal.findUnique({
        where: { id: parentGoalId }
      });

      if (!parentGoal) {
        throw new Error("Parent goal not found");
      }

      if (parentGoal.type !== "company") {
        throw new Error("Only company goals can be broken down to departments");
      }

      const createdGoals = [];

      for (let i = 0; i < selectedDepartments.length; i++) {
        const departmentName = selectedDepartments[i];
        const departmentData = breakdownData[i];

        // Create department goal with specified target and fields
        const departmentGoal = await prisma.performanceGoal.create({
          data: {
            title: departmentData.title || `${departmentName} Goal: ${parentGoal.title}`,
            description: departmentData.description || `Department goal for ${departmentName} based on: ${parentGoal.title}`,
            type: "department",
            category: parentGoal.category,
            parentGoalId: parentGoalId,
            departmentName: departmentName, // Use hardcoded department name
            targetValue: departmentData.targetValue,
            targetUnit: departmentData.targetUnit || parentGoal.targetUnit,
            currentValue: 0,
            priority: departmentData.priority || parentGoal.priority,
            startDate: departmentData.startDate || parentGoal.startDate,
            endDate: departmentData.endDate || parentGoal.endDate,
            createdById: parentGoal.createdById,
            status: "active",
            stage: "planning",
            // Enhanced Goal Definition Form Fields
            targetOperator: departmentData.targetOperator,
            dataSourceModule: departmentData.dataSourceModule,
            dataSourceField: departmentData.dataSourceField,
            trackingFrequency: departmentData.trackingFrequency
          },
          select: {
            id: true,
            title: true,
            description: true,
            type: true,
            category: true,
            parentGoalId: true,
            departmentName: true,
            targetValue: true,
            targetUnit: true,
            currentValue: true,
            progressPercentage: true,
            targetOperator: true,
            dataSourceModule: true,
            dataSourceField: true,
            trackingFrequency: true,
            lastCheckDate: true,
            nextCheckDate: true,
            kpiId: true,
            status: true,
            priority: true,
            stage: true,
            startDate: true,
            endDate: true,
            completedAt: true,
            assignedToId: true,
            createdById: true,
            activities: true,
            createdAt: true,
            updatedAt: true
            // Exclude monetaryValue, percentValue, monetaryValueAchieved, percentValueAchieved
          }
        });

        createdGoals.push(departmentGoal);
        console.log(`✅ Created department goal for ${departmentName}: ${departmentGoal.id}`);
      }

      return createdGoals;
    } catch (error) {
      throw error;
    }
  }

  // Create individual goals for selected users in a department
  static async createIndividualGoals(departmentGoalId: string, selectedUsers: string[], individualData: any[]) {
    try {
      const departmentGoal = await prisma.performanceGoal.findUnique({
        where: { id: departmentGoalId }
      });

      if (!departmentGoal) {
        throw new Error("Department goal not found");
      }

      if (departmentGoal.type !== "department") {
        throw new Error("Only department goals can be broken down to individuals");
      }

      const createdGoals = [];

      for (let i = 0; i < selectedUsers.length; i++) {
        const userId = selectedUsers[i];
        const userData = individualData[i];

        // Create individual goal with specified target and fields
        const individualGoal = await prisma.performanceGoal.create({
          data: {
            title: userData.title || `Individual Goal: ${departmentGoal.title}`,
            description: userData.description || `Individual goal based on: ${departmentGoal.title}`,
            type: "individual",
            category: departmentGoal.category,
            parentGoalId: departmentGoalId,
            departmentName: departmentGoal.departmentName, // Use same department name
            targetValue: userData.targetValue,
            targetUnit: userData.targetUnit || departmentGoal.targetUnit,
            currentValue: 0,
            priority: userData.priority || departmentGoal.priority,
            startDate: userData.startDate || departmentGoal.startDate,
            endDate: userData.endDate || departmentGoal.endDate,
            assignedToId: userId,
            createdById: departmentGoal.createdById,
            status: "active",
            stage: "planning",
            // Enhanced Goal Definition Form Fields
            targetOperator: userData.targetOperator,
            dataSourceModule: userData.dataSourceModule,
            dataSourceField: userData.dataSourceField,
            trackingFrequency: userData.trackingFrequency
          }
        });

        createdGoals.push(individualGoal);
        console.log(`✅ Created individual goal for user ${userId}: ${individualGoal.id}`);
      }

      return createdGoals;
    } catch (error) {
      throw error;
    }
  }

  // Get all performance goals with filtering
  static async getAllPerformanceGoals(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.type) {
        where.type = filters.type;
      }

      if (filters.category) {
        where.category = filters.category;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.departmentName) {
        where.departmentName = filters.departmentName;
      }

      if (filters.assignedToId) {
        where.assignedToId = filters.assignedToId;
      }

      if (filters.parentGoalId) {
        where.parentGoalId = filters.parentGoalId;
      }

      if (filters.search) {
        where.OR = [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      const goals = await prisma.performanceGoal.findMany({
        where,
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
          },
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
          subGoals: {
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
              stage: true
            }
          },
          _count: {
            select: {
              subGoals: true,
              tasks: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return goals;
    } catch (error) {
      throw error;
    }
  }

  // Get performance goal by ID
  static async getPerformanceGoalById(id: string) {
    try {
      const goal = await prisma.performanceGoal.findUnique({
        where: { id },
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
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
          subGoals: {
            include: {
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
          tasks: {
            include: {
              creator: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (!goal) {
        throw new Error("Performance goal not found");
      }

      return goal;
    } catch (error) {
      throw error;
    }
  }

  // Update performance goal
  static async updatePerformanceGoal(id: string, request: UpdatePerformanceGoalRequest) {
    try {
      const existingGoal = await prisma.performanceGoal.findUnique({
        where: { id }
      });

      if (!existingGoal) {
        throw new Error("Performance goal not found");
      }

      // Validate KPI if provided
      if (request.kpiId) {
        const kpi = await prisma.kPI.findUnique({
          where: { id: request.kpiId }
        });

        if (!kpi) {
          throw new Error("KPI not found");
        }
      }

      // Update the goal
      const updatedGoal = await prisma.performanceGoal.update({
        where: { id },
        data: {
          ...(request.title && { title: request.title }),
          ...(request.description !== undefined && { description: request.description }),
          ...(request.type && { type: request.type }),
          ...(request.category && { category: request.category }),
          ...(request.monetaryValue !== undefined && { monetaryValue: request.monetaryValue }),
          ...(request.percentValue !== undefined && { percentValue: request.percentValue }),
          ...(request.monetaryValueAchieved !== undefined && { monetaryValueAchieved: request.monetaryValueAchieved }),
          ...(request.percentValueAchieved !== undefined && { percentValueAchieved: request.percentValueAchieved }),
          ...(request.kpiId && { kpiId: request.kpiId }),
          ...(request.priority && { priority: request.priority }),
          ...(request.status && { status: request.status }),
          ...(request.stage && { stage: request.stage }),
          ...(request.startDate && { startDate: request.startDate }),
          ...(request.endDate && { endDate: request.endDate }),
          ...(request.assignedToId && { assignedToId: request.assignedToId })
        },
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
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
          subGoals: {
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
              stage: true
            }
          },
          _count: {
            select: {
              subGoals: true,
              tasks: true
            }
          }
        }
      });

      return updatedGoal;
    } catch (error) {
      throw error;
    }
  }

  // Delete performance goal
  static async deletePerformanceGoal(id: string) {
    try {
      const existingGoal = await prisma.performanceGoal.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              subGoals: true,
              tasks: true
            }
          }
        }
      });

      if (!existingGoal) {
        throw new Error("Performance goal not found");
      }

      // Check if goal has sub-goals or tasks
      if (existingGoal._count.subGoals > 0) {
        throw new Error("Cannot delete goal with sub-goals");
      }

      if (existingGoal._count.tasks > 0) {
        throw new Error("Cannot delete goal with associated tasks");
      }

      await prisma.performanceGoal.delete({
        where: { id }
      });

      return { message: "Performance goal deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // Get performance goal statistics
  static async getPerformanceGoalStatistics() {
    try {
      const [
        totalGoals,
        companyGoals,
        departmentGoals,
        individualGoals,
        activeGoals,
        completedGoals
      ] = await Promise.all([
        prisma.performanceGoal.count(),
        prisma.performanceGoal.count({ where: { type: "company" } }),
        prisma.performanceGoal.count({ where: { type: "department" } }),
        prisma.performanceGoal.count({ where: { type: "individual" } }),
        prisma.performanceGoal.count({ where: { status: "active" } }),
        prisma.performanceGoal.count({ where: { status: "completed" } })
      ]);

      // Get goals by category
      const goalsByCategory = await prisma.performanceGoal.groupBy({
        by: ['category'],
        _count: {
          id: true
        }
      });

      // Get goals by department
      const goalsByDepartment = await prisma.performanceGoal.groupBy({
        by: ['departmentName'],
        _count: {
          id: true
        },
        where: {
          departmentName: { not: null }
        }
      });

      return {
        totalGoals,
        companyGoals,
        departmentGoals,
        individualGoals,
        activeGoals,
        completedGoals,
        goalsByCategory,
        goalsByDepartment
      };
    } catch (error) {
      throw error;
    }
  }
}

