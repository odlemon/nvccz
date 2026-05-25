// @ts-nocheck
import { PrismaClient, Json } from "@prisma/client";
import { prisma } from "../utils/database";
import {
  computeAchievementPercent,
  computeParentRollupFromChildren,
  deriveGoalProgressState,
  deriveParentStageFromRollup,
  parseGoalCurrentAndTargetForAnalytics
} from "./performanceGoalRollupUtils";
import { uniqueGoalIdsForTaskBatch, buildTaskAttachmentsList } from "./performanceBackendSupport";
import {
  TaskCollaborationService,
  applyDueDateStageToTask,
  buildTaskDeepLink,
  isRedZoneTask,
  normaliseTaskStage,
  resolveTaskPerformanceZone,
  resolveTaskStageAndOverdueFields,
  taskStageChatLabel
} from "./TaskCollaborationService";
import { emitToUsers } from "./RealtimeSocketService";
import { PerformanceGoalService, legacyProgressFieldsForGoal } from "./PerformanceGoalService";
import { PerformanceGoalProgressBridge } from "./PerformanceGoalProgressBridge";
import { PerformanceGoalProgressEventService } from "./PerformanceGoalProgressEventService";

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

/** Legacy tasks stored `kpi.type` (Metric | Percentage); catalog KPIs use `unitCategory`. */
function kpiTracksPercentAchievement(kpi: { unitCategory?: string | null; type?: string | null } | null | undefined): boolean {
  if (!kpi) return false;
  const legacy = String((kpi as any).type || "").toLowerCase();
  if (legacy === "percentage") return true;
  const c = String(kpi.unitCategory ?? "").toLowerCase();
  return c.includes("percent");
}

/** Parse Prisma Decimal / string / number to finite number (default 0). */
export function parseMonetaryAmount(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

/** Round task/goal display numbers to 2 decimal places (avoids float noise in API responses). */
export function roundTaskDisplayNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(n)) return null;
  return parseFloat(n.toFixed(2));
}

const TASK_NUMERIC_RESPONSE_FIELDS = [
  "monetaryValue",
  "monetaryValueAchieved",
  "percentValue",
  "percentValueAchieved",
  "targetValue"
] as const;

/** Format monetary / percent fields on a task for API responses. */
export function formatTaskNumericFields<T extends Record<string, unknown>>(task: T): T {
  const out = { ...task } as T & Record<string, unknown>;
  for (const key of TASK_NUMERIC_RESPONSE_FIELDS) {
    if (key in out && out[key] != null) {
      out[key] = roundTaskDisplayNumber(out[key]);
    }
  }
  if (out.goal && typeof out.goal === "object" && out.goal !== null) {
    const goal = { ...(out.goal as Record<string, unknown>) };
    for (const key of ["targetValue", "currentValue", "progressPercentage"] as const) {
      if (key in goal && goal[key] != null) {
        goal[key] = roundTaskDisplayNumber(goal[key]);
      }
    }
    out.goal = goal;
  }
  if (Array.isArray(out.activities)) {
    out.activities = out.activities.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const row = { ...(entry as Record<string, unknown>) };
      for (const key of ["collectedMonetary", "collectedPercent"] as const) {
        if (key in row && row[key] != null) {
          row[key] = roundTaskDisplayNumber(row[key]);
        }
      }
      return row;
    });
  }
  return out as T;
}

/** Add achievement increment without string concatenation on Decimal fields. */
export function addMonetaryAchieved(current: unknown, increment: unknown): number {
  return parseMonetaryAmount(current) + parseMonetaryAmount(increment);
}

export function addPercentAchieved(current: unknown, increment: unknown): number {
  return parseMonetaryAmount(current) + parseMonetaryAmount(increment);
}

/** Task stage from cumulative achievement vs target. */
export function resolveTaskStageFromAchievement(
  achieved: number,
  target: unknown,
  previousStage?: string | null
): string {
  const targetNum = parseMonetaryAmount(target);
  if (targetNum > 0 && achieved >= targetNum) return "completed";
  if (achieved > 0) return "in_progress";
  return previousStage && previousStage !== "completed" ? previousStage : "todo";
}

/** Lean list payload for GET /tasks and GET /tasks/my (no activityLogs / heavy joins). */
const TASK_LIST_SELECT = {
  id: true,
  title: true,
  description: true,
  assets: true,
  activities: true,
  team: true,
  stage: true,
  date: true,
  priority: true,
  department: true,
  category: true,
  taskMetadata: true,
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
  percentValue: true,
  percentValueAchieved: true,
  kpi: true,
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
} as const;

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

async function notifyTaskAssignments(
  taskId: string,
  taskTitle: string,
  assigneeIds: string[] = [],
  applicationId?: string | null
) {
  const uniqueAssignees = Array.from(new Set((assigneeIds || []).filter(Boolean)));
  if (uniqueAssignees.length === 0) return;

  const deepLink = buildTaskDeepLink(taskId, undefined, applicationId);

  await Promise.all(
    uniqueAssignees.map((userId) =>
      prisma.notification.create({
        data: {
          title: "New task assigned",
          message: `Task "${taskTitle}" has been assigned to you.`,
          type: "TASK_ASSIGNED",
          userId,
          data: deepLink,
          relatedEntity: "Task",
          relatedEntityId: taskId
        }
      })
    )
  );

  emitToUsers(uniqueAssignees, "notification_created", {
    type: "TASK_ASSIGNED",
    ...deepLink
  });
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
      return roundTaskDisplayNumber(Math.min(Math.max(percentage, 0), 100)) ?? 0;
    }
  }

  // Try to compute from percent values
  if (task.percentValue && task.percentValue > 0 && task.percentValueAchieved !== null && task.percentValueAchieved !== undefined) {
    const percentValue = Number(task.percentValue);
    const percentValueAchieved = Number(task.percentValueAchieved || 0);
    if (percentValue > 0) {
      const percentage = (percentValueAchieved / percentValue) * 100;
      return roundTaskDisplayNumber(Math.min(Math.max(percentage, 0), 100)) ?? 0;
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
    return tasks.map((task) => {
      const shaped = applyDueDateStageToTask(task);
      return formatTaskNumericFields({
        ...shaped,
        application: shaped.application ?? null,
        taskPercentage: computeTaskPercentage(shaped),
        performanceZone: resolveTaskPerformanceZone(shaped),
        attachments: buildTaskAttachmentsList(shaped)
      });
    });
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

  return tasks.map((task) => {
    const existingApplication = task.application ?? null;
    const lookupId = task.applicationId || existingApplication?.id;
    const application = lookupId ? applicationMap.get(lookupId) || existingApplication || null : existingApplication || null;
    const shaped = applyDueDateStageToTask(task);

    return formatTaskNumericFields({
      ...shaped,
      application: application || null,
      taskPercentage: computeTaskPercentage(shaped),
      performanceZone: resolveTaskPerformanceZone(shaped),
      attachments: buildTaskAttachmentsList(shaped)
    });
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

  taskMetadata?: Record<string, unknown> | null;
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

  taskMetadata?: Record<string, unknown> | null;
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

      const normalizedGoalId =
        request.goalId !== undefined && request.goalId !== null && String(request.goalId).trim() !== ""
          ? String(request.goalId).trim()
          : null;

      // Enforce: non-admin/non-ceo cannot assign outside their department — except org performance tasks
      // mechanically linked to a goal (department breakdown often creates tasks from goals whose creator sits in another dept).
      const creatorRoleName = creator.role?.name?.toLowerCase?.() || '';
      const isPrivileged = creatorRoleName === 'admin' || creatorRoleName === 'ceo';
      if (!isPrivileged && teamUserIds.length > 0 && !normalizedGoalId) {
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
      const hasLinkedGoal = Boolean(normalizedGoalId);
      // Linked project tasks should roll up to the goal by default (B.17 / Project Velocity); opt out with isPerformanceTask: false.
      const normalizedIsPerformanceTask = hasLinkedGoal ? request.isPerformanceTask !== false : false;

      const breakdownLogTag = "[performance-breakdown:individuals]";
      if (normalizedIsPerformanceTask && normalizedGoalId) {
        console.log(
          breakdownLogTag,
          "TaskService.createTask (performance path)",
          JSON.stringify({
            createdBy,
            goalId: normalizedGoalId,
            teamUserIds,
            department: request.department ?? null,
            titlePreview: request.title ? String(request.title).slice(0, 100) : null,
            hasKpiPayload: Boolean(request.kpi?.id),
            targetValue: request.targetValue ?? null
          })
        );
      }

      // Validate goal if provided
      if (normalizedGoalId) {
        const goal = await prisma.performanceGoal.findUnique({
          where: { id: normalizedGoalId }
        });

        if (!goal) {
          if (request.isPerformanceTask) {
            console.error(breakdownLogTag, "createTask abort: Performance goal not found", normalizedGoalId);
          }
          throw new Error("Performance goal not found");
        }
        if (String(goal.status).toLowerCase() !== "active") {
          if (request.isPerformanceTask) {
            console.error(
              breakdownLogTag,
              "createTask abort: goal not active",
              JSON.stringify({ goalId: normalizedGoalId, status: goal.status, type: goal.type })
            );
          }
          throw new Error("Cannot link tasks to a goal until the goal is active.");
        }
        if (normalizedIsPerformanceTask && normalizedGoalId) {
          console.log(
            breakdownLogTag,
            "linked goal validation OK",
            JSON.stringify({ goalId: goal.id, type: goal.type, status: goal.status })
          );
        }
      }

      // Validate KPI if provided
      let kpiData = null;
      if (request.kpi && request.kpi.id) {
        const kpiRecord = await prisma.kPI.findUnique({
          where: { id: request.kpi.id }
        });

        if (!kpiRecord) {
          if (request.isPerformanceTask) {
            console.error(breakdownLogTag, "createTask abort: KPI not found", request.kpi.id);
          }
          throw new Error("KPI not found");
        }

        kpiData = {
          id: request.kpi.id,
          name: request.kpi.name || kpiRecord.name,
          unitCategory: request.kpi.unitCategory || kpiRecord.unitCategory,
          unitSymbol: request.kpi.unitSymbol || kpiRecord.unitSymbol,
          unitPosition: request.kpi.unitPosition || kpiRecord.unitPosition
        };
      }

      const teamCount = Array.isArray(request.team) ? request.team.length : 0;
      // Create activity log
      const activity = {
        type: "todo",
        activity: `New task has been assigned to you${teamCount > 1 ? ` and ${teamCount - 1} others` : ''}. The task priority is set as ${request.priority || 'medium'} priority, so check and act accordingly. The task date is ${new Date(request.date).toDateString()}. Thank you!!!`,
        date: new Date(),
        by: createdBy
      };
      const dueDate = new Date(request.date);
      const { stage: stageNorm, ...overdueFields } = resolveTaskStageAndOverdueFields(
        request.stage || "todo",
        dueDate
      );

      // Create the task
      const task = await prisma.task.create({
        data: {
          title: request.title,
          description: request.description,
          team: request.team,
          stage: stageNorm,
          status: stageNorm,
          date: request.date,
          priority: (request.priority || "medium").toLowerCase(),
          assets: request.assets,
          branch: request.branch,
          department: request.department,
          ruleset: request.ruleset,
          applicationId: request.applicationId,
          fromDueDiligence: request.fromDueDiligence ?? false,
          category: request.category,
          ...(request.taskMetadata != null ? { taskMetadata: request.taskMetadata as object } : {}),
          
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
              type: true
            }
          }
        }
      });

      await notifyTaskAssignments(
        task.id,
        task.title,
        Array.isArray(request.team) ? request.team : [],
        task.applicationId
      );
      await TaskCollaborationService.createSystemMessage({
        taskId: task.id,
        actorId: createdBy,
        content: "created this task.",
        eventType: "TASK_CREATED"
      });

      const [taskWithApplication] = await attachApplicationDataToTasks([task]);
      if (normalizedIsPerformanceTask && normalizedGoalId) {
        console.log(
          breakdownLogTag,
          "TaskService.createTask persisted",
          JSON.stringify({ taskId: task.id, goalId: normalizedGoalId })
        );
      }
      return taskWithApplication;
    } catch (error) {
      if (request.isPerformanceTask || request.goalId) {
        console.error(
          "[performance-breakdown:individuals]",
          "TaskService.createTask error",
          error instanceof Error ? error.message : error
        );
      }
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
          unitCategory: request.kpi.unitCategory || kpiRecord.unitCategory,
          unitSymbol: request.kpi.unitSymbol || kpiRecord.unitSymbol,
          unitPosition: request.kpi.unitPosition || kpiRecord.unitPosition
        };
      }

      const nextGoalId =
        request.goalId === undefined
          ? existingTask.goalId
          : request.goalId === null || String(request.goalId).trim() === ""
            ? null
            : String(request.goalId).trim();

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
        const bypassDeptForPerfGoal = Boolean(nextGoalId);
        if (!isPrivileged && teamUserIds.length > 0 && !bypassDeptForPerfGoal) {
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
      const requestedStage = request.stage ?? existingTask.stage;
      const { stage: effectiveStageNorm, ...overdueFields } = resolveTaskStageAndOverdueFields(
        requestedStage,
        effectiveDueDate,
        {
          stage: existingTask.stage,
          isOverdue: existingTask.isOverdue,
          originalStage: existingTask.originalStage
        }
      );
      const hasLinkedGoal = Boolean(nextGoalId);
      const nextIsPerformanceTask =
        request.isPerformanceTask !== undefined
          ? request.isPerformanceTask
          : existingTask.goalId
            ? existingTask.isPerformanceTask
            : true;
      const normalizedIsPerformanceTask = hasLinkedGoal ? Boolean(nextIsPerformanceTask) : false;

      if (nextGoalId) {
        const linkedGoal = await prisma.performanceGoal.findUnique({
          where: { id: nextGoalId }
        });
        if (!linkedGoal) {
          throw new Error("Performance goal not found");
        }
        if (String(linkedGoal.status).toLowerCase() !== "active") {
          throw new Error("Cannot link tasks to a goal until the goal is active.");
        }
      }

      // Update the task
      const updatedTask = await prisma.task.update({
        where: { id },
        data: {
          ...(request.title && { title: request.title }),
          ...(request.description !== undefined && { description: request.description }),
          ...(request.team && { team: request.team }),
          ...((request.stage !== undefined ||
            request.date !== undefined ||
            effectiveStageNorm !== normaliseTaskStage(existingTask.stage) ||
            overdueFields.isOverdue !== Boolean(existingTask.isOverdue)) && {
            stage: effectiveStageNorm,
            status: effectiveStageNorm
          }),
          ...(request.date && { date: request.date }),
          ...(request.priority && { priority: request.priority.toLowerCase() }),
          ...(request.assets !== undefined && { assets: request.assets }),
          ...(request.branch !== undefined && { branch: request.branch }),
          ...(request.department !== undefined && { department: request.department }),
          ...(request.category !== undefined && { category: request.category }),
          ...(request.ruleset !== undefined && { ruleset: request.ruleset }),
          ...(request.applicationId !== undefined && { applicationId: request.applicationId }),
          ...(request.fromDueDiligence !== undefined && { fromDueDiligence: request.fromDueDiligence }),
          ...(request.taskMetadata !== undefined && { taskMetadata: request.taskMetadata as object }),
          
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
              type: true
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
        await notifyTaskAssignments(updatedTask.id, updatedTask.title, newAssignees, updatedTask.applicationId);
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
        updateData.monetaryValueAchieved = addMonetaryAchieved(
          task.monetaryValueAchieved,
          achievements.monetaryValueAchieved
        );
      }

      if (achievements.percentValueAchieved !== undefined) {
        updateData.percentValueAchieved = addPercentAchieved(
          task.percentValueAchieved,
          achievements.percentValueAchieved
        );
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
              type: true
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
            type: true
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
      if (!kpiTracksPercentAchievement(task.kpi) && activity.monetaryValueAchieved != null) {
        const increment = Number(activity.monetaryValueAchieved);
        if (!Number.isFinite(increment)) {
          throw new Error("monetaryValueAchieved must be a number");
        }
        activityData.collectedMonetary = increment;
        const newAchieved = addMonetaryAchieved(task.monetaryValueAchieved, increment);
        updateData.monetaryValueAchieved = newAchieved;
        updateData.stage = resolveTaskStageFromAchievement(
          newAchieved,
          task.monetaryValue,
          task.stage
        );
      } else if (kpiTracksPercentAchievement(task.kpi) && activity.percentValueAchieved != null) {
        const increment = parseMonetaryAmount(activity.percentValueAchieved);
        activityData.collectedPercent = increment;
        const newPercent = addPercentAchieved(task.percentValueAchieved, increment);
        updateData.percentValueAchieved = newPercent;
        
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
              type: true
            }
          }
        }
      });

      if (updatedTask.goalId) {
        const increment =
          activity.monetaryValueAchieved != null && !kpiTracksPercentAchievement(task.kpi)
            ? Number(activity.monetaryValueAchieved)
            : activity.percentValueAchieved != null && kpiTracksPercentAchievement(task.kpi)
              ? Number(activity.percentValueAchieved)
              : undefined;
        const syncContext = {
          goalId: updatedTask.goalId,
          actorId: activity.userId,
          activityIncrement: Number.isFinite(increment) ? increment : undefined,
          newGoalCurrent:
            updateData.monetaryValueAchieved != null
              ? Number(updateData.monetaryValueAchieved)
              : updateData.percentValueAchieved != null
                ? Number(updateData.percentValueAchieved)
                : undefined,
          taskStage: updateData.stage ?? updatedTask.stage
        };
        setImmediate(() => {
          void this.syncGoalProgressFromTaskComputation(
            syncContext.goalId,
            updatedTask.id,
            syncContext.actorId,
            syncContext.activityIncrement,
            syncContext
          ).catch((err) =>
            console.error(`Background goal sync failed for task ${updatedTask.id}:`, err)
          );
        });
      }

      const [taskWithApplication] = await attachApplicationDataToTasks([updatedTask], { minimal: true });
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
        // `isOverdue` can be stored or derived from due date (some environments don't run overdue flagging).
        // When filtering for overdue=true, include tasks whose due date has passed (and are not completed),
        // in addition to tasks explicitly marked isOverdue=true.
        if (filters.isOverdue === true) {
          const now = new Date();
          where.AND = where.AND || [];
          where.AND.push({
            OR: [
              { isOverdue: true },
              {
                AND: [
                  { date: { lt: now } },
                  { stage: { notIn: ["completed"] } }
                ]
              }
            ]
          });
        } else {
          where.isOverdue = filters.isOverdue;
        }
      }

      if (filters.fromDueDiligence !== undefined) {
        where.fromDueDiligence = filters.fromDueDiligence;
      }

      if (filters.applicationId) {
        where.applicationId = filters.applicationId;
      }

      if (filters.category) {
        where.category = filters.category as string;
      }

      if (filters.search) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { stage: { contains: filters.search, mode: 'insensitive' } },
            { priority: { contains: filters.search, mode: 'insensitive' } }
          ]
        });
      }

      const tasks = await prisma.task.findMany({
        where,
        select: TASK_LIST_SELECT,
        orderBy: {
          createdAt: "desc"
        }
      });

      return attachApplicationDataToTasks(tasks, { minimal: true });
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
        // `isOverdue` can be stored or derived from due date (some environments don't run overdue flagging).
        // When filtering for overdue=true, include tasks whose due date has passed (and are not completed),
        // in addition to tasks explicitly marked isOverdue=true.
        if (filters.isOverdue === true) {
          const now = new Date();
          where.AND = where.AND || [];
          where.AND.push({
            OR: [
              { isOverdue: true },
              {
                AND: [
                  { date: { lt: now } },
                  { stage: { notIn: ["completed"] } }
                ]
              }
            ]
          });
        } else {
          where.isOverdue = filters.isOverdue;
        }
      }

      if (filters.fromDueDiligence !== undefined) {
        where.fromDueDiligence = filters.fromDueDiligence;
      }

      if (filters.applicationId) {
        where.applicationId = filters.applicationId;
      }

      if (filters.category) {
        where.category = filters.category as string;
      }

      if (filters.search) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { stage: { contains: filters.search, mode: 'insensitive' } },
            { priority: { contains: filters.search, mode: 'insensitive' } }
          ]
        });
      }

      const tasks = await prisma.task.findMany({
        where,
        select: TASK_LIST_SELECT,
        orderBy: {
          createdAt: "desc"
        }
      });

      return attachApplicationDataToTasks(tasks, { minimal: true });
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
              type: true
            }
          }
        }
      });

      if (!task) {
        throw new Error("Task not found");
      }

      const wasPersistedRed =
        Boolean(task.isOverdue) ||
        normaliseTaskStage(task.stage) === "red" ||
        normaliseTaskStage(task.stage) === "overdue";
      if (isRedZoneTask(task) && !wasPersistedRed && !task.isTrashed) {
        const st = normaliseTaskStage(task.stage);
        const overdueFields =
          st === "completed"
            ? { isOverdue: false, overdueStatus: null, originalStage: null }
            : {
                isOverdue: true,
                originalStage: task.stage,
                overdueStatus: `overdue_${st}`
              };
        const updatedTask = await prisma.task.update({
          where: { id },
          data: {
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
                type: true
              }
            }
          }
        });
        await TaskCollaborationService.notifyTaskRedZone({
          task: updatedTask,
          reason: "The due date has passed and the task now requires immediate attention."
        });
        const [taskWithApplication] = await attachApplicationDataToTasks([updatedTask]);
        return taskWithApplication;
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
  static async updateLinkedGoalProgress(
    taskId: string,
    actorId?: string,
    activityIncrement?: number
  ): Promise<void> {
    try {
      console.log(`🔄 Updating linked goal progress for task: ${taskId}`);

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
          goalId: true,
          createdBy: true
        }
      });

      if (!task?.goalId) {
        console.log(`⚠️ Task ${taskId} is not linked to a goal`);
        return;
      }

      await this.syncGoalProgressFromTaskComputation(
        task.goalId,
        taskId,
        actorId || task.createdBy,
        activityIncrement
      );
    } catch (error) {
      console.error("❌ Error updating linked goal progress:", error);
      throw error;
    }
  }

  /** Derive goal current from linked tasks (monetary sum or average task % × target). */
  static computeGoalCurrentFromTasks(goal: { targetValue?: unknown }, linkedTasks: any[]): number {
    const hasMonetaryTasks = linkedTasks.some((t) => {
      const mv = Number(t.monetaryValue ?? 0);
      return Number.isFinite(mv) && mv > 0;
    });
    if (hasMonetaryTasks) {
      const sum = linkedTasks.reduce((s, t) => {
        return s + parseMonetaryAmount(t.monetaryValueAchieved);
      }, 0);
      return Math.max(0, sum);
    }
    const targetNum = goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0;
    const averageProgress =
      linkedTasks.length > 0
        ? linkedTasks.reduce((sum, t) => sum + computeTaskPercentage(t), 0) / linkedTasks.length
        : 0;
    return targetNum > 0 ? (targetNum * averageProgress) / 100 : averageProgress;
  }

  static async syncGoalProgressFromTaskComputation(
    goalId: string,
    taskId: string | null,
    actorId: string,
    activityIncrement?: number,
    fastPath?: {
      newGoalCurrent?: number;
      taskStage?: string;
    }
  ) {
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: goalId },
      include: { kpi: { select: { id: true, accountType: true } } }
    });
    if (!goal) {
      throw new Error("Linked performance goal not found");
    }

    let linkedTasks: Array<{ stage?: string | null; monetaryValueAchieved?: unknown }> = [];
    let newCurrentValue: number;

    if (typeof fastPath?.newGoalCurrent === "number" && Number.isFinite(fastPath.newGoalCurrent)) {
      newCurrentValue = fastPath.newGoalCurrent;
    } else {
      linkedTasks = await prisma.task.findMany({
        where: { goalId, isTrashed: false },
        select: { stage: true, monetaryValueAchieved: true, monetaryValue: true, percentValueAchieved: true, percentValue: true, kpi: true }
      });
      newCurrentValue = this.computeGoalCurrentFromTasks(goal, linkedTasks);
    }

    const increment =
      typeof activityIncrement === "number" && Number.isFinite(activityIncrement)
        ? activityIncrement
        : newCurrentValue - parseGoalCurrentAndTargetForAnalytics(goal).current;

    const progressState = deriveGoalProgressState({
      currentValue: newCurrentValue,
      targetValue: goal.targetValue,
      targetOperator: goal.targetOperator,
      isReverseKpi: goal.isReverseKpi,
      previousStage: goal.stage,
      progressPercentage: goal.progressPercentage
    });

    const taskInProgress =
      fastPath?.taskStage === "in_progress" ||
      linkedTasks.some((t) => t.stage === "in_progress");
    const averageProgress =
      linkedTasks.length > 0
        ? linkedTasks.reduce((sum, t) => sum + computeTaskPercentage(t), 0) / linkedTasks.length
        : fastPath?.taskStage === "completed"
          ? 100
          : 0;
    const isCompleted = progressState.isTargetMet || averageProgress >= 100;

    const updatedGoal = await prisma.performanceGoal.update({
      where: { id: goal.id },
      data: {
        currentValue: newCurrentValue,
        preciseCurrentValue: String(newCurrentValue),
        progressPercentage: progressState.progressPercentage,
        status: progressState.isTargetMet || averageProgress >= 100 ? "completed" : progressState.status,
        stage: isCompleted
          ? "completed"
          : taskInProgress || newCurrentValue > 0
            ? "in_progress"
            : progressState.stage,
        ...legacyProgressFieldsForGoal(goal, newCurrentValue),
        updatedAt: new Date()
      }
    });

    const rollupAndJournal = async () => {
      const [{ companyGoalId, companyGoal }] = await Promise.all([
        PerformanceGoalService.rollupParentChainFromLeaf(goalId),
        Math.abs(increment) >= 0.0005 && taskId
          ? PerformanceGoalProgressEventService.recordEvent({
              goalId,
              amount: increment,
              source: "task",
              sourceRef: taskId,
              createdById: actorId || goal.createdById,
              skipRecompute: true
            })
          : Promise.resolve(null)
      ]);

      if (Math.abs(increment) >= 0.0005 && taskId) {
        await PerformanceGoalProgressBridge.postCompanyJournalForTaskIncrement({
          leafGoalId: goalId,
          increment,
          taskId,
          actorId: actorId || goal.createdById,
          companyGoalId,
          preloadedCompanyGoal: companyGoal
        });
      }
    };

    await rollupAndJournal();

    return updatedGoal;
  }

  static async recalculateGoalProgressFromTasks(goalId: string) {
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: goalId },
      select: { createdById: true }
    });
    if (!goal) {
      throw new Error("Linked performance goal not found");
    }
    return this.syncGoalProgressFromTaskComputation(goalId, null, goal.createdById);
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
      const goalAfter = await this.recalculateGoalProgressFromTasks(goalId);
      if (goalAfter.kpiId) {
        try {
          const { PerformanceGoalService } = await import("./PerformanceGoalService");
          await PerformanceGoalService.recalculateKPIProgress(goalAfter.kpiId);
        } catch (kpiErr) {
          console.error(`⚠️ KPI recalc after trash failed for kpi ${goalAfter.kpiId}:`, kpiErr);
        }
      }
      if (goalAfter.parentGoalId) {
        await this.updateParentGoalProgress(goalAfter.parentGoalId);
      }
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

  /** Soft-delete a task (UAT: remove card) and recompute linked goal rollups. */
  static async trashTask(taskId: string, updatedByUserId?: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, goalId: true, isTrashed: true }
    });
    if (!task) {
      throw new Error("Task not found");
    }
    if (task.isTrashed) {
      return {
        trashedTaskIds: [taskId],
        affectedGoalIds: task.goalId ? [task.goalId] : [],
        updatedByUserId: updatedByUserId || null,
        alreadyTrashed: true
      };
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { isTrashed: true, updatedAt: new Date() }
    });

    const goalIds = task.goalId ? [task.goalId] : [];
    for (const goalId of goalIds) {
      const goalAfter = await this.recalculateGoalProgressFromTasks(goalId);
      if (goalAfter.kpiId) {
        try {
          const { PerformanceGoalService } = await import("./PerformanceGoalService");
          await PerformanceGoalService.recalculateKPIProgress(goalAfter.kpiId);
        } catch (kpiErr) {
          console.error(`⚠️ KPI recalc after trash failed for kpi ${goalAfter.kpiId}:`, kpiErr);
        }
      }
      if (goalAfter.parentGoalId) {
        await this.updateParentGoalProgress(goalAfter.parentGoalId);
      }
      try {
        const { RollupCalculationService } = await import("./RollupCalculationService");
        await RollupCalculationService.recalculateAllRollups(goalId);
      } catch (error) {
        console.error(`Failed to recalculate rollups for trashed-task goal ${goalId}:`, error);
      }
    }

    return {
      trashedTaskIds: [taskId],
      affectedGoalIds: goalIds,
      updatedByUserId: updatedByUserId || null
    };
  }

  /**
   * @deprecated Use PerformanceGoalService.updateParentGoalProgress directly.
   */
  static async updateParentGoalProgress(parentGoalId: string): Promise<void> {
    const { PerformanceGoalService } = await import("./PerformanceGoalService");
    await PerformanceGoalService.updateParentGoalProgress(parentGoalId);
  }

  static async triggerAccountingIntegration(_goalId: string, _achievedValue: number): Promise<void> {
    // Task-driven progress posts incremental PERF-GOAL journals via PerformanceGoalProgressBridge.
  }
}
