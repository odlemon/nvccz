## A-Series: Strategic alignment & BSC setup

**A.01** — `GET /api/performance/config/pillars`

**A.02** — Strategy create, list/get (with document URL), and PDF upload

**Auth:** `Authorization: Bearer <jwt>` on all calls below.

---

**1) Create strategy** — `POST /api/performance/config/strategies`

`Content-Type: application/json`

```json
{
  "title": "2026 Annual Strategy",
  "periodStart": "2026-01-01T00:00:00.000Z",
  "periodEnd": "2028-12-31T23:59:59.999Z",
  "visionStatement": "Grow sustainably while improving customer and employee outcomes.",
  "strategicGoalId": null,
  "strategyDocumentUrl": null,
  "pillarWeights": {
    "Financial": 25,
    "Customer & Market": 25,
    "Internal Operations": 25,
    "Learning, Growth & HR": 25
  },
  "metadata": {}
}
```

- Response `data.id` = `{strategyId}` for upload and GET-by-id.
- `strategicGoalId` may be set to a real `performance_goals.id` if you already have one; otherwise `null` and set on upload.

---

**2) List strategies** — `GET /api/performance/config/strategies`

- Query (optional): `includeArchived=true` (default) or `includeArchived=false` for active-only.
- Response `data` is an **array**. Each element includes **`strategyDocumentUrl`** after upload (remote URL). Clients open that URL (plain **GET**, no API auth) to **download** the PDF from the media server.

---

**3) Get one strategy** — `GET /api/performance/config/strategies/{strategyId}`

- Response `data` is a single object with **`strategyDocumentUrl`** when a document exists (same download behavior as list).

---

**4) Upload strategy PDF** — `POST /api/performance/config/strategies/{strategyId}/document`

- **`{strategyId}`:** use an **ACTIVE** strategy id from `GET /api/performance/config/strategies?includeArchived=false` (example snapshot: `cmnk3jos80000un8o4tsxxpmv` — see **A.07** for the same note on env-specific ids).

- **Body:** `multipart/form-data`
  - `file` — type **File**, `.pdf` (field name must be `file`).
  - `strategicGoalId` — type **Text**, optional; existing **`performance_goals.id`** to link metadata (UAT).
- Strategy must **not** be archived.
- **Pass check:** `200` → `data.strategyDocumentUrl` is the **remote** URL (same pattern as portfolio application uploads, e.g. `http://31.220.82.129/uploads/application-documents/...`). List/get (steps 2–3) then return the same URL for download.

---

**A.03** — Goal-to-pillar mapping (`performance_goals.pillar_id` + `scorecardPillar`)

**Auth:** `Authorization: Bearer <jwt>`

**Endpoint:** `PUT /api/performance/config/goals/{goalId}`

`Content-Type: application/json`

**Body (pillar only — e.g. link “Revenue Growth” to Financial):**

```json
{
  "scorecardPillar": "Financial"
}
```

- **`scorecardPillar`** must be one of the four fixed names: `Financial`, `Customer & Market`, `Internal Operations`, `Learning, Growth & HR` (exact spelling).
- **`goalId`:** from `GET /api/performance/goals` (find your Revenue Growth row) or any test goal id.
- Optional: add **`strategyId`** if you want the goal tied to your active strategy (same string as `POST .../strategies` response `data.id`).
- If you also change **`scorecardWeight`**, you must send **`weightChangeReason`** and sibling goals in the same **strategy + department** bucket must still total **100%** across that pillar. For a **pillar-only** update, omit `scorecardWeight`.

**Pass check:**

- `200` response `data.scorecardPillar` = `Financial`.
- `data.pillarId` = `bsc_financial` (stable slug written to DB column **`pillar_id`**).
- Confirm in DB: table **`performance_goals`**, column **`pillar_id`**, for that goal’s id.

**Read back:** `GET /api/performance/goals/{goalId}` (or list with filter `?scorecardPillar=Financial`) — response should include **`pillarId`** and **`scorecardPillar`**.

**Example (pass):** `PUT /api/performance/config/goals/cmned0krx0001unk8db642a12` with body `{ "scorecardPillar": "Financial" }` returned `success: true` and:

```json
{
  "scorecardPillar": "Financial",
  "pillarId": "bsc_financial"
}
```

(full response includes the rest of the goal; these two fields satisfy A.03 — DB `performance_goals.pillar_id` = `bsc_financial` for that id).

---

**A.04** — Multi-year strategy support (PE horizon longer than 12 months)

**Auth:** `Authorization: Bearer <jwt>`

The API only requires **`periodStart`** to be **before** **`periodEnd`**. There is **no** maximum length; ranges beyond 12 months (e.g. three calendar years) are allowed.

**Postman — create a new 3-year strategy**

`POST /api/performance/config/strategies`

`Content-Type: application/json`

```json
{
  "title": "UAT A.04 — Three-year strategy horizon",
  "periodStart": "2026-01-01T00:00:00.000Z",
  "periodEnd": "2028-12-31T23:59:59.999Z",
  "visionStatement": "Long-range performance horizon test.",
  "strategicGoalId": null,
  "strategyDocumentUrl": null,
  "pillarWeights": {
    "Financial": 25,
    "Customer & Market": 25,
    "Internal Operations": 25,
    "Learning, Growth & HR": 25
  },
  "metadata": {}
}
```

**Pass check:** `200`; `data.periodStart` / `data.periodEnd` match the body; span is **~3 years** (well over 12 months).

**Postman — update an existing strategy** (optional): `PUT /api/performance/config/strategies/{strategyId}` with the same JSON shape (include **`title`** and all required fields your `PUT` expects per Swagger).

**Negative check (should fail):** `periodStart` on or after `periodEnd` → error *“Strategy period start must be before period end.”*

---

**A.07** — CEO / strategy vision on employee “line of sight” (homepage)

Vision text lives on the **active performance strategy** (`visionStatement`). It is **not** a separate “settings” table; exec/admin updates it via strategy **create** or **update**.

**Update vision only (minimal `PUT`)** — `PUT /api/performance/config/strategies/{strategyId}`

`Content-Type: application/json`

Use the **`strategyId`** of your **ACTIVE** strategy (`GET /api/performance/config/strategies?includeArchived=false`).

**Sample `strategyId` (example database snapshot):** `cmnk3jos80000un8o4tsxxpmv` — title **2026 Annual Strategy**, **`status`: `ACTIVE`**. IDs differ per environment; always confirm with **`GET`** above. Strategies with **`ARCHIVED`** status (e.g. UAT automation runs) are **not** valid for vision updates or PDF upload.

```json
{
  "visionStatement": "Our vision: deliver lasting value for customers, people, and shareholders."
}
```

Other fields (`title`, `periodStart`, `periodEnd`, `pillarWeights`, document URL, etc.) are **left unchanged** on update when omitted.

**Employee dashboard (read)** — `GET /api/homepage`

`Authorization: Bearer <jwt>`

- Response includes **`data.strategicAlignment.visionStatement`** (same value as the active strategy when one exists).
- Also returns `strategyId`, `strategyTitle`, `periodStart`, `periodEnd`, `pillars`, `strategyDocumentUrl` for context.

**Pass check:** After `PUT`, call **`GET /api/homepage`** (as any logged-in user) and confirm **`data.strategicAlignment.visionStatement`** matches what you saved. Optional: **`GET /api/performance/config/pillars`** returns the same **`visionStatement`** for the active strategy.

---

**A.08** — Strategic theme tagging and filtering across departments

**DB check:** Table **`performance_themes`** may be empty in a fresh environment (query or call **`GET /api/performance/config/themes`** — empty array `[]` means no rows yet). Themes are created via API, not seeded by default.

**Auth:** `Authorization: Bearer <jwt>` on all calls below.

**1) List themes** — `GET /api/performance/config/themes`

- Returns active themes (excludes **`ARCHIVED`**).

**2) Create theme** — `POST /api/performance/config/themes`

`Content-Type: application/json`

```json
{
  "name": "Digital Transformation",
  "description": "UAT A.08 — enterprise change programme",
  "color": "#0066cc"
}
```

- **`name`** is **unique**; if the name already exists, the API returns the existing row (idempotent).
- Response `data.id` = **`{themeId}`** for tagging.

**3) Tag goals** — `POST /api/performance/config/themes/{themeId}/goals`

```json
{
  "goalIds": [
    "cmned0krx0001unk8db642a12",
    "cmnee5j090001un5gud5rlh16",
    "cmkz9n39t000yktjyjjw3xezf"
  ]
}
```

- Use real **`performance_goals.id`** values from **`GET /api/performance/goals`** (mix **company** / **department** goals to show cross-department filtering).
- Response: updated goals with **`strategicThemeId`** set.

**4) Goals for this theme (config API)** — `GET /api/performance/config/themes/{themeId}/goals`

- Lists goals linked to the theme (ordered by **`departmentName`**, then **`title`**).

**5) Filter goals (performance list)** — `GET /api/performance/goals?strategicThemeId={themeId}`

- Same Bearer token; each goal includes **`strategicTheme`** (`id`, `name`, `status`) in the list payload.

**Pass check:** Theme **Digital Transformation** exists; tagged goals show **`strategicThemeId`** / nested **`strategicTheme`**; **`GET .../goals?strategicThemeId=...`** returns only those goals across departments.

**Example (pass):** `POST /api/performance/config/themes/cmnkac92f0002un2cih8p7guw/goals` with the three **`goalIds`** above returned `success: true`, **`message`:** `"Goals tagged successfully"`, and **`data`** as an array of goals each with **`strategicThemeId`:** `"cmnkac92f0002un2cih8p7guw"` — company goal **FY26 Total revenue target**, **Finance** department **Finance slice of revenue goal**, **Investments** department **revenue target for investments team** (cross-department). Then **`GET /api/performance/goals?strategicThemeId=cmnkac92f0002un2cih8p7guw`** lists the same set.

---

**A.09** — Long objective description (~500 words)

**Schema / DB:** `PerformanceGoal.description` is **`@db.Text`** in `prisma/schema.prisma` (up to ~64KB in MySQL `TEXT`). The API does **not** truncate it in `PerformanceGoalService.updatePerformanceGoal`.

**DB alignment:** If your physical column is still a short `VARCHAR`, run **`npm run db:migrate:performance-goal-description-text`** once (idempotent).

**Update via API** — `PUT /api/performance/goals/{goalId}`

`Content-Type: application/json` · `Authorization: Bearer <jwt>`

Send a long string in **`description`** (roughly **500 words** ≈ **3 000+ characters** is fine). Only include fields you are changing plus any the route requires for your client.

```json
{
  "description": "<paste or generate ~500 words of plain text here>"
}
```

**Pass check:** `200`; **`GET /api/performance/goals/{goalId}`** returns the full **`description`** unchanged. **UI** should render long text in a scrollable or expandable area (frontend concern).

---

**A.10** — Archive old strategies (read-only; hidden from active dashboards)

**Backend behaviour (verified):** Archiving sets **`status`:** **`ARCHIVED`** and **`archivedAt`**. **`PUT`** updates, strategy **PDF upload**, and **create** paths that hit an archived row are **rejected** (*“Archived strategies are read-only.”*). **`getPillarConfig`** (pillars + vision + doc URL for dashboards) and **org BSC** scorecard code load only **`ACTIVE`** strategies with **`archivedAt: null`**, so archived rows **do not** drive **`GET /api/performance/config/pillars`**, **`GET /api/homepage`** (`data.strategicAlignment`), or active scorecard strategy context.

**Auth:** `Authorization: Bearer <jwt>`

**1) Archive** — `POST /api/performance/config/strategies/{strategyId}/archive`

- **No request body** (empty body is fine).
- Pick **`strategyId`** from **`GET /api/performance/config/strategies`** (e.g. a **“2024 Strategy”** row you created for UAT, or any non-archived id).
- **Pass:** `200`, `success: true`, `data.status` = **`ARCHIVED`**, `data.archivedAt` non-null.

**2) Active-only list (dashboards / pickers)** — `GET /api/performance/config/strategies?includeArchived=false`

- Archived strategies **must not** appear.

**3) Admin / history list** — `GET /api/performance/config/strategies` (default) or **`?includeArchived=true`**

- Archived strategies **still** appear for audit/history.

**4) Read-only check** — `PUT /api/performance/config/strategies/{archivedStrategyId}` with e.g. `{ "visionStatement": "should fail" }`

- **Expect** `403`, `success: false`, message **“Archived strategies are read-only.”** (no row change).

**5) Upload blocked** — `POST /api/performance/config/strategies/{archivedStrategyId}/document` (multipart)

- **Expect** `403` (or same read-only message); archived strategies cannot receive new PDFs.

**6) Employee dashboard** — `GET /api/homepage`

- **`data.strategicAlignment`** should reflect the **current active** strategy only; if you archived the **only** active strategy, vision/title/strategy id fields fall back to **null** until another **ACTIVE** strategy exists.

---

## Scorecards & Org BSC (API reference for Postman)

**Base path:** `/api/performance/scorecards`

**Auth:** `Authorization: Bearer <jwt>` on all routes below.

**Period (optional on most scorecard calls):** query **`periodStart`**, **`periodEnd`** (ISO-8601 date-time) and/or **`periodLabel`**. Omit to use the server default period resolution for the scorecard type.

**CEO / Board section blend (optional):** query or JSON body **`sectionBlendMode`** = **`redistribute`** (default — non-scoreable sections omitted from final average, weights re-normalised) or **`penalise`** (legacy: empty sections still apply their contract weight × 0).

**Company name on generated documents:** scorecard payloads use Company Profile **`legalName`** when set; otherwise **`COMPANY_NAME_FULL`** / **`COMPANY_NAME_SHORT`** from `.env` (see `src/config/companyDisplay.ts`).

**Coverage:** every scorecard route registered under `/api/performance/scorecards` is listed below (**13** calls: 3 employee — `user` + get/generate by id; 4 department; 4 CEO/Board; 1 org BSC; 1 finalize).

---

### Employee scorecards

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/performance/scorecards/user` | Current user’s employee scorecard (preview). |
| `GET` | `/api/performance/scorecards/employee/{employeeId}` | Preview for a specific **subject user** (role-gated). **`{employeeId}`** = **`users.id`** (same as `user.id` from login), not the `employees` table primary key unless they coincide in your data. |
| `POST` | `/api/performance/scorecards/employee/{employeeId}/generate` | Persist draft; body/query: `periodStart`, `periodEnd`, `periodLabel`. Same **`{employeeId}`** = subject **`users.id`**. |

---

### Department scorecards

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/performance/scorecards/department/{department}` | `{department}` = department **name** (URL-encoded if needed). |
| `POST` | `/api/performance/scorecards/department/{department}/generate` | Persist draft; optional body field **`departmentId`** overrides resolution when set. |
| `GET` | `/api/performance/scorecards/department/by-id/{departmentId}` | Resolve department by **cuid** `departmentId`. |
| `POST` | `/api/performance/scorecards/department/by-id/{departmentId}/generate` | Persist draft for that department id. |

---

### CEO & Board contract review scorecards

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/performance/scorecards/ceo` | Preview CEO scorecard; optional **`sectionBlendMode`**. |
| `POST` | `/api/performance/scorecards/ceo/generate` | Upsert CEO scorecard draft. |
| `GET` | `/api/performance/scorecards/board` | Preview Board scorecard; optional **`sectionBlendMode`**. |
| `POST` | `/api/performance/scorecards/board/generate` | Upsert Board scorecard draft. |

**Typical errors:** `404` + `CEO_CONTRACT_NOT_FOUND` when no CEO contract exists for the period; `404` + `BOARD_CONTRACT_NOT_FOUND` when no **BOARD**-type contract exists with governance indicators for the period.

---

### Organisational BSC dashboard

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/performance/scorecards/org-bsc` | Org BSC live dashboard (pillars, company goals, `ceoVision`, alerts). Same period query params as other scorecards where applicable. |

**Response notes (audit-aligned):** pillar **`trendVsPreviousPeriod`** is **`null`** until historical comparison exists; vision and strategy document URL live under **`data.ceoVision`** only (no duplicate root `visionStatement` / `annualStrategyDocumentUrl`).

---

### Finalise a saved scorecard

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/api/performance/scorecards/{scorecardId}/finalize` | Locks scorecard to **FINAL** (`scorecardId` from a prior **generate** response `savedRecord.id` or equivalent). |

---

**Postman — generate example (CEO, body + query)**

`POST /api/performance/scorecards/ceo/generate`

`Content-Type: application/json`

```json
{
  "periodStart": "2026-01-01T00:00:00.000Z",
  "periodEnd": "2026-12-31T23:59:59.999Z",
  "periodLabel": "2026",
  "sectionBlendMode": "redistribute"
}
```

---

## B-Series: Performance integration (Postman)

**Auth:** `Authorization: Bearer <jwt>` · `Content-Type: application/json`

**B.12** — `POST /api/performance/integration/sync-pe-portfolio-aum`

```json
{
  "goalId": "{goalId}"
}
```

**B.12 (approve)** — `POST /api/performance/integration/approve`

```json
{
  "goalId": "{goalId}",
  "comment": "Approve AUM synced from accounting portfolio"
}
```

**B.15** — `POST /api/performance/integration/sync-payroll-turnover-rate`

```json
{
  "goalId": "{goalId}"
}
```

**B.17** — Project / task milestones linked to a department goal (e.g. Internal Ops **Project Velocity**): moving work to **completed** updates that goal’s `currentValue` / progress from linked tasks (average completion). Use either:

`PUT /api/tasks/{taskId}/stage`

```json
{
  "stage": "completed"
}
```

or bulk (same effect for all listed tasks):

`PUT /api/tasks/bulk/stage`

```json
{ 
  "taskIds": ["{taskId}"],
  "stage": "completed"
}
```

---

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
- **`ratingValue`:** if sent, must be a **whole number 1–6** (aligned with BSC scorecard scale); omit if not used in self-review.
- **`scores`:** any **`managerRating`**, **`rating`**, or **`selfRating`** on an item must be a **whole number 1–6** when present; self-only payloads often omit `managerRating` or use **`selfRating`** only (see example).

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

**F.10** — Department rating distribution (1–6 histogram source for charts)

- `GET /api/performance-reviews/reports/rating-distribution?departmentName=Finance&reviewPeriod=2026-Q1`
- **`departmentName`** — required (matches reviewee **`department.name`** or reviewee **`userDepartment`**).
- **`reviewPeriod`** — optional filter on review `reviewPeriod`.
