/**
 * Fundraising & Investor Relations (IR SRD foundation) — Swagger paths.
 * Docs: docs/fundraising-investor-relations-api.md
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";
import { jsonRequestBody, pathParam, queryParam } from "./swagger-module-helpers";
import { SWAGGER_EX } from "./swagger-uat-examples";

export const FUNDRAISING_IR_TAG = "Fundraising & Investor Relations";

export const FUNDRAISING_IR_TAG_DEFINITION = {
  name: FUNDRAISING_IR_TAG,
  description:
    "**Fundraising & Investor Relations foundation** — investor organisations, multi-amount opportunities, PE/AM stage seeds, dashboards.\n\n" +
    "Base paths: `/v1/fundraising/*` and `/v1/investors/*` (server URL already includes `/api`).\n\n" +
    "Legacy LP deal-close path remains at `/fundraising/*`. See `docs/fundraising-investor-relations-api.md`.",
};

const TAG = [FUNDRAISING_IR_TAG];
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

const campaignId = pathParam("campaignId", SWAGGER_EX.campaignId || "clxyz_campaign");
const opportunityId = pathParam("opportunityId", "clxyz_opportunity");
const investorId = pathParam("investorId", "clxyz_investor");

export const fundraisingIrSwaggerPaths: Record<string, unknown> = {
  "/v1/fundraising/dashboard": {
    get: op("Executive IR dashboard", {
      parameters: [
        queryParam("campaignId", { type: "string" }),
        queryParam("campaignType", { type: "string" }, "PE_FUNDRAISE"),
      ],
    }),
  },
  "/v1/fundraising/campaigns": {
    get: op("List IR campaigns", {
      parameters: [
        queryParam("campaignType", { type: "string" }),
        queryParam("status", { type: "string" }, "ACTIVE"),
        queryParam("fundId", { type: "string" }),
      ],
    }),
    post: op("Create IR campaign (seeds PE or AM stages)", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["campaignType", "name", "targetCapital", "startDate", "closeDate"],
          properties: {
            campaignType: {
              type: "string",
              enum: [
                "PE_FUNDRAISE",
                "VC_FUNDRAISE",
                "CO_INVESTMENT",
                "SPV",
                "CONTINUATION_VEHICLE",
                "INSTITUTIONAL_MANDATE",
                "PRODUCT_LAUNCH",
                "DISTRIBUTOR_CAMPAIGN",
              ],
            },
            name: { type: "string" },
            targetCapital: { type: "number" },
            fundId: { type: "string", description: "Required for PE/VC types" },
            productId: { type: "string" },
            primaryCurrency: { type: "string" },
            startDate: { type: "string", format: "date" },
            closeDate: { type: "string", format: "date" },
            campaignOwnerId: { type: "string" },
            investorSegments: { type: "object" },
            regionTags: { type: "array", items: { type: "string" } },
          },
        },
        examples: {
          peCampaign: {
            summary: "PE fundraise",
            value: {
              campaignType: "PE_FUNDRAISE",
              name: "Fund IV First Close",
              fundId: SWAGGER_EX.fundId,
              targetCapital: 100000000,
              primaryCurrency: "USD",
              startDate: "2026-01-01",
              closeDate: "2027-12-31",
            },
          },
        },
      }),
    }),
  },
  "/v1/fundraising/campaigns/{campaignId}": {
    get: op("Get IR campaign", { parameters: [campaignId] }),
    patch: op("Update IR campaign", {
      parameters: [campaignId],
      requestBody: jsonRequestBody({
        required: false,
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            targetCapital: { type: "number" },
            status: { type: "string" },
            description: { type: "string" },
          },
        },
      }),
    }),
  },
  "/v1/fundraising/campaigns/{campaignId}/activate": {
    post: op("Activate campaign (APPROVED + ACTIVE)", { parameters: [campaignId] }),
  },
  "/v1/fundraising/campaigns/{campaignId}/dashboard": {
    get: op("Campaign IR dashboard", { parameters: [campaignId] }),
  },
  "/v1/fundraising/opportunities": {
    get: op("List opportunities", {
      parameters: [
        queryParam("campaignId", { type: "string" }),
        queryParam("investorId", { type: "string" }),
        queryParam("status", { type: "string" }, "OPEN"),
        queryParam("stageCode", { type: "string" }),
        queryParam("ownerId", { type: "string" }),
      ],
    }),
    post: op("Create opportunity on ACTIVE campaign", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["campaignId", "investorId", "opportunityType"],
          properties: {
            campaignId: { type: "string" },
            investorId: { type: "string" },
            opportunityType: { type: "string" },
            indicativeAmount: { type: "number" },
            qualifiedAmount: { type: "number" },
            softCircleAmount: { type: "number" },
            proposedAmount: { type: "number" },
            expectedAum: { type: "number" },
            opportunityOwnerId: { type: "string" },
            priority: { type: "string" },
          },
        },
      }),
    }),
  },
  "/v1/fundraising/opportunities/{opportunityId}": {
    get: op("Get opportunity", { parameters: [opportunityId] }),
    patch: op("Update opportunity (amount changes write history)", {
      parameters: [opportunityId],
      requestBody: jsonRequestBody({
        required: false,
        schema: {
          type: "object",
          properties: {
            indicativeAmount: { type: "number" },
            softCircleAmount: { type: "number" },
            proposedAmount: { type: "number" },
            signedAmount: { type: "number" },
            reason: { type: "string" },
            notes: { type: "string" },
          },
        },
      }),
    }),
  },
  "/v1/fundraising/opportunities/{opportunityId}/transition": {
    post: op("Transition opportunity stage (gate checks)", {
      parameters: [opportunityId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          properties: {
            toStageId: { type: "string" },
            toStageCode: { type: "string" },
            reason: { type: "string" },
          },
        },
      }),
    }),
  },
  "/v1/fundraising/opportunities/{opportunityId}/assign": {
    post: op("Assign opportunity owner", {
      parameters: [opportunityId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["opportunityOwnerId"],
          properties: { opportunityOwnerId: { type: "string" } },
        },
      }),
    }),
  },
  "/v1/fundraising/opportunities/{opportunityId}/mark-lost": {
    post: op("Mark opportunity lost", {
      parameters: [opportunityId],
      requestBody: jsonRequestBody({
        required: false,
        schema: {
          type: "object",
          properties: { lostReason: { type: "string" } },
        },
      }),
    }),
  },
  "/v1/fundraising/opportunities/{opportunityId}/timeline": {
    get: op("Opportunity amount + stage timeline", { parameters: [opportunityId] }),
  },
  "/v1/investors": {
    get: op("List investor organisations", {
      parameters: [
        queryParam("q", { type: "string" }),
        queryParam("status", { type: "string" }, "ACTIVE"),
        queryParam("investorType", { type: "string" }),
        queryParam("page", { type: "integer" }, 1),
        queryParam("pageSize", { type: "integer" }, 25),
      ],
    }),
    post: op("Create investor organisation", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["legalName", "investorType"],
          properties: {
            legalName: { type: "string" },
            tradingName: { type: "string" },
            investorType: { type: "string" },
            countryCode: { type: "string" },
            baseCurrency: { type: "string" },
            relationshipOwnerId: { type: "string" },
          },
        },
      }),
    }),
  },
  "/v1/investors/{investorId}": {
    get: op("Get investor organisation", { parameters: [investorId] }),
    patch: op("Update investor organisation", {
      parameters: [investorId],
      requestBody: jsonRequestBody({
        required: false,
        schema: {
          type: "object",
          properties: {
            legalName: { type: "string" },
            kycStatus: { type: "string" },
            sanctionsStatus: { type: "string" },
            status: { type: "string" },
            notes: { type: "string" },
          },
        },
      }),
    }),
  },
  "/v1/investors/{investorId}/contacts": {
    post: op("Add investor contact", {
      parameters: [investorId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["fullName"],
          properties: {
            fullName: { type: "string" },
            roleTitle: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            isPrimary: { type: "boolean" },
          },
        },
      }),
    }),
  },
  "/v1/investors/{investorId}/relationship-summary": {
    get: op("Investor relationship summary", { parameters: [investorId] }),
  },
};
