// @ts-nocheck

import { Prisma } from "@prisma/client";

import { prisma } from "../utils/database";

import { buildAuditPresentation } from "../utils/forecastAuditPresentation";

import { ForecastingAccessService } from "./ForecastingAccessService";

/** Analyst-facing audit list item — no internal ids or raw delta_payload. */
async function serializeAuditItem(row: any) {
  const presentation = await buildAuditPresentation({
    actionType: row.actionType,
    deltaPayload: row.deltaPayload,
    userId: row.userId,
    user: row.user
  });

  return {
    scenario_name: row.scenario?.name ?? null,
    action_type: row.actionType,
    action_label: presentation.action_label,
    summary: presentation.summary,
    actor_label: presentation.actor_label,
    created_at: row.createdAt.toISOString()
  };
}



export class ForecastingAuditService {

  static async log(

    tx: Prisma.TransactionClient | typeof prisma,

    input: {

      scenarioId: string;

      userId?: string | null;

      actionType: string;

      deltaPayload: Record<string, unknown>;

      priority?: string;

    }

  ) {

    return tx.forecastAuditLog.create({

      data: {

        scenarioId: input.scenarioId,

        userId: input.userId ?? null,

        actionType: input.actionType,

        deltaPayload: input.deltaPayload as Prisma.InputJsonValue,

        priority: input.priority || "NORMAL"

      }

    });

  }



  static async listScenarioAudit(

    scenarioId: string,

    query: {

      actionType?: string;

      priority?: string;

      from?: Date;

      to?: Date;

      page?: number;

      limit?: number;

    },

    user?: any

  ) {

    await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);

    const page = Math.max(1, query.page || 1);

    const limit = Math.min(100, Math.max(1, query.limit || 25));

    const where: any = { scenarioId };

    if (query.actionType) where.actionType = query.actionType;

    if (query.priority) where.priority = query.priority;

    if (query.from || query.to) {

      where.createdAt = {};

      if (query.from) where.createdAt.gte = query.from;

      if (query.to) where.createdAt.lte = query.to;

    }

    const [items, total] = await Promise.all([

      prisma.forecastAuditLog.findMany({

        where,

        orderBy: { createdAt: "desc" },

        skip: (page - 1) * limit,

        take: limit,

        include: {
          scenario: { select: { name: true } },
          user: { select: { firstName: true, lastName: true, email: true } }
        }

      }),

      prisma.forecastAuditLog.count({ where })

    ]);

    const serialized = await Promise.all(items.map(serializeAuditItem));

    return {

      items: serialized,

      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) || 1 }

    };

  }



  static async listAdminAudit(query: {

    actionType?: string;

    priority?: string;

    page?: number;

    limit?: number;

  }) {

    const page = Math.max(1, query.page || 1);

    const limit = Math.min(100, Math.max(1, query.limit || 25));

    const where: any = {};

    if (query.actionType) where.actionType = query.actionType;

    if (query.priority) where.priority = query.priority;

    const [items, total] = await Promise.all([

      prisma.forecastAuditLog.findMany({

        where,

        orderBy: { createdAt: "desc" },

        skip: (page - 1) * limit,

        take: limit,

        include: {

          scenario: { select: { id: true, name: true } },

          user: { select: { firstName: true, lastName: true, email: true } }

        }

      }),

      prisma.forecastAuditLog.count({ where })

    ]);

    const serialized = await Promise.all(items.map(serializeAuditItem));

    return {

      items: serialized,

      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) || 1 }

    };

  }

}

