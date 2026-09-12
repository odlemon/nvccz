/**
 * Street Exchange Rate Display — Swagger paths.
 * Requirements: docs/street-exchange-rate-display-backend-requirements.md
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";

export const STREET_EXCHANGE_RATE_DISPLAY_TAG = "Street Exchange Rate Display";

export const STREET_EXCHANGE_RATE_DISPLAY_TAG_DEFINITION = {
  name: STREET_EXCHANGE_RATE_DISPLAY_TAG,
  description:
    "**Street Exchange Rate Display** — configurable FX widgets showing parallel (street) USD/ZWG alongside official Zimrate, with history and context-based formatting.\n\n" +
    "Base path: `/api/exchange-rate-display/*`. Display-only — accounting conversion paths unchanged.\n\n" +
    "See `docs/street-exchange-rate-display-backend-requirements.md`.",
};

const TAG = [STREET_EXCHANGE_RATE_DISPLAY_TAG];
const bearer = [{ bearerAuth: [] }];

function op(summary: string, extra: Record<string, unknown> = {}) {
  return {
    summary,
    tags: TAG,
    security: bearer,
    responses: SWAGGER_JSON_RESPONSES,
    ...extra,
  };
}

export const streetExchangeRateDisplaySwaggerPaths: Record<string, unknown> = {
  "/exchange-rate-display/widget": {
    get: op("FX display widget by context", {
      description: "Query: `context`, `from`, `to`, optional `asOfDate`.",
      parameters: [
        { name: "context", in: "query", schema: { type: "string", example: "DASHBOARD_ACCOUNTING" } },
        { name: "from", in: "query", schema: { type: "string", example: "USD" } },
        { name: "to", in: "query", schema: { type: "string", example: "ZWG" } },
        { name: "asOfDate", in: "query", schema: { type: "string", format: "date" } },
      ],
    }),
  },
  "/exchange-rate-display/rates/compare": {
    get: op("Street vs official compare", {
      parameters: [
        { name: "from", in: "query", schema: { type: "string" } },
        { name: "to", in: "query", schema: { type: "string" } },
        { name: "asOfDate", in: "query", schema: { type: "string", format: "date" } },
      ],
    }),
  },
  "/exchange-rate-display/rates/history": {
    get: op("Historical rate quotes", {
      parameters: [
        { name: "source", in: "query", schema: { type: "string", example: "ZIMRATE_STREET" } },
        { name: "from", in: "query", schema: { type: "string" } },
        { name: "to", in: "query", schema: { type: "string" } },
        { name: "dateFrom", in: "query", schema: { type: "string", format: "date" } },
        { name: "dateTo", in: "query", schema: { type: "string", format: "date" } },
      ],
    }),
  },
  "/exchange-rate-display/configs": {
    get: op("List display configs (finance admin)", {}),
    post: op("Create display config (finance admin)", {
      requestBody: {
        content: {
          "application/json": {
            schema: { type: "object" },
          },
        },
      },
    }),
  },
  "/exchange-rate-display/configs/{id}": {
    put: op("Update display config (finance admin)", {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/exchange-rate-display/ingest/run": {
    post: op("Refresh street + official quotes (finance admin)", {}),
  },
  "/exchange-rate-display/quotes/manual": {
    post: op("Post internal manual quote override (finance admin)", {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["fromCurrencyCode", "toCurrencyCode", "avg"],
              properties: {
                fromCurrencyCode: { type: "string" },
                toCurrencyCode: { type: "string" },
                avg: { type: "number" },
                bid: { type: "number" },
                ask: { type: "number" },
                asOfDate: { type: "string", format: "date" },
              },
            },
          },
        },
      },
    }),
  },
};
