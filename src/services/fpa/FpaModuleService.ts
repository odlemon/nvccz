// @ts-nocheck
import { createHash } from "crypto";
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";
import { FpaFormulaEngine } from "./FpaFormulaEngine";
import { FpaModelSetupService } from "./FpaModelSetupService";

const DEFAULT_DIM_KEYS = ["Time", "Product", "Region", "Version", "Scenario"];

function userDisplayName(u: any): string | null {
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || null;
}

function slugCode(name: string): string {
  return (
    String(name || "MODULE")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 64) || "MODULE"
  );
}

function parseDimKeys(raw: any): string[] {
  if (raw == null) return [...DEFAULT_DIM_KEYS];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [...DEFAULT_DIM_KEYS];
    } catch {
      return [...DEFAULT_DIM_KEYS];
    }
  }
  return [...DEFAULT_DIM_KEYS];
}

function normalizeDimKeys(input: any): string[] | undefined {
  const keys = input?.dimensionKeys ?? input?.dimension_keys;
  if (keys === undefined) return undefined;
  if (!Array.isArray(keys)) throw new FpaError(400, "VALIDATION", "dimensionKeys must be an array");
  return keys.map(String);
}

function parentIdOf(input: any): string | null | undefined {
  if (input?.parentModuleId !== undefined) return input.parentModuleId ? String(input.parentModuleId) : null;
  if (input?.parentId !== undefined) return input.parentId ? String(input.parentId) : null;
  return undefined;
}

function calcOrderOf(input: any): number | undefined {
  if (input?.calculationOrder != null) return Number(input.calculationOrder);
  if (input?.calcOrder != null) return Number(input.calcOrder);
  return undefined;
}

function issueCategory(typeOrCode: string): string {
  const t = String(typeOrCode || "").toUpperCase();
  if (t.includes("DEPEND") || t === "CIRCULAR_REFERENCE") return "DEPENDENCY";
  if (t.includes("FORMULA") || t.includes("LINE_REF")) return "FORMULA";
  if (t.includes("MAP")) return "MAPPING";
  if (t.includes("DIM")) return "DIMENSION";
  if (t.includes("CURR")) return "CURRENCY";
  if (t.includes("TIME")) return "TIME";
  if (t.includes("MODULE") || t.includes("SETUP")) return "DATA_TYPE";
  return "FORMULA";
}

export class FpaModuleService {
  static assertBuilder(user: any) {
    FpaAccessService.assertCanApprove(user);
  }

  static async assertModel(modelId: string) {
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");
    return model;
  }

  static async assertModule(moduleId: string) {
    const mod = await prisma.planningModule.findUnique({ where: { id: moduleId } });
    if (!mod) throw new FpaError(404, "NOT_FOUND", "Module not found");
    return mod;
  }

  static serializeModule(m: any, countMap: Record<string, number> = {}) {
    const parentId = m.parentId || null;
    const calcOrder = m.calcOrder;
    const dimensionKeys = parseDimKeys(m.dimensionKeys);
    return {
      id: m.id,
      modelId: m.modelId,
      code: m.code,
      name: m.name,
      description: m.description || null,
      parentId,
      parentModuleId: parentId,
      calcOrder,
      calculationOrder: calcOrder,
      sortOrder: m.sortOrder,
      status: m.status,
      dimensionKeys,
      lineItemCount: countMap[m.id] ?? m._count?.lineItems ?? 0,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  static async listModules(modelId: string, user: any) {
    FpaModuleService.assertBuilder(user);
    await FpaModuleService.assertModel(modelId);
    const modules = await prisma.planningModule.findMany({
      where: { modelId },
      orderBy: [{ sortOrder: "asc" }, { calcOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { lineItems: true } } },
    });
    const countMap = Object.fromEntries(modules.map((m) => [m.id, m._count.lineItems]));
    const byParent: Record<string, any[]> = {};
    const roots: any[] = [];
    for (const m of modules) {
      const node = { ...FpaModuleService.serializeModule(m, countMap), children: [] as any[] };
      if (m.parentId) {
        if (!byParent[m.parentId]) byParent[m.parentId] = [];
        byParent[m.parentId].push(node);
      } else {
        roots.push(node);
      }
    }
    function attach(nodes: any[]) {
      for (const n of nodes) {
        n.children = byParent[n.id] || [];
        attach(n.children);
      }
    }
    attach(roots);
    for (const [pid, kids] of Object.entries(byParent)) {
      if (!modules.some((m) => m.id === pid)) {
        for (const k of kids) roots.push(k);
      }
    }
    return roots;
  }

  static async createModule(modelId: string, input: any, user: any, ip?: string) {
    FpaModuleService.assertBuilder(user);
    await FpaModuleService.assertModel(modelId);
    const name = String(input?.name || "").trim();
    if (!name) throw new FpaError(400, "VALIDATION", "name is required");
    let code = String(input?.code || slugCode(name)).toUpperCase();
    const existing = await prisma.planningModule.findFirst({ where: { modelId, code } });
    if (existing) code = `${code}_${Date.now().toString(36).toUpperCase()}`.slice(0, 64);

    const parentId = parentIdOf(input);
    if (parentId) {
      const parent = await FpaModuleService.assertModule(parentId);
      if (parent.modelId !== modelId) throw new FpaError(400, "VALIDATION", "parentModuleId must be in same model");
    }

    const maxSort = await prisma.planningModule.aggregate({
      where: { modelId },
      _max: { sortOrder: true, calcOrder: true },
    });
    const dimKeys = normalizeDimKeys(input) ?? [...DEFAULT_DIM_KEYS];
    const calcOrder = calcOrderOf(input);
    const created = await prisma.planningModule.create({
      data: {
        modelId,
        code,
        name,
        description: input?.description ? String(input.description) : null,
        parentId: parentId ?? null,
        calcOrder: calcOrder != null ? calcOrder : (maxSort._max.calcOrder || 0) + 1,
        sortOrder: input?.sortOrder != null ? Number(input.sortOrder) : (maxSort._max.sortOrder || 0) + 1,
        status: "DRAFT",
        dimensionKeys: dimKeys,
      },
    });
    await FpaAuditService.log("MODULE_CREATED", user.id, {
      modelId,
      newValue: created.id,
      reason: created.name,
      ip,
    });
    return FpaModuleService.serializeModule(created, { [created.id]: 0 });
  }

  static async updateModule(moduleId: string, input: any, user: any, ip?: string) {
    FpaModuleService.assertBuilder(user);
    const existing = await FpaModuleService.assertModule(moduleId);
    const data: any = {};
    if (input?.name != null) data.name = String(input.name).trim();
    if (input?.description !== undefined) data.description = input.description ? String(input.description) : null;
    const calcOrder = calcOrderOf(input);
    if (calcOrder != null) data.calcOrder = calcOrder;
    if (input?.sortOrder != null) data.sortOrder = Number(input.sortOrder);
    if (input?.status != null) data.status = String(input.status);
    const parentId = parentIdOf(input);
    if (parentId !== undefined) {
      if (parentId === moduleId) throw new FpaError(400, "VALIDATION", "Module cannot be its own parent");
      if (parentId) {
        const parent = await FpaModuleService.assertModule(parentId);
        if (parent.modelId !== existing.modelId) {
          throw new FpaError(400, "VALIDATION", "parentModuleId must be in same model");
        }
      }
      data.parentId = parentId;
    }
    if (input?.code != null) data.code = String(input.code).toUpperCase().slice(0, 64);
    const dimKeys = normalizeDimKeys(input);
    if (dimKeys) data.dimensionKeys = dimKeys;

    const updated = await prisma.planningModule.update({ where: { id: moduleId }, data });
    await FpaAuditService.log("MODULE_UPDATED", user.id, {
      modelId: existing.modelId,
      newValue: moduleId,
      reason: updated.name,
      ip,
    });
    const count = await prisma.planningLineItem.count({ where: { moduleId } });
    return FpaModuleService.serializeModule(updated, { [moduleId]: count });
  }

  static async setModuleDimensions(moduleId: string, input: any, user: any, ip?: string) {
    return FpaModuleService.updateModule(moduleId, { dimensionKeys: input?.dimensionKeys ?? input?.dimension_keys }, user, ip);
  }

  static async deleteModule(moduleId: string, user: any, ip?: string, query: any = {}) {
    FpaModuleService.assertBuilder(user);
    const existing = await FpaModuleService.assertModule(moduleId);
    const cascade = String(query?.cascade || "").toLowerCase() === "true" || query?.cascade === true;

    const childCount = await prisma.planningModule.count({ where: { parentId: moduleId } });
    const liCount = await prisma.planningLineItem.count({ where: { moduleId } });

    if (!cascade) {
      if (liCount > 0) {
        throw new FpaError(409, "MODULE_NOT_EMPTY", `Module has ${liCount} line item(s); reassign/delete or pass ?cascade=true`);
      }
      if (childCount > 0) {
        throw new FpaError(409, "MODULE_HAS_CHILDREN", "Reassign or delete child modules first, or pass ?cascade=true");
      }
      await prisma.planningModule.delete({ where: { id: moduleId } });
    } else {
      await FpaModuleService.cascadeDeleteModule(moduleId);
    }

    await FpaAuditService.log("MODULE_DELETED", user.id, {
      modelId: existing.modelId,
      oldValue: moduleId,
      reason: existing.name,
      ip,
    });
    return { id: moduleId, deleted: true, cascade };
  }

  static async cascadeDeleteModule(moduleId: string) {
    const children = await prisma.planningModule.findMany({ where: { parentId: moduleId }, select: { id: true } });
    for (const c of children) {
      await FpaModuleService.cascadeDeleteModule(c.id);
    }
    const lis = await prisma.planningLineItem.findMany({ where: { moduleId }, select: { id: true } });
    for (const li of lis) {
      await prisma.planningFormula.deleteMany({ where: { lineItemId: li.id } });
      await prisma.planningCell.deleteMany({ where: { lineItemId: li.id } });
      await prisma.planningLineItem.delete({ where: { id: li.id } });
    }
    await prisma.planningModule.delete({ where: { id: moduleId } });
  }

  static async duplicateModule(moduleId: string, user: any, ip?: string) {
    FpaModuleService.assertBuilder(user);
    const source = await FpaModuleService.assertModule(moduleId);
    const idMap: Record<string, string> = {};
    const liIdMap: Record<string, string> = {};

    async function copyNode(srcId: string, newParentId: string | null): Promise<string> {
      const src = await prisma.planningModule.findUnique({ where: { id: srcId } });
      if (!src) throw new FpaError(404, "NOT_FOUND", "Module not found");
      let code = `${src.code}_COPY`.slice(0, 64);
      const clash = await prisma.planningModule.findFirst({ where: { modelId: src.modelId, code } });
      if (clash) code = `${src.code}_${Date.now().toString(36).toUpperCase()}`.slice(0, 64);
      const created = await prisma.planningModule.create({
        data: {
          modelId: src.modelId,
          code,
          name: `${src.name} (copy)`,
          description: src.description,
          parentId: newParentId,
          calcOrder: src.calcOrder,
          sortOrder: src.sortOrder + 1,
          status: "DRAFT",
          dimensionKeys: parseDimKeys(src.dimensionKeys),
        },
      });
      idMap[srcId] = created.id;

      const lis = await prisma.planningLineItem.findMany({
        where: { moduleId: srcId },
        include: { formulas: true },
        orderBy: { sortOrder: "asc" },
      });
      for (const li of lis) {
        let liCode = `${li.code}_COPY`.slice(0, 64);
        const liClash = await prisma.planningLineItem.findFirst({ where: { modelId: li.modelId, code: liCode } });
        if (liClash) liCode = `${li.code}_${Date.now().toString(36).toUpperCase()}`.slice(0, 64);
        const newLi = await prisma.planningLineItem.create({
          data: {
            modelId: li.modelId,
            moduleId: created.id,
            code: liCode,
            name: li.name,
            description: li.description,
            lineItemType: li.lineItemType,
            category: li.category,
            dataType: li.dataType,
            summaryMethod: li.summaryMethod,
            format: li.format,
            currencyCode: li.currencyCode,
            decimalPlaces: li.decimalPlaces,
            dimensionKeys: li.dimensionKeys ?? undefined,
            isEditable: li.isEditable,
            sortOrder: li.sortOrder,
            accountId: li.accountId,
            updatedById: user.id,
          },
        });
        liIdMap[li.id] = newLi.id;
        for (const f of li.formulas || []) {
          await prisma.planningFormula.create({
            data: {
              modelId: f.modelId,
              lineItemId: newLi.id,
              expression: f.expression,
              isValid: f.isValid,
              validationMsg: f.validationMsg,
              createdById: user.id,
            },
          });
        }
      }

      const kids = await prisma.planningModule.findMany({ where: { parentId: srcId }, select: { id: true } });
      for (const k of kids) await copyNode(k.id, created.id);
      return created.id;
    }

    const newRootId = await copyNode(moduleId, source.parentId);
    await FpaAuditService.log("MODULE_DUPLICATED", user.id, {
      modelId: source.modelId,
      oldValue: moduleId,
      newValue: newRootId,
      ip,
    });
    const count = await prisma.planningLineItem.count({ where: { moduleId: newRootId } });
    const created = await prisma.planningModule.findUnique({ where: { id: newRootId } });
    return {
      ...FpaModuleService.serializeModule(created, { [newRootId]: count }),
      moduleIdMap: idMap,
      lineItemIdMap: liIdMap,
    };
  }

  /**
   * Module or line-item dependency graph from formula edges (legacy shape).
   */
  static async dependencyMap(modelId: string, query: any, user: any) {
    FpaModuleService.assertBuilder(user);
    await FpaModuleService.assertModel(modelId);
    const view = String(query?.view || "MODULE").toUpperCase() === "LINE" ? "LINE" : "MODULE";
    const focusModuleId = query?.moduleId ? String(query.moduleId) : null;

    const modules = await prisma.planningModule.findMany({
      where: { modelId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        lineItems: {
          select: { id: true, code: true, name: true, lineItemType: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    const lineItems = await prisma.planningLineItem.findMany({
      where: { modelId, ...(focusModuleId ? { moduleId: focusModuleId } : {}) },
      select: { id: true, code: true, name: true, moduleId: true, lineItemType: true },
    });
    const formulas = await prisma.planningFormula.findMany({
      where: { modelId },
      include: {
        lineItem: { select: { id: true, code: true, name: true, moduleId: true } },
        dependenciesAsSource: {
          include: { dependsOn: { include: { lineItem: { select: { id: true, code: true, name: true, moduleId: true } } } } },
        },
      },
    });

    const allLines = await prisma.planningLineItem.findMany({
      where: { modelId },
      select: { id: true, code: true, name: true, moduleId: true, lineItemType: true },
    });
    const allByCode = Object.fromEntries(allLines.map((l) => [l.code, l]));

    if (view === "LINE") {
      const nodes = (focusModuleId ? lineItems : allLines).map((l) => ({
        id: l.id,
        type: "LINE",
        label: l.name,
        code: l.code,
        moduleId: l.moduleId,
        lineItemType: l.lineItemType,
      }));
      const edges: any[] = [];
      const seen = new Set<string>();
      for (const f of formulas) {
        const target = f.lineItem;
        if (!target) continue;
        if (focusModuleId && target.moduleId !== focusModuleId) continue;
        for (const d of f.dependenciesAsSource) {
          const src = d.dependsOn?.lineItem;
          if (!src) continue;
          const key = `${src.id}->${target.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push({ from: src.id, to: target.id, kind: "DIRECT", fromLabel: src.name, toLabel: target.name });
        }
        for (const code of FpaFormulaEngine.extractLineCodes(f.expression)) {
          const src = allByCode[String(code).toUpperCase()];
          if (!src || src.id === target.id) continue;
          const key = `${src.id}->${target.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push({ from: src.id, to: target.id, kind: "DIRECT", fromLabel: src.name, toLabel: target.name });
        }
      }
      return { view, modelId, nodes, edges };
    }

    const nodes = modules.map((m) => ({
      id: m.id,
      type: "MODULE",
      label: m.name,
      code: m.code,
      lineItems: m.lineItems.map((li) => li.name),
      lineItemIds: m.lineItems.map((li) => li.id),
    }));
    const moduleEdges = new Map<string, { from: string; to: string; kind: string; via?: string }>();
    for (const f of formulas) {
      const targetMod = f.lineItem?.moduleId;
      if (!targetMod) continue;
      const codes = FpaFormulaEngine.extractLineCodes(f.expression);
      for (const code of codes) {
        const src = allByCode[String(code).toUpperCase()];
        if (!src?.moduleId || src.moduleId === targetMod) continue;
        const key = `${src.moduleId}->${targetMod}`;
        if (!moduleEdges.has(key)) {
          moduleEdges.set(key, {
            from: src.moduleId,
            to: targetMod,
            kind: "DIRECT",
            via: `${src.name} → ${f.lineItem?.name}`,
          });
        }
      }
      for (const d of f.dependenciesAsSource) {
        const srcMod = d.dependsOn?.lineItem?.moduleId;
        if (!srcMod || srcMod === targetMod) continue;
        const key = `${srcMod}->${targetMod}`;
        if (!moduleEdges.has(key)) {
          moduleEdges.set(key, {
            from: srcMod,
            to: targetMod,
            kind: "DIRECT",
            via: `${d.dependsOn.lineItem?.name} → ${f.lineItem?.name}`,
          });
        }
      }
    }
    return {
      view,
      modelId,
      focusModuleId,
      nodes: focusModuleId
        ? nodes.filter(
            (n) => n.id === focusModuleId || moduleEdges.has(`${n.id}->${focusModuleId}`) || moduleEdges.has(`${focusModuleId}->${n.id}`)
          )
        : nodes,
      edges: [...moduleEdges.values()],
    };
  }

  /** FE §H dependency-graph shape */
  static async dependencyGraph(modelId: string, query: any, user: any) {
    FpaModuleService.assertBuilder(user);
    await FpaModuleService.assertModel(modelId);
    // Auto-heal seed formulas so graph edges appear for older models
    try {
      const { FpaModelService } = await import("./FpaModelService");
      await FpaModelService.ensureDefaultFormulas(modelId, user?.id || "system");
    } catch {
      /* non-fatal */
    }
    const focusModuleId = query?.moduleId ? String(query.moduleId) : null;
    const viewRaw = String(query?.view || "module").toLowerCase();
    const lineItemView = viewRaw === "line-item" || viewRaw === "line" || viewRaw === "line_item";

    const allModules = await prisma.planningModule.findMany({
      where: { modelId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        lineItems: {
          select: { id: true, code: true, name: true, lineItemType: true, moduleId: true, isEditable: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    const allLines = await prisma.planningLineItem.findMany({
      where: { modelId },
      select: { id: true, code: true, name: true, moduleId: true, lineItemType: true, isEditable: true },
    });
    const byCode = Object.fromEntries(allLines.map((l) => [l.code, l]));
    const byId = Object.fromEntries(allLines.map((l) => [l.id, l]));

    const formulas = await prisma.planningFormula.findMany({
      where: { modelId },
      include: { lineItem: { select: { id: true, code: true, name: true, moduleId: true } } },
    });

    const directEdges: Array<{ id: string; sourceLineItemId: string; targetLineItemId: string; kind: string }> = [];
    const seen = new Set<string>();
    const adj: Record<string, string[]> = {};

    for (const f of formulas) {
      const target = f.lineItem;
      if (!target) continue;
      const keys = FpaFormulaEngine.extractDependencyKeys(f.expression);
      for (const key of keys) {
        const src =
          byCode[String(key).toUpperCase()] ||
          allLines.find((l) => l.name.toLowerCase() === String(key).toLowerCase()) ||
          allLines.find((l) => l.code.toUpperCase() === String(key).toUpperCase().replace(/\s+/g, "_"));
        if (!src || src.id === target.id) continue;
        const edgeKey = `${src.id}->${target.id}`;
        if (seen.has(edgeKey)) continue;
        seen.add(edgeKey);
        let kind = "direct";
        if (src.moduleId && target.moduleId && src.moduleId !== target.moduleId) kind = "external";
        if (f.isValid === false) kind = "invalid";
        directEdges.push({
          id: `e_${src.id}_${target.id}`,
          sourceLineItemId: src.id,
          targetLineItemId: target.id,
          kind,
        });
        if (!adj[src.id]) adj[src.id] = [];
        adj[src.id].push(target.id);
      }
    }

    const indirect: typeof directEdges = [];
    for (const e1 of directEdges) {
      for (const mid of adj[e1.targetLineItemId] || []) {
        const key = `${e1.sourceLineItemId}->${mid}`;
        if (seen.has(key) || e1.sourceLineItemId === mid) continue;
        seen.add(key);
        indirect.push({
          id: `e_ind_${e1.sourceLineItemId}_${mid}`,
          sourceLineItemId: e1.sourceLineItemId,
          targetLineItemId: mid,
          kind: "indirect",
        });
      }
    }

    const edges = [...directEdges, ...indirect];

    const depGraph: Record<string, string[]> = {};
    for (const f of formulas) {
      const code = f.lineItem?.code;
      if (!code) continue;
      depGraph[code] = FpaFormulaEngine.extractDependencyKeys(f.expression)
        .map((k) => {
          const src =
            byCode[String(k).toUpperCase()] ||
            allLines.find((l) => l.name.toLowerCase() === String(k).toLowerCase());
          return src?.code;
        })
        .filter(Boolean);
    }
    const circular = FpaFormulaEngine.detectCircular(depGraph);

    function liKind(li: any): string {
      const t = String(li.lineItemType || "").toUpperCase();
      if (["CALCULATED", "CALC", "FX"].includes(t)) return "CALCULATED";
      if (t === "INPUT" || t === "DRIVER") return "INPUT";
      if (!li.isEditable) return "CALCULATED";
      return "INPUT";
    }

    const modulesOut = (focusModuleId ? allModules.filter((m) => m.id === focusModuleId) : allModules).map((m) => ({
      id: m.id,
      name: m.name,
      lineItems: m.lineItems.map((li) => ({ id: li.id, code: li.code, name: li.name, kind: liKind(li) })),
    }));

    const finalModules =
      modulesOut.length > 0
        ? modulesOut
        : [
            {
              id: "unassigned",
              name: "Unassigned",
              lineItems: allLines.map((li) => ({
                id: li.id,
                code: li.code,
                name: li.name,
                kind: liKind(li),
              })),
            },
          ];

    const filteredEdges = focusModuleId
      ? edges.filter((e) => {
          const s = byId[e.sourceLineItemId];
          const t = byId[e.targetLineItemId];
          return s?.moduleId === focusModuleId || t?.moduleId === focusModuleId;
        })
      : edges;

    const nodeIds = new Set<string>();
    for (const m of finalModules) {
      for (const li of m.lineItems || []) nodeIds.add(li.id);
    }
    for (const e of filteredEdges) {
      nodeIds.add(e.sourceLineItemId);
      nodeIds.add(e.targetLineItemId);
    }
    const nodes = [...nodeIds]
      .map((id) => byId[id])
      .filter(Boolean)
      .map((li) => ({
        id: li.id,
        code: li.code,
        name: li.name,
        moduleId: li.moduleId || null,
        kind: liKind(li),
      }));

    return {
      circular: !!circular.circular,
      circularPath: circular.circular ? circular.path || [] : [],
      view: lineItemView ? "line-item" : "module",
      modules: finalModules,
      nodes,
      edges: filteredEdges,
    };
  }

  static async enrichedValidate(modelId: string) {
    const base = await FpaModelSetupService.validate(modelId);
    const lineItems = await prisma.planningLineItem.findMany({
      where: { modelId },
      select: { id: true, code: true, name: true, lineItemType: true, isEditable: true, moduleId: true },
    });
    const liById = Object.fromEntries(lineItems.map((l) => [l.id, l]));

    const issues: any[] = (base.errors || []).map((e: any) => ({
      severity: "ERROR",
      impact:
        e.code === "INVALID_FORMULA" ||
        e.code === "UNKNOWN_LINE_REF" ||
        e.code === "MISSING_SCOPE" ||
        e.code === "MISSING_COA"
          ? "HIGH"
          : "MEDIUM",
      code: e.code,
      type: e.step || "SETUP",
      category:
        e.code === "MISSING_SCOPE" || e.code === "MISSING_COA" || e.code === "MISSING_DIMENSION"
          ? e.code === "MISSING_DIMENSION"
            ? "DIMENSION"
            : "DATA_TYPE"
          : issueCategory(e.step || e.code),
      message: e.message,
      lineItemId: null,
      moduleId: null,
      field: null,
      step: e.step,
      blocksPublish: true,
    }));

    // Soft-validate for Detailed editing: missing scope/COA do not fail draft health,
    // but still block publish via blocksPublish + SETUP_BLOCK.
    const modelMeta = await prisma.planningModel.findUnique({
      where: { id: modelId },
      select: { status: true },
    });
    const status = String(modelMeta?.status || "").toUpperCase();
    const softSetup = status !== "PUBLISHED" && status !== "LOCKED";
    if (softSetup) {
      for (const i of issues) {
        if (i.code === "MISSING_SCOPE" || i.code === "MISSING_COA") {
          i.severity = "WARNING";
          i.impact = "MEDIUM";
          i.blocksPublish = true;
          i.message =
            i.code === "MISSING_SCOPE"
              ? "Scope not bound yet — required before publish (ok for Detailed draft editing)"
              : "COA not bound yet — required before publish (ok for Detailed draft editing)";
        }
      }
    }

    const formulas = await prisma.planningFormula.findMany({
      where: { modelId },
      include: { lineItem: { select: { id: true, code: true, name: true, moduleId: true } } },
    });
    const allLines = lineItems;
    const byCode = Object.fromEntries(
      allLines.map((l) => [String(l.code || "").toUpperCase(), l])
    );
    const codeSet = new Set(lineItems.map((l) => String(l.code || "").toUpperCase()));

    const depGraph: Record<string, string[]> = {};
    for (const f of formulas) {
      const code = f.lineItem?.code;
      if (!code) continue;
      depGraph[code] = FpaFormulaEngine.extractDependencyKeys(f.expression)
        .map((k) => {
          const src =
            byCode[String(k).toUpperCase()] ||
            allLines.find((l) => l.name.toLowerCase() === String(k).toLowerCase()) ||
            allLines.find(
              (l) =>
                String(l.code || "").toUpperCase() ===
                String(k).toUpperCase().replace(/\s+/g, "_")
            );
          return src?.code;
        })
        .filter(Boolean);
    }
    const circular = FpaFormulaEngine.detectCircular(depGraph);
    if (circular.circular) {
      const path = circular.path || [];
      const firstCode = path[0];
      const firstLi = lineItems.find((l) => l.code === firstCode);
      issues.push({
        severity: "ERROR",
        impact: "HIGH",
        code: "CIRCULAR_REFERENCE",
        type: "DEPENDENCY",
        category: "DEPENDENCY",
        message: `Circular reference detected`,
        lineItemId: firstLi?.id || null,
        moduleId: firstLi?.moduleId || null,
        field: firstLi?.name || firstCode || null,
        cyclePath: path,
      });
    }

    for (const f of formulas) {
      if (f.isValid === false) {
        issues.push({
          severity: "ERROR",
          impact: "HIGH",
          code: "INVALID_FORMULA",
          type: "FORMULA",
          category: "FORMULA",
          message: f.validationMsg || `Invalid formula on ${f.lineItem?.name || f.lineItemId}`,
          lineItemId: f.lineItemId,
          moduleId: f.lineItem?.moduleId || null,
          field: f.lineItem?.name || null,
        });
      }
      for (const c of FpaFormulaEngine.extractLineCodes(f.expression)) {
        if (!codeSet.has(String(c).toUpperCase())) {
          issues.push({
            severity: "ERROR",
            impact: "HIGH",
            code: "UNKNOWN_LINE_REF",
            type: "FORMULA",
            category: "FORMULA",
            message: `Unknown LINE('${c}') in ${f.lineItem?.name || f.lineItemId}`,
            lineItemId: f.lineItemId,
            moduleId: f.lineItem?.moduleId || null,
            field: f.lineItem?.name || null,
          });
        }
      }
    }

    for (const li of lineItems) {
      const t = String(li.lineItemType || "").toUpperCase();
      if (["CALCULATED", "CALC", "FX"].includes(t) || (!li.isEditable && t !== "INPUT" && t !== "DRIVER")) {
        const has = formulas.some((f) => f.lineItemId === li.id);
        if (!has) {
          issues.push({
            severity: "WARNING",
            impact: "MEDIUM",
            code: "MISSING_FORMULA",
            type: "FORMULA",
            category: "FORMULA",
            message: `Calculated line item ${li.name} has no formula`,
            lineItemId: li.id,
            moduleId: li.moduleId,
            field: li.name,
          });
        }
      }
    }

    const modules = await prisma.planningModule.count({ where: { modelId } });
    if (!modules) {
      issues.push({
        severity: "WARNING",
        impact: "LOW",
        code: "NO_MODULES",
        type: "MODULE",
        category: "DATA_TYPE",
        message: "Model has no modules yet",
        lineItemId: null,
        moduleId: null,
        field: null,
      });
    }

    const seen = new Set<string>();
    const deduped = [];
    for (const i of issues) {
      const k = `${i.code}|${i.message}|${i.lineItemId || ""}`;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(i);
    }

    const errors = deduped.filter((i) => i.severity === "ERROR");
    const warnings = deduped.filter((i) => i.severity === "WARNING");
    const infos = deduped.filter((i) => i.severity === "INFO");
    const checkTotal = Math.max(deduped.length, 1);
    const passedCount = Math.max(0, checkTotal - errors.length - warnings.length);

    const passed = errors.length === 0 && circular.circular !== true;
    const model = await prisma.planningModel.findUnique({ where: { id: modelId }, select: { status: true } });
    // Avoid re-reading status for soft flags — already applied above on issues
    if (model?.status !== "ARCHIVED") {
      let next = passed ? "VALID" : "INVALID";
      if (passed && model?.status === "PUBLISHED") next = "PUBLISHED";
      if (!passed) next = "INVALID";
      // Do not demote PUBLISHED solely from soft setup warnings (already excluded from errors)
      if (model?.status === "PUBLISHED" && passed) next = "PUBLISHED";
      await prisma.planningModel.update({
        where: { id: modelId },
        data: { status: next },
      });
    }

    const circularPath = circular.circular
      ? (circular.path || []).map((code: string) => {
          const li = lineItems.find((l) => l.code === code);
          return li ? `${li.name}` : code;
        })
      : [];

    return {
      passed,
      errors,
      warnings,
      info: infos,
      circular: !!circular.circular,
      circularPath,
      // legacy
      setupErrors: base.errors,
      circularCheck: {
        passed: !circular.circular,
        path: circular.circular ? circular.path || null : null,
      },
      summary: {
        total: errors.length + warnings.length + infos.length + passedCount,
        passed: passedCount,
        warnings: warnings.length,
        errors: errors.length,
        infos: infos.length,
      },
      issues: deduped,
    };
  }

  static async validationSummary(modelId: string, user: any) {
    FpaModuleService.assertBuilder(user);
    // Align donut counts with the fixed validation-checks catalog (not raw issue counts)
    const checksPayload = await FpaModuleService.validationChecks(modelId, user);
    const full = await FpaModuleService.enrichedValidate(modelId);
    return {
      total: checksPayload.summary.total,
      passed: checksPayload.summary.passed,
      warnings: checksPayload.summary.warnings,
      errors: checksPayload.summary.errors,
      infos: full.summary?.infos ?? 0,
      checksPassed: checksPayload.passed,
      circularCheck: full.circularCheck,
      circular: full.circular,
      circularPath: full.circularPath,
      passed: checksPayload.passed,
      issuesSummary: full.summary,
    };
  }

  /**
   * Fixed catalog of validation checks for A.4 donut / checklist UI.
   */
  static async validationChecks(modelId: string, user: any) {
    FpaModuleService.assertBuilder(user);
    await FpaModuleService.assertModel(modelId);
    const full = await FpaModuleService.enrichedValidate(modelId);
    const codes = new Set((full.issues || []).map((i: any) => String(i.code || "")));
    const hasIssue = (code: string, severity?: string) =>
      (full.issues || []).some(
        (i: any) => i.code === code && (!severity || String(i.severity).toUpperCase() === severity)
      );

    const model = await prisma.planningModel.findUnique({
      where: { id: modelId },
      include: {
        versions: { take: 1 },
        scenarios: { take: 1 },
        modelEntities: { take: 1 },
        modelDepartments: { take: 1 },
        modelAccounts: { take: 1 },
        modelDimensions: { take: 1 },
        modules: { take: 1 },
        lineItems: { select: { id: true, code: true } },
        formulas: { select: { id: true, isValid: true, lineItemId: true } },
      },
    });

    const check = (
      key: string,
      label: string,
      state: "PASSED" | "WARNING" | "ERROR",
      detail?: string
    ) => ({ key, label, status: state, detail: detail || null });

    const nameOk = !!model?.name?.trim() && !codes.has("MISSING_NAME");
    const versionScenarioOk =
      !!(model?.versions?.length && model?.scenarios?.length) && !codes.has("MISSING_VERSION");
    const scopeOk =
      !!(model?.modelEntities?.length || model?.modelDepartments?.length) && !codes.has("MISSING_SCOPE");
    const coaOk = !!(model?.modelAccounts?.length) && !codes.has("MISSING_COA");
    const modelStatus = String(model?.status || "").toUpperCase();
    const softSetup = modelStatus !== "PUBLISHED" && modelStatus !== "LOCKED";
    const scopeStatus: "PASSED" | "WARNING" | "ERROR" = scopeOk
      ? "PASSED"
      : softSetup
        ? "WARNING"
        : "ERROR";
    const coaStatus: "PASSED" | "WARNING" | "ERROR" = coaOk ? "PASSED" : softSetup ? "WARNING" : "ERROR";
    const dimsOk = !codes.has("MISSING_DIMENSION");
    const modulesOk = !!(model?.modules?.length) && !codes.has("NO_MODULES");
    const lineItemsOk = !!(model?.lineItems?.length) && !codes.has("NO_LINE_ITEMS");
    const formulasValid = !hasIssue("INVALID_FORMULA", "ERROR") && !hasIssue("UNKNOWN_LINE_REF", "ERROR");
    const circularOk = !full.circular;
    const defaultCodes = new Set((model?.lineItems || []).map((l) => String(l.code || "").toUpperCase()));
    const hasGp = defaultCodes.has("GROSS_PROFIT");
    const hasEbitda = defaultCodes.has("EBITDA");
    const gpFormula = (model?.formulas || []).some((f) => {
      const li = (model?.lineItems || []).find((l) => l.id === f.lineItemId);
      return li && String(li.code).toUpperCase() === "GROSS_PROFIT";
    });
    const ebitdaFormula = (model?.formulas || []).some((f) => {
      const li = (model?.lineItems || []).find((l) => l.id === f.lineItemId);
      return li && String(li.code).toUpperCase() === "EBITDA";
    });
    let defaultFormulasStatus: "PASSED" | "WARNING" | "ERROR" = "PASSED";
    if ((hasGp && !gpFormula) || (hasEbitda && !ebitdaFormula) || hasIssue("MISSING_FORMULA")) {
      defaultFormulasStatus = "WARNING";
    }
    const depOk = circularOk && formulasValid;

    const checks = [
      check("model_name", "Model name", nameOk ? "PASSED" : "ERROR", nameOk ? null : "Name is required"),
      check(
        "version_scenario",
        "Version & scenario",
        versionScenarioOk ? "PASSED" : "ERROR",
        versionScenarioOk ? null : "Working version / BASE scenario missing"
      ),
      check(
        "scope",
        "Entities / departments",
        scopeStatus,
        scopeOk
          ? null
          : softSetup
            ? "Bind scope before publish (ok while drafting)"
            : "Select scope"
      ),
      check(
        "coa",
        "Chart of accounts",
        coaStatus,
        coaOk
          ? null
          : softSetup
            ? "Bind COA before publish (ok while drafting)"
            : "Bind COA accounts"
      ),
      check("dimensions", "Dimensions", dimsOk ? "PASSED" : "WARNING", dimsOk ? null : "Dimension values incomplete"),
      check("modules", "Modules", modulesOk ? "PASSED" : "WARNING", modulesOk ? null : "No modules yet"),
      check("line_items", "Line items", lineItemsOk ? "PASSED" : "ERROR", lineItemsOk ? null : "Add line items"),
      check(
        "formulas_valid",
        "Formulas valid",
        formulasValid ? "PASSED" : "ERROR",
        formulasValid ? null : "Invalid or unknown formula refs"
      ),
      check(
        "circular",
        "No circular references",
        circularOk ? "PASSED" : "ERROR",
        circularOk ? null : (full.circularPath || []).join(" → ")
      ),
      check(
        "default_formulas",
        "Default formulas (GP / EBITDA)",
        defaultFormulasStatus,
        defaultFormulasStatus === "PASSED" ? null : "Seed Gross Profit / EBITDA formulas"
      ),
      check(
        "dependency_graph",
        "Dependency graph",
        depOk ? "PASSED" : "ERROR",
        depOk ? null : "Fix formula graph before publish"
      ),
    ];

    const summary = {
      total: checks.length,
      passed: checks.filter((c) => c.status === "PASSED").length,
      warnings: checks.filter((c) => c.status === "WARNING").length,
      errors: checks.filter((c) => c.status === "ERROR").length,
    };

    return { modelId, summary, checks, passed: summary.errors === 0 };
  }

  static async publish(modelId: string, user: any, ip?: string, body: any = {}) {
    FpaModuleService.assertBuilder(user);
    await FpaModuleService.assertModel(modelId);
    const working =
      (await prisma.planningVersion.findFirst({
        where: { modelId, status: "DRAFT" },
        orderBy: { createdAt: "asc" },
      })) ||
      (await prisma.planningVersion.findFirst({
        where: { modelId, status: { not: "ARCHIVED" } },
        orderBy: { createdAt: "asc" },
      }));
    if (!working) throw new FpaError(400, "VALIDATION", "Model has no version to publish");
    const { FpaVersionService } = await import("./FpaVersionService");
    return FpaVersionService.publish(working.id, user, body, ip);
  }

  static async structureChecksum(modelId: string): Promise<string> {
    const [modules, lineItems, formulas] = await Promise.all([
      prisma.planningModule.findMany({ where: { modelId }, select: { id: true, code: true, name: true, parentId: true } }),
      prisma.planningLineItem.findMany({
        where: { modelId },
        select: { id: true, code: true, name: true, moduleId: true, lineItemType: true },
      }),
      prisma.planningFormula.findMany({ where: { modelId }, select: { lineItemId: true, expression: true } }),
    ]);
    const payload = JSON.stringify({ modules, lineItems, formulas });
    return createHash("sha256").update(payload).digest("hex").slice(0, 32);
  }
}
