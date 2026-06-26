/**
 * Investment Memo Editing — Swagger paths.
 * Requirements: docs/investment-memo-editing-backend-requirements.md
 */

export const INVESTMENT_MEMO_EDITING_TAG = "Investment Memo Editing";

export const INVESTMENT_MEMO_EDITING_TAG_DEFINITION = {
  name: INVESTMENT_MEMO_EDITING_TAG,
  description:
    "**Structured Investment Memo** — versioned sections, validation, CIO approval, and audit history before Call to Vote.\n\n" +
    "Base path: `/investment-memos/*` (server URL already includes `/api`). Available when application stage is `UNDER_BOARD_REVIEW`.\n\n" +
    "See `docs/investment-memo-editing-backend-requirements.md`.",
};

const TAG = [INVESTMENT_MEMO_EDITING_TAG];
const bearer = [{ bearerAuth: [] }];

const memoSectionsExample = {
  executiveSummary:
    "Acme Agri Ltd seeks growth capital to expand cold-chain logistics across Mashonaland East.",
  investmentThesis:
    "Defensible regional distribution with 18% YoY revenue growth and improving gross margins.",
  marketOpportunity:
    "Zimbabwe horticulture export market estimated at USD 120m with limited integrated logistics players.",
  companyOverview:
    "Founded 2014; 240 employees; primary crops: blueberries and snap peas for EU export.",
  financialAnalysis:
    "FY2025 revenue USD 4.2m; EBITDA margin 14%; net debt/EBITDA 1.8x post-round.",
  risksAndMitigants:
    "FX volatility — mitigated via USD export contracts; drought — drip irrigation on 80% of hectares.",
  dealTerms: "USD 2.5m Series B; 15% equity; board seat; 1x liquidation preference non-participating.",
  recommendation: "Proceed to IC vote — strong operator, aligned export strategy, acceptable risk profile.",
  overallScore: 4.2,
  additionalInformation: "DD completed 2026-05-12; term sheet draft attached separately.",
};

const stdErrors = {
  "401": {
    description: "Unauthorized",
    content: { "application/json": { example: { success: false, message: "Unauthorized" } } },
  },
  "403": {
    description: "Forbidden — wrong stage or role",
    content: {
      "application/json": { example: { success: false, message: "Investment memo not available for this application stage" } },
    },
  },
  "404": {
    description: "Not found",
    content: { "application/json": { example: { success: false, message: "Memo version not found" } } },
  },
};

function op(summary: string, extra: Record<string, unknown> = {}) {
  const responseExample =
    extra.responseExample && typeof extra.responseExample === "object" ? extra.responseExample : { success: true, data: {} };
  const { responseExample: _drop, ...rest } = extra;
  return {
    summary,
    tags: TAG,
    security: bearer,
    ...rest,
    responses: {
      "200": {
        description: "Success",
        content: { "application/json": { example: responseExample } },
      },
      "201": {
        description: "Created",
        content: { "application/json": { example: responseExample } },
      },
      ...stdErrors,
      ...(rest.responses as Record<string, unknown> | undefined),
    },
  };
}

const appIdParam = {
  name: "applicationId",
  in: "path",
  required: true,
  schema: { type: "string", example: "clxapplication001" },
};

const versionIdParam = {
  name: "versionId",
  in: "path",
  required: true,
  schema: { type: "string", example: "clxmemoversion001" },
};

export const investmentMemoEditingSwaggerPaths: Record<string, unknown> = {
  "/investment-memos/{applicationId}": {
    get: op("Current memo header + latest version summary", {
      parameters: [appIdParam],
      responseExample: {
        success: true,
        data: {
          applicationId: "clxapplication001",
          memoId: "clxmemo001",
          latestVersionId: "clxmemoversion001",
          latestVersionNumber: 1,
          status: "DRAFT",
          updatedAt: "2026-06-20T10:00:00.000Z",
        },
      },
    }),
  },
  "/investment-memos/{applicationId}/versions": {
    get: op("List memo versions", {
      parameters: [appIdParam],
      responseExample: {
        success: true,
        data: [
          {
            id: "clxmemoversion001",
            versionNumber: 1,
            status: "DRAFT",
            changeSummary: "Initial draft from DD pack",
            createdAt: "2026-06-18T09:00:00.000Z",
          },
        ],
      },
    }),
    post: op("Create new draft version", {
      parameters: [appIdParam],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { changeSummary: { type: "string" } },
            },
            example: { changeSummary: "Revised financials after Q2 management accounts" },
          },
        },
      },
      responseExample: {
        success: true,
        data: {
          id: "clxmemoversion002",
          versionNumber: 2,
          status: "DRAFT",
          changeSummary: "Revised financials after Q2 management accounts",
        },
      },
    }),
  },
  "/investment-memos/{applicationId}/versions/{versionId}": {
    get: op("Full version payload", {
      parameters: [appIdParam, versionIdParam],
      responseExample: {
        success: true,
        data: {
          id: "clxmemoversion001",
          versionNumber: 1,
          status: "DRAFT",
          sections: memoSectionsExample,
          changeSummary: "Initial draft",
        },
      },
    }),
    put: op("Save draft sections", {
      parameters: [
        appIdParam,
        versionIdParam,
        { name: "validate", in: "query", schema: { type: "boolean", example: false } },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["sections"],
              properties: {
                sections: { type: "object" },
                changeSummary: { type: "string" },
              },
            },
            example: {
              changeSummary: "Updated financial analysis",
              sections: memoSectionsExample,
            },
          },
        },
      },
      responseExample: {
        success: true,
        data: {
          id: "clxmemoversion001",
          status: "DRAFT",
          sections: memoSectionsExample,
          validation: { passed: true, errors: [] },
        },
      },
    }),
  },
  "/investment-memos/{applicationId}/versions/{versionId}/validate": {
    get: op("Dry-run validation", {
      parameters: [appIdParam, versionIdParam],
      responseExample: {
        success: true,
        data: {
          passed: true,
          errors: [],
        },
      },
    }),
  },
  "/investment-memos/{applicationId}/versions/{versionId}/submit": {
    post: op("Validate and submit for CIO approval", {
      parameters: [appIdParam, versionIdParam],
      responseExample: {
        success: true,
        data: {
          id: "clxmemoversion001",
          status: "SUBMITTED",
          submittedAt: "2026-06-21T14:30:00.000Z",
        },
      },
    }),
  },
  "/investment-memos/{applicationId}/versions/{versionId}/approve": {
    post: op("CIO approve memo", {
      parameters: [appIdParam, versionIdParam],
      requestBody: {
        content: {
          "application/json": {
            schema: { type: "object", properties: { comment: { type: "string" } } },
            example: { comment: "Approved — proceed to Call to Vote." },
          },
        },
      },
      responseExample: {
        success: true,
        data: {
          id: "clxmemoversion001",
          status: "APPROVED",
          approvedAt: "2026-06-22T09:00:00.000Z",
        },
      },
    }),
  },
  "/investment-memos/{applicationId}/versions/{versionId}/reject": {
    post: op("CIO reject — returns to DRAFT", {
      parameters: [appIdParam, versionIdParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["comment"],
              properties: { comment: { type: "string" } },
            },
            example: { comment: "Expand risks section — currency exposure under-specified." },
          },
        },
      },
      responseExample: {
        success: true,
        data: {
          id: "clxmemoversion001",
          status: "DRAFT",
          rejectedAt: "2026-06-22T11:00:00.000Z",
        },
      },
    }),
  },
  "/investment-memos/{applicationId}/versions/{versionId}/attachment": {
    post: op("Optional PDF/Word attachment per version", {
      parameters: [appIdParam, versionIdParam],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file"],
              properties: { file: { type: "string", format: "binary", description: "PDF or DOCX memo export" } },
            },
          },
        },
      },
      responseExample: {
        success: true,
        data: {
          attachmentUrl: "https://storage.example.com/memos/clxmemoversion001.pdf",
          fileName: "investment-memo-v1.pdf",
        },
      },
    }),
  },
  "/investment-memos/{applicationId}/approval-history": {
    get: op("Approval event log", {
      parameters: [appIdParam],
      responseExample: {
        success: true,
        data: [
          {
            action: "SUBMITTED",
            actorEmail: "analyst@nvccz.co.zw",
            at: "2026-06-21T14:30:00.000Z",
            comment: null,
          },
          {
            action: "APPROVED",
            actorEmail: "cio@nvccz.co.zw",
            at: "2026-06-22T09:00:00.000Z",
            comment: "Approved — proceed to Call to Vote.",
          },
        ],
      },
    }),
  },
};
