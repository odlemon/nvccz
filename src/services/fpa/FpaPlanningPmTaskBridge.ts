// @ts-nocheck
/**
 * Mirror Model Planning `PlanningTask` rows into Performance Management `Task`
 * so assignees see them on GET /api/tasks and GET /api/tasks/my.
 *
 * Create path is lean (direct prisma.task.create) — avoids TaskService.createTask
 * overhead (dept checks, collab system message, application attach) which was ~15s+
 * on remote MySQL when awaited on the request path.
 */
import { prisma } from "../../utils/database";
import { buildTaskDeepLink } from "../TaskCollaborationService";
import { emitToUsers } from "../RealtimeSocketService";

export const FPA_MODEL_PLANNING_PM_CATEGORY = "FPA_MODEL_PLANNING";

type BridgeTaskInput = {
  planningTaskId: string;
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  dueDate?: Date | string | null;
  priority?: string | null;
  status?: string | null;
  cycleId: string;
  cycleName?: string | null;
  modelId?: string | null;
  versionId?: string | null;
  taskKind: "OWNER_SLICE" | "PLANNING";
  createdById: string;
};

function mapPriority(p?: string | null): string {
  const v = String(p || "medium").toUpperCase();
  if (v === "HIGH") return "high";
  if (v === "LOW") return "low";
  return "medium";
}

function mapStage(status?: string | null): string {
  const s = String(status || "PENDING").toUpperCase();
  if (["COMPLETED", "DONE", "APPROVED", "SUBMITTED"].includes(s)) return "completed";
  if (["IN_PROGRESS", "RETURNED"].includes(s)) return "in_progress";
  if (["CANCELLED", "CANCELED"].includes(s)) return "completed";
  return "todo";
}

function resolveDueDate(due?: Date | string | null): Date {
  if (due) {
    const d = due instanceof Date ? due : new Date(due);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 14);
  return fallback;
}

function metadataOf(input: BridgeTaskInput) {
  return {
    sourceModule: "FPA_MODEL_PLANNING",
    planningTaskId: input.planningTaskId,
    cycleId: input.cycleId,
    cycleName: input.cycleName || null,
    modelId: input.modelId || null,
    versionId: input.versionId || null,
    taskKind: input.taskKind,
    departmentId: input.departmentId || null,
    path: `/fpa/model-planning/${input.cycleId}`,
  };
}

function notifyAssignedAsync(
  taskId: string,
  title: string,
  assigneeId: string,
  meta?: { cycleId?: string; path?: string | null }
) {
  const deepLink = {
    ...buildTaskDeepLink(taskId),
    cycleId: meta?.cycleId || null,
    path: meta?.path || buildTaskDeepLink(taskId).path,
    planningTaskId: taskId,
  };
  void prisma.notification
    .create({
      data: {
        title: "New task assigned",
        message: `Task "${title}" has been assigned to you.`,
        type: "TASK_ASSIGNED",
        userId: assigneeId,
        data: deepLink,
        relatedEntity: "Task",
        relatedEntityId: taskId,
      },
    })
    .then(() => {
      try {
        emitToUsers([assigneeId], "notification_created", { type: "TASK_ASSIGNED", ...deepLink });
      } catch {
        /* ignore */
      }
    })
    .catch((e) => console.error("FpaPlanningPmTaskBridge notify failed:", e));
}

export class FpaPlanningPmTaskBridge {
  static async findLinkedPmTaskId(planningTaskId: string): Promise<string | null> {
    const id = String(planningTaskId);
    try {
      const byPath = await prisma.task.findFirst({
        where: {
          isTrashed: false,
          category: FPA_MODEL_PLANNING_PM_CATEGORY,
          taskMetadata: { path: "$.planningTaskId", equals: id },
        },
        select: { id: true },
      });
      if (byPath) return byPath.id;
    } catch {
      /* fall through */
    }
    return null;
  }

  /**
   * Fast create (or update stage/team if already linked). Never throws into callers.
   * Pass `skipLookup: true` for brand-new planningTaskIds (create path).
   */
  static async upsertFromPlanningTask(
    input: BridgeTaskInput & { skipLookup?: boolean }
  ): Promise<{ id: string } | null> {
    try {
      if (!input.planningTaskId || !input.createdById || !input.assigneeId) return null;

      const due = resolveDueDate(input.dueDate);
      const priority = mapPriority(input.priority);
      const stage = mapStage(input.status);
      const description =
        input.description ||
        (input.cycleName
          ? `${input.taskKind === "OWNER_SLICE" ? "Department plan" : "Planning task"} for ${input.cycleName}`
          : null);
      const meta = metadataOf(input);
      const team = [String(input.assigneeId)];

      if (!input.skipLookup) {
        const existingId = await FpaPlanningPmTaskBridge.findLinkedPmTaskId(input.planningTaskId);
        if (existingId) {
          const existing = await prisma.task.findUnique({
            where: { id: existingId },
            select: { team: true },
          });
          const prevTeam = Array.isArray(existing?.team) ? (existing!.team as string[]) : [];
          const assigneeChanged = !prevTeam.includes(String(input.assigneeId));
          await prisma.task.update({
            where: { id: existingId },
            data: {
              title: input.title,
              description,
              team,
              date: due,
              priority,
              stage,
              status: stage,
              department: input.departmentName || null,
              taskMetadata: meta,
            },
          });
          if (assigneeChanged && input.assigneeId !== input.createdById) {
            notifyAssignedAsync(existingId, input.title, String(input.assigneeId), {
              cycleId: input.cycleId,
              path: `/fpa/model-planning/${input.cycleId}`,
            });
          }
          return { id: existingId };
        }
      }

      const created = await prisma.task.create({
        data: {
          title: input.title,
          description,
          team,
          stage,
          status: stage,
          date: due,
          priority,
          department: input.departmentName || null,
          category: FPA_MODEL_PLANNING_PM_CATEGORY,
          isPerformanceTask: false,
          taskMetadata: meta,
          createdBy: input.createdById,
          activities: [],
        },
        select: { id: true },
      });

      notifyAssignedAsync(created.id, input.title, String(input.assigneeId), {
        cycleId: input.cycleId,
        path: `/fpa/model-planning/${input.cycleId}`,
      });
      return created;
    } catch (e) {
      console.error("FpaPlanningPmTaskBridge.upsertFromPlanningTask failed:", e);
      return null;
    }
  }

  static async syncStatus(planningTaskId: string, status: string) {
    try {
      const existingId = await FpaPlanningPmTaskBridge.findLinkedPmTaskId(planningTaskId);
      if (!existingId) return null;
      const stage = mapStage(status);
      await prisma.task.update({
        where: { id: existingId },
        data: { stage, status: stage },
      });
      return { id: existingId };
    } catch (e) {
      console.error("FpaPlanningPmTaskBridge.syncStatus failed:", e);
      return null;
    }
  }

  static async trashLinked(planningTaskId: string) {
    try {
      const existingId = await FpaPlanningPmTaskBridge.findLinkedPmTaskId(planningTaskId);
      if (!existingId) return;
      await prisma.task.update({
        where: { id: existingId },
        data: { isTrashed: true, stage: "completed", status: "completed" },
      });
    } catch (e) {
      console.error("FpaPlanningPmTaskBridge.trashLinked failed:", e);
    }
  }
}
