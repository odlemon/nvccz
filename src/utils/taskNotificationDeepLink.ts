// @ts-nocheck
import { buildTaskDeepLink } from "../services/TaskCollaborationService";

const TASK_NOTIFICATION_TYPES = new Set(["TASK_ASSIGNED", "TASK_MENTION", "TASK_RED_ZONE"]);

/**
 * E.10 — Ensure task notifications expose Kanban modal deep link fields for the client.
 * Merges stored JSON with defaults; uses relatedEntityId when legacy rows only had taskId at top level.
 */
export function mergeTaskNotificationData(
  type: string | null | undefined,
  data: unknown,
  relatedEntity: string | null | undefined,
  relatedEntityId: string | null | undefined
): unknown {
  if (!type || !TASK_NOTIFICATION_TYPES.has(type)) {
    return data ?? null;
  }

  const raw = data && typeof data === "object" && !Array.isArray(data) ? { ...(data as object) } : {};
  const taskId =
    (typeof raw.taskId === "string" && raw.taskId) ||
    (relatedEntity === "Task" && relatedEntityId) ||
    null;

  if (!taskId) {
    return Object.keys(raw).length ? raw : null;
  }

  const commentId = typeof raw.commentId === "string" ? raw.commentId : undefined;
  const base = buildTaskDeepLink(taskId, commentId);
  return { ...base, ...raw, taskId: base.taskId, path: raw.path || base.path, modalTarget: raw.modalTarget || base.modalTarget };
}
