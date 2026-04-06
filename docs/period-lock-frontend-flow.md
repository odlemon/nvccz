# Period lock — frontend flow (user stories + endpoints)

In **production Swagger**, all endpoints below are grouped under the tag **`Accounting - Period lock`** (legacy `/cashbook/periods/...` and `/accounting/fiscal-calendar/...` together).

All calls require **authentication** (Bearer token). Several fiscal-calendar routes also require **permissions** (see below).

---

## 1. See whether a month is locked (legacy cashbook calendar)

**As a user**, I open a period picker or month summary and need to know if **YYYY-MM** is locked.

- `GET /api/cashbook/periods/:period/status` — status for one period (`period` = e.g. `2026-04`)
- `GET /api/cashbook/periods` — list periods (optional query: `year`, `isLocked`, `currencyId`)

---

## 2. Lock or unlock a month (legacy immediate lock)

**As an authorised user**, I lock April 2026 so no new bank/cashbook-dated activity can go through for that month (subject to company policy).

- `POST /api/cashbook/periods/lock`  
  Body: `period` (`YYYY-MM`), `isLocked` (`true` / `false`), optional `reason`.  
  The server sets **who** locked it from the JWT — do **not** send `lockedBy` in the body.

---

## 3. Check a transaction date before the user submits a form

**As a user**, I pick a **transaction date** on a cashbook (or similar) screen; the UI should warn or block before submit if that date falls in a locked period.

- `POST /api/cashbook/periods/validate-date`  
  Body: `transactionDate` (ISO date string the API already accepts elsewhere).

---

## 4. See who changed locks for a month (optional UI)

**As a user**, I view lock/unlock history for a given **YYYY-MM**.

- `GET /api/cashbook/periods/:period/history`

---

## 5. Fiscal calendar (module locks, policy, audit) — parallel to legacy cashbook lock

**As a user** with **view** rights, I see the full fiscal calendar and effective module locks.

- `GET /api/accounting/fiscal-calendar`

**As a user** with **manage** rights, I edit a **draft** of module locks and **commit** it.

- `PUT /api/accounting/fiscal-calendar/locks/draft`
- `POST /api/accounting/fiscal-calendar/locks/commit`

**As a user** with **manage** rights, I change company behaviour for locks (e.g. error vs warn, posting exception queue).

- `PATCH /api/accounting/fiscal-calendar/policy`

**As a user** with **audit** (or manage) rights, I review lock-related audit lines.

- `GET /api/accounting/fiscal-calendar/period-lock/audit`

**As a user** with **view** (or manage / broad accounting) rights, I review **posting exceptions** (e.g. rejected attempts when policy stores them).

- `GET /api/accounting/fiscal-calendar/posting-exceptions`

---

## 6. User tries to post in a locked month (what the UI will hit)

Posting endpoints enforce locks server-side. The UI should show the API **`message`** (e.g. period locked for **BANK** / **GL**).

Example for cashbook receipts:

- `POST /api/cashbook/receipts` — fails with `success: false` and a descriptive `message` when the date is locked (same idea for payments, transfers, and other GL-backed actions wired to the lock service).

---

## Permission hints (fiscal calendar)

- **View calendar / exceptions:** `accounting.period_lock.view`, `accounting.period_lock.manage`, or `manage_accounting` (as configured on routes).
- **Draft, commit, policy:** `accounting.period_lock.manage`.
- **Audit log:** `accounting.period_lock.audit_view` or `accounting.period_lock.manage`.

Legacy **`/api/cashbook/periods/*`** routes use **authenticate** only; enforce menu visibility in the UI from your role model.
