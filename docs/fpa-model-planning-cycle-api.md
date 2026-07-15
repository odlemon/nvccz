# FP&A Model Planning — Cycle API (Backend → Frontend handoff)

**Date:** 2026-07-14
**Backend:** `pine-fluent` (Express, `/api/v1/fpa`)
**Feature:** Model Planning → **Planning Cycles**
**Status:** Implemented (list / create / get / update / delete / workspace + selection sources).  
**Updated 2026-07-15:** published-version gate, status lifecycle, grid `cycleId` wiring, demo seed, UAT.

> **Naming:** This is **Model Planning**, not "Module Planning". A *Model Planning Cycle* is a
> **separate entity from `PlanningBudgetCycle`** (the annual budget execution workflow) by product
> decision. Routes live under `/model-planning/cycles` and the table is `model_planning_cycles`
> so they are never confused with the canonical `/budget-cycles` surface.
>
> Model Planning is the *operating room* on a **published** model: pick a cycle → open the
> worksheet grid (`GET /v1/fpa/models/{modelId}/grid`, already shipped, `cycleId` optional).

---

## 1. Base path & auth

All routes are mounted under `/api/v1/fpa` and require the standard `authenticate` middleware
(session cookie / bearer). The acting user is read from `req.user`.

```
GET    /api/v1/fpa/model-planning/cycles
POST   /api/v1/fpa/model-planning/cycles
GET    /api/v1/fpa/model-planning/cycles/sources
GET    /api/v1/fpa/model-planning/cycles/:id
GET    /api/v1/fpa/model-planning/cycles/:id/workspace
PUT    /api/v1/fpa/model-planning/cycles/:id
DELETE /api/v1/fpa/model-planning/cycles/:id
```

`/sources` MUST be declared before `/:id` (it is). Order in `fpaRoutes.ts` is correct.

---

## 2. Planning types & statuses

### Planning types (enum)

```ts
type PlanningType =
  | "ANNUAL_BUDGET"
  | "ROLLING_FORECAST"
  | "QUARTERLY_FORECAST"
  | "LONG_RANGE_PLAN"
  | "STRATEGIC_PLAN"
  | "REFORECAST";
```

Returned by `GET /sources` as `planningTypes`.

### Cycle statuses (enum)

```ts
type ModelPlanningCycleStatus =
  | "DRAFT"
  | "OPEN"
  | "IN_REVIEW"
  | "APPROVED"
  | "LOCKED"
  | "CLOSED";
```

New cycles start as **`DRAFT`**. Updates validate transitions:

| From | Allowed next |
|------|----------------|
| `DRAFT` | `DRAFT`, `OPEN` |
| `OPEN` | `OPEN`, `IN_REVIEW`, `CLOSED` |
| `IN_REVIEW` | `IN_REVIEW`, `OPEN`, `APPROVED` |
| `APPROVED` | `APPROVED`, `LOCKED` |
| `LOCKED` | `LOCKED`, `CLOSED` |
| `CLOSED` | `CLOSED` |

Invalid transition → `409 INVALID_STATUS_TRANSITION`.  
Structural fields (`sourceModelId`, `sourceModelVersionId`, `planningType`, `financialYear`, `baseScenarioId`) cannot change when status is `APPROVED`, `LOCKED`, or `CLOSED` → `409 CYCLE_IMMUTABLE`.

Returned by `GET /sources` as `planningStatuses`.

---

## 3. Endpoints

### 3.1 List cycles — `GET /model-planning/cycles`

Query params (all optional): `modelId`, `planningType`, `status`, `ownerId`.

**Response**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "cl...",
        "cycle_name": "FY2026 Annual Budget",
        "financialYear": 2026,
        "planningType": "ANNUAL_BUDGET",
        "sourceModelId": "cmr...",
        "sourceModelVersionId": "cmr...",
        "actualsCutoffPeriod": "2025-12-31",
        "forecastStartPeriod": "2026-01-01",
        "planningHorizon": 12,
        "baseScenarioId": "cmr...",
        "submissionDeadline": "2026-02-28",
        "approvalWorkflowId": null,
        "planningOwnerId": "usr...",
        "status": "DRAFT",
        "createdById": "usr...",
        "createdAt": "2026-07-14T...",
        "updatedAt": "2026-07-14T..."
      }
    ],
    "total": 1,
    "count": 1
  }
}
```

### 3.2 Selection sources (create form) — `GET /model-planning/cycles/sources`

Optional `?modelId=` to scope versions/scenarios to one model.

**Response**
```json
{
  "success": true,
  "data": {
    "planningTypes": ["ANNUAL_BUDGET", "ROLLING_FORECAST", "QUARTERLY_FORECAST", "LONG_RANGE_PLAN", "STRATEGIC_PLAN", "REFORECAST"],
    "planningStatuses": ["DRAFT", "OPEN", "IN_REVIEW", "APPROVED", "LOCKED", "CLOSED"],
    "models":   [{ "id": "cmr...", "name": "FY2026 Financial Model", "code": "FY26" }],
    "versions": [{ "id": "cmr...", "modelId": "cmr...", "name": "v1 Published", "status": "LOCKED", "publishedAt": "...", "createdAt": "..." }],
    "scenarios":[{ "id": "cmr...", "modelId": "cmr...", "name": "Budget", "type": "BASE" }]
  }
}
```
> **`versions` includes published (LOCKED) versions only** — the versions eligible as `sourceModelVersionId`.

### 3.3 Create cycle — `POST /model-planning/cycles`

**Request body**
```json
{
  "name": "FY2026 Annual Budget",
  "financialYear": 2026,
  "planningType": "ANNUAL_BUDGET",
  "sourceModelId": "cmr...",
  "sourceModelVersionId": "cmr...",
  "actualsCutoffPeriod": "2025-12-31",
  "forecastStartPeriod": "2026-01-01",
  "planningHorizon": 12,
  "baseScenarioId": "cmr...",
  "submissionDeadline": "2026-02-28",
  "approvalWorkflowId": null,
  "planningOwnerId": "usr..."
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✅ | Cycle name |
| `financialYear` | int | ✅ | e.g. 2026 |
| `planningType` | enum | ✅ | one of §2 |
| `sourceModelId` | string | ✅ | a published `PlanningModel` |
| `sourceModelVersionId` | string | ✅ | must belong to `sourceModelId` and have **`status: LOCKED`** (published) |
| `actualsCutoffPeriod` | date | — | `YYYY-MM-DD` |
| `forecastStartPeriod` | date | — | `YYYY-MM-DD` |
| `planningHorizon` | int | — | number of periods |
| `baseScenarioId` | string | — | scenario on the source model |
| `submissionDeadline` | date | — | `YYYY-MM-DD` |
| `approvalWorkflowId` | string | — | optional workflow |
| `planningOwnerId` | string | — | user id |

**Validation**
- `planningType` must be in the enum → `400 INVALID_PLANNING_TYPE`.
- `sourceModelVersionId` must belong to `sourceModelId` → `400 VERSION_MODEL_MISMATCH`.
- `sourceModelVersionId` must be **published** (`PlanningVersion.status === LOCKED`) → `400 SOURCE_VERSION_NOT_PUBLISHED`.
- `baseScenarioId` must belong to `sourceModelId` → `400 BASE_SCENARIO_INVALID`.
- Unknown model/version → `404 SOURCE_MODEL_NOT_FOUND` / `SOURCE_VERSION_NOT_FOUND`.

**Response** `201`
```json
{ "success": true, "data": { /* full cycle row, see §3.1 item */ } }
```

### 3.4 Get one — `GET /model-planning/cycles/:id`
```json
{ "success": true, "data": { /* full cycle row */ } }
```
`404 NOT_FOUND` if missing.

### 3.5 Workspace (open planning) — `GET /model-planning/cycles/:id/workspace`

Aggregates the cycle + its published source so the FE can open the Model Planning worksheet
directly. **The grid itself is the existing `GET /v1/fpa/models/{modelId}/grid`**. Pass
`grid.cycleId` as optional `cycleId` on the grid call to apply actuals cut-over and version/scenario defaults.

**Response**
```json
{
  "success": true,
  "data": {
    "cycle":   { /* full cycle row */ },
    "model":   { "id": "cmr...", "name": "...", "code": "..." },
    "version": { "id": "cmr...", "name": "...", "status": "LOCKED" },
    "scenarios": [ { "id": "cmr...", "name": "Budget", "type": "BASE" } ],
    "grid": {
      "modelId": "cmr...",
      "versionId": "cmr...",
      "baseScenarioId": "cmr...",
      "cycleId": "cmr..."
    }
  }
}
```
Frontend flow after create: `POST` → take `data.id` → `GET /model-planning/cycles/:id/workspace`
→ render `FpaWorksheet` against  
`GET /v1/fpa/models/{grid.modelId}/grid?versionId={grid.versionId}&scenarioId={grid.baseScenarioId}&cycleId={grid.cycleId}`.

**Grid `cycleId` resolution:** accepts either a **`ModelPlanningCycle`** id (this API) or a
**`PlanningBudgetCycle`** id (`/budget-cycles`). Model planning cycles do not apply budget-owner
department scoping; budget cycles still do.

### 3.6 Update — `PUT /model-planning/cycles/:id`
Body = any subset of the create fields plus `status`. Returns the updated full row.
`404 NOT_FOUND` if missing; validation codes as in create; status transition errors as in §2.

### 3.7 Delete — `DELETE /model-planning/cycles/:id`
Only `status === "DRAFT"` cycles may be deleted.
- `404 NOT_FOUND` if missing.
- `409 NOT_DELETABLE` if not DRAFT.
**Response** `200` `{ "success": true, "data": { "id": "...", "deleted": true } }`.

---

## 4. Error envelope

All errors share the shape used across `/api/v1/fpa`:
```json
{ "success": false, "code": "INVALID_PLANNING_TYPE", "message": "Invalid planning type. Allowed: ..." }
```
Possible `code`s: `NAME_REQUIRED`, `FINANCIAL_YEAR_REQUIRED`, `PLANNING_TYPE_REQUIRED`,
`INVALID_PLANNING_TYPE`, `SOURCE_MODEL_REQUIRED`, `SOURCE_VERSION_REQUIRED`,
`SOURCE_MODEL_NOT_FOUND`, `SOURCE_VERSION_NOT_FOUND`, `SOURCE_VERSION_NOT_PUBLISHED`,
`VERSION_MODEL_MISMATCH`, `BASE_SCENARIO_INVALID`, `INVALID_STATUS`, `INVALID_STATUS_TRANSITION`,
`CYCLE_IMMUTABLE`, `NOT_FOUND`, `NOT_DELETABLE`.

---

## 5. Audit

Create / update / delete write a `planning_audit_logs` row via `FpaAuditService`
(`actionType` = `MODEL_PLANNING_CYCLE_CREATE|UPDATE|DELETE`, `entityType` = `ModelPlanningCycle`).
Note: the audit row does **not** yet carry the planning-cycle id as a dedicated column (consistent
with the existing Model Planning audit gap noted in `fpa-model-planning-api-status.md`).

---

## 6. Migration / deploy

```bash
# dev (single DB from DATABASE_URL)
npm run db:migrate:model-planning-cycle

# all three DBs on VPS (nts, client1_db, demo_env)
npm run db:migrate:model-planning-cycle-all-dbs
```
Idempotent (skips if `model_planning_cycles` exists). Table DDL in
`scripts/run-model-planning-cycle-tables-migration.ts`.

> **Local dev note:** `prisma generate` cannot replace the engine binary while the dev server
> holds `node_modules/.prisma/client/query_engine-windows.dll.node`. Restart the server (or stop
> it) and re-run `npm run prisma:generate` once to finish the binary copy. The new model is already
> usable — the dmmf/types are regenerated; only the final engine-binary copy is deferred.

---

## 7. Source files

| Layer | File |
|-------|------|
| Model | `prisma/schema.prisma` → `model ModelPlanningCycle` (`@@map("model_planning_cycles")`) |
| Service | `src/services/fpa/FpaModelPlanningCycleService.ts` |
| Controller | `src/controllers/FpaController.ts` → `list/create/get/update/delete/workspace/sources` |
| Routes | `src/routes/fpaRoutes.ts` → `/model-planning/cycles/*` |
| Migration | `scripts/run-model-planning-cycle-tables-migration.ts` (+ `-all-dbs-vps.py`) |
| UAT | `npm run uat:fpa:model-planning-cycle` |
| Demo seed | `npm run db:seed:fpa-demo` → `modelPlanningCycleIds` in summary JSON |
