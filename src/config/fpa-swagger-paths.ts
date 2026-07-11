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
  "/v1/fpa/models/{modelId}/grid": {
    get: op("Get planning grid (paginated cells)", {
      parameters: [
        modelId,
        queryParam("versionId", { type: "string" }),
        queryParam("scenarioId", { type: "string" }),
        queryParam("page", { type: "integer" }, "1"),
        queryParam("pageSize", { type: "integer" }, "100"),
      ],
    }),
  },
  "/v1/fpa/models/{modelId}/cells/update": {
    post: op("Update single cell", {
      parameters: [modelId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["cellId", "value"],
          properties: {
            cellId: { type: "string" },
            value: { type: "number" },
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
  "/v1/fpa/models/{modelId}/cells/{cellId}/history": {
    get: op("Cell audit history", { parameters: [modelId, cellId] }),
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
