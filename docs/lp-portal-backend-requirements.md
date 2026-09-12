# Limited Partner Portal — backend requirements specification

> **Superseded for API routes/examples:** use [`docs/lp-portal-api.md`](./lp-portal-api.md) (and product SRD [`lp_portal_srd.md`](./lp_portal_srd.md)).

Full backend specification for the **Arcus Limited Partner (LP) Portal**. Frontend design session companion: [`design-sessions/lp-portal.md`](../design-sessions/lp-portal.md).

**Status:** Incremental — extends `Client`, capital-call/distribution ledgers, and integrates with [Fund Performance Reporting](./fund-performance-reporting-backend-requirements.md).

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Architectural goals](#2-architectural-goals)
3. [Current codebase baseline](#3-current-codebase-baseline)
4. [Functional requirements](#4-functional-requirements)
5. [Permission matrix](#5-permission-matrix)
6. [Process workflows](#6-process-workflows)
7. [Mathematical formulations](#7-mathematical-formulations)
8. [Proposed data model](#8-proposed-data-model)
9. [API specification](#9-api-specification)
10. [Integration with Fund Performance Reporting](#10-integration-with-fund-performance-reporting)
11. [Security, MFA, and revocation](#11-security-mfa-and-revocation)
12. [Implementation phases](#12-implementation-phases)
13. [Testing and UAT](#13-testing-and-uat)
14. [Swagger and OpenAPI](#14-swagger-and-openapi)

---

## 1. Executive summary

The LP Portal provides LPs a secure, real-time view of commitments, paid-in capital, distributions, performance metrics, and documents. It is a **separate module** from Fund Performance Reporting:

| Module | Swagger tag | Base path |
|--------|-------------|-----------|
| **LP Portal** | `LP Portal` | `/api/lp-portal/*` |
| **Fund Performance Reporting** | `Fund Performance Reporting` | `/api/fund-reporting/*` (GP only) |

---

## 2. Architectural goals

1. **Secure isolation** — every request validated via `lp_user_relations`; fund-scoped RLS.
2. **Institutional visualizations** — cached `lp_portal_metric_snapshots` for responsive dashboards.
3. **Dual-currency reporting** — USD and ZIG presentation using transaction-date FX where available.

---

## 3. Current codebase baseline

| Asset | Status |
|-------|--------|
| `Client`, `InvestmentCommitment` | Exists |
| `CapitalCallAllocation`, payments, `DistributionAllocation` | Exists — ledger source |
| `Client.userId` | Exists — optional 1:1 link |
| `FundReportingLpService` under `/fund-reporting/lp/*` | **Migrate** to LP Portal |
| `lp_user_relations` | **New** |
| Document vault | **New** |
| TOTP MFA | **New** |

---

## 4. Functional requirements

### US-LP-1 — Investor dashboard

- `GET /lp-portal/dashboard` — consolidated metrics across funds; `?fundId`, `?presentationCurrency=USD|ZIG`.
- Reads snapshot cache; falls back to live `LpFundMetricsService` compute.

### US-LP-2 — Capital account ledger

- `GET /lp-portal/ledger` — filterable transaction list.
- `GET /lp-portal/ledger/:entryId` — detail + PDF link.

### US-LP-3 — Document vault

- `GET /lp-portal/vault` — search, category filter.
- `GET /lp-portal/vault/:documentId/download` — stream file.
- `GET /lp-portal/vault/:documentId/verify` — SHA-256 integrity.

### US-LP-4 — Performance reports

- `GET /lp-portal/reports` — list from `fund_report_recipient_jobs` + vault index.
- `GET /lp-portal/reports/:jobId/download` — PDF for own client only.

### US-LP-5 — Colleague management (LP Manager)

- `GET/POST /lp-portal/colleagues` — list/invite viewers for same `clientId`.
- `PATCH /lp-portal/colleagues/:membershipId/revoke` — manager revokes viewer.

### US-LP-6 — GP admin

- `POST /lp-portal/admin/documents` — publish tax/audit/manual files.
- `GET/POST /lp-portal/admin/memberships` — GP invite/revoke LP access.
- `PUT /lp-portal/admin/mfa-policy` — SysAdmin global MFA config.

---

## 5. Permission matrix

| API group | LP Viewer | LP Manager | GP Ops | SysAdmin |
|-----------|-----------|------------|--------|----------|
| dashboard, ledger, vault, reports | Yes | Yes | Yes | Yes |
| colleagues | No | Yes | No | Yes |
| admin/documents, admin/memberships | No | No | Yes | Yes |
| admin/mfa-policy | No | No | No | Yes |

---

## 6. Process workflows

### Login + MFA

`POST /auth/login` → if LP + MFA required → `mfaPendingToken` → `POST /auth/mfa/verify` → JWT.

### Revocation

GP sets `lp_user_relations.isActive=false` + bumps `users.tokenVersion` → next request **401**.

---

## 7. Mathematical formulations

Eqs 1–7 from product spec (paid-in, distributed, uncalled, DPI, RVPI, TVPI, IRR). Reuse [`LpFundMetricsService.ratios`](../src/services/fundReporting/LpFundMetricsService.ts) and [`xirr`](../src/utils/xirr.ts).

---

## 8. Proposed data model

- `lp_user_relations` — userId, clientId, lpRole (VIEWER|MANAGER), isActive, fundIds JSON
- `lp_portal_documents` — vault metadata + sha256
- `lp_portal_metric_snapshots` — cached KPI JSON per client/fund/asOf
- `user_mfa_totp` — encrypted TOTP secret, backup codes
- `lp_portal_mfa_policy` — requireMfaForLp, issuerName
- `users.token_version` — session invalidation on revoke

Migration: `npm run db:migrate:lp-portal`

---

## 9. API specification

Base: `/api/lp-portal`. See design session §14 for frontend handoff.

Cron (ops): `POST /api/cron/lp-portal/snapshot-refresh` — omitted from Swagger.

---

## 10. Integration with Fund Performance Reporting

When `FundReportRunOrchestrator` marks a job `DELIVERED`, call `LpPortalVaultService.indexPerformanceReport(job)` to create `lp_portal_documents` with `sourceType=FUND_REPORT_SYNC`.

LPs **do not** call `/api/fund-reporting/*`.

---

## 11. Security, MFA, and revocation

- Middleware: [`lpPortalAuth`](../src/middleware/lpPortalAuth.ts) — active `lp_user_relations` required.
- TOTP: `speakeasy` — enroll, verify, backup codes.
- Policy: SysAdmin configures `requireMfaForLp`.

---

## 12. Implementation phases

| Phase | Deliverable |
|-------|-------------|
| P0 | Docs |
| P1 | Migration + access layer |
| P2 | Dashboard, ledger, vault, reports |
| P3 | RBAC admin + colleagues |
| P4 | MFA + revocation |
| P5 | Snapshot cron + UAT |

---

## 13. Testing and UAT

- `npm run uat:lp-portal:core`
- `npm run uat:lp-portal:rbac`
- `npm run uat:lp-portal:mfa`
- `npm run uat:lp-portal:revoke`

---

## 14. Swagger and OpenAPI

- File: `src/config/lp-portal-swagger-paths.ts`
- Tag: **`LP Portal`** (single section, separate from Fund Performance Reporting)
