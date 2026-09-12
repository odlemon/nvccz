# Backend ask — Model Planning live grid, CSV/Excel ingest, calendar/currency

**Date:** 2026-07-14  
**Audience:** Backend  
**FE status:** UI shipped on this branch. Waiting on BE for ingest + confirmation of PUT fields.

## Context

Three product gaps addressed on the frontend. Backend needs below so they work end-to-end against `http://31.220.82.129:3009/api`.

---

## 1. Model Planning — live published grid (FE done)

### What FE changed

- Model Planning route `/forecasting/models/{modelId}/worksheet` (no `cycleId`) always renders `FpaWorksheet`.
- Worksheet loads `GET /v1/fpa/models/{modelId}/grid` (and related validations) **without** requiring a budget `cycleId`.
- Hardcoded mock board (`$128.4M` PlanningWorkspaceBoard) is no longer used for this entry path.

### Backend confirm / fix if needed

| Check | Expected |
|-------|----------|
| Published model | `GET …/grid` returns `lineItems`, `periods`, and `cells` from the **published** version (not empty / not draft-only). |
| No cycleId | Grid works for Model Planning; `cycleId` remains optional for budget worksheet context. |
| Structure parity | Grid rows/columns match published Model Builder structure (modules / LIs / formulas). |

**Smoke (2026-07-14):** published FY2026 P&L `cmriumdfwef94e1434fe0d35b` → `GET …/grid` returns `lineItems=16`, `periods=24` (no `cycleId`). FE uses `lineItems` + `cells` — Mock board removed.

---

## 2. CSV / Excel ingest — **needs BE**

### What FE changed

- Detailed → Data Mapping: **Import CSV / Excel** opens upload dialog.
- Client calls multipart:

```http
POST /v1/fpa/models/{modelId}/data-mappings/import
Content-Type: multipart/form-data

file: <binary>
sourceSystem: "Custom / CSV" | "Excel"
moduleId: <optional>
```

### Please ship

| Item | Detail |
|------|--------|
| Endpoint | `POST /v1/fpa/models/{modelId}/data-mappings/import` |
| Auth | Same as other FP&A model routes |
| Input | Multipart: `file` (CSV or `.xlsx`/`.xls`), `sourceSystem` as above, optional `moduleId` |
| Behavior | Parse file → create/update source fields under that system → optional fuzzy mapping suggestions to line items (same spirit as seed-catalog) |
| Response | `{ success, data: { createdFields?, createdMappings?, rowsImported?, summary? }, message? }` |

Until this exists, FE shows a clear “ingest not available yet” message on 404; seed-catalog + manual mapping still work.

**Smoke (2026-07-14):** `POST …/data-mappings/import` → **404** `Cannot POST …/import`. This is the main BE deliverable.

### Out of scope for this ask

- NetSuite / Salesforce / etc. connectors (already dropped).
- Streaming sync — batch file ingest is enough for v1.

---

## 3. Calendar / currency after create — **confirm PUT**

### What FE changed

- Model Builder header: **Calendar** → dialog edits `baseCurrency`, `startPeriod`, `endPeriod`, `timeGranularity`.
- Saves via existing:

```http
PUT /v1/fpa/models/{modelId}
Content-Type: application/json

{
  "baseCurrency": "USD",
  "startPeriod": "2026-01-01",
  "endPeriod": "2026-12-31",
  "timeGranularity": "MONTHLY"
}
```

### Please confirm

1. PUT accepts these fields **after** create (not create-only).
2. Updating periods regenerates / extends grid periods as needed (or documents re-calc / re-grid steps).
3. Published / locked models: either reject with a clear 4xx, or allow currency-only — FE disables when workspace cannot edit.

If PUT currently ignores these fields, that is a BE bug; FE is ready.

**Smoke (2026-07-14):** `PUT` on draft model `cmrjsq8tq00bnktwpwfka569w` accepted `endPeriod` / `baseCurrency` / `timeGranularity` (`success=true`). Please confirm period changes also extend/regenerate grid periods for that model.

---

## Acceptance checklist

1. Open Model Planning for a published model → live LI names/values (not mock `$128.4M` board).
2. Upload CSV via Import → fields/mappings appear after refresh (not 404).
3. Change Calendar on a draft model → reload model shows new currency/period range; grid periods follow.

## FE files (reference)

- `app/forecasting/models/[id]/worksheet/page.tsx` — always `FpaWorksheet`
- `components/fpa/fpa-worksheet.tsx` — `getGrid` without required `cycleId`
- `components/fpa/builder/import-source-file-dialog.tsx` — multipart import
- `components/fpa/builder/builder-model-settings-dialog.tsx` — PUT settings
- `lib/api/fpa-api.ts` — `importDataMappingFile`, `updateModel`
