// @ts-nocheck
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";

const db = prisma as any;

export type OutboxEnqueueParams = {
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: string;
  payloadJson: Record<string, unknown>;
  headersJson?: Record<string, unknown> | null;
  idempotencyKey: string;
  availableAt?: Date;
  /** Optional Prisma transaction client */
  tx?: any;
};

export class InvestmentOutboxService {
  static async enqueue(params: OutboxEnqueueParams) {
    const client = params.tx || db;
    const existing = await client.investmentOutboxEvent.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) return existing;
    try {
      return await client.investmentOutboxEvent.create({
        data: {
          aggregateType: params.aggregateType,
          aggregateId: params.aggregateId,
          aggregateVersion: params.aggregateVersion,
          eventType: params.eventType,
          payloadJson: params.payloadJson,
          headersJson: params.headersJson ?? null,
          idempotencyKey: params.idempotencyKey,
          status: "PENDING",
          availableAt: params.availableAt ?? new Date(),
        },
      });
    } catch (error: any) {
      if (String(error?.code) === "P2002") {
        return client.investmentOutboxEvent.findUnique({
          where: { idempotencyKey: params.idempotencyKey },
        });
      }
      throw error;
    }
  }

  static async list(filters: {
    status?: string;
    aggregateType?: string;
    eventType?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(filters.pageSize) || 50));
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.aggregateType) where.aggregateType = filters.aggregateType;
    if (filters.eventType) where.eventType = filters.eventType;

    const [items, total] = await Promise.all([
      db.investmentOutboxEvent.findMany({
        where,
        orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.investmentOutboxEvent.count({ where }),
    ]);
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 0 };
  }

  /** Poll pending outbox rows for a worker/publisher. */
  static async pollPending(limit = 50) {
    const now = new Date();
    return db.investmentOutboxEvent.findMany({
      where: {
        status: "PENDING",
        availableAt: { lte: now },
      },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      take: Math.min(200, Math.max(1, limit)),
    });
  }

  static async markPublished(id: string) {
    const updated = await db.investmentOutboxEvent.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "PUBLISHED", publishedAt: new Date(), lastError: null },
    });
    if (updated.count !== 1) {
      throw new InvestmentOpsError("OUTBOX_EVENT_NOT_PENDING", "Outbox event is not pending", 409);
    }
    return db.investmentOutboxEvent.findUnique({ where: { id } });
  }

  static async markFailed(id: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return db.investmentOutboxEvent.update({
      where: { id },
      data: {
        attemptCount: { increment: 1 },
        lastError: message,
        availableAt: new Date(Date.now() + 5_000),
      },
    });
  }
}
