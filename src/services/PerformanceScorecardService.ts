// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";

export class PerformanceScorecardService {
  /**
   * Get user performance scorecard
   */
  static async getUserScorecard(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userDepartment: true,
          departmentRole: true,
          roleCode: true
        }
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Get user's individual goals
      const individualGoals = await prisma.performanceGoal.findMany({
        where: {
          type: 'individual',
          assignedToId: userId
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
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true,
              parentGoal: {
                select: {
                  id: true,
                  title: true,
                  type: true
                }
              }
            }
          }
        }
      });

      // Get user's tasks
      const tasks = await prisma.task.findMany({
        where: {
          team: {
            array_contains: userId
          },
          isPerformanceTask: true
        },
        include: {
          goal: {
            select: {
              id: true,
              title: true,
              type: true
            }
          }
        }
      });

      // Calculate performance metrics
      const metrics = this.calculateUserMetrics(individualGoals, tasks);

      return {
        user: {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          department: user.userDepartment,
          role: user.departmentRole,
          roleCode: user.roleCode
        },
        goals: individualGoals.map(goal => ({
          id: goal.id,
          title: goal.title,
          type: goal.type,
          category: goal.category,
          targetValue: goal.targetValue,
          currentValue: goal.currentValue,
          progressPercentage: goal.targetValue ? 
            ((goal.currentValue || 0) / parseFloat(goal.targetValue.toString()) * 100).toFixed(2) : "0",
          stage: goal.stage,
          kpi: goal.kpi,
          parentGoal: goal.parentGoal
        })),
        tasks: tasks.map(task => ({
          id: task.id,
          title: task.title,
          stage: task.stage,
          priority: task.priority,
          isOverdue: task.isOverdue,
          goal: task.goal
        })),
        metrics
      };
    } catch (error) {
      console.error("Error getting user scorecard:", error);
      throw error;
    }
  }

  /**
   * Get department performance scorecard
   */
  static async getDepartmentScorecard(departmentName: string) {
    try {
      // Get department goals
      const departmentGoals = await prisma.performanceGoal.findMany({
        where: {
          type: 'department',
          departmentName: departmentName
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
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true
            }
          }
        }
      });

      // Get department users
      const departmentUsers = await prisma.user.findMany({
        where: {
          userDepartment: departmentName,
          role: {
            name: {
              notIn: ["admin", "applicant"]
            }
          }
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          departmentRole: true,
          roleCode: true
        }
      });

      // Calculate department metrics
      const metrics = this.calculateDepartmentMetrics(departmentGoals, departmentUsers);

      return {
        department: departmentName,
        goals: departmentGoals.map(goal => ({
          id: goal.id,
          title: goal.title,
          type: goal.type,
          category: goal.category,
          targetValue: goal.targetValue,
          currentValue: goal.currentValue,
          progressPercentage: goal.targetValue ? 
            ((goal.currentValue || 0) / parseFloat(goal.targetValue.toString()) * 100).toFixed(2) : "0",
          stage: goal.stage,
          kpi: goal.kpi,
          parentGoal: goal.parentGoal,
          individualGoals: goal.subGoals.map(indGoal => ({
            id: indGoal.id,
            title: indGoal.title,
            assignedTo: indGoal.assignedTo,
            targetValue: indGoal.targetValue,
            currentValue: indGoal.currentValue,
            progressPercentage: indGoal.targetValue ? 
              ((indGoal.currentValue || 0) / parseFloat(indGoal.targetValue.toString()) * 100).toFixed(2) : "0",
            stage: indGoal.stage
          }))
        })),
        users: departmentUsers.map(user => ({
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.departmentRole,
          roleCode: user.roleCode
        })),
        metrics
      };
    } catch (error) {
      console.error("Error getting department scorecard:", error);
      throw error;
    }
  }

  /**
   * Calculate user performance metrics
   */
  private static calculateUserMetrics(goals: any[], tasks: any[]) {
    const totalGoals = goals.length;
    const completedGoals = goals.filter(g => g.stage === 'completed').length;
    const inProgressGoals = goals.filter(g => g.stage === 'in_progress').length;
    const notStartedGoals = goals.filter(g => g.stage === 'planning').length;

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.stage === 'completed').length;
    const overdueTasks = tasks.filter(t => t.isOverdue).length;

    const totalTargetValue = goals.reduce((sum, goal) => 
      sum + parseFloat(goal.targetValue?.toString() || '0'), 0);
    const totalCurrentValue = goals.reduce((sum, goal) => 
      sum + parseFloat(goal.currentValue?.toString() || '0'), 0);

    return {
      goals: {
        total: totalGoals,
        completed: completedGoals,
        inProgress: inProgressGoals,
        notStarted: notStartedGoals,
        completionRate: totalGoals > 0 ? ((completedGoals / totalGoals) * 100).toFixed(2) : "0"
      },
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        overdue: overdueTasks,
        completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : "0"
      },
      progress: {
        totalTargetValue,
        totalCurrentValue,
        progressPercentage: totalTargetValue > 0 ? 
          ((totalCurrentValue / totalTargetValue) * 100).toFixed(2) : "0"
      }
    };
  }

  /**
   * Calculate department performance metrics
   */
  private static calculateDepartmentMetrics(goals: any[], users: any[]) {
    const totalGoals = goals.length;
    const completedGoals = goals.filter(g => g.stage === 'completed').length;
    const inProgressGoals = goals.filter(g => g.stage === 'in_progress').length;

    const totalIndividualGoals = goals.reduce((sum, goal) => sum + goal.subGoals.length, 0);
    const completedIndividualGoals = goals.reduce((sum, goal) => 
      sum + goal.subGoals.filter((sg: any) => sg.stage === 'completed').length, 0);

    const totalTargetValue = goals.reduce((sum, goal) => 
      sum + parseFloat(goal.targetValue?.toString() || '0'), 0);
    const totalCurrentValue = goals.reduce((sum, goal) => 
      sum + parseFloat(goal.currentValue?.toString() || '0'), 0);

    return {
      goals: {
        total: totalGoals,
        completed: completedGoals,
        inProgress: inProgressGoals,
        completionRate: totalGoals > 0 ? ((completedGoals / totalGoals) * 100).toFixed(2) : "0"
      },
      individualGoals: {
        total: totalIndividualGoals,
        completed: completedIndividualGoals,
        completionRate: totalIndividualGoals > 0 ? 
          ((completedIndividualGoals / totalIndividualGoals) * 100).toFixed(2) : "0"
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
  }
}