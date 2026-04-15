# Deal workflow — technical reference

Companion to **`docs/updated-investment-flow-workflow.md`** (narrative + request examples). This file tracks **schema**, **migrations**, **task metadata**, and **environment flags**.

## Application identity

- Internal id: `applications.id` (CUID).
- Human deal id: **`dealReference`** (e.g. `VST-2026-000001`); prefix from **`DEAL_REFERENCE_PREFIX`** (default `VST`).

## Stages (`applications.currentStage`)

| Stage | Meaning |
|--------|---------|
| `SCREENING_PENDING` | Submitted; automated screening may run |
| `SCREENING` | Analyst assignment and screening score |
| `ACTIVE_DD` | Active due diligence |
| `REJECTED_SCREENING` | Rejected at screening |
| `AUTO_REJECTED` | Automated rejection |
| `BELOW_THRESHOLD` | Below threshold |
| `INVESTMENT_IMPLEMENTATION` | Implementation phase |
| `DISBURSED` | All tranches disbursed for the implementation |

Legacy values in old databases may need migration (see scripts below).

## Notable application fields

| Field | Notes |
|--------|--------|
| `dealReference` | Unique human-readable deal id |
| `assignedAnalystId` | Lead analyst; Active DD tasks prefer this user |
| `screeningScore` | Analyst screening score 0–100 |
| `initialScreeningScore` | Automated / AI screening score |
| `complianceCleared` | Required before fund disbursement APIs |

## Migrations (run order)

1. `npm run db:migrate:application-deal-workflow`
2. `npm run db:migrate:deal-workflow-deal-reference`

Then `npx prisma generate`.

## Active DD task metadata (`tasks.taskMetadata`)

```json
{
  "sourceModule": "PMS",
  "dealId": "<dealReference or applicationId fallback>",
  "applicationId": "<cuid>",
  "workflowPack": "ACTIVE_DD_ENTRY_V1",
  "packItemKey": "item_1"
}
```

## Board review — behaviour summary

| Topic | Detail |
|--------|--------|
| Votes | `POST /api/board-reviews/:applicationId/votes` with `{ "vote": "APPROVE" \| "REJECT", "comment"?: string }` — **comment required when vote is APPROVE** |
| Double vote | One vote per `(boardReviewId, userId)` |
| Quorum | Env **`BOARD_VOTE_QUORUM_YES_COUNT`** (default **3**); set **`0`** to disable auto-complete when majority APPROVE |
| Manual finalize | `POST /api/board-reviews/:applicationId/complete` |

## Fund disbursements — behaviour summary

| Topic | Detail |
|--------|--------|
| Banks + GL (picker) | **`GET /api/investment-implementations/disbursement-banks`** — optional `?paymentCurrencyId=`; `data[]` has `id` (use as `bankId`), `name`, `currency*`, **`glAccount`** `{ id, accountNo, accountName, accountType }` |
| Create tranche | `POST /api/investment-implementations/disbursements` → `status: PENDING`, `cfoApprovalStatusLabel: PENDING_CFO_APPROVAL` |
| Tranche index | `trancheIndex` is 1-based per implementation |
| CFO approve | `POST .../disbursements/:id/decision` with `APPROVE` + `bankId`, or `POST .../approve` with `{ bankId }` |
| Queue | `GET .../disbursements/pending` |

