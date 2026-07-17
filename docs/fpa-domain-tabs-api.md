# FP&A Domain tabs API (Workforce / Revenue / Expenses / Cash)

**Date:** 2026-07-16  
**Status:** Implemented  

```http
GET /api/v1/fpa/domain/{category}?modelId=&versionId=&scenarioId=&entityId=&periodFrom=&periodTo=
```

`category`: `workforce` | `revenue` | `expense` | `cash`

Each response includes the pack fields below **plus** legacy `lineItems` / `drivers` for older clients. Empty arrays when data is thin — never fabricate headcount.

Responses also include applied `scope` and `availableFilters` (`entities[]`, `periods[]`).

## Non-persisted sensitivity

```http
POST /api/v1/fpa/domain/{category}/sensitivity
```

Send `modelId`, `versionId`, `scenarioId`, optional scope fields, and
`overrides: [{ "driverCode": "...", "value": 45 }]`. The response contains
explicit `base`, `preview`, and `persisted: false` datasets.

## Workforce

`kpis`, `hirePlan[]`, `attritionTrend[]`, `departments[]`

## Revenue

`kpis`, `waterfall[]`, `monthly[]`, `streams[]`

## Expense

`kpis`, `alerts[]`, `byCategory[]`, `monthlyBurn[]`, `bridge[]`, `departments[]`

## Cash

`kpis` (`closingCash`, `netCashFlow`, `runwayMonths`), `periods[]`, `rows[]` with `rowType` `INFLOW` | `OUTFLOW` | `TOTAL`

| Code | When |
|------|------|
| 400 | Missing modelId / bad category |
| `INVALID_PERIOD_RANGE` | Invalid or reversed period scope |
| `UNKNOWN_DRIVER` | Override driver code is not persisted on the model |
| 404 | Unknown model |

**UAT:** `npm run uat:fpa:domain-tabs`
