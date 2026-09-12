# B-Series: Internal Integration & Data Pipelines

**Full stack test order (goals, departments, tasks, then sync):** see [B-series-full-test-flow.md](./B-series-full-test-flow.md).

## Scope

This section covers manual sync, sync jobs, approvals, manager overrides, bulk KPI import, and background automation entrypoints.

## UAT Coverage

| UAT | Backend Status | Endpoints |
|---|---|---|
| B.01 Internal API connectivity | Implemented | `POST /api/performance/integration/sync` |
| B.02 Portfolio IRR precision | Implemented | `POST /api/performance/integration/sync`, `GET /api/performance/integration/jobs` |
| B.03 Background worker update path | Implemented (optional for manual UAT) | `POST /api/performance/goal-tracking/schedule`, `POST /api/performance/goal-tracking/:goalId` — *skip if you are only testing sync via §6* |
| B.04 Internal source path validation (`/v1/`) | Implemented | `POST /api/performance/integration/sync` |
| B.05 Exponential backoff | Implemented | `POST /api/performance/integration/sync`, `GET /api/performance/integration/jobs` |
| B.06 Sync error logging | Implemented | `GET /api/performance/integration/jobs` |
| B.07 Data transformation | Implemented | `POST /api/performance/integration/sync` |
| B.08 Manual data overwrite with manager comment | Implemented | `POST /api/performance/integration/override` |
| B.09 Bulk KPI import | Implemented | `POST /api/performance/integration/import` |
| B.10 JWT token expiry refresh | Shared-auth concern | outside performance module backend |
| B.11 IRR fetch from internal modules | Implemented | `POST /api/performance/integration/sync` |
| B.12 AUM real-time sync | Implemented | `POST /api/performance/integration/sync-pe-portfolio-aum` (aggregate `Fund.totalAmount` via `calculateAUM`; optional `fundId` for single-fund total). UAT: `npm run test:uat:performance-b12-aum-realtime-sync` |
| B.15 Employee turnover rate integration | Implemented | `POST /api/performance/integration/sync-payroll-turnover-rate` (Payroll `Employee` active vs inactive headcount → `turnoverRatePct`). UAT: `npm run test:uat:performance-b15-payroll-turnover` |
| B.17 Project completion rate integration | Implemented | `PUT /api/tasks/:id/stage`, `PUT /api/tasks/bulk/stage` |
| B.18 Exponential backoff on internal APIs | Implemented | `POST /api/performance/integration/sync` |

## Endpoint Notes

- `POST /api/performance/integration/sync`
  - Follows the normal public route pattern.
  - If `endpointPath` is supplied in the request body, that internal source path must include `/v1/`.
  - Persists a sync job and retries with exponential backoff.
- `GET /api/performance/integration/jobs`
  - Returns attempt count, error code, timestamps, and payload summaries.
- `POST /api/performance/integration/approve`
  - Finalizes a pending sync value.
- `POST /api/performance/integration/override`
  - Allows manager/HR/CEO override with mandatory comment.
- `POST /api/performance/integration/import`
  - Accepts CSV/XLSX KPI target uploads.
- `POST /api/performance/goal-tracking/schedule`
  - Backend automation endpoint for running due-goal checks.

## Postman Test Flow

1. Trigger sync for a precision-sensitive KPI using a `/v1/` path.
   - That `/v1/` requirement applies to the request body's `endpointPath`, not to the public API route.
2. Fetch sync jobs and confirm attempt history plus normalized values.
3. Test approval flow for a pending KPI.
4. Test override flow with and without a manager comment.
5. Upload a sample CSV/XLSX target file.
6. *(Optional — skip if not testing cron/worker.)* Run `POST /api/performance/goal-tracking/schedule` and confirm goals update.

## Expected Results

- Sync values preserve 4-6 decimal precision where required.
- Failed syncs log retry metadata.
- High-stakes KPI values can remain pending until approved.
- Overrides require the right role and a comment.

## Request and Response Reference

- `POST /api/performance/integration/sync`
  - **Typical Postman body** (goals created via API usually have **no** stored sync URL — pass path + field):
  ```json
  {
    "goalId": "goal-id",
    "endpointPath": "/api/accounting/v1/kpis/portfolio-irr",
    "fieldPath": "data.metrics.irr",
    "bearerToken": "optional-token",
    "divideBy": 100
  }
  ```
  - `divideBy` only if the source returns an integer scale (e.g. cents → dollars).
  - Shorthand when DB already has `syncEndpointPath` + `syncConfig.fieldPath`: `{ "goalId": "goal-id" }` only.
  - Success response:
  ```json
  {
    "success": true,
    "message": "Performance sync completed successfully",
    "data": {
      "syncJob": {
        "id": "sync-job-id",
        "status": "COMPLETED"
      },
      "goal": {
        "id": "goal-id"
      }
    },
    "timestamp": "2026-03-31T08:00:00.000Z"
  }
  ```
