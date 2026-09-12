# FP&A Variance API

**Date:** 2026-07-16  
**Status:** Implemented  

## Results (enriched)

```http
GET /api/v1/fpa/variance/results?modelId=&versionId=&limit=
```

Each row includes: `departmentId` / `departmentName`, `actual`, `plan`, `forecast`, `varianceAbs`, `variancePct`, `lineItemId` / `lineItemName`, `commentaryRequired`, `commentary` / `commentaryStatus`.

## Summary

```http
GET /api/v1/fpa/variance/summary?modelId=&versionId=
```

```json
{
  "kpis": { "revenueVar": 0, "opexVar": 0, "ebitdaVar": 0 },
  "trend": [{ "period": "2026-01-01", "variance": 0 }],
  "tornado": [{ "departmentName": "Marketing", "varianceAbs": -40000 }],
  "departments": []
}
```

## Existing

- `POST /variance/calculate` — `{ modelId, versionId, scenarioId?, cycleId? }`
- `POST /variance/{id}/commentary` — `{ body }`

**UAT:** `npm run uat:fpa:variance-summary`
