// @ts-nocheck
/** CRUD for Performance <-> FP&A Target Mapping and Driver Mapping (SRD-4 §22). */
import { prisma } from "../utils/database";
import { FpaError } from "./fpa/FpaError";

export class PerformanceFpaMappingService {
  static async listTargetMappings(query: any = {}) {
    const where: any = {};
    if (query.kpiId) where.kpiId = String(query.kpiId);
    if (query.modelId) where.modelId = String(query.modelId);
    const rows = await prisma.performanceFpaTargetMapping.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    const [kpis, models, lineItems, versions] = await Promise.all([
      prisma.kPI.findMany({ where: { id: { in: rows.map((r) => r.kpiId) } }, select: { id: true, name: true } }),
      prisma.planningModel.findMany({ where: { id: { in: rows.map((r) => r.modelId) } }, select: { id: true, name: true } }),
      prisma.planningLineItem.findMany({ where: { id: { in: rows.map((r) => r.lineItemId) } }, select: { id: true, name: true, code: true } }),
      prisma.planningVersion.findMany({ where: { id: { in: rows.map((r) => r.targetSourceVersionId).filter(Boolean) } }, select: { id: true, name: true } }),
    ]);
    const byId = (list: any[]) => Object.fromEntries(list.map((x) => [x.id, x]));
    const kpiById = byId(kpis);
    const modelById = byId(models);
    const lineItemById = byId(lineItems);
    const versionById = byId(versions);
    return rows.map((r) => ({
      ...r,
      kpiName: kpiById[r.kpiId]?.name || null,
      modelName: modelById[r.modelId]?.name || null,
      lineItemName: lineItemById[r.lineItemId]?.name || null,
      lineItemCode: lineItemById[r.lineItemId]?.code || null,
      targetSourceVersionName: r.targetSourceVersionId ? versionById[r.targetSourceVersionId]?.name || null : null,
    }));
  }

  static async createTargetMapping(body: any, userId: string) {
    if (!body.kpiId || !body.modelId || !body.lineItemId) {
      throw new FpaError(400, "VALIDATION", "kpiId, modelId, and lineItemId are required");
    }
    const [kpi, model, lineItem] = await Promise.all([
      prisma.kPI.findUnique({ where: { id: String(body.kpiId) } }),
      prisma.planningModel.findUnique({ where: { id: String(body.modelId) } }),
      prisma.planningLineItem.findUnique({ where: { id: String(body.lineItemId) } }),
    ]);
    if (!kpi) throw new FpaError(404, "NOT_FOUND", "KPI not found");
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");
    if (!lineItem || lineItem.modelId !== model.id) {
      throw new FpaError(400, "VALIDATION", "Line item does not belong to the selected model");
    }
    return prisma.performanceFpaTargetMapping.create({
      data: {
        kpiId: String(body.kpiId),
        modelId: String(body.modelId),
        lineItemId: String(body.lineItemId),
        targetSourceVersionId: body.targetSourceVersionId ? String(body.targetSourceVersionId) : null,
        targetMappingMethod: body.targetMappingMethod ? String(body.targetMappingMethod).toUpperCase() : "FULL_YEAR_VALUE",
        createdById: userId,
      },
    });
  }

  static async setTargetMappingActive(id: string, isActive: boolean) {
    const row = await prisma.performanceFpaTargetMapping.findUnique({ where: { id } });
    if (!row) throw new FpaError(404, "NOT_FOUND", "Target mapping not found");
    return prisma.performanceFpaTargetMapping.update({ where: { id }, data: { isActive: Boolean(isActive) } });
  }

  static async deleteTargetMapping(id: string) {
    const row = await prisma.performanceFpaTargetMapping.findUnique({ where: { id } });
    if (!row) throw new FpaError(404, "NOT_FOUND", "Target mapping not found");
    await prisma.performanceFpaTargetMapping.delete({ where: { id } });
    return { deleted: true };
  }

  static async listDriverMappings(query: any = {}) {
    const where: any = {};
    if (query.kpiId) where.kpiId = String(query.kpiId);
    if (query.modelId) where.modelId = String(query.modelId);
    const rows = await prisma.performanceFpaDriverMapping.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    const [kpis, models, lineItems] = await Promise.all([
      prisma.kPI.findMany({ where: { id: { in: rows.map((r) => r.kpiId) } }, select: { id: true, name: true } }),
      prisma.planningModel.findMany({ where: { id: { in: rows.map((r) => r.modelId) } }, select: { id: true, name: true } }),
      prisma.planningLineItem.findMany({ where: { id: { in: rows.map((r) => r.lineItemId) } }, select: { id: true, name: true, code: true } }),
    ]);
    const byId = (list: any[]) => Object.fromEntries(list.map((x) => [x.id, x]));
    const kpiById = byId(kpis);
    const modelById = byId(models);
    const lineItemById = byId(lineItems);
    return rows.map((r) => ({
      ...r,
      kpiName: kpiById[r.kpiId]?.name || null,
      modelName: modelById[r.modelId]?.name || null,
      lineItemName: lineItemById[r.lineItemId]?.name || null,
      lineItemCode: lineItemById[r.lineItemId]?.code || null,
    }));
  }

  static async createDriverMapping(body: any, userId: string) {
    if (!body.kpiId || !body.modelId || !body.lineItemId) {
      throw new FpaError(400, "VALIDATION", "kpiId, modelId, and lineItemId are required");
    }
    const [kpi, model, lineItem] = await Promise.all([
      prisma.kPI.findUnique({ where: { id: String(body.kpiId) } }),
      prisma.planningModel.findUnique({ where: { id: String(body.modelId) } }),
      prisma.planningLineItem.findUnique({ where: { id: String(body.lineItemId) } }),
    ]);
    if (!kpi) throw new FpaError(404, "NOT_FOUND", "KPI not found");
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");
    if (!lineItem || lineItem.modelId !== model.id) {
      throw new FpaError(400, "VALIDATION", "Line item does not belong to the selected model");
    }
    const thresholdPct = body.thresholdPct != null ? Number(body.thresholdPct) : 70;
    if (!Number.isFinite(thresholdPct) || thresholdPct < 0 || thresholdPct > 100) {
      throw new FpaError(400, "VALIDATION", "thresholdPct must be between 0 and 100");
    }
    return prisma.performanceFpaDriverMapping.create({
      data: {
        kpiId: String(body.kpiId),
        modelId: String(body.modelId),
        lineItemId: String(body.lineItemId),
        thresholdPct,
        consecutivePeriods: body.consecutivePeriods != null ? Number(body.consecutivePeriods) : 1,
        createdById: userId,
      },
    });
  }

  static async setDriverMappingActive(id: string, isActive: boolean) {
    const row = await prisma.performanceFpaDriverMapping.findUnique({ where: { id } });
    if (!row) throw new FpaError(404, "NOT_FOUND", "Driver mapping not found");
    return prisma.performanceFpaDriverMapping.update({ where: { id }, data: { isActive: Boolean(isActive) } });
  }

  static async deleteDriverMapping(id: string) {
    const row = await prisma.performanceFpaDriverMapping.findUnique({ where: { id } });
    if (!row) throw new FpaError(404, "NOT_FOUND", "Driver mapping not found");
    await prisma.performanceFpaDriverMapping.delete({ where: { id } });
    return { deleted: true };
  }
}
