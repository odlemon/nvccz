# FP&A Model Planning — Stage 4 (Scenarios + Assumptions)

**Date:** 2026-07-16  
**Status:** Implemented  
**Related:** [fpa-model-planning-stage3-api.md](./fpa-model-planning-stage3-api.md)

---

## 1. Enriched multi-scenario compare

```http
POST /api/v1/fpa/scenarios/{anchorScenarioId}/compare
```

```json
{
  "versionId": "ver_…",
  "scenarioIds": ["scn_base", "scn_best", "scn_down"],
  "anchorScenarioId": "scn_base",
  "includeAssumptions": true,
  "includeWaterfall": true,
  "includeSensitivity": true
}
```

Response includes `scenarios[]`, `metrics[]` (values + varianceAbs/Pct vs anchor), `assumptions[]`, `waterfall`, `sensitivity` (empty for now). Legacy `left` / `right` / `rows` still present for older FE.

| Error | When |
|-------|------|
| 400 | `<2` scenarios or missing `versionId` |
| 404 | Unknown scenario / version |

---

## 2. Fast copy-from-Base

```http
POST /api/v1/fpa/scenarios/{baseScenarioId}/copy
```

```json
{
  "versionId": "ver_…",
  "name": "Best Case",
  "scenarioType": "UPSIDE",
  "inheritFromSource": true
}
```

- Sets `parentScenarioId` when `inheritFromSource !== false`
- Copies **drivers + cells** via MySQL `INSERT…SELECT` (no per-row Node loop)
- Returns `{ scenario, cellsCopied, driversCopied }` with inheritance fields

---

## 3. Inheritance metadata

On list/create/copy/promote/update scenario objects:

| Field | Notes |
|-------|--------|
| `parentScenarioId` | null for root |
| `inheritsFromScenarioId` | alias of parent |
| `parentScenarioName` | display |

Also: `PUT/PATCH /scenarios/{id}`, `POST /scenarios/{id}/archive`.

---

## 4. Assumptions library (drivers)

| Method | Path |
|--------|------|
| GET | `/models/{id}/drivers?versionId=&scenarioId=` — **filters both when provided** |
| POST | `/models/{id}/drivers` — requires `code`, `name`, `scenarioId`, `versionId` |
| PUT | `/drivers/{id}` — value/period + optional `confidence`, `spreadingMethod`; returns `updatedCells` |
| DELETE | `/drivers/{id}` — 409 if referenced by formulas/cells |

| Field | Values |
|-------|--------|
| `confidence` | `HIGH` \| `MEDIUM` \| `LOW` |
| `spreadingMethod` | `EVEN` \| `SEASONAL` \| `PRIOR_YEAR` \| `MANUAL` \| … |

Archived versions → `403 LOCKED_VERSION`. Locked published versions stay editable for planning assumptions.

---

## Migration

```bash
npm run db:migrate:fpa-scenario-stage4
```

Adds `planning_scenarios.parent_scenario_id`, `planning_drivers.confidence`, `planning_drivers.spreading_method`.

## UAT

```bash
# clear any shell DATABASE_URL first — DEV nts only
npm run uat:fpa:model-planning-stage4
```
