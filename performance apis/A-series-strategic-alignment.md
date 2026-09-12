# A-Series: Strategic Alignment & BSC Setup

## Scope

This section covers strategic setup, pillar configuration, strategy lifecycle, theme tagging, and goal-to-pillar mapping.

## UAT Coverage

| UAT | Backend Status | Endpoints |
|---|---|---|
| A.01 Hardcoded BSC pillars | Implemented | `GET /api/performance/config/pillars`, `POST /api/performance/config/strategies`, `PUT /api/performance/config/strategies/:id` |
| A.02 Strategy PDF upload | Implemented | `POST /api/performance/config/strategies/:id/document` |
| A.03 Goal-to-pillar mapping | Implemented | `PUT /api/performance/config/goals/:goalId` |
| A.04 Multi-year strategy support | Implemented | `POST /api/performance/config/strategies`, `PUT /api/performance/config/strategies/:id` |
| A.05 Pillar weighting totals | Implemented | `POST /api/performance/config/strategies`, `PUT /api/performance/config/strategies/:id` |
| A.06 Goal weighting within pillar totals | Implemented | `PUT /api/performance/config/goals/:goalId` |
| A.07 Vision statement display data | Implemented | `GET /api/performance/config/strategies`, `GET /api/performance/scorecards/org-bsc` |
| A.08 Strategic theme tagging | Implemented | `GET /api/performance/config/themes`, `POST /api/performance/config/themes`, `POST /api/performance/config/themes/:id/goals` |
| A.09 Objective description persistence | Implemented | `POST /api/performance/goals`, `PUT /api/performance/goals/:id` |
| A.10 Archive old strategies | Implemented | `POST /api/performance/config/strategies/:id/archive` |

## Endpoint Notes

- `GET /api/performance/config/pillars`
  - Returns the fixed four pillars and their configured weights.
- `POST /api/performance/config/strategies`
  - Creates a strategy with multi-year date ranges and pillar weights that must total exactly `100`.
- `PUT /api/performance/config/strategies/:id`
  - Updates an existing strategy and re-validates the four fixed pillar weights.
- `POST /api/performance/config/strategies/:id/document`
  - Uploads the strategy file and links it to the strategy metadata.
- `PUT /api/performance/config/goals/:goalId`
  - Stores pillar, weight, strategy, and theme metadata on goals.

## Request and Response Reference

- `POST /api/performance/config/strategies`
  - Request body:
  ```json
  {
    "title": "2026-2028 Corporate Strategy",
    "periodStart": "2026-01-01T00:00:00.000Z",
    "periodEnd": "2028-12-31T23:59:59.999Z",
    "visionStatement": "Build a resilient and measurable enterprise.",
    "pillarWeights": {
      "Financial": 25,
      "Customer & Market": 25,
      "Internal Operations": 25,
      "Learning, Growth & HR": 25
    }
  }
  ```
  - Success response:
  ```json
  {
    "success": true,
    "message": "Performance strategy saved successfully",
    "data": {
      "id": "strategy-id"
    },
    "timestamp": "2026-03-31T08:00:00.000Z"
  }
  ```

## Postman Test Flow

1. Create a strategy with a 3-year date range.
2. Upload a PDF using `multipart/form-data` with `file`.
3. Create a strategic theme.
4. Update a goal with `scorecardPillar`, `scorecardWeight`, `strategyId`, `strategicThemeId`, and a long `description`.
5. Archive the strategy and re-fetch it.

## Expected Results

- Pillars remain fixed and validate to exactly `100%`.
- Strategy document metadata is stored and retrievable.
- Goal-to-pillar and goal-to-theme mappings persist.
- Archived strategies become read-only and stop appearing in active dashboard data.
