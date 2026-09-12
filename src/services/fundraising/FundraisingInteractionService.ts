// @ts-nocheck
import { prisma } from "../../utils/database";

export class FundraisingInteractionService {
  static async list(dealId: string) {
    return prisma.pipelineInteraction.findMany({
      where: { dealId },
      orderBy: { occurredAt: "desc" },
    });
  }

  static async log(
    dealId: string,
    userId: string,
    body: {
      interactionType: string;
      subject?: string;
      body?: string;
      occurredAt?: string;
      metadata?: Record<string, unknown>;
      mailerBatchId?: string;
    }
  ) {
    const deal = await prisma.fundraisingPipelineDeal.findUnique({ where: { id: dealId } });
    if (!deal) throw Object.assign(new Error("Deal not found"), { statusCode: 404 });

    return prisma.pipelineInteraction.create({
      data: {
        dealId,
        interactionType: body.interactionType.toUpperCase(),
        subject: body.subject,
        body: body.body,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
        createdById: userId,
        mailerBatchId: body.mailerBatchId,
        metadata: body.metadata ?? undefined,
      },
    });
  }
}
