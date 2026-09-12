# Arcus FP&A — Detailed API Reference

Complete request/response contracts for the Planning, Budgeting & Forecasting module.

| | |
|---|---|
| **Base URL** | `{host}/api/v1/fpa` |
| **Dev** | `https://dev-api.arcus.co.zw/api/v1/fpa` |
| **Auth** | `Authorization: Bearer {token}` on every route |
| **Content-Type** | `application/json` |
| **Related** | Forecast entities: `{host}/api/forecast-entities` (Tax Return Pack + entity dimension) |

Envelope for all successful responses:

```json
{ "success": true, "data": { } }
```

Error envelope:

```json
{ "success": false, "code": "VALIDATION", "message": "…" }
```

Common HTTP statuses: `200` OK · `201` Created · `400` validation · `403` locked / forbidden · `404` not found · `500` server.

---

## Table of contents

1. [Models](#1-models)
2. [Line items](#2-line-items)
3. [Drivers](#3-drivers)
4. [Formulas](#4-formulas)
5. [Grid / cells](#5-grid--cells)
6. [Scenarios](#6-scenarios)
7. [Versions](#7-versions)
8. [Workflow & tasks](#8-workflow--tasks)
9. [Actuals](#9-actuals)
10. [Variance](#10-variance)
11. [Home dashboard](#11-home-dashboard)
12. [Domain views](#12-domain-views)
13. [Exports](#13-exports)
14. [AI stubs](#14-ai-stubs)
15. [Forecast entities](#15-forecast-entities)
16. [Enums & conventions](#16-enums--conventions)

---

## 1. Models

### 1.0 Atomic setup (preferred — modal Create model)

`POST /models/setup` → **201**

One transaction: model + BASE + Working + cells + optional scope/COA/dimensions/baseline/line items/formulas/drivers/workflow.

**Enums:** `modelType` = `BUDGET` \| `FORECAST` \| `ROLLING_FORECAST`; `timeGranularity` = `MONTHLY` \| `QUARTERLY` \| `ANNUAL`; `baseline.mode` = `NONE` \| `ACTUALS_SYNC` \| `PRIOR_FORECAST`.

**Request** — see frontend setup contract (`entityIds`, `departmentIds`, `accountIds`, `dimensions`, `baseline`, `lineItems`, `formulas`, `drivers`, `workflow`).

**Response `data`**

```json
{
  "model": { "id": "…", "name": "…", "status": "DRAFT", "defaultScenarioId": "…", "defaultVersionId": "…" },
  "lineItemCount": 10,
  "driverCount": 2,
  "workflowId": "…",
  "validation": { "passed": true, "errors": [] }
}
```

**400** on preflight failure: `{ success: false, code: "VALIDATION", message: "…", errors: [{ code, step, message, field? }] }` — nothing persisted.

**Dedicated setup API doc (full contracts):** [fpa-model-setup-api.md](./fpa-model-setup-api.md)

Helpers (if not using setup):

| Method | Path |
|--------|------|
| PUT | `/models/{id}/scope` |
| PUT | `/models/{id}/coa` |
| PUT | `/models/{id}/dimensions` |
| POST | `/models/{id}/baseline` |
| POST | `/models/{id}/validate` |
| POST | `/models/{id}/line-items/bulk` |
| GET | `/dimensions` |

Departments: use platform `GET /departments`. Entities/COA: `/forecast-entities`.

---

### 1.1 Create model

`POST /models` → **201**

Creates a DRAFT model, seeds **BASE** scenario, **Working** version, default line items (Revenue, COGS, Gross Profit, Salaries, Rent, Marketing, EBITDA, Headcount, Closing Cash), and empty monthly cells for the horizon.

**Request body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | Also accepts `modelName` |
| `startPeriod` | date string | yes | `YYYY-MM-DD` (also `start_period`) |
| `endPeriod` | date string | yes | (also `end_period`) |
| `modelType` | string | no | Default `BUDGET` |
| `baseCurrency` | string | no | Default `USD` (also `base_currency`) |
| `timeGranularity` | string | no | Default `MONTHLY` |
| `description` | string | no | |
| `ownerUserId` | string | no | Defaults to caller |

```json
{
  "name": "FY2026 Operating Plan",
  "modelType": "BUDGET",
  "baseCurrency": "USD",
  "startPeriod": "2026-01-01",
  "endPeriod": "2026-12-01",
  "timeGranularity": "MONTHLY",
  "description": "Annual budget cycle"
}
```

**Response `data`**

```json
{
  "id": "cm…",
  "name": "FY2026 Operating Plan",
  "modelType": "BUDGET",
  "description": "Annual budget cycle",
  "ownerUserId": "cm…",
  "baseCurrency": "USD",
  "startPeriod": "2026-01-01T00:00:00.000Z",
  "endPeriod": "2026-12-01T00:00:00.000Z",
  "timeGranularity": "MONTHLY",
  "status": "DRAFT",
  "createdById": "cm…",
  "createdAt": "…",
  "updatedAt": "…",
  "defaultScenarioId": "cm…",
  "defaultVersionId": "cm…",
  "lineItemCount": 9,
  "cellCount": 108
}
```

Use `defaultScenarioId` + `defaultVersionId` immediately for grid calls.

---

### 1.2 List models

`GET /models?status=&ownerUserId=` → **200**

**Response `data`:** array of models, each with `_count: { lineItems, scenarios, versions }`.

---

### 1.3 Get model

`GET /models/{modelId}` → **200**

**Response `data`:** model including:

- `lineItems[]` (sorted)
- `scenarios[]`
- `versions[]`

---

### 1.4 Update model

`PUT /models/{modelId}` → **200**

**Request body** (all optional)

```json
{
  "name": "FY2026 Plan v2",
  "description": "…",
  "modelType": "FORECAST",
  "baseCurrency": "USD",
  "status": "OPEN",
  "startPeriod": "2026-01-01",
  "endPeriod": "2026-12-01",
  "timeGranularity": "MONTHLY"
}
```

**Response `data`:** updated model row.

---

### 1.5 Archive model

`POST /models/{modelId}/archive` → **200**

No body. Sets `status` to `ARCHIVED`.

---

## 2. Line items

### 2.1 List line items

`GET /models/{modelId}/line-items` → **200**

**Response `data`:** array of line items with nested `formulas[]`.

```json
{
  "id": "cm…",
  "modelId": "cm…",
  "code": "REVENUE",
  "name": "Revenue",
  "lineItemType": "REVENUE",
  "category": "REVENUE",
  "dataType": "CURRENCY",
  "summaryMethod": "SUM",
  "format": null,
  "isEditable": true,
  "sortOrder": 10,
  "accountId": null,
  "formulas": []
}
```

---

### 2.2 Create line item

`POST /models/{modelId}/line-items` → **201**

**Request body**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `code` | string | yes | uppercased |
| `name` | string | yes | |
| `lineItemType` | string | no | `EXPENSE` |
| `category` | string | no | `GENERAL` |
| `dataType` | string | no | `CURRENCY` |
| `summaryMethod` | string | no | `SUM` |
| `format` | string | no | |
| `isEditable` | boolean | no | `true` |
| `sortOrder` | number | no | `0` |
| `accountId` | string | no | GL / COA id for actuals mapping |

```json
{
  "code": "TRAVEL",
  "name": "Travel",
  "lineItemType": "EXPENSE",
  "category": "EXPENSE",
  "sortOrder": 55,
  "accountId": "cm…"
}
```

**Response `data`:** created line item.

---

## 3. Drivers

### 3.1 List drivers

`GET /models/{modelId}/drivers?scenarioId=&versionId=&category=`  
or `GET /drivers?modelId=&scenarioId=&versionId=&category=` → **200**

**Response `data`:** array of driver rows.

---

### 3.2 Create driver

`POST /models/{modelId}/drivers` or `POST /drivers` → **201**

**Request body**

| Field | Type | Required |
|-------|------|----------|
| `modelId` | string | yes (or path) |
| `code` | string | yes |
| `name` | string | yes |
| `category` | string | no (default `GENERAL`) |
| `value` | number | no (default `0`) |
| `unit` | string | no |
| `periodDate` | date | no |
| `scenarioId` | string | no |
| `versionId` | string | no |
| `requiresApproval` | boolean | no |

```json
{
  "code": "GROWTH_RATE",
  "name": "Revenue Growth",
  "category": "REVENUE",
  "value": 0.05,
  "unit": "%",
  "scenarioId": "cm…",
  "versionId": "cm…"
}
```

---

### 3.3 Update driver

`PUT /drivers/{id}` → **200**

Partial update. At least one field required.

| Field | Type | Required |
|-------|------|----------|
| `name` | string | no |
| `category` | string | no |
| `value` | number | no |
| `unit` | string | no |
| `periodDate` | date \| null | no |
| `scenarioId` | string \| null | no |
| `versionId` | string \| null | no |
| `requiresApproval` | boolean | no |

```json
{ "value": 0.08, "periodDate": "2026-01-01", "unit": "%" }
```

**Response `data`:** updated driver row. **404** if driver missing.

**Response `data`**

```json
{
  "id": "cm…",
  "modelId": "cm…",
  "code": "GROWTH_RATE",
  "name": "Revenue Growth",
  "category": "REVENUE",
  "value": "0.05000000",
  "unit": "%",
  "scenarioId": "cm…",
  "versionId": "cm…",
  "requiresApproval": false,
  "createdById": "cm…",
  "createdAt": "…"
}
```

---

## 4. Formulas

### 4.1 Validate expression

`POST /formulas/validate` → **200**

**Request**

```json
{ "expression": "LINE('REVENUE') - LINE('COGS')" }
```

**Response `data`**

```json
{
  "valid": true,
  "lineCodes": ["REVENUE", "COGS"],
  "driverCodes": []
}
```

On invalid:

```json
{
  "valid": false,
  "message": "Expression contains unsupported characters",
  "lineCodes": [],
  "driverCodes": []
}
```

Dialect: arithmetic `+ - * /`, `IF(cond,a,b)`, `LINE('CODE')`, `DRIVER('CODE')`.

---

### 4.2 Dependency / circular check

`POST /formulas/dependency-check` → **200**

**Request**

```json
{
  "modelId": "cm…",
  "formulaId": null,
  "dependsOnLineItemCodes": ["EBITDA", "REVENUE"]
}
```

Aliases: `lineCodes` for the dependency list.

**Response `data`**

```json
{
  "circular": false,
  "path": null,
  "graph": { "REVENUE": ["EBITDA"] }
}
```

If circular: `{ "circular": true, "path": ["A", "B", "A"] }`. Creating/updating a formula with a circular graph returns **400** `CIRCULAR`.

---

### 4.3 Create formula

`POST /models/{modelId}/formulas` → **201**

**Request**

```json
{
  "lineItemId": "cm…",
  "expression": "LINE('REVENUE') - LINE('COGS')"
}
```

**Response `data`:** `planning_formulas` row (`id`, `expression`, `isValid`, `validationMsg`, …).

---

### 4.4 Update formula

`PUT /formulas/{formulaId}` → **200**

**Request**

```json
{
  "expression": "LINE('REVENUE') * (1 + DRIVER('GROWTH_RATE'))",
  "lineItemId": "cm…"
}
```

---

### 4.5 Impact map

`GET /formulas/{formulaId}/impact-map` → **200**

**Response `data`**

```json
{
  "formula": { "id": "…", "expression": "…", "lineItem": { "code": "GROSS_PROFIT" } },
  "dependsOn": [ { "id": "…", "lineItem": { "code": "REVENUE" } } ],
  "dependents": [],
  "lineCodes": ["REVENUE", "COGS"],
  "driverCodes": []
}
```

---

## 5. Grid / cells

### 5.1 Get grid

`GET /models/{modelId}/grid?versionId=&scenarioId=&page=1&pageSize=100&lineItemId=` → **200**

**Query**

| Param | Required | Notes |
|-------|----------|-------|
| `versionId` | recommended | Working / locked version |
| `scenarioId` | recommended | BASE / Upside / … |
| `page` | no | default `1` |
| `pageSize` | no | default `100`, max `500` |
| `lineItemId` | no | filter one row |

**Response `data`**

```json
{
  "modelId": "cm…",
  "versionId": "cm…",
  "scenarioId": "cm…",
  "page": 1,
  "pageSize": 100,
  "total": 108,
  "lineItems": [
    { "id": "…", "code": "REVENUE", "name": "Revenue", "lineItemType": "REVENUE", "category": "REVENUE", "sortOrder": 10 }
  ],
  "cells": [
    {
      "id": "cm…",
      "modelId": "cm…",
      "scenarioId": "cm…",
      "versionId": "cm…",
      "lineItemId": "cm…",
      "periodDate": "2026-01-01T00:00:00.000Z",
      "entityId": null,
      "departmentId": null,
      "costCentreId": null,
      "accountId": null,
      "currencyCode": "USD",
      "value": "100000.0000",
      "valueType": "MANUAL",
      "sourceType": "INPUT",
      "isEditable": true,
      "isLocked": false,
      "formulaId": null,
      "driverId": null,
      "lastUpdatedById": "cm…",
      "lastUpdatedAt": "…",
      "lineItem": {
        "id": "…",
        "code": "REVENUE",
        "name": "Revenue",
        "lineItemType": "REVENUE",
        "category": "REVENUE"
      }
    }
  ]
}
```

UI rules: if `isLocked` or `!isEditable` or `sourceType === "ACTUAL"` → render read-only.

---

### 5.2 Update cell

`POST /models/{modelId}/cells/update` → **200**

**Option A — by cell id**

```json
{ "cellId": "cm…", "value": 125000, "reason": "Q1 sales uplift" }
```

**Option B — by coordinates**

```json
{
  "versionId": "cm…",
  "scenarioId": "cm…",
  "lineItemId": "cm…",
  "periodDate": "2026-01-01",
  "value": 125000
}
```

Optional: `valueType`, `sourceType`.

**Response `data`:** updated cell row.

**Errors**

| Status | Code | When |
|--------|------|------|
| 403 | `VERSION_LOCKED` | Version status is LOCKED |
| 403 | `CELL_LOCKED` | Cell `isLocked` / not editable |
| 404 | `NOT_FOUND` | Cell missing |

Both blocked edits write an audit log entry.

---

### 5.3 Bulk update

`POST /models/{modelId}/cells/bulk-update` → **200**

**Request**

```json
{
  "updates": [
    { "cellId": "cm…", "value": 10 },
    { "versionId": "cm…", "scenarioId": "cm…", "lineItemId": "cm…", "periodDate": "2026-02-01", "value": 20 }
  ]
}
```

Alias: `cells` instead of `updates`.

**Response `data`**

```json
{ "updated": 2, "cells": [ { "id": "…", "value": "10.0000" } ] }
```

---

### 5.4 Spread

`POST /models/{modelId}/cells/spread` → **200**

Splits `value` evenly across matching editable cells.

```json
{
  "versionId": "cm…",
  "scenarioId": "cm…",
  "lineItemId": "cm…",
  "value": 1200000,
  "periodDates": ["2026-01-01", "2026-02-01", "2026-03-01"]
}
```

`periodDates` optional — if omitted, all unlocked editable cells for that line/version/scenario.

**Response `data`:** `{ "spreadAcross": 3, "cells": [ … ] }`

---

### 5.5 Copy forward

`POST /models/{modelId}/cells/copy-forward` → **200**

```json
{
  "versionId": "cm…",
  "scenarioId": "cm…",
  "lineItemId": "cm…",
  "fromPeriodDate": "2026-01-01"
}
```

Copies the value from `fromPeriodDate` into later periods on the same line.

**Response `data`:** `{ "copied": N, "cells": [ … ] }`

---

### 5.6 Cell history

`GET /models/{modelId}/cells/{cellId}/history` → **200**

**Response `data`:** audit log entries for that cell (`actionType`, `oldValue`, `newValue`, `userId`, `createdAt`, …).

---

## 6. Scenarios

### 6.1 Create scenario

`POST /scenarios` → **201**

```json
{
  "modelId": "cm…",
  "name": "Upside",
  "scenarioType": "UPSIDE",
  "description": "+10% growth case"
}
```

`scenarioType` examples: `BASE`, `UPSIDE`, `DOWNSIDE`, `FX_SHOCK`, `HIRING_FREEZE`, `CUSTOM` / `WHAT_IF`.

**Response `data`:** scenario row (`id`, `modelId`, `name`, `scenarioType`, `isOfficial`, `status`, …).

---

### 6.2 List scenarios

`GET /scenarios?modelId=` → **200**

**Response `data`:** array of scenarios.

---

### 6.3 Copy scenario

`POST /scenarios/{id}/copy` → **201**

Copies cells + drivers from source scenario for a given version.

```json
{
  "versionId": "cm…",
  "name": "Upside copy",
  "scenarioType": "UPSIDE"
}
```

**Response `data`**

```json
{
  "scenario": { "id": "cm…", "name": "Upside copy" },
  "cellsCopied": 108,
  "driversCopied": 2
}
```

---

### 6.4 Compare scenarios

`POST /scenarios/{id}/compare` → **200**

`{id}` is the left/base scenario.

**Request** (either form)

```json
{
  "versionId": "cm…",
  "compareScenarioId": "cm…"
}
```

```json
{
  "versionId": "cm…",
  "scenarioIds": ["baseScenarioId", "upsideScenarioId"]
}
```

**Response `data`**

```json
{
  "left": { "id": "cm…", "name": "BASE" },
  "right": { "id": "cm…", "name": "Upside" },
  "versionId": "cm…",
  "rows": [
    { "code": "REVENUE", "left": 100000, "right": 0, "delta": 100000 },
    { "code": "EBITDA", "left": 0, "right": 0, "delta": 0 },
    { "code": "CLOSING_CASH", "left": 0, "right": 0, "delta": 0 }
  ]
}
```

Metrics compared: `REVENUE`, `COGS`, `GROSS_PROFIT`, `EBITDA`, `CLOSING_CASH`, `SALARIES`, `HEADCOUNT`. Missing cells count as `0`.

---

### 6.5 Promote scenario to forecast

`POST /scenarios/{id}/promote` → **200**

Marks the scenario as the official forecast (`scenarioType: FORECAST`, `isOfficial: true`). Other official scenarios on the same model are demoted unless `demoteOthers: false`.

```json
{
  "scenarioType": "FORECAST",
  "status": "ACTIVE",
  "isOfficial": true,
  "name": "FY26 Forecast",
  "demoteOthers": true
}
```

All fields optional; defaults promote to official `FORECAST` / `ACTIVE`.

**Response `data`:** updated scenario row.

---

## 7. Versions

### 7.1 Create version

`POST /versions` → **201**

```json
{ "modelId": "cm…", "name": "Board Draft 1", "copyFromVersionId": "cm…" }
```

`copyFromVersionId` (optional): copies cells and drivers from an existing version on the same model into the new DRAFT.

**Response `data`:** version with `status: "DRAFT"` (plus copy counts when `copyFromVersionId` is used).

---

### 7.2 Seed cells on empty version

`POST /versions/{id}/seed-cells` → **200**

Creates the line-item × period grid for a DRAFT/WORKING version that has **0 cells** (or reuses existing cells). Optional:

```json
{ "scenarioId": "cm…", "copyFromVersionId": "cm…" }
```

Without `copyFromVersionId`, seeds zeroed input cells for all model line items and periods. With `copyFromVersionId`, copies values from that version.

**Notes**

- Locked / archived versions → **403**.
- Prefer this (or `copyFromVersionId` on create) before `cells/update` on a brand-new empty DRAFT.
- `POST /models/{id}/cells/update` also **upserts** a missing cell when coordinates (`lineItemId`, `periodId`, `scenarioId`) are supplied.

---

### 7.3 Lock version

`POST /versions/{id}/lock` → **200**

Requires CFO / FIN_MGR / FORECAST_LOCK / CEO / admin.

```json
{ "reason": "Board approved FY26 budget" }
```

**Response `data`**

```json
{
  "version": {
    "id": "cm…",
    "status": "LOCKED",
    "lockedAt": "…",
    "lockedById": "cm…"
  },
  "lock": {
    "id": "cm…",
    "lockType": "VERSION",
    "reason": "Board approved FY26 budget"
  }
}
```

Side effects: all cells on the version set `isLocked: true`, `isEditable: false`. Further cell edits / spread / copy-forward → **403** (expected).

---

### 7.4 Archive version

`POST /versions/{id}/archive` → **200**

No body required. Sets `status` to `ARCHIVED`.

---

## 8. Workflow & tasks

### 8.1 Create workflow

`POST /workflows` → **201**

```json
{
  "modelId": "cm…",
  "name": "FY26 Budget Cycle",
  "workflowType": "ANNUAL_BUDGET",
  "stage": "SETUP",
  "startDate": "2026-01-01",
  "endDate": "2026-03-31",
  "tasks": [
    {
      "title": "Marketing department input",
      "departmentId": "dept-…",
      "assigneeId": "user-…",
      "priority": "HIGH",
      "dueDate": "2026-02-15"
    }
  ]
}
```

`workflowType` examples: `ANNUAL_BUDGET`, `ROLLING_FORECAST`, `SCENARIO_APPROVAL`, `BUDGET_CYCLE`.  
`stage` examples: `SETUP`, `DEPARTMENT_INPUT`, `FPA_REVIEW`, `CFO_APPROVAL`, `LOCKED`.

**Response `data`:** workflow + nested `tasks[]`.

---

### 8.1b List workflows

`GET /workflows?modelId={id}&status=ACTIVE` → **200**

Returns workflows with nested task summaries for Budget/Workflow screens.

---

### 8.2 Get workflow

`GET /workflows/{id}` → **200**

Includes `tasks` (with `approvals`) and workflow-level `approvals`.

---

### 8.3 My tasks

`GET /tasks/my-tasks?modelId={id}` → **200**

Open tasks assigned to the **current user or unassigned** (`PENDING` / `RETURNED` / `SUBMITTED`). Aligns with Home `openTasks`. Optional filters: `modelId`, `status`.

---

### 8.4 Submit / return / approve / reassign

`POST /tasks/{id}/submit`  
`POST /tasks/{id}/return`  
`POST /tasks/{id}/approve`  
`POST /tasks/{id}/reassign` — `{ "assigneeId": "user-…" | null, "comment": "…" }`

**Request body (optional)**

```json
{ "comment": "Ready for FP&A review" }
```

**Rules**

- Submit → status `SUBMITTED`, records approval action `SUBMIT`.
- Return → status `RETURNED`, action `RETURN`.
- Approve → requires approver role; **maker cannot approve own submission** → **403**.
- Reassign → approver role; sets `assigneeId` (null = unassign).

**Response `data`:** updated task (and related approval row depending on service return).

---

## 9. Actuals

### 9.1 Sync actuals

`POST /actuals/sync` → **200**

Pulls posted/approved journal lines for line items that have `accountId` mapped, writes snapshots, and (when `versionId` + `scenarioId` provided) updates matching cells to `sourceType: ACTUAL`, locked.

```json
{
  "modelId": "cm…",
  "versionId": "cm…",
  "scenarioId": "cm…",
  "periodStart": "2026-01-01",
  "periodEnd": "2026-03-31"
}
```

**Response `data`**

```json
{
  "job": {
    "id": "cm…",
    "status": "COMPLETED",
    "sourceModule": "GL_JOURNAL",
    "rowCount": 12
  },
  "snapshotsCreated": 12,
  "cellsUpdated": 12
}
```

(Exact field names may include nested job status `FAILED` + `errorMessage` on failure.)

---

### 9.2 List snapshots

`GET /actuals/snapshots?modelId=&periodStart=&periodEnd=` → **200**

**Response `data`:** array of `planning_actuals_snapshots` (`periodDate`, `amount`, `lineItemId`, `accountId`, `sourceModule`, …).

---

## 10. Variance

### 10.1 Calculate

`POST /variance/calculate` → **200**

```json
{
  "modelId": "cm…",
  "versionId": "cm…",
  "scenarioId": "cm…",
  "varianceType": "ACTUAL_VS_BUDGET"
}
```

`varianceType` examples: `ACTUAL_VS_BUDGET`, `ACTUAL_VS_FORECAST`, `ACTUAL_VS_PLAN`, `FORECAST_VS_BUDGET`.

**Response `data`**

```json
{
  "count": 24,
  "results": [
    {
      "id": "cm…",
      "modelId": "cm…",
      "lineItemId": "cm…",
      "periodDate": "2026-01-01T00:00:00.000Z",
      "varianceType": "ACTUAL_VS_BUDGET",
      "actualValue": "90000.0000",
      "planValue": "100000.0000",
      "varianceAmount": "-10000.0000",
      "variancePercent": "-10.0000",
      "direction": "UNFAVORABLE",
      "commentaryRequired": true
    }
  ]
}
```

Direction: revenue/cash/calc → positive variance favourable; expenses → negative (under plan) favourable. Commentary required when |variance %| ≥ 10.

---

### 10.2 List results

`GET /variance/results?modelId=&varianceType=&direction=&limit=100` → **200**

Includes `lineItem` and `comments[]`.

---

### 10.3 Add commentary

`POST /variance/{id}/commentary` → **201**

```json
{
  "body": "Delay in Q1 pipeline conversions",
  "correctiveAction": "Accelerate outbound in Feb"
}
```

Alias: `commentary` for `body`.

**Response `data`:** `planning_comments` row.

---

## 11. Home dashboard

`GET /home/dashboard?modelId=&versionId=` → **200**

If `modelId` omitted, uses latest non-archived model.

**Response `data`**

```json
{
  "model": { "id": "cm…", "name": "FY2026 Operating Plan", "status": "DRAFT" },
  "versionId": "cm…",
  "kpis": {
    "revenue": 1250000,
    "ebitda": 230000,
    "closingCash": 384000,
    "runwayMonths": 14.2
  },
  "workflowProgress": [
    {
      "id": "cm…",
      "name": "FY26 Budget Cycle",
      "stage": "DEPARTMENT_INPUT",
      "completedTasks": 3,
      "totalTasks": 10,
      "percent": 30
    }
  ],
  "openTasks": [
    {
      "id": "cm…",
      "title": "Marketing department input",
      "status": "PENDING",
      "priority": "HIGH",
      "dueDate": "2026-02-15T00:00:00.000Z",
      "assigneeId": "cm…"
    }
  ],
  "scenarioCompare": {
    "left": { "id": "…", "name": "BASE", "revenue": 100000, "ebitda": 0 },
    "right": { "id": "…", "name": "Upside", "revenue": 0, "ebitda": 0 }
  },
  "overBudgetDepartments": [
    {
      "departmentId": "…",
      "departmentName": "Marketing",
      "plan": 50000,
      "actual": 62000,
      "overBy": 12000
    }
  ],
  "activity": [
    {
      "at": "2026-07-11T12:00:00.000Z",
      "userId": "cm…",
      "userName": "Admin User",
      "action": "CELL_UPDATE",
      "entityType": "cell",
      "entityId": "cm…"
    }
  ]
}
```

Empty state (no models): `{ "kpis": null, "workflowProgress": [], "openTasks": [], "message": "No planning models yet" }`.

Also returns `kpis.sparklines`, `cashByMonth[]`, `overBudgetDepartments[].ownerName` / `ownerAvatarUrl`, and `model.ownerName`.

---

## 12. Domain views

`GET /domain/{category}?modelId=` → **200**

`category`: `workforce` | `revenue` | `expense` | `cash`

**Response `data`**

```json
{
  "modelId": "cm…",
  "category": "REVENUE",
  "lineItems": [
    {
      "id": "…",
      "code": "REVENUE",
      "category": "REVENUE",
      "cells": [ /* up to 24 recent cells */ ],
      "formulas": []
    }
  ],
  "drivers": [ /* drivers for that category */ ]
}
```

---

## 13. Exports

### 13.1 Board pack / management export

`POST /exports/board-pack` → **201**

```json
{
  "modelId": "cm…",
  "versionId": "cm…",
  "exportType": "BOARD_PACK",
  "meta": { "title": "Board pack May 2026" }
}
```

`exportType` can be `BOARD_PACK` or `MANAGEMENT_REPORT`.

**Response `data`:** `planning_export_jobs` row with `status: "COMPLETED"` and `payloadJson` containing flattened cells:

```json
{
  "id": "cm…",
  "modelId": "cm…",
  "versionId": "cm…",
  "exportType": "BOARD_PACK",
  "status": "COMPLETED",
  "payloadJson": {
    "exportType": "BOARD_PACK",
    "generatedAt": "…",
    "cellCount": 108,
    "cells": [
      {
        "id": "…",
        "lineItemCode": "REVENUE",
        "lineItemName": "Revenue",
        "periodDate": "…",
        "value": 100000,
        "scenarioId": "…",
        "sourceType": "INPUT"
      }
    ],
    "meta": {}
  },
  "completedAt": "…",
  "downloadUrl": "/api/v1/fpa/exports/{id}/download",
  "fileUrl": "/api/v1/fpa/exports/{id}/download"
}
```

---

### 13.2 Get export job

`GET /exports/{id}` → **200**

Returns the job row including `downloadUrl` / `fileUrl` when status is `COMPLETED`.

---

### 13.3 Download export

`GET /exports/{id}/download` → **200** (`application/json` file attachment)

Downloads `payloadJson` as a JSON file (`Content-Disposition: attachment`). Use this for Reports “Export” open/download. **404** if job missing; **400** if not yet completed.

---

## 14. AI stubs

Assist-only. Never approves, locks, or overrides actuals. Rows land in `planning_ai_forecasts` with `status: "DRAFT"`.

### 14.1 Suggest forecast

`POST /ai/suggest` → **201**

```json
{ "modelId": "cm…", "lineItemCode": "REVENUE" }
```

**Response `data`**

```json
{
  "id": "cm…",
  "modelId": "cm…",
  "suggestionType": "FORECAST_SUGGEST",
  "confidence": "0.4000",
  "status": "DRAFT",
  "payloadJson": {
    "method": "SIMPLE_AVG_FORWARD",
    "lineItemCode": "REVENUE",
    "suggestedMonthly": 83333.33,
    "note": "Stub suggestion from recent revenue average; requires human review before apply."
  }
}
```

### 14.2 Commentary draft

`POST /ai/commentary-draft` → **201**

```json
{ "modelId": "cm…", "varianceId": "cm…" }
```

**Response `data`:** AI row with `suggestionType: "COMMENTARY_DRAFT"` and draft text in `payloadJson.commentary`.

---

## 15. Forecast entities

Base: `{host}/api/forecast-entities` (not under `/v1/fpa`). Used by Tax Return Pack and as `entityId` on planning cells.

### 15.1 List

`GET /forecast-entities` → **200**

```json
{
  "success": true,
  "data": [
    {
      "id": "cm…",
      "name": "Arcus Zimbabwe",
      "type": "INTERNAL_SUBSIDIARY",
      "base_currency": "USD",
      "is_default": true,
      "account_count": 120,
      "created_at": "…"
    }
  ]
}
```

### 15.2 Create

`POST /forecast-entities` → **201**

```json
{
  "name": "New Sub",
  "type": "INTERNAL_SUBSIDIARY",
  "base_currency": "USD",
  "clone_from_entity_id": "cm…",
  "portfolio_company_id": null
}
```

`type`: `INTERNAL_SUBSIDIARY` | `EXTERNAL_STARTUP`.

### 15.3 Get

`GET /forecast-entities/{id}` → **200**

### 15.4 Chart of accounts

`GET /forecast-entities/{id}/chart-of-accounts?account_type=&is_active=true&for_posting=false` → **200**

```json
{
  "success": true,
  "data": [
    {
      "id": "cm…",
      "account_no": "4000",
      "account_name": "Revenue",
      "account_type": "Income",
      "natural_balance": "CREDIT",
      "parent_id": null,
      "is_active": true,
      "source_account_id": "cm…"
    }
  ]
}
```

### 15.5 Resync COA

`POST /forecast-entities/{id}/resync-coa` → **200**

Internal subsidiaries only. Response: `{ "entity_id", "accounts_added", "accounts_updated" }`.

---

## 16. Enums & conventions

### Model / version status

| Value | Meaning |
|-------|---------|
| `DRAFT` | Editable |
| `OPEN` / `SUBMITTED` / `APPROVED` | Workflow states (model/version as used) |
| `LOCKED` | Immutable — cell APIs return 403 |
| `ARCHIVED` | Hidden from active planning |

### Cell `sourceType`

`MANUAL` · `INPUT` · `ACTUAL` · `FORECAST` · `BUDGET`

### Cell `valueType`

`INPUT` · `MANUAL` · `FORMULA` · `DRIVER` · `ACTUAL` · `SPREAD` · `COPY_FORWARD` · `AI`

### Line item `lineItemType`

`REVENUE` · `EXPENSE` · `CASH` · `CALC` · `DRIVER` · `OTHER` — drives favourable / unfavourable variance.

### Line item `category`

`REVENUE` · `EXPENSE` · `WORKFORCE` · `CASH` · `CAPEX` · `GENERAL` — used by domain views.

### Task status

`PENDING` · `IN_PROGRESS` · `SUBMITTED` · `RETURNED` · `APPROVED` · `CANCELLED`

### Decimal values

Prisma `Decimal` fields often serialize as **strings** in JSON (e.g. `"100000.0000"`). Parse with `Number(...)` in the UI.

### Typical frontend bootstrap

1. `POST /models` → keep `id`, `defaultVersionId`, `defaultScenarioId`
2. `GET /models/{id}/grid?versionId=&scenarioId=`
3. `POST /models/{id}/cells/update` as users edit
4. `GET /home/dashboard?modelId=` for CFO board
5. `POST /versions/{id}/lock` when board-approved

---

## Cross-links

- Screen map (short): [fpa-api-by-ui-section.md](./fpa-api-by-ui-section.md)
- Concepts / roles / formula dialect: [fpa-backend-requirements.md](./fpa-backend-requirements.md)
- Product SRD: `docs/Arcus_FPA_Planning_Budgeting_Forecasting_SRD_with_Detailed_UI_Inspo (1).pdf`
- Live Try-it: Swagger tag **FP&A Planning** on `/api-docs`
- UAT: `npm run uat:fpa`
