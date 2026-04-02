# B-Series + end-to-end performance flow (Postman)

Use this as the **ordered** checklist when testing internal integration (B-series) **after** goals, department roll-down, and tasks exist.

**Base URL:** `{{baseUrl}}` (e.g. `http://localhost:3000`).  
**Headers:** `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json` (except multipart).

> **Note:** `POST /api/performance/breakdown/*` routes are mounted **without** `authenticate` in code—treat as environment-dependent; prefer authenticated sessions for real UAT.

---

## 0. Discover KPIs (database IDs for tasks)

Goals accept **`kpiName`** (must match a row in `kpis.name`). Tasks accept **`kpi.id`** (UUID from DB).

| Action | Method & path |
|--------|----------------|
| List KPIs (DB ids + names) | `GET /api/kpis` |
| Hardcoded catalog (no DB id) | `GET /api/performance/kpis` |

---

## 1. Create a company / org goal

**`POST /api/performance/goals`**

Required body fields (validated in controller): `title`, `type`, `category`, `startDate`, `endDate`, `targetValue`, `targetUnit`.

Example — company goal linked to a seeded KPI by **exact name**:

```json
{
  "title": "FY26 Total revenue target",
  "description": "Org-level revenue goal for B-series sync tests",
  "type": "company",
  "category": "financial",
  "targetValue": 5000000,
  "targetUnit": "USD",
  "currentValue": 0,
  "kpiName": "Total Revenue",
  "priority": "high",
  "startDate": "2026-01-01T00:00:00.000Z",
  "endDate": "2026-12-31T23:59:59.000Z",
  "targetOperator": ">=",
  "dataSourceModule": "Accounting",
  "dataSourceField": "revenue.ytd",
  "trackingFrequency": "Monthly"
}
```

**`type`** values used in code: `"company"`, `"department"`, `"individual"`.  
**`category`:** e.g. `"financial"`, `"operational"`, `"strategic"`.

Save the returned **`goal.id`** as `{{parentGoalId}}`.

**Department and individual goals in this flow:** use **breakdown** endpoints in §2–3 (not a second `POST /api/performance/goals`). Breakdown **copies `kpiId`** from the company parent to each department goal, and from the department goal to each individual. **`targetOperator` and `isReverseKpi`** match the parent unless you set them on a breakdown row (override).

---

## 2. Department goals — breakdown (primary path)

**`GET /api/performance/breakdown/departments/available`** — list valid department names.  
**`POST /api/performance/breakdown/departments`**

Minimum example — **no `kpiName` / `targetOperator` here**; they are inherited from the company goal:

```json
{
  "parentGoalId": "{{parentGoalId}}",
  "selectedDepartments": ["Finance", "Sales"],
  "breakdownData": [
    {
      "title": "Finance slice of revenue goal",
      "description": "Finance-owned portion",
      "targetValue": 2000000,
      "targetUnit": "USD",
      "priority": "high",
      "startDate": "2026-01-01",
      "endDate": "2026-12-31"
    },
    {
      "title": "Sales slice of revenue goal",
      "description": "Sales-owned portion",
      "targetValue": 3000000,
      "targetUnit": "USD",
      "priority": "high",
      "startDate": "2026-01-01",
      "endDate": "2026-12-31"
    }
  ]
}
```

Optional per row if you need to differ from the company goal: `targetOperator`, `isReverseKpi`, `dataSourceModule`, `dataSourceField`, `trackingFrequency`, `contributionWeightPercent`.

**Dates:** `startDate` / `endDate` may be calendar strings (`"2026-01-01"`) or full ISO datetimes; the API normalizes them for Prisma.

`selectedDepartments.length` must equal `breakdownData.length`.  
Save a department goal id as `{{departmentGoalId}}`.

---

## 3. Individual goals — breakdown

**`GET /api/performance/breakdown/users/Finance`** — user ids for assignment (path = department name).  
**`POST /api/performance/breakdown/individuals`**

Inherited from the **department** goal: **`kpiId`**, **`targetOperator`**, **`isReverseKpi`** (unless overridden on the row).

When a row is converted to a task, the assignee gets an **email** (if their user record has an email) via `EmailNotificationService` / platform SMTP: task title, target value & unit, priority, goal start/end dates, department, description, and task id.

```json
{
  "departmentGoalId": "{{departmentGoalId}}",
  "selectedUsers": ["{{userId1}}", "{{userId2}}"],
  "individualData": [
    {
      "title": "Individual revenue contribution — User 1",
      "targetValue": 800000,
      "targetUnit": "USD",
      "priority": "medium",
      "startDate": "2026-01-01",
      "endDate": "2026-12-31"
    },
    {
      "title": "Individual revenue contribution — User 2",
      "targetValue": 1200000,
      "targetUnit": "USD",
      "priority": "medium",
      "startDate": "2026-01-01",
      "endDate": "2026-12-31"
    }
  ]
}
```

Optional per row: `targetOperator`, `isReverseKpi`, `dataSourceModule`, `dataSourceField`, `trackingFrequency`, `contributionWeightPercent`.  
Same **date** rules as §2 (`YYYY-MM-DD` or full ISO).

---

## Appendix: direct `POST /api/performance/goals` for a department goal

Only if you are **not** using breakdown: you must supply `departmentName`, `kpiName`, `targetOperator`, etc. yourself — **`parentGoalId` does not auto-fill those fields.**

```json
{
  "title": "Finance — AR collection target",
  "type": "department",
  "category": "financial",
  "departmentName": "Finance",
  "parentGoalId": "{{parentGoalId}}",
  "targetValue": 500000,
  "targetUnit": "USD",
  "kpiName": "Accounts Receivable Outstanding",
  "startDate": "2026-01-01T00:00:00.000Z",
  "endDate": "2026-06-30T23:59:59.000Z",
  "targetOperator": "<=",
  "trackingFrequency": "Monthly"
}
```

---

## 4. Tasks linked to goals (Kanban / completion → goal progress)

**`POST /api/tasks`**

Required: `title`, `team`, `date`.  
`team` is an **array of user id strings** (assignees).  
Link to performance: `goalId`, optional `isPerformanceTask`, `performanceCategory`, `kpi` (object with DB **`id`** from `GET /api/kpis`).

```json
{
  "title": "Close Q1 revenue gap",
  "description": "Follow up top accounts",
  "team": ["{{userId1}}"],
  "stage": "To Do",
  "date": "2026-03-31T17:00:00.000Z",
  "priority": "high",
  "department": "Sales",
  "goalId": "{{departmentGoalId}}",
  "isPerformanceTask": true,
  "performanceCategory": "operational",
  "kpi": {
    "id": "{{kpiUuidFromGetKpis}}"
  }
}
```

Other useful task endpoints (see **D-series** doc): `PUT /api/tasks/:id/stage`, `PUT /api/tasks/bulk/stage`, `DELETE /api/tasks/bulk` with `{ "taskIds": [] }`.

---

## 5. Goal progress (manual)

**`PUT /api/performance/goals/:id/progress`**

Body: **`value`** (or **`currentValue`**) — amount **added** to the goal’s achieved total in that goal’s unit (USD, percentage points, etc.). From **0** baseline, sending **`1250000`** sets achieved to **1,250,000** and updates **`progressPercentage`** vs **`targetValue`**. Legacy **`monetaryValueAchieved`** / **`percentValueAchieved`** (and caps) stay in sync.

```json
{
  "value": 1250000
}
```

Alias:

```json
{
  "currentValue": 1250000
}
```

After each successful update, if the goal has a **`parentGoalId`**, the server **recomputes the parent** (department or company) as a **weighted average of sibling achievement** (`computeParentRollupFromChildren` — same weights as scorecard: `activities.contributionWeightPercent` / `scorecardWeight`, else **equal split** across children). That roll-up runs **asynchronously** right after the child row is saved, so **`GET` the parent** immediately may need a **short retry** if you assert parent % in the same script.

### UAT: Individual → department roll-up (three people @ 50%)

1. Create or use one **department** goal with **three individual** child goals (same parent). Note each **individual** `id` and **`targetValue`**.  
2. For each individual, **add** half of that goal’s target (from **0** baseline this lands at 50% achievement): e.g. `value = targetValue * 0.5`:
   - `PUT /api/performance/goals/{{individualGoalId1}}/progress` → `{ "value": <0.5 * target 1> }` (or `"currentValue"` alias)  
   - Repeat for `individualGoalId2` and `individualGoalId3`.  
3. **`GET /api/performance/goals/{{departmentGoalId}}`** — expect **`progressPercentage`** ≈ **50** when weights are equal (each child at 50% achievement); retry briefly if the parent has not refreshed yet.  
4. **`suggestedCurrentValue`** on the parent is derived from that weighted % and the parent’s **`targetValue`**.

Optional weights: set **`contributionWeightPercent`** on each child (via goal update / config) so they sum to 100; the parent % becomes the weighted mix of each child’s achievement.

**If a parent ever looks stale** (e.g. legacy data): **`POST /api/performance/rollup/{{departmentOrRootGoalId}}/recalculate`** — walks the tree bottom-up and refreshes department/company aggregates (auth required).

---

## 6. B-series — integration (after goals exist)

Set env: **`PERFORMANCE_INTERNAL_BASE_URL`** or **`INTERNAL_API_BASE_URL`** (prepended to relative `endpointPath`).

### `POST /api/performance/integration/sync` — **Postman default (goals from §1 usually have no DB sync URL)**

Use **`goalId`** plus internal source fields. Relative **`endpointPath` must include `/v1/`** (SRD 7.5). The server **GETs** the URL, reads the number at **`fieldPath`**, normalizes decimals, updates the goal, and writes a **`PerformanceSyncJob`**.

**Portfolio IRR (6 dp + pending approval)** — inferred when KPI name / `fieldPath` looks like IRR (or `formulaType` is set on the goal). Example:

```json
{
  "goalId": "{{goalId}}",
  "endpointPath": "/api/accounting/v1/kpis/portfolio-irr",
  "fieldPath": "data.metrics.irr",
  "bearerToken": "optional-internal-bearer"
}
```

**AUM / other metrics** — same shape; adjust path and `fieldPath` to your internal API contract.

**Integer “cents” from accounting → dollars in PM** — optional scaling:

```json
{
  "goalId": "{{goalId}}",
  "endpointPath": "/api/accounting/v1/kpis/usd-balance",
  "fieldPath": "data.amountCents",
  "divideBy": 100
}
```

**Minimal body** (only if the goal already has **`syncEndpointPath`** and **`syncConfig.fieldPath`** in the database):

```json
{
  "goalId": "{{goalId}}"
}
```

Otherwise the API returns an error telling you to pass `endpointPath` / `fieldPath`.

| UAT theme | How to verify on this endpoint |
|-----------|--------------------------------|
| **IRR precision (6 dp)** | Sync an IRR-linked goal (KPI name or `fieldPath` contains `irr`); check `preciseCurrentValue` / job payload. |
| **Cron / worker** | *Out of scope for this checklist* — not required here. |
| **`/v1/` on internal URL** | Omit `/v1/` in `endpointPath` → request rejected. |
| **Exponential backoff** | Simulate **503** from internal API; job retries with waits **1s, 2s, 4s, 8s, 16s** (see `GET .../integration/jobs`). |
| **Error logging** | Server logs `[PerformanceSync]` with **goalId**, **kpiId**, **errorCode**, **timestamp**; job row has **errorCode**, **errorMessage**, **payloadSummary** (includes **kpiId**, **failedAt**). |
| **Data transformation** | Use **`divideBy`** for integer → decimal; otherwise raw value is parsed with `asNumber` then normalized. |
| **Manual override** | Use **`POST .../integration/override`** as **manager / HR / CEO** with a **comment**; plain employees get **403** (see service). |

**`GET /api/performance/integration/jobs?goalId={{goalId}}&status=COMPLETED`**

**`POST /api/performance/integration/approve`**

```json
{
  "goalId": "{{goalId}}",
  "approvedValue": 12.345678,
  "comment": "Approved after finance review"
}
```

**`POST /api/performance/integration/override`**

```json
{
  "goalId": "{{goalId}}",
  "value": 12.35,
  "comment": "Manual override — source feed stale"
}
```

**`POST /api/performance/integration/import`** — `multipart/form-data`, field name **`file`** (CSV/XLSX).

---

## 7. Goal tracking automation

| Action | Method & path |
|--------|----------------|
| Check one goal | `POST /api/performance/goal-tracking/{{goalId}}` |
| Check all due | `POST /api/performance/goal-tracking/check-all` |
| Cron-style schedule | `POST /api/performance/goal-tracking/schedule` |
| Stats | `GET /api/performance/goal-tracking/stats` |

Bodies are empty unless your environment adds custom middleware.

---

## 8. Individual goal → tasks (optional)

Mounted at **`/api/performance/individual-goals`**. Actual paths include a repeated segment:

| Action | Path |
|--------|------|
| Convert one individual goal | `POST /api/performance/individual-goals/individual-goals/{{individualGoalId}}/convert-to-tasks` |
| Convert all for user | `POST /api/performance/individual-goals/users/{{userId}}/convert-goals-to-tasks` |
| Convert all for department | `POST /api/performance/individual-goals/departments/{{departmentName}}/convert-goals-to-tasks` |

---

## 9. KPIs in the system (source: `src/config/hardcodedKPIs.ts`)

Seeder `scripts/05-seed-kpis.ts` creates DB rows with **`name`** equal to the **`name`** below. Use **`kpiName`** on goal create with these strings exactly.

| Code | Name | Department |
|------|------|------------|
| TOTAL_REVENUE | Total Revenue | Finance |
| NET_PROFIT | Net Profit | Finance |
| OPERATING_EXPENSES | Operating Expenses | Finance |
| CASH_FLOW_NET | Cash Flow (Net) | Finance |
| BUDGET_UTILISATION | Budget Utilisation | Finance |
| ACCOUNTS_RECEIVABLE_OUTSTANDING | Accounts Receivable Outstanding | Finance |
| ACCOUNTS_PAYABLE_OUTSTANDING | Accounts Payable Outstanding | Finance |
| TOTAL_LIABILITIES | Total Liabilities | Finance |
| SHAREHOLDERS_EQUITY | Shareholders' Equity | Finance |
| CASH_BALANCE | Cash Balance | Finance |
| PORTFOLIO_FAIR_VALUE | Portfolio Fair Value | Investments |
| UNREALIZED_GAIN_LOSS | Unrealized Gain / Loss | Investments |
| DIVIDEND_INCOME | Dividend Income | Investments |
| SALES_REVENUE | Sales Revenue | Sales |
| MARKETING_EXPENSE | Marketing Expense | Sales |
| SALES_COMMISSION_EXPENSE | Sales Commission Expense | Sales |
| ADVERTISING_SPEND | Advertising Spend | Sales |
| PROMOTIONAL_BUDGET_UTILISATION | Promotional Budget Utilisation | Sales |
| PAYROLL_EXPENSE | Payroll Expense | Human Resources |
| STAFF_WELFARE_EXPENSE | Staff Welfare Expense | Human Resources |
| TRAINING_EXPENSE | Training Expense | Human Resources |
| RECRUITMENT_COST | Recruitment Cost | Human Resources |
| HR_BUDGET_UTILISATION | HR Budget Utilisation | Human Resources |
| PROCUREMENT_SPEND | Procurement Spend | Procurement |
| SUPPLIER_PAYMENTS_MADE | Supplier Payments Made | Procurement |
| OUTSTANDING_SUPPLIER_INVOICES | Outstanding Supplier Invoices | Procurement |
| COST_PER_PURCHASE_ORDER | Cost per Purchase Order | Procurement |
| PROCUREMENT_BUDGET_UTILISATION | Procurement Budget Utilisation | Procurement |
| PRODUCTION_EXPENSE | Production Expense | Operations |
| RAW_MATERIAL_COST | Raw Material Cost | Operations |

---

## 10. Quick reference — paths

| Step | Method | Path |
|------|--------|------|
| Create goal | POST | `/api/performance/goals` |
| List goals | GET | `/api/performance/goals?type=department&department=Finance` |
| Dept breakdown | POST | `/api/performance/breakdown/departments` |
| Individual breakdown | POST | `/api/performance/breakdown/individuals` |
| Create task | POST | `/api/tasks` |
| Goal progress (+ parent roll-up) | PUT | `/api/performance/goals/:id/progress` |
| Roll-up read | GET | `/api/performance/rollup/:goalId` |
| Roll-up recalculate tree | POST | `/api/performance/rollup/:goalId/recalculate` |
| Sync | POST | `/api/performance/integration/sync` |
| Jobs | GET | `/api/performance/integration/jobs` |
| Approve | POST | `/api/performance/integration/approve` |
| Override | POST | `/api/performance/integration/override` |
| Import | POST | `/api/performance/integration/import` |
| Track one | POST | `/api/performance/goal-tracking/:goalId` |
| Track schedule | POST | `/api/performance/goal-tracking/schedule` |

See also: [B-series-integrations.md](./B-series-integrations.md), [D-series-kanban-tasks.md](./D-series-kanban-tasks.md), [POSTMAN-READY.md](./POSTMAN-READY.md).
