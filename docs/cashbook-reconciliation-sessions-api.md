# Cashbook bank reconciliation sessions API

All routes are under **`/api/cashbook`**, require **authentication** (`Authorization: Bearer <JWT>`), and are registered on the enhanced cashbook router.

Suggested call order for a full reconcile flow is **1 → 8** below. Replace `BANK_ID`, `SESSION_ID`, and entry IDs with real values from your database (see **Real IDs** at the bottom).

---

## 0. Prerequisite — login

Get a JWT for subsequent requests.

**`POST /api/auth/login`**

```json
{
  "email": "admin@nts.com",
  "password": "admin123"
}
```

Response: `token` (use as `Authorization: Bearer <token>`).

---

## 1. List candidate cashbook lines (grid data)

Posted lines for the bank up to the statement **as-of** date. By default only **unreconciled** lines; add `includeReconciled=true` to include reconciled ones.

**`GET /api/cashbook/reconciliation/banks/BANK_ID/entries?asOf=YYYY-MM-DD`**

Query parameters:

| Name | Required | Description |
|------|----------|-------------|
| `asOf` | Yes | Statement / period end date (`YYYY-MM-DD` or ISO date) |
| `includeReconciled` | No | `true` or `1` to include reconciled POSTED lines |

Example:

```http
GET /api/cashbook/reconciliation/banks/BANK_ID/entries?asOf=2026-03-27
GET /api/cashbook/reconciliation/banks/BANK_ID/entries?asOf=2026-03-27&includeReconciled=true
```

No request body.

---

## 2. List reconciliation sessions for the bank

Returns **DRAFT** and **FINALIZED** sessions (**CANCELLED** excluded). Each session includes **`lines`** (with **`entry`** and **`entry.stats`**), **`openingBalance`**, **`closingBalance`** (for drafts this mirrors the statement target until finalized), **`statementEndBalance`**, and **`totals`** when lines exist.

**`GET /api/cashbook/reconciliation/banks/BANK_ID/sessions`**

No request body.

---

## 3. Create a draft session

**`POST /api/cashbook/reconciliation/banks/BANK_ID/sessions`**

```json
{
  "statementDate": "2026-03-27T17:01:50.663Z",
  "statementEndBalance": 60,
  "reference": "July 2024 bank recon",
  "openingBalance": 0,
  "selectedEntryIds": [
    "CASHBOOK_ENTRY_ID_1",
    "CASHBOOK_ENTRY_ID_2"
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `statementDate` | Yes | ISO date/time for the statement |
| `statementEndBalance` | Yes | Bank statement closing balance (target) |
| `reference` | No | Label (e.g. period name) |
| `openingBalance` | No | Opening for this session; if omitted, defaults from last **FINALIZED** session’s closing when available |
| `selectedEntryIds` | No | Cashbook entry IDs to attach; all start as **selected** |

**Finish rule:** for selected lines,  
`openingBalance + Σ(receipts) − Σ(payments)` must equal `statementEndBalance` within **0.01** when you call **finish**.

Response includes `data.id` → use as **`SESSION_ID`** in steps 4–7.

---

## 4. Get one session (with lines and totals)

**`GET /api/cashbook/reconciliation/sessions/SESSION_ID`**

No request body.

Includes `priorClosingBalanceFromLastFinalized` (hint for next opening), `lines`, `totals`, `closingBalance`, etc.

---

## 5. Update draft (header and/or line selection)

Only **`DRAFT`** sessions.

**`PATCH /api/cashbook/reconciliation/sessions/SESSION_ID`**

Replace lines entirely when `lines` is sent:

```json
{
  "statementDate": "2026-03-27T12:00:00.000Z",
  "statementEndBalance": 60,
  "reference": "July 2024 bank recon (updated)",
  "openingBalance": 0,
  "lines": [
    { "cashbookEntryId": "CASHBOOK_ENTRY_ID_1", "selected": true },
    { "cashbookEntryId": "CASHBOOK_ENTRY_ID_2", "selected": false }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `statementDate` | No | New statement date |
| `statementEndBalance` | No | New target balance |
| `reference` | No | New reference |
| `openingBalance` | No | New opening (`null` allowed to clear stored opening) |
| `lines` | No | Full replacement list of `{ cashbookEntryId, selected }` |

Omit `lines` to only patch header fields.

---

## 6. Finish reconciliation

Validates balances, marks **selected** lines reconciled, sets session **FINALIZED** and persists **closingBalance**.

**`POST /api/cashbook/reconciliation/sessions/SESSION_ID/finish`**

No request body.

---

## 7. Discard a draft

Only **`DRAFT`** sessions. Lines are removed and status becomes **CANCELLED** (session no longer appears in list in step 2).

**`POST /api/cashbook/reconciliation/sessions/SESSION_ID/discard`**

No request body.

To test discard without finishing your main draft, create a **second** draft with empty lines (step 3 with `selectedEntryIds: []`), then discard that session’s id.

**Example — empty draft for discard-only testing:**

**`POST /api/cashbook/reconciliation/banks/BANK_ID/sessions`**

```json
{
  "statementDate": "2026-03-28T12:00:00.000Z",
  "statementEndBalance": 0,
  "reference": "discard-me",
  "openingBalance": 0,
  "selectedEntryIds": []
}
```

Then **`POST /api/cashbook/reconciliation/sessions/<that-session-id>/discard`**.

---

## 8. Optional — GL-style running balance (existing)

Not part of the session CRUD above, but useful with the same bank and `tickedEntryIds`:

**`GET /api/cashbook/reconciliation/display?bankId=BANK_ID&periodEndDate=YYYY-MM-DD&tickedEntryIds=["id1","id2"]`**

(`tickedEntryIds` can be repeated query params or a JSON string, depending on client.)

---

## Real IDs and balancing bodies

Generate **current** bank id, cashbook entry ids, and a **mathematically consistent** `statementEndBalance` from the connected database:

```bash
npx ts-node scripts/print-cashbook-recon-api-payloads.ts
```

Automated flow (login + all session steps):

```bash
npm run test:cashbook-reconciliation-sessions-http
```

---

## Response shape (summary)

- **`lines[]`**: `id`, `cashbookEntryId`, `selected`, `entry` (amounts, counterparty, …), `entry.stats` (`selectedForSession`, `posted`, `reconciledOnBooks`, `clearedByThisSession`, `reconciliationSessionId`).
- **`totals`** (if there are lines): `openingBalance`, `totalSelectedReceived`, `totalSelectedPaid`, `reconciledBalance`, `statementEndBalance`, `difference`.
- **`closingBalance`**: finalized = stored closing; draft = same as statement target (`statementEndBalance`) for display until finish.
