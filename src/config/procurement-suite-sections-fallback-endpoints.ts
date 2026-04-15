/**
 * Fallback OpenAPI paths for procurement UAT suites 03–06 + public tender / PO ack.
 * Merged in swagger.ts (before vendor Suite 01) so operations appear even when swagger-jsdoc omits route JSDoc.
 */
const S03 = "Procurement — RFQ & Bidding (Suite 03)";
const S04 = "Procurement — PO & Sign-off (Suite 04)";
const S05 = "Procurement — GRN & QC (Suite 05)";
const TAG_RFQ = "Procurement - RFQ";
const TAG_PO = "Procurement - Purchase Orders";
const S06_INTAKE = "Procurement — AI invoice intake (Suite 06)";
const S06_MATCH = "Procurement — 3-way match (Suite 06)";
const S06_DASH = "Procurement — Match dashboard (Suite 06)";

const bearer = [{ bearerAuth: [] }];

export const procurementSuiteSectionsFallbackEndpoints: Record<string, Record<string, unknown>> = {
  // --- Suite 03: formal RFQ (procurement_rfqs) + public listing ---
  "/public/procurement/rfqs": {
    get: {
      summary: "Public tender listing (minimal fields, no auth)",
      description: "Suite 03.10 — published RFQs visible without login.",
      tags: [S03],
      security: [],
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/rfqs/{id}/comparison-matrix": {
    get: {
      summary: "RFQ comparison matrix (FX-normalized; sealed bids until close)",
      tags: [S03, TAG_RFQ],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" } },
    },
  },
  "/procurement/rfqs/{id}/award": {
    post: {
      summary: "Award RFQ to vendor (regret emails to others)",
      tags: [S03, TAG_RFQ],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 400: { description: "Bad request" } },
    },
  },
  "/procurement/rfqs/{id}/closing": {
    patch: {
      summary: "Extend RFQ closing deadline",
      tags: [S03, TAG_RFQ],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/rfqs/{id}/clarifications": {
    get: {
      summary: "List RFQ clarifications",
      tags: [S03, TAG_RFQ],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
    post: {
      summary: "Post RFQ clarification (staff)",
      tags: [S03, TAG_RFQ],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 201: { description: "Created" } },
    },
  },

  // --- Suite 04: PO lifecycle + vendor ack (public) ---
  "/procurement/purchase-orders": {
    post: {
      summary: "Create purchase order",
      description: "Investee/fund tagging and approval thresholds per config (Suite 04).",
      tags: [S04, TAG_PO],
      security: bearer,
      responses: { 201: { description: "Created" }, 400: { description: "Bad request" } },
    },
    get: {
      summary: "List purchase orders",
      tags: [S04, TAG_PO],
      security: bearer,
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/purchase-orders/verify": {
    get: {
      summary: "Verify PO PDF token (query) — Suite 04",
      tags: [S04, TAG_PO],
      security: [],
      parameters: [{ in: "query", name: "token", schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 404: { description: "Invalid token" } },
    },
  },
  "/procurement/purchase-orders/{id}": {
    get: {
      summary: "Get purchase order by ID",
      tags: [S04, TAG_PO],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 404: { description: "Not found" } },
    },
  },
  "/procurement/purchase-orders/{id}/send": {
    post: {
      summary: "Dispatch PO (email / notifications)",
      tags: [S04, TAG_PO],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/purchase-orders/{id}/convert-to-bill": {
    post: {
      summary: "Convert PO to vendor bill draft",
      tags: [S04, TAG_PO],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/purchase-orders/{id}/pdf": {
    get: {
      summary: "Download PO PDF (verification placeholder / QR block)",
      tags: [S04, TAG_PO],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "PDF" } },
    },
  },
  "/procurement/purchase-orders/{poId}/lines/{lineId}/cancel": {
    patch: {
      summary: "Cancel a PO line (Suite 04.7)",
      tags: [S04, TAG_PO],
      security: bearer,
      parameters: [
        { in: "path", name: "poId", required: true, schema: { type: "string" } },
        { in: "path", name: "lineId", required: true, schema: { type: "string" } },
      ],
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/grn-return-to-vendor": {
    post: {
      summary: "Create GRN return-to-vendor record (stub / workflow)",
      tags: [S04, TAG_PO],
      security: bearer,
      responses: { 201: { description: "Created" } },
    },
  },
  "/public/purchase-orders/{token}/acknowledge": {
    post: {
      summary: "Vendor acknowledges PO via one-time token (no JWT)",
      tags: [S04],
      security: [],
      parameters: [{ in: "path", name: "token", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
  },

  // --- Suite 05: goods receipt ---
  "/procurement/goods-received-notes": {
    post: {
      summary: "Create GRN (over-delivery tolerance, vendor rating from lead time)",
      description:
        "Updates vendor rating from PO expectedDeliveryDate vs receivedDate when status RECEIVED.",
      tags: [S05, "Procurement - GRN"],
      security: bearer,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["purchaseOrderId", "items"],
              properties: {
                purchaseOrderId: { type: "string" },
                receivedDate: { type: "string", format: "date-time" },
                items: { type: "array", items: { type: "object" } },
              },
            },
          },
        },
      },
      responses: { 201: { description: "Created" }, 400: { description: "Bad request" } },
    },
  },
  "/applicant/procurement/goods-received-notes": {
    post: {
      summary: "Create investee GRN (Suite 05) — PO must belong to applicant portfolio PR",
      tags: [
        S05,
        "Procurement - GRN",
        "Applicant Portal",
        "Investee Portal — Investment Drawdown",
      ],
      security: bearer,
      responses: { 201: { description: "Created" }, 400: { description: "Bad request" } },
    },
  },

  // --- Suite 06: AI intake + 3-way match + CFO dashboard (see procurementSuite06Routes) ---
  "/procurement/suite06/intakes": {
    post: {
      summary: "Create vendor invoice intake (document URL)",
      tags: [S06_INTAKE],
      security: bearer,
      responses: { 201: { description: "Created" }, 400: { description: "Validation error" } },
    },
  },
  "/procurement/suite06/intakes/{id}": {
    get: {
      summary: "Get vendor invoice intake by id",
      tags: [S06_INTAKE],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/suite06/intakes/{id}/extract": {
    post: {
      summary: "Run PDF text extraction + LLM structured parse",
      tags: [S06_INTAKE],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/suite06/intakes/{id}/verify": {
    patch: {
      summary: "Mark intake as human-verified",
      tags: [S06_INTAKE],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/suite06/intakes/{id}/create-draft-bill": {
    post: {
      summary: "Create DRAFT vendor bill from extracted payload",
      tags: [S06_INTAKE],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/suite06/field-corrections": {
    post: {
      summary: "Upsert per-vendor field correction map",
      tags: [S06_INTAKE],
      security: bearer,
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/suite06/verification-queue": {
    get: {
      summary: "List intakes pending human verification",
      tags: [S06_INTAKE],
      security: bearer,
      parameters: [{ in: "query", name: "take", schema: { type: "integer", default: 50 } }],
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/suite06/purchase-invoices/{purchaseInvoiceId}/run-match": {
    post: {
      summary: "Run 3-way match (PO vs GRN vs bill lines)",
      tags: [S06_MATCH, "Procurement - Invoices"],
      security: bearer,
      parameters: [
        { in: "path", name: "purchaseInvoiceId", required: true, schema: { type: "string" } },
      ],
      responses: { 200: { description: "OK" }, 400: { description: "Disputed / blocked" } },
    },
  },
  "/procurement/suite06/cfo-dashboard": {
    get: {
      summary: "CFO summary — matched vs disputed vs verification queue",
      tags: [S06_DASH],
      security: bearer,
      responses: { 200: { description: "OK" } },
    },
  },
};
