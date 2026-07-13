# FP&A Model Builder — Detailed Workspace (A.4) API

**Audience:** Frontend  
**Base:** `{host}/api/v1/fpa`  
**Auth:** `Authorization: Bearer <token>`  
**Envelope:** `{ "success": true, "data": … }`

Related: [fpa-model-builder-api.md](./fpa-model-builder-api.md) · [fpa-model-builder-fe-updates-2026-07-12.md](./fpa-model-builder-fe-updates-2026-07-12.md)

---

## What’s new (A.4)

| Capability | Endpoint |
|------------|----------|
| Module-scoped grid + grain + FY totals | `GET /models/:modelId/grid?moduleId=&grain=` |
| Validation checklist / donut | `GET /models/:modelId/validation-checks` |
| Exceptions panel | `GET /models/:modelId/exceptions` |
| Data mapping board | `GET/POST/PUT/DELETE …/data-mappings`, `POST …/seed-catalog`, `POST …/refresh` |
| Seed / materialize draft cells | `POST /versions/:id/seed-cells` (fills missing; no 409 on partial grids) |
| Nested versions / scenarios | `GET /models/:id/versions`, `GET /models/:id/scenarios` |
| What-if impact | `POST /models/:modelId/sensitivity-analysis` |
| Richer audit filters | `GET /models/:modelId/audit?moduleId=&lineItemId=&entityType=` |
| Formula trace graph | `GET …/cells/:cellId/trace` → `root` / `nodes` / `edges` |

Legacy routes remain unchanged.

---

## Enums

| Field | Values |
|-------|--------|
| `grain` | `monthly` (default) \| `quarterly` \| `annual` |
| Mapping `status` | `MAPPED` \| `UNMAPPED` \| `SUGGESTED` \| `TYPE_MISMATCH` \| `STALE` |
| Check `status` | `PASSED` \| `WARNING` \| `ERROR` |
| Exception `impact` | `HIGH` \| `MEDIUM` \| `LOW` |
| Audit `entityType` | e.g. `cell` \| `mapping` \| `formula` \| `line_item` |
| Shock `type` | `PERCENT` only |

---

## 1. Grid (module + grain)

`GET /models/{modelId}/grid`

**Query**

| Param | Notes |
|-------|--------|
| `versionId`, `scenarioId` | As before |
| `moduleId` | Filter line items + cells to that module (must belong to model) |
| `grain` | `monthly` \| `quarterly` \| `annual` — non-monthly periods are `readOnly: true` |

**Response extras**

- `lineItems[].summaryMethod`
- `lineItems[].formulas: [{ id, expression, isValid }]`
- `fyTotals: { [lineItemId]: number }` — `SUM` / `AVG` / `LAST` across **monthly** values
- `moduleId`, `grain`

```http
GET /v1/fpa/models/{modelId}/grid?versionId=…&scenarioId=…&moduleId=…&grain=monthly
```

**Cell edit**

- Calculated / non-editable line items → **409** `CELL_NOT_EDITABLE`
- `PUT /models/:modelId/grid/cells` and `POST …/cells/update` share this rule

---

## 2. Validation checks

`GET /models/{modelId}/validation-checks`

Fixed catalog keys: `model_name`, `version_scenario`, `scope`, `coa`, `dimensions`, `modules`, `line_items`, `formulas_valid`, `circular`, `default_formulas`, `dependency_graph`.

```json
{
  "success": true,
  "data": {
    "modelId": "cm…",
    "passed": false,
    "summary": { "total": 11, "passed": 7, "warnings": 2, "errors": 2 },
    "checks": [
      { "key": "coa", "label": "Chart of accounts", "status": "ERROR", "detail": "Bind COA accounts" }
    ]
  }
}
```

Use with existing `GET …/validation-summary` for donut counts.

---

## 3. Exceptions

`GET /models/{modelId}/exceptions?versionId=&scenarioId=&moduleId=`

Composes: enriched validate issues + grid validations (if `versionId`) + unmapped mappings (**HIGH**).

```json
{
  "success": true,
  "data": {
    "counts": { "total": 5, "errors": 1, "warnings": 3, "info": 1, "high": 2, "medium": 2, "low": 1 },
    "items": [
      {
        "severity": "WARNING",
        "impact": "HIGH",
        "code": "UNMAPPED_SOURCE",
        "type": "MAPPING",
        "message": "Unmapped source field GL_ACCOUNT.4000",
        "mappingId": "cm…"
      }
    ]
  }
}
```

---

## 4. Data mappings

Writable end-to-end for Detailed workspace **Add Mapping** / **Seed catalog** / **Refresh**.

### Create (P0)

`POST /models/{modelId}/data-mappings`

```json
{
  "sourceSystem": "NetSuite GL",
  "sourceField": "GL_ACCOUNT.4000",
  "targetLineItemId": "<line item uuid>",
  "status": "MAPPED",
  "notes": "optional",
  "moduleId": "<optional leaf id>"
}
```

**Response:** single entry (`id`, `sourceField`, `sourceSystem`, `targetLineItemId`, `targetLineItemName`, `status`, `notes`, `lastSyncedAt`).

**Rules**

- Unique on `(modelId, sourceSystem, sourceField)` → **409** `MAPPING_EXISTS` with `existingId` / `existing` when duplicate
- Writes audit `MAPPING_CREATE` with human `summary` and `lineItemId`
- After create, `GET …/data-mappings` includes the row

### Seed catalog (P0)

`POST /models/{modelId}/data-mappings/seed-catalog`

```json
{
  "systems": ["NetSuite GL", "Salesforce", "Workday HR", "Plaid (Bank)"],
  "moduleId": "<optional>",
  "replaceExisting": false
}
```

```json
{
  "createdFields": 48,
  "createdMappings": 12,
  "summary": { "total": 48, "mapped": 12, "unmapped": 36, "pct": 25 }
}
```

Demo fields: NetSuite `GL_ACCOUNT.4000…4090` / `6000…6090`, Salesforce `CRM_*`, Workday `HR_*`, Plaid `BANK_*`. Fuzzy-maps to line items when confidence is high.

### Refresh

`POST /models/{modelId}/data-mappings/refresh`

Body optional: `{ "replaceExisting": false }`.

Ensures **NetSuite GL**, creates `GL_ACCOUNT.{accountNo}` from model COA. Does **not** wipe manual `MAPPED` rows when `replaceExisting` is false (default).

### List

`GET /models/{modelId}/data-mappings?moduleId=&sourceSystem=&q=&unmappedOnly=&limit=&cursor=`

```json
{
  "success": true,
  "data": {
    "summary": { "total": 12, "mapped": 10, "unmapped": 2, "pct": 83.3 },
    "entries": [
      {
        "id": "cm…",
        "sourceField": "GL_ACCOUNT.4000",
        "sourceSystem": "NetSuite GL",
        "targetLineItemId": "cm…",
        "targetLineItemName": "Revenue",
        "status": "MAPPED",
        "notes": null,
        "lastSyncedAt": "2026-07-13T00:00:00.000Z"
      }
    ]
  }
}
```

### Update / delete

`PUT /models/{modelId}/data-mappings/{mappingId}`  
`DELETE /models/{modelId}/data-mappings/{mappingId}`

PUT accepts create-shaped fields (partial): `sourceSystem`, `sourceField`, `targetLineItemId` / `lineItemId`, `moduleId`, `status`, `notes`.

---

## 4b. Draft cell materialization

`POST /versions/{versionId}/seed-cells`

```json
{ "scenarioId": "…", "fillMissing": true }
```

- Allowed on **DRAFT** (and any non-LOCKED) versions
- If some cells already exist, **fills missing** `(lineItem × period)` with `skipDuplicates` — no longer **409** `CELLS_EXIST` by default
- Legacy skip: `{ "force": true }` without `fillMissing` returns `{ skipped: true }` when cells already exist

---

## 5. Sensitivity / impact analysis

`POST /models/{modelId}/sensitivity-analysis`

```json
{
  "versionId": "cm…",
  "scenarioId": "cm…",
  "driverLineItemId": "cm…",
  "shock": { "type": "PERCENT", "value": 5 },
  "targetLineItemIds": [],
  "periodRange": { "from": "2026-01-01", "to": "2026-12-01" }
}
```

Default targets: `EBITDA` / `CASH` KPIs **plus** formula dependents of the driver. Sandboxed — does **not** persist a scenario.

```json
{
  "success": true,
  "data": {
    "driver": {
      "lineItemId": "…",
      "name": "Revenue",
      "shock": { "type": "PERCENT", "value": 5 },
      "shockLabel": "+5%"
    },
    "impacts": [{ "lineItemId": "…", "name": "EBITDA", "deltaTotal": 12.5, "deltaPct": 4.2 }],
    "series": { "periods": ["2026-01-01"], "baseCase": [100], "shocked": [105], "unit": "USD" },
    "message": "No calculated dependents with values for this driver. Seed cells and formulas first."
  }
}
```

`message` is present when `impacts` is empty.

---

## 5b. Nested versions / scenarios

`GET /models/{modelId}/versions`  
`GET /models/{modelId}/scenarios` — same payload as `GET /scenarios?modelId=`

Model detail still embeds versions/scenarios; these routes are for REST consistency.
## 6. Cell detail / trace

**Detail** adds: `lastCalculatedAt`, `formulaUpdatedAt`, `formulaUpdatedByName` (null if unavailable), `validationStatus`.

**Trace** returns graph shape **plus** legacy `inputs` / `dependents`:

```json
{
  "root": { "cellId": "…", "expression": "LINE('REVENUE')-LINE('COGS')", "value": 40 },
  "nodes": [{ "id": "cell:…", "label": "Gross Profit", "kind": "RESULT", "value": 40, "expression": "…" }],
  "edges": [{ "from": "line:REVENUE", "to": "cell:…" }]
}
```

---

## 7. Audit

`GET /models/{modelId}/audit?format=fe&moduleId=&lineItemId=&entityType=`

Entries include `lineItemId`, `moduleId`, `entityType`, and human-readable `summary` (from JSON `reason.summary` when present). Mapping create/update/delete and cell edits write navigable summaries.

---

## Acceptance checklist

- [ ] `GET grid?moduleId=` returns only that module’s line items + cells, with `formulas` and `fyTotals`
- [ ] `grain=quarterly|annual` marks periods `readOnly: true`
- [ ] Editing a CALCULATED line → **409** `CELL_NOT_EDITABLE`
- [ ] `validation-checks` returns 11 fixed keys with PASSED/WARNING/ERROR
- [ ] `exceptions` includes unmapped mappings as HIGH
- [ ] **Add Mapping** `POST …/data-mappings` → row in list with `MAPPED`
- [ ] **Seed catalog** → `summary.total > 0` on draft
- [ ] **Refresh** after seed does not wipe manual `MAPPED` (`replaceExisting=false`)
- [ ] `POST …/seed-cells` on DRAFT with sparse cells fills missing (no 409)
- [ ] `sensitivity-analysis` returns impacts or explicit `message`
- [ ] Audit shows human `summary` + `lineItemId` for mapping/cell events
- [ ] `GET …/versions` and `GET …/scenarios` return 200
- [ ] Cell trace includes `root` / `nodes` / `edges`

**Migrate:**  
`npm run db:migrate:fpa-detailed-workspace`  
`npm run db:migrate:fpa-data-mapping-crud`  

**UAT:** `npm run uat:fpa:model-builder-detailed`