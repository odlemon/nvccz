/**
 * Quarterly Client Statements — Swagger paths.
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";
import { jsonRequestBody, pathParam, queryParam } from "./swagger-module-helpers";
import { SWAGGER_EX } from "./swagger-uat-examples";

export const QUARTERLY_CLIENT_STATEMENTS_TAG = "Quarterly Client Statements";

export const QUARTERLY_CLIENT_STATEMENTS_TAG_DEFINITION = {
  name: QUARTERLY_CLIENT_STATEMENTS_TAG,
  description:
    "**Automated Quarterly Client Statement & Portfolio Reporting** — batch runs, maker-checker REVIEW, dual-currency metrics, portal publish.\n\n" +
    "Base path: `/quarterly-statements/*` (server URL already includes `/api`).\n\n" +
    "See `docs/quarterly-client-statements-backend-requirements.md`.",
};

const TAG = [QUARTERLY_CLIENT_STATEMENTS_TAG];
const bearer = [{ bearerAuth: [] }];

function op(summary: string, extra: Record<string, unknown> = {}) {
  return { summary, tags: TAG, security: bearer, responses: SWAGGER_JSON_RESPONSES, ...extra };
}

const runId = pathParam("runId", SWAGGER_EX.runId);
const clientId = pathParam("clientId", SWAGGER_EX.clientId);

export const quarterlyClientStatementsSwaggerPaths: Record<string, unknown> = {
  "/quarterly-statements/runs": {
    get: op("List statement runs", {
      parameters: [
        queryParam("fundId", { type: "string" }, SWAGGER_EX.fundId),
        queryParam("status", { type: "string", enum: ["COMPILING", "REVIEW", "COMPLETED", "FAILED"] }, "REVIEW"),
      ],
    }),
    post: op("Initialize quarterly run", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["fundId", "financialYear", "calendarQuarter"],
          properties: {
            fundId: { type: "string" },
            financialYear: { type: "integer" },
            calendarQuarter: { type: "string", enum: ["Q1", "Q2", "Q3", "Q4"] },
          },
        },
        examples: {
          initRun: {
            summary: "Initialize Q3 2026 run",
            value: {
              fundId: SWAGGER_EX.fundId,
              financialYear: SWAGGER_EX.financialYear,
              calendarQuarter: SWAGGER_EX.calendarQuarter,
            },
          },
        },
      }),
    }),
  },
  "/quarterly-statements/runs/{runId}": {
    get: op("Get run detail", { parameters: [runId] }),
  },
  "/quarterly-statements/runs/{runId}/dashboard": {
    get: op("Batch dashboard summary", { parameters: [runId] }),
  },
  "/quarterly-statements/runs/{runId}/compile": {
    post: op("Preflight + freeze + compile metrics", { parameters: [runId] }),
  },
  "/quarterly-statements/runs/{runId}/recipients": {
    get: op("List compiled recipients", { parameters: [runId] }),
  },
  "/quarterly-statements/runs/{runId}/recipients/{clientId}/preview": {
    get: op("Statement preview for LP", { parameters: [runId, clientId] }),
  },
  "/quarterly-statements/runs/{runId}/recipients/{clientId}/recompute": {
    post: op("Recompute recipient (REVIEW only)", { parameters: [runId, clientId] }),
  },
  "/quarterly-statements/runs/{runId}/submit-review": {
    post: op("Maker submit for checker review", { parameters: [runId] }),
  },
  "/quarterly-statements/runs/{runId}/approve": {
    post: op("Checker approve + publish to LP Portal", { parameters: [runId] }),
  },
};
