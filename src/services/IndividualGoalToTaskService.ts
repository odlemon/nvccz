// @ts-nocheck
import { prisma } from "../utils/database";
import { EmailNotificationService } from "./EmailNotificationService";
import { TaskService, computeTaskPercentage } from "./TaskService";

function formatGoalDate(d: Date | string | null | undefined): string {
  if (d == null) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toISOString().slice(0, 10);
}

function formatTargetValueDisplay(value: unknown): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export class IndividualGoalToTaskService {
  /** First existing user wins — avoids "Creator user not found" when goal.createdById is stale. */
  private static async resolveTaskCreatorUserId(
    candidates: Array<string | null | undefined>
  ): Promise<string> {
    const breakdownLogTag = "[performance-breakdown:individuals]";
    for (let i = 0; i < candidates.length; i++) {
      const raw = candidates[i];
      const id = raw != null ? String(raw).trim() : "";
      if (!id) {
        console.log(
          breakdownLogTag,
          "resolveTaskCreator: skip empty candidate",
          JSON.stringify({ index: i, totalCandidates: candidates.length })
        );
        continue;
      }
      const u = await prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (u) {
        console.log(
          breakdownLogTag,
          "resolveTaskCreator: using candidate",
          JSON.stringify({ index: i, creatorUserId: u.id })
        );
        return u.id;
      }
      console.warn(
        breakdownLogTag,
        "resolveTaskCreator: candidate not found in DB (wrong id or deactivated?)",
        JSON.stringify({ index: i, candidateIdPrefix: `${id.slice(0, 8)}…` })
      );
    }
    console.error(
      breakdownLogTag,
      "resolveTaskCreator: FAILED — no valid creator",
      JSON.stringify({
        attemptedSlots: candidates.length,
        hint: "Ensure breakdown is called with authenticate + valid session, or department goal.createdById is an active user"
      })
    );
    throw new Error(
      "Cannot create performance task: no valid creator user. The department goal's creator may have been deactivated; retry breakdown while logged in as an active manager."
    );
  }

  /**
   * Convert individual goals to tasks for users
   * @param taskCreatorUserId - Prefer caller (manager doing breakdown); falls back to goal.createdById.
   */
  static async convertIndividualGoalsToTasks(
    individualGoalId: string,
    taskCreatorUserId?: string | null
  ): Promise<void> {
    const breakdownLogTag = "[performance-breakdown:individuals]";
    try {
      console.log(`🔄 Converting individual goal to tasks: ${individualGoalId}`);
      console.log(
        breakdownLogTag,
        "convertIndividualGoalsToTasks:start",
        JSON.stringify({
          individualGoalId,
          taskCreatorUserIdArg: taskCreatorUserId ?? null
        })
      );

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

      const createdBy = await this.resolveTaskCreatorUserId([
        taskCreatorUserId,
        individualGoal.createdById,
      ]);
      console.log(
        breakdownLogTag,
        "resolved task creator",
        JSON.stringify({
          createdBy,
          assignedToId: individualGoal.assignedToId,
          departmentName: individualGoal.departmentName
        })
      );

      let kpiPayload: { id: string } | null = null;
      if (individualGoal.kpiId) {
        const kpiRow = await prisma.kPI.findUnique({
          where: { id: individualGoal.kpiId },
          select: { id: true },
        });
        if (kpiRow) {
          kpiPayload = { id: kpiRow.id };
        } else {
          console.warn(
            `⚠️ Individual goal ${individualGoalId} has kpiId ${individualGoal.kpiId} but KPI row is missing — creating task without KPI`
          );
        }
      }

      // Create task from individual goal
      const taskData = {
        title: individualGoal.title,
        description: individualGoal.description || `Task based on goal: ${individualGoal.title}`,
        team: [individualGoal.assignedToId], // Assign to the user
        stage: "todo",
        date:
          individualGoal.endDate != null && !Number.isNaN(new Date(individualGoal.endDate).getTime())
            ? new Date(individualGoal.endDate)
            : new Date(),
        priority: individualGoal.priority || "medium",
        department: individualGoal.departmentName, // Use hardcoded department name
        goalId: individualGoal.id, // Link to individual goal
        performanceCategory: individualGoal.scorecardPillar,
        isPerformanceTask: true,
        targetValue: individualGoal.targetValue
          ? parseFloat(individualGoal.targetValue.toString())
          : undefined,
        kpi: kpiPayload
      };

      console.log(
        breakdownLogTag,
        "calling TaskService.createTask",
        JSON.stringify({
          title: taskData.title?.slice?.(0, 120),
          department: taskData.department ?? null,
          goalId: taskData.goalId,
          isPerformanceTask: taskData.isPerformanceTask,
          teamLength: Array.isArray(taskData.team) ? taskData.team.length : null,
          hasKpi: Boolean(kpiPayload?.id),
          monetaryTarget: taskData.targetValue ?? null
        })
      );

      const task = await TaskService.createTask(taskData, createdBy);

      console.log(`✅ Created task ${task.id} for user ${individualGoal.assignedToId} from goal ${individualGoalId}`);
      console.log(
        breakdownLogTag,
        "TaskService.createTask OK",
        JSON.stringify({ taskId: task.id, goalId: individualGoalId })
      );

      try {
        const assignee = await prisma.user.findUnique({
          where: { id: individualGoal.assignedToId },
          select: { email: true, firstName: true, lastName: true }
        });
        const email = assignee?.email?.trim();
        if (email) {
          const assigneeName = [assignee?.firstName, assignee?.lastName].filter(Boolean).join(" ").trim() || "Colleague";
          await EmailNotificationService.sendPerformanceGoalTaskAssignedEmail({
            assigneeName,
            assigneeEmail: email,
            taskTitle: individualGoal.title,
            taskId: task.id,
            targetValueDisplay: formatTargetValueDisplay(individualGoal.targetValue),
            targetUnit: individualGoal.targetUnit || "—",
            priority: individualGoal.priority || "medium",
            startDateDisplay: formatGoalDate(individualGoal.startDate),
            endDateDisplay: formatGoalDate(individualGoal.endDate),
            departmentName: individualGoal.departmentName,
            description: individualGoal.description
          });
        } else {
          console.warn(
            `⚠️ No email for user ${individualGoal.assignedToId}; skipped performance task notification`
          );
        }
      } catch (emailErr) {
        console.error("❌ Failed to send performance goal task email (task was created):", emailErr);
      }

      // Update the individual goal to mark it as having tasks
      await prisma.performanceGoal.update({
        where: { id: individualGoalId },
        data: {
          stage: "in_progress" // Move from planning to in_progress
        }
      });

    } catch (error) {
      console.error(breakdownLogTag, "convertIndividualGoalsToTasks FAILED:", error);
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
            array_contains: userId
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

      // Add taskPercentage to each task
      return tasks.map(task => ({
        ...task,
        taskPercentage: computeTaskPercentage(task)
      }));
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

      // Add taskPercentage to each task
      return tasks.map(task => ({
        ...task,
        taskPercentage: computeTaskPercentage(task)
      }));
    } catch (error) {
      console.error('❌ Error getting department performance tasks:', error);
      throw error;
    }
  }
}
