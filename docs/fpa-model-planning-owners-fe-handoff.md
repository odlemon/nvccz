# FE handoff — Model Planning owners / scoped grid / slice submit

**Date:** 2026-07-16  
**BE status:** Shipped + UAT **23/23** green against client-demo DB (`nts`)  
**Detail API:** [fpa-model-planning-owners-api.md](./fpa-model-planning-owners-api.md)  
**Do not use:** `GET /budget-cycles/{id}/owner-workspace` for Model Planning cycle ids — that entity is different.  
**Tasks:** use `GET/POST /model-planning/cycles/{id}/tasks` — not `/budget-cycles/{id}/tasks`. Detail: [fpa-model-planning-tasks-api.md](./fpa-model-planning-tasks-api.md).

---

## What you can stop waiting on

| Your ask | BE |
|----------|-----|
| Persist `owners[]` on create (≥1 required) | Yes — `400 NO_OWNERS` if missing |
| Enrich on get / list / workspace | Yes — names + `taskId` + `status` + `dueDate` |
| `PUT …/owners` after create | Yes |
| `GET …/owner-workspace` (MPC-native) | Yes |
| Grid `assignedDepartmentIds` + cell `departmentId` | Yes |
| Write guard `DEPARTMENT_SCOPE_LOCKED` | Yes |
| Slice submit via `POST /tasks/{taskId}/submit` | Yes — **only** path; no `submit-slice` |
| Seed dept INPUT cells on owner assign | Yes |
| Toast codes `UNKNOWN_DEPARTMENT` / `UNKNOWN_ASSIGNEE` / `OWNER_SUBMIT_BLOCKED` | Yes |

---

## API contract (drop-in for your types)

### Create (already sent by create modal) 

```http
POST /api/v1/fpa/model-planning/cycles
```

```json
{
  "name": "FY2026 Annual Budget",
  "financialYear": 2026,
  "planningType": "ANNUAL_BUDGET",
  "sourceModelId": "…",
  "sourceModelVersionId": "…",
  "planningOwnerId": "…",
  "actualsCutoffPeriod": "2026-07-01",
  "owners": [
    { "departmentId": "dept_…", "assigneeId": "user_…", "dueDate": "2026-09-30" }
  ]
}
```

Created cycle (and every subsequent get/list/workspace) includes:

```json
{
  "id": "…",
  "cycle_name": "…",
  "status": "DRAFT",
  "owners": [
    {
      "departmentId": "…",
      "departmentName": "Finance",
      "assigneeId": "…",
      "assigneeName": "Ada Owner",
      "taskId": "…",
      "status": "OPEN",
      "dueDate": "2026-09-30"
    }
  ]
}
```

`owners[].status` values FE should treat as submit-eligible: `OPEN` | `IN_PROGRESS` | `RETURNED` (and legacy `PENDING` → treat as open).

### Owner workspace (replace budget-cycle fallback)

```http
GET /api/v1/fpa/model-planning/cycles/{id}/owner-workspace
```

```json
{
  "cycle": { "id": "…", "status": "DRAFT", "cycle_name": "…" },
  "owners": [ /* same shape as cycle.owners */ ],
  "myOwner": {
    "departmentId": "…",
    "departmentName": "Finance",
    "taskId": "…",
    "status": "OPEN"
  },
  "canSubmit": true,
  "unmetRequirements": [],
  "assignedDepartmentIds": ["dept_…"],
  "readOnly": false
}
```

**Wiring tip:** when `cycleId` is a Model Planning cycle, call this endpoint — not `/budget-cycles/.../owner-workspace`. Approvers get all owner department ids in `assignedDepartmentIds` and may have `myOwner: null` with `canSubmit` driven by role/policy.

### Optional re-assign

```http
PUT /api/v1/fpa/model-planning/cycles/{id}/owners
{ "owners": [ { "departmentId": "…", "assigneeId": "…", "dueDate": "…" } ] }
```

### Grid

```http
GET /api/v1/fpa/models/{modelId}/grid?cycleId={mpcId}&versionId=&scenarioId=&departmentId=
```

| Field | Owner role | FP&A / approver (`canEditAllDepartments`) |
|-------|------------|------------------------------------------|
| `assignedDepartmentIds` | Their dept id(s) only | `null` / omit → **no FE lock** (full edit) |
| Cells | Own dept + company (`departmentId: null`); company `isEditable: false` | All depts |
| `cells[].departmentId` | Present on dept rows | Same |
| `?departmentId=` | View-by slice (must be authorised) | View-by any owner dept |

Cell writes **must** pass `cycleId` so BE can:

1. Allow edits on published (`LOCKED`) source versions while cycle is `DRAFT` \| `OPEN` \| `IN_REVIEW`
2. Enforce department scope
3. Enforce actuals cut-over (`ACTUAL_PERIOD_LOCKED`)

```http
POST /api/v1/fpa/models/{modelId}/cells/update
{ "cellId": "…", "value": 4242, "cycleId": "{mpcId}", "recordVersion": 1 }
```

### Slice submit (Submit banner)

When `owners[].taskId` / `myOwner.taskId` is present:

```http
POST /api/v1/fpa/tasks/{taskId}/submit
{ "changeNotes": "…", "comment": "…" }
```

- Submits **that department only**; other owners stay `OPEN`.
- Cycle moves to `IN_REVIEW` only when **all** owners are submitted (or approved). Partial submit does **not** flip the whole cycle to SUBMITTED.
- Remove the “waiting on backend” banner path once `taskId` is present (it will be after create).

---

## Error codes to toast (unchanged from your ask)

| Code | HTTP | When |
|------|------|------|
| `NO_OWNERS` | 400 | Create without `owners[]` |
| `UNKNOWN_DEPARTMENT` | 400 | Bad `departmentId` |
| `UNKNOWN_ASSIGNEE` | 400 | Bad `assigneeId` |
| `SOURCE_VERSION_NOT_PUBLISHED` | 400 | Source version not LOCKED |
| `ACTUAL_PERIOD_LOCKED` | 403 | Write into Actual band |
| `DEPARTMENT_SCOPE_LOCKED` | 403 | Write outside authorised dept (or company null for owners) |
| `OWNER_SUBMIT_BLOCKED` | 403 | Submit with unmet gates |
| `LOCKED_VERSION` | 403 | Cell write without `cycleId` on published model (pass `cycleId`) |

---

## FE file checklist (your wired surfaces)

| File | Change needed now |
|------|-------------------|
| `fpa-model-planning-cycle-create-modal.tsx` | Keep sending `owners[]` — BE requires it |
| `fpa-worksheet.tsx` | Load tasks via `listModelPlanningCycleTasks`; create via `createModelPlanningCycleTask`; pass users/depts |
| `fpa-api.ts` | `listModelPlanningCycleTasks`, `createModelPlanningCycleTask` on MPC paths (not budget-cycle) |
| `useFpaPermissions.ts` | Unchanged — BE returns `assignedDepartmentIds: null` for full-edit roles |

No new env vars.

---

## How to verify against client demo (nts)

Demo owner created by UAT / seed:

| Field | Value |
|-------|--------|
| Email | `ada.owner@nts.com` |
| Password | `OwnerDemo123!` |
| Role | `BUDGET_OWNER` |
| Typical dept | Finance (`cmh3bbvoh0000uncw5qn5f71g`) |
| Second dept | Sales (`cmh3bbxch0001uncwz6g2vihv`) |

Walkthrough:

1. As admin, create MPC with Finance→Ada + Sales→anyone; confirm response `owners[].taskId`.
2. As Ada, open worksheet with `cycleId` → View by lists Finance; `assignedDepartmentIds` = `[Finance]`; edit Finance INPUT only.
3. Write company / other dept → toast `DEPARTMENT_SCOPE_LOCKED`.
4. Submit banner → Submit my plan → Finance `SUBMITTED`, Sales still `OPEN`.
5. As admin / FP&A → grid unrestricted; View by still works with `departmentId`.

Re-run server UAT anytime:

```bash
npm run uat:fpa:model-planning-cycle
```

Prints a fresh **CLIENT DEMO FIXTURE** JSON (cycle id + owner task ids + Ada login).

---

## Policy notes (so FE doesn’t invent rules)

1. **Submit path:** task submit only — do not call a Model Planning `submit-slice` (not implemented).
2. **Coordinator consolidate:** cycle → `IN_REVIEW` after all owner slices submitted; not after the first.
3. **Company rollups:** visible to owners as read-only; client lock + server lock.
4. **Published models:** worksheet edits require `cycleId` on cell writes while the MPC is open for input.
