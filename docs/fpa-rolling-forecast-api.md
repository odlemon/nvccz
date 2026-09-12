# FP&A Rolling forecast API

**Date:** 2026-07-16  
**Status:** Implemented  
**Migrate:** `npm run db:migrate:fpa-rolling-forecast`

## Summary

```http
GET /api/v1/fpa/models/{modelId}/rolling-forecast?versionId=&scenarioId=&cycleId=
```

Returns `actualsCutoff`, `forecastStart`, `horizonMonths`, `activeMethod`, `kpis`, `trend[]`, `methods[]`.

## Mutators

```http
PUT /api/v1/fpa/models/{modelId}/rolling-forecast/cutoff
PUT /api/v1/fpa/models/{modelId}/rolling-forecast/method
POST /api/v1/fpa/models/{modelId}/rolling-forecast/roll-forward
```

When `cycleId` is provided, cutoff/horizon also update the Model Planning cycle.

Persist settings in `fpa_rolling_forecast_settings` (per model + optional version).

Sync actuals remains:

```http 
POST /api/v1/fpa/actuals/sync
```

| Code | When |
|------|------|
| `LOCKED_VERSION` | Version locked |
| `INVALID_CUTOFF` | Bad cutoff/horizon |
| 403 | No edit permission |

**UAT:** `npm run uat:fpa:rolling-forecast`
