# FP&A Workflow & Approvals — API (review cockpit)

Base: `{host}/api/v1/fpa`  
Auth: Bearer token  
Related: [fpa-budgeting-owner-workspace-api.md](./fpa-budgeting-owner-workspace-api.md) · [fpa-notifications.md](./fpa-notifications.md)

Envelope: `{ "success": true, "data": … }`  
Canonical surface remains **`/budget-cycles`** (no dual `/planning-cycles`).

---

## Already wired (unchanged)

| Need | Endpoint |
|------|----------|
| Cycle detail | `GET /budget-cycles/{id}` |
| Review board | `GET /budget-cycles/{id}/review-workspace` |
| My tasks | `GET /tasks/my-tasks` |
| Accept / approve / return / lock | cycle + task action POSTs |
| Board pack | `POST …/board-pack` + export download |

---

## New / extended contracts

### 1. All cycle tasks — `GET /budget-cycles/{id}/tasks`

FP&A/CFO only. Query: `status`, `departmentId`, `assigneeId`, `priority`.

```json
{
  "success": true,
  "data": [
    {
      "id": "…",
      "title": "Finance budget input",
      "status": "SUBMITTED",
      "priority": "NORMAL",
      "departmentId": "…",
      "departmentName": "Finance",
      "assigneeId": "…",
      "assigneeName": "…",
      "reviewerId": null,
      "reviewerName": null,
      "dueDate": "2026-07-01",
      "submittedOn": "2026-06-28T12:00:00.000Z",
      "changeNotes": "Increased travel for Q3 campaigns"
    }
  ]
}
```

CSV export: `GET /budget-cycles/{id}/tasks/export` → `text/csv` attachment.

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

### 4. Comments & activity

```http
GET  /budget-cycles/{id}/comments
POST /budget-cycles/{id}/comments
GET  /tasks/{id}/comments
POST /tasks/{id}/comments
```

Body: `{ "body": "…", "visibility": "INTERNAL" | "ALL" }`  
`INTERNAL` requires FP&A/CFO. Non-approvers only see `ALL` (+ their own).

---

### 5. Attachments

```http
GET    /tasks/{id}/attachments
POST   /tasks/{id}/attachments          # multipart field: file
GET    /attachments/{id}/download
DELETE /attachments/{id}                # approvers
```

---

### 6. Task budget summary — `GET /tasks/{id}/summary`

```json
{
  "priorFy": 1200000,
  "request": 1350000,
  "pctChange": 12.5,
  "currency": "USD",
  "lines": [{ "label": "Revenue", "prior": 800000, "request": 900000 }],
  "changeNotes": "…"
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

### 8. Week-over-week deltas (review workspace)

On `progress`:

```json
"pendingDeltaWoW": 3,
"returnedDeltaWoW": -1
```

Activity-based proxies (submits / returns this week vs prior week) — not fabricated absolute counts.

---

## Review workspace extras

`GET /budget-cycles/{id}/review-workspace` now includes:

- `stages[]`
- `progress.pendingDeltaWoW` / `returnedDeltaWoW`
- `approvalHistory[]` (always; empty array if none)
- `taskQueue[].changeNotes` / `submittedOn` / `reviewerId`

---

## Acceptance checklist

- [ ] All Tasks table uses `GET …/tasks` (not only my-tasks merge)
- [ ] Recent Approvals uses `approvalHistory` or `…/approval-events`
- [ ] Stepper shows stage dates from `stages`
- [ ] Comments panel uses cycle/task comments APIs
- [ ] Attachments upload/list/download
- [ ] Drawer metrics from `…/summary`
- [ ] Change notes round-trip on submit
- [ ] WoW deltas shown only from API fields
- [ ] Export uses `…/tasks/export` CSV
