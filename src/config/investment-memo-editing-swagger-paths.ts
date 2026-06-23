/**
 * Investment Memo Editing — Swagger paths.
 * Requirements: docs/investment-memo-editing-backend-requirements.md
 * Design session: design-sessions/investment-memo-editing.md
 */

export const INVESTMENT_MEMO_EDITING_TAG = "Investment Memo Editing";

export const INVESTMENT_MEMO_EDITING_TAG_DEFINITION = {
  name: INVESTMENT_MEMO_EDITING_TAG,
  description:
    "**Structured Investment Memo** — versioned sections, validation, CIO approval, and audit history before Call to Vote.\n\n" +
    "Base path: `/api/investment-memos/*`. Available when application stage is `UNDER_BOARD_REVIEW`.\n\n" +
    "See `docs/investment-memo-editing-backend-requirements.md`.",
};

const TAG = [INVESTMENT_MEMO_EDITING_TAG];
const bearer = [{ bearerAuth: [] }];

function op(summary: string, extra: Record<string, unknown> = {}) {
  return { summary, tags: TAG, security: bearer, ...extra };
}

const appIdParam = {
  name: "applicationId",
  in: "path",
  required: true,
  schema: { type: "string" },
};

const versionIdParam = {
  name: "versionId",
  in: "path",
  required: true,
  schema: { type: "string" },
};

export const investmentMemoEditingSwaggerPaths: Record<string, unknown> = {
  "/investment-memos/{applicationId}": {
    get: op("Current memo header + latest version summary", {
      parameters: [appIdParam],
    }),
  },
  "/investment-memos/{applicationId}/versions": {
    get: op("List memo versions", { parameters: [appIdParam] }),
    post: op("Create new draft version", {
      parameters: [appIdParam],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { changeSummary: { type: "string" } },
            },
          },
        },
      },
    }),
  },
  "/investment-memos/{applicationId}/versions/{versionId}": {
    get: op("Full version payload", { parameters: [appIdParam, versionIdParam] }),
    put: op("Save draft sections", {
      parameters: [
        appIdParam,
        versionIdParam,
        { name: "validate", in: "query", schema: { type: "boolean" } },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                sections: { type: "object" },
                changeSummary: { type: "string" },
              },
            },
          },
        },
      },
    }),
  },
  "/investment-memos/{applicationId}/versions/{versionId}/validate": {
    get: op("Dry-run validation", { parameters: [appIdParam, versionIdParam] }),
  },
  "/investment-memos/{applicationId}/versions/{versionId}/submit": {
    post: op("Validate and submit for CIO approval", { parameters: [appIdParam, versionIdParam] }),
  },
  "/investment-memos/{applicationId}/versions/{versionId}/approve": {
    post: op("CIO approve memo", {
      parameters: [appIdParam, versionIdParam],
      requestBody: {
        content: {
          "application/json": {
            schema: { type: "object", properties: { comment: { type: "string" } } },
          },
        },
      },
    }),
  },
  "/investment-memos/{applicationId}/versions/{versionId}/reject": {
    post: op("CIO reject — returns to DRAFT", {
      parameters: [appIdParam, versionIdParam],
      requestBody: {
        content: {
          "application/json": {
            schema: { type: "object", properties: { comment: { type: "string" } } },
          },
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
              properties: { file: { type: "string", format: "binary" } },
            },
          },
        },
      },
    }),
  },
  "/investment-memos/{applicationId}/approval-history": {
    get: op("Approval event log", { parameters: [appIdParam] }),
  },
};
