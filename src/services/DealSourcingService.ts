// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";

export interface CreateDealSourcingGoalRequest {
  title: string;
  description?: string;
  type: string; // "company", "department", "individual"
  category: string; // "deal_sourcing", "due_diligence", "closing"
  parentGoalId?: string;
  departmentId?: string;
  targetDeals: number;
  targetValue?: number;
  targetSectors?: any;
  targetStages?: any;
  startDate: Date;
  endDate: Date;
  assignedToId?: string;
  priority?: string;
}

export interface UpdateDealSourcingGoalRequest {
  title?: string;
  description?: string;
  targetDeals?: number;
  targetValue?: number;
  targetSectors?: any;
  targetStages?: any;
  dealsSourced?: number;
  dealsInPipeline?: number;
  dealsClosed?: number;
  totalValueSourced?: number;
  status?: string;
  priority?: string;
  assignedToId?: string;
}

export interface CreateDealProgressRequest {
  dealSourcingGoalId: string;
  applicationId?: string;
  dealName: string;
  dealValue: number;
  sector: string;
  stage: string;
  currentMilestone: string;
  nextMilestone?: string;
  estimatedCompletion?: Date;
  assignedToId: string;
  managerId?: string;
}

export interface UpdateDealProgressRequest {
  dealName?: string;
  dealValue?: number;
  sector?: string;
  stage?: string;
  progressPercentage?: number;
  currentMilestone?: string;
  nextMilestone?: string;
  estimatedCompletion?: Date;
  status?: string;
  isOverdue?: boolean;
}

export class DealSourcingService {
  // Create a new deal sourcing goal
  static async createDealSourcingGoal(request: CreateDealSourcingGoalRequest, createdById: string) {
    try {
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
        const parentGoal = await prisma.dealSourcingGoal.findUnique({
          where: { id: request.parentGoalId }
        });

        if (!parentGoal) {
          throw new Error("Parent goal not found");
        }
      }

      // Create the deal sourcing goal
      const goal = await prisma.dealSourcingGoal.create({
        data: {
          title: request.title,
          description: request.description,
          type: request.type,
          category: request.category,
          parentGoalId: request.parentGoalId,
          departmentId: request.departmentId,
          targetDeals: request.targetDeals,
          targetValue: request.targetValue,
          targetSectors: request.targetSectors,
          targetStages: request.targetStages,
          startDate: request.startDate,
          endDate: request.endDate,
          assignedToId: request.assignedToId,
          createdById: createdById,
          priority: request.priority || "medium",
          status: "active"
        },
        include: {
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true,
            }
          },
          subGoals: {
            select: {
              id: true,
              title: true,
              type: true,
              targetDeals: true,
              dealsSourced: true,
              status: true
            }
          },
          department: {
            select: {
              id: true,
              name: true,
              description: true
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
          dealProgress: {
            select: {
              id: true,
              dealName: true,
              dealValue: true,
              sector: true,
              stage: true,
              progressPercentage: true,
              status: true
            }
          }
        }
      });

      // Auto-create sub-goals if this is a company or department goal
      if (request.type === "company" || request.type === "department") {
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
      const parentGoal = await prisma.dealSourcingGoal.findUnique({
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
          await prisma.dealSourcingGoal.create({
            data: {
              title: `Department Goal: ${parentGoal.title}`,
              description: `Suggested department goal based on: ${parentGoal.title}`,
              type: "department",
              category: parentGoal.category,
              parentGoalId: parentGoalId,
              departmentId: department.id,
              targetDeals: Math.ceil(parentGoal.targetDeals / departments.length),
              targetValue: parentGoal.targetValue ? parentGoal.targetValue / departments.length : null,
              targetSectors: parentGoal.targetSectors,
              targetStages: parentGoal.targetStages,
              startDate: parentGoal.startDate,
              endDate: parentGoal.endDate,
              createdById: parentGoal.createdById,
              status: "active",
              priority: parentGoal.priority
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
          await prisma.dealSourcingGoal.create({
            data: {
              title: `Individual Goal: ${parentGoal.title}`,
              description: `Suggested individual goal based on: ${parentGoal.title}`,
              type: "individual",
              category: parentGoal.category,
              parentGoalId: parentGoalId,
              departmentId: departmentId,
              targetDeals: Math.ceil(parentGoal.targetDeals / departmentUsers.length),
              targetValue: parentGoal.targetValue ? parentGoal.targetValue / departmentUsers.length : null,
              targetSectors: parentGoal.targetSectors,
              targetStages: parentGoal.targetStages,
              startDate: parentGoal.startDate,
              endDate: parentGoal.endDate,
              assignedToId: user.id,
              createdById: parentGoal.createdById,
              status: "active",
              priority: parentGoal.priority
            }
          });
        }
      }
    } catch (error) {
      throw error;
    }
  }

  // Get all deal sourcing goals with filtering
  static async getAllDealSourcingGoals(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.type) {
        where.type = filters.type;
      }

      if (filters.category) {
        where.category = filters.category;
      }

      if (filters.departmentId) {
        where.departmentId = filters.departmentId;
      }

      if (filters.assignedToId) {
        where.assignedToId = filters.assignedToId;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.priority) {
        where.priority = filters.priority;
      }

      const goals = await prisma.dealSourcingGoal.findMany({
        where,
        include: {
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true,
            }
          },
          subGoals: {
            select: {
              id: true,
              title: true,
              type: true,
              targetDeals: true,
              dealsSourced: true,
              status: true
            }
          },
          department: {
            select: {
              id: true,
              name: true,
              description: true
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
          dealProgress: {
            select: {
              id: true,
              dealName: true,
              dealValue: true,
              sector: true,
              stage: true,
              progressPercentage: true,
              status: true
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

  // Get deal sourcing goal by ID
  static async getDealSourcingGoalById(id: string) {
    try {
      const goal = await prisma.dealSourcingGoal.findUnique({
        where: { id },
        include: {
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true,
            }
          },
          subGoals: {
            select: {
              id: true,
              title: true,
              type: true,
              targetDeals: true,
              dealsSourced: true,
              status: true
            }
          },
          department: {
            select: {
              id: true,
              name: true,
              description: true
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
          dealProgress: {
            include: {
              assignedTo: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              },
              manager: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              },
              progressUpdates: {
                include: {
                  user: {
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
              }
            }
          }
        }
      });

      if (!goal) {
        throw new Error("Deal sourcing goal not found");
      }

      return goal;
    } catch (error) {
      throw error;
    }
  }

  // Update deal sourcing goal
  static async updateDealSourcingGoal(id: string, request: UpdateDealSourcingGoalRequest) {
    try {
      const goal = await prisma.dealSourcingGoal.findUnique({
        where: { id }
      });

      if (!goal) {
        throw new Error("Deal sourcing goal not found");
      }

      const updatedGoal = await prisma.dealSourcingGoal.update({
        where: { id },
        data: {
          title: request.title,
          description: request.description,
          targetDeals: request.targetDeals,
          targetValue: request.targetValue,
          targetSectors: request.targetSectors,
          targetStages: request.targetStages,
          dealsSourced: request.dealsSourced,
          dealsInPipeline: request.dealsInPipeline,
          dealsClosed: request.dealsClosed,
          totalValueSourced: request.totalValueSourced,
          status: request.status,
          priority: request.priority,
          assignedToId: request.assignedToId
        },
        include: {
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true,
            }
          },
          subGoals: {
            select: {
              id: true,
              title: true,
              type: true,
              targetDeals: true,
              dealsSourced: true,
              status: true
            }
          },
          department: {
            select: {
              id: true,
              name: true,
              description: true
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
          dealProgress: {
            select: {
              id: true,
              dealName: true,
              dealValue: true,
              sector: true,
              stage: true,
              progressPercentage: true,
              status: true
            }
          }
        }
      });

      return updatedGoal;
    } catch (error) {
      throw error;
    }
  }

  // Delete deal sourcing goal
  static async deleteDealSourcingGoal(id: string) {
    try {
      const goal = await prisma.dealSourcingGoal.findUnique({
        where: { id }
      });

      if (!goal) {
        throw new Error("Deal sourcing goal not found");
      }

      await prisma.dealSourcingGoal.delete({
        where: { id }
      });

      return { message: "Deal sourcing goal deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // Create deal progress
  static async createDealProgress(request: CreateDealProgressRequest) {
    try {
      // Validate deal sourcing goal
      const goal = await prisma.dealSourcingGoal.findUnique({
        where: { id: request.dealSourcingGoalId }
      });

      if (!goal) {
        throw new Error("Deal sourcing goal not found");
      }

      // Validate assigned user
      const assignedUser = await prisma.user.findUnique({
        where: { id: request.assignedToId }
      });

      if (!assignedUser) {
        throw new Error("Assigned user not found");
      }

      const dealProgress = await prisma.dealProgress.create({
        data: {
          dealSourcingGoalId: request.dealSourcingGoalId,
          applicationId: request.applicationId,
          dealName: request.dealName,
          dealValue: request.dealValue,
          sector: request.sector,
          stage: request.stage,
          currentMilestone: request.currentMilestone,
          nextMilestone: request.nextMilestone,
          estimatedCompletion: request.estimatedCompletion,
          assignedToId: request.assignedToId,
          managerId: request.managerId,
          progressPercentage: 0,
          status: "active"
        },
        include: {
          dealSourcingGoal: {
            select: {
              id: true,
              title: true,
              type: true,
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
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      return dealProgress;
    } catch (error) {
      throw error;
    }
  }

  // Update deal progress
  static async updateDealProgress(id: string, request: UpdateDealProgressRequest) {
    try {
      const dealProgress = await prisma.dealProgress.findUnique({
        where: { id }
      });

      if (!dealProgress) {
        throw new Error("Deal progress not found");
      }

      const updatedDealProgress = await prisma.dealProgress.update({
        where: { id },
        data: {
          dealName: request.dealName,
          dealValue: request.dealValue,
          sector: request.sector,
          stage: request.stage,
          progressPercentage: request.progressPercentage,
          currentMilestone: request.currentMilestone,
          nextMilestone: request.nextMilestone,
          estimatedCompletion: request.estimatedCompletion,
          status: request.status,
          isOverdue: request.isOverdue,
          lastUpdated: new Date()
        },
        include: {
          dealSourcingGoal: {
            select: {
              id: true,
              title: true,
              type: true,
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
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          progressUpdates: {
            include: {
              user: {
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
          }
        }
      });

      return updatedDealProgress;
    } catch (error) {
      throw error;
    }
  }

  // Post deal progress update
  static async postDealProgressUpdate(dealProgressId: string, update: any, userId: string) {
    try {
      const dealProgress = await prisma.dealProgress.findUnique({
        where: { id: dealProgressId }
      });

      if (!dealProgress) {
        throw new Error("Deal progress not found");
      }

      // Create progress update
      const progressUpdate = await prisma.dealProgressUpdate.create({
        data: {
          dealProgressId: dealProgressId,
          userId: userId,
          updateType: update.updateType,
          title: update.title,
          description: update.description,
          previousStage: update.previousStage,
          newStage: update.newStage,
          previousValue: update.previousValue,
          newValue: update.newValue
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Update deal progress if stage or value changed
      let updateData: any = {};
      if (update.newStage) {
        updateData.stage = update.newStage;
        updateData.lastUpdated = new Date();
      }
      if (update.newValue) {
        updateData.dealValue = update.newValue;
        updateData.lastUpdated = new Date();
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.dealProgress.update({
          where: { id: dealProgressId },
          data: updateData
        });
      }

      return progressUpdate;
    } catch (error) {
      throw error;
    }
  }

  // Get deal progress by ID
  static async getDealProgressById(id: string) {
    try {
      const dealProgress = await prisma.dealProgress.findUnique({
        where: { id },
        include: {
          dealSourcingGoal: {
            select: {
              id: true,
              title: true,
              type: true,
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
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          progressUpdates: {
            include: {
              user: {
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
          }
        }
      });

      if (!dealProgress) {
        throw new Error("Deal progress not found");
      }

      return dealProgress;
    } catch (error) {
      throw error;
    }
  }

  // Get all deal progress with filtering
  static async getAllDealProgress(filters: any = {}) {
    try {
      const where: any = {};

      if (filters.dealSourcingGoalId) {
        where.dealSourcingGoalId = filters.dealSourcingGoalId;
      }

      if (filters.assignedToId) {
        where.assignedToId = filters.assignedToId;
      }

      if (filters.managerId) {
        where.managerId = filters.managerId;
      }

      if (filters.stage) {
        where.stage = filters.stage;
      }

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.sector) {
        where.sector = filters.sector;
      }

      const dealProgress = await prisma.dealProgress.findMany({
        where,
        include: {
          dealSourcingGoal: {
            select: {
              id: true,
              title: true,
              type: true,
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
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          progressUpdates: {
            include: {
              user: {
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
            },
            take: 5 // Limit to last 5 updates
          }
        },
        orderBy: {
          lastUpdated: 'desc'
        }
      });

      return dealProgress;
    } catch (error) {
      throw error;
    }
  }

  // Delete deal progress
  static async deleteDealProgress(id: string) {
    try {
      const dealProgress = await prisma.dealProgress.findUnique({
        where: { id }
      });

      if (!dealProgress) {
        throw new Error("Deal progress not found");
      }

      await prisma.dealProgress.delete({
        where: { id }
      });

      return { message: "Deal progress deleted successfully" };
    } catch (error) {
      throw error;
    }
  }
}
