# FP&A Budgeting — API reference

Backend contracts for `/forecasting/budget` (`FpaBudgetCycles`).

| | |
|---|---|
| **Base** | `{host}/api/v1/fpa` |
| **Auth** | `Authorization: Bearer {token}` |
| **Process doc** | [fpa-budgeting-flow.md](./fpa-budgeting-flow.md) |
| **Migration** | `npm run db:migrate:fpa-budget-cycles` |

Envelope: `{ "success": true, "data": { } }`  
Errors: `{ "success": false, "code": "…", "message": "…", "errors": [...] }`  
Illegal status transitions → **409** `INVALID_TRANSITION`.

---

## Input categories (SRD)

`REVENUE` · `COST_OF_SALES` · `PAYROLL` · `OPERATING_EXPENSES` · `DEPARTMENTAL` · `PROJECT` · `CAPEX` · `TAX` · `CASH_MOVEMENT` · `FUNDING`

---

## Status / stage

**status:** `DRAFT` · `LOADING_ACTUALS` · `LOADING_BASELINE` · `OPEN_FOR_INPUT` · `PENDING_VALIDATION` · `PENDING_FPA_REVIEW` · `PENDING_CFO_REVIEW` · `RETURNED_FOR_CORRECTION` · `APPROVED` · `LOCKED`

**currentStage:** `CREATE_CYCLE` · `LOAD_ACTUALS` · `LOAD_BASELINE` · `ASSIGN_OWNERS` · `OWNER_INPUT` · `VALIDATE` · `FPA_REVIEW` · `CFO_REVIEW` · `LOCK` · `REPORTS`

---

## Endpoints

### `GET /budget-cycles` → **200**

Query: `modelId`, `fiscalYear`, `status`

### `POST /budget-cycles` → **201**

Creates cycle + BUDGET workflow + owner tasks. Optionally loads prior actuals and baseline.

```json
{
  "modelId": "cm…",
  "name": "FY2026 Annual Budget",
  "fiscalYear": 2026,
  "versionId": "cm…",
  "scenarioId": "cm…",
  "startDate": "2026-01-01",
  "endDate": "2026-12-31",
  "loadPriorActuals": true,
  "loadBaseline": true,
  "inputCategories": ["REVENUE", "COST_OF_SALES", "PAYROLL", "OPERATING_EXPENSES", "DEPARTMENTAL", "PROJECT", "CAPEX", "TAX", "CASH_MOVEMENT", "FUNDING"],
  "owners": [
    {
      "departmentId": "dept_…",
      "assigneeId": "user_…",
      "categories": ["PAYROLL", "OPERATING_EXPENSES", "DEPARTMENTAL"]
    }
  ]
}
```

**Required:** `modelId`, `name`, `fiscalYear`, `owners` (≥ 1).  
**409** if an unlocked cycle already exists for the same `modelId` + `fiscalYear`.

**Side effects:** for each owner with `assigneeId`, Arcus creates an in-app notification (`BUDGET_OWNER_ASSIGNED`) and sends an assignment email (non-fatal if mail fails). Same on `PUT …/owners` when assignees are set/updated.

**Response `data`**

```json
{
  "id": "bc_…",
  "name": "FY2026 Annual Budget",
  "modelId": "cm…",
  "versionId": "cm…",
  "scenarioId": "cm…",
  "workflowId": "cm…",
  "fiscalYear": 2026,
  "status": "OPEN_FOR_INPUT",
  "currentStage": "OWNER_INPUT",
  "startDate": "2026-01-01T00:00:00.000Z",
  "endDate": "2026-12-31T00:00:00.000Z",
  "owners": [
    {
      "departmentId": "dept_…",
      "departmentName": "Finance",
      "assigneeId": "user_…",
      "assigneeName": "Jane Doe",
      "taskId": "task_…",
      "status": "IN_PROGRESS",
      "categories": ["PAYROLL", "OPERATING_EXPENSES", "DEPARTMENTAL"]
    }
  ],
  "inputCategories": ["REVENUE", "COST_OF_SALES", "PAYROLL", "OPERATING_EXPENSES", "DEPARTMENTAL", "PROJECT", "CAPEX", "TAX", "CASH_MOVEMENT", "FUNDING"],
  "lockedAt": null,
  "approvedAt": null,
  "boardPackUrl": null,
  "createdAt": "2026-07-11T10:00:00.000Z",
  "actualsRowCount": 0
}
```

### `GET /budget-cycles/{id}` → **200**

Includes `owners`, `workflow`, `validation`.

### `PUT /budget-cycles/{id}/owners` → **200**

Replace owners / tasks. Allowed while `DRAFT | OPEN_FOR_INPUT | RETURNED_FOR_CORRECTION`.

### `POST /budget-cycles/{id}/load-actuals` → **200**

```json
{ "periodStart": "2025-01-01", "periodEnd": "2025-12-31" }
```

Defaults to prior fiscal year. Returns cycle + `rowCount`.

### `POST /budget-cycles/{id}/load-baseline` → **200**

```json
{ "mode": "NONE | ACTUALS_SYNC | PRIOR_FORECAST", "sourceVersionId": null }
```

### `POST /budget-cycles/{id}/validate` → **200**

```json
{
  "passed": false,
  "errors": [
    { "code": "MISSING_CATEGORY", "message": "…", "departmentId": "…", "category": "PAYROLL" },
    { "code": "MISSING_COMMENTARY", "message": "…", "departmentId": "…" }
  ]
}
```

### `POST /budget-cycles/{id}/submit-fpa` → **200**

Optional `{ "comment" }`. Requires validate pass → `PENDING_FPA_REVIEW`.  
Owner-level: still use `POST /tasks/{taskId}/submit`.

### `POST /budget-cycles/{id}/fpa-accept` → **200** → `PENDING_CFO_REVIEW`

### `POST /budget-cycles/{id}/fpa-return` → **200**

```json
{ "comment": "required", "departmentIds": ["dept_…"] }
```

→ `RETURNED_FOR_CORRECTION` (reopens tasks).

### `POST /budget-cycles/{id}/cfo-approve` → **200** → `APPROVED`

### `POST /budget-cycles/{id}/cfo-return` → **200**

```json
{ "comment": "required" }
```

### `POST /budget-cycles/{id}/lock` → **200**

Locks cycle `versionId`. → `LOCKED`. Idempotent.

### `POST /budget-cycles/{id}/board-pack` → **200**

```json
{ "url": "/api/v1/fpa/exports/{jobId}/download", "cycle": { }, "exportJobId": "…" }
```

→ `currentStage: REPORTS` (auto-locks if still `APPROVED`).

### `GET /budget-cycles/{id}/summary` → **200** (P1)

`byCategory[]`, `byDepartment[]`.

---

## State machine

```
OPEN_FOR_INPUT | RETURNED_FOR_CORRECTION
  → validate / submit-fpa → PENDING_FPA_REVIEW
PENDING_FPA_REVIEW
  → fpa-accept → PENDING_CFO_REVIEW
  → fpa-return → RETURNED_FOR_CORRECTION
PENDING_CFO_REVIEW
  → cfo-approve → APPROVED
  → cfo-return → RETURNED_FOR_CORRECTION
APPROVED
  → lock → LOCKED
  → board-pack → LOCKED + REPORTS
```

---

## Supporting (reuse)

### `GET /api/departments` → **200**

Auth required. Returns org `departments` rows for `owners[].departmentId`:

```json
{
  "success": true,
  "data": [
    { "id": "cm…", "name": "Finance", "description": "…", "branch": null, "isActive": true }
  ],
  "count": 9
}
```

If the table is empty, seeds the standard catalog (Finance, Sales, Operations, …) once so owners can be bound. Prefer `id` from this list — do **not** send department names as `departmentId`.

Also: `GET /api/departments/{id}`.

| Path | Use |
|------|-----|
| `GET /tasks/my-tasks` | Owner task list |
| `POST /tasks/{id}/submit\|return\|approve\|reassign` | Per-task actions |
| `GET /models/{id}/grid` | Owner input |
| `GET /departments` | Owner picker — `{ id, name }` (`/api/departments`) |
| `GET /workflows?workflowType=BUDGET` | Fallback list (legacy) |

Cells stay on the planning grid; the cycle governs **process** only.

---

## Happy path (HTTP)

```http
POST /api/v1/fpa/budget-cycles
POST /api/v1/fpa/budget-cycles/{id}/validate
POST /api/v1/fpa/budget-cycles/{id}/submit-fpa
POST /api/v1/fpa/budget-cycles/{id}/fpa-accept
POST /api/v1/fpa/budget-cycles/{id}/cfo-approve
POST /api/v1/fpa/budget-cycles/{id}/lock
POST /api/v1/fpa/budget-cycles/{id}/board-pack
```

Owner input between create and submit: worksheet + `POST /tasks/{taskId}/submit`.

---

## Acceptance checklist

- [ ] Create cycle assigns owners and creates tasks  
- [ ] Prior actuals + baseline on create or dedicated posts  
- [ ] Validate blocks submit when incomplete  
- [ ] FP&A accept/return and CFO approve/return implement decision diamonds  
- [ ] Return restores `RETURNED_FOR_CORRECTION` / `OWNER_INPUT`  
- [ ] Lock freezes version; board pack URL after approve/lock  
- [ ] `GET /budget-cycles` powers Budgeting tab  

---

## All-DB migration (VPS)

```bash
# from repo root (SSH via credentials)
python scripts/run-fpa-budget-cycles-migration-all-dbs-vps.py
# or on VPS per DB:
DATABASE_URL="mysql://…/nts…" npm run db:migrate:fpa-budget-cycles
DATABASE_URL="mysql://…/client1_db…" npm run db:migrate:fpa-budget-cycles
DATABASE_URL="mysql://…/demo_env…" npm run db:migrate:fpa-budget-cycles
```
