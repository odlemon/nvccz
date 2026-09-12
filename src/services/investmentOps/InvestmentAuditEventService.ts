// @ts-nocheck
import { createHash } from "crypto";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";

const db = prisma as any;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function hashPayload(parts: Record<string, unknown>): string {
  return createHash("sha256").update(stableStringify(parts)).digest("hex");
}

export type AppendAuditParams = {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  actorId?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  metadataJson?: Record<string, unknown> | null;
  /** Optional Prisma transaction client */
  tx?: any;
};

export class InvestmentAuditEventService {
  static async append(params: AppendAuditParams) {
    const client = params.tx || db;
    const latest = await client.investmentAuditEvent.findFirst({
      where: {
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
      },
      orderBy: { sequenceNo: "desc" },
    });
    const sequenceNo = (latest?.sequenceNo || 0) + 1;
    const previousHash = latest?.eventHash ?? null;
    const eventHash = hashPayload({
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      sequenceNo,
      eventType: params.eventType,
      actorId: params.actorId ?? null,
      correlationId: params.correlationId ?? null,
      requestId: params.requestId ?? null,
      beforeJson: params.beforeJson ?? null,
      afterJson: params.afterJson ?? null,
      metadataJson: params.metadataJson ?? null,
      previousHash,
    });

    try {
      return await client.investmentAuditEvent.create({
        data: {
          aggregateType: params.aggregateType,
          aggregateId: params.aggregateId,
          sequenceNo,
          eventType: params.eventType,
          actorId: params.actorId ?? null,
          correlationId: params.correlationId ?? null,
          requestId: params.requestId ?? null,
          beforeJson: params.beforeJson ?? null,
          afterJson: params.afterJson ?? null,
          metadataJson: params.metadataJson ?? null,
          previousHash,
          eventHash,
        },
      });
    } catch (error: any) {
      if (String(error?.code) === "P2002") {
        throw new InvestmentOpsError(
          "AUDIT_SEQUENCE_CONFLICT",
          "Concurrent audit append conflict; retry",
          409,
          null,
          true
        );
      }
      throw error;
    }
  }

  static async list(filters: {
    aggregateType?: string;
    aggregateId?: string;
    actorId?: string;
    eventType?: string;
    correlationId?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(filters.pageSize) || 50));
    const where: any = {};
    if (filters.aggregateType) where.aggregateType = filters.aggregateType;
    if (filters.aggregateId) where.aggregateId = filters.aggregateId;
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.eventType) where.eventType = filters.eventType;
    if (filters.correlationId) where.correlationId = filters.correlationId;

    const [items, total] = await Promise.all([
      db.investmentAuditEvent.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { sequenceNo: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.investmentAuditEvent.count({ where }),
    ]);
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 0 };
  }

  static async listForAggregate(aggregateType: string, aggregateId: string) {
    return db.investmentAuditEvent.findMany({
      where: { aggregateType, aggregateId },
      orderBy: { sequenceNo: "asc" },
    });
  }
}
