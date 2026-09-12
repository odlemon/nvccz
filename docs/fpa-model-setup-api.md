# FP&A Planning Model Setup — API reference

Backend contracts for the multi-step **Create model** modal on `/forecasting/models`.

| | |
|---|---|
| **Base** | `{host}/api/v1/fpa` |
| **Auth** | `Authorization: Bearer {token}` |
| **Related** | Entities/COA: `{host}/api/forecast-entities` · Departments: `{host}/api/departments` |
| **User flow** | [fpa-user-flow.md](./fpa-user-flow.md) § Phase B |
| **Migration** | `npm run db:migrate:fpa-model-setup` |

Envelope:

```json
{ "success": true, "data": { } }
```

Validation / setup failure:

```json
{
  "success": false,
  "code": "VALIDATION",
  "message": "Model setup validation failed",
  "errors": [
    { "code": "MISSING_NAME", "step": "createModel", "message": "name is required", "field": "name" }
  ]
}
```

---

## Wizard ↔ API map

| Modal step | How it is persisted |
|------------|---------------------|
| Create model (name, currency, …) | Fields on `POST /models/setup` |
| Select model type | `modelType` |
| Select time horizon | `startPeriod`, `endPeriod`, `timeGranularity` |
| Select entities and departments | `entityIds`, `departmentIds` |
| Select chart of accounts | `accountIds` |
| Select dimensions | `dimensions[]` |
| Select baseline | `baseline` |
| Create line items | `lineItems[]` (omit → default pack) |
| Configure formulas | `formulas[]` |
| Configure drivers | `drivers[]` |
| Configure workflow | `workflow` |
| Validate model | Response `validation` + `POST /models/{id}/validate` |
| Open for planning | Use `model.defaultVersionId` / `defaultScenarioId` → worksheet grid |

**Frontend behaviour:** collect the whole draft in the modal, then one **Create model** call. Prefer atomic setup below so a mid-wizard close never leaves an orphan model.

---

## Enums

| Field | Values |
|-------|--------|
| `modelType` | `BUDGET` \| `FORECAST` \| `ROLLING_FORECAST` |
| `timeGranularity` | `MONTHLY` \| `QUARTERLY` \| `ANNUAL` |
| `baseline.mode` | `NONE` \| `ACTUALS_SYNC` \| `PRIOR_FORECAST` |

---

## 1. Atomic setup (P0 — preferred)

### `POST /v1/fpa/models/setup` → **201**

Creates model + BASE scenario + Working version + empty cells + nested config in **one DB transaction**. Preflight errors → **400**, nothing persisted.

#### Request

```json
{
  "name": "FY2026 Operating Plan",
  "modelType": "BUDGET",
  "baseCurrency": "USD",
  "startPeriod": "2026-01-01",
  "endPeriod": "2026-12-01",
  "timeGranularity": "MONTHLY",
  "description": "optional",
  "entityIds": ["ent_…"],
  "departmentIds": ["dept_…"],
  "accountIds": ["acc_…"],
  "dimensions": [{ "key": "REGION", "valueIds": ["…"] }],
  "baseline": { "mode": "NONE", "sourceVersionId": null, "sourceScenarioId": null },
  "lineItems": [
    { "code": "REVENUE", "name": "Revenue", "lineItemType": "REVENUE", "category": "REVENUE" },
    { "code": "COGS", "name": "COGS", "lineItemType": "EXPENSE", "category": "EXPENSE" },
    { "code": "EBITDA", "name": "EBITDA", "lineItemType": "CALC", "category": "REVENUE" }
  ],
  "formulas": [
    { "lineItemCode": "EBITDA", "expression": "LINE('REVENUE') - LINE('COGS')" }
  ],
  "drivers": [
    { "code": "GROWTH", "name": "Growth", "value": 1.05, "category": "GENERAL" }
  ],
  "workflow": {
    "name": "FY2026 Budget Cycle",
    "workflowType": "BUDGET",
    "stages": [],
    "tasks": [{ "title": "Finance input", "assigneeId": null, "departmentId": null }]
  }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | |
| `startPeriod`, `endPeriod` | yes | `YYYY-MM-DD` |
| `modelType` | no | Default `BUDGET` |
| `baseCurrency` | no | Default `USD` |
| `timeGranularity` | no | Default `MONTHLY` |
| `entityIds` | no | Must exist in `forecast_entities` |
| `departmentIds` | no | Must exist in `departments` (`GET /departments`) |
| `accountIds` | no | Entity COA **or** global chart of accounts ids |
| `dimensions` | no | `key` = dimension code; `valueIds` = member ids or codes |
| `baseline` | no | Default mode `NONE` |
| `lineItems` | no | If omitted/empty → default Revenue/COGS/… pack |
| `formulas` | no | `lineItemCode` must match a line item in the same payload |
| `drivers` | no | |
| `workflow` | no | Created only if `workflow.name` is set |

**Baseline**

| `mode` | Behaviour |
|--------|-----------|
| `NONE` | Empty input cells only |
| `PRIOR_FORECAST` | Requires `sourceVersionId`; copies cell values into Working |
| `ACTUALS_SYNC` | After commit, runs GL actuals sync (may be `rowCount: 0`) |

#### Response `data`

```json
{
  "model": {
    "id": "cm…",
    "name": "FY2026 Operating Plan",
    "status": "DRAFT",
    "modelType": "BUDGET",
    "defaultScenarioId": "cm…",
    "defaultVersionId": "cm…"
  },
  "lineItemCount": 3,
  "driverCount": 1,
  "workflowId": "cm…",
  "cellCount": 36,
  "validation": {
    "passed": false,
    "errors": [
      { "code": "MISSING_SCOPE", "step": "entities", "message": "Select at least one entity or department" }
    ]
  }
}
```

`validation` is the same shape as `POST /models/{id}/validate`. Setup still returns **201** if the payload preflight passed; use `validation.passed` for the UI gate before opening the worksheet.

---

## 2. Simple create (fallback)

### `POST /v1/fpa/models` → **201**

Seeds BASE + Working + **default** line items + empty cells only. Does **not** persist scope/COA/dimensions/workflow from the modal.

```json
{
  "name": "FY2026 Operating Plan",
  "modelType": "BUDGET",
  "baseCurrency": "USD",
  "startPeriod": "2026-01-01",
  "endPeriod": "2026-12-01",
  "timeGranularity": "MONTHLY",
  "description": "optional"
}
```

Then call the helpers in §3 if not using `/models/setup`.

---

## 3. Helper endpoints

### 3.1 Scope — `PUT /v1/fpa/models/{id}/scope` → **200**

```json
{ "entityIds": ["ent_…"], "departmentIds": ["dept_…"] }
```

Replaces prior scope. Empty arrays clear bindings.

**Response `data`:** `{ modelId, entityIds, departmentIds }`

---

### 3.2 COA — `PUT /v1/fpa/models/{id}/coa` → **200**

```json
{ "entityId": "ent_…", "accountIds": ["acc_…"] }
```

`entityId` optional (stored on each account binding). Account ids may be entity COA or global COA.

**Response `data`:** `{ modelId, entityId, accountIds }`

---

### 3.3 Dimensions — `PUT /v1/fpa/models/{id}/dimensions` → **200**

```json
{
  "dimensions": [
    { "key": "REGION", "valueIds": ["memberIdOrCode"] }
  ]
}
```

Creates catalog dimension by `key` if missing. Replaces prior model dimension links.

**Response `data`:** `{ modelId, dimensions: [{ key, dimensionId, valueIds }] }`

---

### 3.4 Dimension catalog — `GET /v1/fpa/dimensions` → **200**

```json
{
  "success": true,
  "data": [
    {
      "id": "cm…",
      "key": "REGION",
      "code": "REGION",
      "name": "Region",
      "dimensionType": "GEOGRAPHY",
      "members": [{ "id": "…", "code": "ZW", "name": "Zimbabwe", "parentId": null }]
    }
  ]
}
```

If the catalog is empty, seeds `REGION`, `PRODUCT`, `CHANNEL`.

---

### 3.5 Baseline — `POST /v1/fpa/models/{id}/baseline` → **200**

```json
{
  "mode": "ACTUALS_SYNC",
  "sourceVersionId": null,
  "sourceScenarioId": null
}
```

**Response `data`:** `{ modelId, mode, sourceVersionId, sourceScenarioId, cellsCopied }`

---

### 3.6 Validate — `POST /v1/fpa/models/{id}/validate` → **200**

No body required. Authoritative readiness check for “Open model for planning input”.

```json
{
  "success": true,
  "data": {
    "passed": false,
    "errors": [
      { "code": "MISSING_DIMENSION", "step": "dimensions", "message": "…" },
      { "code": "INVALID_FORMULA", "step": "formulas", "message": "…" },
      { "code": "MISSING_SCOPE", "step": "entities", "message": "…" },
      { "code": "MISSING_COA", "step": "coa", "message": "…" },
      { "code": "NO_LINE_ITEMS", "step": "lineItems", "message": "…" }
    ]
  }
}
```

| `passed` | UI |
|----------|-----|
| `true` | Open worksheet |
| `false` | Show errors; send user back to the matching step |

Common `errors[].code` values: `MISSING_NAME`, `INVALID_PERIOD`, `NO_LINE_ITEMS`, `INVALID_FORMULA`, `UNKNOWN_LINE_REF`, `MISSING_SCOPE`, `MISSING_COA`, `MISSING_DIMENSION`, `MISSING_VERSION`, `UNKNOWN_ENTITY`, `UNKNOWN_DEPARTMENT`, `UNKNOWN_ACCOUNT`.

---

### 3.7 Bulk line items — `POST /v1/fpa/models/{id}/line-items/bulk` → **201**

```json
{
  "lineItems": [
    { "code": "RENT", "name": "Rent", "lineItemType": "EXPENSE", "category": "EXPENSE" }
  ]
}
```

Skips codes that already exist on the model.

---

## 4. Get model (after create)

### `GET /v1/fpa/models/{id}` → **200**

Includes setup bindings for the modal / settings:

- `entityIds`, `departmentIds`, `accountIds`
- `dimensions[]` (`key`, `dimensionId`, `valueIds`)
- `defaultScenarioId`, `defaultVersionId`
- `lineItems`, `scenarios`, `versions`, `drivers`, `workflows`

---

## 5. Lookup APIs used by the modal (not under `/v1/fpa`)

| Purpose | Method | Path |
|---------|--------|------|
| Departments | `GET` | `/api/departments` |
| Legal entities | `GET` | `/api/forecast-entities` |
| Entity COA | `GET` | `/api/forecast-entities/{id}/chart-of-accounts` |

---

## 6. Acceptance checklist

- [ ] Modal does **not** call `POST /models` until finish (or uses `/models/setup` only).
- [ ] Failed setup preflight returns **400** + `errors[]` and creates **no** model.
- [ ] Success returns `defaultScenarioId` / `defaultVersionId` so worksheet can load immediately.
- [ ] `POST /models/{id}/validate` drives the validate gate (Yes → open / No → fix loop).
- [ ] Departments from `GET /departments`; entities/accounts from forecast-entities.

---

## 7. Example: minimal happy path

```http
POST /api/v1/fpa/models/setup
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "FY2026 Operating Plan",
  "modelType": "BUDGET",
  "baseCurrency": "USD",
  "startPeriod": "2026-01-01",
  "endPeriod": "2026-12-01",
  "timeGranularity": "MONTHLY",
  "entityIds": ["ent_…"],
  "departmentIds": ["dept_…"],
  "accountIds": ["acc_…"],
  "baseline": { "mode": "NONE" },
  "lineItems": [
    { "code": "REVENUE", "name": "Revenue", "lineItemType": "REVENUE", "category": "REVENUE" },
    { "code": "COGS", "name": "COGS", "lineItemType": "EXPENSE", "category": "EXPENSE" },
    { "code": "EBITDA", "name": "EBITDA", "lineItemType": "CALC", "category": "REVENUE" }
  ],
  "formulas": [{ "lineItemCode": "EBITDA", "expression": "LINE('REVENUE') - LINE('COGS')" }],
  "drivers": [{ "code": "GROWTH", "name": "Growth", "value": 1.05 }],
  "workflow": { "name": "FY2026 Budget Cycle", "workflowType": "BUDGET", "tasks": [{ "title": "Finance input" }] }
}
```

Then:

```http
GET /api/v1/fpa/models/{id}/grid?versionId={defaultVersionId}&scenarioId={defaultScenarioId}
```
