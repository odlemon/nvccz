// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";
import { FpaFormulaEngine } from "./FpaFormulaEngine";

export class FpaLineItemService {
  static async list(modelId: string) {
    return prisma.planningLineItem.findMany({
      where: { modelId },
      orderBy: { sortOrder: "asc" },
      include: { formulas: true },
    });
  }

  static async create(input: any, userId: string, ip?: string) {
    if (!input.modelId || !input.code || !input.name) {
      throw new FpaError(400, "VALIDATION", "modelId, code, name required");
    }
    const li = await prisma.planningLineItem.create({
      data: {
        modelId: input.modelId,
        code: String(input.code).toUpperCase(),
        name: String(input.name),
        lineItemType: String(input.lineItemType || "EXPENSE"),
        category: String(input.category || "GENERAL"),
        dataType: String(input.dataType || "CURRENCY"),
        summaryMethod: String(input.summaryMethod || "SUM"),
        format: input.format || null,
        isEditable: input.isEditable !== false,
        sortOrder: Number(input.sortOrder || 0),
        accountId: input.accountId || null,
      },
    });
    await FpaAuditService.log("LINE_ITEM_CREATE", userId, { modelId: input.modelId, ip });
    return li;
  }

  static async update(lineItemId: string, input: any, userId: string, ip?: string) {
    const existing = await prisma.planningLineItem.findUnique({ where: { id: lineItemId } });
    if (!existing) throw new FpaError(404, "NOT_FOUND", "Line item not found");
    const data: any = {};
    for (const k of ["name", "lineItemType", "category", "dataType", "summaryMethod", "format", "accountId"]) {
      if (input[k] != null) data[k] = input[k];
    }
    if (input.isEditable != null) data.isEditable = !!input.isEditable;
    if (input.sortOrder != null) data.sortOrder = Number(input.sortOrder);
    const updated = await prisma.planningLineItem.update({ where: { id: lineItemId }, data });
    await FpaAuditService.log("LINE_ITEM_UPDATE", userId, { modelId: existing.modelId, ip });
    return updated;
  }

  static async remove(lineItemId: string, userId: string, ip?: string) {
    const existing = await prisma.planningLineItem.findUnique({ where: { id: lineItemId } });
    if (!existing) throw new FpaError(404, "NOT_FOUND", "Line item not found");
    await prisma.planningLineItem.delete({ where: { id: lineItemId } });
    await FpaAuditService.log("LINE_ITEM_DELETE", userId, { modelId: existing.modelId, ip });
    return { deleted: true, id: lineItemId };
  }

  static async listFormulas(modelId: string) {
    return prisma.planningFormula.findMany({
      where: { modelId },
      include: { lineItem: true, dependenciesAsSource: true },
      orderBy: { createdAt: "asc" },
    });
  }

  static async createFormula(input: any, userId: string, ip?: string) {
    if (!input.modelId || !input.lineItemId || !input.expression) {
      throw new FpaError(400, "VALIDATION", "modelId, lineItemId, expression required");
    }
    const validation = FpaFormulaEngine.validateExpression(input.expression);
    const dep = await FpaFormulaEngine.dependencyCheck(input.modelId, null, validation.lineCodes);
    if (dep.circular) {
      throw new FpaError(400, "CIRCULAR", `Circular dependency: ${(dep.path || []).join(" -> ")}`);
    }
    const formula = await prisma.planningFormula.create({
      data: {
        modelId: input.modelId,
        lineItemId: input.lineItemId,
        expression: String(input.expression),
        isValid: validation.valid,
        validationMsg: validation.message || null,
        createdById: userId,
      },
    });

    const formulas = await prisma.planningFormula.findMany({
      where: { modelId: input.modelId },
      include: { lineItem: true },
    });
    const codeToId: Record<string, string> = {};
    for (const f of formulas) {
      if (f.lineItem?.code) codeToId[f.lineItem.code] = f.id;
    }
    for (const code of validation.lineCodes) {
      const dependsOnFormulaId = codeToId[code];
      if (dependsOnFormulaId && dependsOnFormulaId !== formula.id) {
        await prisma.planningFormulaDependency.create({
          data: { formulaId: formula.id, dependsOnFormulaId },
        }).catch(() => null);
      }
    }

    await FpaAuditService.log("FORMULA_CREATE", userId, { modelId: input.modelId, ip });
    return formula;
  }

  static async updateFormula(formulaId: string, input: any, userId: string, ip?: string) {
    const existing = await prisma.planningFormula.findUnique({ where: { id: formulaId } });
    if (!existing) throw new FpaError(404, "NOT_FOUND", "Formula not found");
    const expression = input.expression != null ? String(input.expression) : existing.expression;
    const validation = FpaFormulaEngine.validateExpression(expression);
    const dep = await FpaFormulaEngine.dependencyCheck(existing.modelId, formulaId, validation.lineCodes);
    if (dep.circular) {
      throw new FpaError(400, "CIRCULAR", `Circular dependency: ${(dep.path || []).join(" -> ")}`);
    }
    const updated = await prisma.planningFormula.update({
      where: { id: formulaId },
      data: {
        expression,
        isValid: validation.valid,
        validationMsg: validation.message || null,
        ...(input.lineItemId ? { lineItemId: input.lineItemId } : {}),
      },
    });
    await FpaAuditService.log("FORMULA_UPDATE", userId, { modelId: existing.modelId, ip });
    return updated;
  }

  static async impactMap(formulaId: string) {
    const formula = await prisma.planningFormula.findUnique({
      where: { id: formulaId },
      include: {
        lineItem: true,
        dependenciesAsSource: { include: { dependsOn: { include: { lineItem: true } } } },
        dependenciesAsTarget: { include: { formula: { include: { lineItem: true } } } },
      },
    });
    if (!formula) throw new FpaError(404, "NOT_FOUND", "Formula not found");
    return {
      formula,
      dependsOn: formula.dependenciesAsSource.map((d) => d.dependsOn),
      dependents: formula.dependenciesAsTarget.map((d) => d.formula),
      lineCodes: FpaFormulaEngine.extractLineCodes(formula.expression),
      driverCodes: FpaFormulaEngine.extractDriverCodes(formula.expression),
    };
  }
}
