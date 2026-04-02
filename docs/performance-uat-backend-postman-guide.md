# Performance Backend UAT Postman Guide

This guide maps the backend-applicable UAT items from `Performance Management UAT Script.docx` to concrete API endpoints, backend behavior, and Postman verification steps.

Use a bearer token in Postman for all authenticated endpoints.

## A-Series: Strategic Alignment & BSC Setup

- `GET /api/performance/config/pillars`
  - Verify the fixed four pillars and current weight totals.
- `POST /api/performance/config/strategies`
  - Create a multi-year strategy with `title`, `periodStart`, `periodEnd`, `visionStatement`, and `pillarWeights`.
- `PUT /api/performance/config/strategies/:id`
  - Update strategy metadata and pillar weights.
- `POST /api/performance/config/strategies/:id/document`
  - Upload the strategy PDF and confirm it is linked to the strategy record.
- `POST /api/performance/config/themes`
  - Create a strategic theme.
- `PUT /api/performance/config/goals/:goalId`
  - Assign `scorecardPillar`, `scorecardWeight`, `strategyId`, and `strategicThemeId`.

Sample request body:
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

Expected response body:
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

Postman check:
- Create a strategy spanning more than 12 months.
- Upload the strategy document.
- Assign a goal to a pillar and theme.
- Re-fetch the goal/config payload and confirm the saved values.

## B-Series: Internal Integration & Data Pipelines

- `POST /api/performance/integration/sync`
  - Trigger manual sync for a goal/KPI.
  - If you send `endpointPath`, that internal source path must include `/v1/`.
- `GET /api/performance/integration/jobs`
  - Inspect retry attempts, error codes, timestamps, and payload summaries.
- `POST /api/performance/integration/approve`
  - Approve a pending high-stakes synced value.
- `POST /api/performance/integration/override`
  - Override an automated KPI as manager/HR/CEO with a required comment.
- `POST /api/performance/integration/import`
  - Upload CSV/XLSX KPI targets for bulk import.
- `POST /api/enhanced-goal-tracking/:goalId`
  - Run goal status refresh for background-worker style validation.
- `POST /api/performance-review-cycles/check-deadlines`
  - Run review deadline checks and generate deadline notifications.

Sample request body:
```json
{
  "goalId": "goal-id",
  "endpointPath": "/api/accounting/v1/kpis/portfolio-irr",
  "fieldPath": "data.metrics.irr",
  "bearerToken": "internal-service-token"
}
```

Expected response body:
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

Postman check:
- Trigger sync with an `endpointPath` that contains `/v1/` and confirm `preciseCurrentValue` and sync job records.
- Simulate failures and confirm retry schedule `1s, 2s, 4s, 8s, 16s` in sync jobs.
- Approve or override a pending KPI and confirm scorecard exclusion ends after approval.

## C-Series: Mathematical Hierarchy & Roll-Ups

- `GET /api/performance/scorecards/org-bsc`
  - Verify pillar score, goal status, escalation status, and data-quality alerts.
- `POST /api/performance/scorecards/employee/:employeeId/generate`
  - Generate individual scorecards.
- `POST /api/performance/scorecards/department/:department/generate`
  - Generate department scorecards with employee roll-ups.
- `PUT /api/tasks/:id/stage`
  - Change linked task progress and trigger recalculation.

Sample request body:
```json
{
  "periodStart": "2026-01-01T00:00:00.000Z",
  "periodEnd": "2026-03-31T23:59:59.999Z",
  "periodLabel": "Q1 2026"
}
```

Expected response body:
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

Postman check:
- Update child goals/tasks and confirm department and org roll-ups change.
- Test reverse KPI values and confirm progress improves as the actual decreases.
- Set a pending-approval KPI and confirm it is excluded from scorecard math.

## D-Series: Kanban & Task Management

- `GET /api/tasks/status-options`
  - Returns the supported backend status list for Kanban/task workflows.
- `POST /api/tasks`
  - Create linked or unlinked tasks.
- `PUT /api/tasks/:id`
  - Edit task descriptions and metadata.
- `PUT /api/tasks/:id/stage`
  - Persist stage changes and create system messages.
- `PUT /api/tasks/bulk/stage`
  - Bulk-complete/update tasks with one roll-up recalculation pass per affected goal.
- `DELETE /api/tasks/bulk`
  - Trash linked tasks and force parent-goal recalculation.
- `POST /api/tasks/:id/attachments`
  - Upload task attachments.

Postman check:
- Create a task without `goalId` and confirm it saves successfully.
- Change the stage, fetch the task again, and confirm the new stage persisted.
- Bulk-update five linked tasks and confirm the parent goal recalculated once per goal set.
- Upload an image file and confirm attachment metadata is returned on the task.

## E-Series: Collaboration & Notifications

- `GET /api/tasks/:id/comments`
  - Returns task comments plus system messages.
- `POST /api/tasks/:id/comments`
  - Create a comment with optional `mentionUserIds` and file attachments.
- `DELETE /api/tasks/:id/comments/:commentId`
  - Delete your own comment.
- `GET /api/tasks/:id/mention-suggestions?q=adm`
  - Search mention candidates for the task context.
- `GET /api/homepage/notifications`
  - Fetch the notification panel feed.
- `PUT /api/homepage/notifications/:id/read`
  - Mark a single notification as read.
- `PUT /api/homepage/notifications/read-all`
  - Mark all notifications as read.

Postman check:
- Create a task comment with `mentionUserIds`.
- Fetch `/api/homepage/notifications` as the mentioned user and confirm a `TASK_MENTION` entry exists with task deep-link data.
- Change a task stage to `red` or let it become overdue and confirm a `TASK_RED_ZONE` notification is created.
- Delete your own comment and confirm the comment now returns as deleted.

## F-Series: 360-Degree Reviews

- `POST /api/performance-reviews/cycles/:cycleId/initiate`
  - Creates review records and `Review Pending` tasks for employees.
- `POST /api/performance-reviews/:id/autopopulate`
  - Builds the quantitative snapshot from goals and tasks.
- `PUT /api/performance-reviews/:id`
  - Enforces integer-only manager scores and minimum qualitative feedback length.
- `POST /api/performance-reviews/:id/finalize`
  - Locks the review and generates the document payload/PDF output.
- `GET /api/performance-reviews/:id/document`
  - Retrieves the current or archived review document.
- `GET /api/performance-reviews/reports/rating-distribution`
  - Returns the department rating distribution.

Sample request body:
```json
{
  "managerFeedback": "Solid delivery across the cycle.",
  "scores": [
    {
      "criterion": "Results Delivery",
      "rating": 4
    }
  ]
}
```

Expected response body:
```json
{
  "success": true,
  "message": "Performance review finalised successfully",
  "data": {
    "id": "review-id",
    "status": "COMPLETED",
    "isLocked": true
  },
  "timestamp": "2026-03-31T08:00:00.000Z"
}
```

Postman check:
- Initiate a cycle, then confirm tasks titled `Review Pending: <cycle>` were created.
- Attempt to submit `4.5` and confirm the backend rejects it.
- Finalize a review and confirm `isLocked = true` and document retrieval works.

## G-Series: Security, RBAC & Privacy

- `GET /api/performance/scorecards/*`
  - Verify access-control rules across employee, department, CEO, board, and org views.
- `GET /api/performance-reviews/:id/document`
  - Verify cross-user document access returns forbidden when the actor is not owner/manager/HR/CEO.
- `GET /api/tasks/:id/comments`
  - Verify cross-department task collaboration access is blocked.

Postman check:
- Call employee or document endpoints using a user outside the allowed scope.
- Confirm the backend returns access denied / forbidden.

## H-Series: Audit, Precision & Documentation

- `PUT /api/performance/config/goals/:goalId`
  - Change target/weight fields with reasoning comments and confirm audit logging.
- `POST /api/performance/integration/sync`
  - Verify 4-6 decimal precision and data-quality alert behavior for IRR/AUM-style KPIs.
- `GET /docs`
  - Verify OpenAPI documentation is served.
- `npm run db:migrate:performance-uat-backend`
  - Re-run the direct DB update script for audit-trigger enforcement attempts.

Postman check:
- Change a KPI target from `100` to `150` with a reason and confirm audit entries.
- Sync a precision-sensitive KPI with a meaningful drift and confirm a data-quality alert is surfaced on Org BSC responses.

## Suggested Postman Environment Variables

- `baseUrl`
- `token`
- `goalId`
- `taskId`
- `reviewId`
- `cycleId`
- `strategyId`

## Suggested Regression Order

1. A-Series config setup
2. B-Series sync/import
3. D-Series tasks
4. E-Series collaboration/notifications
5. C-Series scorecards and roll-ups
6. F-Series reviews
7. G/H permission and audit checks
