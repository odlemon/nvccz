// @ts-nocheck
import { randomUUID } from "crypto";
import { prisma } from "../../utils/database";

export class DealExecutionPackAuditService {
  static async log(packId: string, eventType: string, actorId: string, details?: Record<string, unknown>) {
    return prisma.dealExecutionPackAuditEvent.create({
      data: {
        id: randomUUID(),
        packId,
        eventType,
        actorId,
        details: details ?? undefined,
      },
    });
  }

  static async list(packId: string) {
    return prisma.dealExecutionPackAuditEvent.findMany({
      where: { packId },
      orderBy: { createdAt: "desc" },
    });
  }
}
