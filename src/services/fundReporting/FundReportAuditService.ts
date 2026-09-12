// @ts-nocheck
import { prisma } from "../../utils/database";

export class FundReportAuditService {
  static async log(params: {
    entityType: string;
    entityId: string;
    action: string;
    authorId: string;
    diffJson: Record<string, unknown>;
  }) {
    return prisma.fundReportAuditEvent.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        authorId: params.authorId,
        diffJson: params.diffJson,
      },
    });
  }

  static async listForEntity(entityType: string, entityId: string) {
    return prisma.fundReportAuditEvent.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
}
