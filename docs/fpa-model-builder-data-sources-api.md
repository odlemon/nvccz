# FP&A Model Builder — data sources / seed-catalog (Arcus-owned)

**Date:** 2026-07-14  
**Audience:** FE + Backend  
**Status:** Seed-catalog PASS; CSV/Excel import shipped.

## Why

FE no longer offers NetSuite / Salesforce / Workday / Plaid / ADP. Seed and refresh use **Arcus-owned** source labels. Mapping CRUD still accepts any free-text `sourceSystem`.

## Default seed systems

`POST /v1/fpa/models/{modelId}/data-mappings/seed-catalog`

Empty / omitted `systems` seeds:

| Label | Sample field prefixes |
|-------|------------------------|
| Custom / CSV | `CSV.*` |
| Excel | `XLS.*` |
| API | `API.*` |
| Manual | `MANUAL.*` |
| Procurement | `PROC.*` |
| Fixed Assets | `FA.*` |
| Stock | `INV.*` |
| Portfolio | `PF.*` |
| Accounting GL | `GL_ACCOUNT.*` |
| Payroll | `PR.*` |
| CRM | `CRM.*` |
| Banking | `BANK.*` |
| Loan | `LOAN.*` |

**Blocked from seed** (ignored if sent): NetSuite GL, Salesforce, Workday HR, Plaid, ADP Payroll.

## Endpoints

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `…/data-mappings/seed-catalog` | Arcus catalog sample fields + fuzzy map suggestions |
| `POST` | `…/data-mappings/refresh` | Ensures **Accounting GL**; COA → `GL_ACCOUNT.{accountNo}` |
| `POST` | `…/data-mappings/import` | Multipart CSV/Excel → source fields + mapping suggestions |
| `GET/POST/PUT/DELETE` | `…/data-mappings` | Free-text `sourceSystem` |

## File ingest

```http
POST /v1/fpa/models/{modelId}/data-mappings/import
Content-Type: multipart/form-data

file: <binary .csv | .xlsx | .xls>
sourceSystem: "Custom / CSV" | "Excel"
moduleId: <optional>
```

**Behavior**

1. Parse first worksheet / CSV.
2. **Mapping table mode** — if a `sourceField` / `fieldKey` / `field` column exists: each row creates that field; optional `code` / `targetLineItemCode` / `name` fuzzy-maps to line items (`SUGGESTED` / `UNMAPPED`).
3. **Header mode** — otherwise each column header becomes a source field (`CSV.*` or `XLS.*` prefix if no dot).
4. Does not recreate third-party SaaS connectors.

**Response**

```json
{
  "success": true,
  "message": "Import completed",
  "data": {
    "createdFields": 4,
    "createdMappings": 4,
    "updatedMappings": 0,
    "rowsImported": 12,
    "fieldsImported": 4,
    "mode": "headers",
    "sourceSystem": "Custom / CSV",
    "filename": "drivers.csv",
    "summary": { "total": 20, "mapped": 8, "unmapped": 12, "pct": 40 }
  }
}
```

## Soft-rename (ensure / refresh)

| Legacy | Arcus |
|--------|--------|
| NetSuite GL | Accounting GL |
| Salesforce | CRM |
| Workday HR / ADP Payroll | Payroll |
| Plaid (Bank) | Banking |

## Calendar / currency PUT (related)

`PUT /v1/fpa/models/{modelId}` accepts `baseCurrency`, `startPeriod`, `endPeriod`, `timeGranularity` after create.

- Period changes on **PUBLISHED / ARCHIVED** → **409** `MODEL_LOCKED`.
- Draft / in-review: updates model dates (grid periods follow) and **fillMissing** seeds new months on draft versions.
- Currency-only updates are always allowed on editable models.

## Acceptance

1. Seed with FE systems list creates fields only for Arcus systems above.  
2. Default seed (no body) matches that list — not SaaS connectors.  
3. Mapping CRUD accepts any `sourceSystem` string.  
4. Existing demo rows with SaaS names may remain until remapped; new seed does not recreate them.  
5. `POST …/data-mappings/import` returns 201 with `createdFields` / `createdMappings` / `rowsImported` (not 404).
