# FP&A Model Planning — Stages 6–9 workflow (MPC-native)

**Date:** 2026-07-16  
**Status:** Implemented  
**Related:** [fpa-model-planning-owners-api.md](./fpa-model-planning-owners-api.md), [fpa-model-planning-tasks-api.md](./fpa-model-planning-tasks-api.md)

Do **not** call `/budget-cycles/{id}/…` for Model Planning cycle ids. All verbs below are on:

`/api/v1/fpa/model-planning/cycles/{cycleId}/…`

## Flow

```
Owner slice submit (POST /tasks/{taskId}/submit)
  → cycle stays OPEN (currentStage may be READY_TO_CONSOLIDATE)
  → POST …/submit              → SUBMITTED / FPA_REVIEW
  → POST …/review/accept       → UNDER_REVIEW / CFO_REVIEW
  → POST …/review/return       → RETURNED_FOR_CORRECTION
  → POST …/cfo-approve         → APPROVED
  → POST …/cfo-return          → RETURNED_FOR_CORRECTION
  → POST …/lock                → LOCKED (+ freeze planning version)
  → POST …/request-reopen      → OPEN (optional)
```

---

## Cycle GET fields

On `GET /model-planning/cycles/{id}` (and enriched list items via serialize):

| Field | Notes |
|-------|--------|
| `status` | `DRAFT` \| `OPEN` \| `SUBMITTED` \| `UNDER_REVIEW` \| `IN_REVIEW` \| `RETURNED_FOR_CORRECTION` \| `APPROVED` \| `LOCKED` \| `CLOSED` |
| `currentStage` | e.g. `OWNER_INPUT`, `FPA_REVIEW`, `CFO_REVIEW`, `APPROVED`, `LOCKED` |
| `submittedAt` / `submittedById` | After consolidate submit |
| `approvedAt` / `approvedById` | After CFO approve |
| `lockedAt` / `lockedById` | After lock |
| `materialVariancePct` | Stage 3 |

---

## 1. Submit / consolidate cycle

```http
POST /api/v1/fpa/model-planning/cycles/{cycleId}/submit
```

```json
{ "note": "All owner slices ready" }
```

```json
{
  "success": true,
  "data": {
    "id": "mpc_…",
    "status": "SUBMITTED",
    "currentStage": "FPA_REVIEW",
    "submittedAt": "2026-07-16T20:00:00.000Z"
  }
}
```

| Code | When |
|------|------|
| `CYCLE_NOT_READY` | Open owner slices remain; response includes `data.blockers[]` |
| `ALREADY_SUBMITTED` | Already submitted / past submit |
| `INVALID_STATUS` | Not `OPEN` / `DRAFT` / `RETURNED_FOR_CORRECTION` |
| `403` | Not FP&A / approver |

---

## 2. FP&A review

```http
POST /api/v1/fpa/model-planning/cycles/{cycleId}/review/accept
POST /api/v1/fpa/model-planning/cycles/{cycleId}/review/return
```

Return body:

```json
{
  "departmentId": "dept_…",
  "taskId": "task_…",
  "comment": "Revise headcount for Q3"
}
```

- Accept → `UNDER_REVIEW` / `CFO_REVIEW`
- Return → `RETURNED_FOR_CORRECTION` / `OWNER_INPUT` (reopens owner slices)

| Code | When |
|------|------|
| `INVALID_STATUS` | Not reviewable |
| `VALIDATION` | Return without `comment` |
| `403` | Not reviewer |

---

## 3. CFO approve / return

```http
POST /api/v1/fpa/model-planning/cycles/{cycleId}/cfo-approve
POST /api/v1/fpa/model-planning/cycles/{cycleId}/cfo-return
```

```json
{ "comment": "Approved Base for FY2026", "scenarioId": "scn_base" }
```

| Code | When |
|------|------|
| `MAKER_CHECKER` | Same user as cycle `submittedById` cannot approve |
| `INVALID_STATUS` | Not pending CFO |
| `403` | Not CFO / admin |

---

## 4. Lock / reopen

```http
POST /api/v1/fpa/model-planning/cycles/{cycleId}/lock
```

```json
{ "reason": "Board pack freeze" }
```

Side effects:

- Cycle `status: LOCKED`
- Source planning version set to `LOCKED`
- Cell writes with this `cycleId` (or locked version) return `LOCKED_VERSION` / `423`

```http
POST /api/v1/fpa/model-planning/cycles/{cycleId}/request-reopen
```

```json
{ "reason": "Material error after lock" }
```

→ `OPEN` / `OWNER_INPUT`; version unlocked to `DRAFT`.

---

## Acceptance checklist

- [x] Owner submits slices → cycle remains `OPEN` until consolidate
- [x] FP&A `submit` → `SUBMITTED` + timestamps on GET
- [x] Review accept → `UNDER_REVIEW`; return → owners `RETURNED`
- [x] CFO approve uses MPC route (not budget-cycle); maker-checker enforced
- [x] Lock blocks cell edit; footer can read `status` / `currentStage` / `lockedAt`

**UAT:** `npm run uat:fpa:model-planning-workflow` (nts only)
