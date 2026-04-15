/**
 * Fallback OpenAPI paths for Suite 01 — Vendor Master, Compliance & KYC.
 * Merged last in swagger.ts so these operations always appear in /api-docs even if swagger-jsdoc fails.
 */
const TAG = "Vendor Master, Compliance & KYC (Suite 01)";
const TAG_STAFF = [TAG, "Accounting - Vendors"];

export const vendorMasterSuite01Endpoints: Record<string, Record<string, unknown>> = {
  "/public/vendor-registration": {
    post: {
      summary: "Vendor self-registration (no auth)",
      description:
        "Creates a pending vendor and returns `kycUploadToken` / URL for KYC. Duplicate BP/VAT rejected with validation error.",
      tags: [TAG],
      security: [],
      responses: {
        201: { description: "Created — token in body for KYC uploads" },
        400: { description: "Validation / duplicate entity" },
      },
    },
  },
  "/public/vendor-registration/{token}": {
    get: {
      summary: "Get registration by token",
      tags: [TAG],
      security: [],
      parameters: [{ in: "path", name: "token", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 404: { description: "Not found" } },
    },
    post: {
      summary: "Submit or update registration step (token)",
      tags: [TAG],
      security: [],
      parameters: [{ in: "path", name: "token", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
  },
  "/public/vendor-registration/{token}/kyc-requirements": {
    get: {
      summary: "KYC requirements (slots, missing docs)",
      tags: [TAG],
      security: [],
      parameters: [{ in: "path", name: "token", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
  },
  "/public/vendor-registration/{token}/kyc-documents": {
    get: {
      summary: "List KYC uploads for token",
      tags: [TAG],
      security: [],
      parameters: [{ in: "path", name: "token", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
    post: {
      summary: "Upload KYC files (multipart — CR14, bank letter, ITF263, etc.)",
      tags: [TAG],
      security: [],
      parameters: [{ in: "path", name: "token", required: true, schema: { type: "string" } }],
      requestBody: {
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                file: { type: "string", format: "binary" },
                documentType: { type: "string", description: "CR14 | BANK_LETTER | ITF263 | …" },
              },
            },
          },
        },
      },
      responses: { 200: { description: "Uploaded" }, 400: { description: "Bad request" } },
    },
  },
  "/public/vendor-registration/{token}/kyc-documents/{documentId}/download": {
    get: {
      summary: "Download KYC file (token)",
      tags: [TAG],
      security: [],
      parameters: [
        { in: "path", name: "token", required: true, schema: { type: "string" } },
        { in: "path", name: "documentId", required: true, schema: { type: "string" } },
      ],
      responses: { 200: { description: "File" } },
    },
  },
  "/accounting/vendors/for-rfq": {
    get: {
      summary: "RFQ picker — eligible vendors (blacklisted excluded)",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "query", name: "search", schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" } },
    },
  },
  "/accounting/vendors/pending-review": {
    get: {
      summary: "Self-registrations pending staff review",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" } },
    },
  },
  "/accounting/vendors/kyc-documents/{documentId}/download": {
    get: {
      summary: "Download KYC artifact (staff)",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "documentId", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "File" }, 401: { description: "Unauthorized" } },
    },
  },
  "/accounting/vendors/{id}/approve-registration": {
    put: {
      summary: "Approve self-registration — activates vendor",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" } },
    },
  },
  "/accounting/vendors/{id}/blacklist": {
    post: {
      summary: "Blacklist vendor (excluded from RFQ)",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                blacklistReason: { type: "string" },
                reason: { type: "string" },
              },
            },
          },
        },
      },
      responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" } },
    },
  },
  "/accounting/vendors/{id}/unblacklist": {
    post: {
      summary: "Remove vendor from blacklist",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" } },
    },
  },
  "/accounting/vendors/{id}/banks": {
    get: {
      summary: "List vendor bank accounts",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
    post: {
      summary: "Add bank (branch, SWIFT, currency)",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 201: { description: "Created" } },
    },
  },
  "/accounting/vendors/{id}/banks/{bankId}": {
    put: {
      summary: "Update vendor bank",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: "path", name: "id", required: true, schema: { type: "string" } },
        { in: "path", name: "bankId", required: true, schema: { type: "string" } },
      ],
      responses: { 200: { description: "OK" } },
    },
  },
  "/accounting/vendors/{id}/kyc-documents": {
    get: {
      summary: "List KYC documents (staff)",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
    post: {
      summary: "Upload KYC document (staff, multipart)",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
  },
  "/accounting/vendors": {
    get: {
      summary: "List vendors",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "OK" } },
    },
    post: {
      summary: "Create vendor (staff)",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      responses: { 201: { description: "Created" } },
    },
  },
  "/accounting/vendors/{id}": {
    get: {
      summary: "Get vendor by ID (rating, compliance, banks)",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
    put: {
      summary: "Update vendor",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
    delete: {
      summary: "Soft-delete vendor",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
  },
  "/accounting/vendors/{id}/expenses": {
    get: {
      summary: "Vendor expenses (paginated)",
      tags: TAG_STAFF,
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
  },
};
