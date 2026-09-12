/**
 * Deal Execution Pack — Swagger paths.
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";
import { jsonRequestBody, multipartRequestBody, pathParam, queryParam } from "./swagger-module-helpers";
import { SWAGGER_EX } from "./swagger-uat-examples";

export const DEAL_EXECUTION_PACK_TAG = "Deal Execution Pack";

export const DEAL_EXECUTION_PACK_TAG_DEFINITION = {
  name: DEAL_EXECUTION_PACK_TAG,
  description:
    "**Deal Execution Pack Generation (Section 3.11)** — structured closing workspace, CP tracker, SHA-256 documents, role sign-offs, EXECUTED handoff to cap table + GL.\n\n" +
    "Base path: `/deal-execution-packs/*` (server URL already includes `/api`).\n\n" +
    "See `docs/deal-execution-pack-backend-requirements.md`.",
};

const TAG = [DEAL_EXECUTION_PACK_TAG];
const bearer = [{ bearerAuth: [] }];

function op(summary: string, extra: Record<string, unknown> = {}) {
  return { summary, tags: TAG, security: bearer, responses: SWAGGER_JSON_RESPONSES, ...extra };
}

const packId = pathParam("packId", SWAGGER_EX.packId);
const slotCode = pathParam("slotCode", "SPA");
const documentId = pathParam("documentId", SWAGGER_EX.documentId);
const cpId = pathParam("cpId", SWAGGER_EX.cpId);
const signatureId = pathParam("signatureId", SWAGGER_EX.signatureId);

export const dealExecutionPackSwaggerPaths: Record<string, unknown> = {
  "/deal-execution-packs": {
    get: op("List deal execution packs", {
      parameters: [
        queryParam("fundId", { type: "string" }, SWAGGER_EX.fundId),
        queryParam("portfolioCompanyId", { type: "string" }, SWAGGER_EX.portfolioCompanyId),
        queryParam("status", { type: "string", enum: ["DRAFT", "IN_PROGRESS", "READY_FOR_SIGNOFF", "EXECUTED"] }, "IN_PROGRESS"),
      ],
    }),
    post: op("Create / provision pack", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["fundId", "portfolioCompanyId"],
          properties: {
            fundId: { type: "string" },
            portfolioCompanyId: { type: "string" },
            applicationId: { type: "string" },
            transactionType: { type: "string", enum: ["EQUITY_ROUND"] },
            baseCurrency: { type: "string" },
            investmentAmount: { type: "number" },
            preMoneyValuation: { type: "number" },
            metadata: { type: "object" },
          },
        },
        examples: {
          createPack: {
            summary: "Manual GP provision",
            value: {
              fundId: SWAGGER_EX.fundId,
              portfolioCompanyId: SWAGGER_EX.portfolioCompanyId,
              transactionType: "EQUITY_ROUND",
              baseCurrency: "USD",
              investmentAmount: 500000,
              preMoneyValuation: 5000000,
              metadata: {
                shareClassCode: "COMMON",
                quantity: 100000,
                pricePerShare: 5,
              },
            },
          },
        },
      }),
    }),
  },
  "/deal-execution-packs/{packId}": {
    get: op("Pack detail", { parameters: [packId] }),
  },
  "/deal-execution-packs/{packId}/dashboard": {
    get: op("Dashboard — I_CP, R_legal, doc/sig summary", { parameters: [packId] }),
  },
  "/deal-execution-packs/{packId}/documents": {
    get: op("List document slots + versions", { parameters: [packId] }),
  },
  "/deal-execution-packs/{packId}/documents/{slotCode}/upload": {
    post: op("Upload / replace slot document (multipart)", {
      parameters: [packId, slotCode],
      requestBody: multipartRequestBody({
        schema: {
          type: "object",
          required: ["document"],
          properties: {
            document: { type: "string", format: "binary" },
          },
        },
        examples: {
          spaUpload: {
            summary: "SPA PDF upload",
            value: { document: "(binary PDF)" },
          },
        },
      }),
    }),
  },
  "/deal-execution-packs/{packId}/documents/{documentId}/verify": {
    get: op("SHA-256 integrity verify", { parameters: [packId, documentId] }),
  },
  "/deal-execution-packs/{packId}/documents/{documentId}/download": {
    get: op("Download with integrity gate", {
      parameters: [packId, documentId],
      responses: {
        200: {
          description: "PDF document",
          content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
        },
      },
    }),
  },
  "/deal-execution-packs/{packId}/cps": {
    get: op("List conditions precedent", { parameters: [packId] }),
    post: op("Add CP item", {
      parameters: [packId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["description"],
          properties: {
            description: { type: "string" },
            weight: { type: "integer" },
            priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
            verificationOwnerId: { type: "string" },
            documentId: { type: "string" },
          },
        },
        examples: {
          addCp: {
            summary: "KYC clearance CP",
            value: {
              description: "KYC clearance certificate on file",
              weight: 25,
              priority: "HIGH",
            },
          },
        },
      }),
    }),
  },
  "/deal-execution-packs/{packId}/cps/{cpId}": {
    patch: op("Update CP", {
      parameters: [packId, cpId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          properties: {
            description: { type: "string" },
            weight: { type: "integer" },
            priority: { type: "string" },
            verificationOwnerId: { type: "string" },
          },
        },
        examples: {
          updateCp: {
            summary: "Re-weight CP",
            value: { weight: 30, priority: "HIGH" },
          },
        },
      }),
    }),
  },
  "/deal-execution-packs/{packId}/cps/{cpId}/satisfy": {
    post: op("Satisfy CP (verification owner)", { parameters: [packId, cpId] }),
  },
  "/deal-execution-packs/{packId}/signatures": {
    get: op("List required signatories", { parameters: [packId] }),
  },
  "/deal-execution-packs/{packId}/signatures/{signatureId}/sign": {
    post: op("Record role sign-off", { parameters: [packId, signatureId] }),
  },
  "/deal-execution-packs/{packId}/execute": {
    post: op("Final execute — R_legal gate, GL + cap table", { parameters: [packId] }),
  },
  "/deal-execution-packs/{packId}/audit": {
    get: op("Immutable audit trail", { parameters: [packId] }),
  },
};
