import { prisma } from "../utils/database";

/**
 * SRD §12 decision capture: one row per approval decision with who acted, what they did, when, their comments, and the
 * record's status before and after. Rows are append-only (nothing here updates or deletes) and are read back as the
 * requisition's decision history, alongside the general audit trail.
 */
export type DecisionAction = "SUBMITTED" | "APPROVED" | "REJECTED" | "RETURNED" | "COMMENTED" | "DELEGATED" | "ESCALATED" | "RESUBMITTED";

export class ProcurementDecisionLogService {
  static async record(
    input: {
      entityType: string;
      entityId: string;
      requestId?: string | null;
      approvalId?: string | null;
      stepNumber?: number | null;
      stepName?: string | null;
      actorId?: string | null;
      onBehalfOfId?: string | null;
      action: DecisionAction;
      comments?: string | null;
      previousStatus?: string | null;
      resultingStatus?: string | null;
      detail?: Record<string, unknown> | null;
    },
    db: any = prisma
  ) {
    return db.procurementDecisionLog.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        approvalRequestId: input.requestId ?? null,
        approvalId: input.approvalId ?? null,
        stepNumber: input.stepNumber ?? null,
        stepName: input.stepName ?? null,
        actorId: input.actorId ?? null,
        onBehalfOfId: input.onBehalfOfId ?? null,
        action: input.action,
        comments: input.comments ? String(input.comments).slice(0, 4000) : null,
        previousStatus: input.previousStatus ?? null,
        resultingStatus: input.resultingStatus ?? null,
        detail: (input.detail ?? undefined) as any,
      },
    });
  }

  static async list(entityType: string, entityId: string) {
    const rows = await prisma.procurementDecisionLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "asc" },
    });
    const ids = [...new Set(rows.flatMap((r) => [r.actorId, r.onBehalfOfId]).filter(Boolean) as string[])];
    const users = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, email: true, roleCode: true } })
      : [];
    const who = (id: string | null) => {
      const u = users.find((x) => x.id === id);
      return u ? { id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email, email: u.email, roleCode: u.roleCode } : null;
    };
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      stepNumber: r.stepNumber,
      stepName: r.stepName,
      actor: who(r.actorId),
      onBehalfOf: who(r.onBehalfOfId),
      comments: r.comments,
      previousStatus: r.previousStatus,
      resultingStatus: r.resultingStatus,
      detail: r.detail,
      at: r.createdAt.toISOString(),
    }));
  }
}
