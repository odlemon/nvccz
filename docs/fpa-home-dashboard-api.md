# FP&A Home dashboard API

**Date:** 2026-07-16  
**Status:** Implemented  
**Route (FE):** `/forecasting`  
**Endpoint:** `GET /api/v1/fpa/home/dashboard`

## Query

| Param | Notes |
|-------|--------|
| `modelId` | Preferred; defaults to latest non-archived model |
| `versionId` | Optional |
| `scenarioId` | Optional — scopes KPI/scenario anchor |
| `cycleId` | Optional MPC id — sets `activeCycle` |
| `period` | Reserved (unused in v1) |

## Response (board contract)

```json
{
  "success": true,
  "data": {
    "model": { "id": "…", "name": "…", "status": "…", "ownerName": "…" },
    "versionId": "ver_…",
    "scenarioId": "scn_…",
    "cycleId": "mpc_…",
    "activeCycle": { "id": "…", "name": "…", "status": "OPEN", "currentStage": "…" },
    "kpis": {
      "revenue": 0,
      "ebitda": 0,
      "closingCash": 0,
      "cash": 0,
      "runwayMonths": null,
      "forecastAccuracy": null,
      "revenueDeltaPct": null,
      "sparklines": { "revenue": [], "ebitda": [], "closingCash": [], "headcount": [] }
    },
    "revenueExpenseTrend": [{ "period": "2026-01-01", "revenue": 0, "expense": 0, "ebitda": 0 }],
    "scenarioCompare": {
      "anchorScenarioId": "…",
      "scenarios": [],
      "metrics": [
        {
          "key": "revenue",
          "label": "Revenue",
          "values": [
            { "scenarioId": "…", "scenarioName": "Base", "value": 0, "varianceAbs": 0, "variancePct": 0 }
          ]
        }
      ]
    },
    "workflowStatusSlices": [{ "status": "OPEN", "count": 1 }],
    "workflowProgress": [],
    "overBudgetDepartments": [],
    "cashRunway": { "closingCash": 0, "runwayMonths": null, "monthlyBurn": null, "byMonth": [] },
    "openTasks": [],
    "recentActivity": [],
    "activity": []
  }
}
```

Honest empties when thin — no demo FX multipliers.

**UAT:** `npm run uat:fpa:home-dashboard`
