# Postman readiness checklist

Use this with the series docs in this folder. All paths assume the API is mounted with prefix **`/api`**.

## Setup

1. **Base URL** — e.g. `http://localhost:PORT` (match your `.env` `PORT`).
2. **Auth** — Almost all routes need **`Authorization: Bearer <access_token>`** (same login you use for the app). Exceptions are noted in the main app (e.g. some vendor routes).
3. **Content-Type** — JSON bodies: `application/json`. Uploads: `multipart/form-data` with the field names documented in each series file (`file`, etc.).

## Verified route map (code vs docs)

| Doc section | Status | Notes |
|-------------|--------|--------|
| **A** Config | OK | `GET/POST /performance/config/...` matches `performanceConfigRoutes.ts`. Strategy create uses `POST` and update `PUT /strategies/:id` (both hit upsert logic). |
| **B** Integration | OK | `POST /performance/integration/sync`, `GET .../jobs`, `POST .../approve`, `POST .../override`, `POST .../import`. Goal tracking: `POST /performance/goal-tracking/:goalId` and `POST .../schedule` (not GET). |
| **C** Scorecards | OK | All under `GET/POST /performance/scorecards/...`. Router uses global `authenticate`. |
| **D** Tasks | OK | Under `/api/tasks`. **Bulk delete:** `DELETE /api/tasks/bulk` with JSON body `{ "taskIds": ["id1","id2"] }` (required). |
| **E** Notifications | OK | `GET/PUT /api/homepage/notifications...` (mounted at `/api/homepage`). |
| **F** Reviews | OK | Base path **`/api/performance-reviews`** (with hyphen). **`GET /api/performance-reviews/reports/rating-distribution`** is registered **before** `/:id` so it is not captured as an id (fixed in code). Query params: `departmentName`, `reviewPeriod` as per controller. |
| **G** RBAC | OK | Expect `403`/`401` when testing cross-user access; exact rules are in controllers/services. |
| **H** Docs | OK | `GET /docs` and `GET /api-docs` per `app.ts`. |

## Common pitfalls

- **Wrong base** — Performance config is `/api/performance/config`, not `/api/performance-management/config`.
- **Review path** — `performance-reviews` uses a **hyphen**; scorecards use **`/api/performance/scorecards`**.
- **Mention suggestions** — `GET /api/tasks/:id/mention-suggestions` may expect a query string such as `?q=adm` (check `TaskController` / Swagger for exact param name).
- **Immutable audit triggers** — DB triggers from `db:migrate:performance-uat-backend` may fail on managed MySQL without elevated privileges; APIs still work.

## Roll-up / scorecard alignment (backend)

- Parent roll-ups use **`activities.contributionWeightPercent`** **or** **`scorecardWeight`** on each child goal, plus **`isReverseKpi`** or **`targetOperator: "<="`** for reverse scoring, so task-driven roll-ups stay consistent with scorecard math.
