// @ts-nocheck
import { randomUUID } from "crypto";
import { prisma } from "../../utils/database";

export class TaxReturnPackAuditService {
  static async log(packId: string, eventType: string, actorId: string, details?: Record<string, unknown>) {
    return prisma.taxReturnPackAuditEvent.create({
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
    return prisma.taxReturnPackAuditEvent.findMany({
      where: { packId },
      orderBy: { createdAt: "desc" },
    });
  }
}
