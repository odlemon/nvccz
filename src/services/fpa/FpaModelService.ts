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

/** Prefer DRAFT working copy so sheets don't default onto a LOCKED published snapshot. */
function pickDefaultVersionId(versions: Array<{ id: string; status: string }>): string | null {
  if (!versions?.length) return null;
  const statusOf = (v: { status: string }) => String(v.status).toUpperCase();
  const draft = versions.find((v) => statusOf(v) === "DRAFT");
  if (draft) return draft.id;
  const editable = versions.find((v) => !["ARCHIVED", "LOCKED"].includes(statusOf(v)));
  if (editable) return editable.id;
  const locked = versions.find((v) => statusOf(v) === "LOCKED");
  if (locked) return locked.id;
  return versions.find((v) => statusOf(v) !== "ARCHIVED")?.id || versions[0]?.id || null;
}

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

function deriveModelCode(name: string, input: any = {}): string {
  if (input.code != null && String(input.code).trim()) {
    return String(input.code).trim().slice(0, 255);
  }
  const slug = String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return slug || `MODEL_${Date.now()}`;
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
          code: deriveModelCode(name, input),
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
        entityType: "formula",
        summary: `Seeded ${created.length} default formula(s)`,
        reason: JSON.stringify({ summary: `Seeded ${created.length} default formula(s)` }),
      });
    }

    return {
      modelId,
      formulasCreated: created.length,
      formulas: created,
    };
  }

  /**
   * Idempotent Detailed-demo structure for sparse drafts:
   * UNITS + PRICE (INPUT with monthly values) → GROSS_REVENUE (CALC) → NET_REVENUE dependent.
   */
  static async ensureDemoDetailedStructure(modelId: string, userId: string, ip?: string) {
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");

    let module =
      (await prisma.planningModule.findFirst({
        where: { modelId, OR: [{ code: "REVENUE" }, { name: { contains: "Revenue" } }] },
      })) ||
      (await prisma.planningModule.findFirst({ where: { modelId }, orderBy: { sortOrder: "asc" } }));

    if (!module) {
      module = await prisma.planningModule.create({
        data: {
          modelId,
          code: "REVENUE",
          name: "Revenue Planning",
          sortOrder: 10,
          calcOrder: 10,
          status: "DRAFT",
        },
      });
    }

    const wanted = [
      {
        code: "UNITS",
        name: "Units Sold",
        lineItemType: "INPUT",
        category: "REVENUE",
        dataType: "NUMBER",
        isEditable: true,
        sortOrder: 5,
        monthly: 1200,
      },
      {
        code: "PRICE",
        name: "Average Price",
        lineItemType: "INPUT",
        category: "REVENUE",
        dataType: "CURRENCY",
        isEditable: true,
        sortOrder: 6,
        monthly: 185,
      },
      {
        code: "GROSS_REVENUE",
        name: "Gross Revenue",
        lineItemType: "CALCULATED",
        category: "REVENUE",
        dataType: "CURRENCY",
        isEditable: false,
        sortOrder: 7,
        expression: "LINE('UNITS')*LINE('PRICE')",
      },
      {
        code: "NET_REVENUE",
        name: "Net Revenue",
        lineItemType: "CALCULATED",
        category: "REVENUE",
        dataType: "CURRENCY",
        isEditable: false,
        sortOrder: 8,
        expression: "LINE('GROSS_REVENUE')",
      },
    ];

    const existing = await prisma.planningLineItem.findMany({ where: { modelId } });
    const byCode = Object.fromEntries(existing.map((l) => [String(l.code).toUpperCase(), l]));
    const createdLis = [];
    for (const w of wanted) {
      if (byCode[w.code]) continue;
      const li = await prisma.planningLineItem.create({
        data: {
          modelId,
          moduleId: module.id,
          code: w.code,
          name: w.name,
          lineItemType: w.lineItemType,
          category: w.category,
          dataType: w.dataType || "CURRENCY",
          summaryMethod: "SUM",
          isEditable: w.isEditable !== false,
          sortOrder: w.sortOrder,
        },
      });
      byCode[w.code] = li;
      createdLis.push(li);
    }

    // Attach orphan INPUT NET_REVENUE-style draft driver to module if present without module
    for (const li of existing) {
      if (!li.moduleId && String(li.code).toUpperCase() === "NET_REVENUE") {
        await prisma.planningLineItem.update({
          where: { id: li.id },
          data: { moduleId: module.id },
        });
      }
    }

    const formulasWanted = wanted.filter((w) => w.expression);
    let formulasCreated = 0;
    for (const w of formulasWanted) {
      const li = byCode[w.code];
      if (!li) continue;
      const existingF = await prisma.planningFormula.findFirst({ where: { lineItemId: li.id } });
      if (existingF) {
        // Upgrade sparse DRIVER NET_REVENUE (no formula / wrong type) when we own GROSS_REVENUE
        if (
          String(li.code).toUpperCase() === "NET_REVENUE" &&
          String(li.lineItemType).toUpperCase() === "DRIVER" &&
          byCode.GROSS_REVENUE
        ) {
          await prisma.planningLineItem.update({
            where: { id: li.id },
            data: { lineItemType: "CALCULATED", isEditable: false, moduleId: module.id },
          });
          await prisma.planningFormula.update({
            where: { id: existingF.id },
            data: { expression: w.expression, isValid: true, validationMsg: null },
          });
        }
        continue;
      }
      // If NET_REVENUE already exists as INPUT/DRIVER with no formula — promote
      if (["INPUT", "DRIVER"].includes(String(li.lineItemType).toUpperCase()) && w.code === "NET_REVENUE") {
        await prisma.planningLineItem.update({
          where: { id: li.id },
          data: { lineItemType: "CALCULATED", isEditable: false, moduleId: module.id },
        });
      }
      await prisma.planningFormula.create({
        data: {
          modelId,
          lineItemId: li.id,
          expression: w.expression,
          isValid: true,
          validationMsg: null,
          createdById: userId,
        },
      });
      formulasCreated += 1;
    }

    await FpaModelService.ensureDefaultFormulas(modelId, userId);

    const version =
      (await prisma.planningVersion.findFirst({
        where: { modelId, status: "DRAFT" },
        orderBy: { createdAt: "asc" },
      })) ||
      (await prisma.planningVersion.findFirst({
        where: { modelId, status: { not: "ARCHIVED" } },
        orderBy: { createdAt: "asc" },
      }));
    const scenario =
      (await prisma.planningScenario.findFirst({
        where: { modelId, isOfficial: true },
      })) || (await prisma.planningScenario.findFirst({ where: { modelId } }));

    let cellsSeeded = 0;
    let cellsValued = 0;
    if (version && scenario) {
      const { FpaVersionService } = await import("./FpaVersionService");
      const seeded = await FpaVersionService.seedCells(
        version.id,
        { scenarioId: scenario.id, fillMissing: true },
        userId,
        ip
      );
      cellsSeeded = seeded.cellsSeeded || 0;

      const periods = monthStarts(new Date(model.startPeriod), new Date(model.endPeriod));
      for (const w of wanted) {
        if (w.monthly == null) continue;
        const li = byCode[w.code];
        if (!li) continue;
        for (const periodDate of periods) {
          const cells = await prisma.planningCell.findMany({
            where: {
              versionId: version.id,
              scenarioId: scenario.id,
              lineItemId: li.id,
              periodDate,
            },
            orderBy: { updatedAt: "desc" },
          });
          const keep = cells.find((c) => c.value != null) || cells[0];
          if (!keep) continue;
          if (keep.value == null) {
            await prisma.planningCell.update({
              where: { id: keep.id },
              data: {
                value: w.monthly,
                valueType: "INPUT",
                sourceType: "MANUAL",
                lastUpdatedById: userId,
                lastUpdatedAt: new Date(),
              },
            });
            cellsValued += 1;
          }
          // Remove null duplicates for this coord
          for (const c of cells) {
            if (c.id !== keep.id && c.value == null) {
              await prisma.planningCell.delete({ where: { id: c.id } }).catch(() => null);
            }
          }
        }
      }

      // Run calc so GROSS_REVENUE / NET_REVENUE populate (two hops)
      const { FpaGridService } = await import("./FpaGridService");
      for (const code of ["UNITS", "PRICE", "GROSS_REVENUE"]) {
        const li = byCode[code];
        if (!li) continue;
        const sample = await prisma.planningCell.findFirst({
          where: {
            versionId: version.id,
            scenarioId: scenario.id,
            lineItemId: li.id,
            value: { not: null },
          },
        });
        if (sample) await FpaGridService.recalculateDependents(sample, userId);
      }
    }

    await FpaAuditService.log("MODEL_SEED_DEMO_STRUCTURE", userId, {
      modelId,
      moduleId: module.id,
      entityType: "line_item",
      summary: `Seeded Detailed demo structure (LIs=${createdLis.length}, formulas=${formulasCreated}, valued=${cellsValued})`,
      reason: JSON.stringify({
        summary: `Seeded Detailed demo structure (LIs=${createdLis.length}, formulas=${formulasCreated}, valued=${cellsValued})`,
        lineItemsCreated: createdLis.map((l) => l.code),
        formulasCreated,
        cellsSeeded,
        cellsValued,
      }),
      ip,
    });

    return {
      modelId,
      moduleId: module.id,
      lineItemsCreated: createdLis.length,
      formulasCreated,
      cellsSeeded,
      cellsValued,
      versionId: version?.id || null,
      scenarioId: scenario?.id || null,
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
      // Prefer editable working copy over published LOCKED snapshot so Budget/Planning
      // sheets opened from the model land on the open cycle's version, not a closed book.
      defaultVersionId: pickDefaultVersionId(versions),
      workingVersionId:
        versions.find((v) => String(v.status).toUpperCase() === "DRAFT")?.id || null,
    };
  }

  static async update(modelId: string, input: any, userId: string, ip?: string) {
    const before = await FpaModelService.get(modelId);
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

    const periodTouched =
      input.startPeriod != null || input.endPeriod != null || input.timeGranularity != null;
    const statusUpper = String(before.status || "").toUpperCase();
    if (periodTouched && ["PUBLISHED", "ARCHIVED"].includes(statusUpper)) {
      throw new FpaError(
        409,
        "MODEL_LOCKED",
        "Cannot change calendar periods on a published/archived model"
      );
    }

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

    // Extend draft version cells when calendar range grows (GET grid periods follow model dates).
    if (periodTouched) {
      try {
        const { FpaVersionService } = await import("./FpaVersionService");
        const drafts = await prisma.planningVersion.findMany({
          where: { modelId, status: { in: ["DRAFT", "IN_REVIEW"] } },
          select: { id: true },
        });
        const scenarios = await prisma.planningScenario.findMany({
          where: { modelId },
          select: { id: true, isOfficial: true },
          orderBy: { createdAt: "asc" },
        });
        const scenarioId =
          scenarios.find((s) => s.isOfficial)?.id || scenarios[0]?.id || null;
        if (scenarioId) {
          for (const v of drafts) {
            await FpaVersionService.seedCells(
              v.id,
              { fillMissing: true, scenarioId },
              userId,
              ip
            );
          }
        }
      } catch (e) {
        console.warn("[FPA] period extend seedCells skipped:", (e as any)?.message || e);
      }
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
