# Events (EventSync) — UAT & developer guide

This document maps the product spec ([events.md](../events.md)) to the **current NVCCZ API** (MySQL/Prisma), lists **user-story flows** with endpoints for frontend work, and records **gaps**. Product spec name: **EventSync**; module menu label in the spec: **Client Relations → Events**.

**Base URL:** all routes below are mounted at **`/api/events`** unless noted. **OpenAPI** (`/api-docs`) lists paths **without** the `/api` prefix (e.g. `GET /events/upcoming` → call `GET {{baseUrl}}/api/events/upcoming`).

**Swagger UI:** open **`/api-docs`**, use the tag filter, and select any tag beginning with **`Events —`** (see table below). Operations are grouped under those names; paths are relative to the server base URL that ends with `/api`.

---

## UAT area index ↔ Swagger tags

Filter **`/api-docs`** by these tags (exact strings, em dash `—`):

| UAT area | Swagger tag |
|----------|----------------|
| Listings, create/update event, public listings, Google Calendar fields on event | **`Events — Core & calendar (EventSync)`** |
| Guests, invitations, RSVP (public), check-in | **`Events — Guests & RSVP (EventSync)`** |
| Budget line items, budget approval | **`Events — Budget & approval (EventSync)`** |
| Post-budget expenses, journals | **`Events — Expenses & accounting (EventSync)`** |
| Feedback (public submit + staff read) | **`Events — Feedback (EventSync)`** |
| Analytics + generated reports | **`Events — Analytics & reports (EventSync)`** |

---

## Implementation vs [events.md](../events.md)

| Requirement (spec) | Status | Notes |
|--------------------|--------|--------|
| Firestore `events` / sub-collection guests | **Different** | **Prisma** models: `Event`, `EventGuest`, `EventBudgetItem`, `EventExpense`, `EventFeedback`, `EventCheckIn`, `EventReport` ([schema.prisma](../prisma/schema.prisma)). Guest lists are a normalized **`event_guests`** table (1:N), not a Firestore sub-collection or guest array on the parent—same intent as §3 scalability note. Spec **`creatorId`** ↔ NVCCZ **`Event.authorId`**. |
| `procurementId` + Procurement purchase request from Events | **Not implemented** | `Event` has **no** link to `PurchaseRequisition` / procurement RFQ. Budget is approved **inside Events** (`POST .../budget/approve`), not via Procurement module. |
| `procurementStatus` PENDING/APPROVED/REJECTED | **Different** | Use **`budgetStatus`** (`DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `REVISED`) and **`status`** (`EventStatus`, e.g. `PLANNING`, `BUDGET_PENDING`, `BUDGET_APPROVED`, `BUDGET_REJECTED`, …). |
| `totalCost` / `actualCost` on event (spec §3) | **Different** | **`Event`** has **`estimatedBudget`**, **`approvedBudget`**; final spend comes from **`EventExpense`** lines and reporting—not separate `totalCost`/`actualCost` columns on the event row. |
| Budget **rejection** (spec: procurement rejects; revise and resubmit) | **Gap** | **`EventStatus`** includes `BUDGET_REJECTED` and **`BudgetStatus`** includes `REJECTED`/`REVISED`, but there is **no** dedicated **`…/budget/reject`** (or similar) route in `eventRoutes`—approval exists; rejection flow may need to be manual DB/UI or a future endpoint. |
| List/detail visibility (spec: creator + accessList) | **Different** | **`GET /events`** and **`GET /events/:id`** return any active event; **not** scoped to author or an access list (see also `accessList` row below). |
| Send to Procurement → webhook updates event | **Not implemented** | Flow is: add **budget items** → status moves toward approval → **`budget/approve`** (internal approver). |
| Two-phase Accounting (disbursement clearing + final P&L) as in §5 Phase 2 | **Partial / simplified** | **Budget approval** creates a **budget allocation** journal via `createJournalEntryWithAuditSequence`. **Event expenses** use **`JournalEntryService.createExpenseJournalEntry`**. Not necessarily the same two-account clearing story as the spec; validate with Finance. |
| JWT in URL for RSVP (`e`, `g`) | **Different** | RSVP uses opaque **`invitationToken`** (hex string) on `EventGuest`, **not** a JWT. **`POST /events/rsvp/:invitationToken`** with body **`rsvpStatus`**: `ACCEPTED` \| `DECLINED` \| `MAYBE` only. Initial guest state is **`PENDING`** (not sent in RSVP body). |
| Guest `encryptedToken` storage (spec §3 / §6) | **Different** | Spec stores JWT in **`encryptedToken`** on guest docs. NVCCZ stores a plain opaque **`invitationToken`** string (`@unique`) on **`EventGuest`**; no separate encrypted-token field in Prisma. |
| Guest status `RSVP_YES` / `CHECKED_IN` | **Different** | Prisma **`RSVPStatus`**: `PENDING`, `ACCEPTED`, `DECLINED`, `MAYBE`. Spec §6 narrative is **Yes / No** buttons; NVCCZ allows **`MAYBE`**. Initial invite state is **`PENDING`** (spec guest **`INVITED`**). Attendance: **`checkedIn`** boolean + **`EventCheckIn`** + **`POST .../guests/:guestId/check-in`** (not a single `CHECKED_IN` enum value on RSVP). |
| Invitations only after budget/procurement approved (events.md §5) | **Policy gap** | Spec blocks invitations until budget approved. **`EventService.addGuests`** currently only checks the event exists — **does not require** `budgetStatus === APPROVED`. Enforce in **UI** or extend the API if you must match the spec. |
| Internal `accessList` / guest-list visibility | **Not implemented** | No `accessList` (or equivalent) on **`Event`** in Prisma; cannot mirror spec §3 / Tab 1 access picker as modeled there. |
| Event status flow (events.md §12) | **Different names** | Prisma **`EventStatus`**: `PLANNING`, `BUDGET_PENDING`, `BUDGET_APPROVED`, `BUDGET_REJECTED`, `ACTIVE`, `COMPLETED`, `CANCELLED` — analogue to spec’s DRAFT / PROCUREMENT_PENDING / APPROVED / … but not identical labels. |
| Duplicate guest emails per event | **Enforced in DB** | **`@@unique([eventId, email])`** on `EventGuest` — duplicates fail at insert; no dedicated friendly validation message in service. |
| QR code check-in | **Not in API spec** | Staff check-in via authenticated endpoint; **QR** flow (scan → same token as invite) is **not** documented as a separate route — confirm product expectations. |
| Nightly `calculateEventKPIs` / `events_analytics` + `external_data` | **Different** | No Prisma model named `events_analytics`. Spec §9: KPI job runs **twice** (after RSVP deadline + after event completion)—**no** matching scheduled job in Events; on-demand **`getEventAnalytics`** / reports only. Spec §9 / §10: **`period`** on **`events_analytics`** rows must align with shared fiscal periods—**`getEventAnalytics`** response has **no** `period` / fiscal-quarter field. Spec §5 Phase 3 / §10: cost written as **`Event_ID_{eventId}_FinalCost`** in **`external_data`**—**confirm** naming and ETL in your deployment. App uses **`getEventAnalytics`**, **`EventReport`**, **`generateEventReport`**. |
| Budget variance alert (e.g. 15%) | **Not verified in Events** | events.md §14 row; confirm whether implemented outside **`EventService`** or backlog. |
| `AccountingAPI.createJournalEntry()` (spec wording) | **Different entry points** | Code uses **`JournalEntryService.createExpenseJournalEntry`**, **`createJournalEntryWithAuditSequence`** — aligns with “don’t write ledger raw” but not the spec’s literal API name. |
| WhatsApp invitations | **Not verified** | Email sending is used in guest-add flow; **WhatsApp** not documented in API. |
| Google Calendar | **Partial (feature flag + env)** | Sync on **create** only when **`GOOGLE_CALENDAR_ENABLED=true`** (see env table). **`GoogleCalendarService`** uses OAuth env vars; on failure the event **still** saves. **Updates** do not re-sync Calendar in code reviewed. |
| **Navigation** (events.md §2): Event Dashboard / My Events / My Invitations | **Partial** | **My Events (hosting):** use **`GET /events`** (or public list) and **filter client-side** where `author.id ===` current user — there is **no** `/events/mine` route. **My Invitations:** no API lists “events where the logged-in user is a guest”; guests are keyed by **email**, not `userId` — product would need a new query or linkage. **Event Dashboard “personal RSVP status”** (spec §2 table) has **no** dedicated “my RSVPs as guest” endpoint—same gap. **Dashboard KPIs** in the spec are not a single aggregate endpoint; use per-event **`GET .../analytics`** / reporting patterns. |
| **Guest CSV upload** (Tab 2) | **Different** | Spec describes CSV parsing; API accepts **`POST .../guests`** with a **JSON** `guests` array only — frontend parses CSV then posts JSON. |
| **§13 — Guest email AND phone required** (Tab 2 validation) | **Partial** | events.md §13 table + §4 Tab 2: block upload if **phone** missing. **`EventGuest.phone`** is **optional** in Prisma; **`addGuests`** does not reject guests without **`phone`**—enforce in **UI** or extend validation. |
| **§13 — “Procurement APPROVED before invitations” (system enforced)** | **Different / policy gap** | Spec §13 table states **system enforced** for this rule. NVCCZ maps the idea to **`budgetStatus === APPROVED`** but **`addGuests`** does **not** enforce it (same as events.md §5 invitation gate—spec wording here implies hard enforcement). |
| **§4 — Wizard “cannot skip ahead” / tab completion** | **Not enforced server-side** | Spec: each tab complete before the next unlocks. NVCCZ exposes **discrete REST resources** with **no** wizard-step or ordering guard—**frontend** must enforce the three-tab sequence; API allows e.g. budget items before guests if the client calls endpoints out of order. |
| **Post-event `feedbackRating` on guest** (events.md §8, guest doc) | **Gap** | **`EventFeedback`** has optional **`guestId`** in Prisma, but **`submitFeedback`** never sets it (comment in code: feedback not linked to guests). Per-guest rating on **`EventGuest`** as in the spec is **not** implemented. |
| **§13 Validation — budget total > 0 before submit** | **Partial** | **Duplicate emails** per event are enforced by **`@@unique([eventId, email])`**. **`addBudgetItems`** does not compute a **minimum total estimated cost > 0** before moving to **SUBMITTED**—enforce in UI or extend validation if required. |
| **§13 — Feedback rating 1–5 integer** | **Partial** | **`submitFeedback`** controller requires **`rating`** and **`overallSatisfaction`** but does **not** reject out-of-range values. OpenAPI documents **1–5**; **`EventService.submitFeedback`** does not clamp/validate dimensions—enforce in **controller/service** to match §13. |
| **§13 — JWT before RSVP** | **Different** | Satisfied by **opaque `invitationToken`** + guest lookup + optional **`rsvpDeadline`** (not JWT **`exp`**). |
| **§13 / §6 — RSVP timestamp field** | **Different** | Spec guest field is **`rsvpTimestamp`**. NVCCZ writes **`EventGuest.rsvpRespondedAt`** on RSVP submission (same semantic meaning, different field name/model). |
| **§13 — CPA “Pending” when data missing** | **Different** | Spec KPI text: show **“Pending Final Data”**. **`getEventAnalytics`** returns **`costPerAttendee: 0`** when there are no check-ins (no string sentinel). |
| **§13 — `totalCost` numeric not string** | **Different** | Spec §3 / §13: store monetary **`totalCost`** as number. NVCCZ uses **`Decimal`** on **`Event`**, **`EventBudgetItem`**, **`EventExpense`**—correct type discipline, different shape than Firestore number field. |
| **Event lifecycle** ACTIVE → COMPLETED; **CANCELLED** + side effects (events.md §12) | **Gap** | Prisma has **`EventStatus`** values including `ACTIVE`, `COMPLETED`, `CANCELLED`, but **`PUT /events/:id`** does **not** accept **`status`** — only title/description/dates/RSVP flags/etc. There is **no** cancel-event route that sets **`CANCELLED`**, reverses journals, or notifies guests. Spec: notify **RSVP_YES** guests; NVCCZ analogue is guests with **`rsvpStatus === ACCEPTED`**. Transitions beyond **budget approval** are **not** driven by this router. |
| **§11 RBAC** (Creator vs Finance vs Procurement vs Executive) | **Not as specified** | Event routes use **authentication** only; they do **not** implement the role matrix in events.md §11 (e.g. Finance-only expense posting, Department Manager scope). Any authorized user hitting the API gets the same behaviour unless **other middleware** applies globally—confirm and enforce in **UI** or add role checks per route. |
| **§11 — Department Manager “events in their department”** | **Not implemented** | **`Event`** has **`authorId`** only—**no** `departmentId` / org unit on the event row—cannot scope “manager sees their department’s events” in SQL without extra modeling or **`User`** department joins. |
| **§11 / §7 — Organizer-only mutations** (Creator manages guests; Finance posts expenses) | **Gap** | **`PUT` / `DELETE` `/events/:id`** enforce **`authorId`**. Other authenticated **`POST`** routes (`…/guests`, `…/budget-items`, `…/budget/approve`, `…/expenses`, `…/guests/:guestId/check-in`, `…/reports`) do **not** verify **`event.authorId`** or roles—any authenticated user who knows an **`eventId`** can add guests, approve budget, post expenses, check in guests, or generate reports for that event. **`checkInGuest`** also does not assert **`EventGuest.eventId === eventId`** before writing **`event_check_ins`** (schema does not tie the FK pair beyond separate references). |
| **§14 Notifications** (full table) | **Partial** | **Present in code:** guest **invitation** email (`EmailNotificationService.sendEventInvitationEmail`), **RSVP** notification to organizer (`sendRSVPNotificationEmail` on RSVP change), **budget approved** email (`sendBudgetApprovalEmail`). **Missing vs spec:** “budget submitted to Procurement” (no Procurement bridge); procurement **rejected** email; **24h RSVP reminder** cron; “event complete, collect feedback” nudge; **15% variance** alert to Finance/CEO (unless implemented in another module). |
| **§15 Event Dashboard KPIs** (aggregate landing page) | **Gap** | Spec: upcoming count, total budget committed in period, **average** RSVP rate, average success rating, **my pending RSVPs**. **No** dedicated aggregate endpoint returns these; compute from **`GET /events`** / **`GET /upcoming`** / per-event **`GET .../analytics`** / reports, or add a dashboard API later. **My Pending RSVPs** assumes guest **`INVITED`** not yet answered; NVCCZ uses **`PENDING`** until RSVP—same idea, still **no** “my invitations” query without guest↔user linkage. |
| **Tab 3 — per-line currency** (events.md §4) | **Different** | **`EventBudgetItem`** stores **`estimatedCost`** as **`Decimal`** with **no `currencyId` / currency code per line** — not multi-currency line items as in the spec narrative. |
| **§6 RSVP token expiry** | **Different** | Spec: JWT with **`exp`**. Implementation: if **`Event.rsvpDeadline`** is set, **`handleRSVP`** rejects when **`now > rsvpDeadline`**; opaque **`invitationToken`** does not embed its own expiry. |
| **§6 — RSVP success response (HTML vs API)** | **Different** | Spec **`processRSVP`** Step 5: return a **simple HTML** confirmation page. NVCCZ **`POST /events/rsvp/:invitationToken`** returns **JSON** for SPA/API clients—no HTML confirmation page in this handler. |
| **§6 Real-time RSVP dashboard** | **Different** | Spec: live listener on guest documents. NVCCZ: **poll** **`GET /events/:eventId/guests`** or **`GET .../analytics`** after RSVP—no WebSocket/SSE in this module for RSVP counts. |
| **§7–8 Guest list read + feedback scope** | **Different / gap** | Spec: only **Creator / Manager / Executive** read guests; feedback link only to **`CHECKED_IN`** guests. **`GET .../guests`** is JWT-only but **does not verify** organizer role or `authorId`—any authenticated user with `eventId` can list guests. The same **no author/role check** applies to **`GET .../budget-items`**, **`GET .../expenses`**, **`GET .../feedback`**, and **`GET .../analytics`** (sensitive financial/operational data per §3 / §11). **`POST .../feedback`** is **public** and **not** limited to checked-in guests. |
| **§11 “approve post-event feedback” (Dept Manager)** | **Gap** | **`EventFeedback`** has no approval workflow; submit is create-only. |

---

## User stories & endpoint flows (frontend)

### Story A — Browse and open events (authenticated)

1. `GET /api/events` — all **active** events (`isActive: true`), **not** filtered to the current user as author (any authenticated user sees the same list).
2. `GET /api/events/upcoming` — same scope, `startDate >= now`.
3. `GET /api/events/:id` — detail by id if the row exists (**no** “creator-only” check on read).

**Public (no JWT):** `GET /api/events/public`, `GET /api/events/public/upcoming`, `GET /api/events/public/:id` (same listing/detail behaviour without auth).

**Routing note:** `POST /api/events/:eventId/feedback` is registered before static segments. An event whose id is literally `public` would make `POST /api/events/public/feedback` hit the **feedback** handler with `eventId=public` instead of a dedicated path—avoid ids that collide with reserved segments (practically rare with cuid ids).

### Story B — Create and edit an event (organizer)

1. `POST /api/events` — create (title, description, start/end, optional RSVP, budget estimate, flags, etc.). **Google Calendar:** sync runs on create **only if** `GOOGLE_CALENDAR_ENABLED` is the string **`true`** and credentials work; then **`googleCalendarEventId` / `googleCalendarLink`** may be set. **Updates** (`PUT /api/events/:id`) **do not** call Calendar sync in the current controller/service path.
2. `PUT /api/events/:id` — update (author only).
3. `DELETE /api/events/:id` — soft delete (`isActive`), author only.

### Story C — Guests and invitations

1. `POST /api/events/:eventId/guests` — body `{ "guests": [ { "email", "name", ... } ] }`. **Email + name** required per guest; **phone** optional in API (spec required phone — enforce in UI if needed). **Duplicate `(eventId, email)`** fails at DB. **Spec gate:** product spec says do not invite until budget is approved — **not enforced server-side** today (see gap table).
2. `GET /api/events/:eventId/guests` — list/filter `rsvpStatus`, pagination query params.

### Story D — Public RSVP (no login)

1. `POST /api/events/rsvp/:invitationToken` — body `{ "rsvpStatus": "ACCEPTED" | "DECLINED" | "MAYBE", "notes"? }`. If the event has **`rsvpDeadline`** set, responses after that instant return an error (**not** JWT-style exp on the token—see gap table). Response is **JSON**, not the **HTML** confirmation page described in events.md §6 Step 5 (see gap table).

### Story E — Check-in (event day)

1. `POST /api/events/:eventId/guests/:guestId/check-in` — optional `notes` in body.

### Story F — Budget (wizard-style: create event → budget items → approve)

1. `POST /api/events/:eventId/budget-items` — `{ "budgetItems": [ { "category", "itemName", "estimatedCost", ... } ] }`. Moves budget toward **SUBMITTED** / event toward **BUDGET_PENDING** (see service).
2. `GET /api/events/:eventId/budget-items`.
3. `POST /api/events/:eventId/budget/approve` — `{ "approvedBudget": number, "notes"? }`. Triggers **budget allocation journal** and sets approved budget / statuses for expense recording.

### Story G — Expenses after budget approved

1. `POST /api/events/:eventId/expenses` — controller requires **description**, **amount**, **category**; **`EventService.recordExpense`** requires **`vendorId`** for the journal step (not validated in the controller’s first `if`—omit it and the service errors). **`EventService.recordExpense`** **rejects** if `event.budgetStatus !== 'APPROVED'` (expenses are blocked until budget is approved—unlike guest add). Flow: an **`EventExpense`** row is created first; if the journal step fails, that row is updated to **`ExpenseStatus.REJECTED`** and the API errors—there is no successful expense without a posted journal in the happy path.
2. `GET /api/events/:eventId/expenses`.

### Story H — Feedback

1. **Public:** `POST /api/events/:eventId/feedback` — ratings/dimensions (no auth). Does **not** attach **`guestId`** even though the schema allows it (see gap table).
2. **Staff:** `GET /api/events/:eventId/feedback` — list feedback.

### Story I — Analytics and reports

1. `GET /api/events/:eventId/analytics` — RSVP/check-in/feedback/budget utilization style metrics (formulas vs [events.md](../events.md) §9–§10 are detailed in the next subsection).
2. `POST /api/events/:eventId/reports` — `{ "reportType": "FINANCIAL" | "ATTENDANCE" | "FEEDBACK" | "COMPREHENSIVE" }`; persists **`EventReport`**.

### KPI formulas (events.md §9–§10) vs `getEventAnalytics`

[`EventService.getEventAnalytics`](../src/services/EventService.ts) computes (among others):

| Spec (events.md §9) | NVCCZ implementation |
|---------------------|----------------------|
| **RSVP rate** = RSVP_YES / all guests | **`rsvpRate`** = **`ACCEPTED`** guest count / **`totalGuests`** × 100 (treat **`ACCEPTED`** as the analogue to RSVP yes). |
| **CPA** = P&L final cost / CHECKED_IN count | **`costPerAttendee`** = **sum(`EventExpense.amount`)** / **`checkIns.length`** when `checkIns.length > 0`, else **0** (not the literal P&L “final” figure unless expenses match it). Spec §9/§13 “**Pending Final Data**” string is **not** returned—zeros are used when check-ins or expenses are missing. Denominator uses **check-in row count** (analogue to **CHECKED_IN** count). |
| **Success rating** = average of `guest.feedbackRating` | **`averageRating`** = average of **`EventFeedback.overallSatisfaction`** (not a field on **`EventGuest`**). |

Also returned: **`checkInRate`** (check-in count / total guests), **`feedbackRate`** (feedback rows / total guests), **`budgetUtilization`**, **`budgetVariance`** — extra derived fields not spelled out in §9.

**§9 scheduling:** Spec **`calculateEventKPIs`** runs at **RSVP close** and again **after event completion**; NVCCZ has **no** equivalent twice-run batch—analytics are **on request** via **`GET .../analytics`** (and report generation).

**§9 / §10 fiscal `period`:** Spec **`events_analytics.period`** must match Performance’s fiscal labels; **`getEventAnalytics`** JSON does **not** include a **`period`** field (see gap table).

**§10 Performance sync** (`events_analytics` → `external_data`): not implemented as in the Firebase spec; see gap table rows on analytics / ETL.

---

## Cross-module integration (actual)

### Spec §1 (module positioning)

- events.md **§1** states every event touches **Procurement**, **Accounting**, and **Performance**. In NVCCZ today, **Procurement** is **not** wired from Events (see gap table); **Accounting** and **Performance** are partially reflected via journals, expenses, analytics/reports, and deployment-specific ETL.

### Accounting

- **Budget approval:** journal via **`createJournalEntryWithAuditSequence`** (budget allocation).
- **Event expense:** **`JournalEntryService.createExpenseJournalEntry`** after expense line creation.
- events.md **§5 Phase 2 Entry 1** is tied to **cash released** after Procurement; NVCCZ may post the **budget-approval** journal at **approve** time—may not match the spec’s “disbursement” timing one-to-one; confirm with Finance.
- Do **not** bypass services to write ledger tables directly.

### Procurement

- **No** automatic purchase requisition from Events in the current codebase. If product requires it, that is a **future** schema + service integration.

### Performance

- **Event reports / analytics** support operational KPIs; linkage to **BSC** / **`external_data`** is via the broader Performance ETL pipeline—confirm which event-derived metrics are consumed in your deployment.
- Spec **§5 Phase 3** names **`external_data`** keys like **`Event_ID_{eventId}_FinalCost`** for CPA—align ETL/event payloads with Finance if you mirror that contract.

### Portfolio

- **No** direct `Event` ↔ portfolio company FK in the models reviewed; treat portfolio touchpoints as **out of scope** unless you add them.

---

## Complete route list (reference)

| Method | Path (prefix `/api/events`) | Auth |
|--------|-----------------------------|------|
| `POST` | `/rsvp/:invitationToken` | Public |
| `POST` | `/:eventId/feedback` | Public |
| `GET` | `/public` | Public |
| `GET` | `/public/upcoming` | Public |
| `GET` | `/public/:id` | Public |
| `POST` | `/` | JWT |
| `GET` | `/` | JWT |
| `GET` | `/upcoming` | JWT |
| `GET` | `/:id` | JWT |
| `PUT` | `/:id` | JWT |
| `DELETE` | `/:id` | JWT |
| `POST` | `/:eventId/guests` | JWT |
| `GET` | `/:eventId/guests` | JWT |
| `POST` | `/:eventId/guests/:guestId/check-in` | JWT |
| `POST` | `/:eventId/budget-items` | JWT |
| `GET` | `/:eventId/budget-items` | JWT |
| `POST` | `/:eventId/budget/approve` | JWT |
| `POST` | `/:eventId/expenses` | JWT |
| `GET` | `/:eventId/expenses` | JWT |
| `GET` | `/:eventId/feedback` | JWT |
| `GET` | `/:eventId/analytics` | JWT |
| `POST` | `/:eventId/reports` | JWT |

---



