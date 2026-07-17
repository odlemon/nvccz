# FP&A cross-tab frontend handoff

**Date:** 2026-07-17  
**Backend status:** Ready on DEV `nts`  
**API base:** `/api/v1`

All JSON endpoints use:

```json
{ "success": true, "data": {}, "message": null }
```

Errors use:

```json
{ "success": false, "code": "ERROR_CODE", "message": "Readable message", "data": {} }
```

Do not fall back to demo data or client-side financial calculations when data is empty.

## 1. Model Planning lifecycle

Use MPC routes only; never pass an MPC id to `/fpa/budget-cycles`.

```http
POST /fpa/model-planning/cycles/{cycleId}/submit
POST /fpa/model-planning/cycles/{cycleId}/review/accept
POST /fpa/model-planning/cycles/{cycleId}/review/return
POST /fpa/model-planning/cycles/{cycleId}/cfo-approve
POST /fpa/model-planning/cycles/{cycleId}/cfo-return
POST /fpa/model-planning/cycles/{cycleId}/lock
POST /fpa/model-planning/cycles/{cycleId}/request-reopen
```

Important responses:

- Submit not ready: `409 CYCLE_NOT_READY`, inspect `data.blockers[]`.
- Maker-checker: `409 MAKER_CHECKER`.
- Invalid transition: `409 INVALID_STATUS`.
- Cell write after lock: `423 LOCKED_VERSION`.
- Refresh cycle GET after every successful transition; use returned `status`, `currentStage`, and timestamps.

Review return accepts:

```json
{
  "departmentId": "dept_123",
  "taskId": "task_123",
  "comment": "Revise Q3 headcount"
}
```

`comment` is required. `taskId` targets exactly that owner slice.

## 2. MPC collaboration

```http
GET|POST /fpa/model-planning/cycles/{cycleId}/tasks
GET|POST /fpa/model-planning/cycles/{cycleId}/comments
GET      /fpa/model-planning/cycles/{cycleId}/activity
POST     /fpa/tasks/{taskId}/approve
POST     /fpa/tasks/{taskId}/return
```

Threaded comment:

```json
{ "body": "Headcount updated", "parentCommentId": null }
```

Task return:

```json
{ "comment": "Please attach the approved requisitions" }
```

Blank return comments produce `400 COMMENT_REQUIRED`. Persist and render records by their stable `id`; do not merge them with local mock records.

## 3. Settings

```http
GET /fpa/settings
PUT /fpa/settings
POST /fpa/settings/sync-sources/{sourceId}/connect
POST /fpa/settings/sync-sources/{sourceId}/disconnect
POST /fpa/settings/sync-sources/{sourceId}/sync
```

PUT may send the complete `variance` and `workflow` sections returned by GET.

Update the UI only after a successful response. NetSuite connect/disconnect state is persisted, but server-side NetSuite import is not configured: sync currently returns `502 SYNC_FAILED` with the updated failed source in `data.source`.

## 4. Forecast entities

Canonical FP&A client routes:

```http
GET    /forecast-entities
POST   /forecast-entities
GET    /forecast-entities/{entityId}
GET    /forecast-entities/{entityId}/chart-of-accounts
DELETE /forecast-entities/{entityId}
```

Because the API base is `/api/v1`, the resolved URL is `/api/v1/forecast-entities`.

Archive:

```json
{ "archive": true, "reason": "Entity merged into Group" }
```

On success, remove the entity from the active list. `409 ENTITY_IN_USE` includes `data.references[]`; show these references rather than a generic error.

## 5. Domain filters

```http
GET /fpa/domain/{workforce|revenue|expense|cash}
  ?modelId=
  &versionId=
  &scenarioId=
  &entityId=
  &periodFrom=YYYY-MM-DD
  &periodTo=YYYY-MM-DD
```

Use `data.scope` as the applied server scope and populate selectors from:

```json
{
  "availableFilters": {
    "entities": [{ "id": "ent_123", "name": "Group" }],
    "periods": ["2026-01-01"]
  }
}
```

Do not reuse data from the previously selected entity while a scoped request is loading.

## 6. Domain sensitivity

```http
POST /fpa/domain/{workforce|revenue|expense|cash}/sensitivity
```

```json
{
  "modelId": "mdl_123",
  "versionId": "ver_123",
  "scenarioId": "scn_123",
  "entityId": "ent_123",
  "periodFrom": "2026-01-01",
  "periodTo": "2026-12-01",
  "overrides": [{ "driverCode": "COLLECTION_DAYS", "value": 45 }]
}
```

Render official values from `data.base` and what-if values from `data.preview`. The response always has `persisted: false`; do not update official stores or show a saved-success toast.

Errors:

- `400 UNKNOWN_DRIVER`
- `400 INVALID_PERIOD_RANGE`
- `404 NOT_FOUND`

## 7. Export capabilities

```http
GET /fpa/exports/capabilities
```

Build or enable report cards from `data.exportTypes[]`. Do not hardcode availability.

Generation remains:

```http
POST /fpa/exports/board-pack
```

Supported codes:

- `BOARD_PACK`
- `MANAGEMENT_REPORT`
- `FINANCIAL_STATEMENTS`
- `DEPT_EXPENSES`

Errors:

- `400 UNSUPPORTED_EXPORT_TYPE`
- `409 EXPORT_NOT_READY`

Download ready jobs through the authenticated `/fpa/exports/{id}/download` endpoint.

## 8. Apply Growth

Preferred request:

```http
POST /fpa/models/{modelId}/cells/apply-growth
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

Use `data.updatedCells` to refresh the grid. The server applies growth independently per dimensional coordinate. The legacy `lineItemId`, `fromPeriodDate`, and `ratePct` fields remain accepted during migration.

Errors:

- `400 LINE_ITEM_REQUIRED`
- `400 INVALID_PERIOD_RANGE`
- `409 CELL_NOT_EDITABLE`
- `423 LOCKED_VERSION`

## Acceptance checklist

- [ ] No MPC request uses `/budget-cycles/{mpcId}`.
- [ ] Workflow refreshes from the returned/GET cycle state.
- [ ] Tasks, comments, and activity survive refresh.
- [ ] Settings only change after successful responses.
- [ ] Archived entities disappear after reloading the active list.
- [ ] Entity and period changes issue new scoped domain requests.
- [ ] Sensitivity renders only server-returned preview values.
- [ ] Export cards derive availability from capabilities.
- [ ] Apply Growth sends the preferred multi-row/range body.
- [ ] `423 LOCKED_VERSION` leaves the grid unchanged.

## Related backend references

- `docs/fpa-cross-tab-gaps-api.md`
- `docs/fpa-model-planning-workflow-api.md`
- `docs/fpa-model-planning-tasks-api.md`
- `docs/fpa-domain-tabs-api.md`
- `docs/fpa-exports-api.md`
