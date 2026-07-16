# FP&A Model Planning — Ad-hoc tasks (Stage 2)

**Date:** 2026-07-16  
**Status:** Implemented  
**Related:** [fpa-model-planning-owners-api.md](./fpa-model-planning-owners-api.md), [fpa-model-planning-owners-fe-handoff.md](./fpa-model-planning-owners-fe-handoff.md)

## Task types

| Kind | `taskKind` | Created | Complete path |
|------|------------|---------|---------------|
| Owner dept slice | `OWNER_SLICE` (`isDeptPlan: true`) | Cycle create `owners[]` | `POST /tasks/{id}/submit` |
| Ad-hoc planning | `PLANNING` | `POST …/cycles/{id}/tasks` | `PATCH /tasks/{id}` `{ "status": "COMPLETED" }` |

Both appear on `GET …/cycles/{id}/tasks`. Do **not** use budget-cycle task endpoints for MPC ids.

---

## Performance Management mirror

Every Model Planning task (owner slice + ad-hoc) is **also** created as a Performance Management `Task` so it appears on:

- `GET /api/tasks/my` (assignee)
- `GET /api/tasks` (global board; filter `?category=FPA_MODEL_PLANNING`)

| PM field | Value |
|----------|--------|
| `category` | `FPA_MODEL_PLANNING` |
| `isPerformanceTask` | `false` (Kanban visibility, not scorecard rollup) |
| `team` | `[assigneeId]` |
| `taskMetadata.planningTaskId` | FP&A `PlanningTask.id` |
| `taskMetadata.cycleId` | Model Planning cycle id |
| `taskMetadata.taskKind` | `OWNER_SLICE` \| `PLANNING` |
| `taskMetadata.path` | `/fpa/model-planning/{cycleId}` |

Status sync: planning submit/complete → PM `stage` `completed`; return → `in_progress`.

Assignee notification for new mirrors uses PM `TASK_ASSIGNED` (same as other Kanban tasks).

---

## 1. List cycle tasks

```http
GET /api/v1/fpa/model-planning/cycles/{cycleId}/tasks
```

Query (optional): `status`, `departmentId`, `assigneeId`, `priority`

```json
[
  {
    "id": "task_…",
    "title": "Finance planning input",
    "status": "OPEN",
    "priority": "MEDIUM",
    "departmentId": "dept_…",
    "departmentName": "Finance",
    "assigneeId": "user_…",
    "assigneeName": "Ada Owner",
    "dueDate": "2026-09-30",
    "modelId": "mdl_…",
    "versionId": "ver_…",
    "taskKind": "OWNER_SLICE",
    "isDeptPlan": true
  },
  {
    "id": "task_…",
    "title": "Review Marketing Plan",
    "status": "OPEN",
    "priority": "MEDIUM",
    "taskKind": "PLANNING",
    "isDeptPlan": false,
    "description": "Validate Q4 marketing opex assumptions"
  }
]
```

**Access:** FP&A / approvers; cycle owner assignees; anyone assigned a task on the cycle.

---

## 2. Create ad-hoc task

```http
POST /api/v1/fpa/model-planning/cycles/{cycleId}/tasks
```

```json
{
  "title": "Review Marketing Plan",
  "assigneeId": "user_…",
  "departmentId": "dept_…",
  "dueDate": "2026-05-16",
  "priority": "MEDIUM",
  "description": "Validate Q4 marketing opex assumptions",
  "modelId": "mdl_…",
  "versionId": "ver_…"
}
```

- `201` + enriched `FpaCycleTask` with `taskKind: "PLANNING"`
- Notifies assignee (`MODEL_PLANNING_TASK_ASSIGNED` in-app + websocket; email async)
  - Also mirrors to PM `Task` → `TASK_ASSIGNED` for Performance Management lists
- Requires FP&A assign permission (`TASK_ASSIGN_FORBIDDEN` if not)
- Cycle must be `DRAFT` | `OPEN` | `IN_REVIEW` (`CYCLE_LOCKED` otherwise)

---

## 3. Complete ad-hoc task (checkbox)

```http
PATCH /api/v1/fpa/tasks/{taskId}
{ "status": "COMPLETED" }
```

- Assignee or FP&A may call
- **Blocked** for owner slice tasks → `OWNER_SUBMIT_REQUIRED` (use submit instead)

---

## 4. Comments + activity (MPC-native)

```http
GET  /api/v1/fpa/model-planning/cycles/{id}/comments
POST /api/v1/fpa/model-planning/cycles/{id}/comments
GET  /api/v1/fpa/model-planning/cycles/{id}/activity
```

Same shapes as budget cycle collab. `POST` body: `{ "body": "…" }`.

---

## Error codes

| Code | HTTP | When |
|------|------|------|
| `UNKNOWN_DEPARTMENT` | 400 | Bad `departmentId` on create |
| `UNKNOWN_ASSIGNEE` | 400 | Bad `assigneeId` |
| `TASK_ASSIGN_FORBIDDEN` | 403 | Caller cannot assign |
| `CYCLE_LOCKED` | 403 | Cycle not open for new tasks |
| `OWNER_SUBMIT_REQUIRED` | 403 | Complete on owner slice task |

---

## UAT

```bash
npm run uat:fpa:model-planning-cycle
```

Covers: list owner slices (≥2), create ad-hoc task, list includes it, Ada completes ad-hoc via PATCH.

## Source files

| Layer | File |
|-------|------|
| Tasks service | `src/services/fpa/FpaModelPlanningTasksService.ts` |
| Collab (comments) | `FpaWorkflowCollabService.ts` |
| Routes | `src/routes/fpaRoutes.ts` |
| UAT | `scripts/uat-fpa-model-planning-cycle-http.ts` |
