/**
 * LP Portal — Swagger paths.
 * Requirements: docs/lp-portal-backend-requirements.md
 * Design session: design-sessions/lp-portal.md
 *
 * Cron route POST /api/cron/lp-portal/snapshot-refresh is omitted from Swagger (ops only).
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";
import { jsonRequestBody, multipartRequestBody, pathParam, queryParam } from "./swagger-module-helpers";
import { SWAGGER_EX } from "./swagger-uat-examples";

export const LP_PORTAL_TAG = "LP Portal";

export const LP_PORTAL_TAG_DEFINITION = {
  name: LP_PORTAL_TAG,
  description:
    "**Limited Partner Portal** — investor dashboard, capital ledger, document vault, performance reports, colleague access, MFA, and GP admin publish/revoke.\n\n" +
    "Base path: `/api/lp-portal/*`. Separate from Fund Performance Reporting (GP/ops only).\n\n" +
    "See `docs/lp-portal-backend-requirements.md`.",
};

const TAG = [LP_PORTAL_TAG];
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

const LP_SCOPE =
  "**LP access:** resolved via active `lp_user_relations` (or legacy `clients.user_id`). " +
  "GP staff impersonation requires `?clientId=` query param.";

const clientIdQuery = queryParam(
  "clientId",
  { type: "string", description: "Required for GP staff impersonation" },
  SWAGGER_EX.clientId
);

export const lpPortalSwaggerPaths: Record<string, unknown> = {
  "/lp-portal/dashboard": {
    get: op("US-LP-1 — Investor dashboard", {
      description: `${LP_SCOPE}\n\nConsolidated metrics; optional \`fundId\`, \`presentationCurrency=USD|ZIG\`.`,
      parameters: [
        clientIdQuery,
        queryParam("fundId", { type: "string" }, SWAGGER_EX.fundId),
        queryParam("presentationCurrency", { type: "string", enum: ["USD", "ZIG"] }, "USD"),
      ],
    }),
  },
  "/lp-portal/ledger": {
    get: op("US-LP-2 — Capital account ledger", {
      description: `${LP_SCOPE}\n\nFilter by fund, date range, currency.`,
      parameters: [
        clientIdQuery,
        queryParam("fundId", { type: "string" }, SWAGGER_EX.fundId),
        queryParam("currencyCode", { type: "string" }, "USD"),
      ],
    }),
  },
  "/lp-portal/ledger/{entryId}": {
    get: op("US-LP-2 — Ledger entry detail", {
      description: "Bank confirmation metadata + call notice vault link.",
      parameters: [
        pathParam("entryId", SWAGGER_EX.entryId),
        clientIdQuery,
      ],
    }),
  },
  "/lp-portal/vault": {
    get: op("US-LP-3 — Document vault list", {
      description: `${LP_SCOPE}\n\nCategory filter: TAX, AUDIT, PERFORMANCE_REPORT, CALL_NOTICE, MANUAL, QUARTERLY_STATEMENT.`,
      parameters: [
        clientIdQuery,
        queryParam("category", { type: "string" }, "PERFORMANCE_REPORT"),
      ],
    }),
  },
  "/lp-portal/vault/{documentId}/download": {
    get: op("US-LP-3 — Download vault document", {
      parameters: [
        pathParam("documentId", SWAGGER_EX.documentId),
        clientIdQuery,
      ],
      responses: {
        200: {
          description: "Document file",
          content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
        },
        404: { description: "Not found" },
      },
    }),
  },
  "/lp-portal/vault/{documentId}/verify": {
    get: op("US-LP-3 — SHA-256 integrity check", {
      parameters: [
        pathParam("documentId", SWAGGER_EX.documentId),
        clientIdQuery,
      ],
    }),
  },
  "/lp-portal/reports": {
    get: op("US-LP-4 — Performance report history", {
      description: `${LP_SCOPE}\n\nPaginated fund performance reports.`,
      parameters: [clientIdQuery, queryParam("fundId", { type: "string" }, SWAGGER_EX.fundId)],
    }),
  },
  "/lp-portal/reports/{jobId}/download": {
    get: op("US-LP-4 — Download performance report PDF", {
      parameters: [
        pathParam("jobId", SWAGGER_EX.jobId),
        clientIdQuery,
      ],
      responses: {
        200: {
          description: "PDF report",
          content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
        },
        404: { description: "Not found" },
      },
    }),
  },
  "/lp-portal/colleagues": {
    get: op("US-LP-5 — List colleague access (Manager)", {
      description: "LP Manager or SysAdmin only.",
      parameters: [clientIdQuery],
    }),
    post: op("US-LP-5 — Invite viewer colleague", {
      description: "Body: `{ email }` — must match existing user account.",
      parameters: [clientIdQuery],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["email"],
          properties: { email: { type: "string", format: "email" } },
        },
        examples: {
          inviteViewer: {
            summary: "Invite read-only colleague",
            value: { email: "viewer@family-office.example.com" },
          },
        },
      }),
    }),
  },
  "/lp-portal/colleagues/{membershipId}/revoke": {
    patch: op("US-LP-5 — Revoke viewer colleague", {
      parameters: [pathParam("membershipId", SWAGGER_EX.membershipId), clientIdQuery],
    }),
  },
  "/lp-portal/admin/memberships": {
    get: op("US-LP-6 — GP list LP memberships", { description: "GP Ops / SysAdmin." }),
    post: op("US-LP-6 — GP invite LP membership", {
      description: "Body: `clientId`, `userId`, optional `lpRole`, `fundIds[]`.",
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["clientId", "userId"],
          properties: {
            clientId: { type: "string" },
            userId: { type: "string" },
            lpRole: { type: "string", enum: ["VIEWER", "MANAGER"] },
            fundIds: { type: "array", items: { type: "string" } },
          },
        },
        examples: {
          inviteLp: {
            summary: "Grant LP portal access",
            value: {
              clientId: SWAGGER_EX.clientId,
              userId: SWAGGER_EX.userId,
              lpRole: "VIEWER",
              fundIds: [SWAGGER_EX.fundId],
            },
          },
        },
      }),
    }),
  },
  "/lp-portal/admin/memberships/{membershipId}/revoke": {
    patch: op("US-LP-6 — GP revoke LP access", {
      parameters: [pathParam("membershipId", SWAGGER_EX.membershipId)],
    }),
  },
  "/lp-portal/admin/documents": {
    post: op("US-LP-6 — GP publish vault document", {
      description: "Multipart: `file`, `clientId`, `category`, `title`, optional `fundId`.",
      requestBody: multipartRequestBody({
        schema: {
          type: "object",
          required: ["file", "clientId", "category", "title"],
          properties: {
            file: { type: "string", format: "binary" },
            clientId: { type: "string" },
            category: {
              type: "string",
              enum: ["TAX", "AUDIT", "PERFORMANCE_REPORT", "CALL_NOTICE", "MANUAL", "QUARTERLY_STATEMENT"],
            },
            title: { type: "string" },
            fundId: { type: "string" },
          },
        },
        examples: {
          publishDoc: {
            summary: "Publish performance report PDF",
            value: {
              file: "(binary PDF file)",
              clientId: SWAGGER_EX.clientId,
              category: "PERFORMANCE_REPORT",
              title: "Q1 2026 Investor Report",
              fundId: SWAGGER_EX.fundId,
            },
          },
        },
      }),
    }),
  },
  "/lp-portal/admin/mfa-policy": {
    get: op("MFA policy (SysAdmin)", { description: "Global `requireMfaForLp` + `issuerName`." }),
    put: op("MFA policy update (SysAdmin)", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          properties: {
            requireMfaForLp: { type: "boolean" },
            issuerName: { type: "string" },
          },
        },
        examples: {
          enableMfa: {
            summary: "Require MFA for all LPs",
            value: { requireMfaForLp: true, issuerName: "NVCCZ LP Portal" },
          },
        },
      }),
    }),
  },
  "/auth/mfa/enroll": {
    post: op("MFA — start TOTP enrollment", {
      description: "Returns QR data URL + manual entry key. Authenticated user.",
      tags: TAG,
    }),
  },
  "/auth/mfa/confirm-enrollment": {
    post: op("MFA — confirm TOTP enrollment", {
      description: "Body: `{ token }` — returns one-time backup codes.",
      tags: TAG,
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          properties: { token: { type: "string" } },
          required: ["token"],
        },
        examples: {
          confirmTotp: {
            summary: "Confirm 6-digit TOTP code",
            value: { token: "123456" },
          },
        },
      }),
    }),
  },
  "/auth/mfa/verify": {
    post: op("MFA — complete login", {
      description: "Body: `{ mfaPendingToken, token }` — returns full JWT after TOTP verify.",
      tags: TAG,
      security: [],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          properties: {
            mfaPendingToken: { type: "string" },
            token: { type: "string" },
          },
          required: ["mfaPendingToken", "token"],
        },
        examples: {
          verifyLogin: {
            summary: "Complete MFA login",
            value: { mfaPendingToken: "mfa-pending-jwt-example", token: "123456" },
          },
        },
      }),
    }),
  },
};
