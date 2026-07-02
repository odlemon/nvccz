/**
 * Fundraising LP Pipeline — Swagger paths.
 * Requirements: docs/fundraising-lp-pipeline-backend-requirements.md
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";

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

const campaignId = { name: "campaignId", in: "path", required: true, schema: { type: "string" } };
const dealId = { name: "dealId", in: "path", required: true, schema: { type: "string" } };

export const fundraisingLpPipelineSwaggerPaths: Record<string, unknown> = {
  "/fundraising/campaigns": {
    get: op("List fundraising campaigns", {
      parameters: [
        { name: "fundId", in: "query", schema: { type: "string" } },
        { name: "status", in: "query", schema: { type: "string" } },
      ],
    }),
    post: op("Create campaign (seeds default stages)", {
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["fundId", "name", "targetCapital", "startDate", "closeDate"],
              properties: {
                fundId: { type: "string" },
                name: { type: "string" },
                targetCapital: { type: "number" },
                primaryCurrency: { type: "string", example: "USD" },
                startDate: { type: "string", format: "date" },
                closeDate: { type: "string", format: "date" },
                regionTags: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    }),
  },
  "/fundraising/campaigns/{campaignId}": {
    get: op("Get campaign", { parameters: [campaignId] }),
    patch: op("Update campaign", { parameters: [campaignId] }),
  },
  "/fundraising/campaigns/{campaignId}/board": {
    get: op("Kanban board", {
      parameters: [
        campaignId,
        { name: "presentationCurrency", in: "query", schema: { type: "string", enum: ["USD", "ZIG"] } },
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
        { name: "presentationCurrency", in: "query", schema: { type: "string", enum: ["USD", "ZIG"] } },
      ],
    }),
  },
  "/fundraising/campaigns/{campaignId}/deals": {
    post: op("Create pipeline deal", { parameters: [campaignId] }),
  },
  "/fundraising/campaigns/{campaignId}/mailer/send": {
    post: op("Batch outreach email", {
      parameters: [campaignId],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["dealIds", "templateKey"],
              properties: {
                dealIds: { type: "array", items: { type: "string" } },
                templateKey: { type: "string", enum: ["TEASER", "UPDATE", "FOLLOW_UP"] },
              },
            },
          },
        },
      },
    }),
  },
  "/fundraising/deals/{dealId}": {
    get: op("Get deal", { parameters: [dealId] }),
    patch: op("Update deal", { parameters: [dealId] }),
  },
  "/fundraising/deals/{dealId}/stage": {
    patch: op("Move deal stage (gated)", {
      parameters: [dealId],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["stageId"],
              properties: { stageId: { type: "string" } },
            },
          },
        },
      },
    }),
  },
  "/fundraising/deals/{dealId}/checklist": {
    get: op("Deal checklist", { parameters: [dealId] }),
    patch: op("Toggle checklist item", { parameters: [dealId] }),
  },
  "/fundraising/deals/{dealId}/interactions": {
    get: op("Interaction history", { parameters: [dealId] }),
    post: op("Log interaction", { parameters: [dealId] }),
  },
  "/fundraising/deals/{dealId}/agreement": {
    get: op("Agreement metadata", { parameters: [dealId] }),
  },
  "/fundraising/deals/{dealId}/agreement/upload": {
    post: op("Upload signed subscription agreement", {
      parameters: [dealId],
      requestBody: {
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file"],
              properties: { file: { type: "string", format: "binary" } },
            },
          },
        },
      },
    }),
  },
  "/fundraising/deals/{dealId}/close": {
    post: op("Manual close (WON orchestration)", { parameters: [dealId] }),
  },
};
