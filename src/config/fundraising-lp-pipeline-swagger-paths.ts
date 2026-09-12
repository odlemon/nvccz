/**
 * Fundraising LP Pipeline — Swagger paths.
 * Requirements: docs/fundraising-lp-pipeline-backend-requirements.md
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";
import { jsonRequestBody, multipartRequestBody, pathParam, queryParam } from "./swagger-module-helpers";
import { SWAGGER_EX } from "./swagger-uat-examples";

export const FUNDRAISING_LP_PIPELINE_TAG = "Fundraising LP Pipeline";

export const FUNDRAISING_LP_PIPELINE_TAG_DEFINITION = {
  name: FUNDRAISING_LP_PIPELINE_TAG,
  description:
    "**Fundraising Activity Tracker & LP Pipeline** — campaigns, Kanban deals, stage gates, mailers, agreement upload, LP provisioning on WON.\n\n" +
    "Base path: `/fundraising/*` (server URL already includes `/api`).\n\n" +
    "See `docs/fundraising-lp-pipeline-backend-requirements.md`.",
};

const TAG = [FUNDRAISING_LP_PIPELINE_TAG];
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

const campaignId = pathParam("campaignId", SWAGGER_EX.campaignId);
const dealId = pathParam("dealId", SWAGGER_EX.dealId);

export const fundraisingLpPipelineSwaggerPaths: Record<string, unknown> = {
  "/fundraising/campaigns": {
    get: op("List fundraising campaigns", {
      parameters: [
        queryParam("fundId", { type: "string" }, SWAGGER_EX.fundId),
        queryParam("status", { type: "string" }, "ACTIVE"),
      ],
    }),
    post: op("Create campaign (seeds default stages)", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["fundId", "name", "targetCapital", "startDate", "closeDate"],
          properties: {
            fundId: { type: "string" },
            name: { type: "string" },
            targetCapital: { type: "number" },
            primaryCurrency: { type: "string" },
            startDate: { type: "string", format: "date" },
            closeDate: { type: "string", format: "date" },
            regionTags: { type: "array", items: { type: "string" } },
          },
        },
        examples: {
          newCampaign: {
            summary: "New fundraising campaign",
            value: {
              fundId: SWAGGER_EX.fundId,
              name: "Fund III First Close",
              targetCapital: 5000000,
              primaryCurrency: "USD",
              startDate: "2026-01-01",
              closeDate: "2026-12-31",
              regionTags: ["Southern Africa"],
            },
          },
        },
      }),
    }),
  },
  "/fundraising/campaigns/{campaignId}": {
    get: op("Get campaign", { parameters: [campaignId] }),
    patch: op("Update campaign", {
      parameters: [campaignId],
      requestBody: jsonRequestBody({
        required: false,
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            targetCapital: { type: "number" },
            primaryCurrency: { type: "string" },
            startDate: { type: "string", format: "date" },
            closeDate: { type: "string", format: "date" },
            regionTags: { type: "array", items: { type: "string" } },
            status: { type: "string" },
          },
        },
        examples: {
          updateTarget: {
            summary: "Raise target capital",
            value: { targetCapital: 7500000 },
          },
        },
      }),
    }),
  },
  "/fundraising/campaigns/{campaignId}/board": {
    get: op("Kanban board", {
      parameters: [
        campaignId,
        queryParam("presentationCurrency", { type: "string", enum: ["USD", "ZIG"] }, "USD"),
      ],
    }),
  },
  "/fundraising/campaigns/{campaignId}/dashboard": {
    get: op("Campaign dashboard summary", { parameters: [campaignId] }),
  },
  "/fundraising/campaigns/{campaignId}/metrics": {
    get: op("WPV, completion %, gap, days left", {
      parameters: [
        campaignId,
        queryParam("presentationCurrency", { type: "string", enum: ["USD", "ZIG"] }, "USD"),
      ],
    }),
  },
  "/fundraising/campaigns/{campaignId}/deals": {
    post: op("Create pipeline deal", {
      parameters: [campaignId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["prospectName", "proposedAmount"],
          properties: {
            prospectName: { type: "string" },
            prospectEmail: { type: "string", format: "email" },
            prospectPhone: { type: "string" },
            prospectCountry: { type: "string" },
            prospectType: { type: "string" },
            proposedAmount: { type: "number" },
            currencyCode: { type: "string" },
            priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
            notes: { type: "string" },
            stageCode: { type: "string" },
          },
        },
        examples: {
          newDeal: {
            summary: "New LP prospect",
            value: {
              prospectName: "Acme Family Office",
              prospectEmail: "contact@acme-fo.example.com",
              proposedAmount: 250000,
              currencyCode: "USD",
              priority: "HIGH",
            },
          },
        },
      }),
    }),
  },
  "/fundraising/campaigns/{campaignId}/mailer/send": {
    post: op("Batch outreach email", {
      parameters: [campaignId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["dealIds", "templateKey"],
          properties: {
            dealIds: { type: "array", items: { type: "string" } },
            templateKey: { type: "string", enum: ["TEASER", "UPDATE", "FOLLOW_UP"] },
          },
        },
        examples: {
          teaserBatch: {
            summary: "Send teaser to selected deals",
            value: {
              dealIds: [SWAGGER_EX.dealId],
              templateKey: "TEASER",
            },
          },
        },
      }),
    }),
  },
  "/fundraising/deals/{dealId}": {
    get: op("Get deal", { parameters: [dealId] }),
    patch: op("Update deal", {
      parameters: [dealId],
      requestBody: jsonRequestBody({
        required: false,
        schema: {
          type: "object",
          properties: {
            prospectName: { type: "string" },
            prospectEmail: { type: "string" },
            proposedAmount: { type: "number" },
            priority: { type: "string" },
            notes: { type: "string" },
          },
        },
        examples: {
          updateAmount: {
            summary: "Revise commitment amount",
            value: { proposedAmount: 500000, notes: "Increased after IC meeting" },
          },
        },
      }),
    }),
  },
  "/fundraising/deals/{dealId}/stage": {
    patch: op("Move deal stage (gated)", {
      parameters: [dealId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["stageId"],
          properties: { stageId: { type: "string" } },
        },
        examples: {
          moveStage: {
            summary: "Advance to next stage",
            value: { stageId: SWAGGER_EX.stageId },
          },
        },
      }),
    }),
  },
  "/fundraising/deals/{dealId}/checklist": {
    get: op("Deal checklist", { parameters: [dealId] }),
    patch: op("Toggle checklist item", {
      parameters: [dealId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["itemKey", "isComplete"],
          properties: {
            itemKey: { type: "string" },
            isComplete: { type: "boolean" },
          },
        },
        examples: {
          completeItem: {
            summary: "Mark KYC complete",
            value: { itemKey: "KYC_COMPLETE", isComplete: true },
          },
        },
      }),
    }),
  },
  "/fundraising/deals/{dealId}/interactions": {
    get: op("Interaction history", { parameters: [dealId] }),
    post: op("Log interaction", {
      parameters: [dealId],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["interactionType"],
          properties: {
            interactionType: { type: "string", enum: ["CALL", "EMAIL", "MEETING", "NOTE"] },
            subject: { type: "string" },
            body: { type: "string" },
          },
        },
        examples: {
          logCall: {
            summary: "Log intro call",
            value: {
              interactionType: "CALL",
              subject: "Intro call",
              body: "Discussed fund strategy and ticket size",
            },
          },
        },
      }),
    }),
  },
  "/fundraising/deals/{dealId}/agreement": {
    get: op("Agreement metadata", { parameters: [dealId] }),
  },
  "/fundraising/deals/{dealId}/agreement/upload": {
    post: op("Upload signed subscription agreement", {
      parameters: [dealId],
      requestBody: multipartRequestBody({
        schema: {
          type: "object",
          required: ["file"],
          properties: {
            file: { type: "string", format: "binary" },
          },
        },
        examples: {
          uploadAgreement: {
            summary: "Signed subscription agreement PDF",
            value: { file: "(binary PDF file)" },
          },
        },
      }),
    }),
  },
  "/fundraising/deals/{dealId}/close": {
    post: op("Manual close (WON orchestration)", { parameters: [dealId] }),
  },
};
