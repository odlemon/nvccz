# FP&A Model Builder API — Detailed reference

**Audience:** Frontend  
**Base URL:** `{host}/api/v1/fpa` (e.g. `https://dev-api.arcus.co.zw/api/v1/fpa`)  
**Auth:** `Authorization: Bearer <token>`  
**Envelope:** All success responses use `{ "success": true, "data": … }`. Errors use `{ "success": false, "code": "…", "message": "…", "errors"?: […] }` with the appropriate HTTP status.

**Related**

- Navigation brief: [fpa-model-builder-list-create-navigation.md](./fpa-model-builder-list-create-navigation.md)  
- FE integration prompt: [Model_Builder_Backend_Integration_Prompt.md](./Model_Builder_Backend_Integration_Prompt.md)  
- Mental model: [fpa-model-planning-vs-builder.md](./fpa-model-planning-vs-builder.md)  
- **Detailed workspace (A.4):** [fpa-model-builder-detailed-workspace-api.md](./fpa-model-builder-detailed-workspace-api.md)

**Out of scope here:** Budget cycles, Workflow approvals.

---

## Conventions

### Dual field names (accept either; responses often return both)

| Prefer (FE) | Also accepted / returned |
|-------------|--------------------------|
| `parentModuleId` | `parentId` |
| `calculationOrder` | `calcOrder` |
| `displayScale` | `decimalPlaces` |
| `currency` | `currencyCode` |

### Status enums

| Entity | Values |
|--------|--------|
| Model `status` | `DRAFT` \| `VALID` \| `INVALID` \| `PUBLISHED` \| `ARCHIVED` |
| Module `status` | `DRAFT` \| `VALID` \| `INVALID` \| `PUBLISHED` \| `ARCHIVED` |
| Version `status` | `DRAFT` \| `LOCKED` \| `ARCHIVED` (publish → `LOCKED`) |
| Validation severity | `ERROR` \| `WARNING` \| `INFO` |
| Edge `kind` | `direct` \| `indirect` \| `external` \| `invalid` |

### Permissions

Configure Builder APIs require FP&A approve/admin capability. Unauthorized → **403**.

---

## 1. Models

### 1.1 List models

`GET /models`

**Query (optional)**

| Param | Type | Notes |
|-------|------|--------|
| `status` | string | Filter by status |
| `ownerUserId` | string | Filter by owner |
| `q` | string | Search name / type / status |

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "cm…",
      "name": "FY2026 Financial Model",
      "description": null,
      "modelType": "BUDGET",
      "status": "DRAFT",
      "baseCurrency": "USD",
      "startPeriod": "2026-01-01T00:00:00.000Z",
      "endPeriod": "2030-12-31T00:00:00.000Z",
      "timeGranularity": "MONTHLY",
      "updatedAt": "2026-07-12T10:00:00.000Z",
      "createdAt": "2026-07-12T09:00:00.000Z",
      "publishedAt": null,
      "ownerUserId": "cm…",
      "ownerName": "Sarah Delgado",
      "_count": { "lineItems": 9, "scenarios": 1, "versions": 1 }
    }
  ]
}
```

---

### 1.2 Create model

`POST /models` → **201**

**Request**

```json
{
  "name": "FY2026 Financial Model",
  "description": "Optional",
  "modelType": "BUDGET",
  "baseCurrency": "USD",
  "startPeriod": "2026-01-01",
  "endPeriod": "2030-12-31",
  "timeGranularity": "MONTHLY"
}
```

| Field | Required | Values / notes |
|-------|----------|----------------|
| `name` | yes | |
| `description` | no | |
| `modelType` | no (default `BUDGET`) | `BUDGET` \| `FORECAST` \| `ROLLING_FORECAST` |
| `baseCurrency` | no (default `USD`) | ISO 3-letter |
| `startPeriod` | yes | Date |
| `endPeriod` | yes | After start |
| `timeGranularity` | no (default `MONTHLY`) | `MONTHLY` \| `QUARTERLY` \| `ANNUAL` |

**Response `201`**

```json
{
  "success": true,
  "data": {
    "id": "cm…",
    "name": "FY2026 Financial Model",
    "modelType": "BUDGET",
    "status": "DRAFT",
    "baseCurrency": "USD",
    "startPeriod": "2026-01-01T00:00:00.000Z",
    "endPeriod": "2030-12-31T00:00:00.000Z",
    "timeGranularity": "MONTHLY",
    "defaultVersionId": "ver…",
    "defaultScenarioId": "scn…",
    "versions": [{ "id": "ver…", "name": "Working", "status": "DRAFT" }],
    "scenarios": [{ "id": "scn…", "name": "BASE", "isDefault": true, "isOfficial": true }],
    "lineItemCount": 9,
    "cellCount": 1080
  }
}
```

Creates a Working version, BASE scenario, default seed line items, and empty cells for the horizon.

---

### 1.3 Get model

`GET /models/:modelId`

**Response `200`** (abridged)

```json
{
  "success": true,
  "data": {
    "id": "cm…",
    "name": "FY2026 Financial Model",
    "status": "DRAFT",
    "baseCurrency": "USD",
    "startPeriod": "2026-01-01T00:00:00.000Z",
    "endPeriod": "2030-12-31T00:00:00.000Z",
    "timeGranularity": "MONTHLY",
    "publishedAt": null,
    "publishedById": null,
    "publishedByName": null,
    "defaultVersionId": "ver…",
    "defaultScenarioId": "scn…",
    "versions": [
      {
        "id": "ver…",
        "name": "Working",
        "status": "LOCKED",
        "publishedAt": "2026-07-12T18:00:00.000Z",
        "publishedById": "user…",
        "publishedByName": "Sarah Delgado",
        "checksum": "a1b2…"
      }
    ],
    "scenarios": [
      { "id": "scn…", "name": "BASE", "isOfficial": true, "status": "DRAFT" }
    ],
    "lineItems": [/* … */],
    "entityIds": [],
    "departmentIds": [],
    "accountIds": [],
    "dimensions": []
  }
}
```

After publish, `publishedAt` / `publishedByName` are set for the header “Last Published”.

---

### 1.4 Update model

`PUT /models/:modelId`

**Request** (partial)

```json
{
  "name": "FY2026 Financial Model (v2)",
  "description": "…",
  "modelType": "BUDGET",
  "baseCurrency": "USD",
  "startPeriod": "2026-01-01",
  "endPeriod": "2030-12-31",
  "timeGranularity": "MONTHLY"
}
```

**Response `200`:** same shape as get model.

---

### 1.5 Archive model

`POST /models/:modelId/archive`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "cm…",
    "status": "ARCHIVED"
  }
}
```

---

## 2. Modules

### 2.1 List modules (tree)

`GET /models/:modelId/modules`

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "mod_rev",
      "modelId": "cm…",
      "code": "REVENUE_PLANNING",
      "name": "Revenue Planning",
      "description": null,
      "parentId": null,
      "parentModuleId": null,
      "calcOrder": 10,
      "calculationOrder": 10,
      "sortOrder": 10,
      "status": "DRAFT",
      "dimensionKeys": ["Time", "Product", "Region", "Version", "Scenario"],
      "lineItemCount": 8,
      "createdAt": "…",
      "updatedAt": "…",
      "children": [
        {
          "id": "mod_units",
          "parentId": "mod_rev",
          "parentModuleId": "mod_rev",
          "name": "Units & Pricing",
          "code": "UNITS_PRICING",
          "calculationOrder": 11,
          "dimensionKeys": ["Time", "Product", "Region", "Version", "Scenario"],
          "lineItemCount": 5,
          "children": []
        }
      ]
    }
  ]
}
```

---

### 2.2 Create module

`POST /models/:modelId/modules` → **201**

**Request**

```json
{
  "name": "Units & Pricing",
  "code": "UNITS_PRICING",
  "parentModuleId": "mod_rev",
  "dimensionKeys": ["Time", "Product", "Region", "Version", "Scenario"],
  "calculationOrder": 12,
  "description": "Optional"
}
```

`parentId` is accepted as an alias of `parentModuleId`. `calcOrder` aliases `calculationOrder`.

**Response `201`**

```json
{
  "success": true,
  "data": {
    "id": "mod_units",
    "modelId": "cm…",
    "code": "UNITS_PRICING",
    "name": "Units & Pricing",
    "parentId": "mod_rev",
    "parentModuleId": "mod_rev",
    "calcOrder": 12,
    "calculationOrder": 12,
    "status": "DRAFT",
    "dimensionKeys": ["Time", "Product", "Region", "Version", "Scenario"],
    "lineItemCount": 0
  }
}
```

---

### 2.3 Update module

`PUT /modules/:moduleId`

**Request**

```json
{
  "name": "Units & Pricing (v2)",
  "dimensionKeys": ["Time", "Product", "Region"],
  "calculationOrder": 15,
  "status": "DRAFT",
  "parentModuleId": "mod_rev"
}
```

**Response `200`:** serialized module (same fields as create).

---

### 2.4 Set module dimensions

`PUT /modules/:moduleId/dimensions`

**Request**

```json
{
  "dimensionKeys": ["Time", "Product", "Region", "Version", "Scenario"]
}
```

**Response `200`:** full module with updated `dimensionKeys`.

---

### 2.5 Duplicate module

`POST /modules/:moduleId/duplicate` → **201**

**Request:** empty body `{}`

**Response `201`**

```json
{
  "success": true,
  "data": {
    "id": "mod_copy",
    "name": "Units & Pricing (copy)",
    "code": "UNITS_PRICING_COPY",
    "parentModuleId": "mod_rev",
    "dimensionKeys": ["Time", "Product", "Region", "Version", "Scenario"],
    "lineItemCount": 5,
    "moduleIdMap": { "mod_units": "mod_copy" },
    "lineItemIdMap": { "li_old": "li_new" }
  }
}
```

Copies subtree, line items, and formulas with new ids.

---

### 2.6 Delete module

`DELETE /modules/:moduleId`  
`DELETE /modules/:moduleId?cascade=true`

| Case | Status | Code |
|------|--------|------|
| Empty leaf | 200 | deleted |
| Has children or LIs, no cascade | **409** | `MODULE_HAS_CHILDREN` / `MODULE_NOT_EMPTY` |
| `?cascade=true` | 200 | deletes children, LIs, formulas, cells |

**Response `200`**

```json
{
  "success": true,
  "data": { "id": "mod_units", "deleted": true, "cascade": false }
}
```

---

## 3. Line items

### 3.1 List line items

`GET /models/:modelId/line-items`

**Query**

| Param | Notes |
|-------|--------|
| `moduleId` | Filter to module |
| `category` | Optional |
| `type` | `INPUT` \| `CALCULATED` (optional) |

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "li_units",
      "modelId": "cm…",
      "moduleId": "mod_units",
      "moduleName": "Units & Pricing",
      "code": "UNITS",
      "name": "Units Sold",
      "description": "Volume driver",
      "lineItemType": "INPUT",
      "category": "GENERAL",
      "dataType": "NUMBER",
      "summaryMethod": "SUM",
      "format": "Number",
      "currencyCode": null,
      "currency": null,
      "decimalPlaces": 0,
      "displayScale": 0,
      "dimensionKeys": ["Time", "Product", "Region", "Version", "Scenario"],
      "isEditable": true,
      "sortOrder": 10,
      "formulaId": null,
      "formulas": [],
      "createdAt": "…",
      "updatedAt": "…",
      "createdByName": null,
      "updatedByName": "Sarah Delgado"
    }
  ]
}
```

---

### 3.2 Create line item

`POST /models/:modelId/line-items` → **201**

**Request**

```json
{
  "code": "UNITS",
  "name": "Units Sold",
  "lineItemType": "INPUT",
  "moduleId": "mod_units",
  "dataType": "NUMBER",
  "format": "Number",
  "summaryMethod": "SUM",
  "isEditable": true,
  "displayScale": 0,
  "description": "Volume driver",
  "dimensionKeys": ["Time", "Product", "Region", "Version", "Scenario"],
  "sortOrder": 10
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `code` | yes | Unique per model; stored UPPER |
| `name` | yes | |
| `moduleId` | strongly recommended | Builder leaf context |
| `lineItemType` | no (default `INPUT`) | `INPUT` \| `CALCULATED` \| … |
| `displayScale` / `decimalPlaces` | no | |
| `currency` / `currencyCode` | no | |

**Response `201`:** full line item object (same as list item).

---

### 3.3 Update line item (Properties panel)

`PUT /line-items/:id`

**Request** (partial OK)

```json
{
  "name": "Units Sold",
  "description": "Volume driver",
  "format": "Number",
  "currency": null,
  "displayScale": 0,
  "summaryMethod": "SUM",
  "dimensionKeys": ["Time", "Product", "Region", "Version", "Scenario"],
  "moduleId": "mod_units"
}
```

**Response `200`:** full line item.

---

### 3.4 Reorder

`PUT /line-items/:id/reorder`

**Request**

```json
{ "sortOrder": 20 }
```

**Response `200`:** full line item.

---

### 3.5 Line item dimensions

`PUT /line-items/:id/dimensions`

**Request**

```json
{
  "dimensionKeys": ["Time", "Product"]
}
```

**Response `200`:** full line item.

---

### 3.6 Delete line item

`DELETE /line-items/:id`

**Response `200`**

```json
{
  "success": true,
  "data": { "deleted": true, "id": "li_units" }
}
```

---

### 3.7 Bulk create (optional / templates fallback)

`POST /models/:modelId/line-items/bulk` → **201**

**Request**

```json
{
  "lineItems": [
    {
      "code": "UNITS",
      "name": "Units Sold",
      "lineItemType": "INPUT",
      "moduleId": "mod_units"
    }
  ]
}
```

**Response `201`**

```json
{
  "success": true,
  "data": {
    "modelId": "cm…",
    "count": 1,
    "lineItems": [/* created or existing rows */]
  }
}
```

---

## 4. Formulas

### 4.1 Validate expression

`POST /formulas/validate`

**Request**

```json
{
  "expression": "LINE('UNITS') * LINE('PRICE')"
}
```

Bracket style `[Units Sold] * [Price]` may be accepted by FE before convert; engine prefers `LINE('CODE')`.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "valid": true,
    "message": null,
    "lineCodes": ["UNITS", "PRICE"],
    "driverCodes": []
  }
}
```

---

### 4.2 Dependency check

`POST /formulas/dependency-check`

**Request**

```json
{
  "modelId": "cm…",
  "expression": "LINE('UNITS') * LINE('PRICE')",
  "formulaId": null
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "circular": false,
    "path": [],
    "lineCodes": ["UNITS", "PRICE"]
  }
}
```

If circular: `circular: true`, `path: ["REVENUE", "UNITS", "REVENUE"]`.

---

### 4.3 Create formula

`POST /models/:modelId/formulas` → **201**

**Request**

```json
{
  "lineItemId": "li_revenue",
  "expression": "LINE('UNITS') * LINE('PRICE')"
}
```

**Response `201`**

```json
{
  "success": true,
  "data": {
    "formula": {
      "id": "f…",
      "modelId": "cm…",
      "lineItemId": "li_revenue",
      "expression": "LINE('UNITS') * LINE('PRICE')",
      "isValid": true,
      "validationMsg": null
    },
    "impact": {
      "precedents": [
        {
          "id": "li_units",
          "code": "UNITS",
          "name": "Units Sold",
          "moduleId": "mod_units",
          "moduleName": "Units & Pricing"
        }
      ],
      "dependents": [],
      "usedIn": []
    },
    "graphDelta": {
      "upsertEdges": [
        {
          "id": "e_li_units_li_revenue",
          "sourceLineItemId": "li_units",
          "targetLineItemId": "li_revenue",
          "kind": "direct"
        }
      ],
      "removeEdgeIds": []
    }
  }
}
```

Circular → **400** `CIRCULAR`.

---

### 4.4 Update formula

`PUT /formulas/:formulaId`

**Request**

```json
{
  "expression": "LINE('UNITS') * LINE('PRICE')"
}
```

**Response `200`:** same enrichment as create (`formula` + `impact` + `graphDelta`).

---

### 4.5 Impact map

`GET /formulas/:formulaId/impact-map`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "precedents": [
      {
        "id": "li_units",
        "code": "UNITS",
        "name": "Units Sold",
        "moduleId": "mod_units",
        "moduleName": "Units & Pricing"
      }
    ],
    "dependents": [
      {
        "id": "li_net",
        "code": "NET_REV",
        "name": "Net Revenue",
        "moduleId": "mod_units",
        "moduleName": "Units & Pricing"
      }
    ],
    "usedIn": [
      {
        "id": "li_net",
        "code": "NET_REV",
        "name": "Net Revenue",
        "moduleId": "mod_units",
        "moduleName": "Units & Pricing"
      }
    ],
    "formula": { "id": "f…", "expression": "…" },
    "lineCodes": ["UNITS", "PRICE"],
    "driverCodes": []
  }
}
```

`usedIn` is an alias of `dependents` for FE.

Also available:

- `GET /line-items/:id/dependencies` — precedents / dependents for a line item  
- `GET /line-items/:id/trace?versionId=&scenarioId=` — formula trace + sample values  

---

## 5. Validate model

### 5.1 Full validate

`POST /models/:modelId/validate`

**Request:** `{}` or empty body

**Response `200`**

```json
{
  "success": true,
  "data": {
    "passed": false,
    "errors": [
      {
        "code": "CIRCULAR_REFERENCE",
        "message": "Circular reference detected",
        "severity": "ERROR",
        "category": "DEPENDENCY",
        "lineItemId": "li_revenue",
        "moduleId": "mod_rev",
        "field": "Revenue",
        "type": "DEPENDENCY"
      }
    ],
    "warnings": [
      {
        "code": "MISSING_FORMULA",
        "message": "Calculated line item Gross Profit has no formula",
        "severity": "WARNING",
        "category": "FORMULA",
        "lineItemId": "li_gp",
        "moduleId": null,
        "field": "Gross Profit"
      }
    ],
    "info": [],
    "circular": true,
    "circularPath": ["Revenue", "Units", "Revenue"],
    "circularCheck": {
      "passed": false,
      "path": ["REVENUE", "UNITS", "REVENUE"]
    },
    "summary": {
      "total": 5,
      "passed": 2,
      "warnings": 1,
      "errors": 1,
      "infos": 0
    },
    "issues": [/* union of errors + warnings + info */]
  }
}
```

**Categories:** `FORMULA` \| `DEPENDENCY` \| `MAPPING` \| `DIMENSION` \| `DATA_TYPE` \| `CURRENCY` \| `TIME` \| `SECURITY` \| `PERFORMANCE`

Updates model `status` to `VALID` / `INVALID` (unless already `ARCHIVED` / stays `PUBLISHED` if still clean).

### 5.2 Validation summary

`GET /models/:modelId/validation-summary`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "total": 5,
    "passed": 2,
    "warnings": 1,
    "errors": 1,
    "infos": 0,
    "circular": false,
    "circularPath": [],
    "circularCheck": { "passed": true, "path": null },
    "passed": true
  }
}
```

---

## 6. Publish

Preferred: version publish (enables FE Publish button).

### 6.1 Publish version

`POST /versions/:versionId/publish`

**Request**

```json
{
  "notes": "FY26 v1 structure",
  "notifyUserIds": []
}
```

`notifyUserIds` is accepted and ignored for MVP (no notifications).

**Response `200`**

After publish the published version is `LOCKED`. The API **also creates a new `DRAFT` working copy** and returns its id so Builder can switch immediately (do not leave the UI on the locked version).

```json
{
  "success": true,
  "data": {
    "modelId": "cm…",
    "versionId": "ver…",
    "publishedVersionId": "ver…",
    "workingCopyVersionId": "ver-working…",
    "workingCopy": { "id": "ver-working…", "status": "DRAFT", "name": "… (working)" },
    "message": "Published version is LOCKED. Switch Builder to workingCopyVersionId (new DRAFT) for further edits.",
    "publishedBy": "user…",
    "publishedById": "user…",
    "publishedByName": "Sarah Delgado",
    "publishedAt": "2026-07-12T18:00:00.000Z",
    "checksum": "a1b2c3…",
    "status": "PUBLISHED",
    "versionStatus": "LOCKED",
    "validationResult": {
      "passed": true,
      "errors": [],
      "warnings": []
    },
    "modulesChanged": [],
    "lineItemsChanged": [],
    "formulaChanges": [],
    "mappingChanges": [],
    "notes": "FY26 v1 structure"
  }
}
```

**Blocked `409`**

```json
{
  "success": false,
  "code": "PUBLISH_BLOCKED",
  "message": "Fix validation errors before publishing",
  "errors": [
    { "code": "CIRCULAR_REFERENCE", "message": "…", "step": "DEPENDENCY" }
  ]
}
```

Gates: any `severity=ERROR` or `circular=true`. Warnings do **not** block.

Setup codes are always **ERROR** when present and block publish: `MISSING_SCOPE`, `MISSING_COA`, `MISSING_DIMENSION`, `MISSING_NAME`, `NO_LINE_ITEMS`, `MISSING_VERSION`.  
`MISSING_FORMULA` is a **WARNING** and does not block.

Side effects: version → `LOCKED` + `publishedAt` / `checksum`; model → `PUBLISHED` + `publishedAt` / `publishedById`; cells locked.

**FE display:** use `publishedByName` on the model and on each `versions[]` entry — never render `publishedById` as the name.

### 6.2 Publish model (alias)

`POST /models/:modelId/publish`

Same body optional. Publishes the model’s first `DRAFT` version (else first non-archived). Response matches version publish.

---

## 7. Dependency graph

### 7.1 FE graph (preferred)

`GET /models/:modelId/dependency-graph`

**Query**

| Param | Values |
|-------|--------|
| `view` | `module` (default) \| `line-item` |
| `moduleId` | optional focus |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "circular": false,
    "circularPath": [],
    "view": "module",
    "modules": [
      {
        "id": "mod_units",
        "name": "Units & Pricing",
        "lineItems": [
          { "id": "li_units", "code": "UNITS", "name": "Units Sold", "kind": "INPUT" },
          { "id": "li_price", "code": "PRICE", "name": "Price", "kind": "INPUT" },
          { "id": "li_rev", "code": "REV", "name": "Revenue", "kind": "CALCULATED" }
        ]
      }
    ],
    "edges": [
      {
        "id": "e_li_units_li_rev",
        "sourceLineItemId": "li_units",
        "targetLineItemId": "li_rev",
        "kind": "direct"
      },
      {
        "id": "e_li_price_li_rev",
        "sourceLineItemId": "li_price",
        "targetLineItemId": "li_rev",
        "kind": "direct"
      }
    ]
  }
}
```

| `kind` | Meaning |
|--------|---------|
| `direct` | Formula references source |
| `indirect` | 1-hop transitive |
| `external` | Cross-module direct |
| `invalid` | From invalid formula |

### 7.2 Legacy map

`GET /models/:modelId/dependency-map?view=MODULE|LINE&moduleId=`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "view": "MODULE",
    "modelId": "cm…",
    "nodes": [{ "id": "mod…", "type": "MODULE", "label": "…", "lineItemIds": [] }],
    "edges": [{ "from": "modA", "to": "modB", "kind": "DIRECT", "via": "…" }]
  }
}
```

---

## 8. Grid & cells

### 8.1 Get grid

`GET /models/:modelId/grid?versionId=&scenarioId=&pageSize=`

**Response `200`** (shape includes periods + cells; FE may map to rows)

```json
{
  "success": true,
  "data": {
    "modelId": "cm…",
    "versionId": "ver…",
    "scenarioId": "scn…",
    "page": 1,
    "pageSize": 100,
    "total": 120,
    "periods": [
      { "periodDate": "2026-01-01", "periodRole": "FORECAST" }
    ],
    "cells": [
      {
        "id": "cell…",
        "lineItemId": "li_units",
        "periodDate": "2026-01-01T00:00:00.000Z",
        "value": 1000,
        "isEditable": true,
        "cellStatus": "EDITABLE",
        "lineItem": {
          "id": "li_units",
          "code": "UNITS",
          "name": "Units Sold",
          "lineItemType": "INPUT"
        }
      }
    ],
    "lineItems": [/* catalogue */],
    "ownerName": "Sarah Delgado"
  }
}
```

### 8.2 Update cells (FE preferred)

`PUT /models/:modelId/grid/cells`

**Request**

```json
{
  "versionId": "ver…",
  "scenarioId": "scn…",
  "updates": [
    { "lineItemId": "li_units", "periodKey": "2026-01", "value": 1200 },
    { "lineItemId": "li_units", "periodDate": "2026-02-01", "value": 1300 }
  ]
}
```

`periodKey` `YYYY-MM` is expanded to `YYYY-MM-01`.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "updated": 2,
    "cells": [/* updated cell objects */]
  }
}
```

Rules: CALCULATED / locked cells rejected; INPUT only when editable.

### 8.3 Legacy single cell

`POST /models/:modelId/cells/update`

**Request**

```json
{
  "versionId": "ver…",
  "scenarioId": "scn…",
  "lineItemId": "li_units",
  "periodDate": "2026-01-01",
  "value": 1200
}
```

---

## 9. Templates

### 9.1 Catalog

`GET /line-item-templates`

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "saas-revenue",
      "name": "SaaS Revenue Pack",
      "description": "Units, price, revenue, discounts, net revenue",
      "lineItems": [
        {
          "code": "UNITS",
          "name": "Units Sold",
          "lineItemType": "INPUT",
          "dataType": "NUMBER",
          "format": "Number",
          "summaryMethod": "SUM",
          "isEditable": true,
          "expression": null
        },
        {
          "code": "REVENUE",
          "name": "Revenue",
          "lineItemType": "CALCULATED",
          "expression": "[Units Sold] * [Price]"
        }
      ]
    },
    { "id": "cogs-margin", "name": "COGS & Margin Pack", "description": "…", "lineItems": [] },
    { "id": "discount-adj", "name": "Discount & Adjustments", "description": "…", "lineItems": [] },
    { "id": "workforce-drivers", "name": "Workforce Drivers", "description": "…", "lineItems": [] }
  ]
}
```

### 9.2 Apply template

`POST /models/:modelId/modules/:moduleId/apply-template` → **201**

**Request**

```json
{
  "templateId": "saas-revenue"
}
```

**Response `201`**

```json
{
  "success": true,
  "data": {
    "templateId": "saas-revenue",
    "moduleId": "mod_units",
    "lineItems": [/* created/updated LIs */],
    "formulas": [/* created/updated formulas */]
  }
}
```

---

## 10. Audit / change history

### 10.1 FE audit (drawer + History tab)

`GET /models/:modelId/audit`

**Query:** `limit`, `cursor` / `offset`, `q`, `action`, `userId`, `from`, `to`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "id": "aud_1",
        "at": "2026-07-12T12:00:00.000Z",
        "userId": "…",
        "userName": "Sarah Delgado",
        "action": "FORMULA_UPDATE",
        "entityType": "LINE_ITEM",
        "entityId": "li_rev",
        "summary": "Updated formula on Revenue",
        "before": { "expression": "LINE('UNITS')" },
        "after": { "expression": "LINE('UNITS') * LINE('PRICE')" }
      }
    ],
    "nextCursor": null
  }
}
```

### 10.2 Legacy audit logs

`GET /models/:modelId/audit-logs` → `data` is a **bare array** of the same entry objects (no `{ entries }` wrapper). Pass `?format=fe` to get the FE wrapper.

---

## 11. Versions (workspace)

### 11.1 Test calculation

`POST /versions/:versionId/test-calculation`

**Request**

```json
{
  "scenarioId": "scn…",
  "moduleId": null,
  "pageSize": 500
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "versionId": "ver…",
    "scenarioId": "scn…",
    "calculatedAt": "2026-07-12T18:05:00.000Z",
    "message": "Calculation preview refreshed",
    "grid": { /* same shape as GET grid */ }
  }
}
```

### 11.2 Other version routes (existing)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/versions` | Create version `{ modelId, name, copyFromVersionId? }` |
| `POST` | `/versions/:id/seed-cells` | Seed empty cells |
| `POST` | `/versions/:id/lock` | Lock without full publish stamp |
| `POST` | `/versions/:id/request-reopen` | New working copy from locked |
| `POST` | `/versions/:id/archive` | Archive version |

---

## 12. Dimensions (catalog + model attach)

### 12.1 Catalog

`GET /dimensions`

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "dim…",
      "key": "Product",
      "code": "PRODUCT",
      "name": "Product",
      "members": [
        { "id": "mem…", "code": "SKU1", "name": "SKU 1", "parentId": null, "active": true }
      ]
    }
  ]
}
```

### 12.2 Attach to model

`PUT /models/:modelId/dimensions`

**Request**

```json
{
  "dimensions": [
    { "key": "Product", "valueIds": ["mem1", "mem2"] }
  ]
}
```

Module / line-item dimension membership uses `dimensionKeys` on those entities (see §§2.4, 3.5).

---

## 13. Error reference

| HTTP | `code` | When |
|------|--------|------|
| 400 | `VALIDATION` | Missing/invalid fields |
| 400 | `CIRCULAR` | Formula save would create a cycle |
| 403 | (access) | Not allowed to configure Builder |
| 404 | `NOT_FOUND` | Model / module / LI / formula / version |
| 409 | `PUBLISH_BLOCKED` | Validate errors or circular |
| 409 | `MODULE_NOT_EMPTY` | Delete module with LIs (no cascade) |
| 409 | `MODULE_HAS_CHILDREN` | Delete module with children (no cascade) |

---

## 14. Suggested FE bootstrap sequence

```http
GET  /models
POST /models                          → navigate /model-builder/{id}
GET  /models/{id}
GET  /models/{id}/modules
GET  /models/{id}/line-items
GET  /dimensions
GET  /models/{id}/grid?versionId=&scenarioId=
GET  /models/{id}/dependency-graph
```

After edits: patch from mutation responses; call `POST …/validate` before `POST /versions/{id}/publish`.

---

## 15. UAT / migration

```bash
npm run db:migrate:fpa-model-builder-fe-contract
npx prisma generate
npm run uat:fpa:model-builder
npm run uat:fpa:model-builder-fe
```

Live host: `https://dev-api.arcus.co.zw/api`
