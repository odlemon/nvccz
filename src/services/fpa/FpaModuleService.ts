// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";
import { FpaFormulaEngine } from "./FpaFormulaEngine";
import { FpaModelSetupService } from "./FpaModelSetupService";

function userDisplayName(u: any): string | null {
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || null;
}

function slugCode(name: string): string {
  return String(name || "MODULE")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64) || "MODULE";
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
    return {
      id: m.id,
      modelId: m.modelId,
      code: m.code,
      name: m.name,
      description: m.description || null,
      parentId: m.parentId || null,
      calcOrder: m.calcOrder,
      sortOrder: m.sortOrder,
      status: m.status,
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
    // Orphans whose parent is missing
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

    if (input?.parentId) {
      const parent = await FpaModuleService.assertModule(String(input.parentId));
      if (parent.modelId !== modelId) throw new FpaError(400, "VALIDATION", "parentId must be in same model");
    }

    const maxSort = await prisma.planningModule.aggregate({
      where: { modelId },
      _max: { sortOrder: true, calcOrder: true },
    });
    const created = await prisma.planningModule.create({
      data: {
        modelId,
        code,
        name,
        description: input?.description ? String(input.description) : null,
        parentId: input?.parentId ? String(input.parentId) : null,
        calcOrder: input?.calcOrder != null ? Number(input.calcOrder) : (maxSort._max.calcOrder || 0) + 1,
        sortOrder: input?.sortOrder != null ? Number(input.sortOrder) : (maxSort._max.sortOrder || 0) + 1,
        status: "DRAFT",
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
    if (input?.calcOrder != null) data.calcOrder = Number(input.calcOrder);
    if (input?.sortOrder != null) data.sortOrder = Number(input.sortOrder);
    if (input?.status != null) data.status = String(input.status);
    if (input?.parentId !== undefined) {
      const pid = input.parentId ? String(input.parentId) : null;
      if (pid === moduleId) throw new FpaError(400, "VALIDATION", "Module cannot be its own parent");
      if (pid) {
        const parent = await FpaModuleService.assertModule(pid);
        if (parent.modelId !== existing.modelId) {
          throw new FpaError(400, "VALIDATION", "parentId must be in same model");
        }
      }
      data.parentId = pid;
    }
    if (input?.code != null) data.code = String(input.code).toUpperCase().slice(0, 64);

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

  static async deleteModule(moduleId: string, user: any, ip?: string) {
    FpaModuleService.assertBuilder(user);
    const existing = await FpaModuleService.assertModule(moduleId);
    const count = await prisma.planningLineItem.count({ where: { moduleId } });
    if (count > 0) {
      throw new FpaError(409, "MODULE_NOT_EMPTY", `Module has ${count} line item(s); reassign or delete them first`);
    }
    const childCount = await prisma.planningModule.count({ where: { parentId: moduleId } });
    if (childCount > 0) {
      throw new FpaError(409, "MODULE_HAS_CHILDREN", "Reassign or delete child modules first");
    }
    await prisma.planningModule.delete({ where: { id: moduleId } });
    await FpaAuditService.log("MODULE_DELETED", user.id, {
      modelId: existing.modelId,
      oldValue: moduleId,
      reason: existing.name,
      ip,
    });
    return { id: moduleId, deleted: true };
  }

  /**
   * Module or line-item dependency graph from formula edges.
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

    const lineByCode = Object.fromEntries(lineItems.map((l) => [l.code, l]));
    // Also include all model line items for cross-module edges
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
        // Also parse expression for LINE() refs not in dependency table
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

    // MODULE view
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
      nodes: focusModuleId ? nodes.filter((n) => n.id === focusModuleId || moduleEdges.has(`${n.id}->${focusModuleId}`) || moduleEdges.has(`${focusModuleId}->${n.id}`)) : nodes,
      edges: [...moduleEdges.values()],
    };
  }

  static async enrichedValidate(modelId: string) {
    const base = await FpaModelSetupService.validate(modelId);
    const issues: any[] = (base.errors || []).map((e: any) => ({
      severity: "ERROR",
      impact: e.code === "INVALID_FORMULA" || e.code === "UNKNOWN_LINE_REF" ? "HIGH" : "MEDIUM",
      code: e.code,
      type: e.step || "SETUP",
      message: e.message,
      lineItemId: null,
      step: e.step,
    }));

    const formulas = await prisma.planningFormula.findMany({
      where: { modelId },
      include: { lineItem: { select: { id: true, code: true, name: true } } },
    });
    const lineItems = await prisma.planningLineItem.findMany({
      where: { modelId },
      select: { id: true, code: true, name: true, lineItemType: true, isEditable: true },
    });
    const codeSet = new Set(lineItems.map((l) => l.code));

    // Circular check across all formulas
    const depGraph: Record<string, string[]> = {};
    for (const f of formulas) {
      const code = f.lineItem?.code;
      if (!code) continue;
      depGraph[code] = FpaFormulaEngine.extractLineCodes(f.expression).map((c) => String(c).toUpperCase());
    }
    const circular = FpaFormulaEngine.detectCircular(depGraph);
    if (circular.circular) {
      issues.push({
        severity: "ERROR",
        impact: "HIGH",
        code: "CIRCULAR_REFERENCE",
        type: "DEPENDENCY",
        message: `Circular reference: ${(circular.path || []).join(" -> ")}`,
        lineItemId: null,
        cyclePath: circular.path || [],
      });
    }

    for (const f of formulas) {
      if (f.isValid === false) {
        issues.push({
          severity: "ERROR",
          impact: "HIGH",
          code: "INVALID_FORMULA",
          type: "FORMULA",
          message: f.validationMsg || `Invalid formula on ${f.lineItem?.name || f.lineItemId}`,
          lineItemId: f.lineItemId,
        });
      }
      for (const c of FpaFormulaEngine.extractLineCodes(f.expression)) {
        if (!codeSet.has(String(c).toUpperCase())) {
          issues.push({
            severity: "ERROR",
            impact: "HIGH",
            code: "UNKNOWN_LINE_REF",
            type: "FORMULA",
            message: `Unknown LINE('${c}') in ${f.lineItem?.name || f.lineItemId}`,
            lineItemId: f.lineItemId,
          });
        }
      }
    }

    // Calculated-like items without formulas → warning
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
            message: `Calculated line item ${li.name} has no formula`,
            lineItemId: li.id,
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
        message: "Model has no modules yet",
        lineItemId: null,
      });
    }

    // Dedupe by code+message+lineItemId
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
    if (model?.status !== "ARCHIVED") {
      let next = passed ? "VALID" : "INVALID";
      if (passed && model?.status === "PUBLISHED") next = "PUBLISHED";
      if (!passed) next = "INVALID";
      await prisma.planningModel.update({
        where: { id: modelId },
        data: { status: next },
      });
    }

    return {
      passed,
      errors: base.errors,
      circularCheck: {
        passed: !circular.circular,
        path: circular.circular ? circular.path || [] : null,
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
    const full = await FpaModuleService.enrichedValidate(modelId);
    return {
      ...full.summary,
      circularCheck: full.circularCheck,
      passed: full.passed,
    };
  }

  static async publish(modelId: string, user: any, ip?: string) {
    FpaModuleService.assertBuilder(user);
    await FpaModuleService.assertModel(modelId);
    const validation = await FpaModuleService.enrichedValidate(modelId);
    if (!validation.passed || !validation.circularCheck.passed) {
      throw new FpaError(
        409,
        "PUBLISH_BLOCKED",
        "Fix validation errors before publishing",
        (validation.issues || [])
          .filter((i: any) => i.severity === "ERROR")
          .map((i: any) => ({ code: i.code, message: i.message, step: i.type }))
      );
    }
    const updated = await prisma.planningModel.update({
      where: { id: modelId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        publishedById: user.id,
      },
    });
    await FpaAuditService.log("MODEL_PUBLISHED", user.id, {
      modelId,
      reason: "Model published for Model Planning",
      ip,
    });
    const publisher = await prisma.user.findUnique({
      where: { id: user.id },
      select: { firstName: true, lastName: true, email: true },
    });
    return {
      id: updated.id,
      status: updated.status,
      publishedAt: updated.publishedAt,
      publishedById: updated.publishedById,
      publishedByName: userDisplayName(publisher),
      validationSummary: validation.summary,
    };
  }
}
