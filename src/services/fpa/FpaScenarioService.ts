// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";

const KEY_CODES = ["REVENUE", "COGS", "GROSS_PROFIT", "EBITDA", "CLOSING_CASH", "SALARIES", "HEADCOUNT"];

export class FpaScenarioService {
  static async create(input: any, userId: string, ip?: string) {
    const modelId = input.modelId;
    if (!modelId || !input.name) throw new FpaError(400, "VALIDATION", "modelId and name required");
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Model not found");
    const scenario = await prisma.planningScenario.create({
      data: {
        modelId,
        name: String(input.name),
        scenarioType: String(input.scenarioType || input.scenario_type || "WHAT_IF"),
        description: input.description || null,
        isOfficial: !!input.isOfficial,
        status: "DRAFT",
        createdById: userId,
      },
    });
    await FpaAuditService.log("SCENARIO_CREATE", userId, { modelId, scenarioId: scenario.id, ip });
    return scenario;
  }

  static async list(modelId?: string) {
    return prisma.planningScenario.findMany({
      where: modelId ? { modelId } : undefined,
      orderBy: { createdAt: "asc" },
    });
  }

  static async copy(scenarioId: string, input: any, userId: string, ip?: string) {
    const source = await prisma.planningScenario.findUnique({ where: { id: scenarioId } });
    if (!source) throw new FpaError(404, "NOT_FOUND", "Scenario not found");
    const versionId = input.versionId || input.version_id;
    if (!versionId) throw new FpaError(400, "VALIDATION", "versionId required for copy");

    const result = await prisma.$transaction(async (tx) => {
      const clone = await tx.planningScenario.create({
        data: {
          modelId: source.modelId,
          name: String(input.name || `${source.name} (copy)`),
          scenarioType: String(input.scenarioType || source.scenarioType),
          description: input.description || source.description,
          isOfficial: false,
          status: "DRAFT",
          createdById: userId,
        },
      });

      const cells = await tx.planningCell.findMany({
        where: { scenarioId: source.id, versionId },
      });
      if (cells.length) {
        await tx.planningCell.createMany({
          data: cells.map((c) => ({
            modelId: c.modelId,
            scenarioId: clone.id,
            versionId: c.versionId,
            lineItemId: c.lineItemId,
            periodDate: c.periodDate,
            entityId: c.entityId,
            departmentId: c.departmentId,
            costCentreId: c.costCentreId,
            accountId: c.accountId,
            currencyCode: c.currencyCode,
            value: c.value,
            valueType: c.valueType,
            sourceType: c.sourceType,
            isEditable: c.isEditable,
            isLocked: false,
            formulaId: c.formulaId,
            driverId: c.driverId,
          })),
        });
      }

      const drivers = await tx.planningDriver.findMany({
        where: { scenarioId: source.id, versionId },
      });
      for (const d of drivers) {
        await tx.planningDriver.create({
          data: {
            modelId: d.modelId,
            scenarioId: clone.id,
            versionId: d.versionId,
            code: d.code,
            name: d.name,
            category: d.category,
            periodDate: d.periodDate,
            value: d.value,
            unit: d.unit,
            requiresApproval: d.requiresApproval,
            createdById: userId,
          },
        });
      }

      return { scenario: clone, cellsCopied: cells.length, driversCopied: drivers.length };
    });

    await FpaAuditService.log("SCENARIO_COPY", userId, {
      modelId: source.modelId,
      scenarioId: result.scenario.id,
      oldValue: scenarioId,
      ip,
    });
    return result;
  }

  static async compare(scenarioId: string, input: any) {
    const left = await prisma.planningScenario.findUnique({ where: { id: scenarioId } });
    if (!left) throw new FpaError(404, "NOT_FOUND", "Scenario not found");
    const rightId =
      input.compareScenarioId ||
      input.otherScenarioId ||
      input.scenarioIdB ||
      (Array.isArray(input.scenarioIds) ? input.scenarioIds.find((id: string) => id !== scenarioId) || input.scenarioIds[1] : null);
    if (!rightId) throw new FpaError(400, "VALIDATION", "compareScenarioId required");
    const right = await prisma.planningScenario.findUnique({ where: { id: rightId } });
    if (!right) throw new FpaError(404, "NOT_FOUND", "Compare scenario not found");
    const versionId = input.versionId;
    if (!versionId) throw new FpaError(400, "VALIDATION", "versionId required");

    // Upside/new scenarios may have no cells yet — still return zeroed comparison.
    const lineItems = await prisma.planningLineItem.findMany({
      where: { modelId: left.modelId, code: { in: KEY_CODES } },
    });
    const ids = lineItems.map((l) => l.id);

    async function sums(sid: string) {
      const cells = await prisma.planningCell.findMany({
        where: { scenarioId: sid, versionId, lineItemId: { in: ids } },
      });
      const byCode: Record<string, number> = {};
      for (const li of lineItems) byCode[li.code] = 0;
      for (const c of cells) {
        const code = lineItems.find((l) => l.id === c.lineItemId)?.code;
        if (!code) continue;
        byCode[code] = (byCode[code] || 0) + Number(c.value || 0);
      }
      return byCode;
    }

    const [a, b] = await Promise.all([sums(left.id), sums(right.id)]);
    const rows = KEY_CODES.filter((c) => a[c] != null || b[c] != null).map((code) => ({
      code,
      left: a[code] || 0,
      right: b[code] || 0,
      delta: (a[code] || 0) - (b[code] || 0),
    }));

    return {
      left: { id: left.id, name: left.name },
      right: { id: right.id, name: right.name },
      versionId,
      rows,
    };
  }
}
