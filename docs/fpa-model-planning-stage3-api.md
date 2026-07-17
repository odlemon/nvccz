# FP&A Model Planning — Stage 3 (Enter drivers and plan)

**Date:** 2026-07-16  
**Status:** Implemented  
**Related:** [fpa-model-planning-cycle-api.md](./fpa-model-planning-cycle-api.md), [fpa-model-planning-owners-api.md](./fpa-model-planning-owners-api.md)

Stage 3 product rules:

- Users edit **INPUT** / authorised drivers only; CALCULATED comes from server formulas.
- After any authorised write, server recalculates dependents and returns them (or FE reloads grid).
- Driver Assumptions shows **prior actual vs plan vs change**.
- Spread supports phasing beyond EVEN.
- Planning summary KPIs are always read live from committed cells.

---

## 1. Drivers with prior actual

```http
GET /api/v1/fpa/models/{modelId}/drivers?versionId=&scenarioId=&cycleId=
```

Each driver includes:

| Field | Type | Notes |
|-------|------|-------|
| `value` | `number` | Plan value |
| `priorActual` | `number \| null` | Preferred prior actual |
| `priorValue` | `number \| null` | Alias of `priorActual` (FE accepts either) |
| `priorPeriodLabel` | `string \| null` | e.g. `FY2025 Actual` |

Resolution order for `priorActual` (average over matching periods):

1. `planning_actuals_snapshots` for same line code in prior FY  
2. Cells with `sourceType=ACTUAL` in prior FY  
3. Any cells for same line code in prior FY  
4. Prior-FY driver rows with same code  
5. Cells with `periodDate <= cycle.actualsCutoffPeriod` (when `cycleId` provided)

```json
{
  "success": true,
  "data": [
    {
      "id": "drv_…",
      "code": "PRICE",
      "name": "Average Price",
      "value": 12.5,
      "unit": "USD",
      "priorActual": 11.8,
      "priorValue": 11.8,
      "priorPeriodLabel": "FY2025 Actual"
    }
  ]
}
```

### Driver update + dependents

```http
PUT /api/v1/fpa/drivers/{driverId}
```

```json
{
  "success": true,
  "data": {
    "id": "drv_…",
    "value": 13,
    "priorActual": 11.8,
    "priorValue": 11.8,
    "updatedCells": [
      { "id": "cell_…", "lineItemId": "…", "value": 5000, "cellStatus": "CALCULATED" }
    ]
  }
}
```

FE may still `GET …/grid` after driver save; `updatedCells` is preferred for merge.

---

## 2. Spread methods

```http
POST /api/v1/fpa/models/{modelId}/cells/spread
```

```json
{
  "versionId": "ver_…",
  "scenarioId": "scn_…",
  "lineItemId": "li_…",
  "value": 1200000,
  "method": "EVEN",
  "cycleId": "mpc_…",
  "weights": [0.05, 0.05, 0.08, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.08, 0.07, 0.07],
  "periodDates": ["2026-01-01", "2026-02-01"]
}
```

| `method` | Behaviour |
|----------|-----------|
| `EVEN` (default) | Equal split |
| `CUSTOM_WEIGHT` | `weights[]` length = periods; sum ≈ 1 |
| `PRIOR_YEAR_PATTERN` / `HISTORICAL_PATTERN` | Shape from prior-year same months |
| `WORKING_DAYS` / `SEASONAL_PROFILE` | Reserved → `UNSUPPORTED_SPREAD_METHOD` |

Spread uses a **batched** path (auth once, parallel cell writes, dependents recalculated once per period) — not N× full `cells/update`.

Response:

```json
{
  "success": true,
  "data": {
    "spreadAcross": 12,
    "method": "CUSTOM_WEIGHT",
    "cells": [/* per-period updateCell results */],
    "updatedCells": [/* INPUT + dependent CALCULATED, unique by id */]
  }
}
```

| Code | When |
|------|------|
| `INVALID_WEIGHTS` | weights length ≠ periods or sum invalid |
| `UNSUPPORTED_SPREAD_METHOD` | Unknown / not-yet-implemented method |
| `CELL_NOT_EDITABLE` / `ACTUAL_PERIOD_LOCKED` | Same as other cell writes |

---

## 3. Cell tools — dependents contract

These endpoints return `updatedCells` (INPUT write + dependent CALCULATED):

| Endpoint | Notes |
|----------|--------|
| `POST …/cells/update` | Primary cell + `updatedCells` |
| `POST …/cells/spread` | `cells` + flattened `updatedCells` |
| `POST …/cells/copy-forward` | same |
| `POST …/cells/apply-growth` | same |
| `POST …/cells/bulk-operation` | same |
| `PUT …/drivers/{id}` | `{ …driver, updatedCells }` |

Optional explicit recalc:

```http
POST /api/v1/fpa/models/{modelId}/recalculate
```

```json
{ "versionId": "ver_…", "scenarioId": "scn_…", "cycleId": "mpc_…" }
```

---

## 4. Planning summary (live KPIs)

```http
GET /api/v1/fpa/models/{modelId}/planning-summary?versionId=&scenarioId=&cycleId=
```

Always sums committed `planning_cells` (no cycle-open cache).

```json
{
  "success": true,
  "data": {
    "modelId": "…",
    "versionId": "…",
    "scenarioId": "…",
    "asOf": "2026-07-16T18:00:00.000Z",
    "materialVariancePct": 5,
    "revenue": 1200000,
    "grossMargin": 480000,
    "grossMarginPct": 40,
    "ebitda": 210000,
    "variance": { "amount": 50000, "pct": 4.3, "priorRevenue": 1150000, "label": "vs prior year" },
    "trend": { "periods": ["2026-01-01"], "revenue": [100000], "ebitda": [20000], "grossMargin": [40000] },
    "kpis": { "revenue": 1200000, "grossMargin": 480000, "grossMarginPct": 40, "ebitda": 210000 }
  }
}
```

Line-code preference: `REVENUE` → `NET_REVENUE` → `GROSS_REVENUE`; margin `GROSS_MARGIN` → `GROSS_PROFIT`; `EBITDA`.

---

## 5. Material variance threshold

On Model Planning cycle create / get / update:

```json
{ "materialVariancePct": 5 }
```

- Default **5**  
- Column: `model_planning_cycles.material_variance_pct`  
- Migration: `npm run db:migrate:model-planning-material-variance`  
- Variance calc uses cycle threshold when `cycleId` is passed (`commentaryRequired` when `|variancePct| >= threshold`)

---

## Acceptance checklist

- [ ] Driver Assumptions Actual column populated when prior history exists  
- [ ] Change % updates when Plan / driver value edits  
- [ ] Spread `EVEN` still works; `CUSTOM_WEIGHT` / `PRIOR_YEAR_PATTERN` accepted  
- [ ] Cell/driver writes return dependents in `updatedCells`  
- [ ] `GET …/planning-summary` updates after INPUT edit without full page reload  
- [ ] Cycle exposes `materialVariancePct`

## UAT

```bash
npm run db:migrate:model-planning-material-variance
npm run uat:fpa:model-planning-cycle
```

Demo: `admin@nts.com` / `admin123`; owner `ada.owner@nts.com` / `OwnerDemo123!`.
