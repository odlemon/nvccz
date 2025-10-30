// @ts-nocheck
import { PrismaClient, Json } from "@prisma/client";
import { prisma } from "../utils/database";

export interface CreateTaskRequest {
  title: string;
  description?: string;
  team: string[] | Json;
  stage?: string;
  date: Date;
  priority?: string;
  assets?: string;
  branch?: string;
  department?: string;
  ruleset?: string;
  
  // Performance-related fields
  goalId?: string;
  performanceCategory?: string;
  isPerformanceTask?: boolean;
  
  // Target Values (Absolute Value System)
  targetValue?: number;
  targetUnit?: string;
  currentValue?: number;
  
  // KPI Integration
  kpi?: {
    id: string;
    name?: string;
    type?: string;
    unitSymbol?: string;
    unitPosition?: string;
  };
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  team?: string[] | Json;
  stage?: string;
  date?: Date;
  priority?: string;
  assets?: string;
  branch?: string;
  department?: string;
  ruleset?: string;
  
  // Performance-related fields
  goalId?: string;
  performanceCategory?: string;
  isPerformanceTask?: boolean;
  
  // Target Values (Absolute Value System)
  targetValue?: number;
  targetUnit?: string;
  currentValue?: number;
  
  // KPI Integration
  kpi?: {
    id: string;
    name?: string;
    type?: string;
    unitSymbol?: string;
    unitPosition?: string;
  };
}

export class TaskService {
  // Create a new task
  static async createTask(request: CreateTaskRequest, createdBy: string) {
    try {
      // Validate creator and assignment boundaries (department-based)
      const creator = await prisma.user.findUnique({
        where: { id: createdBy },
        include: { role: true }
      });

      if (!creator) {
        throw new Error("Creator user not found");
      }

      // Helper: normalize team to string[] of userIds
      const normalizeTeamToIds = (team: any): string[] => {
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
      };

      const teamUserIds = normalizeTeamToIds(request.team);

      // Enforce: non-admin/non-ceo cannot assign outside their department
      const creatorRoleName = creator.role?.name?.toLowerCase?.() || '';
      const isPrivileged = creatorRoleName === 'admin' || creatorRoleName === 'ceo';
      if (!isPrivileged && teamUserIds.length > 0) {
        const assignees = await prisma.user.findMany({
          where: { id: { in: teamUserIds } },
          select: { id: true, departmentId: true }
        });

        const creatorDept = creator.departmentId || null;
        const outOfDept = assignees.find(u => (u.departmentId || null) !== creatorDept);
        if (outOfDept) {
          throw new Error("You can only assign tasks to users within your department");
        }
      }
      // Validate goal if provided
      if (request.goalId) {
        const goal = await prisma.performanceGoal.findUnique({
          where: { id: request.goalId }
        });

        if (!goal) {
          throw new Error("Performance goal not found");
        }
      }

      // Validate KPI if provided
      let kpiData = null;
      if (request.kpi && request.kpi.id) {
        const kpiRecord = await prisma.kPI.findUnique({
          where: { id: request.kpi.id }
        });

        if (!kpiRecord) {
          throw new Error("KPI not found");
        }

        kpiData = {
          id: request.kpi.id,
          name: request.kpi.name || kpiRecord.name,
          type: request.kpi.type || kpiRecord.type,
          unitSymbol: request.kpi.unitSymbol || kpiRecord.unitSymbol,
          unitPosition: request.kpi.unitPosition || kpiRecord.unitPosition
        };
      }

      // Create activity log
      const activity = {
        type: "todo",
        activity: `New task has been assigned to you${request.team.length > 1 ? ` and ${request.team.length - 1} others` : ''}. The task priority is set as ${request.priority || 'medium'} priority, so check and act accordingly. The task date is ${new Date(request.date).toDateString()}. Thank you!!!`,
        date: new Date(),
        by: createdBy
      };

      // Create the task
      const task = await prisma.task.create({
        data: {
          title: request.title,
          description: request.description,
          team: request.team,
          stage: request.stage || "todo",
          date: request.date,
          priority: (request.priority || "medium").toLowerCase(),
          assets: request.assets,
          branch: request.branch,
          department: request.department,
          ruleset: request.ruleset,
          
          // Performance-related fields
          goalId: request.goalId,
          performanceCategory: request.performanceCategory,
          isPerformanceTask: request.isPerformanceTask || false,
          
          // Target Values (Absolute Value System)
          monetaryValue: request.targetValue ? parseFloat(request.targetValue.toString()) : null,
          
          // KPI Integration
          kpi: kpiData,
          
          // Activities
          activities: [activity],
          
          // Metadata
          createdBy: createdBy,
          isOverdue: false,
          overdueStatus: null,
          originalStage: null
        },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          goal: {
            select: {
              id: true,
              title: true,
              type: true,
              category: true
            }
          }
        }
      });

      return task;
    } catch (error) {
      throw error;
    }
  }

  // Update task
  static async updateTask(id: string, request: UpdateTaskRequest, updatedByUserId?: string) {
    try {
      const existingTask = await prisma.task.findUnique({
        where: { id }
      });

      if (!existingTask) {
        throw new Error("Task not found");
      }

      // Validate goal if provided
      if (request.goalId) {
        const goal = await prisma.performanceGoal.findUnique({
          where: { id: request.goalId }
        });

        if (!goal) {
          throw new Error("Performance goal not found");
        }
      }

      // Validate KPI if provided
      let kpiData = existingTask.kpi;
      if (request.kpi && request.kpi.id) {
        const kpiRecord = await prisma.kPI.findUnique({
          where: { id: request.kpi.id }
        });

        if (!kpiRecord) {
          throw new Error("KPI not found");
        }

        kpiData = {
          id: request.kpi.id,
          name: request.kpi.name || kpiRecord.name,
          type: request.kpi.type || kpiRecord.type,
          unitSymbol: request.kpi.unitSymbol || kpiRecord.unitSymbol,
          unitPosition: request.kpi.unitPosition || kpiRecord.unitPosition
        };
      }

      // Validate assignment boundaries on team change
      if (request.team && updatedByUserId) {
        const updater = await prisma.user.findUnique({
          where: { id: updatedByUserId },
          include: { role: true }
        });

        if (!updater) {
          throw new Error("Updating user not found");
        }

        const normalizeTeamToIds = (team: any): string[] => {
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
        };

        const teamUserIds = normalizeTeamToIds(request.team);
        const updaterRoleName = updater.role?.name?.toLowerCase?.() || '';
        const isPrivileged = updaterRoleName === 'admin' || updaterRoleName === 'ceo';
        if (!isPrivileged && teamUserIds.length > 0) {
          const assignees = await prisma.user.findMany({
            where: { id: { in: teamUserIds } },
            select: { id: true, departmentId: true }
          });

          const updaterDept = updater.departmentId || null;
          const outOfDept = assignees.find(u => (u.departmentId || null) !== updaterDept);
          if (outOfDept) {
            throw new Error("You can only assign tasks to users within your department");
          }
        }
      }

      // Update the task
      const updatedTask = await prisma.task.update({
        where: { id },
        data: {
          ...(request.title && { title: request.title }),
          ...(request.description !== undefined && { description: request.description }),
          ...(request.team && { team: request.team }),
          ...(request.stage && { stage: request.stage }),
          ...(request.date && { date: request.date }),
          ...(request.priority && { priority: request.priority.toLowerCase() }),
          ...(request.assets !== undefined && { assets: request.assets }),
          ...(request.branch !== undefined && { branch: request.branch }),
          ...(request.department !== undefined && { department: request.department }),
          ...(request.ruleset !== undefined && { ruleset: request.ruleset }),
          
          // Performance-related fields
          ...(request.goalId && { goalId: request.goalId }),
          ...(request.performanceCategory !== undefined && { performanceCategory: request.performanceCategory }),
          ...(request.isPerformanceTask !== undefined && { isPerformanceTask: request.isPerformanceTask }),
          
          // Target Values (Absolute Value System)
          ...(request.targetValue !== undefined && { targetValue: request.targetValue }),
          ...(request.targetUnit !== undefined && { targetUnit: request.targetUnit }),
          ...(request.currentValue !== undefined && { currentValue: request.currentValue }),
          
          // KPI Integration
          kpi: kpiData
        },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          goal: {
            select: {
              id: true,
              title: true,
              type: true,
              category: true
            }
          }
        }
      });

      // If this is a performance task, update the linked goal
      if (updatedTask.isPerformanceTask && updatedTask.goalId) {
        await this.updateLinkedGoalProgress(updatedTask.id);
      }

      return updatedTask;
    } catch (error) {
      throw error;
    }
  }

  // Update task stage with enhanced overdue logic
  static async updateTaskStage(id: string, stage: string, achievements: any = {}) {
    try {
      const task = await prisma.task.findUnique({
        where: { id }
      });

      if (!task) {
        throw new Error("Task not found");
      }

      // Check if task is overdue
      const isOverdue = new Date(task.date) < new Date();
      
      let updateData: any = {
        stage: stage
      };

      // Handle overdue logic
      if (isOverdue && !task.isOverdue) {
        // Task just became overdue
        updateData.isOverdue = true;
        updateData.originalStage = task.stage; // Store original stage
        updateData.overdueStatus = `overdue_${stage}`; // overdue_todo, overdue_in_progress, etc.
      } else if (isOverdue && task.isOverdue) {
        // Task is still overdue, update overdue status
        updateData.overdueStatus = `overdue_${stage}`;
      } else if (!isOverdue && task.isOverdue) {
        // Task is no longer overdue
        updateData.isOverdue = false;
        updateData.overdueStatus = null;
        updateData.originalStage = null;
      }

      // Update achievements if provided
      if (achievements.monetaryValueAchieved !== undefined) {
        updateData.monetaryValueAchieved = (task.monetaryValueAchieved || 0) + achievements.monetaryValueAchieved;
      }

      if (achievements.percentValueAchieved !== undefined) {
        updateData.percentValueAchieved = (task.percentValueAchieved || 0) + achievements.percentValueAchieved;
      }

      // Update the task
      const updatedTask = await prisma.task.update({
        where: { id },
        data: updateData,
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          goal: {
            select: {
              id: true,
              title: true,
              type: true,
              category: true
            }
          }
        }
      });

      // If this is a performance task, update the linked goal
      if (updatedTask.isPerformanceTask && updatedTask.goalId) {
        await this.updateLinkedGoalProgress(updatedTask.id);
      }

      return updatedTask;
    } catch (error) {
      throw error;
    }
  }

  // Post task activity
  static async postTaskActivity(taskId: string, activity: any) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId }
      });

      if (!task) {
        throw new Error("Task not found");
      }

      // Get approver name if provided
      let approverName = null;
      if (activity.approverId) {
        const approver = await prisma.user.findUnique({
          where: { id: activity.approverId }
        });
        if (approver) {
          approverName = `${approver.firstName} ${approver.lastName}`;
        }
      }

      const activityData = {
        type: activity.type,
        approver: approverName,
        approvedDate: activity.approvedDate,
        activity: activity.activity,
        date: new Date(),
        by: activity.userId,
        collectedMonetary: 0,
        collectedPercent: 0
      };

      let updateData: any = {
        activities: [...(task.activities || []), activityData]
      };

      // Handle KPI-based achievements
      if (task.kpi?.type === "Metric" && activity.monetaryValueAchieved) {
        activityData.collectedMonetary = activity.monetaryValueAchieved;
        updateData.monetaryValueAchieved = (task.monetaryValueAchieved || 0) + activity.monetaryValueAchieved;
        
        if (updateData.monetaryValueAchieved >= (task.monetaryValue || 0)) {
          updateData.stage = "completed";
        }
      } else if (task.kpi?.type === "Percentage" && activity.percentValueAchieved) {
        activityData.collectedPercent = activity.percentValueAchieved;
        updateData.percentValueAchieved = (task.percentValueAchieved || 0) + activity.percentValueAchieved;
        
        if (task.ruleset) {
          let isCompleted = false;
          
          switch (task.ruleset) {
            case "<":
              isCompleted = activity.percentValueAchieved < (task.percentValue || 0);
              break;
            case ">":
              isCompleted = updateData.percentValueAchieved > (task.percentValue || 0);
              break;
            case "=":
              isCompleted = updateData.percentValueAchieved >= (task.percentValue || 0);
              break;
            default:
              isCompleted = updateData.percentValueAchieved >= (task.percentValue || 0);
          }
          
          if (isCompleted) {
            updateData.stage = "completed";
          }
        }
      }

      // Update the task
      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: updateData,
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          goal: {
            select: {
              id: true,
              title: true,
              type: true,
              category: true
            }
          }
        }
      });

      // If this is a performance task, update the linked goal
      if (updatedTask.isPerformanceTask && updatedTask.goalId) {
        await this.updateLinkedGoalProgress(updatedTask.id);
      }

      return updatedTask;
    } catch (error) {
      throw error;
    }
  }

  // Get all tasks with filtering
  static async getAllTasks(filters: any = {}) {
    try {
      const where: any = {
        isTrashed: false
      };

      if (filters.stage) {
        where.stage = filters.stage;
      }

      if (filters.priority) {
        where.priority = filters.priority;
      }

      if (filters.department) {
        where.department = filters.department;
      }

      if (filters.performanceCategory) {
        where.performanceCategory = filters.performanceCategory;
      }

      if (filters.isPerformanceTask !== undefined) {
        where.isPerformanceTask = filters.isPerformanceTask;
      }

      if (filters.goalId) {
        where.goalId = filters.goalId;
      }

      if (filters.isOverdue !== undefined) {
        where.isOverdue = filters.isOverdue;
      }

      if (filters.search) {
        where.OR = [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { stage: { contains: filters.search, mode: 'insensitive' } },
          { priority: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      const tasks = await prisma.task.findMany({
        where,
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          goal: {
            select: {
              id: true,
              title: true,
              type: true,
              category: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return tasks;
    } catch (error) {
      throw error;
    }
  }

  // Get tasks for a specific user
  static async getUserTasks(userId: string, filters: any = {}) {
    try {
      const where: any = {
        isTrashed: false,
        team: {
          array_contains: userId // Check if userId is in the team array
        }
      };

      if (filters.stage) {
        where.stage = filters.stage;
      }

      if (filters.priority) {
        where.priority = filters.priority;
      }

      if (filters.department) {
        where.department = filters.department;
      }

      if (filters.performanceCategory) {
        where.performanceCategory = filters.performanceCategory;
      }

      if (filters.isPerformanceTask !== undefined) {
        where.isPerformanceTask = filters.isPerformanceTask;
      }

      if (filters.goalId) {
        where.goalId = filters.goalId;
      }

      if (filters.isOverdue !== undefined) {
        where.isOverdue = filters.isOverdue;
      }

      if (filters.search) {
        where.OR = [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { stage: { contains: filters.search, mode: 'insensitive' } },
          { priority: { contains: filters.search, mode: 'insensitive' } }
        ];
      }

      const tasks = await prisma.task.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          team: true,
          stage: true,
          date: true,
          priority: true,
          department: true,
          goalId: true,
          performanceCategory: true,
          isPerformanceTask: true,
          isOverdue: true,
          overdueStatus: true,
          originalStage: true,
          monetaryValue: true,
          monetaryValueAchieved: true,
          percentValueAchieved: true,
          kpi: true,
          activityLogs: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              },
              goal: {
                select: {
                  id: true,
                  title: true,
                  targetValue: true,
                  currentValue: true,
                  stage: true,
                  kpiId: true,
                  kpi: {
                    select: {
                      id: true,
                      name: true
                    }
                  }
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          },
          status: true,
          isTrashed: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true,
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          goal: {
            select: {
              id: true,
              title: true,
              type: true,
              category: true,
              targetValue: true,
              currentValue: true,
              stage: true,
              kpiId: true,
        kpi: {
          select: {
            id: true,
            name: true
          }
        },
              parentGoal: {
                select: {
                  id: true,
                  title: true,
                  parentGoal: {
                    select: {
                      id: true,
                      title: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return tasks;
    } catch (error) {
      throw error;
    }
  }

  // Get task by ID
  static async getTaskById(id: string) {
    try {
      const task = await prisma.task.findUnique({
        where: { id },
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          goal: {
            select: {
              id: true,
              title: true,
              type: true,
              category: true
            }
          }
        }
      });

      if (!task) {
        throw new Error("Task not found");
      }

      return task;
    } catch (error) {
      throw error;
    }
  }

  // Get task statistics
  static async getTaskStatistics() {
    try {
      const [
        totalTasks,
        completedTasks,
        inProgressTasks,
        todoTasks,
        overdueTasks,
        performanceTasks,
        businessTasks
      ] = await Promise.all([
        prisma.task.count({ where: { isTrashed: false } }),
        prisma.task.count({ where: { stage: "completed", isTrashed: false } }),
        prisma.task.count({ where: { stage: "in_progress", isTrashed: false } }),
        prisma.task.count({ where: { stage: "todo", isTrashed: false } }),
        prisma.task.count({ where: { isOverdue: true, isTrashed: false } }),
        prisma.task.count({ where: { isPerformanceTask: true, isTrashed: false } }),
        prisma.task.count({ where: { isPerformanceTask: false, isTrashed: false } })
      ]);

      // Get tasks by department
      const tasksByDepartment = await prisma.task.groupBy({
        by: ['department'],
        _count: {
          id: true
        },
        where: {
          isTrashed: false,
          department: { not: null }
        }
      });

      // Get tasks by priority
      const tasksByPriority = await prisma.task.groupBy({
        by: ['priority'],
        _count: {
          id: true
        },
        where: {
          isTrashed: false
        }
      });

      return {
        totalTasks,
        completedTasks,
        inProgressTasks,
        todoTasks,
        overdueTasks,
        performanceTasks,
        businessTasks,
        tasksByDepartment,
        tasksByPriority
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update linked goal progress when task is updated
   */
  static async updateLinkedGoalProgress(taskId: string): Promise<void> {
    try {
      console.log(`🔄 Updating linked goal progress for task: ${taskId}`);

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          goal: true
        }
      });

      if (!task || !task.goal) {
        console.log(`⚠️ Task ${taskId} is not linked to a goal`);
        return;
      }

      const goal = task.goal;
      
      // Calculate new goal progress based on task progress
      const newCurrentValue = task.currentValue || 0;
      const progressPercentage = goal.targetValue > 0 ? (newCurrentValue / goal.targetValue) * 100 : 0;
      const isCompleted = newCurrentValue >= goal.targetValue;

      // Update the goal
      const updatedGoal = await prisma.performanceGoal.update({
        where: { id: goal.id },
        data: {
          currentValue: newCurrentValue,
          progressPercentage: Math.min(progressPercentage, 100),
          status: isCompleted ? "completed" : "active",
          stage: isCompleted ? "completed" : goal.stage,
          updatedAt: new Date()
        }
      });

      console.log(`✅ Updated goal ${goal.id} progress: ${newCurrentValue}/${goal.targetValue} (${progressPercentage.toFixed(1)}%)`);

      // If goal is completed and has KPI integration, trigger accounting
      if (isCompleted && goal.kpiId) {
        await this.triggerAccountingIntegration(goal.id, newCurrentValue);
      }

      // If this is a sub-goal, update parent goal progress
      if (goal.parentGoalId) {
        await this.updateParentGoalProgress(goal.parentGoalId);
      }

    } catch (error) {
      console.error('❌ Error updating linked goal progress:', error);
      throw error;
    }
  }

  /**
   * Update parent goal progress when sub-goals are completed
   */
  static async updateParentGoalProgress(parentGoalId: string): Promise<void> {
    try {
      console.log(`🔄 Updating parent goal progress: ${parentGoalId}`);

      const parentGoal = await prisma.performanceGoal.findUnique({
        where: { id: parentGoalId },
        include: {
          subGoals: true
        }
      });

      if (!parentGoal) {
        console.log(`⚠️ Parent goal ${parentGoalId} not found`);
        return;
      }

      // Calculate parent goal progress from sub-goals
      const totalSubGoalProgress = parentGoal.subGoals.reduce((sum, subGoal) => {
        return sum + (subGoal.progressPercentage || 0);
      }, 0);

      const averageProgress = parentGoal.subGoals.length > 0 
        ? totalSubGoalProgress / parentGoal.subGoals.length 
        : 0;

      const isCompleted = averageProgress >= 100;

      // Update parent goal
      await prisma.performanceGoal.update({
        where: { id: parentGoalId },
        data: {
          progressPercentage: Math.min(averageProgress, 100),
          status: isCompleted ? "completed" : "active",
          stage: isCompleted ? "completed" : parentGoal.stage,
          updatedAt: new Date()
        }
      });

      console.log(`✅ Updated parent goal ${parentGoalId} progress: ${averageProgress.toFixed(1)}%`);

      // If parent goal is completed and has KPI integration, trigger accounting
      if (isCompleted && parentGoal.kpiId) {
        await this.triggerAccountingIntegration(parentGoalId, parentGoal.targetValue || 0);
      }

      // Recursively update grandparent goal if exists
      if (parentGoal.parentGoalId) {
        await this.updateParentGoalProgress(parentGoal.parentGoalId);
      }

    } catch (error) {
      console.error('❌ Error updating parent goal progress:', error);
      throw error;
    }
  }

  /**
   * Trigger accounting integration when goal is completed
   */
  static async triggerAccountingIntegration(goalId: string, achievedValue: number): Promise<void> {
    try {
      console.log(`💰 Triggering accounting integration for goal: ${goalId}`);

      const goal = await prisma.performanceGoal.findUnique({
        where: { id: goalId },
        include: {
          kpi: true
        }
      });

      if (!goal || !goal.kpi) {
        console.log(`⚠️ Goal ${goalId} has no KPI integration`);
        return;
      }

      // Create journal entry based on KPI
      const journalEntry = await prisma.journalEntry.create({
        data: {
          entryNumber: `KPI-${goal.kpi.code}-${Date.now()}`,
          description: `KPI Achievement: ${goal.kpi.name} - ${goal.title}`,
          entryDate: new Date(),
          status: 'POSTED',
          createdById: goal.createdById,
          entries: {
            create: [
              {
                glAccountId: goal.kpi.accountNumber, // Use KPI account number
                debitAmount: goal.kpi.journalEntryType === 'Debit' ? achievedValue : 0,
                creditAmount: goal.kpi.journalEntryType === 'Credit' ? achievedValue : 0,
                description: `KPI Achievement: ${goal.kpi.name}`
              }
            ]
          }
        }
      });

      console.log(`✅ Created journal entry ${journalEntry.id} for KPI ${goal.kpi.code}`);

    } catch (error) {
      console.error('❌ Error triggering accounting integration:', error);
      throw error;
    }
  }
}
