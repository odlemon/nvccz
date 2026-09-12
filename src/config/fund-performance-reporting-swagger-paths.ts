/**
 * Fund Performance Reporting & Email Distribution — Swagger paths.
 * Requirements: docs/fund-performance-reporting-backend-requirements.md
 * Design session: design-sessions/fund-performance-reporting.md
 *
 * Cron route POST /api/cron/fund-reporting/schedule-tick is omitted from Swagger (ops only).
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";
import { jsonRequestBody, mergeResponses, pathParam, queryParam } from "./swagger-module-helpers";
import { SWAGGER_EX } from "./swagger-uat-examples";

export const FUND_PERFORMANCE_REPORTING_TAG = "Fund Performance Reporting";

export const FUND_PERFORMANCE_REPORTING_TAG_DEFINITION = {
  name: FUND_PERFORMANCE_REPORTING_TAG,
  description:
    "**Fund Performance Reporting & Email Distribution** — US-3.5.1–US-3.5.4.\n\n" +
    "Automated fund performance report compilation (Investor vs Board packs), per-LP PDF generation, " +
    "permissioned email distribution (ZeptoMail wrapper), secure download links for large attachments, " +
    "and delivery monitoring (GP/ops console).\n\n" +
    "LP self-service is in the **LP Portal** module (`/api/lp-portal/*`).\n\n" +
    "See `docs/fund-performance-reporting-backend-requirements.md`.",
};

const TAG = [FUND_PERFORMANCE_REPORTING_TAG];
const bearer = [{ bearerAuth: [] }];

const idParam = pathParam("id", SWAGGER_EX.templateId);
const runIdParam = pathParam("runId", SWAGGER_EX.runId);
const tokenParam = pathParam("token", SWAGGER_EX.downloadToken);

function op(summary: string, extra: Record<string, unknown> = {}) {
  return {
    summary,
    tags: TAG,
    security: bearer,
    responses: SWAGGER_JSON_RESPONSES,
    ...extra,
  };
}

function usOp(storyRef: string, summary: string, description: string, extra: Record<string, unknown> = {}) {
  return op(`${storyRef} — ${summary}`, { description, ...extra });
}

export const fundPerformanceReportingSwaggerPaths: Record<string, unknown> = {
  "/fund-reporting/templates": {
    get: usOp(
      "US-3.5.2",
      "List report templates",
      "Returns active Investor/Board templates. Filter by `fundId` or `reportLevel`.",
      {
        parameters: [
          queryParam("fundId", { type: "string" }, SWAGGER_EX.fundId),
          queryParam("reportLevel", { type: "string", enum: ["INVESTOR", "BOARD"] }, "INVESTOR"),
        ],
      }
    ),
    post: usOp(
      "US-3.5.2",
      "Create report template",
      "Creates template with `reportLevel` INVESTOR or BOARD and section config JSON.",
      {
        requestBody: jsonRequestBody({
          schema: {
            type: "object",
            required: ["name", "reportLevel"],
            properties: {
              fundId: { type: "string" },
              name: { type: "string" },
              reportLevel: { type: "string", enum: ["INVESTOR", "BOARD"] },
              description: { type: "string" },
              sectionConfig: { type: "object" },
            },
          },
          examples: {
            investorPack: {
              summary: "Investor pack template",
              value: {
                name: "Quarterly Investor Pack",
                reportLevel: "INVESTOR",
                description: "Standard LP performance report sections",
                fundId: SWAGGER_EX.fundId,
              },
            },
            boardPack: {
              summary: "Board pack template",
              value: {
                name: "Quarterly Board Pack",
                reportLevel: "BOARD",
                description: "Board-level pack with variance and overhead",
              },
            },
          },
        }),
      }
    ),
  },
  "/fund-reporting/templates/{id}": {
    put: usOp("US-3.5.2", "Update report template", "Writes audit event with JSON diff.", {
      parameters: [idParam],
      requestBody: jsonRequestBody({
        required: false,
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            sectionConfig: { type: "object" },
            isActive: { type: "boolean" },
          },
        },
        examples: {
          rename: {
            summary: "Rename template",
            value: { name: "Quarterly Investor Pack (revised)" },
          },
          deactivate: {
            summary: "Soft deactivate",
            value: { isActive: false },
          },
        },
      }),
    }),
    delete: usOp("US-3.5.2", "Deactivate report template", "Soft delete (`isActive=false`) + audit.", {
      parameters: [idParam],
    }),
  },
  "/fund-reporting/schedules": {
    get: usOp(
      "US-3.5.1",
      "List report schedules",
      "Quarterly/Monthly/Semi-Annual/Annual schedule configs per fund.",
      { parameters: [queryParam("fundId", { type: "string" }, SWAGGER_EX.fundId)] }
    ),
    post: usOp(
      "US-3.5.1",
      "Create report schedule",
      "Sets `periodType`, day-of-month, hour, timezone, and optional distribution list.",
      {
        requestBody: jsonRequestBody({
          schema: {
            type: "object",
            required: ["fundId", "templateId", "name", "periodType"],
            properties: {
              fundId: { type: "string" },
              templateId: { type: "string" },
              name: { type: "string" },
              periodType: { type: "string", enum: ["QUARTERLY", "MONTHLY", "SEMI_ANNUAL", "ANNUAL"] },
              dayOfMonth: { type: "integer" },
              hourOfDay: { type: "integer" },
              timezone: { type: "string" },
              distributionListId: { type: "string" },
            },
          },
          examples: {
            quarterly: {
              summary: "Quarterly schedule",
              value: {
                fundId: SWAGGER_EX.fundId,
                templateId: SWAGGER_EX.templateId,
                name: "Q1 Quarterly Investor Report",
                periodType: "QUARTERLY",
                dayOfMonth: 15,
                hourOfDay: 9,
                timezone: "Africa/Harare",
                distributionListId: SWAGGER_EX.distributionListId,
              },
            },
          },
        }),
      }
    ),
  },
  "/fund-reporting/schedules/{id}": {
    put: usOp("US-3.5.1", "Update report schedule", "Recalculates `nextRunAt`.", {
      parameters: [idParam],
      requestBody: jsonRequestBody({
        required: false,
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            isActive: { type: "boolean" },
            dayOfMonth: { type: "integer" },
            hourOfDay: { type: "integer" },
            distributionListId: { type: "string" },
          },
        },
        examples: {
          reschedule: {
            summary: "Change run day",
            value: { dayOfMonth: 20, hourOfDay: 10 },
          },
        },
      }),
    }),
    delete: usOp("US-3.5.1", "Deactivate schedule", "Sets `isActive=false`.", { parameters: [idParam] }),
  },
  "/fund-reporting/distribution-lists": {
    get: usOp("US-3.5.3", "List distribution lists", "Role-bound or commitment-cohort recipient lists.", {
      parameters: [queryParam("fundId", { type: "string" }, SWAGGER_EX.fundId)],
    }),
    post: usOp(
      "US-3.5.3",
      "Create distribution list",
      "Binds recipients to fund; audit logged. No manual email override at run time.",
      {
        requestBody: jsonRequestBody({
          schema: {
            type: "object",
            required: ["fundId", "name", "sourceType"],
            properties: {
              fundId: { type: "string" },
              name: { type: "string" },
              sourceType: { type: "string", enum: ["COMMITMENT_COHORT", "ROLE_BOUND"] },
              roleCodes: { type: "array", items: { type: "string" } },
              cohortFilter: { type: "object" },
            },
          },
          examples: {
            allLps: {
              summary: "All committed LPs",
              value: {
                fundId: SWAGGER_EX.fundId,
                name: "All LPs — Investor Pack",
                sourceType: "COMMITMENT_COHORT",
              },
            },
          },
        }),
      }
    ),
  },
  "/fund-reporting/distribution-lists/{id}": {
    put: usOp("US-3.5.3", "Update distribution list", "Audit event with JSON diff.", {
      parameters: [idParam],
      requestBody: jsonRequestBody({
        required: false,
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            sourceType: { type: "string", enum: ["COMMITMENT_COHORT", "ROLE_BOUND"] },
            roleCodes: { type: "array", items: { type: "string" } },
            isActive: { type: "boolean" },
          },
        },
        examples: {
          rename: {
            summary: "Rename list",
            value: { name: "All LPs — Q1 2026" },
          },
        },
      }),
    }),
    delete: usOp("US-3.5.3", "Deactivate distribution list", "Soft delete + audit.", {
      parameters: [idParam],
    }),
  },
  "/fund-reporting/runs": {
    get: usOp("US-3.5.1", "List report runs", "GP console run history with progress counters.", {
      parameters: [
        queryParam("fundId", { type: "string" }, SWAGGER_EX.fundId),
        queryParam("limit", { type: "integer" }, 20),
      ],
    }),
    post: usOp(
      "US-3.5.1",
      "Trigger on-demand report run",
      "Creates parent `fund_report_runs` + per-recipient jobs; processes async.",
      {
        requestBody: jsonRequestBody({
          schema: {
            type: "object",
            required: ["fundId", "templateId", "periodStart", "periodEnd"],
            properties: {
              fundId: { type: "string" },
              templateId: { type: "string" },
              periodStart: { type: "string", format: "date" },
              periodEnd: { type: "string", format: "date" },
              distributionListId: { type: "string" },
              clientIds: { type: "array", items: { type: "string" } },
            },
          },
          examples: {
            manualRun: {
              summary: "On-demand quarterly run",
              value: {
                fundId: SWAGGER_EX.fundId,
                templateId: SWAGGER_EX.templateId,
                periodStart: SWAGGER_EX.periodStart,
                periodEnd: SWAGGER_EX.periodEnd,
                distributionListId: SWAGGER_EX.distributionListId,
              },
            },
          },
        }),
        responses: mergeResponses(SWAGGER_JSON_RESPONSES, {
          202: { description: "Run accepted (async processing)" },
        }),
      }
    ),
  },
  "/fund-reporting/runs/{runId}": {
    get: usOp(
      "US-3.5.4",
      "Get run detail",
      "Active run overview: status, progress %, recipient board data.",
      { parameters: [runIdParam] }
    ),
  },
  "/fund-reporting/runs/{runId}/logs": {
    get: usOp(
      "US-3.5.4",
      "Delivery event log",
      "Immutable SENT/BOUNCE/COMPLAINT/DOWNLOAD events for the run.",
      { parameters: [runIdParam] }
    ),
  },
  "/fund-reporting/runs/{runId}/recipients": {
    get: usOp(
      "US-3.5.4",
      "Recipient status board",
      "Per-recipient PDF status, transport method (DIRECT_ATTACH | SECURE_LINK), delivery status.",
      { parameters: [runIdParam] }
    ),
  },
  "/fund-reporting/audit": {
    get: usOp(
      "US-3.5.3",
      "Audit trail",
      "Query `entityType` + `entityId` for template/list change history.",
      {
        parameters: [
          queryParam("entityType", { type: "string" }, "FundReportTemplate"),
          queryParam("entityId", { type: "string" }, SWAGGER_EX.templateId),
        ],
      }
    ),
  },
  "/fund-reporting/download/{token}": {
    get: op("US-3.5.4 — Secure download (email link)", {
      description:
        "Public tokenized download for reports >10MB. Token expires after 7 days. Returns 410 when expired/revoked.",
      security: [],
      parameters: [tokenParam],
      responses: {
        200: {
          description: "PDF file",
          content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
        },
        410: { description: "Token expired or revoked" },
      },
    }),
  },
  "/fund-reporting/webhooks/email-delivery": {
    post: op("US-3.5.4 — Email delivery webhook (provider stub)", {
      description:
        "Parses provider callbacks (Delivery, Bounce, Complaint). Optional header `x-fund-reporting-webhook-secret`. Hard bounce may deactivate client.",
      security: [],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          properties: {
            eventType: { type: "string" },
            event: { type: "string" },
            jobId: { type: "string" },
            email: { type: "string", format: "email" },
            bounceType: { type: "string" },
          },
        },
        examples: {
          delivered: {
            summary: "Delivery confirmation",
            value: { eventType: "Delivery", jobId: "job-123", email: "lp@example.com" },
          },
          hardBounce: {
            summary: "Hard bounce",
            value: { eventType: "Bounce", jobId: "job-456", email: "bad@invalid", bounceType: "Hard" },
          },
        },
      }),
    }),
  },
  "/clients/{id}/link-user": {
    put: usOp(
      "US-3.5.3",
      "Link LP client to portal user",
      "Staff: binds `Client.userId` and creates `lp_user_relations`. Enables LP Portal access.",
      {
        parameters: [pathParam("id", SWAGGER_EX.clientId)],
        requestBody: jsonRequestBody({
          schema: {
            type: "object",
            required: ["userId"],
            properties: { userId: { type: "string" } },
          },
          examples: {
            linkUser: {
              summary: "Link portal user to LP client",
              value: { userId: SWAGGER_EX.userId },
            },
          },
        }),
      }
    ),
  },
};
