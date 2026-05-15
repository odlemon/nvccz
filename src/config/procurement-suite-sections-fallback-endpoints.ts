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
      summary: "RFQ comparison matrix",
      description:
        "PROC_MGR / PROC_OFF / BUYER. Full quotation rows + FX-normalized comparison; highlights use quotationNumber and vendorName (not cuid ids).",
      tags: [S03, TAG_RFQ],
      security: bearer,
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string" },
          description: "procurement_rfqs.id",
        },
      ],
      responses: {
        200: {
          description: "Matrix with rfq, rows[], highlights { lowestNormalizedCost, highestVendorRating, highestCompositeScore }",
        },
        400: { description: "RFQ not found" },
        401: { description: "Unauthorized" },
      },
    },
  },
  "/procurement/rfqs/{id}/award": {
    post: {
      summary: "[Deprecated] Award RFQ — use vendor-quotations accept",
      deprecated: true,
      tags: [S03, TAG_RFQ],
      security: bearer,
      responses: { 410: { description: "Use POST /vendor-quotations/{id}/accept" } },
    },
  },
  "/procurement/rfqs/{id}/closing": {
    patch: {
      summary: "Extend RFQ closing deadline",
      tags: [S03, TAG_RFQ],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["closingDate"],
              properties: {
                closingDate: { type: "string", format: "date-time", example: "2026-05-10T16:00:00.000Z" },
                reason: { type: "string", example: "Vendor clarification window extended" },
              },
            },
            example: {
              closingDate: "2026-05-10T16:00:00.000Z",
              reason: "Power outage delayed bids; extend by 48h",
            },
          },
        },
      },
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
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              description:
                "Stored as one `body` text field. Send `body` OR `answer` OR `question`+`answer` (combined as Q/A).",
              properties: {
                body: { type: "string", example: "Delivery to multiple sites is allowed." },
                question: { type: "string", example: "Is delivery to multiple sites allowed?" },
                answer: { type: "string", example: "Yes. Specify unit pricing per location in your quote." },
                attachmentUrl: { type: "string", example: "https://storage.example.com/clarification.pdf" },
              },
            },
            example: {
              answer: "Yes. Specify unit pricing per delivery location in your quotation notes.",
            },
          },
        },
      },
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
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["requisitionId", "vendorId", "items"],
              properties: {
                requisitionId: { type: "string", example: "req_cuid_123" },
                vendorId: { type: "string", example: "vend_cuid_123" },
                expectedDeliveryDate: { type: "string", format: "date-time", example: "2026-05-15T00:00:00.000Z" },
                currencyId: { type: "string", example: "cur_usd" },
                notes: { type: "string", example: "Deliver between 09:00–16:00 weekdays" },
                portfolioCompanyId: { type: "string", example: "portco_cuid_123" },
                fundId: { type: "string", example: "fund_cuid_123" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["itemName", "quantity", "unitPrice"],
                    properties: {
                      itemName: { type: "string", example: "Laptop" },
                      description: { type: "string", example: "Core i7, 16GB RAM, 512GB SSD" },
                      quantity: { type: "number", example: 2 },
                      unit: { type: "string", example: "ea" },
                      unitPrice: { type: "number", example: 1200 },
                      vatRateId: { type: "string", example: "vat_15" },
                    },
                  },
                },
              },
            },
            example: {
              requisitionId: "req_cuid_123",
              vendorId: "vend_cuid_123",
              expectedDeliveryDate: "2026-05-15T00:00:00.000Z",
              currencyId: "cur_usd",
              notes: "Deliver to head office reception",
              items: [
                { itemName: "Laptop", description: "Core i7, 16GB, 512GB", quantity: 2, unit: "ea", unitPrice: 1200 },
              ],
            },
          },
        },
      },
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
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                message: { type: "string", example: "Please acknowledge receipt of this PO within 24h." },
                ccEmails: { type: "array", items: { type: "string" }, example: ["buyer@nvccz.co.zw"] },
              },
            },
            example: {
              message: "Please confirm delivery schedule by reply.",
              ccEmails: ["buyer@nvccz.co.zw"],
            },
          },
        },
      },
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/purchase-orders/{id}/convert-to-bill": {
    post: {
      summary: "Convert PO to vendor bill draft",
      tags: [S04, TAG_PO],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                invoiceNumber: { type: "string", example: "INV-ACME-2026-0042" },
                invoiceDate: { type: "string", format: "date-time", example: "2026-05-16T00:00:00.000Z" },
                dueDate: { type: "string", format: "date-time", example: "2026-06-15T00:00:00.000Z" },
              },
            },
            example: {
              invoiceNumber: "INV-ACME-2026-0042",
              invoiceDate: "2026-05-16T00:00:00.000Z",
              dueDate: "2026-06-15T00:00:00.000Z",
            },
          },
        },
      },
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
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["reason"],
              properties: {
                reason: { type: "string", example: "Line item no longer required; budget reallocated" },
              },
            },
            example: { reason: "Duplicate line; cancel and keep the corrected line" },
          },
        },
      },
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/grn-return-to-vendor": {
    post: {
      summary: "Create GRN return-to-vendor (RTV) — one PO line per call (Suite 05.9)",
      description:
        "Quantity must not exceed remaining received on that GRN line (minus prior RTVs on same GRN + PO line).",
      tags: [S05, "Procurement - GRN"],
      security: bearer,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["goodsReceivedNoteId", "purchaseOrderItemId", "quantity"],
              properties: {
                goodsReceivedNoteId: { type: "string", example: "grn_cuid_123" },
                purchaseOrderItemId: { type: "string", example: "po_line_cuid_123" },
                quantity: { type: "number", example: 2 },
                reason: { type: "string", example: "Damaged goods on delivery" },
              },
            },
            example: {
              goodsReceivedNoteId: "grn_cuid_123",
              purchaseOrderItemId: "po_line_cuid_123",
              quantity: 2,
              reason: "Damaged packaging; failed QC",
            },
          },
        },
      },
      responses: { 201: { description: "Created" }, 400: { description: "Validation" } },
    },
  },
  "/public/purchase-orders/{token}/acknowledge": {
    post: {
      summary: "Vendor acknowledges PO via one-time token (no JWT)",
      tags: [S04],
      security: [],
      parameters: [{ in: "path", name: "token", required: true, schema: { type: "string" } }],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                acknowledgedByName: { type: "string", example: "Tariro Moyo" },
                acknowledgedByEmail: { type: "string", example: "accounts@acme.co.zw" },
                notes: { type: "string", example: "Acknowledged. Delivery scheduled for 2026-05-15." },
              },
            },
            example: {
              acknowledgedByName: "Tariro Moyo",
              acknowledgedByEmail: "accounts@acme.co.zw",
              notes: "PO received; will deliver by the expected date.",
            },
          },
        },
      },
      responses: { 200: { description: "OK" } },
    },
  },

  // --- Suite 05: goods receipt ---
  "/procurement/goods-received-notes": {
    get: {
      summary: "List GRNs (filters: PO, vendor, status, etc.)",
      tags: [S05, "Procurement - GRN"],
      security: bearer,
      parameters: [
        { in: "query", name: "purchaseOrderId", schema: { type: "string" } },
        { in: "query", name: "vendorId", schema: { type: "string" } },
        { in: "query", name: "status", schema: { type: "string" } },
        { in: "query", name: "qualityStatus", schema: { type: "string" } },
        { in: "query", name: "submittedByInvestee", schema: { type: "boolean" } },
        { in: "query", name: "grnNumber", schema: { type: "string" } },
        { in: "query", name: "limit", schema: { type: "integer", default: 50 } },
        { in: "query", name: "offset", schema: { type: "integer", default: 0 } },
      ],
      responses: { 200: { description: "Paginated list" } },
    },
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
                purchaseOrderId: { type: "string", example: "po_cuid_123" },
                receivedDate: { type: "string", format: "date-time", example: "2026-05-20T10:00:00.000Z" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "purchaseOrderItemId",
                      "quantityReceived",
                      "quantityAccepted",
                      "quantityRejected",
                      "qualityStatus",
                    ],
                    properties: {
                      purchaseOrderItemId: { type: "string", example: "po_line_cuid_123" },
                      quantityReceived: { type: "number", example: 1 },
                      quantityAccepted: { type: "number", example: 1 },
                      quantityRejected: { type: "number", example: 0 },
                      qualityStatus: { type: "string", example: "PASSED", description: "PASSED | FAILED | PARTIAL" },
                      rejectionReason: { type: "string", example: "Damaged on delivery" },
                    },
                  },
                },
              },
            },
            example: {
              purchaseOrderId: "po_cuid_123",
              receivedDate: "2026-05-20T10:00:00.000Z",
              items: [
                {
                  purchaseOrderItemId: "po_line_cuid_123",
                  quantityReceived: 1,
                  quantityAccepted: 1,
                  quantityRejected: 0,
                  qualityStatus: "PASSED",
                },
              ],
            },
          },
        },
      },
      responses: { 201: { description: "Created" }, 400: { description: "Bad request" } },
    },
  },
  "/procurement/goods-received-notes/{id}": {
    get: {
      summary: "Get GRN by id",
      tags: [S05, "Procurement - GRN"],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 404: { description: "Not found" } },
    },
  },
  "/applicant/procurement/goods-received-notes": {
    get: {
      summary: "List investee GRNs (portfolio-scoped)",
      tags: [S05, "Procurement - GRN"],
      security: bearer,
      parameters: [
        { in: "query", name: "purchaseOrderId", schema: { type: "string" } },
        { in: "query", name: "status", schema: { type: "string" } },
        { in: "query", name: "limit", schema: { type: "integer", default: 50 } },
        { in: "query", name: "offset", schema: { type: "integer", default: 0 } },
      ],
      responses: { 200: { description: "OK" } },
    },
    post: {
      summary: "Create investee GRN (Suite 05) — PO must belong to applicant portfolio PR",
      tags: [
        S05,
        "Procurement - GRN",
        "Applicant Portal",
        "Investee Portal — Investment Drawdown",
      ],
      security: bearer,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["purchaseOrderId", "items"],
              properties: {
                purchaseOrderId: { type: "string", example: "po_cuid_123" },
                receivedDate: { type: "string", format: "date-time", example: "2026-05-20T10:00:00.000Z" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["purchaseOrderItemId", "quantityReceived", "quantityAccepted", "quantityRejected", "qualityStatus"],
                    properties: {
                      purchaseOrderItemId: { type: "string", example: "po_line_cuid_123" },
                      quantityReceived: { type: "number", example: 1 },
                      quantityAccepted: { type: "number", example: 1 },
                      quantityRejected: { type: "number", example: 0 },
                      qualityStatus: { type: "string", example: "PASSED", description: "PASSED | FAILED | PARTIAL" },
                      rejectionReason: { type: "string", example: "Damaged on delivery" },
                    },
                  },
                },
              },
            },
            example: {
              purchaseOrderId: "po_cuid_123",
              receivedDate: "2026-05-20T10:00:00.000Z",
              items: [
                {
                  purchaseOrderItemId: "po_line_cuid_123",
                  quantityReceived: 1,
                  quantityAccepted: 1,
                  quantityRejected: 0,
                  qualityStatus: "PASSED",
                },
              ],
            },
          },
        },
      },
      responses: { 201: { description: "Created" }, 400: { description: "Bad request" } },
    },
  },
  "/applicant/procurement/goods-received-notes/{id}": {
    get: {
      summary: "Get investee GRN by id (portfolio-scoped)",
      tags: [S05, "Procurement - GRN"],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 404: { description: "Not found" } },
    },
  },

  // --- Suite 06: AI intake + 3-way match + CFO dashboard (see procurementSuite06Routes) ---
  "/procurement/invoices/upload-document": {
    post: {
      summary: "PUBLIC — upload vendor invoice PDF for legacy procurement invoice flow",
      tags: ["Procurement - Invoices"],
      security: [],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["document"],
              properties: {
                document: { type: "string", format: "binary" },
                vendorId: { type: "string" },
              },
            },
          },
        },
      },
      responses: { 201: { description: "Created" }, 400: { description: "Validation" } },
    },
  },
  "/procurement/suite06/intakes": {
    post: {
      summary: "Create vendor invoice intake (multipart — PDF + required ids)",
      description:
        "Content-Type: multipart/form-data. **Required fields:** `document` (PDF binary), `vendorId`, `sourcePurchaseOrderId`, `goodsReceivedNoteId`. URL-only intake (`documentUrl`) is not supported.",
      tags: [S06_INTAKE],
      security: bearer,
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["document", "vendorId", "sourcePurchaseOrderId", "goodsReceivedNoteId"],
              properties: {
                document: {
                  type: "string",
                  format: "binary",
                  description: "PDF file — field name must be **document** (max 15MB).",
                },
                vendorId: {
                  type: "string",
                  example: "vend_cuid_123",
                  description: "Vendor id (cuid).",
                },
                sourcePurchaseOrderId: {
                  type: "string",
                  example: "po_cuid_123",
                  description: "Purchase order id (cuid).",
                },
                goodsReceivedNoteId: {
                  type: "string",
                  example: "grn_cuid_123",
                  description: "Goods received note id (cuid).",
                },
              },
            },
            example: {
              vendorId: "vend_cuid_123",
              sourcePurchaseOrderId: "po_cuid_123",
              goodsReceivedNoteId: "grn_cuid_123",
            },
          },
        },
      },
      responses: { 201: { description: "Created" }, 400: { description: "Validation error" } },
    },
    get: {
      summary: "List vendor invoice intakes",
      description:
        "Paginated list. Query: `take` (default 50), `skip`, optional `status`, optional `vendorId`.",
      tags: [S06_INTAKE],
      security: bearer,
      parameters: [
        { in: "query", name: "take", schema: { type: "integer", default: 50 } },
        { in: "query", name: "skip", schema: { type: "integer", default: 0 } },
        { in: "query", name: "status", schema: { type: "string" } },
        { in: "query", name: "vendorId", schema: { type: "string" } },
      ],
      responses: { 200: { description: "OK" } },
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
      summary: "Run PDF text extraction + LLM structured parse (uses saved intake — no re-upload)",
      description:
        "Uses `documentUrl` and PO/GRN/vendor ids already on the intake. Optional JSON body fields `vendorId`, `sourcePurchaseOrderId`, `goodsReceivedNoteId` override before parse. To swap PDF: **POST …/intakes/{id}/document** (multipart `document`) then extract again.",
      tags: [S06_INTAKE],
      security: bearer,
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string" },
          description: "Vendor invoice intake id (cuid)",
        },
      ],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                vendorId: { type: "string" },
                sourcePurchaseOrderId: { type: "string" },
                goodsReceivedNoteId: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "OK" },
        400: { description: "Validation error" },
        404: { description: "Intake not found" },
      },
    },
  },
  "/procurement/suite06/intakes/{id}/document": {
    post: {
      summary: "Replace PDF stored on intake (multipart field document)",
      tags: [S06_INTAKE],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["document"],
              properties: {
                document: { type: "string", format: "binary", description: "PDF — field **document**" },
              },
            },
          },
        },
      },
      responses: { 200: { description: "OK" }, 400: { description: "Validation" }, 404: { description: "Not found" } },
    },
  },
  "/procurement/suite06/intakes/{id}/verify": {
    patch: {
      summary: "Mark intake as human-verified",
      tags: [S06_INTAKE],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                notes: { type: "string", example: "Verified totals and vendor details against PDF." },
              },
            },
            example: { notes: "Matches PDF; line items corrected." },
          },
        },
      },
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/suite06/intakes/{id}/create-draft-bill": {
    post: {
      summary: "Create DRAFT vendor bill from extracted payload",
      tags: [S06_INTAKE],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                invoiceNumberOverride: { type: "string", example: "INV-ACME-2026-0042" },
                invoiceDateOverride: { type: "string", format: "date-time", example: "2026-05-16T00:00:00.000Z" },
              },
            },
            example: {
              invoiceNumberOverride: "INV-ACME-2026-0042",
              invoiceDateOverride: "2026-05-16T00:00:00.000Z",
            },
          },
        },
      },
      responses: { 200: { description: "OK" } },
    },
  },
  "/procurement/suite06/field-corrections": {
    post: {
      summary: "Upsert per-vendor field correction map",
      tags: [S06_INTAKE],
      security: bearer,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["vendorId", "fieldKey", "correctedValue"],
              properties: {
                vendorId: { type: "string", example: "vend_cuid_123" },
                fieldKey: { type: "string", example: "invoiceNumber" },
                correctedValue: { type: "string", example: "INV-ACME-2026-0042" },
              },
            },
            example: {
              vendorId: "vend_cuid_123",
              fieldKey: "invoiceDate",
              correctedValue: "2026-05-16",
            },
          },
        },
      },
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
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                strict: { type: "boolean", example: true },
              },
            },
            example: { strict: true },
          },
        },
      },
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
