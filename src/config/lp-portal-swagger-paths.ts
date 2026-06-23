/**
 * LP Portal — Swagger paths.
 * Requirements: docs/lp-portal-backend-requirements.md
 * Design session: design-sessions/lp-portal.md
 *
 * Cron route POST /api/cron/lp-portal/snapshot-refresh is omitted from Swagger (ops only).
 */

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
  return { summary, tags: TAG, security: bearer, ...extra };
}

const LP_SCOPE =
  "**LP access:** resolved via active `lp_user_relations` (or legacy `clients.user_id`). " +
  "GP staff impersonation requires `?clientId=` query param.";

export const lpPortalSwaggerPaths: Record<string, unknown> = {
  "/lp-portal/dashboard": {
    get: op("US-LP-1 — Investor dashboard", {
      description: `${LP_SCOPE}\n\nConsolidated metrics; optional \`fundId\`, \`presentationCurrency=USD|ZIG\`.`,
    }),
  },
  "/lp-portal/ledger": {
    get: op("US-LP-2 — Capital account ledger", {
      description: `${LP_SCOPE}\n\nFilter by fund, date range, currency.`,
    }),
  },
  "/lp-portal/ledger/{entryId}": {
    get: op("US-LP-2 — Ledger entry detail", {
      description: "Bank confirmation metadata + call notice vault link.",
      parameters: [{ name: "entryId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/lp-portal/vault": {
    get: op("US-LP-3 — Document vault list", {
      description: `${LP_SCOPE}\n\nCategory filter: TAX, AUDIT, PERFORMANCE_REPORT, CALL_NOTICE, MANUAL.`,
    }),
  },
  "/lp-portal/vault/{documentId}/download": {
    get: op("US-LP-3 — Download vault document", {
      parameters: [{ name: "documentId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/lp-portal/vault/{documentId}/verify": {
    get: op("US-LP-3 — SHA-256 integrity check", {
      parameters: [{ name: "documentId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/lp-portal/reports": {
    get: op("US-LP-4 — Performance report history", {
      description: `${LP_SCOPE}\n\nPaginated fund performance reports.`,
    }),
  },
  "/lp-portal/reports/{jobId}/download": {
    get: op("US-LP-4 — Download performance report PDF", {
      parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/lp-portal/colleagues": {
    get: op("US-LP-5 — List colleague access (Manager)", {
      description: "LP Manager or SysAdmin only.",
    }),
    post: op("US-LP-5 — Invite viewer colleague", {
      description: "Body: `{ email }` — must match existing user account.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object", properties: { email: { type: "string" } } } } },
      },
    }),
  },
  "/lp-portal/colleagues/{membershipId}/revoke": {
    patch: op("US-LP-5 — Revoke viewer colleague", {
      parameters: [{ name: "membershipId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/lp-portal/admin/memberships": {
    get: op("US-LP-6 — GP list LP memberships", { description: "GP Ops / SysAdmin." }),
    post: op("US-LP-6 — GP invite LP membership", {
      description: "Body: `clientId`, `userId`, optional `lpRole`, `fundIds[]`.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
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
          },
        },
      },
    }),
  },
  "/lp-portal/admin/memberships/{membershipId}/revoke": {
    patch: op("US-LP-6 — GP revoke LP access", {
      parameters: [{ name: "membershipId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/lp-portal/admin/documents": {
    post: op("US-LP-6 — GP publish vault document", {
      description: "Multipart: `file`, `clientId`, `category`, `title`, optional `fundId`.",
      requestBody: {
        required: true,
        content: { "multipart/form-data": { schema: { type: "object" } } },
      },
    }),
  },
  "/lp-portal/admin/mfa-policy": {
    get: op("MFA policy (SysAdmin)", { description: "Global `requireMfaForLp` + `issuerName`." }),
    put: op("MFA policy update (SysAdmin)", {
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                requireMfaForLp: { type: "boolean" },
                issuerName: { type: "string" },
              },
            },
          },
        },
      },
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
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", properties: { token: { type: "string" } }, required: ["token"] },
          },
        },
      },
    }),
  },
  "/auth/mfa/verify": {
    post: op("MFA — complete login", {
      description: "Body: `{ mfaPendingToken, token }` — returns full JWT after TOTP verify.",
      tags: TAG,
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                mfaPendingToken: { type: "string" },
                token: { type: "string" },
              },
              required: ["mfaPendingToken", "token"],
            },
          },
        },
      },
    }),
  },
};
