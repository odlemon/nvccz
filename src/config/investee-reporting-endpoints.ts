// Fallback Swagger paths for Investee (Applicant Portal) reporting flow.
// Used when swagger-jsdoc parsing fails in production.
export const investeeReportingEndpoints = {
  "/applicant/reporting/requests": {
    get: {
      summary: "List open reporting requests (investee)",
      description: "Returns open reporting periods the investee can submit against.",
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
        "Upload one or more reporting documents for a reporting period. Core statements require .xlsx; narrative/compliance categories may allow PDFs.",
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
                reportingPeriod: { type: "string", format: "date" },
                periodType: { type: "string" },
                periodStart: { type: "string", format: "date" },
                periodEnd: { type: "string", format: "date" },
                title: { type: "string" },
                description: { type: "string" },
                templateVersion: { type: "string" },
                data: { type: "string" },
                items: { type: "string" },
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
      description: "List the authenticated investee's uploaded reports (deduped for core statement slots).",
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

  "/applicant/financial-reports/submit": {
    post: {
      summary: "Submit reporting period bundle (investee)",
      description:
        "Submits all DRAFT/NEEDS_REVISION reports for the same company + reportingPeriod as the provided reportId.",
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

