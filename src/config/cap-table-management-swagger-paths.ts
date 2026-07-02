/**
 * Cap Table Management — Swagger paths.
 * Requirements: docs/cap-table-management-backend-requirements.md
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";
import { jsonRequestBody, pathParam, queryParam } from "./swagger-module-helpers";
import { SWAGGER_EX } from "./swagger-uat-examples";

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

const pcId = pathParam("portfolioCompanyId", SWAGGER_EX.portfolioCompanyId);
const txId = pathParam("transactionId", SWAGGER_EX.transactionId);

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
    get: op("List cap table registries", {
      parameters: [queryParam("fundId", { type: "string" }, SWAGGER_EX.fundId)],
    }),
    post: op("Bootstrap registry for portfolio company", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["portfolioCompanyId"],
          properties: {
            portfolioCompanyId: { type: "string" },
            baseCurrencyCode: { type: "string" },
          },
        },
        examples: {
          bootstrap: {
            summary: "Bootstrap cap table registry",
            value: {
              portfolioCompanyId: SWAGGER_EX.portfolioCompanyId,
              baseCurrencyCode: "USD",
            },
          },
        },
      }),
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
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["classCode", "className", "authorizedShares"],
          properties: {
            classCode: { type: "string" },
            className: { type: "string" },
            classType: { type: "string", enum: ["COMMON", "PREFERRED", "OPTION_POOL"] },
            parValue: { type: "number" },
            authorizedShares: { type: "number" },
            seniorityIndex: { type: "integer" },
            liquidationMultiplier: { type: "number" },
            isParticipating: { type: "boolean" },
          },
        },
        examples: {
          commonClass: {
            summary: "Common share class",
            value: {
              classCode: "COMMON",
              className: "Common Shares",
              classType: "COMMON",
              parValue: 0.01,
              authorizedShares: 10000000,
              seniorityIndex: 99,
            },
          },
        },
      }),
    }),
  },
  "/cap-table/registries/{portfolioCompanyId}/stakeholders": {
    get: op("List stakeholders", { parameters: [pcId] }),
    post: op("Create stakeholder", {
      parameters: [pcId],
      requestBody: jsonRequestBody({
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
        examples: {
          founder: {
            summary: "Founder stakeholder",
            value: {
              displayName: "Jane Founder",
              stakeholderType: "FOUNDER",
              email: "jane@portfolio-co.example.com",
            },
          },
        },
      }),
    }),
  },
  "/cap-table/registries/{portfolioCompanyId}/convertibles": {
    get: op("List convertible instruments", { parameters: [pcId] }),
    post: op("Create convertible note", {
      parameters: [pcId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["holderStakeholderId", "principal", "issueDate"],
          properties: {
            holderStakeholderId: { type: "string" },
            principal: { type: "number" },
            annualInterestRate: { type: "number" },
            valuationCap: { type: "number" },
            discountRate: { type: "number" },
            issueDate: { type: "string", format: "date" },
            maturityDate: { type: "string", format: "date" },
          },
        },
        examples: {
          convertibleNote: {
            summary: "Seed convertible note",
            value: {
              holderStakeholderId: SWAGGER_EX.stakeholderId,
              principal: 500000,
              annualInterestRate: 8,
              valuationCap: 10000000,
              discountRate: 20,
              issueDate: "2025-06-01",
              maturityDate: "2027-06-01",
            },
          },
        },
      }),
    }),
  },
  "/cap-table/registries/{portfolioCompanyId}/transactions": {
    get: op("List transactions", { parameters: [pcId] }),
  },
  "/cap-table/registries/{portfolioCompanyId}/transactions/issuance": {
    post: op("Create DRAFT issuance", {
      parameters: [pcId],
      requestBody: jsonRequestBody({
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
        examples: {
          founderIssuance: {
            summary: "Founder share issuance",
            value: {
              shareClassId: SWAGGER_EX.shareClassId,
              toStakeholderId: SWAGGER_EX.stakeholderId,
              quantity: 100000,
              pricePerShare: 1.5,
              issuanceDate: "2026-01-15",
            },
          },
        },
      }),
    }),
  },
  "/cap-table/registries/{portfolioCompanyId}/transactions/transfer": {
    post: op("Create DRAFT transfer (validates seller balance)", {
      parameters: [pcId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["shareClassId", "fromStakeholderId", "toStakeholderId", "quantity"],
          properties: {
            shareClassId: { type: "string" },
            fromStakeholderId: { type: "string" },
            toStakeholderId: { type: "string" },
            quantity: { type: "number" },
            issuanceDate: { type: "string", format: "date" },
            notes: { type: "string" },
          },
        },
        examples: {
          secondaryTransfer: {
            summary: "Secondary transfer between holders",
            value: {
              shareClassId: SWAGGER_EX.shareClassId,
              fromStakeholderId: SWAGGER_EX.stakeholderId,
              toStakeholderId: SWAGGER_EX.clientId,
              quantity: 10000,
              issuanceDate: "2026-02-01",
              notes: "Secondary sale",
            },
          },
        },
      }),
    }),
  },
  "/cap-table/registries/{portfolioCompanyId}/transactions/{transactionId}/submit": {
    post: op("Submit transaction for approval", { parameters: [pcId, txId] }),
  },
  "/cap-table/registries/{portfolioCompanyId}/transactions/{transactionId}/approve": {
    post: op("Approve transaction", { parameters: [pcId, txId] }),
  },
  "/cap-table/registries/{portfolioCompanyId}/transactions/{transactionId}/execute": {
    post: op("Execute transaction (GL + certificate)", { parameters: [pcId, txId] }),
  },
  "/cap-table/registries/{portfolioCompanyId}/simulator/run": {
    post: op("Dilution sandbox (no DB writes)", {
      parameters: [pcId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          properties: {
            preMoneyValuation: { type: "number" },
            roundInvestment: { type: "number" },
            optionPoolTopUpPct: { type: "number" },
            preMoneyFullyDilutedShares: { type: "number" },
          },
        },
        examples: {
          seriesA: {
            summary: "Series A dilution scenario",
            value: {
              preMoneyValuation: 10000000,
              roundInvestment: 2500000,
              optionPoolTopUpPct: 10,
            },
          },
        },
      }),
    }),
  },
  "/cap-table/registries/{portfolioCompanyId}/waterfall/evaluate": {
    post: op("Exit waterfall evaluation (stateless)", { parameters: [pcId] }),
  },
  "/cap-table/registries/{portfolioCompanyId}/transactions/{transactionId}/certificate": {
    get: op("Download stock certificate PDF", {
      parameters: [pcId, txId],
      responses: {
        200: {
          description: "PDF certificate",
          content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
        },
        404: { description: "Not found" },
      },
    }),
  },
  "/cap-table/integrations/deal-execution/closed": {
    post: op("PLACEHOLDER — Deal Execution Pack closed webhook", {
      description: "x-placeholder: Section 3.11 not implemented yet",
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["dealExecutionPackId", "portfolioCompanyId", "closedAt", "spaMetadata"],
          properties: {
            dealExecutionPackId: { type: "string" },
            portfolioCompanyId: { type: "string" },
            closedAt: { type: "string", format: "date-time" },
            spaMetadata: { type: "object" },
          },
        },
        examples: {
          closedWebhook: {
            summary: "Deal closed webhook stub",
            value: {
              dealExecutionPackId: "dep-001",
              portfolioCompanyId: SWAGGER_EX.portfolioCompanyId,
              closedAt: "2026-06-01T12:00:00Z",
              spaMetadata: { instrumentType: "EQUITY" },
            },
          },
        },
      }),
    }),
  },
};
