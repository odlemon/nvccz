// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";
import { FpaFormulaEngine } from "./FpaFormulaEngine";

function userDisplayName(u: any): string | null {
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || null;
}

export class FpaLineItemService {
  static serialize(li: any) {
    return {
      id: li.id,
      modelId: li.modelId,
      moduleId: li.moduleId || null,
      moduleName: li.module?.name || null,
      code: li.code,
      name: li.name,
      lineItemType: li.lineItemType,
      category: li.category,
      dataType: li.dataType,
      summaryMethod: li.summaryMethod,
      format: li.format,
      currencyCode: li.currencyCode || null,
      decimalPlaces: li.decimalPlaces ?? null,
      isEditable: li.isEditable,
      sortOrder: li.sortOrder,
      accountId: li.accountId,
      updatedById: li.updatedById || null,
      formulas: li.formulas || [],
      createdAt: li.createdAt,
      updatedAt: li.updatedAt,
    };
  }

  static async list(modelId: string, query: any = {}) {
    const where: any = { modelId };
    if (query.moduleId) where.moduleId = String(query.moduleId);
    if (query.category) where.category = String(query.category);
    const rows = await prisma.planningLineItem.findMany({
      where,
      orderBy: { sortOrder: "asc" },
      include: {
        formulas: true,
        module: { select: { id: true, name: true, code: true } },
      },
    });
    return rows.map(FpaLineItemService.serialize);
  }

  static async create(input: any, userId: string, ip?: string) {
    if (!input.modelId || !input.code || !input.name) {
      throw new FpaError(400, "VALIDATION", "modelId, code, name required");
    }
    if (input.moduleId) {
      const mod = await prisma.planningModule.findUnique({ where: { id: String(input.moduleId) } });
      if (!mod || mod.modelId !== input.modelId) {
        throw new FpaError(400, "VALIDATION", "moduleId must belong to the same model");
      }
    }
    const li = await prisma.planningLineItem.create({
      data: {
        modelId: input.modelId,
        moduleId: input.moduleId || null,
        code: String(input.code).toUpperCase(),
        name: String(input.name),
        lineItemType: String(input.lineItemType || "EXPENSE"),
        category: String(input.category || "GENERAL"),
        dataType: String(input.dataType || "CURRENCY"),
        summaryMethod: String(input.summaryMethod || "SUM"),
        format: input.format || null,
        currencyCode: input.currencyCode || input.currency || null,
        decimalPlaces: input.decimalPlaces != null ? Number(input.decimalPlaces) : null,
        isEditable: input.isEditable !== false,
        sortOrder: Number(input.sortOrder || 0),
        accountId: input.accountId || null,
        updatedById: userId,
      },
      include: { formulas: true, module: { select: { id: true, name: true, code: true } } },
    });
    await FpaAuditService.log("LINE_ITEM_CREATE", userId, {
      modelId: input.modelId,
      newValue: li.id,
      reason: li.name,
      ip,
    });
    return FpaLineItemService.serialize(li);
  }

  static async update(lineItemId: string, input: any, userId: string, ip?: string) {
    const existing = await prisma.planningLineItem.findUnique({ where: { id: lineItemId } });
    if (!existing) throw new FpaError(404, "NOT_FOUND", "Line item not found");
    const data: any = { updatedById: userId };
    for (const k of ["name", "lineItemType", "category", "dataType", "summaryMethod", "format", "accountId"]) {
      if (input[k] != null) data[k] = input[k];
    }
    if (input.currencyCode != null || input.currency != null) {
      data.currencyCode = input.currencyCode || input.currency;
    }
    if (input.decimalPlaces != null) data.decimalPlaces = Number(input.decimalPlaces);
    if (input.isEditable != null) data.isEditable = !!input.isEditable;
    if (input.sortOrder != null) data.sortOrder = Number(input.sortOrder);
    if (input.moduleId !== undefined) {
      if (input.moduleId) {
        const mod = await prisma.planningModule.findUnique({ where: { id: String(input.moduleId) } });
        if (!mod || mod.modelId !== existing.modelId) {
          throw new FpaError(400, "VALIDATION", "moduleId must belong to the same model");
        }
        data.moduleId = String(input.moduleId);
      } else {
        data.moduleId = null;
      }
    }
    const updated = await prisma.planningLineItem.update({
      where: { id: lineItemId },
      data,
      include: { formulas: true, module: { select: { id: true, name: true, code: true } } },
    });
    await FpaAuditService.log("LINE_ITEM_UPDATE", userId, { modelId: existing.modelId, newValue: lineItemId, ip });
    return FpaLineItemService.serialize(updated);
  }

  static async remove(lineItemId: string, userId: string, ip?: string) {
    const existing = await prisma.planningLineItem.findUnique({ where: { id: lineItemId } });
    if (!existing) throw new FpaError(404, "NOT_FOUND", "Line item not found");
    await prisma.planningLineItem.delete({ where: { id: lineItemId } });
    await FpaAuditService.log("LINE_ITEM_DELETE", userId, { modelId: existing.modelId, oldValue: lineItemId, ip });
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
        await prisma.planningFormulaDependency
          .create({
            data: { formulaId: formula.id, dependsOnFormulaId },
          })
          .catch(() => null);
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

  /** Properties panel — Used In / References */
  static async dependencies(lineItemId: string) {
    const li = await prisma.planningLineItem.findUnique({
      where: { id: lineItemId },
      include: {
        module: { select: { id: true, name: true } },
        formulas: true,
      },
    });
    if (!li) throw new FpaError(404, "NOT_FOUND", "Line item not found");

    const myFormulas = await prisma.planningFormula.findMany({
      where: { lineItemId },
      include: {
        dependenciesAsSource: {
          include: { dependsOn: { include: { lineItem: { include: { module: { select: { name: true } } } } } } },
        },
        dependenciesAsTarget: {
          include: { formula: { include: { lineItem: { include: { module: { select: { name: true } } } } } } },
        },
      },
    });

    const precedents = [];
    const dependents = [];
    const seenP = new Set();
    const seenD = new Set();
    for (const f of myFormulas) {
      for (const d of f.dependenciesAsSource) {
        const p = d.dependsOn?.lineItem;
        if (!p || seenP.has(p.id)) continue;
        seenP.add(p.id);
        precedents.push({
          id: p.id,
          name: p.name,
          code: p.code,
          modulePath: p.module?.name || null,
        });
      }
      for (const d of f.dependenciesAsTarget) {
        const dep = d.formula?.lineItem;
        if (!dep || seenD.has(dep.id)) continue;
        seenD.add(dep.id);
        dependents.push({
          id: dep.id,
          name: dep.name,
          code: dep.code,
          modulePath: dep.module?.name || null,
        });
      }
    }

    // Expression-based precedents fallback
    for (const f of li.formulas || []) {
      for (const code of FpaFormulaEngine.extractLineCodes(f.expression)) {
        const p = await prisma.planningLineItem.findFirst({
          where: { modelId: li.modelId, code: String(code).toUpperCase() },
          include: { module: { select: { name: true } } },
        });
        if (!p || seenP.has(p.id)) continue;
        seenP.add(p.id);
        precedents.push({
          id: p.id,
          name: p.name,
          code: p.code,
          modulePath: p.module?.name || null,
        });
      }
    }

    return {
      lineItemId: li.id,
      name: li.name,
      moduleId: li.moduleId,
      moduleName: li.module?.name || null,
      expression: li.formulas?.[0]?.expression || null,
      precedents,
      dependents,
      usedInCount: dependents.length,
    };
  }

  /** A.4 Formula Trace with optional cell sample values */
  static async trace(lineItemId: string, query: any = {}) {
    const deps = await FpaLineItemService.dependencies(lineItemId);
    const li = await prisma.planningLineItem.findUnique({
      where: { id: lineItemId },
      include: { formulas: true, module: { select: { name: true } } },
    });
    if (!li) throw new FpaError(404, "NOT_FOUND", "Line item not found");

    const versionId = query.versionId ? String(query.versionId) : null;
    const scenarioId = query.scenarioId ? String(query.scenarioId) : null;
    const relatedIds = [li.id, ...deps.precedents.map((p) => p.id)];
    let valuesByLine: Record<string, number> = {};
    if (versionId || scenarioId) {
      const cells = await prisma.planningCell.findMany({
        where: {
          modelId: li.modelId,
          lineItemId: { in: relatedIds },
          ...(versionId ? { versionId } : {}),
          ...(scenarioId ? { scenarioId } : {}),
        },
        select: { lineItemId: true, value: true },
      });
      for (const c of cells) {
        valuesByLine[c.lineItemId] = (valuesByLine[c.lineItemId] || 0) + Number(c.value || 0);
      }
    }

    const formula = li.formulas?.[0] || null;
    const chainNodes = [
      ...deps.precedents.map((p) => ({
        id: p.id,
        label: p.name,
        role: "DRIVER",
        value: valuesByLine[p.id] ?? null,
      })),
      {
        id: li.id,
        label: li.name,
        role: "RESULT",
        value: valuesByLine[li.id] ?? null,
      },
    ];

    return {
      lineItemId: li.id,
      name: li.name,
      moduleName: li.module?.name || null,
      expression: formula?.expression || null,
      isValid: formula?.isValid ?? null,
      validationMsg: formula?.validationMsg || null,
      lineItemType: li.lineItemType,
      dataType: li.dataType,
      format: li.format,
      summaryMethod: li.summaryMethod,
      precedents: deps.precedents.map((p) => ({ ...p, value: valuesByLine[p.id] ?? null })),
      dependents: deps.dependents,
      calculationChain: {
        nodes: chainNodes,
        edges: deps.precedents.map((p) => ({ from: p.id, to: li.id })),
      },
      lastCalculatedAt: null,
      status: formula?.isValid === false ? "INVALID" : "VALID",
    };
  }
}
