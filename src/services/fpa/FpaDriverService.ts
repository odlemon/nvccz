// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";
import { FpaFormulaEngine } from "./FpaFormulaEngine";

export class FpaDriverService {
  static async list(modelId: string, query: any = {}) {
    const where: any = { modelId };
    if (query.scenarioId) where.scenarioId = String(query.scenarioId);
    if (query.versionId) where.versionId = String(query.versionId);
    if (query.category) where.category = String(query.category);
    return prisma.planningDriver.findMany({ where, orderBy: [{ code: "asc" }, { periodDate: "asc" }] });
  }

  static async create(input: any, userId: string, ip?: string) {
    if (!input.modelId || !input.code || !input.name) {
      throw new FpaError(400, "VALIDATION", "modelId, code, name required");
    }
    const driver = await prisma.planningDriver.create({
      data: {
        modelId: input.modelId,
        scenarioId: input.scenarioId || null,
        versionId: input.versionId || null,
        code: String(input.code).toUpperCase(),
        name: String(input.name),
        category: String(input.category || "GENERAL"),
        periodDate: input.periodDate ? new Date(input.periodDate) : null,
        value: input.value ?? 0,
        unit: input.unit || null,
        requiresApproval: !!input.requiresApproval,
        createdById: userId,
      },
    });
    await FpaAuditService.log("DRIVER_CREATE", userId, { modelId: input.modelId, ip });
    return driver;
  }

  static async update(driverId: string, input: any, userId: string, ip?: string) {
    const existing = await prisma.planningDriver.findUnique({ where: { id: driverId } });
    if (!existing) throw new FpaError(404, "NOT_FOUND", "Driver not found");
    const data: any = {};
    if (input.name != null) data.name = String(input.name);
    if (input.value != null) data.value = input.value;
    if (input.unit != null) data.unit = input.unit;
    if (input.category != null) data.category = String(input.category);
    if (input.periodDate != null) data.periodDate = new Date(input.periodDate);
    if (input.requiresApproval != null) data.requiresApproval = !!input.requiresApproval;

    const updated = await prisma.planningDriver.update({ where: { id: driverId }, data });

    if (input.value != null) {
      const formulas = await prisma.planningFormula.findMany({
        where: { modelId: existing.modelId },
        include: { lineItem: true },
      });
      const dependent = formulas.filter((f) =>
        FpaFormulaEngine.extractDriverCodes(f.expression).includes(existing.code)
      );
      for (const f of dependent) {
        const cells = await prisma.planningCell.findMany({
          where: {
            modelId: existing.modelId,
            lineItemId: f.lineItemId,
            ...(existing.versionId ? { versionId: existing.versionId } : {}),
            ...(existing.scenarioId ? { scenarioId: existing.scenarioId } : {}),
          },
        });
        const drivers = await prisma.planningDriver.findMany({
          where: { modelId: existing.modelId, code: { in: FpaFormulaEngine.extractDriverCodes(f.expression) } },
        });
        const driverMap: Record<string, number> = {};
        for (const d of drivers) driverMap[d.code] = Number(d.value);
        driverMap[existing.code] = Number(updated.value);

        for (const cell of cells) {
          try {
            const lineCodes = FpaFormulaEngine.extractLineCodes(f.expression);
            const lineVals: Record<string, number> = {};
            if (lineCodes.length) {
              const siblings = await prisma.planningCell.findMany({
                where: {
                  modelId: cell.modelId,
                  versionId: cell.versionId,
                  scenarioId: cell.scenarioId,
                  periodDate: cell.periodDate,
                  lineItem: { code: { in: lineCodes } },
                },
                include: { lineItem: true },
              });
              for (const s of siblings) lineVals[s.lineItem.code] = Number(s.value || 0);
            }
            const val = FpaFormulaEngine.evaluate(f.expression, { lines: lineVals, drivers: driverMap });
            await prisma.planningCell.update({
              where: { id: cell.id },
              data: {
                value: val,
                formulaId: f.id,
                valueType: "FORMULA",
                lastUpdatedById: userId,
                lastUpdatedAt: new Date(),
              },
            });
          } catch {
            // skip cells that cannot evaluate simply
          }
        }
      }
    }

    await FpaAuditService.log("DRIVER_UPDATE", userId, {
      modelId: existing.modelId,
      oldValue: String(existing.value),
      newValue: String(updated.value),
      ip,
    });
    return updated;
  }
}
