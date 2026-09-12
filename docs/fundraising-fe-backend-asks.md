# Fundraising — backend asks (FE gaps)

**Audience:** Frontend / API  
**Status:** **Implemented** on `feature/fundraising`  
**Base:** `{API_HOST}/api` — `/api/fundraising` and `/api/investors` (no `/api/v1`)

Full live contract (including these gaps): [`fundraising-frontend-api.md`](./fundraising-frontend-api.md)  
Original FE ask text retained in chat history; this file is the status pointer.

## Shipped

| # | Gap | Endpoints |
|---|-----|-----------|
| 1 | Settings CRUD | `GET/PATCH /fundraising/settings`, pipeline stage CRUD, `PATCH …/stage-gates`, `…/amount-types`, `…/notifications` |
| 2 | Meetings | `GET/POST /fundraising/meetings`, `GET/PATCH …/:id`, `POST …/cancel`, `POST …/complete` |
| 3 | Documents index (Option A) | `GET/POST /fundraising/documents`, `GET/PATCH …/:id`, `GET …/download` |
| 4 | Campaign engagement | `GET /fundraising/campaigns/:campaignId/engagement` |
| 5 | Forecast monthly curve | `GET /fundraising/forecasts/scenarios/:scenarioId/curve` (+ `monthlyProjection` on scenarios) |
| 6 | Mandate/RFP classification | `assetClass`, `geography`, `rfpDueDate` / `fitScore` on create/list/get |
| 7 | Placement commissions | fields on agent + `GET /fundraising/placement-agents/:agentId/commissions` |
| 8 | Commitment checklist | `GET/PATCH /fundraising/commitments/:id/checklist[/:itemId]` |
| 9 | Investor filters + compliance hold | Extended `GET /investors` filters; `POST /fundraising/investors/:investorId/compliance-hold`; `POST /fundraising/compliance-holds/:holdId/release` |
| 10 | Global contacts index | `GET /fundraising/contacts` |
| 11 | Campaign ops kit | `…/campaigns/:id/templates`, `…/distribution-lists`, `…/events`, `…/materials`, `…/submit-for-approval`, `…/pause` |
| 12 | RFP proposal versions | `GET/POST /fundraising/rfps/:rfpId/proposal-versions`; mandate/RFP `stageCode` + `onboardingKycCaseId` |
| 13 | DDQ workflow expansion | item `PATCH`, `…/questions`, `…/answer-library`, item comments, `…/export` |
| 14 | Data room admin | `PATCH /fundraising/data-rooms/:id`; `DELETE …/access/:accessId` |
| 15 | Document versions + export | `GET/POST …/documents/:id/versions`, per-version download, `GET …/documents/export` |
| 16 | E-sign adapter (metadata) | `POST …/agreements/:id/send`, signatory decline, signed-copy / certificate |
| 17 | KYC lifecycle fields | Extra columns on KYC cases (docs/conditions/terminal status); blocks via compliance hold |
| 18 | Placement exclusions + ledger | `…/placement-exclusions`, `…/commissions/pay`, `…/placement-assignments/:id/unassign` |
| 19 | Closing readiness / post-close | `readinessJson` / `postCloseJson` on closing records; `POST …/closings/:id/readiness` |
| 20 | Report jobs / schedules | `GET /fundraising/reports` (catalog), `…/jobs`, `…/schedules`, `…/history` |
| 21 | Forecast recalc + analytics | `POST …/forecasts/scenarios/:id/recalculate`; `GET …/analytics/concentration`, `…/geography` |
| 22 | Meeting outcome-rich complete | Extends gap 2 — `POST …/meetings/:id/complete` with `outcomeSummary`, decisions, action items |
| 23 | Approval create + history | `POST /fundraising/approvals`, `GET …/approvals/:id/history` |
| 24 | Audit export + filters | Extended `GET /fundraising/audit-logs`; `GET …/audit-logs/export` |

## Ops

```bash
# Gaps 1–8 (settings, meetings base, documents index, …)
npm run db:migrate:fundraising-fe-gaps
npm run uat:fundraising:fe-gaps          # API must be running; set API_BASE_URL

# Gaps 9–24 (requirements expansion + outcome-rich meetings DDL)
npm run db:migrate:fundraising-requirements-gap
npm run uat:fundraising:requirements-gap # API must be running on port 3002
```

Applied to `nts`, `client1_db`, and `demo_env`; the repeat run confirmed idempotency.
HTTP UAT against `nts` dev passed **62/62** on 2026-07-17.

## Notes for FE

- Settings template edits apply to **new** campaigns only.
- Documents list may include virtual `dr-*` / `agr-*` rows from data rooms / agreements; register via `POST /documents` before versioning; use per-version download for registered docs.
- Engagement `opened` may be heuristic when not cached in `engagement_json`.
- Forecast curve is linear from `projectedSigned` if `monthlyProjection` omitted on create.
- **Notifications:** `PATCH /fundraising/settings/notifications` accepts `{ "notifications": [{ "id", "enabled" }] }` and **merges** into stored settings (partial patch by `id` / `eventKey`).
- **Meeting complete:** requires `outcomeSummary`; persists `discussionNotes`, `decisions`, and `actionItems` atomically; action items may create linked performance tasks (`linkedTaskId`); idempotent via `idempotencyKey` / completion nonce.
- **Compliance release:** `POST /fundraising/compliance-holds/:holdId/release` (not under `/investors`).
- **E-sign:** stores provider envelope / artifact metadata and serves uploaded artifacts — **no vendor SDK** (DocuSign/Adobe/etc.) integration.
- **Report jobs:** synchronous execution behind a job record contract (`RUNNING` → `COMPLETED` / `FAILED` in the same request); schedules persist but are not auto-run by a background worker.
- **Post-close:** LP provisioning state is represented in closing `postCloseJson` on GET; no external LP portal provisioning unless added elsewhere.
