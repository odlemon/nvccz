# H-Series: Non-Functional, Audit & Compliance

## Scope

This section covers backend-auditable items only. UI performance, uptime, failover, and backup/restore remain infrastructure concerns.

## UAT Coverage

| UAT | Backend Status | Endpoints |
|---|---|---|
| H.01 1-second interaction | UI performance concern | not backend-certifiable |
| H.02 50,000 user simulation | load/infrastructure concern | not backend-certifiable |
| H.03 KPI target change log | Implemented | `PUT /api/performance/config/goals/:goalId` |
| H.04 Immutable log check | Environment-blocked | DB trigger creation attempted by `npm run db:migrate:performance-uat-backend` |
| H.06 99.9% uptime | infrastructure concern | not backend-certifiable |
| H.07 Database failover | infrastructure concern | not backend-certifiable |
| H.08 Documentation check | Implemented | `GET /docs`, `GET /api-docs` |
| H.09 Multi-currency math | Implemented | sync/scorecard endpoints plus precision-aware goal fields |
| H.10 Restore from backup | infrastructure concern | not backend-certifiable |

## Endpoint Notes

- `PUT /api/performance/config/goals/:goalId`
  - Captures target/weight changes for auditing.
- `GET /docs`
  - Serves the Swagger UI entrypoint for backend API documentation.
- `POST /api/performance/integration/sync`
  - Preserves precision-sensitive values and contributes to data-quality alerts.

## Postman and Verification Flow

1. Update a goal target with a reasoning comment.
2. Confirm audit entries were created.
3. Open `GET /docs` and verify the Swagger UI loads.
4. Trigger sync for a precision-sensitive KPI and inspect the resulting scorecard/dashboard values.
5. Re-run `npm run db:migrate:performance-uat-backend` to verify whether the DB user can create immutable audit triggers.

## Expected Results

- Target and weight changes are auditable.
- Swagger docs are accessible at `/docs`.
- Precision-sensitive KPI values preserve decimals and can raise data-quality alerts.
- Immutable DB-level audit enforcement still depends on trigger privileges in the current database environment.
