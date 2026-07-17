# FP&A cross-tab backend contracts

**Date:** 2026-07-17  
**Status:** Implemented  
**Migration:** `npm run db:migrate:fpa-cross-tab-gaps`

## Model Planning lifecycle and collaboration

MPC-native routes are under:

`/api/v1/fpa/model-planning/cycles/{cycleId}`

- `POST /submit`
- `POST /review/accept`
- `POST /review/return`
- `POST /cfo-approve`
- `POST /cfo-return`
- `POST /lock`
- `POST /request-reopen`
- `GET|POST /tasks`
- `GET|POST /comments`
- `GET /activity`

Task decisions remain:

- `POST /api/v1/fpa/tasks/{taskId}/approve`
- `POST /api/v1/fpa/tasks/{taskId}/return`

Contract details:

- `CYCLE_NOT_READY` is `409` with `data.blockers[]`.
- Review return validates an optional `taskId` against the MPC and returns `404 TASK_NOT_FOUND`.
- Maker-checker conflicts return `409 MAKER_CHECKER`.
- Locked MPC writes return `423 LOCKED_VERSION`.
- Task return requires `comment` (`400 COMMENT_REQUIRED`).
- Comments support persisted `parentCommentId`.
- Task/comment/activity records include stable ids, cycle identity, status/type, actors, and timestamps.

## Persisted settings

```http
GET /api/v1/fpa/settings
PUT /api/v1/fpa/settings
POST /api/v1/fpa/settings/sync-sources/{sourceId}/connect
POST /api/v1/fpa/settings/sync-sources/{sourceId}/disconnect
POST /api/v1/fpa/settings/sync-sources/{sourceId}/sync
```

Settings persist in `fpa_settings`; connector state persists in `fpa_sync_sources`.

The bundled NetSuite source supports persisted connect/disconnect state. Server-side import is not configured, so `sync` returns an honest `502 SYNC_FAILED` and persists `status: ERROR` plus `lastError`.

New MPC cycles use `variance.commentaryThresholdPct` as their default `materialVariancePct`.

## Forecast entities

Canonical:

```http
GET|POST /api/v1/forecast-entities
GET /api/v1/forecast-entities/{id}
GET /api/v1/forecast-entities/{id}/chart-of-accounts
DELETE /api/v1/forecast-entities/{id}
```

The older `/api/forecast-entities` prefix remains as a compatibility alias.

Archive body:

```json
{ "archive": true, "reason": "Entity merged into Group" }
```

Referenced/default entities return `409 ENTITY_IN_USE` with `data.references[]`. Destructive delete is not supported.

## Domain scopes and sensitivity

```http
GET /api/v1/fpa/domain/{category}
  ?modelId=&versionId=&scenarioId=&entityId=&periodFrom=&periodTo=

POST /api/v1/fpa/domain/{category}/sensitivity
```

Read responses include:

- `scope` — applied model/version/scenario/entity/period range
- `availableFilters.entities[]`
- `availableFilters.periods[]`

Sensitivity validates persisted driver codes, evaluates formula dependants in memory, and returns:

```json
{
  "base": {},
  "preview": {},
  "persisted": false
}
```

No planning cells or drivers are changed by sensitivity preview.

## Export capability discovery

```http
GET /api/v1/fpa/exports/capabilities
```

All four shipped generators are enabled:

- `BOARD_PACK`
- `MANAGEMENT_REPORT`
- `FINANCIAL_STATEMENTS`
- `DEPT_EXPENSES`

Unknown types return `400 UNSUPPORTED_EXPORT_TYPE`; incomplete downloads return `409 EXPORT_NOT_READY`.

## Apply Growth compatibility

Preferred:

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

The legacy singular fields remain accepted:

- `lineItemId`
- `fromPeriodDate`
- `ratePct`

Preferred `periodFrom` is the first updated period; the latest prior period is the base. The response returns `updatedCells`, `lineItemIds`, and the applied range. Locked MPCs return `423 LOCKED_VERSION`.

## UAT

```bash
npm run uat:fpa:model-planning-workflow
npm run uat:fpa:cross-tab-gaps
```

Both scripts refuse non-`nts` databases by default.
