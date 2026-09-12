# FP&A Model Planning — Department owners + slice submit

**Date:** 2026-07-16  
**Status:** Implemented  
**Submit path (single):** `POST /v1/fpa/tasks/{taskId}/submit`  
**Related:** [fpa-model-planning-cycle-api.md](./fpa-model-planning-cycle-api.md), [fpa-model-planning-actuals-cutoff-api.md](./fpa-model-planning-actuals-cutoff-api.md)

## Product rules

1. Plan is cut by **department** when `owners[]` are assigned on the Model Planning cycle.  
2. Owners only see/edit their department slice; FP&A / approvers see all.  
3. Submit is **by department slice** via the owner’s `taskId` — not whole-cycle submit.

## 1. Persist `owners[]`

### Create

`POST /v1/fpa/model-planning/cycles` — **requires** `owners` with ≥1 `{ departmentId, assigneeId, dueDate? }`.

On create BE:

- Validates departments / assignees (`UNKNOWN_DEPARTMENT`, `UNKNOWN_ASSIGNEE`, `NO_OWNERS`)
- Creates a `PlanningWorkflow` (`workflowType: MODEL_PLANNING`) stored as `workflowId`
- Creates one `PlanningTask` per owner (owner row status `OPEN`; task submit-eligible)
- Inserts `model_planning_cycle_owners` rows with `taskId`
- **Materialises** INPUT cells for each owner `departmentId` from company-level (null dept) templates on the source version

### Get / list / workspace

Every cycle payload includes enriched `owners[]`:

```json
{
  "departmentId": "…",
  "departmentName": "Finance",
  "assigneeId": "…",
  "assigneeName": "Ada Owner",
  "taskId": "…",
  "status": "OPEN",
  "dueDate": "2026-09-01"
}
```

### Replace owners

```http
PUT /v1/fpa/model-planning/cycles/{id}/owners
{ "owners": [ { "departmentId": "…", "assigneeId": "…", "dueDate": "…" } ] }
```

Also accepted on `PUT /model-planning/cycles/{id}` when `owners` is present.

## 2. Owner workspace

```http
GET /v1/fpa/model-planning/cycles/{id}/owner-workspace
```

```json
{
  "cycle": { "id": "…", "status": "OPEN", "cycle_name": "…" },
  "owners": [ /* enriched */ ],
  "myOwner": { "departmentId": "…", "departmentName": "Finance", "taskId": "…", "status": "OPEN" },
  "canSubmit": true,
  "unmetRequirements": [],
  "assignedDepartmentIds": ["dept_…"],
  "readOnly": false
}
```

Non-owners (non-approver) → `403 FORBIDDEN`.

## 3. Grid scope

`GET /models/{modelId}/grid?cycleId={mpcId}&departmentId=`

| Field | Behaviour |
|-------|-----------|
| `assignedDepartmentIds` | Owner’s depts; `null` for FP&A/approvers (full grid) |
| Cells | Owners: own `departmentId` + company (`null`) rows; company rows `isEditable: false` |
| `departmentId` query | View-by slice; `403 DEPARTMENT_SCOPE_LOCKED` if outside authorised depts |

**Write:** `403 DEPARTMENT_SCOPE_LOCKED` when cell department is outside assignee’s slice (or company-level null for owners).

Published (LOCKED) versions are writable for INPUT cells when the Model Planning cycle is `DRAFT|OPEN|IN_REVIEW` and `cycleId` is passed (dept + actual cut-over guards still apply).

## 4. Slice submit

```http
POST /v1/fpa/tasks/{taskId}/submit
{ "changeNotes": "…", "comment": "…" }
```

- Marks **that department** owner + task `SUBMITTED` only.  
- When **all** owners are SUBMITTED/APPROVED → cycle status → `IN_REVIEW`.  
- Blocked codes: `OWNER_SUBMIT_BLOCKED`, `FORBIDDEN`.

## 5. Migration

```bash
npm run db:migrate:model-planning-cycle-owners
# all DBs (local remote URLs) or:
# DATABASE_URL=… npm run db:migrate:model-planning-cycle-owners
```

Creates `model_planning_cycle_owners` + `model_planning_cycles.workflow_id`.

## 6. Client demo UAT

```bash
npm run uat:fpa:model-planning-cycle
```

Prints a **CLIENT DEMO FIXTURE** block with cycle id, Finance/Sales owners, Ada login (`ada.owner@nts.com` / `OwnerDemo123!`).

## 7. Source files

| Layer | File |
|-------|------|
| Owners service | `src/services/fpa/FpaModelPlanningOwnersService.ts` |
| Cycle wiring | `src/services/fpa/FpaModelPlanningCycleService.ts` |
| Access / grid | `FpaAccessService.ts`, `FpaGridService.ts` |
| Task submit | `FpaWorkflowService.ts` |
| Migration | `scripts/run-model-planning-cycle-owners-migration.ts` |
| UAT | `scripts/uat-fpa-model-planning-cycle-http.ts` |
