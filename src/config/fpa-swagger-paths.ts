/**
 * FP&A Planning — Swagger paths (SRD §27).
 * Base: `/v1/fpa/*` (server URL already includes `/api`).
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";
import { jsonRequestBody, pathParam, queryParam } from "./swagger-module-helpers";

export const FPA_TAG = "FP&A Planning";

export const FPA_TAG_DEFINITION = {
  name: FPA_TAG,
  description:
    "**Arcus FP&A — Planning, Budgeting & Forecasting.** Models, grid cells, scenarios, versions, workflows, actuals sync, variance, domain views, board-pack export, AI stubs.\n\n" +
    "Base path: `/v1/fpa/*`. Forecast entities remain at `/forecast-entities`.\n\n" +
    "DB: `npm run db:migrate:fpa-planning`.",
};

const TAG = [FPA_TAG];
const bearer = [{ bearerAuth: [] }];

function op(summary: string, extra: Record<string, unknown> = {}) {
  return { summary, tags: TAG, security: bearer, responses: SWAGGER_JSON_RESPONSES, ...extra };
}

const modelId = pathParam("modelId", "cuid");
const formulaId = pathParam("formulaId", "cuid");
const cellId = pathParam("cellId", "cuid");
const id = pathParam("id", "cuid");
const category = pathParam("category", "revenue");

export const fpaSwaggerPaths: Record<string, unknown> = {
  "/v1/fpa/models/setup": {
    post: op("Atomic planning model setup (modal single-commit)", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["name", "startPeriod", "endPeriod"],
          properties: {
            name: { type: "string" },
            modelType: { type: "string", enum: ["BUDGET", "FORECAST", "ROLLING_FORECAST"] },
            baseCurrency: { type: "string" },
            startPeriod: { type: "string", format: "date" },
            endPeriod: { type: "string", format: "date" },
            timeGranularity: { type: "string", enum: ["MONTHLY", "QUARTERLY", "ANNUAL"] },
            entityIds: { type: "array", items: { type: "string" } },
            departmentIds: { type: "array", items: { type: "string" } },
            accountIds: { type: "array", items: { type: "string" } },
            dimensions: { type: "array", items: { type: "object" } },
            baseline: { type: "object" },
            lineItems: { type: "array", items: { type: "object" } },
            formulas: { type: "array", items: { type: "object" } },
            drivers: { type: "array", items: { type: "object" } },
            workflow: { type: "object" },
          },
        },
      }),
    }),
  },
  "/v1/fpa/models": {
    get: op("List planning models"),
    post: op("Create planning model (seeds BASE + Working + default line items)", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["name", "startPeriod", "endPeriod"],
          properties: {
            name: { type: "string" },
            modelType: { type: "string", enum: ["BUDGET", "FORECAST", "ROLLING_FORECAST"], example: "BUDGET" },
            baseCurrency: { type: "string", example: "USD" },
            startPeriod: { type: "string", format: "date" },
            endPeriod: { type: "string", format: "date" },
            timeGranularity: { type: "string", enum: ["MONTHLY", "QUARTERLY", "ANNUAL"], example: "MONTHLY" },
            description: { type: "string" },
          },
        },
      }),
    }),
  },
  "/v1/fpa/dimensions": {
    get: op("List planning dimension catalog"),
  },
  "/v1/fpa/models/{modelId}": {
    get: op("Get planning model", { parameters: [modelId] }),
    put: op("Update planning model", { parameters: [modelId] }),
  },
  "/v1/fpa/models/{modelId}/archive": {
    post: op("Archive planning model", { parameters: [modelId] }),
  },
  "/v1/fpa/models/{modelId}/scope": {
    put: op("Bind entities + departments to model", { parameters: [modelId] }),
  },
  "/v1/fpa/models/{modelId}/coa": {
    put: op("Bind chart-of-accounts account ids to model", { parameters: [modelId] }),
  },
  "/v1/fpa/models/{modelId}/dimensions": {
    put: op("Bind dimensions + member values to model", { parameters: [modelId] }),
  },
  "/v1/fpa/models/{modelId}/baseline": {
    post: op("Seed baseline (NONE | ACTUALS_SYNC | PRIOR_FORECAST)", { parameters: [modelId] }),
  },
  "/v1/fpa/models/{modelId}/validate": {
    post: op("Validate model readiness for planning input", { parameters: [modelId] }),
  },
  "/v1/fpa/models/{modelId}/line-items/bulk": {
    post: op("Bulk create line items", { parameters: [modelId] }),
  },
  "/v1/fpa/budget-cycles": {
    get: op("List budget cycles", {
      parameters: [
        queryParam("modelId", { type: "string" }),
        queryParam("fiscalYear", { type: "integer" }),
        queryParam("status", { type: "string" }),
      ],
    }),
    post: op("Create annual budget cycle (assigns owners + tasks)", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["modelId", "name", "fiscalYear", "owners"],
          properties: {
            modelId: { type: "string" },
            name: { type: "string" },
            fiscalYear: { type: "integer" },
            owners: { type: "array", items: { type: "object" } },
            loadPriorActuals: { type: "boolean" },
            loadBaseline: { type: "boolean" },
            inputCategories: { type: "array", items: { type: "string" } },
          },
        },
      }),
    }),
  },
  "/v1/fpa/budget-cycles/{id}": {
    get: op("Get budget cycle", { parameters: [id] }),
    patch: op("Update budget cycle setup", { parameters: [id] }),
    put: op("Update budget cycle setup", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/owners": {
    put: op("Assign / replace budget owners", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/validate-setup": {
    post: op("Validate cycle setup — full unmet requirement list", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/open": {
    post: op("Open DRAFT cycle after validate-setup", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/owner-workspace": {
    get: op("Budget owner workspace shell", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/validate-owner-submit": {
    post: op("Owner submission gate check", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/load-actuals": {
    post: op("Load prior-year actuals for cycle", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/load-baseline": {
    post: op("Load baseline assumptions for cycle", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/validate": {
    post: op("Validate budget completeness", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/submit-fpa": {
    post: op("Submit cycle for FP&A review", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/fpa-accept": {
    post: op("FP&A accept → CFO review", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/fpa-return": {
    post: op("FP&A return for correction", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/cfo-approve": {
    post: op("CFO approve budget cycle", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/cfo-return": {
    post: op("CFO return for correction", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/lock": {
    post: op("Lock approved budget version", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/board-pack": {
    post: op("Generate board pack for cycle", { parameters: [id] }),
  },
  "/v1/fpa/budget-cycles/{id}/summary": {
    get: op("Budget cycle summary by category/department", { parameters: [id] }),
  },
  "/v1/fpa/models/{modelId}/grid": {
    get: op("Get planning grid (paginated cells + periods with periodRole)", {
      parameters: [
        modelId,
        queryParam("versionId", { type: "string" }),
        queryParam("scenarioId", { type: "string" }),
        queryParam("moduleId", { type: "string" }),
        queryParam("grain", { type: "string", enum: ["monthly", "quarterly", "annual"] }, "monthly"),
        queryParam("page", { type: "integer" }, "1"),
        queryParam("pageSize", { type: "integer" }, "100"),
      ],
    }),
  },
  "/v1/fpa/models/{modelId}/grid/validations": {
    get: op("Worksheet validation strip issues", {
      parameters: [
        modelId,
        queryParam("versionId", { type: "string" }),
        queryParam("scenarioId", { type: "string" }),
        queryParam("moduleId", { type: "string" }),
      ],
    }),
  },
  "/v1/fpa/models/{modelId}/validation-checks": {
    get: op("Fixed catalog of Model Builder validation checks (A.4)", { parameters: [modelId] }),
  },
  "/v1/fpa/models/{modelId}/exceptions": {
    get: op("Compose validation + grid + unmapped mapping exceptions", {
      parameters: [
        modelId,
        queryParam("versionId", { type: "string" }),
        queryParam("scenarioId", { type: "string" }),
        queryParam("moduleId", { type: "string" }),
      ],
    }),
  },
  "/v1/fpa/models/{modelId}/data-mappings": {
    get: op("List ERP / GL line-item mappings", {
      parameters: [
        modelId,
        queryParam("moduleId", { type: "string" }),
        queryParam("sourceSystem", { type: "string" }),
        queryParam("q", { type: "string" }),
        queryParam("unmappedOnly", { type: "boolean" }),
        queryParam("limit", { type: "integer" }),
        queryParam("cursor", { type: "string" }),
      ],
    }),
    post: op("Create a data mapping from Add Mapping form", {
      parameters: [modelId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["sourceSystem", "sourceField"],
          properties: {
            sourceSystem: { type: "string", example: "Accounting GL" },
            sourceField: { type: "string", example: "GL_ACCOUNT.4000" },
            targetLineItemId: { type: "string" },
            status: {
              type: "string",
              enum: ["MAPPED", "UNMAPPED", "SUGGESTED", "TYPE_MISMATCH", "STALE"],
            },
            notes: { type: "string" },
            moduleId: { type: "string" },
          },
        },
      }),
    }),
  },
  "/v1/fpa/models/{modelId}/data-mappings/seed-catalog": {
    post: op("Seed Arcus-owned source catalog (Custom/CSV, Excel, API, Manual, Procurement, Fixed Assets, Stock, Portfolio, Accounting GL, Payroll, CRM, Banking, Loan)", {
      parameters: [modelId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          properties: {
            systems: {
              type: "array",
              items: { type: "string" },
              example: [
                "Custom / CSV",
                "Excel",
                "API",
                "Manual",
                "Procurement",
                "Fixed Assets",
                "Stock",
                "Portfolio",
                "Accounting GL",
                "Payroll",
                "CRM",
                "Banking",
                "Loan",
              ],
            },
            moduleId: { type: "string" },
            replaceExisting: { type: "boolean", default: false },
          },
        },
      }),
    }),
  },
  "/v1/fpa/models/{modelId}/data-mappings/{mappingId}": {
    put: op("Update a data mapping (target line item / status / notes)", {
      parameters: [modelId, pathParam("mappingId", "cuid")],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          properties: {
            sourceSystem: { type: "string" },
            sourceField: { type: "string" },
            targetLineItemId: { type: "string", nullable: true },
            lineItemId: { type: "string", nullable: true },
            moduleId: { type: "string", nullable: true },
            status: {
              type: "string",
              enum: ["MAPPED", "UNMAPPED", "SUGGESTED", "TYPE_MISMATCH", "STALE"],
            },
            notes: { type: "string", nullable: true },
          },
        },
      }),
    }),
    delete: op("Delete a data mapping", {
      parameters: [modelId, pathParam("mappingId", "cuid")],
    }),
  },
  "/v1/fpa/models/{modelId}/data-mappings/refresh": {
    post: op("Refresh mappings from model COA (Accounting GL); does not wipe manual MAPPED rows", {
      parameters: [modelId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          properties: {
            replaceExisting: { type: "boolean", default: false },
          },
        },
      }),
    }),
  },
  "/v1/fpa/models/{modelId}/versions": {
    get: op("List versions for a model (nested REST)", { parameters: [modelId] }),
  },
  "/v1/fpa/models/{modelId}/scenarios": {
    get: op("List scenarios for a model (nested REST; mirrors GET /scenarios?modelId=)", {
      parameters: [modelId],
    }),
  },
  "/v1/fpa/models/{modelId}/sensitivity-analysis": {
    post: op("What-if sensitivity (PERCENT shock on driver line; no persisted scenario)", {
      parameters: [modelId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["versionId", "scenarioId", "driverLineItemId"],
          properties: {
            versionId: { type: "string" },
            scenarioId: { type: "string" },
            driverLineItemId: { type: "string" },
            shock: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["PERCENT"], default: "PERCENT" },
                value: { type: "number", example: 5 },
              },
            },
            targetLineItemIds: { type: "array", items: { type: "string" } },
            periodRange: {
              type: "object",
              properties: {
                from: { type: "string", format: "date" },
                to: { type: "string", format: "date" },
              },
            },
          },
        },
      }),
    }),
  },
  "/v1/fpa/models/{modelId}/cells/update": {
    post: op("Update or upsert cell (injects path modelId; creates cell if coords given on empty version)", {
      parameters: [modelId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          properties: {
            cellId: { type: "string" },
            value: { type: "number" },
            versionId: { type: "string" },
            scenarioId: { type: "string" },
            lineItemId: { type: "string" },
            periodDate: { type: "string", format: "date" },
            reason: { type: "string" },
          },
        },
      }),
    }),
  },
  "/v1/fpa/models/{modelId}/cells/bulk-update": {
    post: op("Bulk update cells", { parameters: [modelId] }),
  },
  "/v1/fpa/models/{modelId}/cells/spread": {
    post: op("Spread value across periods", { parameters: [modelId] }),
  },
  "/v1/fpa/models/{modelId}/cells/copy-forward": {
    post: op("Copy cell value forward", { parameters: [modelId] }),
  },
  "/v1/fpa/models/{modelId}/cells/apply-growth": {
    post: op("Apply growth rate forward from a base period", {
      parameters: [modelId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["versionId", "scenarioId", "lineItemId", "fromPeriodDate", "ratePct"],
          properties: {
            versionId: { type: "string" },
            scenarioId: { type: "string" },
            lineItemId: { type: "string" },
            fromPeriodDate: { type: "string", format: "date" },
            ratePct: { type: "number", example: 5 },
            mode: { type: "string", enum: ["COMPOUND", "FLAT"], default: "COMPOUND" },
          },
        },
      }),
    }),
  },
  "/v1/fpa/models/{modelId}/cells/{cellId}/history": {
    get: op("Cell audit history (includes userName)", { parameters: [modelId, cellId] }),
  },
  "/v1/fpa/models/{modelId}/cells/{cellId}/comments": {
    get: op("List cell comments", { parameters: [modelId, cellId] }),
    post: op("Add cell comment", {
      parameters: [modelId, cellId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["body"],
          properties: { body: { type: "string" }, correctiveAction: { type: "string" } },
        },
      }),
    }),
  },
  "/v1/fpa/formulas/validate": {
    post: op("Validate formula expression"),
  },
  "/v1/fpa/formulas/dependency-check": {
    post: op("Check formula circular dependencies"),
  },
  "/v1/fpa/formulas/{formulaId}/impact-map": {
    get: op("Formula impact map", { parameters: [formulaId] }),
  },
  "/v1/fpa/models/{modelId}/formulas": {
    post: op("Create formula on model", { parameters: [modelId] }),
  },
  "/v1/fpa/formulas/{formulaId}": {
    put: op("Update formula", { parameters: [formulaId] }),
  },
  "/v1/fpa/scenarios": {
    get: op("List scenarios", { parameters: [queryParam("modelId", { type: "string" })] }),
    post: op("Create scenario"),
  },
  "/v1/fpa/scenarios/{id}/copy": {
    post: op("Copy scenario (cells + drivers)", { parameters: [id] }),
  },
  "/v1/fpa/scenarios/{id}/compare": {
    post: op("Compare scenarios side-by-side", { parameters: [id] }),
  },
  "/v1/fpa/scenarios/{id}/promote": {
    post: op("Promote scenario to official forecast", { parameters: [id] }),
  },
  "/v1/fpa/versions": {
    post: op("Create version (optional copyFromVersionId)"),
  },
  "/v1/fpa/versions/{id}/seed-cells": {
    post: op("Seed empty version cells or copyFromVersionId", { parameters: [id] }),
  },
  "/v1/fpa/versions/{id}/lock": {
    post: op("Lock version (cells + planning_locks)", { parameters: [id] }),
  },
  "/v1/fpa/versions/{id}/archive": {
    post: op("Archive version", { parameters: [id] }),
  },
  "/v1/fpa/workflows": {
    get: op("List workflows", {
      parameters: [queryParam("modelId", { type: "string" }), queryParam("status", { type: "string" })],
    }),
    post: op("Create workflow (+ optional tasks)"),
  },
  "/v1/fpa/workflows/{id}": {
    get: op("Get workflow", { parameters: [id] }),
  },
  "/v1/fpa/tasks/my-tasks": {
    get: op("List my open tasks (assigned to me or unassigned)", {
      parameters: [queryParam("modelId", { type: "string" }), queryParam("status", { type: "string" })],
    }),
  },
  "/v1/fpa/tasks/{id}/submit": {
    post: op("Submit task", { parameters: [id] }),
  },
  "/v1/fpa/tasks/{id}/return": {
    post: op("Return task", { parameters: [id] }),
  },
  "/v1/fpa/tasks/{id}/approve": {
    post: op("Approve task (maker-checker)", { parameters: [id] }),
  },
  "/v1/fpa/tasks/{id}/reassign": {
    post: op("Reassign task", { parameters: [id] }),
  },
  "/v1/fpa/actuals/sync": {
    post: op("Sync actuals from GL journal lines"),
  },
  "/v1/fpa/actuals/snapshots": {
    get: op("List actuals snapshots"),
  },
  "/v1/fpa/variance/calculate": {
    post: op("Calculate variance results"),
  },
  "/v1/fpa/variance/results": {
    get: op("List variance results"),
  },
  "/v1/fpa/variance/{id}/commentary": {
    post: op("Add variance commentary", { parameters: [id] }),
  },
  "/v1/fpa/home/dashboard": {
    get: op("FP&A home dashboard KPIs", {
      parameters: [queryParam("modelId", { type: "string" }), queryParam("versionId", { type: "string" })],
    }),
  },
  "/v1/fpa/models/{modelId}/line-items": {
    get: op("List line items", { parameters: [modelId] }),
    post: op("Create line item", { parameters: [modelId] }),
  },
  "/v1/fpa/models/{modelId}/drivers": {
    get: op("List drivers for model", { parameters: [modelId] }),
    post: op("Create driver", { parameters: [modelId] }),
  },
  "/v1/fpa/drivers/{id}": {
    put: op("Update driver (value/period/unit/name)", { parameters: [id] }),
  },
  "/v1/fpa/domain/{category}": {
    get: op("Domain view (workforce|revenue|expense|cash)", {
      parameters: [category, queryParam("modelId", { type: "string" })],
    }),
  },
  "/v1/fpa/exports/board-pack": {
    post: op("Create board pack / management report export job (returns downloadUrl)"),
  },
  "/v1/fpa/exports/{id}": {
    get: op("Get export job (+ downloadUrl)", { parameters: [id] }),
  },
  "/v1/fpa/exports/{id}/download": {
    get: op("Download export file (JSON attachment)", { parameters: [id] }),
  },
  "/v1/fpa/ai/suggest": {
    post: op("AI forecast suggestion stub (DRAFT only)"),
  },
  "/v1/fpa/ai/commentary-draft": {
    post: op("AI commentary draft stub (DRAFT only)"),
  },
};
