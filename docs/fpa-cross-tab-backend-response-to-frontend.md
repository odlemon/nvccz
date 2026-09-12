# FP&A cross-tab gaps — backend response to Frontend

**Frontend request date:** 2026-07-17  
**Backend delivery date:** 2026-07-17  
**Environment verified:** DEV `nts`  
**Status:** Delivered

This document is the backend response to the frontend audit titled **“FP&A cross-tab backend gaps.”** It covers only the contracts requested in that audit.

API responses use:

```json
{ "success": true, "data": {} }
```

Errors use:

```json
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "Readable message",
  "data": {}
}
```

## Delivery summary

| Frontend ask | Backend result |
|---|---|
| Complete MPC lifecycle | Delivered |
| MPC-native tasks/comments/activity | Delivered |
| Persisted FP&A settings | Delivered |
| Connector actions | Delivered; NetSuite import reports honest `SYNC_FAILED` until configured |
| Canonical forecast-entity archive | Delivered |
| Domain entity and period filters | Delivered |
| Server-calculated sensitivity preview | Delivered, non-persisted |
| Export capability discovery | Delivered |
| Apply Growth contract reconciliation | Delivered; preferred and legacy bodies accepted |

---

## P0 — Model Planning Cycle lifecycle

### Delivered endpoints

```http
POST /api/v1/fpa/model-planning/cycles/{cycleId}/submit
POST /api/v1/fpa/model-planning/cycles/{cycleId}/review/accept
POST /api/v1/fpa/model-planning/cycles/{cycleId}/review/return
POST /api/v1/fpa/model-planning/cycles/{cycleId}/cfo-approve
POST /api/v1/fpa/model-planning/cycles/{cycleId}/cfo-return
POST /api/v1/fpa/model-planning/cycles/{cycleId}/lock
POST /api/v1/fpa/model-planning/cycles/{cycleId}/request-reopen
```

### Submit

Request:

```json
{ "note": "All owner slices ready" }
```

Successful response includes:

```json
{
  "success": true,
  "data": {
    "id": "mpc_123",
    "status": "SUBMITTED",
    "currentStage": "FPA_REVIEW",
    "submittedAt": "2026-07-17T00:00:00.000Z"
  }
}
```

If owner slices remain open:

```json
{
  "success": false,
  "code": "CYCLE_NOT_READY",
  "message": "2 owner slice(s) still open",
  "data": {
    "blockers": [
      {
        "type": "OWNER_SLICE",
        "ownerId": "owner_123",
        "departmentId": "dept_123",
        "taskId": "task_123",
        "status": "OPEN"
      }
    ]
  }
}
```

### Review return

```json
{
  "departmentId": "dept_123",
  "taskId": "task_123",
  "comment": "Revise Q3 headcount"
}
```

`taskId` now targets the requested owner slice. Invalid or mismatched task targets return `404 TASK_NOT_FOUND`. A return:

- changes the owner and task to `RETURNED`;
- moves the MPC and planning workflow to `OWNER_INPUT`;
- stores the feedback comment against the returned task;
- synchronizes the mirrored PM task.

### CFO and lock

- Maker-checker violation: `409 MAKER_CHECKER`.
- Invalid transition: `409 INVALID_STATUS`.
- Cycle lock and source-version lock are applied atomically.
- Cell writes after approval/lock return `423 LOCKED_VERSION`.
- Reopen restores the source version to editable `DRAFT`.

### Cycle reads

Both cycle list and cycle detail expose:

```json
{
  "status": "UNDER_REVIEW",
  "currentStage": "FPA_REVIEW",
  "submittedAt": "2026-07-17T00:00:00.000Z",
  "submittedById": "usr_123",
  "approvedAt": null,
  "approvedById": null,
  "lockedAt": null,
  "lockedById": null
}
```

Frontend must continue using MPC routes and must not send an MPC id to `/budget-cycles`.

---

## P0 — MPC-native collaboration

### Delivered endpoints

```http
GET  /api/v1/fpa/model-planning/cycles/{cycleId}/tasks
POST /api/v1/fpa/model-planning/cycles/{cycleId}/tasks
GET  /api/v1/fpa/model-planning/cycles/{cycleId}/comments
POST /api/v1/fpa/model-planning/cycles/{cycleId}/comments
GET  /api/v1/fpa/model-planning/cycles/{cycleId}/activity
POST /api/v1/fpa/tasks/{taskId}/approve
POST /api/v1/fpa/tasks/{taskId}/return
```

Delivered behavior:

- Tasks include stable `id`, `cycleId`, status, assignee, department, type, and timestamps.
- Comments include stable `id`, `cycleId`, author, status/type, timestamps, and `parentCommentId`.
- Activity includes stable `id`, `cycleId`, actor, action/type/status, target, comment, and timestamp.
- Task approve/return validates the current status.
- Task return requires feedback and returns `400 COMMENT_REQUIRED` when blank.
- MPC owner rows and PM task mirrors are synchronized after decisions.
- Threaded comments survive refresh.

Comment request:

```json
{
  "body": "Headcount updated",
  "parentCommentId": null
}
```

---

## P1 — Persisted Settings and connector actions

### Delivered endpoints

```http
GET  /api/v1/fpa/settings
PUT  /api/v1/fpa/settings
POST /api/v1/fpa/settings/sync-sources/{sourceId}/connect
POST /api/v1/fpa/settings/sync-sources/{sourceId}/disconnect
POST /api/v1/fpa/settings/sync-sources/{sourceId}/sync
```

Persisted response:

```json
{
  "variance": {
    "commentaryThresholdPct": 5,
    "enforceCommentary": true,
    "blockSubmitWithoutCommentary": false
  },
  "workflow": {
    "path": "LINEAR",
    "requireCfoSignature": true,
    "allowRerunAfterReturn": true
  },
  "syncSources": [
    {
      "id": "netsuite",
      "label": "NetSuite",
      "status": "DISCONNECTED",
      "lastSyncAt": null,
      "lastError": null
    }
  ]
}
```

Settings persist across reloads. New MPCs use the configured commentary threshold as their default material-variance threshold.

Connector note: connect/disconnect state is persisted. The external NetSuite importer is not configured in this backend, so sync returns:

```json
{
  "success": false,
  "code": "SYNC_FAILED",
  "message": "Connector is not configured for server-side sync",
  "data": {
    "source": {
      "id": "netsuite",
      "status": "ERROR",
      "lastSyncAt": null,
      "lastError": "Connector is not configured for server-side sync"
    }
  }
}
```

HTTP status is `502`. Frontend should update connector state from `data.source` and must not show a success toast.

---

## P1 — Forecast entity archive and canonical route

The frontend-requested route is confirmed:

```http
GET    /api/v1/forecast-entities
POST   /api/v1/forecast-entities
GET    /api/v1/forecast-entities/{entityId}
GET    /api/v1/forecast-entities/{entityId}/chart-of-accounts
DELETE /api/v1/forecast-entities/{entityId}
```

The older `/api/forecast-entities` route remains as a compatibility alias.

Archive request:

```json
{
  "archive": true,
  "reason": "Entity merged into Group"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "ent_123",
    "status": "ARCHIVED",
    "reason": "Entity merged into Group",
    "archivedAt": "2026-07-17T00:00:00.000Z"
  }
}
```

Archived entities disappear from the active list. Referenced or default entities return:

```json
{
  "success": false,
  "code": "ENTITY_IN_USE",
  "message": "Forecast entity is referenced and cannot be archived",
  "data": {
    "references": [
      { "type": "PLANNING_MODEL", "count": 1 }
    ]
  }
}
```

HTTP status is `409`. Destructive deletion is not supported.

---

## P1 — Domain filters and server-calculated what-if

### Scoped reads

```http
GET /api/v1/fpa/domain/{workforce|revenue|expense|cash}
  ?modelId={id}
  &versionId={id}
  &scenarioId={id}
  &entityId={id}
  &periodFrom=2026-01-01
  &periodTo=2026-12-01
```

Responses now include:

```json
{
  "scope": {
    "modelId": "mdl_123",
    "versionId": "ver_123",
    "scenarioId": "scn_123",
    "entityId": "ent_123",
    "periodFrom": "2026-01-01",
    "periodTo": "2026-12-01"
  },
  "availableFilters": {
    "entities": [{ "id": "ent_123", "name": "Group" }],
    "periods": ["2026-01-01", "2026-02-01"]
  }
}
```

Cell and actual datasets are filtered by exact entity and inclusive period range. Invalid ranges return `400 INVALID_PERIOD_RANGE`.

### Sensitivity preview

```http
POST /api/v1/fpa/domain/{workforce|revenue|expense|cash}/sensitivity
```

Request:

```json
{
  "modelId": "mdl_123",
  "versionId": "ver_123",
  "scenarioId": "scn_123",
  "entityId": "ent_123",
  "periodFrom": "2026-01-01",
  "periodTo": "2026-12-01",
  "overrides": [
    { "driverCode": "COLLECTION_DAYS", "value": 45 }
  ]
}
```

Response:

```json
{
  "success": true,
  "data": {
    "scope": {},
    "overrides": [
      { "driverCode": "COLLECTION_DAYS", "value": 45 }
    ],
    "base": {},
    "preview": {},
    "persisted": false
  }
}
```

The preview evaluates in memory and does not modify official drivers or cells. Unknown drivers return `400 UNKNOWN_DRIVER`.

---

## P1 — Export capability discovery

### Delivered endpoint

```http
GET /api/v1/fpa/exports/capabilities
```

Response:

```json
{
  "success": true,
  "data": {
    "exportTypes": [
      { "code": "BOARD_PACK", "enabled": true },
      { "code": "MANAGEMENT_REPORT", "enabled": true },
      { "code": "FINANCIAL_STATEMENTS", "enabled": true },
      { "code": "DEPT_EXPENSES", "enabled": true }
    ]
  }
}
```

All four generators are enabled. Unknown types return `400 UNSUPPORTED_EXPORT_TYPE`; downloads requested before completion return `409 EXPORT_NOT_READY`.

---

## P1 — Apply Growth contract

### Preferred request

```http
POST /api/v1/fpa/models/{modelId}/cells/apply-growth
```

```json
{
  "versionId": "ver_123",
  "scenarioId": "scn_123",
  "lineItemIds": ["li_123"],
  "periodFrom": "2026-04-01",
  "periodTo": "2026-12-01",
  "ratePercent": 3.5,
  "mode": "COMPOUND",
  "cycleId": "mpc_123"
}
```

The legacy request remains accepted:

```json
{
  "versionId": "ver_123",
  "scenarioId": "scn_123",
  "lineItemId": "li_123",
  "fromPeriodDate": "2026-03-01",
  "ratePct": 3.5,
  "mode": "COMPOUND"
}
```

Preferred-contract behavior:

- `periodFrom..periodTo` is inclusive.
- The latest valued period before `periodFrom` is the source.
- Growth is calculated independently per entity/department/cost-centre/account/currency coordinate.
- `FLAT` and `COMPOUND` are validated explicitly.
- The response contains `lineItemIds`, range, base values, `cells`, and `updatedCells`.
- Locked MPCs return `423 LOCKED_VERSION` without changing cells.

---

## Backend verification

Completed on DEV `nts`:

- MPC workflow UAT: **18/18 passed**
- Cross-tab UAT: **15/15 passed**
- Domain tabs UAT: **7/7 passed**
- Exports UAT: **5/5 passed**
- TypeScript check: passed
- Prisma schema validation/generation: passed

Schema migration `db:migrate:fpa-cross-tab-gaps` was applied to:

- `nts`
- `client1_db`
- `demo_env`

The migration was run a second time successfully to confirm idempotency.

## Backend reference documents

- `docs/fpa-cross-tab-gaps-api.md`
- `docs/fpa-model-planning-workflow-api.md`
- `docs/fpa-model-planning-tasks-api.md`
- `docs/fpa-domain-tabs-api.md`
- `docs/fpa-exports-api.md`
