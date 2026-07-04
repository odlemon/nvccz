/**
 * Tax Return Pack — Swagger paths.
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";
import { jsonRequestBody, pathParam, queryParam } from "./swagger-module-helpers";
import { SWAGGER_EX } from "./swagger-uat-examples";

export const TAX_RETURN_PACK_TAG = "Tax Return Pack";

export const TAX_RETURN_PACK_TAG_DEFINITION = {
  name: TAX_RETURN_PACK_TAG,
  description:
    "**Tax Return Pack Generation (Section 3.15)** — ZIMRA ITF 12C reconciliation, CGT indexation, dual-currency splits, maker-checker sign-off, SHA-256 PDF, GL accrual, LP portal publish.\n\n" +
    "Base path: `/tax-return-packs/*` (server URL already includes `/api`).\n\n" +
    "See `docs/tax-return-pack-backend-requirements.md`.",
};

const TAG = [TAX_RETURN_PACK_TAG];
const bearer = [{ bearerAuth: [] }];

function op(summary: string, extra: Record<string, unknown> = {}) {
  return { summary, tags: TAG, security: bearer, responses: SWAGGER_JSON_RESPONSES, ...extra };
}

const packId = pathParam("packId", SWAGGER_EX.packId);
const lineId = pathParam("lineId", "reconciliation-line-id");

export const taxReturnPackSwaggerPaths: Record<string, unknown> = {
  "/tax-return-packs": {
    get: op("List tax return packs", {
      parameters: [
        queryParam("forecastEntityId", { type: "string" }),
        queryParam("fundId", { type: "string" }, SWAGGER_EX.fundId),
        queryParam("taxYear", { type: "integer" }, "2025"),
        queryParam("status", { type: "string", enum: ["DRAFT", "COMPILING", "DRAFT_REVIEW", "SIGNED_OFF", "FAILED"] }),
      ],
    }),
    post: op("Provision tax return pack", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["forecastEntityId", "taxYear"],
          properties: {
            forecastEntityId: { type: "string" },
            taxYear: { type: "integer" },
            taxPeriod: { type: "string", enum: ["ANNUAL", "Q1", "Q2", "Q3", "Q4"] },
            taxRegime: { type: "string", enum: ["ZIMRA_CIT"] },
            baseCurrency: { type: "string" },
            fundId: { type: "string" },
          },
        },
      }),
    }),
  },
  "/tax-return-packs/{packId}": {
    get: op("Pack detail", { parameters: [packId] }),
  },
  "/tax-return-packs/{packId}/dashboard": {
    get: op("Dashboard — reconciliation, CGT, blockers", { parameters: [packId] }),
  },
  "/tax-return-packs/{packId}/compile": {
    post: op("Compile — GL ingest + schedules", { parameters: [packId] }),
  },
  "/tax-return-packs/{packId}/reconciliation": {
    get: op("ITF 12C reconciliation lines", { parameters: [packId] }),
  },
  "/tax-return-packs/{packId}/reconciliation/{lineId}": {
    patch: op("Override tax categorization", {
      parameters: [packId, lineId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["taxCategory"],
          properties: {
            taxCategory: { type: "string", enum: ["BOOK", "ADD_BACK", "DEDUCT", "EXEMPT"] },
            reason: { type: "string" },
          },
        },
      }),
    }),
  },
  "/tax-return-packs/{packId}/cgt": {
    get: op("CGT schedule lines", { parameters: [packId] }),
  },
  "/tax-return-packs/{packId}/submit-review": {
    post: op("Maker submit for review", { parameters: [packId] }),
  },
  "/tax-return-packs/{packId}/sign-off": {
    post: op("Checker sign-off — lock, PDF, GL, portal", { parameters: [packId] }),
  },
  "/tax-return-packs/{packId}/pdf": {
    get: op("Download signed PDF", { parameters: [packId] }),
  },
  "/tax-return-packs/{packId}/audit": {
    get: op("Audit trail", { parameters: [packId] }),
  },
};
