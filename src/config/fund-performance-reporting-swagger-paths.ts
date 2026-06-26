/**
 * Fund Performance Reporting & Email Distribution — Swagger paths.
 * Requirements: docs/fund-performance-reporting-backend-requirements.md
 * Design session: design-sessions/fund-performance-reporting.md
 *
 * Cron route POST /api/cron/fund-reporting/schedule-tick is omitted from Swagger (ops only).
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";

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
      "Returns active Investor/Board templates. Filter by `fundId` or `reportLevel`."
    ),
    post: usOp(
      "US-3.5.2",
      "Create report template",
      "Creates template with `reportLevel` INVESTOR or BOARD and section config JSON."
    ),
  },
  "/fund-reporting/templates/{id}": {
    put: usOp("US-3.5.2", "Update report template", "Writes audit event with JSON diff."),
    delete: usOp("US-3.5.2", "Deactivate report template", "Soft delete (`isActive=false`) + audit."),
  },
  "/fund-reporting/schedules": {
    get: usOp(
      "US-3.5.1",
      "List report schedules",
      "Quarterly/Monthly/Semi-Annual/Annual schedule configs per fund."
    ),
    post: usOp(
      "US-3.5.1",
      "Create report schedule",
      "Sets `periodType`, day-of-month, hour, timezone, and optional distribution list."
    ),
  },
  "/fund-reporting/schedules/{id}": {
    put: usOp("US-3.5.1", "Update report schedule", "Recalculates `nextRunAt`."),
    delete: usOp("US-3.5.1", "Deactivate schedule", "Sets `isActive=false`."),
  },
  "/fund-reporting/distribution-lists": {
    get: usOp("US-3.5.3", "List distribution lists", "Role-bound or commitment-cohort recipient lists."),
    post: usOp(
      "US-3.5.3",
      "Create distribution list",
      "Binds recipients to fund; audit logged. No manual email override at run time."
    ),
  },
  "/fund-reporting/distribution-lists/{id}": {
    put: usOp("US-3.5.3", "Update distribution list", "Audit event with JSON diff."),
    delete: usOp("US-3.5.3", "Deactivate distribution list", "Soft delete + audit."),
  },
  "/fund-reporting/runs": {
    get: usOp("US-3.5.1", "List report runs", "GP console run history with progress counters."),
    post: usOp(
      "US-3.5.1",
      "Trigger on-demand report run",
      "Creates parent `fund_report_runs` + per-recipient jobs; processes async. Body: `fundId`, `templateId`, `periodStart`, `periodEnd`, optional `distributionListId`, `clientIds[]`."
    ),
  },
  "/fund-reporting/runs/{runId}": {
    get: usOp(
      "US-3.5.4",
      "Get run detail",
      "Active run overview: status, progress %, recipient board data."
    ),
  },
  "/fund-reporting/runs/{runId}/logs": {
    get: usOp(
      "US-3.5.4",
      "Delivery event log",
      "Immutable SENT/BOUNCE/COMPLAINT/DOWNLOAD events for the run."
    ),
  },
  "/fund-reporting/runs/{runId}/recipients": {
    get: usOp(
      "US-3.5.4",
      "Recipient status board",
      "Per-recipient PDF status, transport method (DIRECT_ATTACH | SECURE_LINK), delivery status."
    ),
  },
  "/fund-reporting/audit": {
    get: usOp(
      "US-3.5.3",
      "Audit trail",
      "Query `entityType` + `entityId` for template/list change history."
    ),
  },
  "/fund-reporting/download/{token}": {
    get: op("US-3.5.4 — Secure download (email link)", {
      description:
        "Public tokenized download for reports >10MB. Token expires after 7 days. Returns 410 when expired/revoked.",
      security: [],
    }),
  },
  "/fund-reporting/webhooks/email-delivery": {
    post: op("US-3.5.4 — Email delivery webhook (provider stub)", {
      description:
        "Parses provider callbacks (Delivery, Bounce, Complaint). Hard bounce may deactivate client.",
      security: [],
    }),
  },
  "/clients/{id}/link-user": {
    put: usOp(
      "US-3.5.3",
      "Link LP client to portal user",
      "Staff: binds `Client.userId` and creates `lp_user_relations`. Enables LP Portal access.",
      {
        tags: TAG,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["userId"],
                properties: { userId: { type: "string" } },
              },
            },
          },
        },
      }
    ),
  },
};
