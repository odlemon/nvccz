# FP&A Annual Budgeting — FE API (cycle create + owner workspace)

Base: `{host}/api/v1/fpa`  
Auth: `Authorization: Bearer {token}`  
Related: [fpa-budgeting-api.md](./fpa-budgeting-api.md) · [fpa-budgeting-flow.md](./fpa-budgeting-flow.md)

Envelope: `{ "success": true, "data": { } }`  
Errors: `{ "success": false, "code": "…", "message": "…", "errors": [...] }`

---

## Happy path (staged open)

```http
POST   /budget-cycles                         → DRAFT
PATCH  /budget-cycles/{id}                    → update setup
POST   /budget-cycles/{id}/validate-setup     → full error list
POST   /budget-cycles/{id}/open               → OPEN_FOR_INPUT + notify owners
GET    /budget-cycles/{id}/owner-workspace    → owner sheet shell
GET    /models/{modelId}/grid?cycleId=…       → scoped worksheet
POST   /tasks/{taskId}/submit                 → blocked until §3.3 gates pass
```

Legacy: `POST /budget-cycles` with `"openImmediately": true` still opens in one step (after setup validation).

---

## 1. Create cycle — `POST /budget-cycles` → **201** (DRAFT)

```json
{
  "modelId": "cm…",
  "name": "FY2028 Annual Budget",
  "fiscalYear": 2028,
  "planningType": "ANNUAL_BUDGET",
  "versionId": "cm…",
  "scenarioId": "cm…",
  "startDate": "2028-01-01",
  "endDate": "2028-12-31",
  "actualsCutoffDate": "2027-12-31",
  "forecastStartPeriod": "2028-01-01",
  "submissionDeadline": "2027-11-30",
  "baseCurrency": "USD",
  "cycleOwnerId": "user_…",
  "entityIds": ["ent_…"],
  "baselineMode": "PRIOR_YEAR_ACTUAL",
  "baselineSourceVersionId": null,
  "loadPriorActuals": true,
  "loadBaseline": true,
  "openImmediately": false,
  "inputCategories": ["REVENUE", "PAYROLL", "OPERATING_EXPENSES", "DEPARTMENTAL"],
  "owners": [
    {
      "departmentId": "dept_…",
      "assigneeId": "user_…",
      "categories": ["PAYROLL", "OPERATING_EXPENSES"],
      "dueDate": "2027-11-15"
    }
  ]
}
```

**`planningType`:** `ANNUAL_BUDGET` · `QUARTERLY_FORECAST` · `ROLLING_FORECAST` · `REFORECAST` · `LONG_RANGE_PLAN` · `STRATEGIC_PLAN`

Response `data.status` is **`DRAFT`** unless `openImmediately: true`.

---

## 2. Update setup — `PATCH|PUT /budget-cycles/{id}` → **200**

Allowed in `DRAFT | OPEN_FOR_INPUT | RETURNED_FOR_CORRECTION`.  
Body: any subset of create fields + optional `owners[]` (replaces via set-owners).

---

## 3. Validate setup — `POST /budget-cycles/{id}/validate-setup` → **200**

Returns **every** unmet requirement:

```json
{
  "passed": false,
  "message": "Planning cycle cannot be opened.\n4 requirements remain:",
  "errors": [
    { "code": "OWNER_UNASSIGNED", "step": "ASSIGN_OWNERS", "message": "Operations Department has no Budget Owner." },
    { "code": "DRIVER_RATE_MISSING", "step": "CONFIGURE_DRIVERS", "message": "USD/ZiG forecast rate is missing or zero…" },
    { "code": "CFO_STAGE_MISSING", "step": "CONFIGURE_WORKFLOW", "message": "CFO approval stage has not been configured…" },
    { "code": "COA_MISSING", "step": "SELECT_MODEL", "message": "Required chart-of-accounts mappings are missing…" }
  ]
}
```

---

## 4. Open cycle — `POST /budget-cycles/{id}/open` → **200**

Optional body: `{ "loadPriorActuals": true, "loadBaseline": true }`  
**400** `SETUP_INCOMPLETE` with full `errors[]` if validate-setup fails.  
On success: loads actuals/baseline (flags), notifies owners, `status: OPEN_FOR_INPUT`.

---

## 5. Owner workspace — `GET /budget-cycles/{id}/owner-workspace` → **200**

Scoped to the caller’s assigned departments (FP&A/approvers see all).

```json
{
  "cycle": { "id": "…", "status": "OPEN_FOR_INPUT", "submissionDeadline": "…" },
  "budgetProgress": { "percent": 40, "trend": null },
  "submissionDue": { "date": "2027-11-30", "daysRemaining": 12 },
  "openTasks": { "count": 2, "completedCount": 0, "items": [] },
  "validationIssues": { "count": 3, "needsAttention": true, "items": [] },
  "planningAreas": [
    { "departmentId": "…", "area": "PAYROLL", "status": "IN_PROGRESS", "filledCells": 2, "totalCells": 12 }
  ],
  "departmentBudgetRegister": [
    {
      "departmentId": "…",
      "account": "PAYROLL",
      "method": "PRIOR_YEAR_ACTUAL",
      "priorYearActual": 100000,
      "currentBudget": 110000,
      "changePct": 10
    }
  ],
  "canSubmit": false,
  "unmetRequirements": [
    { "code": "MANDATORY_INPUT_INCOMPLETE", "message": "…", "severity": "BLOCKING" }
  ]
}
```

`planningAreas[].status`: `NOT_STARTED` · `IN_PROGRESS` · `COMPLETE`  
Validation item `status`: `BLOCKING` · `COMMENT` · `DONE`

Also: `POST /budget-cycles/{id}/validate-owner-submit` with optional `{ "departmentIds": [] }`.

---

## 6. Owner worksheet (grid)

### `GET /models/{modelId}/grid?cycleId=&versionId=&scenarioId=`

When `cycleId` is set:

- Non-approvers only see cells for their assigned departments (+ null-dept rows)
- Response includes `assignedDepartmentIds`, `periods[].periodRole`, `cells[].cellStatus`, `cells[].recordVersion`

**`cellStatus`:** `ACTUAL` · `INPUT` · `CALCULATED` · `IMPORTED` · `LOCKED` · `OVERRIDE` · `ERROR` · `PENDING_CALCULATION`  
Only **`INPUT`** cells are writable.

### `POST /models/{modelId}/cells/update`

```json
{
  "cellId": "…",
  "value": 2480000,
  "recordVersion": 15,
  "cycleId": "bc_…",
  "departmentId": "dept_…"
}
```

Or coordinate upsert: `versionId`, `scenarioId`, `lineItemId`, `periodDate`, `value`, `recordVersion?`, `cycleId?`.

**409 CONFLICT** (optimistic concurrency):

```json
{
  "success": false,
  "code": "CONFLICT",
  "message": "This value changed after you opened the worksheet.",
  "errors": [
    {
      "code": "CONFLICT",
      "currentValue": 120000,
      "recordVersion": 16,
      "changedBy": "Nyasha Chikore",
      "changedAt": "2026-07-12T14:32:00.000Z"
    }
  ]
}
```

### Bulk — `POST /models/{modelId}/cells/bulk-operation`

```json
{
  "operation": "PERCENT_INCREASE",
  "versionId": "…",
  "scenarioId": "…",
  "lineItemId": "…",
  "ratePct": 5,
  "cycleId": "…"
}
```

`operation`: `FILL_RIGHT` · `FILL_DOWN` · `COPY_PRIOR_PERIOD` · `COPY_PRIOR_YEAR` · `PERCENT_INCREASE` · `PERCENT_DECREASE` · `CLEAR_EDITABLE`  
Also keep: `…/spread`, `…/copy-forward`, `…/apply-growth`.

### Cell detail — `GET /models/{modelId}/cells/{cellId}/detail`

Line/period/dept/entity/version/scenario/value/`cellStatus`/formula/currentDrivers/history/comments.

---

## 7. Submission & maker-checker

- `POST /tasks/{id}/submit` runs owner §3.3 checks; **400** `SUBMISSION_BLOCKED` with full `errors[]`
- `POST /budget-cycles/{id}/submit-fpa` merges validate + owner checks (full list)
- `fpa-accept` / `cfo-approve` reject self-approval (**403** `MAKER_CHECKER`)

---

## User stories (FE acceptance)

### Rutendo — open FY2028 cycle

> As Rutendo (FP&A Manager), I open the FY2028 budget cycle and assign each department so the company prepares one controlled budget.

| Step | Expect |
|------|--------|
| Create cycle without `openImmediately` | `status: DRAFT` |
| Leave Operations without assignee | `validate-setup` lists `OWNER_UNASSIGNED` among others |
| Assign all owners + cutoff/deadline | `validate-setup.passed: true` |
| `POST …/open` | Owners notified; status `OPEN_FOR_INPUT`; prior actuals loaded when flagged |

### Nyasha — Marketing owner sheet

> As Nyasha (Marketing Director), I enter campaign/headcount/travel assumptions; Finance calculates the rest.

| Step | Expect |
|------|--------|
| `GET …/owner-workspace` | Marketing areas only; due date + progress |
| `GET …/grid?cycleId=` | Only Marketing-scoped cells; `cellStatus` distinguishes INPUT vs CALCULATED |
| Edit CALCULATED cell | **403** |
| Stale `recordVersion` | **409 CONFLICT** with current value + changedBy |
| Incomplete inputs | Submit disabled / `SUBMISSION_BLOCKED` with full unmet list |
| Complete + submit task | Task `SUBMITTED`; owner row progresses |

---

## Acceptance checklist (SRD subset)

- [ ] Create annual budget cycles (staged DRAFT → open)  
- [ ] Cycles use a published/valid model version  
- [ ] Actual vs forecast periods distinguishable (`periodRole` / `cellStatus`)  
- [ ] Department users only access authorised areas (`cycleId` grid scope)  
- [ ] INPUT editable; CALCULATED/ACTUAL/LOCKED not  
- [ ] Cell edits audit + `recordVersion` concurrency  
- [ ] Bulk ops server-validated  
- [ ] Owner submit blocked until §3.3 gates pass (full error list)  
- [ ] Maker-checker on FPA/CFO accept  
- [ ] Locked versions reject writes  
