// @ts-nocheck
import { buildTaskDeepLink } from "../services/TaskCollaborationService";
import { buildDealCollaborationDeepLink } from "../services/DealCollaborationService";

const TASK_NOTIFICATION_TYPES = new Set(["TASK_ASSIGNED", "TASK_MENTION", "TASK_RED_ZONE"]);

/**
 * E.10 — Task + portfolio deal feed notifications: normalize deep-link fields for the client.
 */
export function mergeTaskNotificationData(
  type: string | null | undefined,
  data: unknown,
  relatedEntity: string | null | undefined,
  relatedEntityId: string | null | undefined
): unknown {
  const raw = data && typeof data === "object" && !Array.isArray(data) ? { ...(data as object) } : {};

  if (type === "DEAL_MENTION") {
    const dealId =
      (typeof raw.dealId === "string" && raw.dealId) ||
      (relatedEntity === "Application" && relatedEntityId) ||
      null;
    if (!dealId) {
      return Object.keys(raw).length ? raw : null;
    }
    const commentId = typeof raw.commentId === "string" ? raw.commentId : undefined;
    const base = buildDealCollaborationDeepLink(dealId, commentId);
    return {
      ...base,
      ...raw,
      dealId: base.dealId,
      path: raw.path || base.path,
      modalTarget: raw.modalTarget || base.modalTarget
    };
  }

  if (!type || !TASK_NOTIFICATION_TYPES.has(type)) {
    return data ?? null;
  }
  const taskId =
    (typeof raw.taskId === "string" && raw.taskId) ||
    (relatedEntity === "Task" && relatedEntityId) ||
    null;

  if (!taskId) {
    return Object.keys(raw).length ? raw : null;
  }

  const commentId = typeof raw.commentId === "string" ? raw.commentId : undefined;
  const dealId = typeof raw.dealId === "string" && raw.dealId ? raw.dealId : undefined;
  const base = buildTaskDeepLink(taskId, commentId, dealId);
  return { ...base, ...raw, taskId: base.taskId, path: raw.path || base.path, modalTarget: raw.modalTarget || base.modalTarget };
}
