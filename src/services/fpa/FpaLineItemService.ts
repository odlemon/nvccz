// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";
import { FpaFormulaEngine } from "./FpaFormulaEngine";

const DEFAULT_DIM_KEYS = ["Time", "Product", "Region", "Version", "Scenario"];

function userDisplayName(u: any): string | null {
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || null;
}

function parseDimKeys(raw: any): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export class FpaLineItemService {
  static serialize(li: any, names: { createdByName?: string | null; updatedByName?: string | null } = {}) {
    const dimensionKeys = parseDimKeys(li.dimensionKeys) || [...DEFAULT_DIM_KEYS];
    const decimalPlaces = li.decimalPlaces ?? null;
    return {
      id: li.id,
      modelId: li.modelId,
      moduleId: li.moduleId || null,
      moduleName: li.module?.name || null,
      code: li.code,
      name: li.name,
      description: li.description || null,
      lineItemType: li.lineItemType,
      category: li.category,
      dataType: li.dataType,
      summaryMethod: li.summaryMethod,
      format: li.format,
      currencyCode: li.currencyCode || null,
      currency: li.currencyCode || null,
      decimalPlaces,
      displayScale: decimalPlaces,
      dimensionKeys,
      isEditable: li.isEditable,
      sortOrder: li.sortOrder,
      accountId: li.accountId,
      updatedById: li.updatedById || null,
      formulas: li.formulas || [],
      formulaId: li.formulas?.[0]?.id || null,
      createdAt: li.createdAt,
      updatedAt: li.updatedAt,
      createdByName: names.createdByName ?? null,
      updatedByName: names.updatedByName ?? null,
    };
  }

  static async resolveUserNames(updatedById: string | null) {
    if (!updatedById) return { updatedByName: null };
    const u = await prisma.user.findUnique({
      where: { id: updatedById },
      select: { firstName: true, lastName: true, email: true },
    });
    return { updatedByName: userDisplayName(u) };
  }

  static async list(modelId: string, query: any = {}) {
    const where: any = { modelId };
    if (query.moduleId) where.moduleId = String(query.moduleId);
    if (query.category) where.category = String(query.category);
    const type = query.type ? String(query.type).toUpperCase() : null;
    if (type === "INPUT") where.OR = [{ lineItemType: "INPUT" }, { isEditable: true, lineItemType: { notIn: ["CALCULATED", "CALC"] } }];
    if (type === "CALCULATED") where.lineItemType = { in: ["CALCULATED", "CALC"] };

    const rows = await prisma.planningLineItem.findMany({
      where,
      orderBy: { sortOrder: "asc" },
      include: {
        formulas: true,
        module: { select: { id: true, name: true, code: true } },
      },
    });
    return Promise.all(
      rows.map(async (li) => {
        const names = await FpaLineItemService.resolveUserNames(li.updatedById);
        return FpaLineItemService.serialize(li, names);
      })
    );
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
    const lineItemType = String(input.lineItemType || "INPUT").toUpperCase();
    const isCalculated = ["CALCULATED", "CALC"].includes(lineItemType);
    const dimKeys = Array.isArray(input.dimensionKeys) ? input.dimensionKeys.map(String) : undefined;
    const displayScale = input.displayScale != null ? Number(input.displayScale) : input.decimalPlaces != null ? Number(input.decimalPlaces) : null;

    const li = await prisma.planningLineItem.create({
      data: {
        modelId: input.modelId,
        moduleId: input.moduleId || null,
        code: String(input.code).toUpperCase(),
        name: String(input.name),
        description: input.description != null ? String(input.description) : null,
        lineItemType,
        category: String(input.category || "GENERAL"),
        dataType: String(input.dataType || (isCalculated ? "CURRENCY" : "NUMBER")),
        summaryMethod: String(input.summaryMethod || "SUM"),
        format: input.format || null,
        currencyCode: input.currencyCode || input.currency || null,
        decimalPlaces: displayScale,
        dimensionKeys: dimKeys,
        isEditable: input.isEditable != null ? !!input.isEditable : !isCalculated,
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
    const names = await FpaLineItemService.resolveUserNames(userId);
    return FpaLineItemService.serialize(li, { ...names, createdByName: names.updatedByName });
  }

  static async update(lineItemId: string, input: any, userId: string, ip?: string) {
    const existing = await prisma.planningLineItem.findUnique({ where: { id: lineItemId } });
    if (!existing) throw new FpaError(404, "NOT_FOUND", "Line item not found");
    const data: any = { updatedById: userId };
    for (const k of ["name", "lineItemType", "category", "dataType", "summaryMethod", "format", "accountId", "description"]) {
      if (input[k] != null) data[k] = input[k];
    }
    if (input.description === null) data.description = null;
    if (input.currencyCode != null || input.currency != null) {
      data.currencyCode = input.currencyCode || input.currency;
    }
    if (input.decimalPlaces != null || input.displayScale != null) {
      data.decimalPlaces = Number(input.displayScale != null ? input.displayScale : input.decimalPlaces);
    }
    if (input.isEditable != null) data.isEditable = !!input.isEditable;
    if (input.sortOrder != null) data.sortOrder = Number(input.sortOrder);
    if (Array.isArray(input.dimensionKeys)) data.dimensionKeys = input.dimensionKeys.map(String);
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
    await FpaAuditService.log("LINE_ITEM_UPDATE", userId, {
      modelId: existing.modelId,
      newValue: lineItemId,
      reason: JSON.stringify({ before: { name: existing.name }, after: { name: updated.name } }),
      ip,
    });
    const names = await FpaLineItemService.resolveUserNames(userId);
    return FpaLineItemService.serialize(updated, names);
  }

  static async setDimensions(lineItemId: string, input: any, userId: string, ip?: string) {
    return FpaLineItemService.update(lineItemId, { dimensionKeys: input?.dimensionKeys ?? input?.dimension_keys }, userId, ip);
  }

  static async reorder(lineItemId: string, input: any, userId: string, ip?: string) {
    if (input?.sortOrder == null) throw new FpaError(400, "VALIDATION", "sortOrder is required");
    return FpaLineItemService.update(lineItemId, { sortOrder: input.sortOrder }, userId, ip);
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

  static async impactForLineItem(lineItemId: string) {
    const deps = await FpaLineItemService.dependencies(lineItemId);
    return {
      precedents: (deps.precedents || []).map((p: any) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        moduleId: p.moduleId || null,
        moduleName: p.moduleName || p.modulePath || null,
      })),
      dependents: (deps.dependents || []).map((d: any) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        moduleId: d.moduleId || null,
        moduleName: d.moduleName || d.modulePath || null,
      })),
      usedIn: (deps.dependents || []).map((d: any) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        moduleId: d.moduleId || null,
        moduleName: d.moduleName || d.modulePath || null,
      })),
    };
  }

  static async graphDeltaForFormula(formula: any) {
    const codes = FpaFormulaEngine.extractLineCodes(formula.expression);
    const upsertEdges = [];
    for (const code of codes) {
      const src = await prisma.planningLineItem.findFirst({
        where: { modelId: formula.modelId, code: String(code).toUpperCase() },
      });
      if (!src || src.id === formula.lineItemId) continue;
      upsertEdges.push({
        id: `e_${src.id}_${formula.lineItemId}`,
        sourceLineItemId: src.id,
        targetLineItemId: formula.lineItemId,
        kind: src.moduleId && formula.lineItem?.moduleId && src.moduleId !== formula.lineItem.moduleId ? "external" : "direct",
      });
    }
    return { upsertEdges, removeEdgeIds: [] };
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
      include: { lineItem: { select: { id: true, moduleId: true } } },
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

    await FpaAuditService.log("FORMULA_CREATE", userId, {
      modelId: input.modelId,
      reason: JSON.stringify({ after: { expression: formula.expression, lineItemId: formula.lineItemId } }),
      ip,
    });

    const impact = await FpaLineItemService.impactForLineItem(input.lineItemId);
    const graphDelta = await FpaLineItemService.graphDeltaForFormula(formula);
    return { formula, impact, graphDelta };
  }

  static async updateFormula(formulaId: string, input: any, userId: string, ip?: string) {
    const existing = await prisma.planningFormula.findUnique({
      where: { id: formulaId },
      include: { lineItem: { select: { id: true, moduleId: true } } },
    });
    if (!existing) throw new FpaError(404, "NOT_FOUND", "Formula not found");
    const expression = input.expression != null ? String(input.expression) : existing.expression;
    const validation = FpaFormulaEngine.validateExpression(expression);
    const dep = await FpaFormulaEngine.dependencyCheck(existing.modelId, formulaId, validation.lineCodes);
    if (dep.circular) {
      throw new FpaError(400, "CIRCULAR", `Circular dependency: ${(dep.path || []).join(" -> ")}`);
    }
    await prisma.planningFormulaDependency.deleteMany({ where: { formulaId } });
    const updated = await prisma.planningFormula.update({
      where: { id: formulaId },
      data: {
        expression,
        isValid: validation.valid,
        validationMsg: validation.message || null,
        ...(input.lineItemId ? { lineItemId: input.lineItemId } : {}),
      },
      include: { lineItem: { select: { id: true, moduleId: true } } },
    });

    const formulas = await prisma.planningFormula.findMany({
      where: { modelId: existing.modelId },
      include: { lineItem: true },
    });
    const codeToId: Record<string, string> = {};
    for (const f of formulas) {
      if (f.lineItem?.code) codeToId[f.lineItem.code] = f.id;
    }
    for (const code of validation.lineCodes) {
      const dependsOnFormulaId = codeToId[code];
      if (dependsOnFormulaId && dependsOnFormulaId !== formulaId) {
        await prisma.planningFormulaDependency
          .create({ data: { formulaId, dependsOnFormulaId } })
          .catch(() => null);
      }
    }

    await FpaAuditService.log("FORMULA_UPDATE", userId, {
      modelId: existing.modelId,
      reason: JSON.stringify({
        before: { expression: existing.expression },
        after: { expression },
        entityType: "LINE_ITEM",
        entityId: updated.lineItemId,
      }),
      ip,
    });

    const impact = await FpaLineItemService.impactForLineItem(updated.lineItemId);
    const graphDelta = await FpaLineItemService.graphDeltaForFormula(updated);
    return { formula: updated, impact, graphDelta };
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
    const impact = await FpaLineItemService.impactForLineItem(formula.lineItemId);
    return {
      ...impact,
      // legacy
      formula,
      dependsOn: formula.dependenciesAsSource.map((d) => d.dependsOn),
      dependentsLegacy: formula.dependenciesAsTarget.map((d) => d.formula),
      lineCodes: FpaFormulaEngine.extractLineCodes(formula.expression),
      driverCodes: FpaFormulaEngine.extractDriverCodes(formula.expression),
    };
  }

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
          include: {
            dependsOn: { include: { lineItem: { include: { module: { select: { id: true, name: true } } } } } },
          },
        },
        dependenciesAsTarget: {
          include: {
            formula: { include: { lineItem: { include: { module: { select: { id: true, name: true } } } } } },
          },
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
          moduleId: p.moduleId || p.module?.id || null,
          moduleName: p.module?.name || null,
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
          moduleId: dep.moduleId || dep.module?.id || null,
          moduleName: dep.module?.name || null,
          modulePath: dep.module?.name || null,
        });
      }
    }

    for (const f of li.formulas || []) {
      for (const code of FpaFormulaEngine.extractLineCodes(f.expression)) {
        const p = await prisma.planningLineItem.findFirst({
          where: { modelId: li.modelId, code: String(code).toUpperCase() },
          include: { module: { select: { id: true, name: true } } },
        });
        if (!p || seenP.has(p.id)) continue;
        seenP.add(p.id);
        precedents.push({
          id: p.id,
          name: p.name,
          code: p.code,
          moduleId: p.moduleId || p.module?.id || null,
          moduleName: p.module?.name || null,
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
      usedIn: dependents,
      usedInCount: dependents.length,
    };
  }

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
