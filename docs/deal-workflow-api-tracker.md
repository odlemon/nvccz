# Deal / application workflow — API & schema tracker (UAT alignment)

This document tracks **endpoints**, **request bodies**, **stage values**, and **DB fields** for the investment deal flow (deal id = internal `application.id`; human **deal id** = `dealReference`, e.g. `VST-2026-000001`; prefix from env `DEAL_REFERENCE_PREFIX`, default `VST`).

**Narrative workflow (apply → CFO):** see **`docs/updated-investment-flow-workflow.md`**. **Swagger:** tag **`Updated investment flow`** groups the main operations.

## Canonical stages (`applications.currentStage`)

| Stage | Meaning |
|--------|---------|
| `SCREENING_PENDING` | Submitted; automated screening (AI) not finished (UAT “Screening” queue). |
| `SCREENING` | Passed automated screening; analyst work / eligible to initiate DD (replaces legacy `SHORTLISTED`). |
| `ACTIVE_DD` | Active due diligence (replaces legacy `UNDER_DUE_DILIGENCE`). |
| `REJECTED_SCREENING` | Rejected during screening (AI below threshold, analyst scorecard &lt; minimum, etc.). |
| `AUTO_REJECTED` | Automated rejection (e.g. no documents for AI pipeline). |
| `BELOW_THRESHOLD` | Existing funnel “below threshold” (unchanged). |

**Legacy values** in old rows should be migrated via `npm run db:migrate:deal-workflow-deal-reference` (includes `UPDATE` from `PENDING_SHORTLISTING` / `SHORTLISTED` / `UNDER_DUE_DILIGENCE` / `REJECTED`).

## New / changed application fields

| Field | Type | Notes |
|--------|------|--------|
| `dealReference` | `string` (unique) | Sequential human deal id: `{PREFIX}-{year}-{6-digit-seq}`; `DEAL_REFERENCE_PREFIX` (default `VST`). |
| `assignedAnalystId` | `string?` | Lead analyst; **PMS Active DD tasks are assigned to this user** (fallback: DD `reviewerId` or fund actor if unset). |
| `screeningScore` | `decimal?` | Analyst Initial Screening Scorecard (0–100); UAT field name. |
| `initialScreeningScore` | `decimal?` | AI screening score (unchanged). |

## Migrations (run order)

1. `npm run db:migrate:application-deal-workflow` — compliance + `taskMetadata` (if not already applied).
2. `npm run db:migrate:deal-workflow-deal-reference` — counters table, `dealReference`, `assignedAnalystId`, `screeningScore`, stage renames, backfill `dealReference`.

Then: `npx prisma generate`.

## Endpoints

### Public

- **POST `/api/applications`** — Create application.  
  - **Response** includes `dealReference`, `currentStage: SCREENING_PENDING`.  
  - **Body**: unchanged (`CreateApplicationRequest`); deal reference allocated inside a DB transaction.

- **GET `/api/applications/status/:id`** — Unchanged (light `select`).

### Authenticated — portfolio

- **GET `/api/applications/:id`**  
  - **Query**: `light=true` — faster payload (no heavy disbursement joins).  
  - **403 fund isolation** only when **`NVCCZ_STRICT_DEAL_ACCESS=true`**. Default (UAT): any authenticated user may read the deal if they know the id.

- **PATCH `/api/applications/:id/assigned-analyst`**  
  - **Body**: `{ "analystUserId": "<user cuid>" }`  
  - **Who (strict)**: when `NVCCZ_STRICT_DEAL_ACCESS=true` — fund managers for the application’s fund, or admin/CEO/CIO; assignee must be an investment analyst.  
  - **Who (UAT default)**: any authenticated user; target user must exist.  
  - **When**: `SCREENING_PENDING` or `SCREENING`.

- **POST `/api/applications/:id/analyst-screening`**  
  - **Body**: `{ "score": 0 }` … `{ "score": 100 }`  
  - **Who**: only the **assigned lead analyst** (`assignedAnalystId`); requires analyst assigned first.  
  - **When**: `SCREENING` only.  
  - **Logic**: if `score < 50` → `REJECTED_SCREENING`. If `score >= 50` → records score, initiates due diligence (`ACTIVE_DD`, DD row, PMS task pack for the lead analyst, applicant email sent asynchronously).

- **PATCH `/api/applications/:id/statutory-compliance`** — Body `{ "kycVerified": boolean }`. **Route**: `authenticate` only (legal/compliance `authorize` removed for UAT). Business rules unchanged (RBZ doc + `complianceCleared`; disbursements still blocked until cleared).

- **POST `/api/applications/:id/change-stage`**  
  - **Body**: `newStage` must use new enums where applicable (e.g. `ACTIVE_DD` instead of `UNDER_DUE_DILIGENCE`).  
  - Valid transitions include `SCREENING` → `ACTIVE_DD` (seeds PMS tasks).

- **POST `/api/applications/:id/due-diligence/initiate`**  
  - Requires `currentStage === SCREENING`.  
  - Sets stage to `ACTIVE_DD` and seeds tasks with assignee = `assignedAnalystId` ?? `reviewerId`.

- **POST `/api/applications/:id/submit`** (applicant path)  
  - Requires `SCREENING`; moves to `ACTIVE_DD`; seeds tasks (assignee = `assignedAnalystId` ?? fund manager fallback).

### Scoring / AI

- **POST `/api/applications/:id/trigger-shortlisting`** (async)  
  - Only when `currentStage === SCREENING_PENDING`.

### Threshold / rejected lists

- **GET `/api/applications/below-threshold`**  
  - Now includes stages: `REJECTED`, `REJECTED_SCREENING`, `AUTO_REJECTED`, `BELOW_THRESHOLD`.

## Task metadata (CF-2)

`tasks.taskMetadata` for Active DD pack:

```json
{
  "sourceModule": "PMS",
  "dealId": "<dealReference or applicationId fallback>",
  "applicationId": "<cuid>",
  "workflowPack": "ACTIVE_DD_ENTRY_V1",
  "packItemKey": "item_1"
}
```

Tasks are created in **parallel** (`Promise.all`) for lower latency.

## Performance notes (&lt; 5s targets)

- Prefer **GET `/api/applications/:id?light=true`** for deal cards/lists where full disbursement drill-down is not needed.  
- **Assign analyst** before or early in screening so PMS tasks land on the correct user without relying on fund-manager fallbacks.

## UAT §3 — IC / IM voting (mapped to **board review**)

| UAT expectation | Implementation |
|-----------------|----------------|
| Call to vote / votes stored | **POST `/api/board-reviews/:applicationId/votes`** body `{ "vote": "APPROVE" \| "REJECT", "comment"?: string }`. **`comment` required when `vote` is `APPROVE`**. |
| Double-vote prevented | One row per `(boardReviewId, userId)`; second vote → error. |
| Quorum (e.g. 3× YES) → approved | When **`BOARD_VOTE_QUORUM_YES_COUNT`** (default **3**) APPROVE votes and weighted majority is **APPROVE**, **`BoardReviewService`** auto-calls **`completeBoardReview(..., { allowQuorumEarlyApproval: true })`**. Set env to **`0`** to disable auto-complete. |
| Manual finalize | **POST `/api/board-reviews/:applicationId/complete`**. Returns `{ boardReview, voteSummary }`. |
| Strict vs UAT on voting | **`NVCCZ_STRICT_BOARD_VOTE=true`**: Investments + board role codes on **submit**; Board Chair only on **complete**; restricted **GET …/votes/summary**. **Default**: any authenticated user may vote, view summary, and complete (matches service + **BoardReviewController**). |
| Eligible voter roster (emails / power totals) | **GET** board voting members via existing user/board endpoints; roster includes **`BOARD_CHAIR`, `BOARD_MEMBER`, `INV_COMM_MEM`, `CIO`**. Investments department filter on roster only when **`NVCCZ_STRICT_BOARD_VOTE=true`**. Default voting power **1** if unset when not strict. |

## UAT §4 — Tranche / fund request (mapped to **fund disbursements**)

| UAT expectation | Implementation |
|-----------------|----------------|
| Fund request created | **POST `/api/investment-implementations/disbursements`** — same body as before; optional **`milestoneId`**. Initial **`status`: `PENDING`**. |
| Pending CFO label | **Response** (create) and **GET** `.../disbursement-summary` include **`cfoApprovalStatusLabel`: `"PENDING_CFO_APPROVAL"`** when status is `PENDING`. |
| Tranche index | **`trancheIndex`**: 1-based sequence per **`investmentImplementationId`** (on create and on each item in summary `disbursements`). |
| Undrawn commitment | Summary includes **`undrawnCommittedAmount`** (equal to **`remainingCommittedAmount`**). |
| CFO execution / journal | **POST** `.../disbursements/:id/decision` with `{ "decision": "APPROVE", "bankId" }` or **POST** `.../approve` with `{ "bankId" }` → cashbook / GL (1501 / bank), tranche **DISBURSED** in one step, emails to applicant + lead analyst. **GET** `.../disbursements/pending`, **GET** `.../disbursement-banks`. |

## Environment flags (production vs UAT)

| Variable | Default | Effect |
|----------|---------|--------|
| `NVCCZ_STRICT_DEAL_ACCESS` | unset | Deal **GET** + **assign analyst**: permissive. **Screening score** is always **assignee-only**. |
| `NVCCZ_STRICT_DEAL_ACCESS=true` | — | Restore fund-manager / exec checks on **assign analyst** only. |
| `NVCCZ_STRICT_BOARD_VOTE` | unset | Board vote / summary / complete: permissive in **controller + service** (except APPROVE comment rule). |
| `NVCCZ_STRICT_BOARD_VOTE=true` | — | Restore chair-only complete, restricted vote summary, IC eligibility on vote. |
| `BOARD_VOTE_QUORUM_YES_COUNT` | `3` | Minimum APPROVE **votes** (head count) to auto-complete when majority is APPROVE; **`0`** disables. |

## Removed

- **Firestore rules file** — removed from repo per product direction; vault immutability should be enforced in the stack you use for storage (e.g. API + object storage policies).

---

*Last updated: UAT board voting (quorum, comment, env flags), disbursement summary/create metadata, statutory route auth, tracker + Swagger alignment.*
