// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from '@prisma/client/runtime/library';

export class ActivityService {
  /**
   * Create a new activity for a task or goal
   */
  static async createActivity(activityData: {
    title: string;
    description?: string;
    activityType: 'task' | 'goal';
    taskId?: string;
    goalId?: string;
    valueCollected?: number;
    userId: string;
  }) {
    try {
      // Validate that either taskId or goalId is provided based on type
      if (activityData.activityType === 'task' && !activityData.taskId) {
        throw new Error("Task ID is required for task activities");
      }
      if (activityData.activityType === 'goal' && !activityData.goalId) {
        throw new Error("Goal ID is required for goal activities");
      }

      // Create the activity
      const activity = await prisma.activityLog.create({
        data: {
          title: activityData.title,
          description: activityData.description,
          activityType: activityData.activityType === 'task' ? 'task_completion' : 'goal_update',
          taskId: activityData.taskId,
          goalId: activityData.goalId,
          userId: activityData.userId,
          monetaryValueAchieved: activityData.valueCollected ? new Decimal(activityData.valueCollected) : null,
          percentValueAchieved: null // We'll calculate this if needed
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          task: {
            select: {
              id: true,
              title: true,
              monetaryValue: true,
              stage: true
            }
          },
          goal: {
            select: {
              id: true,
              title: true,
              targetValue: true,
              currentValue: true,
              stage: true
            }
          }
        }
      });

      // Auto-update stage based on value collected vs target
      if (activityData.valueCollected !== undefined) {
        if (activityData.activityType === 'task' && activityData.taskId) {
          await this.updateTaskStageBasedOnProgress(activityData.taskId, activityData.valueCollected);
        } else if (activityData.activityType === 'goal' && activityData.goalId) {
          await this.updateGoalProgressBasedOnActivity(activityData.goalId, activityData.valueCollected);
        }
      }

      return activity;
    } catch (error) {
      console.error('Error creating activity:', error);
      throw error;
    }
  }

  /**
   * Update task stage based on progress
   */
  static async updateTaskStageBasedOnProgress(taskId: string, valueCollected: number) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          title: true,
          monetaryValue: true,
          stage: true
        }
      });

      if (!task) {
        throw new Error("Task not found");
      }

      // If task has a monetary target and value collected meets or exceeds it
      if (task.monetaryValue && valueCollected >= parseFloat(task.monetaryValue.toString())) {
        await prisma.task.update({
          where: { id: taskId },
          data: {
            stage: 'completed',
            monetaryValueAchieved: new Decimal(valueCollected)
          }
        });
        console.log(`✅ Task ${task.title} marked as completed - target achieved!`);
      } else {
        // Update progress but keep stage as in_progress
        await prisma.task.update({
          where: { id: taskId },
          data: {
            stage: 'in_progress',
            monetaryValueAchieved: new Decimal(valueCollected)
          }
        });
        console.log(`📈 Task ${task.title} progress updated to ${valueCollected}`);
      }
    } catch (error) {
      console.error('Error updating task stage:', error);
      throw error;
    }
  }

  /**
   * Update goal progress based on activity
   */
  static async updateGoalProgressBasedOnActivity(goalId: string, valueCollected: number) {
    try {
      const goal = await prisma.performanceGoal.findUnique({
        where: { id: goalId },
        select: {
          id: true,
          title: true,
          targetValue: true,
          currentValue: true,
          stage: true,
          type: true
        }
      });

      if (!goal) {
        throw new Error("Goal not found");
      }

      // Update current value
      const newCurrentValue = (goal.currentValue || 0) + valueCollected;
      
      await prisma.performanceGoal.update({
        where: { id: goalId },
        data: {
          currentValue: newCurrentValue,
          stage: newCurrentValue >= (goal.targetValue || 0) ? 'completed' : 'in_progress'
        }
      });

      console.log(`📈 Goal ${goal.title} progress updated: ${newCurrentValue}/${goal.targetValue}`);
    } catch (error) {
      console.error('Error updating goal progress:', error);
      throw error;
    }
  }

  /**
   * Get activities for a specific task
   */
  static async getTaskActivities(taskId: string) {
    try {
      const activities = await prisma.activityLog.findMany({
        where: {
          taskId: taskId,
          activityType: 'task_completion'
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
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return activities;
    } catch (error) {
      console.error('Error getting task activities:', error);
      throw error;
    }
  }

  /**
   * Get activities for a specific goal
   */
  static async getGoalActivities(goalId: string) {
    try {
      const activities = await prisma.activityLog.findMany({
        where: {
          goalId: goalId,
          activityType: 'goal_update'
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
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return activities;
    } catch (error) {
      console.error('Error getting goal activities:', error);
      throw error;
    }
  }

  /**
   * Get department goals for a manager/head
   */
  static async getDepartmentGoals(departmentName: string, userId: string) {
    try {
      // Check if user is a manager/head in this department
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          userDepartment: true,
          roleCode: true,
          role: {
            select: {
              name: true
            }
          }
        }
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Check if user has permission to view department goals
      // Level 5 = Manager (Head of department), Level 4 = Officer (Deputy), or Admin
      const isAuthorized = 
        user.userDepartment === departmentName && 
        (user.roleCode?.includes('_MGR') || user.roleCode?.includes('_OFF') || user.role?.name === 'admin');

      if (!isAuthorized) {
        throw new Error("You don't have permission to view this department's goals. Only department managers, officers, or admins can access this.");
      }

      const goals = await prisma.performanceGoal.findMany({
        where: {
          departmentName: departmentName,
          type: 'department'
        },
        include: {
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

      return goals;
    } catch (error) {
      console.error('Error getting department goals:', error);
      throw error;
    }
  }

  /**
   * Get tasks created by a manager for their department
   */
  static async getManagerCreatedTasks(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          userDepartment: true,
          roleCode: true,
          role: {
            select: {
              name: true
            }
          }
        }
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Check if user has permission to view created tasks
      // Level 5 = Manager (Head of department), Level 4 = Officer (Deputy), or Admin
      const isAuthorized = 
        user.roleCode?.includes('_MGR') || user.roleCode?.includes('_OFF') || user.role?.name === 'admin';

      if (!isAuthorized) {
        throw new Error("You don't have permission to view created tasks. Only department managers, officers, or admins can access this.");
      }

      // Get tasks created by this user for their department
      const tasks = await prisma.task.findMany({
        where: {
          createdBy: userId,
          department: user.userDepartment,
          isPerformanceTask: true
        },
        include: {
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
      console.error('Error getting manager created tasks:', error);
      throw error;
    }
  }
}
