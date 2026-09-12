// @ts-nocheck
import { prisma } from "../../utils/database";
import {
  emitToUsers,
  emitToLpPortalClient,
  emitToLpThread,
  emitToLpRequest,
} from "../RealtimeSocketService";

export class LpPortalRealtimeService {
  /** All active LP portal user ids for an investor organisation. */
  static async clientUserIds(clientId: string): Promise<string[]> {
    const rows = await prisma.lpUserRelation.findMany({
      where: { clientId, isActive: true },
      select: { userId: true },
    });
    return [...new Set(rows.map((r) => r.userId).filter(Boolean))];
  }

  static emitToClient(clientId: string, event: string, payload: unknown) {
    emitToLpPortalClient(clientId, event, payload);
  }

  static async emitNoticeUpdated(
    clientId: string,
    notice: { id: string; title?: string; status?: string; fundId?: string | null; fundName?: string | null }
  ) {
    const payload = {
      type: "NOTICE",
      noticeId: notice.id,
      title: notice.title,
      status: notice.status,
      fundId: notice.fundId ?? null,
      fundName: notice.fundName ?? null,
      href: `/lp-portal/notices?id=${notice.id}`,
      at: new Date().toISOString(),
    };
    this.emitToClient(clientId, "lp_notice_updated", payload);
    await this.pushUserNotifications(clientId, payload, "lp_notification");
  }

  static async emitRequestCreated(clientId: string, request: Record<string, unknown>, actorUserId?: string) {
    const payload = {
      type: "REQUEST",
      requestId: request.id,
      reference: request.reference,
      subject: request.subject,
      status: request.status,
      priority: request.priority,
      fundId: request.fundId ?? null,
      fundName: request.fundName ?? null,
      href: `/lp-portal/requests?ref=${request.reference}`,
      at: new Date().toISOString(),
    };
    this.emitToClient(clientId, "lp_request_created", { request, ...payload });
    if (request.reference) {
      emitToLpRequest(String(request.reference), "lp_request_created", { request, ...payload });
    }
    await this.pushUserNotifications(clientId, payload, "lp_notification", actorUserId);
  }

  static async emitRequestMessage(
    clientId: string,
    reference: string,
    message: Record<string, unknown>,
    actorUserId?: string
  ) {
    const payload = {
      type: "REQUEST_MESSAGE",
      reference,
      message,
      href: `/lp-portal/requests?ref=${reference}`,
      at: new Date().toISOString(),
    };
    emitToLpRequest(reference, "lp_request_message", payload);
    this.emitToClient(clientId, "lp_request_updated", payload);
    await this.pushUserNotifications(
      clientId,
      {
        type: "REQUEST",
        title: `New message on request ${reference}`,
        href: payload.href,
        reference,
        at: payload.at,
      },
      "lp_notification",
      actorUserId
    );
  }

  static emitRequestUpdated(clientId: string, reference: string, patch: Record<string, unknown>) {
    const payload = { reference, ...patch, at: new Date().toISOString() };
    emitToLpRequest(reference, "lp_request_updated", payload);
    this.emitToClient(clientId, "lp_request_updated", payload);
  }

  static async emitThreadMessage(
    clientId: string,
    threadId: string,
    message: Record<string, unknown>,
    thread?: { subject?: string; fundName?: string | null },
    actorUserId?: string
  ) {
    const payload = {
      type: "THREAD_MESSAGE",
      threadId,
      subject: thread?.subject,
      fundName: thread?.fundName ?? null,
      message,
      href: `/lp-portal/requests-messages?thread=${threadId}`,
      at: new Date().toISOString(),
    };
    emitToLpThread(threadId, "lp_thread_message", payload);
    this.emitToClient(clientId, "lp_thread_updated", payload);
    await this.pushUserNotifications(
      clientId,
      {
        type: "MESSAGE",
        title: thread?.subject ? `New message: ${thread.subject}` : "New portal message",
        href: payload.href,
        threadId,
        at: payload.at,
      },
      "lp_notification",
      actorUserId
    );
  }

  static emitThreadRead(clientId: string, threadId: string, markedRead: number) {
    const payload = { threadId, markedRead, at: new Date().toISOString() };
    emitToLpThread(threadId, "lp_thread_read", payload);
    this.emitToClient(clientId, "lp_thread_read", payload);
  }

  /** Per-user topbar invalidation (excludes actor). */
  static async pushUserNotifications(
    clientId: string,
    item: Record<string, unknown>,
    event = "lp_notification",
    excludeUserId?: string
  ) {
    let userIds = await this.clientUserIds(clientId);
    if (excludeUserId) userIds = userIds.filter((id) => id !== excludeUserId);
    if (!userIds.length) return;
    emitToUsers(userIds, event, item);
  }
}
