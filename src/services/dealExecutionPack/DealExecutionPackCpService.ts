// @ts-nocheck
import { randomUUID } from "crypto";
import { prisma } from "../../utils/database";
import { DealExecutionPackAccessService } from "./DealExecutionPackAccessService";
import { DealExecutionPackAuditService } from "./DealExecutionPackAuditService";
import { DealExecutionPackMetricsEngine } from "./DealExecutionPackMetricsEngine";
import {
  DEP_AUDIT_EVENTS,
  DEP_CP_STATUSES,
  DEP_PACK_STATUSES,
} from "./dealExecutionPackSupport";

export class DealExecutionPackCpService {
  static async refreshIcpPct(packId: string) {
    const cps = await prisma.dealExecutionPackCp.findMany({ where: { packId } });
    const icpPct = DealExecutionPackMetricsEngine.computeIcpPct(cps);
    await prisma.dealExecutionPack.update({
      where: { id: packId },
      data: { icpPct },
    });
    return icpPct;
  }

  static async list(packId: string) {
    return prisma.dealExecutionPackCp.findMany({
      where: { packId },
      orderBy: { createdAt: "asc" },
    });
  }

  static async create(
    packId: string,
    body: {
      description: string;
      weight?: number;
      priority?: string;
      verificationOwnerId?: string | null;
      documentId?: string | null;
    },
    actorId: string
  ) {
    const pack = await DealExecutionPackAccessService.getPack(packId);
    if (pack.status === DEP_PACK_STATUSES.EXECUTED) {
      throw Object.assign(new Error("Pack is executed and locked"), { statusCode: 400 });
    }
    const row = await prisma.dealExecutionPackCp.create({
      data: {
        id: randomUUID(),
        packId,
        description: body.description,
        weight: body.weight ?? 10,
        priority: body.priority ?? "MEDIUM",
        verificationOwnerId: body.verificationOwnerId ?? null,
        documentId: body.documentId ?? null,
        status: DEP_CP_STATUSES.PENDING,
      },
    });
    await DealExecutionPackCpService.refreshIcpPct(packId);
    return row;
  }

  static async update(
    packId: string,
    cpId: string,
    body: {
      description?: string;
      weight?: number;
      priority?: string;
      verificationOwnerId?: string | null;
      documentId?: string | null;
    }
  ) {
    const pack = await DealExecutionPackAccessService.getPack(packId);
    if (pack.status === DEP_PACK_STATUSES.EXECUTED) {
      throw Object.assign(new Error("Pack is executed and locked"), { statusCode: 400 });
    }
    const existing = await prisma.dealExecutionPackCp.findFirst({ where: { id: cpId, packId } });
    if (!existing) throw Object.assign(new Error("CP not found"), { statusCode: 404 });
    const row = await prisma.dealExecutionPackCp.update({
      where: { id: cpId },
      data: {
        description: body.description,
        weight: body.weight,
        priority: body.priority,
        verificationOwnerId: body.verificationOwnerId,
        documentId: body.documentId,
      },
    });
    await DealExecutionPackCpService.refreshIcpPct(packId);
    return row;
  }

  static async satisfy(packId: string, cpId: string, userId: string) {
    const pack = await DealExecutionPackAccessService.getPack(packId);
    if (pack.status === DEP_PACK_STATUSES.EXECUTED) {
      throw Object.assign(new Error("Pack is executed and locked"), { statusCode: 400 });
    }
    const cp = await prisma.dealExecutionPackCp.findFirst({ where: { id: cpId, packId } });
    if (!cp) throw Object.assign(new Error("CP not found"), { statusCode: 404 });
    if (cp.status === DEP_CP_STATUSES.SATISFIED) return cp;
    if (cp.verificationOwnerId && cp.verificationOwnerId !== userId) {
      throw Object.assign(new Error("Only the assigned verification owner may satisfy this CP"), {
        statusCode: 403,
      });
    }

    const row = await prisma.dealExecutionPackCp.update({
      where: { id: cpId },
      data: {
        status: DEP_CP_STATUSES.SATISFIED,
        satisfiedAt: new Date(),
        satisfiedById: userId,
      },
    });
    await DealExecutionPackCpService.refreshIcpPct(packId);
    await DealExecutionPackAuditService.log(packId, DEP_AUDIT_EVENTS.CP_SATISFIED, userId, { cpId });
    return row;
  }
}
