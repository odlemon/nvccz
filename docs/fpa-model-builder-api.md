# FP&A Model Builder API (A.3 / A.4)

Base: `{host}/api/v1/fpa`  
Auth: `Authorization: Bearer <token>`  
Audience: Model Builder FE (FP&A admin / approve roles)

Related: [fpa-model-planning-vs-builder.md](./fpa-model-planning-vs-builder.md) · [fpa-model-builder-planning-frontend-stories.md](./fpa-model-builder-planning-frontend-stories.md)

**Out of scope here:** Budget cycles, Workflow approvals, data-mapping board, impact-preview sandbox (follow-up).

---

## Status enums

| Model `status` | Meaning |
|----------------|---------|
| `DRAFT` | New / editing |
| `VALID` | Last validate passed (not yet published, or re-validated) |
| `INVALID` | Last validate has ERROR / circular |
| `PUBLISHED` | Available for Model Planning |
| `ARCHIVED` | Archived |

---

## Modules

### List (tree + counts)

`GET /models/{modelId}/modules`

```json
{
  "success": true,
  "data": [
    {
      "id": "…",
      "code": "REVENUE",
      "name": "Revenue Planning",
      "parentId": null,
      "lineItemCount": 8,
      "calcOrder": 1,
      "children": [
        { "id": "…", "code": "UNITS_PRICING", "name": "Units & Pricing", "lineItemCount": 10, "children": [] }
      ]
    }
  ]
}
```

### Create

`POST /models/{modelId}/modules`  
Body: `{ "name": "Units & Pricing", "code?": "UNITS_PRICING", "description?", "parentId?", "calcOrder?", "sortOrder?" }`

### Update / Delete

`PUT /modules/{moduleId}` · `DELETE /modules/{moduleId}`  
Delete blocked if module has line items or children (`409`).

---

## Line items

`GET /models/{modelId}/line-items?moduleId=` — filter by module  
`POST /models/{modelId}/line-items` — body may include `moduleId`, `currencyCode`, `decimalPlaces`  
`PUT /line-items/{id}` · `DELETE /line-items/{id}`

### Dependencies (Properties → Used In)

`GET /line-items/{id}/dependencies`

```json
{
  "precedents": [{ "id": "…", "name": "Units Sold", "modulePath": "Units & Pricing" }],
  "dependents": [{ "id": "…", "name": "Gross Profit", "modulePath": "…" }],
  "usedInCount": 2,
  "expression": "LINE('UNITS') * LINE('PRICE')"
}
```

### Formula Trace (A.4)

`GET /line-items/{id}/trace?versionId=&scenarioId=`

Returns precedents, dependents, `calculationChain` nodes/edges, optional summed cell values when version/scenario provided.

---

## Dependency map (A.3)

`GET /models/{modelId}/dependency-map?view=MODULE|LINE&moduleId=`

```json
{
  "view": "MODULE",
  "nodes": [{ "id": "…", "type": "MODULE", "label": "Units & Pricing", "lineItems": ["Units Sold", "Price"] }],
  "edges": [{ "from": "…", "to": "…", "kind": "DIRECT", "via": "Price → Revenue" }]
}
```

Edges derived from formula `LINE()` refs and `PlanningFormulaDependency`.

---

## Validate + summary (header chips / Exceptions / donut)

`POST /models/{modelId}/validate`

```json
{
  "success": true,
  "data": {
    "passed": false,
    "errors": [{ "code": "MISSING_COA", "step": "coa", "message": "…" }],
    "circularCheck": { "passed": true, "path": null },
    "summary": { "total": 13, "passed": 9, "warnings": 3, "errors": 1, "infos": 0 },
    "issues": [
      { "severity": "ERROR", "impact": "HIGH", "code": "MISSING_COA", "type": "SETUP", "message": "…", "lineItemId": null }
    ]
  }
}
```

`GET /models/{modelId}/validation-summary` — `{ total, passed, warnings, errors, infos, circularCheck, passed }`

Updates model `status` to `VALID` / `INVALID` (keeps `PUBLISHED` if still clean).

---

## Audit log (Change History)

`GET /models/{modelId}/audit-logs?actionType=&userId=&from=&to=&page=&limit=`

```json
{
  "success": true,
  "data": [
    {
      "time": "2026-05-12T09:12:00.000Z",
      "userName": "Michael Chen",
      "action": "FORMULA_UPDATE",
      "details": "EBITDA"
    }
  ]
}
```

---

## Publish

`POST /models/{modelId}/publish`

- Blocked (`409 PUBLISH_BLOCKED`) if any ERROR issue or circular fail.  
- On success: `status=PUBLISHED`, `publishedAt`, `publishedById` / `publishedByName`.

```json
{
  "success": true,
  "data": {
    "id": "…",
    "status": "PUBLISHED",
    "publishedAt": "…",
    "publishedByName": "Sarah Delgado"
  }
}
```

---

## Migration

```bash
npm run db:migrate:fpa-model-builder-modules
npx prisma generate
```

Creates `planning_modules`, adds `module_id` / currency / decimal / updated_by on line items, `published_at` / `published_by` on models, backfills modules from `category`.

UAT: `npm run uat:fpa:model-builder`

---

## Acceptance checklist

- [ ] Modules tree with counts  
- [ ] Module-filtered line items; PUT/DELETE line items  
- [ ] Dependency map returns edges  
- [ ] Validate returns circularCheck + summary + issues  
- [ ] Audit logs list  
- [ ] Publish blocked on errors; succeeds when clean  
- [ ] No budget-cycle API changes
