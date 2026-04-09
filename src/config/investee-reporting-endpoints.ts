// Fallback Swagger paths for Investee (Applicant Portal) reporting flow.
// Used when swagger-jsdoc parsing fails in production.
import { OPENAPI_INCOME_STATEMENT_DATA_EXAMPLE } from "./financialReportOpenApiExamples";

const AUD_APPLICANT =
  "**Audience:** **Applicant (investee)** — authenticated user linked to exactly one portfolio company (`APPLICANT` / portal JWT). ";

export const investeeReportingEndpoints = {
  "/applicant/reporting/requests": {
    get: {
      summary: "List open reporting requests (investee)",
      description: AUD_APPLICANT + "Returns open reporting periods the investee can submit against.",
      tags: ["Investee Reporting"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: "Open reporting requests list" },
        401: { description: "Unauthorized" },
        403: { description: "Access denied" },
      },
    },
  },

  "/applicant/financial-reports": {
    post: {
      summary: "Upload report document(s) (investee)",
      description:
        AUD_APPLICANT +
        "Upload one or more reporting documents for a reporting period. Core statements require **.xlsx**; narrative/compliance categories may allow **PDF**.",
      tags: ["Investee Reporting"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                file: { type: "string", format: "binary" },
                files: { type: "array", items: { type: "string", format: "binary" } },
                reportType: { type: "string" },
                reportingPeriod: { type: "string", format: "date", example: "2025-03-31" },
                periodType: { type: "string", example: "QUARTERLY" },
                periodStart: { type: "string", format: "date", example: "2025-01-01" },
                periodEnd: { type: "string", format: "date", example: "2025-03-31" },
                title: { type: "string", example: "Q1 2025 — Income statement pack" },
                description: { type: "string", example: "Signed workbook per fund template" },
                templateVersion: { type: "string", example: "2025.1" },
                data: {
                  type: "string",
                  description:
                    'Optional JSON **string** (multipart) of line items for IS/BS/CF/NON_FINANCIAL_KPIS — e.g. `{"grossSales":1250000,"labour":180000}`',
                  example: JSON.stringify({ grossSales: 1250000, labour: 180000, salariesBenefitsAndWages: 310000 }),
                },
                items: {
                  type: "string",
                  description: 'Optional JSON **array** string when uploading multiple files (one metadata object per file).',
                },
              },
              required: ["reportingPeriod", "periodType", "periodStart", "periodEnd"],
            },
          },
        },
      },
      responses: {
        201: { description: "Uploaded" },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
        403: { description: "Access denied" },
      },
    },
    get: {
      summary: "List my reports (investee)",
      description: AUD_APPLICANT + "Paginated list of reports for the authenticated investee (deduped for core statement slots).",
      tags: ["Investee Reporting"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: "query", name: "page", schema: { type: "integer" } },
        { in: "query", name: "limit", schema: { type: "integer" } },
      ],
      responses: {
        200: { description: "Reports retrieved successfully" },
        401: { description: "Unauthorized" },
        403: { description: "Access denied" },
      },
    },
  },

  "/applicant/financial-reports/template/{reportType}": {
    get: {
      summary: "Download report template (investee)",
      tags: ["Investee Reporting"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: "path", name: "reportType", required: true, schema: { type: "string" } },
      ],
      responses: {
        200: { description: "Template download" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/applicant/financial-reports/{reportId}": {
    get: {
      summary: "Get one report for edit (investee)",
      description:
        "Returns full detail including `data` (line items), reviewer feedback, canSubmit, canUploadFile. Use after staff requests revision.",
      tags: ["Investee Reporting"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "reportId", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "Report detail" },
        404: { description: "Not found" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/applicant/financial-reports/{reportId}/data": {
    patch: {
      summary: "Update manual form data on a report (investee)",
      description:
        AUD_APPLICANT +
        "Replaces **parsedSnapshot** for core statements / **NON_FINANCIAL_KPIS**. Status stays **NEEDS_REVISION** until submit. Use **POST** `.../file` to replace attachment.",
      tags: ["Investee Reporting"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "reportId", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["data"],
              properties: {
                data: {
                  type: "object",
                  additionalProperties: { type: "number" },
                  description: "Full or partial income-statement-style map; server merges/normalizes per reportType.",
                  example: OPENAPI_INCOME_STATEMENT_DATA_EXAMPLE,
                },
              },
              example: { data: OPENAPI_INCOME_STATEMENT_DATA_EXAMPLE },
            },
          },
        },
      },
      responses: {
        200: { description: "Updated" },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/applicant/financial-reports/submit": {
    post: {
      summary: "Submit reporting period bundle (investee)",
      description:
        AUD_APPLICANT +
        "Submits all **DRAFT** / **NEEDS_REVISION** / **REJECTED** reports for the same company + **reportingPeriod** as the provided reportId.",
      tags: ["Investee Reporting"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: "query", name: "reportId", required: false, schema: { type: "string" } },
      ],
      responses: {
        200: { description: "Submitted for review" },
        400: { description: "Missing reportId/reportIds" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/applicant/financial-reports/submit/{reportId}": {
    post: {
      summary: "Submit reporting period bundle (investee) — alias",
      tags: ["Investee Reporting"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "reportId", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Submitted for review" } },
    },
  },

  "/applicant/financial-reports/{reportId}/submit": {
    post: {
      summary: "Submit reporting period bundle (investee) — alias",
      tags: ["Investee Reporting"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "reportId", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Submitted for review" } },
    },
  },
};

