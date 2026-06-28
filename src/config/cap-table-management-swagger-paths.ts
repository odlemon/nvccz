/**
 * Cap Table Management — Swagger paths.
 * Requirements: docs/cap-table-management-backend-requirements.md
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";

export const CAP_TABLE_MANAGEMENT_TAG = "Cap Table Management";

export const CAP_TABLE_MANAGEMENT_TAG_DEFINITION = {
  name: CAP_TABLE_MANAGEMENT_TAG,
  description:
    "**Cap Table Management & Dilution Engine** — share classes, immutable transaction ledger, dilution sandbox, waterfall, GL sync, stock certificates.\n\n" +
    "Base path: `/cap-table/*` (server URL already includes `/api`).\n\n" +
    "See `docs/cap-table-management-backend-requirements.md`.",
};

const TAG = [CAP_TABLE_MANAGEMENT_TAG];
const bearer = [{ bearerAuth: [] }];

const pcId = {
  name: "portfolioCompanyId",
  in: "path",
  required: true,
  schema: { type: "string" },
};

function op(summary: string, extra: Record<string, unknown> = {}) {
  return {
    summary,
    tags: TAG,
    security: bearer,
    responses: SWAGGER_JSON_RESPONSES,
    ...extra,
  };
}

export const capTableManagementSwaggerPaths: Record<string, unknown> = {
  "/cap-table/registries": {
    get: op("List cap table registries", { parameters: [{ name: "fundId", in: "query", schema: { type: "string" } }] }),
    post: op("Bootstrap registry for portfolio company", {
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["portfolioCompanyId"],
              properties: {
                portfolioCompanyId: { type: "string" },
                baseCurrencyCode: { type: "string", example: "USD" },
              },
            },
          },
        },
      },
    }),
  },
  "/cap-table/registries/{portfolioCompanyId}": {
    get: op("Get registry detail", { parameters: [pcId] }),
  },
  "/cap-table/registries/{portfolioCompanyId}/register": {
    get: op("Consolidated cap table register + ownership %", { parameters: [pcId] }),
  },
  "/cap-table/registries/{portfolioCompanyId}/share-classes": {
    get: op("List share classes", { parameters: [pcId] }),
    post: op("Create share class / ESOP pool", {
      parameters: [pcId],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["classCode", "className", "authorizedShares"],
              properties: {
                classCode: { type: "string", example: "COMMON" },
                className: { type: "string" },
                classType: { type: "string", enum: ["COMMON", "PREFERRED", "OPTION_POOL"] },
                parValue: { type: "number" },
                authorizedShares: { type: "number" },
                seniorityIndex: { type: "integer" },
                liquidationMultiplier: { type: "number" },
                isParticipating: { type: "boolean" },
              },
            },
          },
        },
      },
    }),
  },
  "/cap-table/registries/{portfolioCompanyId}/stakeholders": {
    get: op("List stakeholders", { parameters: [pcId] }),
    post: op("Create stakeholder", {
      parameters: [pcId],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["displayName"],
              properties: {
                displayName: { type: "string" },
                stakeholderType: { type: "string" },
                clientId: { type: "string" },
                email: { type: "string" },
              },
            },
          },
        },
      },
    }),
  },
  "/cap-table/registries/{portfolioCompanyId}/convertibles": {
    get: op("List convertible instruments", { parameters: [pcId] }),
    post: op("Create convertible note", { parameters: [pcId] }),
  },
  "/cap-table/registries/{portfolioCompanyId}/transactions": {
    get: op("List transactions", { parameters: [pcId] }),
  },
  "/cap-table/registries/{portfolioCompanyId}/transactions/issuance": {
    post: op("Create DRAFT issuance", {
      parameters: [pcId],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["shareClassId", "toStakeholderId", "quantity", "pricePerShare", "issuanceDate"],
              properties: {
                shareClassId: { type: "string" },
                toStakeholderId: { type: "string" },
                quantity: { type: "number" },
                pricePerShare: { type: "number" },
                issuanceDate: { type: "string", format: "date" },
                boardResolutionUrl: { type: "string" },
              },
            },
          },
        },
      },
    }),
  },
  "/cap-table/registries/{portfolioCompanyId}/transactions/transfer": {
    post: op("Create DRAFT transfer (validates seller balance)", { parameters: [pcId] }),
  },
  "/cap-table/registries/{portfolioCompanyId}/transactions/{transactionId}/submit": {
    post: op("Submit transaction for approval", {
      parameters: [pcId, { name: "transactionId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/cap-table/registries/{portfolioCompanyId}/transactions/{transactionId}/approve": {
    post: op("Approve transaction", {
      parameters: [pcId, { name: "transactionId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/cap-table/registries/{portfolioCompanyId}/transactions/{transactionId}/execute": {
    post: op("Execute transaction (GL + certificate)", {
      parameters: [pcId, { name: "transactionId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/cap-table/registries/{portfolioCompanyId}/simulator/run": {
    post: op("Dilution sandbox (no DB writes)", {
      parameters: [pcId],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                preMoneyValuation: { type: "number", example: 10000000 },
                roundInvestment: { type: "number", example: 2500000 },
                optionPoolTopUpPct: { type: "number", example: 10 },
                preMoneyFullyDilutedShares: { type: "number" },
              },
            },
          },
        },
      },
    }),
  },
  "/cap-table/registries/{portfolioCompanyId}/waterfall/evaluate": {
    post: op("Exit waterfall evaluation (stateless)", { parameters: [pcId] }),
  },
  "/cap-table/registries/{portfolioCompanyId}/transactions/{transactionId}/certificate": {
    get: op("Download stock certificate PDF", {
      parameters: [pcId, { name: "transactionId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/cap-table/integrations/deal-execution/closed": {
    post: op("PLACEHOLDER — Deal Execution Pack closed webhook", {
      description: "x-placeholder: Section 3.11 not implemented yet",
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["dealExecutionPackId", "portfolioCompanyId", "closedAt", "spaMetadata"],
            },
          },
        },
      },
    }),
  },
};
