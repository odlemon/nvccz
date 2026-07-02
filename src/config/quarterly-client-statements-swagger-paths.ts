/**
 * Quarterly Client Statements — Swagger paths.
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";

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

const runId = { name: "runId", in: "path", required: true, schema: { type: "string" } };
const clientId = { name: "clientId", in: "path", required: true, schema: { type: "string" } };

export const quarterlyClientStatementsSwaggerPaths: Record<string, unknown> = {
  "/quarterly-statements/runs": {
    get: op("List statement runs", {
      parameters: [
        { name: "fundId", in: "query", schema: { type: "string" } },
        { name: "status", in: "query", schema: { type: "string" } },
      ],
    }),
    post: op("Initialize quarterly run", {
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["fundId", "financialYear", "calendarQuarter"],
              properties: {
                fundId: { type: "string" },
                financialYear: { type: "integer", example: 2026 },
                calendarQuarter: { type: "string", enum: ["Q1", "Q2", "Q3", "Q4"] },
              },
            },
          },
        },
      },
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
