// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";
import { FpaFormulaEngine } from "./FpaFormulaEngine";
import { FpaActualsService } from "./FpaActualsService";

export const FPA_MODEL_TYPES = ["BUDGET", "FORECAST", "ROLLING_FORECAST"] as const;
export const FPA_TIME_GRANULARITIES = ["MONTHLY", "QUARTERLY", "ANNUAL"] as const;
/** Canonical SRD + legacy aliases. */
export const FPA_BASELINE_MODES = [
  "NONE",
  "ZERO_BASED",
  "PRIOR_YEAR_ACTUAL",
  "PRIOR_YEAR_BUDGET",
  "LATEST_FORECAST",
  "DRIVER_BASED",
  "CUSTOM",
  // legacy aliases (normalized below)
  "ACTUALS_SYNC",
  "PRIOR_FORECAST",
] as const;

const DEFAULT_LINE_ITEMS = [
  { code: "REVENUE", name: "Revenue", lineItemType: "REVENUE", category: "REVENUE", sortOrder: 10 },
  { code: "COGS", name: "COGS", lineItemType: "EXPENSE", category: "EXPENSE", sortOrder: 20 },
  { code: "GROSS_PROFIT", name: "Gross Profit", lineItemType: "CALC", category: "REVENUE", sortOrder: 30, isEditable: false },
  { code: "SALARIES", name: "Salaries", lineItemType: "EXPENSE", category: "WORKFORCE", sortOrder: 40 },
  { code: "RENT", name: "Rent", lineItemType: "EXPENSE", category: "EXPENSE", sortOrder: 50 },
  { code: "MARKETING", name: "Marketing", lineItemType: "EXPENSE", category: "EXPENSE", sortOrder: 60 },
  { code: "EBITDA", name: "EBITDA", lineItemType: "CALC", category: "REVENUE", sortOrder: 70, isEditable: false },
  { code: "HEADCOUNT", name: "Headcount", lineItemType: "DRIVER", category: "WORKFORCE", dataType: "NUMBER", sortOrder: 80 },
  { code: "CLOSING_CASH", name: "Closing Cash", lineItemType: "CASH", category: "CASH", sortOrder: 90 },
];

type SetupError = { code: string; step?: string; message: string; field?: string };

function periodStarts(start: Date, end: Date, granularity: string): Date[] {
  const g = String(granularity || "MONTHLY").toUpperCase();
  const out: Date[] = [];
  if (g === "ANNUAL") {
    let y = start.getUTCFullYear();
    const lastY = end.getUTCFullYear();
    while (y <= lastY) {
      out.push(new Date(Date.UTC(y, 0, 1)));
      y += 1;
    }
    return out;
  }
  if (g === "QUARTERLY") {
    let cur = new Date(Date.UTC(start.getUTCFullYear(), Math.floor(start.getUTCMonth() / 3) * 3, 1));
    const last = new Date(Date.UTC(end.getUTCFullYear(), Math.floor(end.getUTCMonth() / 3) * 3, 1));
    while (cur <= last) {
      out.push(new Date(cur));
      cur.setUTCMonth(cur.getUTCMonth() + 3);
    }
    return out;
  }
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cur <= last) {
    out.push(new Date(cur));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

function normalizeModelType(raw: any): string {
  const v = String(raw || "BUDGET").toUpperCase();
  if (!FPA_MODEL_TYPES.includes(v as any)) {
    throw new FpaError(400, "VALIDATION", `modelType must be one of ${FPA_MODEL_TYPES.join(", ")}`, [
      { code: "INVALID_MODEL_TYPE", step: "modelType", message: `Unsupported modelType: ${raw}`, field: "modelType" },
    ]);
  }
  return v;
}

function normalizeGranularity(raw: any): string {
  const v = String(raw || "MONTHLY").toUpperCase();
  if (!FPA_TIME_GRANULARITIES.includes(v as any)) {
    throw new FpaError(400, "VALIDATION", `timeGranularity must be one of ${FPA_TIME_GRANULARITIES.join(", ")}`, [
      { code: "INVALID_TIME_GRANULARITY", step: "timeHorizon", message: `Unsupported timeGranularity: ${raw}`, field: "timeGranularity" },
    ]);
  }
  return v;
}

function normalizeBaselineMode(raw: any): string {
  if (raw == null || raw === "") return "NONE";
  let v = String(raw).toUpperCase().replace(/-/g, "_");
  // Map legacy / synonym names onto SRD methods
  if (v === "ACTUALS_SYNC" || v === "PRIOR_ACTUAL" || v === "PRIOR_ACTUALS") v = "PRIOR_YEAR_ACTUAL";
  if (v === "PRIOR_FORECAST" || v === "FORECAST") v = "LATEST_FORECAST";
  if (v === "PRIOR_BUDGET") v = "PRIOR_YEAR_BUDGET";
  if (!FPA_BASELINE_MODES.includes(v as any)) {
    throw new FpaError(400, "VALIDATION", `baseline.mode must be one of ${FPA_BASELINE_MODES.join(", ")}`, [
      { code: "INVALID_BASELINE", step: "baseline", message: `Unsupported baseline mode: ${raw}`, field: "baseline.mode" },
    ]);
  }
  return v;
}

export class FpaModelSetupService {
  /** Dimension catalog for the setup modal. Seeds REGION/PRODUCT if empty. */
  static async listDimensions() {
    let dims = await prisma.planningDimension.findMany({
      include: { members: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
      orderBy: { code: "asc" },
    });
    if (!dims.length) {
      await prisma.planningDimension.createMany({
        data: [
          { code: "REGION", name: "Region", dimensionType: "GEOGRAPHY" },
          { code: "PRODUCT", name: "Product", dimensionType: "PRODUCT" },
          { code: "CHANNEL", name: "Channel", dimensionType: "CHANNEL" },
        ],
      });
      dims = await prisma.planningDimension.findMany({
        include: { members: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
        orderBy: { code: "asc" },
      });
    }
    return dims.map((d) => ({
      id: d.id,
      key: d.code,
      code: d.code,
      name: d.name,
      dimensionType: d.dimensionType,
      members: d.members.map((m) => ({ id: m.id, code: m.code, name: m.name, parentId: m.parentId })),
    }));
  }

  static async preflight(input: any): Promise<SetupError[]> {
    const errors: SetupError[] = [];
    const name = String(input.name || input.modelName || "").trim();
    if (!name) errors.push({ code: "MISSING_NAME", step: "createModel", message: "name is required", field: "name" });

    const startPeriod = new Date(input.startPeriod || input.start_period);
    const endPeriod = new Date(input.endPeriod || input.end_period);
    if (Number.isNaN(startPeriod.getTime()) || Number.isNaN(endPeriod.getTime())) {
      errors.push({ code: "INVALID_PERIOD", step: "timeHorizon", message: "startPeriod and endPeriod are required", field: "startPeriod" });
    } else if (endPeriod < startPeriod) {
      errors.push({ code: "INVALID_PERIOD", step: "timeHorizon", message: "endPeriod must be on or after startPeriod", field: "endPeriod" });
    }

    try {
      normalizeModelType(input.modelType || input.model_type);
    } catch (e: any) {
      if (e?.errors) errors.push(...e.errors);
      else errors.push({ code: "INVALID_MODEL_TYPE", step: "modelType", message: e.message, field: "modelType" });
    }
    try {
      normalizeGranularity(input.timeGranularity || input.time_granularity);
    } catch (e: any) {
      if (e?.errors) errors.push(...e.errors);
      else errors.push({ code: "INVALID_TIME_GRANULARITY", step: "timeHorizon", message: e.message, field: "timeGranularity" });
    }

    const entityIds = Array.isArray(input.entityIds) ? input.entityIds.map(String) : [];
    if (entityIds.length) {
      const found = await prisma.forecastEntity.findMany({ where: { id: { in: entityIds } }, select: { id: true } });
      const ok = new Set(found.map((e) => e.id));
      for (const id of entityIds) {
        if (!ok.has(id)) errors.push({ code: "UNKNOWN_ENTITY", step: "entities", message: `Entity not found: ${id}`, field: "entityIds" });
      }
    }

    const departmentIds = Array.isArray(input.departmentIds) ? input.departmentIds.map(String) : [];
    if (departmentIds.length) {
      const found = await prisma.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true } });
      const ok = new Set(found.map((d) => d.id));
      for (const id of departmentIds) {
        if (!ok.has(id)) errors.push({ code: "UNKNOWN_DEPARTMENT", step: "entities", message: `Department not found: ${id}`, field: "departmentIds" });
      }
    }

    const accountIds = Array.isArray(input.accountIds) ? input.accountIds.map(String) : [];
    if (accountIds.length) {
      const entityCoa = await prisma.entityChartOfAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true } });
      const globalCoa = await prisma.chartOfAccounts.findMany({ where: { id: { in: accountIds } }, select: { id: true } });
      const ok = new Set([...entityCoa, ...globalCoa].map((a) => a.id));
      for (const id of accountIds) {
        if (!ok.has(id)) errors.push({ code: "UNKNOWN_ACCOUNT", step: "coa", message: `Account not found: ${id}`, field: "accountIds" });
      }
    }

    const lineItemsIn = Array.isArray(input.lineItems) && input.lineItems.length ? input.lineItems : DEFAULT_LINE_ITEMS;
    const codes = new Set<string>();
    for (const li of lineItemsIn) {
      const code = String(li.code || "").trim().toUpperCase();
      if (!code) {
        errors.push({ code: "INVALID_LINE_ITEM", step: "lineItems", message: "line item code is required", field: "lineItems" });
        continue;
      }
      if (codes.has(code)) {
        errors.push({ code: "DUPLICATE_LINE_ITEM", step: "lineItems", message: `Duplicate line item code: ${code}`, field: "lineItems" });
      }
      codes.add(code);
    }
    if (!codes.size) {
      errors.push({ code: "NO_LINE_ITEMS", step: "lineItems", message: "At least one line item is required", field: "lineItems" });
    }

    const formulas = Array.isArray(input.formulas) ? input.formulas : [];
    for (const f of formulas) {
      const expr = String(f.expression || "");
      const v = FpaFormulaEngine.validateExpression(expr);
      if (!v.valid) {
        errors.push({ code: "INVALID_FORMULA", step: "formulas", message: v.message || "Invalid formula", field: "formulas" });
        continue;
      }
      for (const c of v.lineCodes) {
        if (!codes.has(String(c).toUpperCase())) {
          errors.push({
            code: "UNKNOWN_LINE_REF",
            step: "formulas",
            message: `Formula references unknown line item: ${c}`,
            field: "formulas",
          });
        }
      }
    }

    const baseline = input.baseline || {};
    try {
      const mode = normalizeBaselineMode(baseline.mode);
      if (
        (mode === "LATEST_FORECAST" || mode === "PRIOR_YEAR_BUDGET") &&
        !baseline.sourceVersionId
      ) {
        errors.push({
          code: "MISSING_BASELINE_SOURCE",
          step: "baseline",
          message: "sourceVersionId required for forecast/budget baseline",
          field: "baseline.sourceVersionId",
        });
      }
      if (baseline.sourceVersionId) {
        const ver = await prisma.planningVersion.findUnique({ where: { id: String(baseline.sourceVersionId) } });
        if (!ver) {
          errors.push({
            code: "UNKNOWN_BASELINE_SOURCE",
            step: "baseline",
            message: `sourceVersionId not found: ${baseline.sourceVersionId}`,
            field: "baseline.sourceVersionId",
          });
        }
      }
    } catch (e: any) {
      if (e?.errors) errors.push(...e.errors);
    }

    const dims = Array.isArray(input.dimensions) ? input.dimensions : [];
    for (const d of dims) {
      const key = String(d.key || d.code || "").trim().toUpperCase();
      if (!key) {
        errors.push({ code: "MISSING_DIMENSION", step: "dimensions", message: "dimension key is required", field: "dimensions" });
      }
    }

    return errors;
  }

  /**
   * Atomic full setup — one transaction for model + nested config.
   * ACTUALS_SYNC baseline runs after commit.
   */
  static async setup(input: any, userId: string, ip?: string) {
    const errors = await FpaModelSetupService.preflight(input);
    if (errors.length) {
      throw new FpaError(400, "VALIDATION", "Model setup validation failed", errors);
    }

    const name = String(input.name || input.modelName || "").trim();
    const startPeriod = new Date(input.startPeriod || input.start_period);
    const endPeriod = new Date(input.endPeriod || input.end_period);
    const modelType = normalizeModelType(input.modelType || input.model_type);
    const timeGranularity = normalizeGranularity(input.timeGranularity || input.time_granularity);
    const baseline = input.baseline || {};
    const baselineMode = normalizeBaselineMode(baseline.mode);
    const lineItemsIn = Array.isArray(input.lineItems) && input.lineItems.length ? input.lineItems : DEFAULT_LINE_ITEMS;
    const entityIds = Array.isArray(input.entityIds) ? [...new Set(input.entityIds.map(String))] : [];
    const departmentIds = Array.isArray(input.departmentIds) ? [...new Set(input.departmentIds.map(String))] : [];
    const accountIds = Array.isArray(input.accountIds) ? [...new Set(input.accountIds.map(String))] : [];
    const dimensionsIn = Array.isArray(input.dimensions) ? input.dimensions : [];
    const formulasIn = Array.isArray(input.formulas) ? input.formulas : [];
    const driversIn = Array.isArray(input.drivers) ? input.drivers : [];
    const workflowIn = input.workflow || null;

    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.planningModel.create({
        data: {
          name,
          modelType,
          description: input.description || null,
          ownerUserId: input.ownerUserId || userId,
          baseCurrency: String(input.baseCurrency || input.base_currency || "USD").toUpperCase().slice(0, 3),
          startPeriod,
          endPeriod,
          timeGranularity,
          status: "DRAFT",
          baselineMode,
          baselineSourceVersionId: baseline.sourceVersionId ? String(baseline.sourceVersionId) : null,
          baselineSourceScenarioId: baseline.sourceScenarioId ? String(baseline.sourceScenarioId) : null,
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

      if (entityIds.length) {
        await tx.planningModelEntity.createMany({
          data: entityIds.map((entityId) => ({ modelId: created.id, entityId })),
        });
      }
      if (departmentIds.length) {
        await tx.planningModelDepartment.createMany({
          data: departmentIds.map((departmentId) => ({ modelId: created.id, departmentId })),
        });
      }
      if (accountIds.length) {
        const primaryEntity = entityIds[0] || null;
        await tx.planningModelAccount.createMany({
          data: accountIds.map((accountId) => ({
            modelId: created.id,
            accountId,
            entityId: primaryEntity,
          })),
        });
      }

      for (const d of dimensionsIn) {
        const key = String(d.key || d.code || "").trim().toUpperCase();
        let dim = await tx.planningDimension.findUnique({ where: { code: key } });
        if (!dim) {
          dim = await tx.planningDimension.create({
            data: { code: key, name: key, dimensionType: String(d.dimensionType || "CUSTOM") },
          });
        }
        const existingLink = await tx.planningModelDimension.findFirst({
          where: { modelId: created.id, dimensionId: dim.id },
        });
        if (!existingLink) {
          await tx.planningModelDimension.create({ data: { modelId: created.id, dimensionId: dim.id } });
        }

        const valueIds = Array.isArray(d.valueIds) ? d.valueIds.map(String) : [];
        for (const vid of valueIds) {
          let member = await tx.planningDimensionMember.findFirst({
            where: { OR: [{ id: vid }, { dimensionId: dim.id, code: vid }] },
          });
          if (!member) {
            member = await tx.planningDimensionMember.create({
              data: { dimensionId: dim.id, code: vid.slice(0, 64), name: vid, sortOrder: 0 },
            });
          }
          await tx.planningModelDimensionMember.create({
            data: { modelId: created.id, dimensionId: dim.id, memberId: member.id },
          });
        }
      }

      const lineItems = [];
      let sort = 10;
      for (const li of lineItemsIn) {
        const code = String(li.code).trim().toUpperCase();
        const isCalc = String(li.lineItemType || "").toUpperCase() === "CALC";
        lineItems.push(
          await tx.planningLineItem.create({
            data: {
              modelId: created.id,
              code,
              name: String(li.name || code),
              lineItemType: String(li.lineItemType || "EXPENSE"),
              category: String(li.category || "GENERAL"),
              dataType: String(li.dataType || "CURRENCY"),
              isEditable: li.isEditable != null ? !!li.isEditable : !isCalc,
              sortOrder: Number(li.sortOrder != null ? li.sortOrder : sort),
              accountId: li.accountId || null,
            },
          })
        );
        sort += 10;
      }

      const codeToId = Object.fromEntries(lineItems.map((li) => [li.code, li.id]));

      for (const f of formulasIn) {
        const lineItemCode = String(f.lineItemCode || f.code || "").toUpperCase();
        const lineItemId = f.lineItemId || codeToId[lineItemCode];
        if (!lineItemId) continue;
        const expression = String(f.expression);
        const validation = FpaFormulaEngine.validateExpression(expression);
        await tx.planningFormula.create({
          data: {
            modelId: created.id,
            lineItemId,
            expression,
            isValid: validation.valid,
            validationMsg: validation.message || null,
            createdById: userId,
          },
        });
      }

      for (const d of driversIn) {
        await tx.planningDriver.create({
          data: {
            modelId: created.id,
            scenarioId: scenario.id,
            versionId: version.id,
            code: String(d.code).toUpperCase(),
            name: String(d.name || d.code),
            category: String(d.category || "GENERAL"),
            value: d.value ?? 0,
            unit: d.unit || null,
            periodDate: d.periodDate ? new Date(d.periodDate) : null,
            requiresApproval: !!d.requiresApproval,
            createdById: userId,
          },
        });
      }

      let workflowId = null;
      if (workflowIn && workflowIn.name) {
        const stages = Array.isArray(workflowIn.stages) ? workflowIn.stages : [];
        const firstStage =
          stages.length > 0
            ? String(stages[0].code || stages[0].name || stages[0] || "SETUP")
            : String(workflowIn.stage || "SETUP");
        const workflow = await tx.planningWorkflow.create({
          data: {
            modelId: created.id,
            name: String(workflowIn.name),
            workflowType: String(workflowIn.workflowType || "BUDGET"),
            stage: firstStage,
            status: "ACTIVE",
            startDate: workflowIn.startDate ? new Date(workflowIn.startDate) : null,
            endDate: workflowIn.endDate ? new Date(workflowIn.endDate) : null,
            createdById: userId,
          },
        });
        workflowId = workflow.id;
        const tasksIn = Array.isArray(workflowIn.tasks) ? workflowIn.tasks : [];
        for (const t of tasksIn) {
          await tx.planningTask.create({
            data: {
              workflowId: workflow.id,
              title: String(t.title || "Task"),
              departmentId: t.departmentId || null,
              assigneeId: t.assigneeId || null,
              status: "PENDING",
              priority: t.priority || "MEDIUM",
              dueDate: t.dueDate ? new Date(t.dueDate) : null,
            },
          });
        }
      }

      const periods = periodStarts(startPeriod, endPeriod, timeGranularity);
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

      if (
        (baselineMode === "LATEST_FORECAST" || baselineMode === "PRIOR_YEAR_BUDGET") &&
        baseline.sourceVersionId
      ) {
        const sourceCells = await tx.planningCell.findMany({
          where: {
            versionId: String(baseline.sourceVersionId),
            ...(baseline.sourceScenarioId ? { scenarioId: String(baseline.sourceScenarioId) } : {}),
          },
        });
        for (const c of sourceCells) {
          const target = await tx.planningCell.findFirst({
            where: {
              versionId: version.id,
              scenarioId: scenario.id,
              lineItemId: c.lineItemId,
              periodDate: c.periodDate,
            },
          });
          if (target) {
            await tx.planningCell.update({
              where: { id: target.id },
              data: {
                value: c.value,
                sourceType: "COPIED",
                valueType: c.valueType || "INPUT",
              },
            });
          }
        }
      }

      return {
        model: {
          id: created.id,
          name: created.name,
          status: created.status,
          modelType: created.modelType,
          defaultScenarioId: scenario.id,
          defaultVersionId: version.id,
        },
        lineItemCount: lineItems.length,
        driverCount: driversIn.length,
        workflowId,
        cellCount: cellRows.length,
        versionId: version.id,
        scenarioId: scenario.id,
      };
    });

    if (baselineMode === "PRIOR_YEAR_ACTUAL") {
      try {
        await FpaActualsService.sync(
          {
            modelId: result.model.id,
            versionId: result.versionId,
            scenarioId: result.scenarioId,
            periodStart: startPeriod.toISOString().slice(0, 10),
            periodEnd: endPeriod.toISOString().slice(0, 10),
          },
          userId,
          ip
        );
      } catch {
        // Sync may return 0 rows; setup still succeeds. Failures are non-fatal for create.
      }
    }

    const validation = await FpaModelSetupService.validate(result.model.id);
    await FpaAuditService.log("MODEL_SETUP", userId, { modelId: result.model.id, ip });

    return {
      model: result.model,
      lineItemCount: result.lineItemCount,
      driverCount: result.driverCount,
      workflowId: result.workflowId,
      cellCount: result.cellCount,
      validation,
    };
  }

  static async setScope(modelId: string, input: any, userId: string, ip?: string) {
    await FpaModelSetupService.assertModel(modelId);
    const entityIds = Array.isArray(input.entityIds) ? [...new Set(input.entityIds.map(String))] : [];
    const departmentIds = Array.isArray(input.departmentIds) ? [...new Set(input.departmentIds.map(String))] : [];

    if (entityIds.length) {
      const found = await prisma.forecastEntity.findMany({ where: { id: { in: entityIds } }, select: { id: true } });
      if (found.length !== entityIds.length) {
        throw new FpaError(400, "VALIDATION", "One or more entityIds not found", [
          { code: "UNKNOWN_ENTITY", step: "entities", message: "Invalid entityIds", field: "entityIds" },
        ]);
      }
    }
    if (departmentIds.length) {
      const found = await prisma.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true } });
      if (found.length !== departmentIds.length) {
        throw new FpaError(400, "VALIDATION", "One or more departmentIds not found", [
          { code: "UNKNOWN_DEPARTMENT", step: "entities", message: "Invalid departmentIds", field: "departmentIds" },
        ]);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.planningModelEntity.deleteMany({ where: { modelId } });
      await tx.planningModelDepartment.deleteMany({ where: { modelId } });
      if (entityIds.length) {
        await tx.planningModelEntity.createMany({ data: entityIds.map((entityId) => ({ modelId, entityId })) });
      }
      if (departmentIds.length) {
        await tx.planningModelDepartment.createMany({
          data: departmentIds.map((departmentId) => ({ modelId, departmentId })),
        });
      }
      await tx.planningModel.update({ where: { id: modelId }, data: { updatedById: userId } });
    });

    await FpaAuditService.log("MODEL_SCOPE_UPDATE", userId, { modelId, ip });
    return FpaModelSetupService.getScope(modelId);
  }

  static async getScope(modelId: string) {
    const [entities, departments] = await Promise.all([
      prisma.planningModelEntity.findMany({ where: { modelId } }),
      prisma.planningModelDepartment.findMany({ where: { modelId } }),
    ]);
    return {
      modelId,
      entityIds: entities.map((e) => e.entityId),
      departmentIds: departments.map((d) => d.departmentId),
    };
  }

  /**
   * Idempotent: bind a default entity/department and a small COA set when a draft
   * model has none — unblocks Detailed workspace / soft validation without wiping
   * an existing explicit scope.
   */
  static async ensureMinimalScopeAndCoa(modelId: string, userId: string, ip?: string) {
    await FpaModelSetupService.assertModel(modelId);
    const scope = await FpaModelSetupService.getScope(modelId);
    const existingAccounts = await prisma.planningModelAccount.findMany({
      where: { modelId },
      select: { accountId: true },
    });

    let seededScope = false;
    let seededCoa = false;
    let entityIds = scope.entityIds;
    let departmentIds = scope.departmentIds;
    let accountIds = existingAccounts.map((a) => a.accountId);

    if (!entityIds.length && !departmentIds.length) {
      const entity =
        (await prisma.forecastEntity.findFirst({
          where: { isActive: true, isDefault: true },
          select: { id: true },
        })) ||
        (await prisma.forecastEntity.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        }));
      const departments = await prisma.department.findMany({
        orderBy: { createdAt: "asc" },
        take: 5,
        select: { id: true },
      });
      entityIds = entity ? [entity.id] : [];
      departmentIds = departments.map((d) => d.id);
      if (entityIds.length || departmentIds.length) {
        await FpaModelSetupService.setScope(modelId, { entityIds, departmentIds }, userId, ip);
        seededScope = true;
      }
    }

    if (!accountIds.length) {
      const fromLineItems = await prisma.planningLineItem.findMany({
        where: { modelId, accountId: { not: null } },
        select: { accountId: true },
        take: 50,
      });
      accountIds = [
        ...new Set(fromLineItems.map((l) => l.accountId).filter(Boolean).map(String)),
      ];

      if (!accountIds.length && entityIds.length) {
        const entityAccts = await prisma.entityChartOfAccount.findMany({
          where: { entityId: entityIds[0] },
          orderBy: { accountNo: "asc" },
          take: 40,
          select: { id: true },
        });
        accountIds = entityAccts.map((a) => a.id);
      }

      if (!accountIds.length) {
        const global = await prisma.chartOfAccounts.findMany({
          orderBy: { accountNo: "asc" },
          take: 40,
          select: { id: true },
        });
        accountIds = global.map((a) => a.id);
      }

      if (accountIds.length) {
        await FpaModelSetupService.setCoa(
          modelId,
          { accountIds, entityId: entityIds[0] || null },
          userId,
          ip
        );
        seededCoa = true;
      }
    }

    await FpaAuditService.log("MODEL_SEED_MINIMAL_SCOPE_COA", userId, {
      modelId,
      entityType: "model",
      summary: `Seeded minimal scope/COA (scope=${seededScope}, coa=${seededCoa})`,
      reason: JSON.stringify({
        summary: `Seeded minimal scope/COA (scope=${seededScope}, coa=${seededCoa})`,
        seededScope,
        seededCoa,
        entityCount: entityIds.length,
        departmentCount: departmentIds.length,
        accountCount: accountIds.length,
      }),
      ip,
    });

    return {
      modelId,
      seededScope,
      seededCoa,
      entityIds,
      departmentIds,
      accountIds,
    };
  }

  static async setCoa(modelId: string, input: any, userId: string, ip?: string) {
    await FpaModelSetupService.assertModel(modelId);
    const accountIds = Array.isArray(input.accountIds) ? [...new Set(input.accountIds.map(String))] : [];
    const entityId = input.entityId ? String(input.entityId) : null;

    if (accountIds.length) {
      const entityCoa = await prisma.entityChartOfAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true } });
      const globalCoa = await prisma.chartOfAccounts.findMany({ where: { id: { in: accountIds } }, select: { id: true } });
      const ok = new Set([...entityCoa, ...globalCoa].map((a) => a.id));
      for (const id of accountIds) {
        if (!ok.has(id)) {
          throw new FpaError(400, "VALIDATION", `Account not found: ${id}`, [
            { code: "UNKNOWN_ACCOUNT", step: "coa", message: `Account not found: ${id}`, field: "accountIds" },
          ]);
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.planningModelAccount.deleteMany({ where: { modelId } });
      if (accountIds.length) {
        await tx.planningModelAccount.createMany({
          data: accountIds.map((accountId) => ({ modelId, accountId, entityId })),
        });
      }
      await tx.planningModel.update({ where: { id: modelId }, data: { updatedById: userId } });
    });

    await FpaAuditService.log("MODEL_COA_UPDATE", userId, { modelId, ip });
    return {
      modelId,
      entityId,
      accountIds,
    };
  }

  static async setDimensions(modelId: string, input: any, userId: string, ip?: string) {
    await FpaModelSetupService.assertModel(modelId);
    const dimensionsIn = Array.isArray(input.dimensions) ? input.dimensions : [];

    await prisma.$transaction(async (tx) => {
      await tx.planningModelDimensionMember.deleteMany({ where: { modelId } });
      await tx.planningModelDimension.deleteMany({ where: { modelId } });

      for (const d of dimensionsIn) {
        const key = String(d.key || d.code || "").trim().toUpperCase();
        if (!key) continue;
        let dim = await tx.planningDimension.findUnique({ where: { code: key } });
        if (!dim) {
          dim = await tx.planningDimension.create({
            data: { code: key, name: key, dimensionType: String(d.dimensionType || "CUSTOM") },
          });
        }
        await tx.planningModelDimension.create({ data: { modelId, dimensionId: dim.id } });
        const valueIds = Array.isArray(d.valueIds) ? d.valueIds.map(String) : [];
        for (const vid of valueIds) {
          let member = await tx.planningDimensionMember.findFirst({
            where: { OR: [{ id: vid }, { dimensionId: dim.id, code: vid }] },
          });
          if (!member) {
            member = await tx.planningDimensionMember.create({
              data: { dimensionId: dim.id, code: vid.slice(0, 64), name: vid },
            });
          }
          await tx.planningModelDimensionMember.create({
            data: { modelId, dimensionId: dim.id, memberId: member.id },
          });
        }
      }
      await tx.planningModel.update({ where: { id: modelId }, data: { updatedById: userId } });
    });

    await FpaAuditService.log("MODEL_DIMENSIONS_UPDATE", userId, { modelId, ip });
    return FpaModelSetupService.getDimensions(modelId);
  }

  static async getDimensions(modelId: string) {
    const links = await prisma.planningModelDimension.findMany({
      where: { modelId },
      include: { dimension: true },
    });
    const members = await prisma.planningModelDimensionMember.findMany({ where: { modelId } });
    return {
      modelId,
      dimensions: links.map((l) => ({
        key: l.dimension.code,
        dimensionId: l.dimensionId,
        valueIds: members.filter((m) => m.dimensionId === l.dimensionId).map((m) => m.memberId),
      })),
    };
  }

  static async setBaseline(modelId: string, input: any, userId: string, ip?: string) {
    const model = await FpaModelSetupService.assertModel(modelId);
    const mode = normalizeBaselineMode(input.mode);
    const sourceVersionId = input.sourceVersionId ? String(input.sourceVersionId) : null;
    const sourceScenarioId = input.sourceScenarioId ? String(input.sourceScenarioId) : null;
    const targetVersionId = input.versionId ? String(input.versionId) : null;
    const targetScenarioId = input.scenarioId ? String(input.scenarioId) : null;
    const departmentIds = Array.isArray(input.departmentIds)
      ? input.departmentIds.map(String)
      : null;

    if (
      (mode === "LATEST_FORECAST" || mode === "PRIOR_YEAR_BUDGET") &&
      !sourceVersionId
    ) {
      throw new FpaError(400, "VALIDATION", "sourceVersionId required for forecast/budget baseline", [
        {
          code: "MISSING_BASELINE_SOURCE",
          step: "baseline",
          message: "sourceVersionId required",
          field: "sourceVersionId",
        },
      ]);
    }

    const version =
      (targetVersionId
        ? await prisma.planningVersion.findUnique({ where: { id: targetVersionId } })
        : null) ||
      (await prisma.planningVersion.findFirst({
        where: { modelId, status: { not: "ARCHIVED" } },
        orderBy: { createdAt: "asc" },
      }));
    const scenario =
      (targetScenarioId
        ? await prisma.planningScenario.findUnique({ where: { id: targetScenarioId } })
        : null) ||
      (await prisma.planningScenario.findFirst({
        where: { modelId },
        orderBy: { createdAt: "asc" },
      }));

    await prisma.planningModel.update({
      where: { id: modelId },
      data: {
        baselineMode: mode,
        baselineSourceVersionId: sourceVersionId,
        baselineSourceScenarioId: sourceScenarioId,
        updatedById: userId,
      },
    });

    let cellsCopied = 0;
    let cellsZeroed = 0;
    let actualsSynced = 0;

    const editableWhere: any = {
      versionId: version?.id,
      scenarioId: scenario?.id,
      isLocked: false,
      isEditable: true,
      sourceType: { not: "ACTUAL" },
    };
    if (departmentIds?.length) {
      editableWhere.OR = [{ departmentId: { in: departmentIds } }, { departmentId: null }];
    }

    if (mode === "ZERO_BASED" && version && scenario) {
      const targets = await prisma.planningCell.findMany({ where: editableWhere });
      for (const t of targets) {
        await prisma.planningCell.update({
          where: { id: t.id },
          data: {
            value: 0,
            sourceType: "BASELINE",
            valueType: "INPUT",
            recordVersion: BigInt(Number(t.recordVersion || 1) + 1),
          },
        });
        cellsZeroed += 1;
      }
    }

    if (
      (mode === "LATEST_FORECAST" || mode === "PRIOR_YEAR_BUDGET" || mode === "CUSTOM") &&
      sourceVersionId &&
      version &&
      scenario
    ) {
      const sourceCells = await prisma.planningCell.findMany({
        where: {
          versionId: sourceVersionId,
          ...(sourceScenarioId ? { scenarioId: sourceScenarioId } : {}),
          ...(departmentIds?.length
            ? { OR: [{ departmentId: { in: departmentIds } }, { departmentId: null }] }
            : {}),
        },
      });
      for (const c of sourceCells) {
        const target = await prisma.planningCell.findFirst({
          where: {
            versionId: version.id,
            scenarioId: scenario.id,
            lineItemId: c.lineItemId,
            periodDate: c.periodDate,
            departmentId: c.departmentId ?? null,
          },
        });
        if (target && target.isEditable && !target.isLocked) {
          await prisma.planningCell.update({
            where: { id: target.id },
            data: {
              value: c.value,
              sourceType: "BASELINE",
              valueType: c.valueType || "INPUT",
              recordVersion: BigInt(Number(target.recordVersion || 1) + 1),
            },
          });
          cellsCopied += 1;
        }
      }
    }

    if (mode === "PRIOR_YEAR_ACTUAL" && version && scenario) {
      const job = await FpaActualsService.sync(
        {
          modelId,
          versionId: version.id,
          scenarioId: scenario.id,
          periodStart: model.startPeriod,
          periodEnd: model.endPeriod,
        },
        userId,
        ip
      );
      actualsSynced = job?.rowCount ?? job?.data?.rowCount ?? 0;
    }

    await FpaAuditService.log("MODEL_BASELINE", userId, { modelId, ip });
    return {
      modelId,
      mode,
      sourceVersionId,
      sourceScenarioId,
      cellsCopied,
      cellsZeroed,
      actualsSynced,
      reason:
        mode === "NONE" || mode === "DRIVER_BASED"
          ? "No cell seeding for this baseline method"
          : mode === "ZERO_BASED"
            ? `Zeroed ${cellsZeroed} editable cells`
            : mode === "PRIOR_YEAR_ACTUAL"
              ? actualsSynced
                ? `Synced ${actualsSynced} actual rows`
                : "No GL actuals found for period"
              : `Copied ${cellsCopied} cells from source version`,
    };
  }

  static async bulkLineItems(modelId: string, input: any, userId: string, ip?: string) {
    await FpaModelSetupService.assertModel(modelId);
    const items = Array.isArray(input.lineItems) ? input.lineItems : Array.isArray(input) ? input : [];
    if (!items.length) throw new FpaError(400, "VALIDATION", "lineItems array required");

    const created = [];
    let sort = (await prisma.planningLineItem.count({ where: { modelId } })) * 10 + 10;
    for (const li of items) {
      const code = String(li.code || "").trim().toUpperCase();
      if (!code || !li.name) continue;
      const existing = await prisma.planningLineItem.findFirst({ where: { modelId, code } });
      if (existing) {
        created.push(existing);
        continue;
      }
      created.push(
        await prisma.planningLineItem.create({
          data: {
            modelId,
            code,
            name: String(li.name),
            lineItemType: String(li.lineItemType || "EXPENSE"),
            category: String(li.category || "GENERAL"),
            dataType: String(li.dataType || "CURRENCY"),
            isEditable: li.isEditable !== false,
            sortOrder: Number(li.sortOrder != null ? li.sortOrder : sort),
            accountId: li.accountId || null,
          },
        })
      );
      sort += 10;
    }

    await FpaAuditService.log("LINE_ITEMS_BULK", userId, { modelId, ip });
    return { modelId, count: created.length, lineItems: created };
  }

  /** Authoritative readiness check for “open for planning input”. */
  static async validate(modelId: string) {
    const model = await prisma.planningModel.findUnique({
      where: { id: modelId },
      include: {
        lineItems: true,
        formulas: true,
        modelEntities: true,
        modelDepartments: true,
        modelAccounts: true,
        modelDimensions: true,
        modelDimensionMembers: true,
        drivers: true,
        versions: true,
        scenarios: true,
      },
    });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");

    const errors: SetupError[] = [];
    if (!model.name?.trim()) {
      errors.push({ code: "MISSING_NAME", step: "createModel", message: "Model name is missing" });
    }
    if (!model.lineItems.length) {
      errors.push({ code: "NO_LINE_ITEMS", step: "lineItems", message: "Create at least one line item" });
    }
    const codes = new Set(model.lineItems.map((li) => li.code));
    for (const f of model.formulas) {
      const v = FpaFormulaEngine.validateExpression(f.expression);
      if (!v.valid) {
        errors.push({ code: "INVALID_FORMULA", step: "formulas", message: v.message || "Invalid formula" });
      }
      for (const c of v.lineCodes) {
        if (!codes.has(String(c).toUpperCase())) {
          errors.push({ code: "UNKNOWN_LINE_REF", step: "formulas", message: `Unknown LINE('${c}')` });
        }
      }
    }
    if (!model.modelEntities.length && !model.modelDepartments.length) {
      errors.push({
        code: "MISSING_SCOPE",
        step: "entities",
        message: "Select at least one entity or department",
      });
    }
    if (!model.modelAccounts.length) {
      errors.push({ code: "MISSING_COA", step: "coa", message: "Select chart of accounts accounts" });
    }
    for (const link of model.modelDimensions) {
      const hasMembers = model.modelDimensionMembers.some((m) => m.dimensionId === link.dimensionId);
      if (!hasMembers) {
        errors.push({
          code: "MISSING_DIMENSION",
          step: "dimensions",
          message: `Dimension ${link.dimensionId} has no selected values`,
        });
      }
    }
    if (!model.versions.length || !model.scenarios.length) {
      errors.push({ code: "MISSING_VERSION", step: "createModel", message: "Working version / BASE scenario missing" });
    }

    return { passed: errors.length === 0, errors };
  }

  static async assertModel(modelId: string) {
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");
    return model;
  }
}
