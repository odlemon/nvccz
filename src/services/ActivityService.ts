// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from '@prisma/client/runtime/library';
import { FirebaseStorageService } from './FirebaseStorageService';
import { EmailNotificationService } from './EmailNotificationService';
import { logger } from '../utils/logger';
import { computeTaskPercentage } from './TaskService';
import { computeAchievementPercent, isTargetMet } from './performanceGoalRollupUtils';
import {
  legacyProgressFieldsForGoal,
  parseProgressBaseline,
  PerformanceGoalService
} from "./PerformanceGoalService";

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

      let finalGoalId = activityData.goalId;

      // If activityType is 'task', automatically find the goal from the task (if it exists)
      if (activityData.activityType === 'task' && activityData.taskId) {
        const task = await prisma.task.findUnique({
          where: { id: activityData.taskId },
          select: { goalId: true }
        });

        if (!task) {
          throw new Error("Task not found");
        }

        // Goal ID is optional - tasks created from assignment might not have a goal
        if (task.goalId) {
          finalGoalId = task.goalId;
        }
        // If task doesn't have goalId, finalGoalId remains null/undefined (which is fine)
      }

      // Create the activity
      const activity = await prisma.activityLog.create({
        data: {
          title: activityData.title,
          description: activityData.description,
          activityType: activityData.activityType === 'task' ? 'task_completion' : 'goal_update',
          taskId: activityData.taskId,
          goalId: finalGoalId,
          userId: activityData.userId,
          monetaryValueAchieved: activityData.valueCollected ? new Decimal(activityData.valueCollected) : null,
          percentValueAchieved: null, // We'll calculate this if needed
          status: 'pending_approval'
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
        }
      });

      // Auto-update stage based on value collected vs target
      if (activityData.valueCollected !== undefined) {
        if (activityData.activityType === 'task' && activityData.taskId) {
          await this.updateTaskStageBasedOnProgress(activityData.taskId, activityData.valueCollected);
          // Also update the linked goal progress
          if (finalGoalId) {
            await this.updateGoalProgressBasedOnActivity(finalGoalId, activityData.valueCollected);
          }
        } else if (activityData.activityType === 'goal' && activityData.goalId) {
          await this.updateGoalProgressBasedOnActivity(activityData.goalId, activityData.valueCollected);
        }
      }

      // 🚀 NEW: Trigger automatic roll-up calculations
      if (finalGoalId) {
        try {
          const { RollupCalculationService } = await import('./RollupCalculationService');
          await RollupCalculationService.recalculateAllRollups(finalGoalId);
          console.log(`✅ Automatic roll-up triggered for goal: ${finalGoalId}`);
        } catch (rollupError) {
          console.error(`❌ Roll-up calculation failed for goal ${finalGoalId}:`, rollupError);
          // Don't throw error - activity creation should still succeed
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
          type: true,
          parentGoalId: true,
          targetOperator: true,
          isReverseKpi: true,
          progressPercentage: true,
          targetUnit: true,
          monetaryValue: true,
          monetaryValueAchieved: true,
          percentValue: true,
          percentValueAchieved: true
        }
      });

      if (!goal) {
        throw new Error("Goal not found");
      }

      const prev = parseProgressBaseline(goal);
      const newCurrentValue = Math.max(0, prev + valueCollected);
      const targetValue = goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0;
      const progressPercentage = computeAchievementPercent({
        currentValue: newCurrentValue,
        targetValue: goal.targetValue,
        targetOperator: goal.targetOperator,
        isReverseKpi: goal.isReverseKpi,
        progressPercentage: goal.progressPercentage
      });
      const met = isTargetMet(newCurrentValue, targetValue, goal.targetOperator, goal.isReverseKpi);
      const stage = met ? 'completed' : 'in_progress';

      const legacyData = legacyProgressFieldsForGoal(goal, newCurrentValue);

      await prisma.performanceGoal.update({
        where: { id: goalId },
        data: {
          currentValue: newCurrentValue,
          progressPercentage,
          stage,
          status: stage === 'completed' ? 'completed' : 'active',
          preciseCurrentValue: String(newCurrentValue),
          ...legacyData,
          updatedAt: new Date()
        }
      });

      await PerformanceGoalService.refreshPerformanceRiskZoneOnGoal(goalId).catch(() => undefined);

      console.log(`📈 Goal ${goal.title} progress updated: ${newCurrentValue}/${targetValue} (${progressPercentage.toFixed(1)}%)`);

      if (goal.parentGoalId) {
        const pid = goal.parentGoalId;
        void PerformanceGoalService.updateParentGoalProgress(pid).catch((err: Error) =>
          console.error(`Failed parent roll-up after activity on goal ${goalId}:`, err)
        );
      }
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
      });

      return activities;
    } catch (error) {
      console.error('Error getting task activities:', error);
      throw error;
    }
  }

  /**
   * Get activities for a specific goal
   * Includes both direct goal activities and task activities linked to the goal
   */
  static async getGoalActivities(goalId: string) {
    try {
      const activities = await prisma.activityLog.findMany({
        where: {
          goalId: goalId,
          // Include both goal updates and task completions that are linked to this goal
          activityType: {
            in: ['goal_update', 'task_completion']
          }
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

      // Add taskPercentage to each task
      return tasks.map(task => ({
        ...task,
        taskPercentage: computeTaskPercentage(task)
      }));
    } catch (error) {
      console.error('Error getting manager created tasks:', error);
      throw error;
    }
  }

  /**
   * Update activity with optional document upload
   * Used for due diligence task activities
   * Finds or creates an activity for the given task and user
   */
  static async updateActivityWithDocuments(
    taskId: string,
    updateData: {
      title?: string;
      description?: string;
      valueCollected?: number;
      documents?: Array<{
        fileName: string;
        fileUrl: string;
        fileSize: number;
      }>;
    },
    userId: string
  ): Promise<any> {
    try {
      // Verify task exists
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          title: true,
          goalId: true,
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      if (!task) {
        throw new Error('Task not found');
      }

      // Find existing activity for this task and user
      let activity = await prisma.activityLog.findFirst({
        where: {
          taskId: taskId,
          userId: userId
        },
        include: {
          task: {
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
          },
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

      // If no activity exists, create one
      if (!activity) {
        // Get goalId from task (optional - tasks from assignment might not have a goal)
        const goalId = task.goalId;

        // Create new activity (goalId can be null)
        activity = await prisma.activityLog.create({
          data: {
            title: updateData.title || task.title || 'Task Activity',
            description: updateData.description || '',
            activityType: 'task_completion',
            taskId: taskId,
            goalId: goalId, // Can be null
            userId: userId,
            monetaryValueAchieved: updateData.valueCollected ? new Decimal(updateData.valueCollected) : null,
            percentValueAchieved: null,
            status: 'pending_approval'
          },
          include: {
            task: {
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
            },
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
      }

      // Prepare update data
      const updatePayload: any = {
        updatedAt: new Date()
      };

      if (updateData.title) updatePayload.title = updateData.title;
      if (updateData.description) updatePayload.description = updateData.description;
      if (updateData.valueCollected !== undefined) {
        updatePayload.monetaryValueAchieved = new Decimal(updateData.valueCollected);
      }

      // Store documents in a JSON field (we'll use description or create a metadata approach)
      // For now, we'll store documents info in a JSON structure
      if (updateData.documents && updateData.documents.length > 0) {
        // Store documents metadata - we'll add this to description or use a custom approach
        const documentsInfo = JSON.stringify(updateData.documents);
        updatePayload.description = `${activity.description || ''}\n\n[DOCUMENTS:${documentsInfo}]`;
      }

      // Update activity
      const updatedActivity = await prisma.activityLog.update({
        where: { id: activity.id },
        data: updatePayload,
        include: {
          task: {
            include: {
              creator: true
            }
          },
          user: true
        }
      });

      // Send email notification to task creator (CIO) about activity update
      if (task.creator) {
        try {
          await EmailNotificationService.sendDueDiligenceActivityUpdateEmail({
            cioName: `${task.creator.firstName} ${task.creator.lastName}`,
            cioEmail: task.creator.email,
            assigneeName: `${activity.user.firstName} ${activity.user.lastName}`,
            taskTitle: task.title,
            activityTitle: updatedActivity.title,
            activityId: updatedActivity.id,
            taskId: taskId,
            hasDocuments: updateData.documents && updateData.documents.length > 0
          });
          logger.info('Activity update email sent to CIO', {
            activityId: updatedActivity.id,
            taskId: taskId,
            cioId: task.creator.id
          });
        } catch (emailError: any) {
          logger.error('Failed to send activity update email', {
            error: emailError.message,
            activityId: updatedActivity.id
          });
          // Don't fail activity update if email fails
        }
      }

      logger.info('Activity updated with documents', {
        activityId: updatedActivity.id,
        taskId: taskId,
        userId,
        hasDocuments: updateData.documents && updateData.documents.length > 0
      });

      return updatedActivity;
    } catch (error: any) {
      throw new Error(`Failed to update activity: ${error.message}`);
    }
  }

  /**
   * Approve activity (view documents and approve)
   * Used by CIO to approve assignee's activity updates
   */
  static async approveActivity(
    activityId: string,
    approverId: string,
    approvalData?: {
      comments?: string;
      approved?: boolean;
    }
  ): Promise<any> {
    try {
      // Get activity with task and creator info
      const activity = await prisma.activityLog.findUnique({
        where: { id: activityId },
        include: {
          task: {
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
          },
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

      if (!activity) {
        throw new Error('Activity not found');
      }

      // Extract documents from description (temporary approach - in production, use a proper field)
      const documentsMatch = activity.description?.match(/\[DOCUMENTS:(.+?)\]/);
      let documents: any[] = [];
      if (documentsMatch) {
        try {
          documents = JSON.parse(documentsMatch[1]);
        } catch (e) {
          // Documents parsing failed, continue without documents
        }
      }

      // Update activity with approval status
      const approvalStatus = approvalData?.approved !== false ? 'approved' : 'rejected';
      const approvalInfo = `\n\n[APPROVAL:${approvalStatus.toUpperCase()}:${approverId}:${new Date().toISOString()}:${approvalData?.comments || ''}]`;
      
      const updatedActivity = await prisma.activityLog.update({
        where: { id: activityId },
        data: {
          status: approvalStatus,
          description: `${activity.description || ''}${approvalInfo}`
        },
        include: {
          task: true,
          user: true
        }
      });

      // Send email notification to assignee about approval
      try {
        await EmailNotificationService.sendDueDiligenceActivityApprovedEmail({
          assigneeName: `${activity.user.firstName} ${activity.user.lastName}`,
          assigneeEmail: activity.user.email,
          taskTitle: activity.task?.title || 'Task',
          activityTitle: activity.title,
          approved: approvalStatus === 'approved',
          comments: approvalData?.comments,
          activityId: activityId
        });
        logger.info('Activity approval email sent to assignee', {
          activityId,
          assigneeId: activity.userId,
          approved: approvalStatus === 'approved'
        });
      } catch (emailError: any) {
        logger.error('Failed to send activity approval email', {
          error: emailError.message,
          activityId
        });
        // Don't fail approval if email fails
      }

      logger.info('Activity approved', {
        activityId,
        approverId,
        approved: approvalStatus === 'approved'
      });

      return {
        ...updatedActivity,
        documents: documents,
        approvalStatus: approvalStatus,
        approvedBy: approverId,
        approvedAt: new Date()
      };
    } catch (error: any) {
      throw new Error(`Failed to approve activity: ${error.message}`);
    }
  }

  /**
   * Get activity with documents for approval view
   */
  static async getActivityForApproval(activityId: string, approverId: string): Promise<any> {
    try {
      const activity = await prisma.activityLog.findUnique({
        where: { id: activityId },
        include: {
          task: {
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
          },
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

      if (!activity) {
        throw new Error('Activity not found');
      }

      // Extract documents from description
      const documentsMatch = activity.description?.match(/\[DOCUMENTS:(.+?)\]/);
      let documents: any[] = [];
      if (documentsMatch) {
        try {
          documents = JSON.parse(documentsMatch[1]);
        } catch (e) {
          // Documents parsing failed
        }
      }

      // Extract approval status
      const approvalMatch = activity.description?.match(/\[APPROVAL:(.+?)\]/);
      let approvalStatus = 'PENDING';
      if (approvalMatch) {
        const approvalParts = approvalMatch[1].split(':');
        approvalStatus = approvalParts[0] || 'PENDING';
      }

      return {
        ...activity,
        documents: documents,
        approvalStatus: approvalStatus
      };
    } catch (error: any) {
      throw new Error(`Failed to get activity for approval: ${error.message}`);
    }
  }
}
