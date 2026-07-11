// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";

const DEFAULT_LINE_ITEMS = [
  { code: "REVENUE", name: "Revenue", lineItemType: "REVENUE", category: "REVENUE", sortOrder: 10 },
  { code: "COGS", name: "COGS", lineItemType: "EXPENSE", category: "EXPENSE", sortOrder: 20 },
  { code: "GROSS_PROFIT", name: "Gross Profit", lineItemType: "CALC", category: "REVENUE", sortOrder: 30, isEditable: false },
  { code: "SALARIES", name: "Salaries", lineItemType: "EXPENSE", category: "WORKFORCE", sortOrder: 40 },
  { code: "RENT", name: "Rent", lineItemType: "EXPENSE", category: "EXPENSE", sortOrder: 50 },
  { code: "MARKETING", name: "Marketing", lineItemType: "EXPENSE", category: "EXPENSE", sortOrder: 60 },
  { code: "EBITDA", name: "EBITDA", lineItemType: "CALC", category: "REVENUE", sortOrder: 70, isEditable: false },
  { code: "HEADCOUNT", name: "Headcount", lineItemType: "DRIVER", category: "WORKFORCE", dataType: "NUMBER", sortOrder: 80 },
  { code: "CLOSING_CASH", name: "Closing Cash", lineItemType: "CASH", category: "CASH", sortOrder: 90 },
];

function monthStarts(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cur <= last) {
    out.push(new Date(cur));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

export class FpaModelService {
  static async create(input: any, userId: string, ip?: string) {
    const name = String(input.name || input.modelName || "").trim();
    if (!name) throw new FpaError(400, "VALIDATION", "name is required");
    const startPeriod = new Date(input.startPeriod || input.start_period);
    const endPeriod = new Date(input.endPeriod || input.end_period);
    if (Number.isNaN(startPeriod.getTime()) || Number.isNaN(endPeriod.getTime())) {
      throw new FpaError(400, "VALIDATION", "startPeriod and endPeriod are required");
    }

    const model = await prisma.$transaction(async (tx) => {
      const created = await tx.planningModel.create({
        data: {
          name,
          modelType: String(input.modelType || input.model_type || "BUDGET"),
          description: input.description || null,
          ownerUserId: input.ownerUserId || userId,
          baseCurrency: String(input.baseCurrency || input.base_currency || "USD").toUpperCase().slice(0, 3),
          startPeriod,
          endPeriod,
          timeGranularity: String(input.timeGranularity || input.time_granularity || "MONTHLY"),
          status: "DRAFT",
          createdById: userId,
          updatedById: userId,
        },
      });

      const scenario = await tx.planningScenario.create({
        data: {
          modelId: created.id,
          name: "BASE",
          scenarioType: "BASE",
          isOfficial: true,
          status: "DRAFT",
          createdById: userId,
        },
      });

      const version = await tx.planningVersion.create({
        data: {
          modelId: created.id,
          name: "Working",
          status: "DRAFT",
          createdById: userId,
        },
      });

      const lineItems = [];
      for (const li of DEFAULT_LINE_ITEMS) {
        lineItems.push(
          await tx.planningLineItem.create({
            data: {
              modelId: created.id,
              code: li.code,
              name: li.name,
              lineItemType: li.lineItemType,
              category: li.category,
              dataType: li.dataType || "CURRENCY",
              isEditable: li.isEditable !== false,
              sortOrder: li.sortOrder,
            },
          })
        );
      }

      const periods = monthStarts(startPeriod, endPeriod);
      const cellRows = [];
      for (const li of lineItems) {
        for (const periodDate of periods) {
          cellRows.push({
            modelId: created.id,
            scenarioId: scenario.id,
            versionId: version.id,
            lineItemId: li.id,
            periodDate,
            currencyCode: created.baseCurrency,
            value: null,
            valueType: "INPUT",
            sourceType: "MANUAL",
            isEditable: li.isEditable,
            isLocked: false,
          });
        }
      }
      if (cellRows.length) {
        await tx.planningCell.createMany({ data: cellRows });
      }

      return { ...created, defaultScenarioId: scenario.id, defaultVersionId: version.id, lineItemCount: lineItems.length, cellCount: cellRows.length };
    });

    await FpaAuditService.log("MODEL_CREATE", userId, { modelId: model.id, ip });
    return model;
  }

  static async list(query: any = {}) {
    const where: any = {};
    if (query.status) where.status = String(query.status);
    if (query.ownerUserId) where.ownerUserId = String(query.ownerUserId);
    return prisma.planningModel.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { lineItems: true, scenarios: true, versions: true } },
      },
    });
  }

  static async get(modelId: string) {
    const model = await prisma.planningModel.findUnique({
      where: { id: modelId },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        scenarios: { orderBy: { createdAt: "asc" } },
        versions: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");
    return model;
  }

  static async update(modelId: string, input: any, userId: string, ip?: string) {
    await FpaModelService.get(modelId);
    const data: any = { updatedById: userId };
    if (input.name != null) data.name = String(input.name);
    if (input.description != null) data.description = input.description;
    if (input.modelType != null) data.modelType = String(input.modelType);
    if (input.baseCurrency != null) data.baseCurrency = String(input.baseCurrency).toUpperCase().slice(0, 3);
    if (input.status != null) data.status = String(input.status);
    if (input.startPeriod != null) data.startPeriod = new Date(input.startPeriod);
    if (input.endPeriod != null) data.endPeriod = new Date(input.endPeriod);
    if (input.timeGranularity != null) data.timeGranularity = String(input.timeGranularity);
    const updated = await prisma.planningModel.update({ where: { id: modelId }, data });
    await FpaAuditService.log("MODEL_UPDATE", userId, { modelId, ip });
    return updated;
  }

  static async archive(modelId: string, userId: string, ip?: string) {
    await FpaModelService.get(modelId);
    const updated = await prisma.planningModel.update({
      where: { id: modelId },
      data: { status: "ARCHIVED", updatedById: userId },
    });
    await FpaAuditService.log("MODEL_ARCHIVE", userId, { modelId, ip });
    return updated;
  }
}
