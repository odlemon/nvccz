// @ts-nocheck
import { PrismaClient, Json } from "@prisma/client";
import { prisma } from "../utils/database";
import {
  computeAchievementPercent,
  computeParentRollupFromChildren,
  deriveParentStageFromRollup,
  isTargetMet
} from "./performanceGoalRollupUtils";
import { uniqueGoalIdsForTaskBatch, buildTaskAttachmentsList } from "./performanceBackendSupport";
import {
  TaskCollaborationService,
  buildTaskDeepLink,
  isRedZoneTask,
  normaliseTaskStage,
  resolveTaskPerformanceZone,
  taskStageChatLabel
} from "./TaskCollaborationService";

/** Recompute overdue / red-zone flags from due date and stage (C.06: past due updates immediately). */
function computeOverdueFieldsForTaskUpdate(
  existingTask: { stage: string; isOverdue: boolean },
  effectiveDueDate: Date,
  effectiveStageNorm: string
) {
  const terminal = effectiveStageNorm === "completed";
  const isOverdue = !terminal && effectiveDueDate.getTime() < Date.now();

  if (isOverdue) {
    if (!existingTask.isOverdue) {
      return {
        isOverdue: true,
        originalStage: existingTask.stage,
        overdueStatus: `overdue_${effectiveStageNorm}`
      };
    }
    return {
      isOverdue: true,
      overdueStatus: `overdue_${effectiveStageNorm}`
    };
  }

  return {
    isOverdue: false,
    overdueStatus: null,
    originalStage: null
  };
}

const TASK_APPLICATION_FULL_INCLUDE = {
  fund: {
    select: {
      id: true,
      name: true,
      status: true
    }
  },
  documents: {
    select: {
      id: true,
      documentType: true,
      fileName: true,
      fileUrl: true,
      fileSize: true,
      isRequired: true,
      isSubmitted: true,
      uploadedAt: true
    }
  },
  dueDiligenceReview: {
    include: {
      reviewer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    }
  },
  boardReview: {
    include: {
      reviewer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    }
  },
  termSheet: {
    include: {
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    }
  },
  investmentImplementation: {
    select: {
      id: true,
      portfolioCompanyId: true,
      fundId: true,
      initiatedById: true,
      finalDueDiligence: true,
      contractsSigned: true,
      fundsDisbursed: true,
      status: true,
      createdAt: true,
      updatedAt: true
    }
  }
};

async function notifyTaskAssignments(taskId: string, taskTitle: string, assigneeIds: string[] = []) {
  const uniqueAssignees = Array.from(new Set((assigneeIds || []).filter(Boolean)));

  await Promise.all(
    uniqueAssignees.map((userId) =>
      prisma.notification.create({
        data: {
          title: "Task Assigned",
          message: `Task "${taskTitle}" has been assigned to you.`,
          type: "TASK_ASSIGNED",
          userId,
          data: buildTaskDeepLink(taskId),
          relatedEntity: "Task",
          relatedEntityId: taskId
        }
      })
    )
  );
}

function stageSystemMessage(stage: string) {
  const normalized = normaliseTaskStage(stage);
  const labels: Record<string, string> = {
    todo: "To Do",
    delayed: "Delayed",
    in_progress: "In Progress",
    completed: "Complete",
    amber: "Amber",
    red: "Red",
    overdue: "Overdue"
  };

  return labels[normalized] || normalized;
}

const TASK_APPLICATION_MINIMAL_SELECT = {
  id: true,
  businessName: true,
  applicantName: true,
  currentStage: true,
  submittedAt: true,
  fundId: true,
  fund: {
    select: {
      id: true,
      name: true
    }
  }
};

/**
 * Compute task percentage based on task data
 * - If status is "completed" or stage is "completed", return 100%
 * - Otherwise compute based on monetaryValueAchieved/monetaryValue or percentValueAchieved/percentValue
 * - If no values exist, use stage-based defaults
 */
export function computeTaskPercentage(task: any): number {
  // If task is completed, return 100%
  if (task.status === 'completed' || task.stage === 'completed') {
    return 100;
  }

  // Try to compute from monetary values
  if (task.monetaryValue && task.monetaryValue > 0 && task.monetaryValueAchieved !== null && task.monetaryValueAchieved !== undefined) {
    const monetaryValue = Number(task.monetaryValue);
    const monetaryValueAchieved = Number(task.monetaryValueAchieved || 0);
    if (monetaryValue > 0) {
      const percentage = (monetaryValueAchieved / monetaryValue) * 100;
      return Math.min(Math.max(percentage, 0), 100); // Clamp between 0 and 100
    }
  }

  // Try to compute from percent values
  if (task.percentValue && task.percentValue > 0 && task.percentValueAchieved !== null && task.percentValueAchieved !== undefined) {
    const percentValue = Number(task.percentValue);
    const percentValueAchieved = Number(task.percentValueAchieved || 0);
    if (percentValue > 0) {
      const percentage = (percentValueAchieved / percentValue) * 100;
      return Math.min(Math.max(percentage, 0), 100); // Clamp between 0 and 100
    }
  }

  // Fallback to stage-based defaults
  const stage = task.stage?.toLowerCase() || '';
  switch (stage) {
    case 'completed':
      return 100;
    case 'in_progress':
      return 50;
    case 'todo':
      return 0;
    case 'overdue':
      return task.percentValueAchieved ? Number(task.percentValueAchieved) : 0;
    default:
      return 0;
  }
}

async function attachApplicationDataToTasks(tasks: any[], options?: { minimal?: boolean }) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return tasks;
  }

  const applicationIds = Array.from(
    new Set(
      tasks
        .map(task => {
          if (!task) return null;
          if (task.application?.id) return task.application.id;
          if (task.applicationId) return task.applicationId;
          return null;
        })
        .filter((id): id is string => Boolean(id))
    )
  );

  if (applicationIds.length === 0) {
    return tasks.map(task => ({
      ...task,
      application: task.application ?? null,
      taskPercentage: computeTaskPercentage(task),
      performanceZone: resolveTaskPerformanceZone(task),
      attachments: buildTaskAttachmentsList(task)
    }));
  }

  const applications = await prisma.application.findMany({
    where: {
      id: {
        in: applicationIds
      }
    },
    ...(options?.minimal
      ? { select: TASK_APPLICATION_MINIMAL_SELECT }
      : { include: TASK_APPLICATION_FULL_INCLUDE })
  });

  const applicationMap = new Map(applications.map(app => [app.id, app]));

  return tasks.map(task => {
    const existingApplication = task.application ?? null;
    const lookupId = task.applicationId || existingApplication?.id;
    const application = lookupId ? applicationMap.get(lookupId) || existingApplication || null : existingApplication || null;

    return {
      ...task,
      application: application || null,
      taskPercentage: computeTaskPercentage(task),
      performanceZone: resolveTaskPerformanceZone(task),
      attachments: buildTaskAttachmentsList(task)
    };
  });
}

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
  applicationId?: string;
  fromDueDiligence?: boolean;
  category?: string;
  
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
  applicationId?: string | null;
  fromDueDiligence?: boolean;
  category?: string;
  
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

export interface HistoricalTaskEntryRequest {
  historicalDate: Date;
  stage?: string;
  monetaryValueAchieved?: number;
  percentValueAchieved?: number;
  note?: string;
  source?: string;
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
      const normalizedGoalId =
        request.goalId !== undefined && request.goalId !== null && String(request.goalId).trim() !== ""
          ? String(request.goalId)
          : null;
      const hasLinkedGoal = Boolean(normalizedGoalId);
      // Linked project tasks should roll up to the goal by default (B.17 / Project Velocity); opt out with isPerformanceTask: false.
      const normalizedIsPerformanceTask = hasLinkedGoal ? request.isPerformanceTask !== false : false;

      // Validate goal if provided
      if (normalizedGoalId) {
        const goal = await prisma.performanceGoal.findUnique({
          where: { id: normalizedGoalId }
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
      const stageNorm = normaliseTaskStage(request.stage || "todo");
      const overdueFields = computeOverdueFieldsForTaskUpdate(
        { stage: stageNorm, isOverdue: false },
        new Date(request.date),
        stageNorm
      );

      // Create the task
      const task = await prisma.task.create({
        data: {
          title: request.title,
          description: request.description,
          team: request.team,
          stage: stageNorm,
          date: request.date,
          priority: (request.priority || "medium").toLowerCase(),
          assets: request.assets,
          branch: request.branch,
          department: request.department,
          ruleset: request.ruleset,
          applicationId: request.applicationId,
          fromDueDiligence: request.fromDueDiligence ?? false,
          category: request.category,
          
          // Performance-related fields
          goalId: normalizedGoalId,
          performanceCategory: hasLinkedGoal ? request.performanceCategory : null,
          isPerformanceTask: normalizedIsPerformanceTask,
          
          // Target Values (Absolute Value System)
          monetaryValue: request.targetValue ? parseFloat(request.targetValue.toString()) : null,
          
          // KPI Integration
          kpi: kpiData,
          
          // Activities
          activities: [activity],
          
          // Metadata
          createdBy: createdBy,
          ...overdueFields
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

      await notifyTaskAssignments(task.id, task.title, Array.isArray(request.team) ? request.team : []);
      await TaskCollaborationService.createSystemMessage({
        taskId: task.id,
        actorId: createdBy,
        content: "created this task.",
        eventType: "TASK_CREATED"
      });

      const [taskWithApplication] = await attachApplicationDataToTasks([task]);
      return taskWithApplication;
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

      const beforeRedZone = isRedZoneTask(existingTask);

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

      const effectiveDueDate = request.date ? new Date(request.date) : new Date(existingTask.date);
      const effectiveStageNorm = request.stage
        ? normaliseTaskStage(request.stage)
        : normaliseTaskStage(existingTask.stage);

      const overdueFields = computeOverdueFieldsForTaskUpdate(existingTask, effectiveDueDate, effectiveStageNorm);
      const nextGoalId =
        request.goalId === undefined
          ? existingTask.goalId
          : request.goalId === null || String(request.goalId).trim() === ""
            ? null
            : String(request.goalId);
      const hasLinkedGoal = Boolean(nextGoalId);
      const nextIsPerformanceTask =
        request.isPerformanceTask !== undefined
          ? request.isPerformanceTask
          : existingTask.goalId
            ? existingTask.isPerformanceTask
            : true;
      const normalizedIsPerformanceTask = hasLinkedGoal ? Boolean(nextIsPerformanceTask) : false;

      // Update the task
      const updatedTask = await prisma.task.update({
        where: { id },
        data: {
          ...(request.title && { title: request.title }),
          ...(request.description !== undefined && { description: request.description }),
          ...(request.team && { team: request.team }),
          ...(request.stage && { stage: effectiveStageNorm, status: effectiveStageNorm }),
          ...(request.date && { date: request.date }),
          ...(request.priority && { priority: request.priority.toLowerCase() }),
          ...(request.assets !== undefined && { assets: request.assets }),
          ...(request.branch !== undefined && { branch: request.branch }),
          ...(request.department !== undefined && { department: request.department }),
          ...(request.category !== undefined && { category: request.category }),
          ...(request.ruleset !== undefined && { ruleset: request.ruleset }),
          ...(request.applicationId !== undefined && { applicationId: request.applicationId }),
          ...(request.fromDueDiligence !== undefined && { fromDueDiligence: request.fromDueDiligence }),
          
          // Performance-related fields
          ...(request.goalId !== undefined && { goalId: nextGoalId }),
          ...(request.performanceCategory !== undefined
            ? { performanceCategory: hasLinkedGoal ? request.performanceCategory : null }
            : !hasLinkedGoal
              ? { performanceCategory: null }
              : {}),
          isPerformanceTask: normalizedIsPerformanceTask,
          
          // Target Values (Absolute Value System)
          ...(request.targetValue !== undefined && { targetValue: request.targetValue }),
          ...(request.targetUnit !== undefined && { targetUnit: request.targetUnit }),
          ...(request.currentValue !== undefined && { currentValue: request.currentValue }),
          
          // KPI Integration
          kpi: kpiData,

          ...overdueFields
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

      // Any task linked to a performance goal rolls up on change (project milestones → department KPIs).
      if (updatedTask.goalId) {
        await this.updateLinkedGoalProgress(updatedTask.id);
      }

      const existingTeam = Array.isArray(existingTask.team) ? existingTask.team : [];
      const updatedTeam = Array.isArray(request.team) ? request.team : existingTeam;
      const newAssignees = updatedTeam.filter((userId: string) => !existingTeam.includes(userId));
      if (newAssignees.length > 0) {
        await notifyTaskAssignments(updatedTask.id, updatedTask.title, newAssignees);
      }

      if (
        request.stage &&
        updatedByUserId &&
        normaliseTaskStage(request.stage) !== normaliseTaskStage(existingTask.stage)
      ) {
        await TaskCollaborationService.createTaskStatusChangedSystemMessage({
          taskId: updatedTask.id,
          actorId: updatedByUserId,
          newStage: request.stage
        });
      }

      if (isRedZoneTask(updatedTask) && !beforeRedZone) {
        await TaskCollaborationService.notifyTaskRedZone({
          task: updatedTask,
          reason: "The due date has passed and the task now requires immediate attention."
        });
      }

      const [taskWithApplication] = await attachApplicationDataToTasks([updatedTask], { minimal: true });
      return taskWithApplication;
    } catch (error) {
      throw error;
    }
  }

  // Update task stage with enhanced overdue logic
  static async updateTaskStage(id: string, stage: string, achievements: any = {}, updatedByUserId?: string) {
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
          }
        }
      });

      if (!task) {
        throw new Error("Task not found");
      }

      const beforeRedZone = isRedZoneTask(task);

      // Check if task is overdue
      const isOverdue = new Date(task.date) < new Date();
      
      const normalizedStage = normaliseTaskStage(stage);
      let updateData: any = {
        stage: normalizedStage,
        status: normalizedStage
      };

      // Completed work should not stay flagged overdue / red-zone in API responses
      if (normalizedStage === "completed") {
        updateData.isOverdue = false;
        updateData.overdueStatus = null;
        updateData.originalStage = null;
      } else if (isOverdue && !task.isOverdue) {
        // Task just became overdue
        updateData.isOverdue = true;
        updateData.originalStage = task.stage; // Store original stage
        updateData.overdueStatus = `overdue_${normalizedStage}`; // overdue_todo, overdue_in_progress, etc.
      } else if (isOverdue && task.isOverdue) {
        // Task is still overdue, update overdue status
        updateData.overdueStatus = `overdue_${normalizedStage}`;
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

      if (updatedTask.goalId) {
        await this.updateLinkedGoalProgress(updatedTask.id);
      }

      const actorId = updatedByUserId || task.createdBy;
      if (normaliseTaskStage(task.stage) !== normalizedStage) {
        await TaskCollaborationService.createTaskStatusChangedSystemMessage({
          taskId: updatedTask.id,
          actorId,
          newStage: normalizedStage
        });
      }

      if (isRedZoneTask(updatedTask) && !beforeRedZone) {
        await TaskCollaborationService.notifyTaskRedZone({
          task: updatedTask,
          reason: updatedTask.isOverdue
            ? "The due date has passed and the task now requires immediate attention."
            : `The task stage was updated to ${taskStageChatLabel(normalizedStage)}.`
        });
      }

      const [taskWithApplication] = await attachApplicationDataToTasks([updatedTask]);
      return taskWithApplication;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Record historical task data entry for back-filled records.
   * Keeps historical date, collected values, and overdue/red-zone in sync.
   */
  static async recordHistoricalTaskEntry(
    id: string,
    request: HistoricalTaskEntryRequest,
    actorId: string
  ) {
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
        }
      }
    });

    if (!task) {
      throw new Error("Task not found");
    }

    if (!(request.historicalDate instanceof Date) || Number.isNaN(request.historicalDate.getTime())) {
      throw new Error("historicalDate must be a valid date");
    }

    const beforeRedZone = isRedZoneTask(task);

    const normalizedStage = normaliseTaskStage(request.stage || task.stage || "todo");
    const overdueFields = computeOverdueFieldsForTaskUpdate(
      { stage: task.stage, isOverdue: Boolean(task.isOverdue) },
      request.historicalDate,
      normalizedStage
    );

    const currentMonetary = Number(task.monetaryValueAchieved || 0);
    const currentPercent = Number(task.percentValueAchieved || 0);
    const deltaMonetary = request.monetaryValueAchieved !== undefined ? Number(request.monetaryValueAchieved) : 0;
    const deltaPercent = request.percentValueAchieved !== undefined ? Number(request.percentValueAchieved) : 0;
    if (Number.isNaN(deltaMonetary) || Number.isNaN(deltaPercent)) {
      throw new Error("Collected values must be numbers");
    }

    const activityData = {
      type: "historical_entry",
      activity: "Historical task data entry recorded",
      note: request.note || null,
      source: request.source || "manual_back_entry",
      historicalDate: request.historicalDate.toISOString(),
      collectedMonetary: deltaMonetary,
      collectedPercent: deltaPercent,
      date: new Date().toISOString(),
      by: actorId
    };
    const existingActivities = Array.isArray(task.activities) ? task.activities : [];

    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        date: request.historicalDate,
        stage: normalizedStage,
        status: normalizedStage,
        monetaryValueAchieved: currentMonetary + deltaMonetary,
        percentValueAchieved: currentPercent + deltaPercent,
        activities: [...existingActivities, activityData],
        ...overdueFields,
        updatedAt: new Date()
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

    if (updatedTask.goalId) {
      await this.updateLinkedGoalProgress(updatedTask.id);
    }

    await TaskCollaborationService.createSystemMessage({
      taskId: updatedTask.id,
      actorId,
      content: `recorded historical entry (${request.historicalDate.toISOString().slice(0, 10)}).`,
      eventType: "TASK_UPDATED"
    });

    if (isRedZoneTask(updatedTask) && !beforeRedZone) {
      await TaskCollaborationService.notifyTaskRedZone({
        task: updatedTask,
        reason: "Historical entry has a past due date and is flagged as red zone."
      });
    }

    const [taskWithApplication] = await attachApplicationDataToTasks([updatedTask], { minimal: true });
    return taskWithApplication;
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

      if (updatedTask.goalId) {
        await this.updateLinkedGoalProgress(updatedTask.id);
      }

      const [taskWithApplication] = await attachApplicationDataToTasks([updatedTask]);
      return taskWithApplication;
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

      if (filters.fromDueDiligence !== undefined) {
        where.fromDueDiligence = filters.fromDueDiligence;
      }

      if (filters.applicationId) {
        where.applicationId = filters.applicationId;
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

      const tasksWithApplication = await attachApplicationDataToTasks(tasks);
      return tasksWithApplication;
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

      if (filters.fromDueDiligence !== undefined) {
        where.fromDueDiligence = filters.fromDueDiligence;
      }

      if (filters.applicationId) {
        where.applicationId = filters.applicationId;
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
          applicationId: true,
          fromDueDiligence: true,
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

      // Extract document URLs from activity descriptions and add to activities
      const tasksWithDocuments = tasks.map(task => {
        const activitiesWithDocuments = task.activityLogs.map((activity: any) => {
          let documents: Array<{ fileName: string; fileUrl: string; fileSize: number }> = [];
          
          // Extract documents from description if they exist
          if (activity.description) {
            const documentsMatch = activity.description.match(/\[DOCUMENTS:(.+?)\]/);
            if (documentsMatch) {
              const rawPayload = documentsMatch[1];
              try {
                const parsed = JSON.parse(rawPayload);
                if (Array.isArray(parsed)) {
                  documents = parsed.filter(doc => doc && doc.fileUrl && doc.fileName);
                } else {
                  throw new Error('Documents payload is not an array');
                }
              } catch (e: any) {
                console.error('Failed to parse documents from activity description:', e);
                console.error('Raw payload:', rawPayload);
                // Attempt to recover by wrapping single object in array
                if (rawPayload.trim().startsWith('{') && rawPayload.trim().endsWith('}')) {
                  try {
                    const single = JSON.parse(rawPayload);
                    if (single && single.fileUrl && single.fileName) {
                      documents = [single];
                    }
                  } catch {
                    // swallow
                  }
                }
              }
            }
          }

          return {
            ...activity,
            documents
          };
        });

        return {
          ...task,
          activityLogs: activitiesWithDocuments
        };
      });

      const tasksWithApplication = await attachApplicationDataToTasks(tasksWithDocuments);
      return tasksWithApplication;
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

      const [taskWithApplication] = await attachApplicationDataToTasks([task]);
      return taskWithApplication;
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
        select: {
          goalId: true
        }
      });

      if (!task?.goalId) {
        console.log(`⚠️ Task ${taskId} is not linked to a goal`);
        return;
      }

      const goal = await this.recalculateGoalProgressFromTasks(task.goalId);
      
      // Calculate new goal progress based on task progress
      const newCurrentValue = Number(goal.currentValue || 0);
      const targetNum = goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0;
      const progressPercentage = computeAchievementPercent({
        currentValue: newCurrentValue,
        targetValue: goal.targetValue,
        targetOperator: goal.targetOperator,
        isReverseKpi: goal.isReverseKpi,
        progressPercentage: goal.progressPercentage
      });
      const isCompleted = isTargetMet(newCurrentValue, targetNum, goal.targetOperator, goal.isReverseKpi);

      // Update the goal
      const updatedGoal = await prisma.performanceGoal.update({
        where: { id: goal.id },
        data: {
          currentValue: newCurrentValue,
          progressPercentage: progressPercentage,
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

      // Keep KPI roll-ups in sync with KPIService (uses targetValue/currentValue when monetary* unset)
      if (goal.kpiId) {
        try {
          const { PerformanceGoalService } = await import('./PerformanceGoalService');
          await PerformanceGoalService.recalculateKPIProgress(goal.kpiId);
        } catch (kpiErr) {
          console.error(`⚠️ KPI recalc after task goal update failed for kpi ${goal.kpiId}:`, kpiErr);
        }
      }

      // If this is a sub-goal, update parent goal progress
      if (goal.parentGoalId) {
        await this.updateParentGoalProgress(goal.parentGoalId);
      }

      // 🚀 NEW: Trigger automatic roll-up calculations
      try {
        const { RollupCalculationService } = await import('./RollupCalculationService');
        await RollupCalculationService.recalculateAllRollups(goal.id);
        console.log(`✅ Automatic roll-up triggered for task goal: ${goal.id}`);
      } catch (rollupError) {
        console.error(`❌ Roll-up calculation failed for task goal ${goal.id}:`, rollupError);
      }

    } catch (error) {
      console.error('❌ Error updating linked goal progress:', error);
      throw error;
    }
  }

  static async recalculateGoalProgressFromTasks(goalId: string) {
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: goalId }
    });

    if (!goal) {
      throw new Error("Linked performance goal not found");
    }

    const linkedTasks = await prisma.task.findMany({
      where: {
        goalId,
        isTrashed: false
      }
    });

    const targetNum = goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0;
    const averageProgress = linkedTasks.length > 0
      ? linkedTasks.reduce((sum, task) => sum + computeTaskPercentage(task), 0) / linkedTasks.length
      : 0;
    const newCurrentValue = targetNum > 0 ? (targetNum * averageProgress) / 100 : averageProgress;
    const progressPercentage = computeAchievementPercent({
      currentValue: newCurrentValue,
      targetValue: goal.targetValue,
      targetOperator: goal.targetOperator,
      isReverseKpi: goal.isReverseKpi,
      progressPercentage: goal.progressPercentage
    });
    const isCompleted =
      isTargetMet(newCurrentValue, targetNum, goal.targetOperator, goal.isReverseKpi) || averageProgress >= 100;

    return prisma.performanceGoal.update({
      where: { id: goal.id },
      data: {
        currentValue: newCurrentValue,
        progressPercentage,
        status: isCompleted ? "completed" : "active",
        stage: isCompleted ? "completed" : linkedTasks.some((task) => task.stage === "in_progress") ? "in_progress" : "planning",
        updatedAt: new Date()
      }
    });
  }

  static async bulkUpdateTaskStage(taskIds: string[], stage: string, achievements: any = {}, updatedByUserId?: string) {
    const normalizedStage = normaliseTaskStage(stage);
    const tasks = await prisma.task.findMany({
      where: {
        id: {
          in: taskIds
        }
      },
      select: {
        id: true,
        goalId: true,
        title: true,
        team: true,
        date: true,
        stage: true,
        isOverdue: true,
        createdBy: true
      }
    });
    const wasRedByTaskId = new Map(tasks.map((t) => [t.id, isRedZoneTask(t)]));
    const stageBeforeById = new Map(tasks.map((t) => [t.id, normaliseTaskStage(t.stage)]));

    await prisma.$transaction(
      taskIds.map((taskId) =>
        prisma.task.update({
          where: { id: taskId },
          data: {
            stage: normalizedStage,
            status: normalizedStage,
            ...(achievements?.monetaryValueAchieved !== undefined
              ? { monetaryValueAchieved: achievements.monetaryValueAchieved }
              : {}),
            ...(achievements?.percentValueAchieved !== undefined
              ? { percentValueAchieved: achievements.percentValueAchieved }
              : {}),
            updatedAt: new Date()
          }
        })
      )
    );

    const goalIds = uniqueGoalIdsForTaskBatch(tasks);
    for (const goalId of goalIds) {
      const anchor = await prisma.task.findFirst({
        where: { goalId, isTrashed: false },
        select: { id: true }
      });
      if (anchor) {
        await this.updateLinkedGoalProgress(anchor.id);
      } else {
        await this.recalculateGoalProgressFromTasks(goalId);
        const goalAfter = await prisma.performanceGoal.findUnique({ where: { id: goalId } });
        if (goalAfter?.kpiId) {
          try {
            const { PerformanceGoalService } = await import("./PerformanceGoalService");
            await PerformanceGoalService.recalculateKPIProgress(goalAfter.kpiId);
          } catch (kpiErr) {
            console.error(`⚠️ KPI recalc after bulk goal update failed for kpi ${goalAfter.kpiId}:`, kpiErr);
          }
        }
        if (goalAfter?.parentGoalId) {
          await this.updateParentGoalProgress(goalAfter.parentGoalId);
        }
        try {
          const { RollupCalculationService } = await import("./RollupCalculationService");
          await RollupCalculationService.recalculateAllRollups(goalId);
        } catch (error) {
          console.error(`Failed to recalculate rollups for bulk-updated goal ${goalId}:`, error);
        }
      }
    }

    const updatedTasks = await prisma.task.findMany({
      where: {
        id: {
          in: taskIds
        }
      }
    });

    if (updatedByUserId) {
      for (const task of updatedTasks) {
        if (stageBeforeById.get(task.id) !== normaliseTaskStage(task.stage)) {
          await TaskCollaborationService.createTaskStatusChangedSystemMessage({
            taskId: task.id,
            actorId: updatedByUserId,
            newStage: normalizedStage,
            variant: "bulk"
          });
        }

        if (isRedZoneTask(task) && !wasRedByTaskId.get(task.id)) {
          await TaskCollaborationService.notifyTaskRedZone({
            task,
            reason: task.isOverdue
              ? "The task remains overdue after the bulk update."
              : `The task was moved to ${stageSystemMessage(normalizedStage)} during a bulk update.`
          });
        }
      }
    }

    return updatedTasks;
  }

  static async bulkTrashTasks(taskIds: string[], updatedByUserId?: string) {
    const tasks = await prisma.task.findMany({
      where: {
        id: {
          in: taskIds
        }
      },
      select: {
        id: true,
        goalId: true
      }
    });

    await prisma.task.updateMany({
      where: {
        id: {
          in: taskIds
        }
      },
      data: {
        isTrashed: true,
        updatedAt: new Date()
      }
    });

    const goalIds = uniqueGoalIdsForTaskBatch(tasks);
    for (const goalId of goalIds) {
      await this.recalculateGoalProgressFromTasks(goalId);
      try {
        const { RollupCalculationService } = await import("./RollupCalculationService");
        await RollupCalculationService.recalculateAllRollups(goalId);
      } catch (error) {
        console.error(`Failed to recalculate rollups for trashed-task goal ${goalId}:`, error);
      }
    }

    return {
      trashedTaskIds: taskIds,
      affectedGoalIds: goalIds,
      updatedByUserId: updatedByUserId || null
    };
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

      const rollup = computeParentRollupFromChildren(
        parentGoal.subGoals,
        parentGoal.targetValue
      );
      const { stage: newStage, status: newStatus } = deriveParentStageFromRollup({
        allCompleted: rollup.allCompleted,
        anyInProgress: rollup.anyInProgress,
        weightedProgress: rollup.progressPercentage,
        suggestedCurrentValue: rollup.suggestedCurrentValue,
        subGoalCount: parentGoal.subGoals.length,
        previousStage: parentGoal.stage || "planning"
      });

      await prisma.performanceGoal.update({
        where: { id: parentGoalId },
        data: {
          currentValue: rollup.suggestedCurrentValue,
          progressPercentage: rollup.progressPercentage,
          status: newStatus,
          stage: newStage,
          updatedAt: new Date()
        }
      });

      console.log(
        `✅ Updated parent goal ${parentGoalId} progress: ${rollup.progressPercentage.toFixed(1)}% (weighted)`
      );

      if (rollup.allCompleted && parentGoal.kpiId) {
        await this.triggerAccountingIntegration(parentGoalId, parentGoal.targetValue || 0);
      }

      // 🚀 NEW: Trigger automatic roll-up calculations
      try {
        const { RollupCalculationService } = await import('./RollupCalculationService');
        await RollupCalculationService.recalculateAllRollups(parentGoalId);
        console.log(`✅ Automatic roll-up triggered for parent goal: ${parentGoalId}`);
      } catch (rollupError) {
        console.error(`❌ Roll-up calculation failed for parent goal ${parentGoalId}:`, rollupError);
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
   * Trigger accounting integration when goal is completed (task-linked goals / B.17).
   * Uses hardcoded KPI config + chart of accounts rows (accountNo), same pattern as PerformanceGoalService.
   */
  static async triggerAccountingIntegration(goalId: string, achievedValue: number): Promise<void> {
    try {
      console.log(`💰 Triggering accounting integration for goal: ${goalId}`);

      const goal = await prisma.performanceGoal.findUnique({
        where: { id: goalId },
        include: { kpi: true },
      });

      if (!goal?.kpi) {
        console.log(`⚠️ Goal ${goalId} has no KPI integration`);
        return;
      }

      const { HARDCODED_KPIS } = await import("../config/hardcodedKPIs");
      const kpiConfig = HARDCODED_KPIS.find(
        (k) =>
          String(k.name || "").toLowerCase().trim() ===
          String(goal.kpi.name || "").toLowerCase().trim()
      );

      if (!kpiConfig?.isFinancial || !kpiConfig.accountNumber) {
        console.log(`⚠️ KPI "${goal.kpi.name}" is not financial or has no GL mapping; skipping journal entry`);
        return;
      }

      if (!Number.isFinite(achievedValue) || achievedValue <= 0) {
        console.log(`⚠️ KPI journal skipped: non-positive achievedValue (${achievedValue})`);
        return;
      }

      const offsetAccountNo = "1000";
      const [primaryAcc, offsetAcc] = await Promise.all([
        prisma.chartOfAccounts.findFirst({
          where: { accountNo: kpiConfig.accountNumber, isActive: true },
          select: { id: true },
        }),
        prisma.chartOfAccounts.findFirst({
          where: { accountNo: offsetAccountNo, isActive: true },
          select: { id: true },
        }),
      ]);

      if (!primaryAcc?.id || !offsetAcc?.id) {
        console.error(
          `❌ KPI journal skipped: chart account missing (KPI accountNo=${kpiConfig.accountNumber}, offset=${offsetAccountNo})`
        );
        return;
      }

      const currency =
        (await prisma.currency.findFirst({ where: { isDefault: true, isActive: true } })) ||
        (await prisma.currency.findFirst({ where: { code: "USD", isActive: true } })) ||
        (await prisma.currency.findFirst({ where: { isActive: true } }));

      if (!currency) {
        console.error("❌ KPI journal skipped: no active currency");
        return;
      }

      const { createJournalEntryWithAuditSequence } = await import("./AuditTrailSequenceService");

      const primaryId = primaryAcc.id;
      const offsetId = offsetAcc.id;
      const line1AccountId =
        kpiConfig.journalEntryType === "Debit" ? primaryId : offsetId;
      const line2AccountId =
        kpiConfig.journalEntryType === "Credit" ? primaryId : offsetId;

      await createJournalEntryWithAuditSequence({
        transactionDate: new Date(),
        referenceNumber: `KPI-${goal.id}-${Date.now()}`,
        description: `KPI Achievement: ${goal.kpi.name} - ${goal.title}`,
        totalAmount: achievedValue,
        currencyId: currency.id,
        status: "POSTED",
        createdById: goal.createdById,
        journalEntryLines: {
          create: [
            {
              chartOfAccountId: line1AccountId,
              debitAmount: kpiConfig.journalEntryType === "Debit" ? achievedValue : 0,
              creditAmount: kpiConfig.journalEntryType === "Credit" ? achievedValue : 0,
              description: `KPI: ${goal.kpi.name}`,
            },
            {
              chartOfAccountId: line2AccountId,
              debitAmount: kpiConfig.journalEntryType === "Credit" ? achievedValue : 0,
              creditAmount: kpiConfig.journalEntryType === "Debit" ? achievedValue : 0,
              description: `KPI: ${goal.kpi.name}`,
            },
          ],
        },
      });

      console.log(`✅ KPI journal posted for goal ${goalId} (${goal.kpi.name})`);
    } catch (error) {
      console.error("❌ Error triggering accounting integration:", error);
      throw error;
    }
  }
}
