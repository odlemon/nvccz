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
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "email", "phone", "country", "city", "addressLine1", "banks"],
              properties: {
                name: { type: "string", example: "Acme Supplies (Pvt) Ltd" },
                email: { type: "string", example: "accounts@acme.co.zw" },
                phone: { type: "string", example: "+263771234567" },
                taxNumber: { type: "string", example: "ZW-TIN-1234567" },
                bpNumber: { type: "string", example: "BP-000123" },
                category: { type: "string", example: "IT_SERVICES" },
                country: { type: "string", example: "Zimbabwe" },
                city: { type: "string", example: "Harare" },
                addressLine1: { type: "string", example: "12 Samora Machel Ave" },
                addressLine2: { type: "string", example: "Floor 3, Suite 2" },
                postalCode: { type: "string", example: "00263" },
                contactPersonName: { type: "string", example: "Tariro Moyo" },
                contactPersonRole: { type: "string", example: "Finance Manager" },
                website: { type: "string", example: "https://acme.co.zw" },
                banks: {
                  type: "array",
                  description: "At least one bank account is required for registration.",
                  items: {
                    type: "object",
                    required: ["bankName", "accountName", "accountNumber", "currencyCode"],
                    properties: {
                      bankName: { type: "string", example: "CBZ Bank" },
                      branchName: { type: "string", example: "CBD Branch" },
                      swiftCode: { type: "string", example: "COBZZWHAXXX" },
                      accountName: { type: "string", example: "Acme Supplies (Pvt) Ltd" },
                      accountNumber: { type: "string", example: "1234567890" },
                      currencyCode: { type: "string", example: "USD" },
                      iban: { type: "string", example: "N/A" },
                      isPrimary: { type: "boolean", example: true },
                    },
                  },
                  example: [
                    {
                      bankName: "CBZ Bank",
                      branchName: "CBD Branch",
                      swiftCode: "COBZZWHAXXX",
                      accountName: "Acme Supplies (Pvt) Ltd",
                      accountNumber: "1234567890",
                      currencyCode: "USD",
                      isPrimary: true,
                    },
                  ],
                },
              },
            },
            example: {
              name: "Acme Supplies (Pvt) Ltd",
              email: "accounts@acme.co.zw",
              phone: "+263771234567",
              taxNumber: "ZW-TIN-1234567",
              bpNumber: "BP-000123",
              category: "IT_SERVICES",
              country: "Zimbabwe",
              city: "Harare",
              addressLine1: "12 Samora Machel Ave",
              addressLine2: "Floor 3, Suite 2",
              postalCode: "00263",
              contactPersonName: "Tariro Moyo",
              contactPersonRole: "Finance Manager",
              website: "https://acme.co.zw",
              banks: [
                {
                  bankName: "CBZ Bank",
                  branchName: "CBD Branch",
                  swiftCode: "COBZZWHAXXX",
                  accountName: "Acme Supplies (Pvt) Ltd",
                  accountNumber: "1234567890",
                  currencyCode: "USD",
                  isPrimary: true,
                },
              ],
            },
          },
        },
      },
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
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              description:
                "Partial profile updates keyed by portal token. Shape mirrors vendor profile fields; backend accepts incremental updates.",
              properties: {
                name: { type: "string", example: "Acme Supplies (Pvt) Ltd" },
                email: { type: "string", example: "accounts@acme.co.zw" },
                phone: { type: "string", example: "+263771234567" },
                taxNumber: { type: "string", example: "ZW-TIN-1234567" },
                bpNumber: { type: "string", example: "BP-000123" },
                category: { type: "string", example: "IT_SERVICES" },
                country: { type: "string", example: "Zimbabwe" },
                city: { type: "string", example: "Harare" },
                addressLine1: { type: "string", example: "12 Samora Machel Ave" },
                addressLine2: { type: "string", example: "Floor 3, Suite 2" },
                postalCode: { type: "string", example: "00263" },
                contactPersonName: { type: "string", example: "Tariro Moyo" },
                contactPersonRole: { type: "string", example: "Finance Manager" },
                website: { type: "string", example: "https://acme.co.zw" },
              },
            },
            example: {
              city: "Harare",
              addressLine1: "12 Samora Machel Ave",
              contactPersonName: "Tariro Moyo",
              contactPersonRole: "Finance Manager",
            },
          },
        },
      },
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
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              description:
                "Either: (A) upload one or more files with field name = KYC code (CR14, BANK_LETTER, …), OR (B) upload a single file field named `file` plus text field `documentType`.",
              properties: {
                file: { type: "string", format: "binary" },
                documentType: {
                  type: "string",
                  description:
                    "Required when the file field is named `file`. One of: CR14 | BANK_LETTER | CERTIFICATE_OF_INCORPORATION | ITF263 | OTHER",
                  example: "CR14",
                },
              },
            },
            example: {
              documentType: "CR14"
            }
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
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                blacklistReason: { type: "string" },
                reason: { type: "string" },
              },
            },
            example: { blacklistReason: "Compliance: expired tax clearance" }
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
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["bankName", "accountName", "accountNumber", "currencyCode"],
              properties: {
                bankName: { type: "string", example: "CBZ Bank" },
                branchName: { type: "string", example: "CBD Branch" },
                swiftCode: { type: "string", example: "COBZZWHAXXX" },
                accountName: { type: "string", example: "Acme Supplies (Pvt) Ltd" },
                accountNumber: { type: "string", example: "1234567890" },
                currencyCode: { type: "string", example: "USD" },
                iban: { type: "string", example: "N/A" },
                isPrimary: { type: "boolean", example: true },
              },
            },
            example: {
              bankName: "CBZ Bank",
              branchName: "CBD Branch",
              swiftCode: "COBZZWHAXXX",
              accountName: "Acme Supplies (Pvt) Ltd",
              accountNumber: "1234567890",
              currencyCode: "USD",
              isPrimary: true,
            },
          },
        },
      },
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
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                bankName: { type: "string", example: "CBZ Bank" },
                branchName: { type: "string", example: "CBD Branch" },
                swiftCode: { type: "string", example: "COBZZWHAXXX" },
                accountName: { type: "string", example: "Acme Supplies (Pvt) Ltd" },
                accountNumber: { type: "string", example: "1234567890" },
                currencyCode: { type: "string", example: "USD" },
                iban: { type: "string", example: "N/A" },
                isPrimary: { type: "boolean", example: true },
              },
            },
            example: {
              branchName: "Borrowdale Branch",
              isPrimary: true,
            },
          },
        },
      },
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
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file", "documentType"],
              properties: {
                file: { type: "string", format: "binary" },
                documentType: {
                  type: "string",
                  example: "CR14",
                  description: "CR14 | BANK_LETTER | CERTIFICATE_OF_INCORPORATION | ITF263 | OTHER",
                },
                notes: { type: "string", example: "Uploaded by finance during onboarding" },
              },
            },
          },
        },
      },
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
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name"],
              properties: {
                name: { type: "string", example: "Acme Supplies (Pvt) Ltd" },
                email: { type: "string", example: "accounts@acme.co.zw" },
                phone: { type: "string", example: "+263771234567" },
                taxNumber: { type: "string", example: "ZW-TIN-1234567" },
                bpNumber: { type: "string", example: "BP-000123" },
                category: { type: "string", example: "IT_SERVICES" },
                country: { type: "string", example: "Zimbabwe" },
                city: { type: "string", example: "Harare" },
                addressLine1: { type: "string", example: "12 Samora Machel Ave" },
                addressLine2: { type: "string", example: "Floor 3, Suite 2" },
                postalCode: { type: "string", example: "00263" },
                registrationStatus: {
                  type: "string",
                  example: "ACTIVE",
                  description: "ACTIVE | PENDING_REVIEW (and other internal statuses depending on implementation)",
                },
              },
            },
            example: {
              name: "Acme Supplies (Pvt) Ltd",
              email: "accounts@acme.co.zw",
              phone: "+263771234567",
              taxNumber: "ZW-TIN-1234567",
              bpNumber: "BP-000123",
              category: "IT_SERVICES",
              country: "Zimbabwe",
              city: "Harare",
              addressLine1: "12 Samora Machel Ave",
              registrationStatus: "ACTIVE",
            },
          },
        },
      },
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
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string", example: "Acme Supplies (Pvt) Ltd" },
                email: { type: "string", example: "accounts@acme.co.zw" },
                phone: { type: "string", example: "+263771234567" },
                taxNumber: { type: "string", example: "ZW-TIN-1234567" },
                bpNumber: { type: "string", example: "BP-000123" },
                category: { type: "string", example: "IT_SERVICES" },
                country: { type: "string", example: "Zimbabwe" },
                city: { type: "string", example: "Harare" },
                addressLine1: { type: "string", example: "12 Samora Machel Ave" },
                addressLine2: { type: "string", example: "Floor 3, Suite 2" },
                postalCode: { type: "string", example: "00263" },
                registrationStatus: { type: "string", example: "ACTIVE" },
                blacklistReason: { type: "string", example: "Compliance failure" },
              },
            },
            example: {
              phone: "+263772222222",
              addressLine2: "Suite 10",
            },
          },
        },
      },
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
