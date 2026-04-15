# Arcus Events Module (EventSync) — Full Implementation Spec
> Module: Events Management
> Audience: Coding agent
> Purpose: Complete context on what to build, how it works, and how it connects
> to Procurement, Accounting, and Performance modules

**NVCCZ implementation mapping (API, gaps, Swagger tags):** see [docs/events-uat.md](docs/events-uat.md).

---

## 1. What This Module Is

For a Venture Capital and Asset Management firm, events are not social activities.
They are the primary tool for Investor Relations, Fundraising, and Due Diligence.
Every event is high-cost and high-stakes. The module manages the full lifecycle:

```
Budget approval → Guest invitations → RSVPs → Event execution
→ Attendance tracking → Financial reconciliation → KPI reporting to Performance module
```

Nothing in this module is isolated. Every event touches Procurement (budget),
Accounting (spend), and the Performance module (KPIs).

---

## 2. Navigation and Menu Structure

The module lives under the "Client Relations" main menu.

| Menu Item | What It Shows | Who Sees It |
|---|---|---|
| Event Dashboard | Upcoming events, personal RSVP status, high-level KPIs | All users |
| Create New Event | Multi-step form: Details → Guests → Budget → Send | Event Creator |
| My Events (Hosting) | Events where the user is the creator | Event Creator only |
| My Invitations | Events where the user is in the attendees list | Invited users |

---

## 3. Data Structure

### Collection: `events`
Stores the main event record.

| Field | Type | Notes |
|---|---|---|
| `creatorId` | String | User ID of the person who created the event |
| `startDate` | Timestamp | Event start date and time |
| `procurementId` | String | Links to the Procurement module purchase request |
| `procurementStatus` | String Enum | PENDING, APPROVED, REJECTED |
| `totalCost` | Number | Store as a number (e.g. 50000.00) — never a formatted string |
| `actualCost` | Number | Final actual cost after the event, populated by Accounting |
| `accessList` | Array of UIDs | UIDs of users who can see the guest list |
| `budgetLineItems` | Array | Line items (Venue, Catering, etc.) sent to Procurement |
| `status` | String Enum | DRAFT, PROCUREMENT_PENDING, APPROVED, ACTIVE, COMPLETED, CANCELLED |

**Security rule:** Read access restricted to `creatorId` and UIDs in `accessList` only.

---

### Sub-collection: `events/{eventId}/guests`
Stores one document per invited guest.

| Field | Type | Notes |
|---|---|---|
| `email` | String | Required — used for email invitation |
| `phone` | String | Required — used for WhatsApp invitation |
| `name` | String | Guest display name |
| `status` | String Enum | INVITED, RSVP_YES, RSVP_NO, CHECKED_IN |
| `encryptedToken` | String | JWT token for the RSVP link — see Section 6 |
| `rsvpTimestamp` | Timestamp | Server timestamp recorded when RSVP is submitted |
| `feedbackRating` | Number (1–5) | Post-event feedback score submitted by the guest |

Use a sub-collection (not an array on the parent) — guest lists can grow very large.

**Security rule:** Only Event Creator, Manager, and Executives can read this sub-collection.

---

### Collection: `events_analytics`
Read-only. Populated nightly by a Cloud Function. Feeds the Performance module.

| Field | Type | Notes |
|---|---|---|
| `eventId` | String | Links back to the event |
| `period` | String | e.g. "Q1", "Q2" — aligns with the shared fiscal period |
| `kpiName` | String | e.g. "RSVP_RATE", "COST_PER_ATTENDEE", "EVENT_SUCCESS_RATING" |
| `kpiValue` | Number | Calculated KPI value |

This collection is never written to by the UI. Only the `calculateEventKPIs`
Cloud Function writes here. The Performance module reads from here.

---

## 4. Creating a New Event — Three-Tab Wizard

The new event form is a three-tab wizard that enforces process order.
The user cannot skip ahead. Each tab must be complete before the next unlocks.

### Tab 1 — Event Details
- Event name
- Event type (Investor Meeting, Fundraiser, Due Diligence, Networking, etc.)
- Start date and time
- End date and time
- Location / venue name
- Description
- Internal Access Picker — multi-select user search. Populates `events.accessList`.
  Only visible to the Event Creator. Determines who can see the guest list.

### Tab 2 — Guests
- Guest List Uploader — CSV file upload OR multi-line text area
- System parses each row into a guest document in the `events/{id}/guests` sub-collection
- Validation at upload time:
  - Every guest must have an `email` field — block upload if missing
  - Every guest must have a `phone` field — block upload if missing
  - Duplicate emails within the same event are rejected

### Tab 3 — Budget
- Budget Dynamic Table — rows for line items (Venue, Catering, AV, Travel, etc.)
- User can add and delete rows
- Each row: description, estimated cost, currency
- Table auto-calculates `totalCost` as rows are added/changed
- This data becomes the `budgetLineItems` array sent to Procurement
- User clicks "Send to Procurement" to submit — this ends the creation flow and
  starts the procurement approval workflow

---

## 5. Budget and Financial Flow

This is the most critical workflow. It touches three modules in sequence.

### Phase 1 — Procurement Approval

**Step 1 — Event Creator submits budget:**
Clicking "Send to Procurement" creates a purchase request in the Procurement module:
```
purchase_requests document:
  sourceModule: "Events"
  sourceId: {eventId}
  lineItems: [{description, amount, currency}, ...]
  status: PENDING
  requestedById: {creatorId}
```

The event's `procurementStatus` is set to PENDING.

**Step 2 — Procurement Manager reviews:**
The Procurement Manager sees the request in their module and approves or rejects it.

**Step 3 — Status update back to Events:**
When the Procurement Manager approves, a trigger (webhook or Cloud Function) fires
and updates the event:
```
events.procurementStatus = APPROVED
events.procurementId = {purchaseRequestId}
```

If rejected, `procurementStatus = REJECTED` and the Event Creator is notified
with the reason. They must revise the budget and resubmit.

**The event cannot proceed to invitations until `procurementStatus = APPROVED`.**

---

### Phase 2 — Accounting Integration

Two accounting entries are created. These must be posted by calling the
Accounting module's designated journal entry function — never by writing
raw accounting entries directly.

**Entry 1 — Initial Disbursement (when cash is released to vendor/event fund):**
```
Credit: Bank/Cash Asset Account       (money leaves the bank)
Debit:  Event Funds Disbursed         (clearing/holding account)
```
This happens when Procurement confirms cash is released. The money is
tracked in a temporary clearing account until the event is over.

**Entry 2 — Final Expense Booking (after the event, when actual costs are confirmed):**
```
Credit: Event Funds Disbursed         (clears the temporary holding account)
Debit:  Marketing/IR Expense (P&L)    (actual cost hits the income statement)
```
Finance enters the final actual expenses after the event. This closes
the clearing account and records the real cost on the P&L.

**Why two entries?**
Money is disbursed before the event happens. The two-entry approach means
the books are never in an ambiguous state — the clearing account always
shows exactly what has been disbursed but not yet expensed.

**Developer rule:** Always call `AccountingAPI.createJournalEntry()` — never
write directly to ledger tables.

---

### Phase 3 — OPM / Performance Module Sync

A nightly Cloud Function (`triggerDataSync`) runs and:
1. Reads the final Event Expense from the Accounting P&L ledger
2. Writes the cost to the `external_data` collection as:
   `Event_ID_{eventId}_FinalCost`

The Performance module reads from `external_data` to feed the Cost Per Attendee KPI.

---

## 6. Invitation and RSVP Flow

### Sending Invitations

Once procurement is approved, the Event Creator can send invitations.

For each guest in the sub-collection, the system:
1. Generates a JWT token with this payload:
```
{
  guestId: "{documentId in guests sub-collection}",
  eventId: "{eventId}",
  exp: {RSVP deadline timestamp}
}
```
2. Stores the encrypted token as `encryptedToken` on the guest document
3. Sends an email to `guest.email` containing the RSVP link:
```
{ERP_URL}/events/rsvp?e={eventId}&g={JWT_Guest_Token}
```
4. Sends a WhatsApp message to `guest.phone` with the same link

The JWT expires at the RSVP deadline. After expiry the link no longer works.

---

### RSVP Processing (Cloud Function: `processRSVP`)

This function handles the public RSVP endpoint. External guests never log in —
the JWT token is the only authentication.

**Step 1 — Read URL parameters:**
Read `e` (eventId) and `g` (JWT token) from the URL.

**Step 2 — Decrypt and validate the JWT:**
- If decryption fails or the token is expired: return a 403 error page
  ("RSVP link expired or invalid"). Stop here.

**Step 3 — Database lookup:**
Use the validated `guestId` from the token to find the guest document in
`events/{eventId}/guests`.

**Step 4 — Update guest status:**
Based on which button the guest clicked (Yes / No):
```
guest.status = RSVP_YES  or  RSVP_NO
guest.rsvpTimestamp = serverTimestamp()
```

**Step 5 — Return confirmation page:**
Return a simple HTML confirmation page to the guest. No login required,
no redirect to the ERP.

**Step 6 — Real-time dashboard update:**
The Event Manager's dashboard uses a real-time listener on the guests
sub-collection. When the guest document updates, the RSVP count on
the dashboard updates in milliseconds without any page refresh.

---

## 7. Attendance Tracking (Check-in)

The Cost Per Attendee KPI requires knowing who actually showed up —
not just who RSVP'd yes.

The system needs a check-in feature at the event:
- Event Creator or Manager marks guests as `CHECKED_IN`
- This updates `guest.status` from `RSVP_YES` to `CHECKED_IN`
- Only `CHECKED_IN` guests count toward true attendance

This can be done via:
- Manual check-in: Event Manager taps/clicks each guest name on the day
- QR code check-in: Each invitation includes a QR code that, when scanned
  at the event, marks the guest as CHECKED_IN (uses the same JWT validation)

---

## 8. Post-Event Feedback

After the event, guests can submit a feedback rating.

- Feedback link is sent to all `CHECKED_IN` guests after the event ends
- Guest submits a rating from 1 to 5
- System writes `feedbackRating` to the guest document
- The `calculateEventKPIs` function uses these ratings to compute the
  Event Success Rating average

---

## 9. KPI Calculations (Cloud Function: `calculateEventKPIs`)

This function runs twice:
1. After the RSVP deadline closes (to capture final RSVP data)
2. After the event completes (to incorporate final actual cost and check-in data)

Running it twice prevents the Performance module from reading stale data.

### KPI 1 — RSVP Rate (%)

```
RSVP Rate = (Count of guests where status = RSVP_YES)
             / (Total count of all guests in the event)
             × 100
```

**Performance module relevance:** Marketing/IR goal — measures effectiveness
of the invite strategy and brand engagement.

---

### KPI 2 — Cost Per Attendee (CPA)

```
CPA = Final Event Cost (from Accounting P&L)
      / Count of guests where status = CHECKED_IN
```

**Performance module relevance:** Operations goal — measures operational
efficiency and budget control.

Note: This KPI cannot be calculated until:
- The event has occurred
- Attendance has been recorded via check-in
- Finance has posted the final expense to Accounting

If any of these are missing, CPA shows as "Pending Final Data."

---

### KPI 3 — Event Success Rating (Average)

```
Success Rating = Sum of all guest.feedbackRating values
                 / Count of submitted feedback forms
```

Scale: 1–5

**Performance module relevance:** Executive/IR goal — measures the quality
and perceived value of the event content.

---

### Writing KPIs to Analytics

After calculating all three, the function writes to `events_analytics`:
```
{
  eventId: "{eventId}",
  period: "{current fiscal quarter — e.g. Q2}",
  kpiName: "RSVP_RATE",
  kpiValue: 72.5
}
{
  eventId: "{eventId}",
  period: "Q2",
  kpiName: "COST_PER_ATTENDEE",
  kpiValue: 1840.00
}
{
  eventId: "{eventId}",
  period: "Q2",
  kpiName: "EVENT_SUCCESS_RATING",
  kpiValue: 4.2
}
```

The `period` field must use the same fiscal period definition as all other
modules — not a calendar-based calculation. Read the shared fiscal period
configuration.

---

## 10. Performance Module Alignment

The Events module feeds three KPIs into the Performance module. Here is
exactly how they map:

| Event KPI | Performance Indicator | BSC Pillar | Who It Affects |
|---|---|---|---|
| RSVP Rate | Event RSVP Rate (%) | Customer and Market | CEO scorecard, Dept scorecard |
| Cost Per Attendee | Cost efficiency / Marketing spend | Internal Operations | CEO scorecard |
| Event Success Rating | Customer/Stakeholder Satisfaction | Customer and Market | CEO scorecard |

**How the sync works:**
1. `calculateEventKPIs` writes to `events_analytics`
2. Nightly `triggerDataSync` reads `events_analytics`
3. Writes results to `external_data` collection
4. Performance module KPI sync job reads `external_data` and updates
   the relevant goal's `actualValue`
5. Scorecard recalculation chain fires upward

**Fiscal period alignment:**
The `period` field in `events_analytics` must match exactly the period
labels used in the Performance module (e.g. "Q1 2026", "2026"). Use the
shared fiscal period configuration — do not independently calculate the
quarter from the event date.

---

## 11. Access Control (RBAC)

| Role | What They Can Do |
|---|---|
| Event Creator | Create events, manage guest list, view RSVPs, send invitations |
| Department Manager | View events in their department, approve post-event feedback |
| Executive / CEO | View all events, see high-level KPIs on dashboard |
| Finance / Accounting | Access final cost data, post expense entries |
| Procurement Manager | Approve/reject purchase requests from Events |
| Guest (external) | RSVP only via secure link — no system login required |

---

## 12. Event Status Flow

```
DRAFT
  ↓ (Creator submits budget)
PROCUREMENT_PENDING
  ↓ (Procurement Manager approves)
APPROVED
  ↓ (Invitations sent)
ACTIVE
  ↓ (Event date passes, attendance recorded, expenses posted)
COMPLETED
```

A CANCELLED status can be set from any stage except COMPLETED.
Cancellation must trigger:
- Reversal of any Accounting disbursement entries (clearing account reversed)
- Notification to all RSVP_YES guests
- Procurement request marked as CANCELLED

---

## 13. Validation Rules

| Rule | Where It Applies |
|---|---|
| Every guest must have email AND phone | Guest list upload — block if missing |
| Duplicate emails blocked within same event | Guest list upload |
| Budget total must be > 0 | Budget tab — block submission if zero |
| Procurement must be APPROVED before invitations can be sent | System enforced |
| JWT token validated before any RSVP action | `processRSVP` Cloud Function |
| CPA cannot be calculated without check-in data | KPI calculation — show "Pending" |
| Feedback rating must be 1–5 integer | Guest feedback submission |
| `totalCost` stored as Number, never string | Data model |
| Journal entries created via AccountingAPI only | Never write raw ledger entries |

---

## 14. Notifications

| Trigger | Who Gets Notified | Message |
|---|---|---|
| Budget submitted to Procurement | Procurement Manager | "New event budget request: {event name}" |
| Procurement approved | Event Creator | "Budget approved. You can now send invitations." |
| Procurement rejected | Event Creator | "Budget rejected: {reason}. Please revise and resubmit." |
| Guest RSVPs Yes | Event Creator (real-time dashboard update) | Count updates live |
| Guest RSVPs No | Event Creator (real-time dashboard update) | Count updates live |
| RSVP deadline approaching (24 hours) | Event Creator | "RSVP deadline in 24 hours. X guests have not responded." |
| Event completed, feedback not yet collected | Event Creator | "Event complete. Send feedback requests to attendees." |
| Budget variance exceeds 15% | Finance Manager + CEO | "Critical: Event {name} spend variance exceeds 15% threshold." |

The budget variance alert (last row) is the same "Critical Red Status" alert
described in the performance module workflow. It fires when actual spend
vs approved budget exceeds the 15% threshold.

---

## 15. Dashboard KPIs (Event Dashboard)

The main landing page shows:

| KPI | Calculation | Update Frequency |
|---|---|---|
| Upcoming Events | Count of events with startDate > today | Real-time |
| Total Budget Committed | Sum of approved event budgets in current period | Real-time |
| Average RSVP Rate | Average RSVP Rate across all completed events in period | Nightly |
| Average Event Success Rating | Average rating across all completed events | Nightly |
| My Pending RSVPs | Count of events where user is INVITED but not yet responded | Real-time |

---

## 16. Implementation Order

Build in this sequence — each step depends on the previous:

1. **Data model** — create `events`, `events/{id}/guests`, and `events_analytics`
   collections with correct field types and security rules

2. **Three-tab creation wizard** — Details, Guests (with CSV parser and validation),
   Budget (with dynamic table and auto-total)

3. **Procurement integration** — "Send to Procurement" creates purchase request,
   webhook/trigger updates `procurementStatus` back on approval

4. **Invitation system** — JWT generation, email send, WhatsApp send, RSVP landing page

5. **`processRSVP` Cloud Function** — JWT validation, guest status update,
   real-time dashboard listener

6. **Check-in feature** — manual or QR-based, updates `guest.status` to CHECKED_IN

7. **Accounting integration** — Initial Disbursement journal entry and Final Expense
   Booking via `AccountingAPI.createJournalEntry()`

8. **Post-event feedback** — feedback link to CHECKED_IN guests, rating stored on guest doc

9. **`calculateEventKPIs` Cloud Function** — RSVP Rate, CPA, Success Rating,
   writes to `events_analytics`

10. **`triggerDataSync` nightly job** — reads `events_analytics`, writes to
    `external_data` for Performance module consumption

11. **Dashboard** — Event Dashboard KPIs, My Events view, My Invitations view

12. **Budget variance alert** — 15% threshold check wired to Finance Manager
    and CEO notification