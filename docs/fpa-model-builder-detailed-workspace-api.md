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
| Data mapping board | `GET/PUT …/data-mappings`, `POST …/refresh` |
| What-if impact | `POST /models/:modelId/sensitivity-analysis` |
| Richer audit filters | `GET /models/:modelId/audit?moduleId=&lineItemId=&entityType=` |
| Formula trace graph | `GET …/cells/:cellId/trace` → `root` / `nodes` / `edges` |

Legacy routes remain unchanged.

---

## Enums

| Field | Values |
|-------|--------|
| `grain` | `monthly` (default) \| `quarterly` \| `annual` |
| Mapping `status` | `MAPPED` \| `UNMAPPED` \| `TYPE_MISMATCH` \| `STALE` |
| Check `status` | `PASSED` \| `WARNING` \| `ERROR` |
| Exception `impact` | `HIGH` \| `MEDIUM` \| `LOW` |
| Audit `entityType` | e.g. `CELL` \| `LINE_ITEM` \| `FORMULA` \| `DATA_MAPPING` |
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

### Refresh

`POST /models/{modelId}/data-mappings/refresh`

Ensures source **NetSuite GL** (`systemCode` `ACCOUNTING`), creates `GL_ACCOUNT.{accountNo}` fields from model COA, mappings `UNMAPPED` or `MAPPED` when a line item shares `accountId`.

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
        "lastSyncedAt": "2026-07-13T00:00:00.000Z"
      }
    ]
  }
}
```

### Update

`PUT /models/{modelId}/data-mappings/{mappingId}`

Body: `{ "lineItemId": "…"|null, "moduleId"?: "…", "status"?: "MAPPED"|"UNMAPPED"|… }`

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

Default targets: codes `EBITDA` and any line containing `CASH`. Sandboxed — does **not** persist a scenario.

```json
{
  "success": true,
  "data": {
    "driver": { "lineItemId": "…", "name": "Revenue", "shock": { "type": "PERCENT", "value": 5 } },
    "impacts": [{ "lineItemId": "…", "name": "EBITDA", "deltaTotal": 12.5, "deltaPct": 4.2 }],
    "series": { "periods": ["2026-01-01"], "baseCase": [100], "shocked": [105], "unit": "CURRENCY" }
  }
}
```

---

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

Entries include `lineItemId`, `moduleId`, `entityType` columns when logged.

---

## Acceptance checklist

- [ ] `GET grid?moduleId=` returns only that module’s line items + cells, with `formulas` and `fyTotals`
- [ ] `grain=quarterly|annual` marks periods `readOnly: true`
- [ ] Editing a CALCULATED line → **409** `CELL_NOT_EDITABLE`
- [ ] `validation-checks` returns 11 fixed keys with PASSED/WARNING/ERROR
- [ ] `exceptions` includes unmapped mappings as HIGH
- [ ] `data-mappings/refresh` then `list` shows summary `pct`
- [ ] `sensitivity-analysis` returns impacts without writing cells
- [ ] Cell trace includes `root` / `nodes` / `edges`
- [ ] Audit filters by `moduleId` / `lineItemId` / `entityType`

**Migrate:** `npm run db:migrate:fpa-detailed-workspace`  
**UAT:** `npm run uat:fpa:model-builder-detailed`
