# C-Series: Mathematical Hierarchy & Roll-Ups

## Scope

This section covers individual-to-department roll-ups, department-to-org balanced scorecard aggregation, reverse KPI logic, pending-approval exclusion, and escalation statuses.

## UAT Coverage

| UAT | Backend Status | Endpoints |
|---|---|---|
| C.01 Individual to department roll-up | Implemented | `POST /api/performance/scorecards/employee/:employeeId/generate`, `POST /api/performance/scorecards/department/:department/generate` |
| C.02 Department to org roll-up | Implemented | `GET /api/performance/scorecards/org-bsc` |
| C.03 Weighted math validation | Implemented | `GET /api/performance/scorecards/employee/:employeeId`, `GET /api/performance/scorecards/department/:department` |
| C.04 High-stakes approval exclusion | Implemented | `POST /api/performance/integration/sync`, `POST /api/performance/integration/approve`, `GET /api/performance/scorecards/org-bsc` |
| C.05 Amber Zone trigger | Implemented | `GET /api/performance/scorecards/org-bsc`, `POST /api/performance/goal-tracking/:goalId` |
| C.06 Red Zone trigger | Implemented | `PUT /api/tasks/:id/stage`, `GET /api/performance/scorecards/org-bsc` |
| C.07 Null handling without NaN | Implemented | scorecard generation endpoints |
| C.08 Multi-parent roll-up | Implemented | linked goal/KPI roll-up paths |
| C.09 Target vs stretch goal cap | Implemented | scorecard generation endpoints |
| C.10 Reverse KPI logic | Implemented | scorecard generation endpoints |

## Endpoint Notes

- `POST /api/performance/scorecards/employee/:employeeId/generate`
  - Generates the employee scorecard and persists draft scorecard data if requested.
- `POST /api/performance/scorecards/department/:department/generate`
  - Uses child goal contributions and direct progress to calculate department results.
- `GET /api/performance/scorecards/org-bsc`
  - Returns pillar weights, goal progress, escalation statuses, and data-quality alerts.
- `POST /api/performance/goal-tracking/:goalId`
  - Forces a backend recompute of goal progress/status from source data.

## Request and Response Reference

- `POST /api/performance/scorecards/department/:department/generate`
  - Request body:
  ```json
  {
    "periodStart": "2026-01-01T00:00:00.000Z",
    "periodEnd": "2026-03-31T23:59:59.999Z",
    "periodLabel": "Q1 2026"
  }
  ```
  - Success response:
  ```json
  {
    "success": true,
    "message": "Department scorecard generated successfully",
    "data": {
      "scorecardType": "DEPARTMENT",
      "scores": {
        "departmentScore": 3.42
      },
      "document": {},
      "savedRecord": {
        "id": "scorecard-id"
      }
    },
    "timestamp": "2026-03-31T08:00:00.000Z"
  }
  ```

## Postman Test Flow

1. Update linked goals/tasks for three employees.
2. Generate employee scorecards.
3. Generate the department scorecard and compare the weighted roll-up.
4. Fetch Org BSC and confirm pillar score movement.
5. Set a KPI to pending approval and confirm exclusion.
6. Test a reverse KPI by lowering actuals toward the target.

## Expected Results

- Roll-ups recalculate from lower levels upward.
- Pending approval values are excluded from score math.
- Reverse KPIs improve as the actual value moves downward.
- Goal progress caps at `100%` unless stretch scoring is enabled.
