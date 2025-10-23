// @ts-nocheck
import { dbConnection } from "../utils/database";
import { TaskService } from "./TaskService";

const prisma = dbConnection.getPrismaClient();

export class IndividualGoalToTaskService {
  /**
   * Convert individual goals to tasks for users
   */
  static async convertIndividualGoalsToTasks(individualGoalId: string): Promise<void> {
    try {
      console.log(`🔄 Converting individual goal to tasks: ${individualGoalId}`);

      const individualGoal = await prisma.performanceGoal.findUnique({
        where: { id: individualGoalId },
        include: {
          parentGoal: {
            include: {
              parentGoal: true // Get organizational goal
            }
          }
        }
      });

      if (!individualGoal) {
        throw new Error("Individual goal not found");
      }

      if (individualGoal.type !== "individual") {
        throw new Error("Only individual goals can be converted to tasks");
      }

      if (!individualGoal.assignedToId) {
        throw new Error("Individual goal must be assigned to a user");
      }

      // Create task from individual goal
      const taskData = {
        title: individualGoal.title,
        description: individualGoal.description || `Task based on goal: ${individualGoal.title}`,
        team: [individualGoal.assignedToId], // Assign to the user
        stage: "todo",
        date: new Date(),
        priority: individualGoal.priority || "medium",
        department: individualGoal.departmentName, // Use hardcoded department name
        goalId: individualGoal.id, // Link to individual goal
        performanceCategory: individualGoal.category,
        isPerformanceTask: true,
        targetValue: individualGoal.targetValue,
        targetUnit: individualGoal.targetUnit,
        currentValue: individualGoal.currentValue || 0,
        kpi: individualGoal.kpiId ? { id: individualGoal.kpiId } : null
      };

      const task = await TaskService.createTask(taskData, individualGoal.createdById);

      console.log(`✅ Created task ${task.id} for user ${individualGoal.assignedToId} from goal ${individualGoalId}`);

      // Update the individual goal to mark it as having tasks
      await prisma.performanceGoal.update({
        where: { id: individualGoalId },
        data: {
          stage: "in_progress" // Move from planning to in_progress
        }
      });

    } catch (error) {
      console.error('❌ Error converting individual goal to task:', error);
      throw error;
    }
  }

  /**
   * Convert all individual goals for a user to tasks
   */
  static async convertUserIndividualGoalsToTasks(userId: string): Promise<void> {
    try {
      console.log(`🔄 Converting all individual goals to tasks for user: ${userId}`);

      const individualGoals = await prisma.performanceGoal.findMany({
        where: {
          type: "individual",
          assignedToId: userId,
          status: "active",
          stage: "planning" // Only convert goals that haven't been converted yet
        }
      });

      for (const goal of individualGoals) {
        await this.convertIndividualGoalsToTasks(goal.id);
      }

      console.log(`✅ Converted ${individualGoals.length} individual goals to tasks for user ${userId}`);
    } catch (error) {
      console.error('❌ Error converting user individual goals to tasks:', error);
      throw error;
    }
  }

  /**
   * Convert all individual goals in a department to tasks
   */
  static async convertDepartmentIndividualGoalsToTasks(departmentName: string): Promise<void> {
    try {
      console.log(`🔄 Converting all individual goals to tasks for department: ${departmentName}`);

      const individualGoals = await prisma.performanceGoal.findMany({
        where: {
          type: "individual",
          departmentName: departmentName,
          status: "active",
          stage: "planning" // Only convert goals that haven't been converted yet
        }
      });

      for (const goal of individualGoals) {
        await this.convertIndividualGoalsToTasks(goal.id);
      }

      console.log(`✅ Converted ${individualGoals.length} individual goals to tasks for department ${departmentName}`);
    } catch (error) {
      console.error('❌ Error converting department individual goals to tasks:', error);
      throw error;
    }
  }

  /**
   * Get user's performance tasks (linked to goals)
   */
  static async getUserPerformanceTasks(userId: string): Promise<any[]> {
    try {
      const tasks = await prisma.task.findMany({
        where: {
          team: {
            has: userId
          },
          isPerformanceTask: true
        },
        include: {
          goal: {
            include: {
              parentGoal: {
                include: {
                  parentGoal: true // Get organizational goal
                }
              }
            }
          },
          creator: {
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

      return tasks;
    } catch (error) {
      console.error('❌ Error getting user performance tasks:', error);
      throw error;
    }
  }

  /**
   * Get department's performance tasks
   */
  static async getDepartmentPerformanceTasks(departmentName: string): Promise<any[]> {
    try {
      const tasks = await prisma.task.findMany({
        where: {
          department: departmentName,
          isPerformanceTask: true
        },
        include: {
          goal: {
            include: {
              parentGoal: {
                include: {
                  parentGoal: true // Get organizational goal
                }
              }
            }
          },
          creator: {
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

      return tasks;
    } catch (error) {
      console.error('❌ Error getting department performance tasks:', error);
      throw error;
    }
  }
}
