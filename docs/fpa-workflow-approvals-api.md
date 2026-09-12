# FP&A Workflow & Approvals — API (review cockpit)

Base: `{host}/api/v1/fpa`  
Auth: Bearer token  
Related: [fpa-budgeting-owner-workspace-api.md](./fpa-budgeting-owner-workspace-api.md) · [fpa-notifications.md](./fpa-notifications.md)

Envelope: `{ "success": true, "data": … }` for JSON routes.  
**Binary routes** (`…/tasks/export`, `…/exports/{id}/download`, `…/attachments/{id}/download`) return raw bytes — **no** success envelope on 2xx. Errors on non-2xx may still be JSON.

Canonical surface remains **`/budget-cycles`** (no dual `/planning-cycles`).

---

## Already wired (unchanged)

| Need | Endpoint |
|------|----------|
| Cycle detail | `GET /budget-cycles/{id}` |
| Review board | `GET /budget-cycles/{id}/review-workspace` |
| My tasks | `GET /tasks/my-tasks` |
| Accept / approve / return / lock | cycle + task action POSTs |

**Display names:** `GET /tasks/my-tasks`, workflow list/detail nested tasks, and home `openTasks` resolve **`departmentName`** (plus alias `department`) and **`assigneeName`**. Do not render raw `departmentId` in the UI when `departmentName` is present.

---

## Contracts

### 1. All cycle tasks — `GET /budget-cycles/{id}/tasks`

FP&A/CFO only. Query: `status`, `departmentId`, `assigneeId`, `priority`.

**Priority enum (canonical):** `HIGH` · `MEDIUM` · `LOW`  
Legacy DB value `NORMAL` is **mapped to `MEDIUM`** on read. Filtering `priority=MEDIUM` also matches stored `NORMAL`. New tasks default to `MEDIUM`.

```json
{
  "success": true,
  "data": [
    {
      "id": "…",
      "title": "Finance budget input",
      "status": "SUBMITTED",
      "priority": "MEDIUM",
      "departmentId": "…",
      "departmentName": "Finance",
      "assigneeId": "…",
      "assigneeName": "Jane Cooper",
      "reviewerId": null,
      "reviewerName": null,
      "dueDate": "2026-07-01",
      "submittedOn": "2026-06-28T12:00:00.000Z",
      "changeNotes": "Increased travel for Q3 campaigns"
    }
  ]
}
```

### 1b. Tasks CSV export — `GET /budget-cycles/{id}/tasks/export`

Raw CSV (FE: `responseType: 'blob'`). **Not** wrapped in `{ success, data }`.

```http
HTTP/1.1 200 OK
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="cycle-tasks.csv"
```

Header row:

```csv
Task,Department,Assignee,Status,Priority,Due Date,Submitted On,Reviewer
```

UTF-8 BOM included for Excel. Errors → non-2xx JSON only.

---

### 2. Approval events — `GET /budget-cycles/{id}/approval-events`

Always available (review workspace also returns `approvalHistory`).

```json
{
  "id": "…",
  "actorId": "…",
  "actorName": "…",
  "action": "APPROVED",
  "rawAction": "APPROVE",
  "target": { "type": "TASK", "id": "…", "title": "…" },
  "comment": "…",
  "commentSnippet": "…",
  "createdAt": "…"
}
```

`action` normalized: `SUBMITTED` · `ACCEPTED` · `APPROVED` · `RETURNED` · `LOCKED` · `REASSIGNED`.

---

### 3. Stage stepper dates

On **`GET …/review-workspace`** and **`GET …/budget-cycles/{id}`** (`data.stages` / cycle `stages`):

```json
"stages": [
  { "key": "SETUP", "label": "Setup", "start": "…", "end": "…", "status": "DONE" },
  { "key": "DEPT_INPUT", "label": "Dept Input", "start": "…", "end": "…", "status": "DONE" },
  { "key": "FPA_REVIEW", "label": "FP&A Review", "start": "…", "end": null, "status": "ACTIVE" },
  { "key": "CFO_APPROVAL", "label": "CFO Approval", "start": null, "end": null, "status": "PENDING" },
  { "key": "LOCKED", "label": "Locked", "start": null, "end": null, "status": "PENDING" }
]
```

Timestamps set on transition: `openedAt` (open), `fpaReviewAt` (submit-fpa), `cfoReviewAt` (fpa-accept), `approvedAt` / `lockedAt`.

---

### 4. Comments & visibility

```http
GET  /budget-cycles/{id}/comments
POST /budget-cycles/{id}/comments
GET  /tasks/{id}/comments
POST /tasks/{id}/comments
```

Body: `{ "body": "…", "visibility": "INTERNAL" | "ALL" }`

| Rule | Behavior |
|------|----------|
| Non-approvers GET | Never receive `INTERNAL` rows (only `ALL` + own comments) |
| FP&A / CFO POST | May set `INTERNAL` or `ALL` |
| Owners / others POST | `ALL` only (`INTERNAL` → 403) |

FE may post `visibility: "ALL"` until the toggle ships.

---

### 5. Attachments

```http
GET    /tasks/{id}/attachments
POST   /tasks/{id}/attachments          # multipart field name: **file** (required)
GET    /attachments/{id}/download       # binary + Content-Disposition
DELETE /attachments/{id}                # approvers → { "deleted": true }
```

List / upload item shape:

```json
{
  "id": "att_…",
  "fileName": "marketing-notes.xlsx",
  "size": 24576,
  "sizeBytes": 24576,
  "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "uploadedAt": "2026-07-12T14:00:00.000Z",
  "uploadedByName": "Jane Cooper"
}
```

---

### 6. Task budget summary — `GET /tasks/{id}/summary`

Happy path:

```json
{
  "priorFy": 1200000,
  "request": 1350000,
  "pctChange": 12.5,
  "currency": "USD",
  "changeNotes": "…",
  "lines": [
    { "label": "Revenue", "prior": 800000, "request": 900000, "pctChange": 12.5 }
  ]
}
```

**No data yet → 200**, not 404:

```json
{
  "priorFy": null,
  "request": null,
  "pctChange": null,
  "currency": "USD",
  "changeNotes": null,
  "lines": []
}
```

Prior = cells with `sourceType=ACTUAL`; request = other planning values for the task department.

---

### 7. Change notes on submit

```http
POST /tasks/{id}/submit
{ "comment": "optional", "changeNotes": "Increased travel for Q3…" }
```

Also accepts `notes`. Returned on task list / review `taskQueue` / summary.

---

### 8. Board pack — real `.xlsx` binary (P0)

```http
POST /budget-cycles/{cycleId}/board-pack
Content-Type: application/json

{}
```

```json
{
  "success": true,
  "data": {
    "id": "exportJobId",
    "exportJobId": "exportJobId",
    "boardPackUrl": "/api/v1/fpa/exports/exportJobId/download",
    "cycle": { "id": "…", "status": "LOCKED", "boardPackUrl": "…" }
  }
}
```

Then:

```http
GET /exports/{exportId}/download
```

```http
HTTP/1.1 200 OK
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="FY2026-board-pack.xlsx"
```

**Body:** raw `.xlsx` bytes (Cover + Detail + By Line sheets).  
**Do not** treat download as JSON cell dump. Older jobs that only stored JSON are rebuilt to xlsx on download.

---

### 9. Week-over-week deltas (review workspace)

On `progress`:

```json
"pendingDeltaWoW": 3,
"returnedDeltaWoW": -1
```

Activity-based proxies (submits / returns this week vs prior week).

---

## Review workspace extras

`GET /budget-cycles/{id}/review-workspace` includes:

- `stages[]`
- `progress.pendingDeltaWoW` / `returnedDeltaWoW`
- `approvalHistory[]` (always; empty array if none)
- `taskQueue[].changeNotes` / `submittedOn` / `reviewerId`

---

## Acceptance checklist (API UAT)

- [ ] Locked cycle → Open board pack → Excel opens real workbook (not notepad JSON)
- [ ] Workflow → Export → `.csv` opens with task rows (header as above)
- [ ] Upload attachment (`file`) → list → download binary works
- [ ] `GET …/tasks` → `priority` is `HIGH` / `MEDIUM` / `LOW`
- [ ] `GET …/tasks/{id}/summary` with no cells → `200` + `lines: []` + null totals
- [ ] Comments: non-approver never sees `INTERNAL`; owner cannot POST `INTERNAL`
- [ ] Change notes round-trip on submit
- [ ] WoW deltas from API fields only
