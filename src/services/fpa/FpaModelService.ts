// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";
import { FpaFormulaEngine } from "./FpaFormulaEngine";

const DEFAULT_LINE_ITEMS = [
  { code: "REVENUE", name: "Revenue", lineItemType: "INPUT", category: "REVENUE", sortOrder: 10 },
  { code: "COGS", name: "COGS", lineItemType: "INPUT", category: "EXPENSE", sortOrder: 20 },
  { code: "GROSS_PROFIT", name: "Gross Profit", lineItemType: "CALCULATED", category: "REVENUE", sortOrder: 30, isEditable: false },
  { code: "SALARIES", name: "Salaries", lineItemType: "INPUT", category: "WORKFORCE", sortOrder: 40 },
  { code: "RENT", name: "Rent", lineItemType: "INPUT", category: "EXPENSE", sortOrder: 50 },
  { code: "MARKETING", name: "Marketing", lineItemType: "INPUT", category: "EXPENSE", sortOrder: 60 },
  { code: "EBITDA", name: "EBITDA", lineItemType: "CALCULATED", category: "REVENUE", sortOrder: 70, isEditable: false },
  { code: "HEADCOUNT", name: "Headcount", lineItemType: "DRIVER", category: "WORKFORCE", dataType: "NUMBER", sortOrder: 80 },
  { code: "CLOSING_CASH", name: "Closing Cash", lineItemType: "INPUT", category: "CASH", sortOrder: 90 },
];

/** Seed formulas for calculated defaults (LINE() dialect). */
const DEFAULT_FORMULAS: Array<{ code: string; expression: string }> = [
  { code: "GROSS_PROFIT", expression: "LINE('REVENUE') - LINE('COGS')" },
  {
    code: "EBITDA",
    expression: "LINE('GROSS_PROFIT') - LINE('SALARIES') - LINE('RENT') - LINE('MARKETING')",
  },
];

const DEFAULT_MODULES: Array<{ code: string; name: string; categories: string[] }> = [
  { code: "REVENUE", name: "Revenue Planning", categories: ["REVENUE"] },
  { code: "EXPENSE", name: "Expense Planning", categories: ["EXPENSE"] },
  { code: "WORKFORCE", name: "Workforce", categories: ["WORKFORCE"] },
  { code: "CASH", name: "Cash", categories: ["CASH"] },
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

      // Default modules + assign line items by category
      const moduleByCategory: Record<string, string> = {};
      for (let i = 0; i < DEFAULT_MODULES.length; i++) {
        const mod = DEFAULT_MODULES[i];
        const row = await tx.planningModule.create({
          data: {
            modelId: created.id,
            code: mod.code,
            name: mod.name,
            calcOrder: i + 1,
            sortOrder: i + 1,
            status: "DRAFT",
            dimensionKeys: ["Time", "Product", "Region", "Version", "Scenario"],
          },
        });
        for (const cat of mod.categories) moduleByCategory[cat] = row.id;
      }
      for (const li of lineItems) {
        const moduleId = moduleByCategory[li.category] || null;
        if (moduleId) {
          await tx.planningLineItem.update({ where: { id: li.id }, data: { moduleId } });
          li.moduleId = moduleId;
        }
      }

      // Seed formulas for calculated line items
      const byCode = Object.fromEntries(lineItems.map((l) => [l.code, l]));
      const formulaRows = [];
      for (const df of DEFAULT_FORMULAS) {
        const li = byCode[df.code];
        if (!li) continue;
        formulaRows.push(
          await tx.planningFormula.create({
            data: {
              modelId: created.id,
              lineItemId: li.id,
              expression: df.expression,
              isValid: true,
              validationMsg: null,
              createdById: userId,
            },
          })
        );
      }
      // Wire formula dependencies where both sides have formulas
      const formulaByLiCode: Record<string, string> = {};
      for (const f of formulaRows) {
        const li = lineItems.find((x) => x.id === f.lineItemId);
        if (li) formulaByLiCode[li.code] = f.id;
      }
      for (const f of formulaRows) {
        for (const code of FpaFormulaEngine.extractLineCodes(f.expression)) {
          const depId = formulaByLiCode[String(code).toUpperCase()];
          if (depId && depId !== f.id) {
            await tx.planningFormulaDependency
              .create({ data: { formulaId: f.id, dependsOnFormulaId: depId } })
              .catch(() => null);
          }
        }
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

      return {
        ...created,
        defaultScenarioId: scenario.id,
        defaultVersionId: version.id,
        versions: [{ id: version.id, name: version.name, status: version.status }],
        scenarios: [{ id: scenario.id, name: scenario.name, isDefault: true, isOfficial: scenario.isOfficial }],
        lineItemCount: lineItems.length,
        cellCount: cellRows.length,
      };
    });

    await FpaAuditService.log("MODEL_CREATE", userId, { modelId: model.id, ip });
    return model;
  }

  /**
   * Idempotent: seed Gross Profit / EBITDA formulas (and formula deps) when missing.
   * Safe to call for older models created before default formula seeding.
   */
  static async ensureDefaultFormulas(modelId: string, userId: string) {
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");

    const lineItems = await prisma.planningLineItem.findMany({ where: { modelId } });
    const byCode = Object.fromEntries(lineItems.map((l) => [l.code, l]));
    const created = [];

    for (const df of DEFAULT_FORMULAS) {
      const li = byCode[df.code];
      if (!li) continue;
      const existing = await prisma.planningFormula.findFirst({ where: { lineItemId: li.id } });
      if (existing) continue;
      // Also accept CALC / CALCULATED type rename
      const formula = await prisma.planningFormula.create({
        data: {
          modelId,
          lineItemId: li.id,
          expression: df.expression,
          isValid: true,
          validationMsg: null,
          createdById: userId,
        },
      });
      // Normalize type to CALCULATED for inspector
      if (["CALC", "FX"].includes(String(li.lineItemType).toUpperCase())) {
        await prisma.planningLineItem.update({
          where: { id: li.id },
          data: { lineItemType: "CALCULATED", isEditable: false },
        });
      }
      created.push(formula);
    }

    const allFormulas = await prisma.planningFormula.findMany({
      where: { modelId },
      include: { lineItem: true },
    });
    const formulaByLiCode: Record<string, string> = {};
    for (const f of allFormulas) {
      if (f.lineItem?.code) formulaByLiCode[f.lineItem.code] = f.id;
    }
    for (const f of allFormulas) {
      for (const code of FpaFormulaEngine.extractLineCodes(f.expression)) {
        const depId = formulaByLiCode[String(code).toUpperCase()];
        if (depId && depId !== f.id) {
          await prisma.planningFormulaDependency
            .create({ data: { formulaId: f.id, dependsOnFormulaId: depId } })
            .catch(() => null);
        }
      }
    }

    if (created.length) {
      await FpaAuditService.log("MODEL_SEED_FORMULAS", userId, {
        modelId,
        reason: `Seeded ${created.length} default formula(s)`,
      });
    }

    return {
      modelId,
      formulasCreated: created.length,
      formulas: created,
    };
  }

  static async list(query: any = {}) {
    const where: any = {};
    if (query.status) where.status = String(query.status);
    if (query.ownerUserId) where.ownerUserId = String(query.ownerUserId);
    if (query.q) {
      const q = String(query.q).trim();
      where.OR = [
        { name: { contains: q } },
        { modelType: { contains: q } },
        { status: { contains: q } },
      ];
    }
    const rows = await prisma.planningModel.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { lineItems: true, scenarios: true, versions: true } },
      },
    });
    return rows.map((m) => {
      const ownerName = m.owner
        ? [m.owner.firstName, m.owner.lastName].filter(Boolean).join(" ").trim() || m.owner.email
        : null;
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        modelType: m.modelType,
        status: m.status,
        baseCurrency: m.baseCurrency,
        startPeriod: m.startPeriod,
        endPeriod: m.endPeriod,
        timeGranularity: m.timeGranularity,
        updatedAt: m.updatedAt,
        createdAt: m.createdAt,
        publishedAt: m.publishedAt,
        ownerUserId: m.ownerUserId,
        ownerName,
        _count: m._count,
      };
    });
  }

  static async get(modelId: string) {
    const model = await prisma.planningModel.findUnique({
      where: { id: modelId },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        scenarios: { orderBy: { createdAt: "asc" } },
        versions: { orderBy: { createdAt: "asc" } },
        modelEntities: true,
        modelDepartments: true,
        modelAccounts: true,
        modelDimensions: { include: { dimension: true } },
        modelDimensionMembers: true,
        drivers: { take: 50, orderBy: { code: "asc" } },
        workflows: { take: 10, orderBy: { createdAt: "desc" }, include: { tasks: true } },
      },
    });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");

    const publisherIds = [
      model.publishedById,
      ...model.versions.map((v) => v.publishedById).filter(Boolean),
    ].filter(Boolean);
    const uniquePublisherIds = [...new Set(publisherIds.map(String))];
    const publishers =
      uniquePublisherIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: uniquePublisherIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [];
    const nameById = Object.fromEntries(
      publishers.map((u) => {
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || null;
        return [u.id, name];
      })
    );

    const publishedByName = model.publishedById ? nameById[model.publishedById] || null : null;
    const versions = model.versions.map((v) => ({
      ...v,
      publishedByName: v.publishedById ? nameById[v.publishedById] || null : null,
    }));

    return {
      ...model,
      versions,
      publishedByName,
      entityIds: model.modelEntities.map((e) => e.entityId),
      departmentIds: model.modelDepartments.map((d) => d.departmentId),
      accountIds: model.modelAccounts.map((a) => a.accountId),
      dimensions: model.modelDimensions.map((l) => ({
        key: l.dimension.code,
        dimensionId: l.dimensionId,
        valueIds: model.modelDimensionMembers.filter((m) => m.dimensionId === l.dimensionId).map((m) => m.memberId),
      })),
      defaultScenarioId: model.scenarios.find((s) => s.isOfficial)?.id || model.scenarios[0]?.id || null,
      defaultVersionId: versions.find((v) => String(v.status).toUpperCase() !== "ARCHIVED")?.id || versions[0]?.id || null,
    };
  }

  static async update(modelId: string, input: any, userId: string, ip?: string) {
    await FpaModelService.get(modelId);
    const { FpaModelSetupService } = await import("./FpaModelSetupService");
    const data: any = { updatedById: userId };
    if (input.name != null) data.name = String(input.name);
    if (input.description != null) data.description = input.description;
    if (input.modelType != null) data.modelType = String(input.modelType);
    if (input.baseCurrency != null) data.baseCurrency = String(input.baseCurrency).toUpperCase().slice(0, 3);
    if (input.status != null) data.status = String(input.status);
    if (input.startPeriod != null) data.startPeriod = new Date(input.startPeriod);
    if (input.endPeriod != null) data.endPeriod = new Date(input.endPeriod);
    if (input.timeGranularity != null) data.timeGranularity = String(input.timeGranularity);
    await prisma.planningModel.update({ where: { id: modelId }, data });

    // Scope + COA must round-trip on GET when sent on PUT (FE single-setup form).
    // Only touch join tables when keys are present so metadata-only PUTs do not wipe them.
    if (Array.isArray(input.entityIds) || Array.isArray(input.departmentIds)) {
      const current = await FpaModelSetupService.getScope(modelId);
      await FpaModelSetupService.setScope(
        modelId,
        {
          entityIds: Array.isArray(input.entityIds) ? input.entityIds : current.entityIds,
          departmentIds: Array.isArray(input.departmentIds) ? input.departmentIds : current.departmentIds,
        },
        userId,
        ip
      );
    }
    if (Array.isArray(input.accountIds)) {
      await FpaModelSetupService.setCoa(
        modelId,
        { accountIds: input.accountIds, entityId: input.entityId },
        userId,
        ip
      );
    }

    await FpaAuditService.log("MODEL_UPDATE", userId, { modelId, ip });
    return FpaModelService.get(modelId);
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
