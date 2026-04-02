**C.01** — `PUT /api/performance/goals/cmnee5j090001un5gud5rlh16/progress`

```json
{
  "value": 50000
}
```

**C.03** — `PUT /api/performance/goals/cmnee5j090001un5gud5rlh16`

```json
{
  "contributionWeightPercent": 10
}
```

**C.05** — `PUT /api/performance/goals/cmnee5j090001un5gud5rlh16`  
(51% of this goal’s `targetValue` **200000** → use **102000**, not 51000.)

```json
{
  "currentValue": 102000,
  "endDate": "2026-04-02T23:59:59.999Z"
}
```

**C.09** — `PUT /api/performance/goals/{goalId}`

```json
{
  "targetValue": 100,
  "stretchTargetValue": 120
}
```

**D.05** — `PUT /api/tasks/bulk/status-update`

```json
{
  "taskIds": [
    "cmnfs3kbh0001undkbthcyiyy",
    "cmnfs3kbh0002undkbthcyiyz",
    "cmnfs3kbh0003undkbthcyiz0",
    "cmnfs3kbh0004undkbthcyiz1",
    "cmnfs3kbh0005undkbthcyiz2"
  ],
  "stage": "completed"
}
```

**D.06** — `POST /api/tasks/{taskId}/historical-entry`

```json
{
  "historicalDate": "2020-05-20T00:00:00.000Z",
  "stage": "todo",
  "monetaryValueAchieved": 250,
  "percentValueAchieved": 15,
  "note": "Backfilled from legacy spreadsheet",
  "source": "legacy_import"
}
```

Frontend behavior when user selects a past due date:

- Detect `selectedDate < today` while creating/updating a task.
- Show a modal: "Historical entry detected. Add collected values and context."
- Collect and submit:
  - `historicalDate`
  - optional `monetaryValueAchieved`, `percentValueAchieved`
  - optional `note`, `source`, and `stage`
- Call `POST /api/tasks/{taskId}/historical-entry`.
- After save, show task chip/badge as red zone when API returns `isOverdue=true` / `overdueStatus`.

**D.10** — Attachment Support (upload in Detail modal/page)

`POST /api/performance/goals/{goalId}/attachments` (multipart/form-data)

- field: `attachments` (multiple files, max 10, each max 5MB)

`POST /api/tasks/{taskId}/attachments` (multipart/form-data)

- field: `attachments` (multiple files, max 10, each max 5MB)

Frontend placement (Detail):

- Goal attachments upload should happen in Goal Detail (organization/department/individual goal detail).
- Task attachments upload should happen in Task Detail modal/page.
- After upload success, refresh Detail data and render thumbnails/file links from:
  - goal: `attachments` and `attachmentUrls`
  - task: `attachments`

**E.01** — @ mention dropdown (task chat)

`GET /api/tasks/{taskId}/mention-suggestions?q=a`

- Query `q` is the text after `@` (e.g. user types `@a` → call with `q=a`).
- Matches are restricted to task collaborators: users on `team` plus the task `createdBy`.
- Each user in the response has only: `id`, `name`, `email`.

Example:

`GET /api/tasks/{taskId}/mention-suggestions?q=a`

**E.02** — Task chat messages (JSON only, no attachments)

`POST /api/tasks/{taskId}/messages`

```json
{
  "content": "Hello team",
  "mentionUserIds": []
}
```

With mentions (IDs from E.01):

```json
{
  "content": "Hi @Admin",
  "mentionUserIds": ["cmislgonq0001unfkpukqyiah"]
}
```

`GET /api/tasks/{taskId}/messages` — list chat history (same thread; no body).

Single message by logical path (optional):

`GET /api/tasks/{taskId}/chats/{msgId}` — no body (`msgId` is `data.id` from the POST response).

Receive messages in real time (Socket.IO):

- Connect to the **same host and port** as the API (e.g. `http://localhost:3009`).
- Pass JWT on connect: `auth: { token: "<jwt>" }` or `query: { token: "<jwt>" }`.
- After `connect`, join the task room: emit `join_task` with body `{ "taskId": "<taskId>" }`.
- Subscribe to **`task_message`** (and optionally `task_comment_created`, same payload) for incoming **new** messages; payload matches `data` from `POST .../messages` (includes `id`, `taskId`, `storagePath`, `content`, `author`, etc.).
- On task close / navigate away: emit `leave_task` with `{ "taskId": "<taskId>" }`.

**E.06** — Notification mark as read (badge count)

List notifications (includes unread badge source):

`GET /api/homepage/notifications?limit=50&offset=0`

- Response: `data.pagination.unread` = unread count; each item has `isRead`.

Mark one as read (simulates “click” in panel):

`PUT /api/homepage/notifications/{notificationId}/read`

- No body.
- Response includes `unread`: new unread count after this read.

Mark all read:

`PUT /api/homepage/notifications/read-all`

- No body.
- Response includes `unread: 0`.

Realtime (optional, for live badge): connect Socket.IO with JWT so the server can join `user:{userId}`. After a read, the server emits:

- `notification_read` — `{ id: "<notificationId>" }`
- `notification_unread_count` — `{ unread: <number> }`

Frontend should decrease the badge using `unread` from the PUT response or from the `notification_unread_count` event.

**E.08**

`DELETE /api/tasks/{taskId}/messages/{msgId}`

---

## Performance review — create through self-review (UAT)

**Scope:** Happy path from **create** through **self-review save** only. Do **not** send `stage` or `status` on the self-review `PUT` if you only want to persist content while staying in **SELF_REVIEW**.

**PR.01** — `POST /api/performance-reviews`

- **Auth:** `Authorization: Bearer <jwt>`
- **Required body:** `reviewType`, `reviewPeriod`, `title`, `revieweeId` (use the user’s id from your users API / admin UI).
- **`reviewerId`:** optional; if omitted or empty, the server uses the **logged-in user** as reviewer.

```json
{
  "reviewType": "ANNUAL",
  "reviewPeriod": "2026-Q1",
  "title": "Annual review — Finance",
  "description": "Optional short description",
  "revieweeId": "cml7spmbr000ckt1bcwq6pd8o",
  "scores": [],
  "criteria": []
}
```

**Expected (verify):**

- `data.status` = `PENDING`
- `data.stage` = `SELF_REVIEW`
- `data.reviewee` has `id`, `firstName`, `lastName`, `email`, `userDepartment` (no separate `departmentId` / nested `department` in this payload shape)
- Keep `data.id` as **`{reviewId}`** for PR.02 and PR.03

**PR.02** — `PUT /api/performance-reviews/{reviewId}` (self-review content)

- Omit **`stage`** and **`status`** so the review **stays** in self-review for this save.
- **`selfFeedback`:** must be **≥ 50 characters** after trim (validation error otherwise).
- **`ratingValue`:** if sent, must be a **whole number 1–5**; omit if not used in self-review.
- **`scores`:** any **`managerRating`** on an item must be a **whole number 1–5**; self-only payloads often omit `managerRating` or use **`selfRating`** only (see example).

```json
{
  "selfFeedback": "In Q1 I improved month-end close timelines and supported audit data requests. I partnered with AP to clear aged items and documented reconciliations. Next quarter I will focus on forecasting accuracy and clearer leadership updates.",
  "strengths": "Reliable delivery on close; strong attention to reconciliation detail.",
  "achievements": "February books closed ahead of prior year; no material audit adjustments in my scope.",
  "goals": "Complete advanced modeling training; lead one process improvement in Q2.",
  "areasForImprovement": "Delegate routine checks earlier; shorten leadership readouts.",
  "reviewStartDate": "2026-04-01T00:00:00.000Z",
  "criteria": [
    { "name": "Quality of work", "weight": 25 },
    { "name": "Collaboration", "weight": 25 }
  ],
  "scores": [
    { "criterion": "Quality of work", "selfRating": 4 },
    { "criterion": "Collaboration", "selfRating": 4 }
  ]
}
```

**PR.03** — `GET /api/performance-reviews/{reviewId}` — confirm `selfFeedback` and related fields persisted; `stage` still `SELF_REVIEW`.

**PR.04** — `POST /api/performance-reviews/{reviewId}/complete-stage`

- **Auth:** `Authorization: Bearer <jwt>`
- **Body:** none (empty body is fine).
- **Behavior:** Advances **one** step from the review’s **current** `stage` using server rules, e.g. **`SELF_REVIEW` → `MANAGER_REVIEW` → `FINAL_REVIEW`**.
- **When:** Call after self-review content is saved (PR.02); then the manager completes their **`PUT`** while at `MANAGER_REVIEW`; call **PR.04** again to reach `FINAL_REVIEW` if needed.
- **After `FINAL_REVIEW`:** this endpoint returns an error directing you to **`POST /api/performance-reviews/{reviewId}/finalize`** (PDF + lock), not another complete-stage.

**PR.05** — `POST /api/performance-reviews/{reviewId}/finalize` — run when content is ready; locks the review and generates the document (see API swagger / finalize handler).

**F.05** — Review cycle trigger (company-wide reminder run)

- `POST /api/performance/review-cycles`
- `POST /api/performance-reviews/cycles/{cycleId}/initiate`

**F.06** — Quantitative auto-populate (goal progress / task stages → `quantitativeSnapshot`)

- `POST /api/performance-reviews/{reviewId}/autopopulate`
- **Auth:** `Authorization: Bearer <jwt>`. **Body:** none. Fills `quantitativeSnapshot` from goals (assigned to reviewee in the review window) and tasks (reviewee on `team`, Kanban `stage` per task).

**F.10** — Department rating distribution (1–5 histogram source for charts)

- `GET /api/performance-reviews/reports/rating-distribution?departmentName=Finance&reviewPeriod=2026-Q1`
- **`departmentName`** — required (matches reviewee **`department.name`** or reviewee **`userDepartment`**).
- **`reviewPeriod`** — optional filter on review `reviewPeriod`.
