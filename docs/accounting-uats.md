# Accounting UATs

## Add Banks under settings

Base: `/api/cashbook/banks`  
Auth: `Authorization: Bearer <token>`

| Action | Method | Path | Notes |
|--------|--------|------|--------|
| List | GET | `/api/cashbook/banks` | Query: `includeInactive=true` to include soft-deleted |
| Create | POST | `/api/cashbook/banks` | Body below |
| Read | GET | `/api/cashbook/banks/:id` | |
| Update | PUT | `/api/cashbook/banks/:id` | Body: any subset of create fields |
| Delete (soft) | DELETE | `/api/cashbook/banks/:id` | Sets `isActive=false`, clears `glAccountId` |
| GL dropdown | GET | `/api/cashbook/gl-accounts?availableForBank=true` | Asset GLs not linked to a bank yet |

**Create body**

```json
{
  "name": "CBZ",
  "accountNumber": "1234530",
  "currencyId": "<Currency.id>",
  "glAccountId": "<ChartOfAccounts.id>"
}
```

Optional: `bankCode`, `branchCode`, `isActive` (default `true`).

**Update body** (example)

```json
{
  "name": "CBZ Updated",
  "isActive": true
}
```

**Rules (short)**  
`glAccountId`: `Current Asset` or `Fixed Asset`; one bank per GL; `accountNumber` unique.

**List after delete**  
`GET /api/cashbook/banks?includeInactive=true`

remove exchange rate field when creating invoice

<strong>on uat 7, added search queries: <code>GET /api/cashbook/entries?startDate=2026-03-23&endDate=2026-03-29&currencyId=cmmmy2lqx0004kti3i5ebitt5&minAmount=100&maxAmount=500&search=Monthly+municipal+TAX&page=1&limit=50</code></strong>

<strong>on uat 13 use <code>GET /api/cashbook/reconciliation/display?bankId=cmn6hgk5b0001unp8p9kik9xq&periodEndDate=2026-03-25</code></strong>

<strong>on uat 25 use <code>GET /api/accounting/purchase-invoices/creditors-age-analysis</code> (optional query: <code>asOfDate=YYYY-MM-DD</code>)</strong>

<strong>on uat 28 use <code>GET /api/cashbook/export-audit?year=2026&month=3&bankId=cmn6hgk5b0001unp8p9kik9xq</code></strong>

<strong>on uat 33, show field for equivalent amount, i added data in the resposne like this</strong>

```json
                "equivalentAtCreation": {
                    "amount": "45800",
                    "currency": {
                        "id": "cmh3byol60001una4029pus8w",
                        "code": "ZWL",
                        "name": "Zimbabwean Dollar",
                        "symbol": "Z$"
                    }
                }
```

<strong>on uat 36, show response for the data for the currency converted</strong>

<strong>on uat 50 use <code>GET /api/vat/report/output-tax-audit?startDate=2026-03-01&endDate=2026-03-31&currencyId=cmh3bymy70000una4yk8leusu</code></strong>

<strong>on uat 54 use <code>POST /api/accounting/balance-sheet/generate?hideZeroBalances=true</code> — body must include <code>asOfDate</code> (and optional <code>currencyId</code>), e.g. <code>{ "asOfDate": "2026-03-31" }</code></strong>

<strong>on uat 56 use <code>GET /api/accounting/assets/register</code></strong>

<strong>on uat 63 use <code>GET /api/system-audit-log/last-24-hours?scope=all</code></strong>

<strong>on uat 75 use <code>POST /api/cashbook/entries/:id/receipt-attachment</code> — <code>multipart/form-data</code>, field <code>file</code></strong>

<strong>on uat 77 use <code>POST /api/accounting/chart-of-accounts/bulk-import/validate</code> — <code>multipart/form-data</code>, field <code>file</code></strong>

<strong>on uat 79, personalized reporting — saved filter favourites (per user). Base: <code>/api/users/me/saved-filter-favorites</code> — <code>Authorization: Bearer &lt;token&gt;</code></strong>

| Action | Method | Path |
|--------|--------|------|
| List | GET | `/api/users/me/saved-filter-favorites` — optional query `routeKey` (e.g. screen/module key) |
| Create preset | POST | `/api/users/me/saved-filter-favorites` |
| Get one | GET | `/api/users/me/saved-filter-favorites/:presetId` |
| Update | PATCH | `/api/users/me/saved-filter-favorites/:presetId` |
| Delete | DELETE | `/api/users/me/saved-filter-favorites/:presetId` |

**POST body** (create)

```json
{
  "name": "Western Region Sales",
  "routeKey": "sales-invoices",
  "filters": {
    "startDate": "2026-03-23",
    "endDate": "2026-03-29",
    "currencyId": "cmmmy2lqx0004kti3i5ebitt5",
    "minAmount": 100,
    "maxAmount": 500,
    "search": "Monthly municipal TAX",
    "page": 1,
    "limit": 50
  },
  "sortOrder": 0
}
```

`filters` is arbitrary JSON the UI replays as query/body when opening the favourite.

<strong>on uat 95 use <code>POST /api/accounting/purchase-invoices/batch-pay</code></strong>

```json
{
  "invoiceIds": [
    "cmn9y6irl0031unowai3s2khx",
    "cmn9y691l002punowrii1hwwj",
    "cmn9y5z5s002dunow9h68234z",
    "cmn9y5oji0021unowxk5wjv8e",
    "cmn9y5epa001punowpcp4rgo5",
    "cmn9y54nq001dunowolyoiznu",
    "cmn9y4v0o0011unow1cc83fe8",
    "cmn9y4l5v000punowgljpu0e9",
    "cmn9y4b8s000dunowkkmeld6v",
    "cmn9y3xfc0001unowndlx1vut"
  ],
  "paymentMethod": "BANK",
  "bankId": "cmn6hgk5b0001unp8p9kik9xq",
  "paymentDate": "2026-03-28T06:41:48.230Z",
  "paymentReference": "BATCH-POSTMAN-1774680108232",
  "notes": "IDs from print-batch-pay-postman-body.ts"
}
```

## Unrealized gains (FX report)

**GET** `/api/accounting/multi-currency/reports/unrealized-fx`  
Auth: `Authorization: Bearer <token>`

Query (optional): `asOfDate=YYYY-MM-DD` (defaults to now if omitted)

Example: `GET /api/accounting/multi-currency/reports/unrealized-fx?asOfDate=2026-03-31`

## Bank reconciliation (sessions — new)

All routes are under `/api/cashbook/reconciliation`.  
Auth: `Authorization: Bearer <token>`

Path parameters: replace `BANK_ID` with your bank (example below uses `cmn6hgk5b0001unp8p9kik9xq`), replace `SESSION_ID` with a session id from the create/list response (example session id in URLs below: `clrexample001unp8p9kik9xq`).

Success responses use:

```json
{
  "success": true,
  "message": "Cashbook reconciliation candidates retrieved",
  "data": {},
  "timestamp": "2026-03-28T12:00:00.000Z"
}
```

Errors: `success: false`, `message` (and sometimes `error`), `timestamp`.

Suggested order: list entries → list/create sessions → get/patch draft → finish (or discard).

| Step | Method | URL |
|------|--------|-----|
| Candidate lines | GET | `/api/cashbook/reconciliation/banks/BANK_ID/entries?asOf=YYYY-MM-DD` — add `&includeReconciled=true` if needed |
| List sessions | GET | `/api/cashbook/reconciliation/banks/BANK_ID/sessions` |
| Create draft | POST | `/api/cashbook/reconciliation/banks/BANK_ID/sessions` |
| Get session | GET | `/api/cashbook/reconciliation/sessions/SESSION_ID` |
| Update draft | PATCH | `/api/cashbook/reconciliation/sessions/SESSION_ID` |
| Finish | POST | `/api/cashbook/reconciliation/sessions/SESSION_ID/finish` |
| Discard | POST | `/api/cashbook/reconciliation/sessions/SESSION_ID/discard` |

<strong>on uat 13 (example URLs for bank reconciliation sessions, same bank as display UAT above):<br>
<code>GET /api/cashbook/reconciliation/banks/cmn6hgk5b0001unp8p9kik9xq/entries?asOf=2026-03-25</code><br>
<code>GET /api/cashbook/reconciliation/banks/cmn6hgk5b0001unp8p9kik9xq/sessions</code><br>
<code>POST /api/cashbook/reconciliation/banks/cmn6hgk5b0001unp8p9kik9xq/sessions</code><br>
<code>GET /api/cashbook/reconciliation/sessions/clrexample001unp8p9kik9xq</code><br>
<code>PATCH /api/cashbook/reconciliation/sessions/clrexample001unp8p9kik9xq</code><br>
<code>POST /api/cashbook/reconciliation/sessions/clrexample001unp8p9kik9xq/finish</code><br>
<code>POST /api/cashbook/reconciliation/sessions/clrexample001unp8p9kik9xq/discard</code></strong>

---

### 1) GET `/api/cashbook/reconciliation/banks/BANK_ID/entries`

**Request:** none. **Query:** `asOf` required (`YYYY-MM-DD` or ISO).

**Example:** `GET /api/cashbook/reconciliation/banks/cmn6hgk5b0001unp8p9kik9xq/entries?asOf=2026-03-25`

**Response `data`:** array of cashbook rows (candidates).

```json
[
  {
    "id": "cl_entry_1",
    "transactionDate": "2026-03-20T00:00:00.000Z",
    "type": "RECEIPT",
    "description": "Customer receipt",
    "reference": "REF-1",
    "amount": 100,
    "received": 100,
    "paid": 0,
    "signedAmount": 100,
    "status": "POSTED",
    "isReconciled": false,
    "counterpartyType": "CUSTOMER",
    "counterparty": "Acme Ltd",
    "cashbookReconciliationSessionId": null
  }
]
```

---

### 2) GET `/api/cashbook/reconciliation/banks/BANK_ID/sessions`

**Request:** none.

**Example:** `GET /api/cashbook/reconciliation/banks/cmn6hgk5b0001unp8p9kik9xq/sessions`

**Response `data`:** array of session objects (same shape as get-by-id; `CANCELLED` sessions omitted).

---

### 3) POST `/api/cashbook/reconciliation/banks/BANK_ID/sessions`

**Request body**

```json
{
  "statementDate": "2026-03-27T17:01:50.663Z",
  "statementEndBalance": 60,  
  "reference": "July 2024 bank recon",
  "openingBalance": 0,
  "selectedEntryIds": ["CASHBOOK_ENTRY_ID_1", "CASHBOOK_ENTRY_ID_2"]
}
```

`statementDate` and `statementEndBalance` required. `openingBalance` / `selectedEntryIds` / `reference` optional.

**Example:** `POST /api/cashbook/reconciliation/banks/cmn6hgk5b0001unp8p9kik9xq/sessions`

**Response `data`:** one session (see below). HTTP **201**.

---

### 4) GET `/api/cashbook/reconciliation/sessions/SESSION_ID`

**Request:** none.

**Example:** `GET /api/cashbook/reconciliation/sessions/clrexample001unp8p9kik9xq` (replace with `data.id` from create or list)

**Response `data`:** session with `lines`, `totals` (when lines exist), `openingBalance`, `priorClosingBalanceFromLastFinalized`.

```json
{
  "id": "cl_session_1",
  "bankId": "BANK_ID",
  "status": "DRAFT",
  "statementDate": "2026-03-27T17:01:50.663Z",
  "statementEndBalance": 60,
  "reference": "July 2024 bank recon",
  "openingBalance": 0,
  "closingBalance": 60,
  "priorClosingBalanceFromLastFinalized": 0,
  "createdById": "user-id",
  "finishedById": null,
  "finishedAt": null,
  "createdAt": "2026-03-27T12:00:00.000Z",
  "updatedAt": "2026-03-27T12:00:00.000Z",
  "totals": {
    "openingBalance": 0,
    "totalSelectedReceived": 100,
    "totalSelectedPaid": 40,
    "reconciledBalance": 60,
    "statementEndBalance": 60,
    "difference": 0
  },
  "lines": [
    {
      "id": "cl_line_1",
      "cashbookEntryId": "CASHBOOK_ENTRY_ID_1",
      "selected": true,
      "entry": {
        "id": "CASHBOOK_ENTRY_ID_1",
        "transactionDate": "2026-03-20T00:00:00.000Z",
        "type": "RECEIPT",
        "description": "Customer receipt",
        "reference": "REF-1",
        "amount": 100,
        "received": 100,
        "paid": 0,
        "signedAmount": 100,
        "status": "POSTED",
        "isReconciled": false,
        "counterpartyType": "CUSTOMER",
        "counterparty": "Acme Ltd",
        "cashbookReconciliationSessionId": null,
        "stats": {
          "selectedForSession": true,
          "posted": true,
          "reconciledOnBooks": false,
          "clearedByThisSession": false,
          "reconciliationSessionId": null
        }
      }
    }
  ]
}
```

For **FINALIZED** sessions: `status` is `FINALIZED`, `finishedById` / `finishedAt` set, `closingBalance` persisted; selected entries show `isReconciled: true` and `stats.clearedByThisSession` / `reconciliationSessionId` as applicable.

---

### 5) PATCH `/api/cashbook/reconciliation/sessions/SESSION_ID`

**Draft only.** Omit `lines` to change header fields only.

**Request body (example)**

```json
{
  "statementDate": "2026-03-27T12:00:00.000Z",
  "statementEndBalance": 60,
  "reference": "Updated label",
  "openingBalance": 0,
  "lines": [
    { "cashbookEntryId": "CASHBOOK_ENTRY_ID_1", "selected": true },
    { "cashbookEntryId": "CASHBOOK_ENTRY_ID_2", "selected": false }
  ]
}
```

**Example:** `PATCH /api/cashbook/reconciliation/sessions/clrexample001unp8p9kik9xq`

**Response `data`:** same session shape as GET (4).

---

### 6) POST `/api/cashbook/reconciliation/sessions/SESSION_ID/finish`

**Request:** none.

**Example:** `POST /api/cashbook/reconciliation/sessions/clrexample001unp8p9kik9xq/finish`

**Response `data`:** finalized session (same shape as (4); `status`: `FINALIZED`). Fails **400** if draft balance does not match `statementEndBalance` (±0.01) or no line selected.

---

### 7) POST `/api/cashbook/reconciliation/sessions/SESSION_ID/discard`

**Request:** none. **Draft only.**

**Example:** `POST /api/cashbook/reconciliation/sessions/clrexample001unp8p9kik9xq/discard`

**Response `data`**

```json
{
  "id": "cl_session_1",
  "status": "CANCELLED"
}
```

---

