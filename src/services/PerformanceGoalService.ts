// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { dbConnection } from "../utils/database";

const prisma = dbConnection.getPrismaClient();

export interface CreatePerformanceGoalRequest {
  title: string;
  description?: string;
  type: string; // "company", "department", "individual"
  category: string; // "financial", "operational", "strategic"
  parentGoalId?: string;
  departmentId?: string;
  monetaryValue?: number;
  percentValue?: number;
  kpiId?: string;
  priority?: string;
  startDate: Date;
  endDate: Date;
  assignedToId?: string;
  cascadeMode?: string; // "automatic", "manual", "both"
}

export interface UpdatePerformanceGoalRequest {
  title?: string;
  description?: string;
  type?: string;
  category?: string;
  monetaryValue?: number;
  percentValue?: number;
  monetaryValueAchieved?: number;
  percentValueAchieved?: number;
  kpiId?: string;
  priority?: string;
  status?: string;
  stage?: string;
  startDate?: Date;
  endDate?: Date;
  assignedToId?: string;
}

export class PerformanceGoalService {
  // Create a new performance goal
  static async createPerformanceGoal(request: CreatePerformanceGoalRequest, createdById: string) {
    try {
      // Validate KPI if provided
      if (request.kpiId) {
        const kpi = await prisma.kPI.findUnique({
          where: { id: request.kpiId }
        });

        if (!kpi) {
          throw new Error("KPI not found");
        }
      }

      // Validate department if provided
      if (request.departmentId) {
        const department = await prisma.department.findUnique({
          where: { id: request.departmentId }
        });

        if (!department) {
          throw new Error("Department not found");
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

      // Create the performance goal
      const goal = await prisma.performanceGoal.create({
        data: {
          title: request.title,
          description: request.description,
          type: request.type,
          category: request.category,
          parentGoalId: request.parentGoalId,
          departmentId: request.departmentId,
          monetaryValue: request.monetaryValue,
          percentValue: request.percentValue,
          kpiId: request.kpiId,
          priority: request.priority || "medium",
          startDate: request.startDate,
          endDate: request.endDate,
          assignedToId: request.assignedToId,
          createdById: createdById,
          status: "active", // Goals are active by default
          stage: "planning"
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

      // Handle cascading if requested
      if (request.cascadeMode === "automatic" || request.cascadeMode === "both") {
        await this.createSuggestedSubGoals(goal.id, request.type, request.departmentId);
      }

      return goal;
    } catch (error) {
      throw error;
    }
  }

  // Create suggested sub-goals for cascading
  static async createSuggestedSubGoals(parentGoalId: string, parentType: string, departmentId?: string) {
    try {
      const parentGoal = await prisma.performanceGoal.findUnique({
        where: { id: parentGoalId },
        include: {
          department: true
        }
      });

      if (!parentGoal) {
        throw new Error("Parent goal not found");
      }

      // If it's a company goal, suggest department goals
      if (parentType === "company") {
        const departments = await prisma.department.findMany({
          where: { isActive: true }
        });

        for (const department of departments) {
          // Create suggested department goal
          await prisma.performanceGoal.create({
            data: {
              title: `Department Goal: ${parentGoal.title}`,
              description: `Suggested department goal based on: ${parentGoal.title}`,
              type: "department",
              category: parentGoal.category,
              parentGoalId: parentGoalId,
              departmentId: department.id,
              monetaryValue: parentGoal.monetaryValue ? parentGoal.monetaryValue / departments.length : null,
              percentValue: parentGoal.percentValue ? parentGoal.percentValue / departments.length : null,
              priority: parentGoal.priority,
              startDate: parentGoal.startDate,
              endDate: parentGoal.endDate,
              createdById: parentGoal.createdById,
              status: "active",
              stage: "suggested" // Mark as suggested for review
            }
          });
        }
      }
      // If it's a department goal, suggest individual goals
      else if (parentType === "department" && departmentId) {
        const departmentUsers = await prisma.user.findMany({
          where: { 
            departmentId: departmentId,
            role: {
              name: { not: "admin" } // Exclude admins from individual goals
            }
          }
        });

        for (const user of departmentUsers) {
          // Create suggested individual goal
          await prisma.performanceGoal.create({
            data: {
              title: `Individual Goal: ${parentGoal.title}`,
              description: `Suggested individual goal based on: ${parentGoal.title}`,
              type: "individual",
              category: parentGoal.category,
              parentGoalId: parentGoalId,
              departmentId: departmentId,
              monetaryValue: parentGoal.monetaryValue ? parentGoal.monetaryValue / departmentUsers.length : null,
              percentValue: parentGoal.percentValue ? parentGoal.percentValue / departmentUsers.length : null,
              priority: parentGoal.priority,
              startDate: parentGoal.startDate,
              endDate: parentGoal.endDate,
              assignedToId: user.id,
              createdById: parentGoal.createdById,
              status: "active",
              stage: "suggested" // Mark as suggested for review
            }
          });
        }
      }
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

      if (filters.departmentId) {
        where.departmentId = filters.departmentId;
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
        by: ['departmentId'],
        _count: {
          id: true
        },
        where: {
          departmentId: { not: null }
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

