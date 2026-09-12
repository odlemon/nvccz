# FP&A Model Planning — Actuals cut-off / Forecast start (SRD §31)

**Date:** 2026-07-16  
**Status:** Implemented  
**Related:** [fpa-model-planning-cycle-api.md](./fpa-model-planning-cycle-api.md), [fpa-model-planning-api-status.md](./fpa-model-planning-api-status.md)

## Product rule

```
If Period <= Actuals Cut-Off → Actual (read-only in Planning)
If Period > Actuals Cut-Off  → Forecast / plan (INPUT editable; CALCULATED still read-only)
```

Period grain is **monthly**. Cutoff and forecast start are stored and returned as **period-start** ISO dates (`YYYY-MM-01`). A day like `2026-07-15` is normalized to `2026-07-01`.

## 1. Cycle create / get / list / workspace

Fields (always ISO period-start or `null`):

| Field | Meaning |
|-------|---------|
| `actualsCutoffPeriod` | Last Actual month (inclusive) |
| `forecastStartPeriod` | First Forecast month |

**Create / update behaviour**

- Values from the create modal round-trip on `GET` / list / workspace.
- If only `actualsCutoffPeriod` is sent, BE sets `forecastStartPeriod = cutoff + 1 month`.
- Responses also include `cycle_name` (alias of `name`) for FE header mapping.

**Workspace** (`GET /model-planning/cycles/{id}/workspace`) top-level + `grid`:

```json
{
  "actualsCutoffPeriod": "2026-07-01",
  "forecastStartPeriod": "2026-08-01",
  "grid": {
    "modelId": "…",
    "versionId": "…",
    "baseScenarioId": "…",
    "cycleId": "…",
    "actualCutoff": "2026-07-01",
    "forecastStartPeriod": "2026-08-01"
  }
}
```

## 2. Grid cut-over when `cycleId` is passed

```http
GET /v1/fpa/models/{modelId}/grid?cycleId={planningCycleId}&versionId=&scenarioId=
```

`cycleId` may be a **Model Planning** cycle **or** a budget cycle. Cutoff is taken from the cycle when present.

**Response extras**

```json
{
  "actualCutoff": "2026-07-01",
  "forecastStartPeriod": "2026-08-01",
  "periods": [
    {
      "periodDate": "2026-07-01",
      "key": "2026-07",
      "label": "Jul 2026",
      "periodRole": "ACTUAL",
      "readOnly": true
    },
    {
      "periodDate": "2026-08-01",
      "key": "2026-08",
      "label": "Aug 2026",
      "periodRole": "FORECAST",
      "readOnly": false
    }
  ],
  "cells": [
    {
      "periodDate": "2026-07-01",
      "periodRole": "ACTUAL",
      "cellStatus": "ACTUAL",
      "isEditable": false,
      "readOnly": true
    }
  ]
}
```

| Field | Behaviour |
|-------|-----------|
| `actualCutoff` | Cycle cut-over (month start) when `cycleId` present |
| `forecastStartPeriod` | First forecast period |
| `periods[].periodRole` | `ACTUAL` or `FORECAST` |
| `periods[].readOnly` | `true` for Actual periods |
| Cell flags | Actual periods: `isEditable: false`; INPUT/OVERRIDE → `cellStatus: "ACTUAL"` |

## 3. Write guard

`PUT`/`PATCH` (and bulk/spread via `updateCell`) for periods on/before the cutoff:

```json
{
  "success": false,
  "code": "ACTUAL_PERIOD_LOCKED",
  "message": "Cannot edit values in actual periods (on or before actuals cutoff)."
}
```

Status **403**. Checked **before** locked-version / cell-status guards when a period falls on/before cutoff (cycle cutoff when `cycleId` is passed; otherwise model actuals-fallback cutoff).

## 4. Verify

```bash
npm run uat:fpa:model-planning-cycle
```

Checks: cutoff round-trip + auto forecast start, grid banding with `cycleId`, `ACTUAL_PERIOD_LOCKED` on July write.

## 5. Source files

| Layer | File |
|-------|------|
| Cycle dates / workspace | `src/services/fpa/FpaModelPlanningCycleService.ts` |
| Cycle resolve + date helpers | `src/services/fpa/FpaPlanningCycleContextService.ts` |
| Grid banding + write lock | `src/services/fpa/FpaGridService.ts` |
| UAT | `scripts/uat-fpa-model-planning-cycle-http.ts` |
