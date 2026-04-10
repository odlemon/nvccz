# Capital calls (LP drawdowns) — end-to-end flow

This document describes the full lifecycle: data prerequisites, REST calls in recommended order, accounting behavior, emails, payments ledger, and troubleshooting. All routes live under **`/api/funds`** and require a valid **`Authorization: Bearer`** token header unless noted.

**OpenAPI:** Swagger tag **Capital Calls (LP drawdowns)** (same order as this doc).  
**Code:** `src/routes/fundRoutes.ts`, `src/controllers/CapitalCallController.ts`, `src/services/CapitalCallService.ts`.

---

## One-time and recurring setup

| Action | Command or note |
|--------|------------------|
| Capital call + allocation tables | `npm run db:migrate:capital-calls` *(idempotent)* |
| Per-receipt payment ledger | `npm run db:migrate:capital-call-allocation-payments` *(idempotent)* |
| GL accounts for initiation JE | `npm run db:ensure:capital-call-accounts` — active **`1210`** (Capital Contributions Receivable), **`3010`** (Partners Capital – Uncalled) |
| Prisma client after schema change | `npx prisma generate` *(stop processes that lock the engine on Windows if needed)* |
| Optional: email concurrency | Env **`CAPITAL_CALL_EMAIL_CONCURRENCY`** (default **14**) for parallel SMTP when many LPs receive notices |

---

## Data prerequisites (before POST initiate)

1. **Fund** exists and is **`OPEN`** if you create commitments through **`POST /api/clients`** with a **`fundId`** (validation in `ClientService`).
2. **Investment commitments:** at least one **`investment_commitments`** row for that fund with status **`ACTIVE`** or **`PENDING`**, and **all eligible commitments on that fund share one currency** (e.g. all USD).
3. **LP (client):** each commitment links to **`clients`**. For notices, the client should have a non-empty **`email`**.  
   - Create LP + commitment: **`POST /api/clients`** with `fundId`, `amount`, `currency`, `effectiveDate` (and optional fields — `investorId` is optional; server can generate `inv-{uuid}`).  
   - Add commitment to an existing client: **`PUT /api/clients/:clientId`** with `fundId`, `amount`, `currency`, `effectiveDate`.
4. **Print IDs for Postman:** `npm run db:print:capital-call-postman` — lists **`fundId`**, commitment ids, and whether the fund is ready for initiate.

---

## Recommended call order (full base URL)

Assume **`API`** = `http://localhost:3009` (or your host). Prefix = **`/api/funds`**.

### 1. Initiate the capital call

**POST** `{API}/api/funds/{fundId}/capital-calls`

Creates **`capital_calls`**, **`capital_call_allocations`** (one row per eligible LP line), and a **POSTED** journal entry: **Dr 1210 / Cr 3010** for the **sum** of current call amounts.

**Body (JSON):**

```json
{
  "callPercent": 10,
  "paymentDueDate": "2026-05-30",
  "transactionDate": "2026-04-10",
  "bankInstructions": "Pay to Example Bank, ACC 1234567890, REF: ZIMFUND-CC-001. SWIFT: EXAMPLEZWHX. Beneficiary: ZimFund LP Collections."
}
```

| Field | Meaning |
|-------|---------|
| `callPercent` | Percent of each LP’s **total commitment** for this call (e.g. `10` = 10%). Each line is capped by **uncalled** commitment before this call. |
| `paymentDueDate` | Shown on notice / email / PDF (date only in UI labels). |
| `transactionDate` | **Journal entry** transaction date for the initiation posting. |
| `bankInstructions` | Free text; shown in HTML email, PDF attachment, and **GET …/notice**. **Required**, non-empty. |

**Response:** `201` with `data.id` = **`capitalCallId`**, `data.allocations[].id` = **`allocationId`** per LP, `data.journalEntryId`, etc.

**Typical errors:** no eligible commitments; mixed currencies; missing or inactive **1210** / **3010**; `callPercent` invalid.

---

### 2. List calls for the fund (optional)

**GET** `{API}/api/funds/{fundId}/capital-calls`

Returns a compact list (status, dates, allocation counts, etc.).

---

### 3. LP dashboard for the fund (optional)

**GET** `{API}/api/funds/{fundId}/capital-calls/lp-summary`

Per **`ACTIVE`/`PENDING`** commitment: **`totalCommitment`**, **`cumulativeCalled`**, **`uncalledCommitmentBalance`**, **`amountReceivedTowardCalls`**, **`outstandingCallBalance`**, **`uncalledCapitalNetOfReceipts`**. Use after payments to confirm “uncalled reflects inflow.”

---

### 4. Get one capital call (detail)

**GET** `{API}/api/funds/{fundId}/capital-calls/{capitalCallId}`

Full header, **`allocations`** (with LP client, amounts, status labels), embedded **`payments`** per allocation (raw ledger rows from Prisma), and **`journalEntry`** summary.

---

### 5. Notice JSON (one allocation)

**GET** `{API}/api/funds/{fundId}/capital-calls/{capitalCallId}/allocations/{allocationId}/notice`

Returns JSON: fund/LP names, **`totalCommitment`**, **`uncalledCapitalBeforeThisCall`**, **`currentCallAmount`**, **`paymentDueDate`**, **`bankInstructions`**, currency, **`emailSubjectHint`**, etc. Same facts as the **HTML email** and **server-generated PDF** attachment.

---

### 6. Send emails to all LPs with email addresses

**POST** `{API}/api/funds/{fundId}/capital-calls/{capitalCallId}/send-notices`  
**Body:** none (empty body or omit).

Sends each qualifying allocation’s LP an email: subject **`Capital Call Notice , {fundName} , {paymentDueDate}`** (spaces around commas), HTML table of amounts, **PDF attachment** (`Capital-Call-Notice-{fund}-{date}.pdf`).  
Updates **`noticesSentAt`**; if status was **`INITIATED`**, moves to **`NOTICES_SENT`**.

**Typical errors:** no allocations with **`client.email`**; SMTP misconfiguration.

---

### 7. Record a payment (partial or full)

**POST** `{API}/api/funds/{fundId}/capital-calls/{capitalCallId}/allocations/{allocationId}/payments`

**Body examples:**

Partial:

```json
{ "amount": 2500 }
```

Full remaining (if call line is 5,000 and 2,500 already paid):

```json
{ "amount": 2500 }
```

Appends **`capital_call_allocation_payments`**, updates **`amount_paid`**, allocation **`PARTIALLY_PAID`** / **`PAID`**, and roll-up header **`PARTIALLY_PAID`** / **`FULLY_PAID`**.

**Typical errors:** amount ≤ 0; overpayment vs remaining; allocation already **PAID**.

---

### 8. Payment ledger + rich context (one allocation)

**GET** `{API}/api/funds/{fundId}/capital-calls/{capitalCallId}/allocations/{allocationId}/payments`

Returns:

```json
{
  "success": true,
  "data": {
    "context": {
      "fundId", "fundName", "capitalCallId",
      "callPercent", "paymentDueDate", "callTransactionDate",
      "currencyCode", "currencySymbol",
      "journalEntry": { ... },
      "allocation": {
        "lpLegalNameSnapshot", "clientId", "clientLegalName", "clientEmail",
        "totalCommitmentSnapshot", "uncalledCapitalBeforeSnapshot",
        "currentCallAmount", "amountPaidToDate", "remainingOnCall",
        "status", "statusLabel"
      }
    },
    "payments": [
      {
        "id", "capitalCallAllocationId", "amount", "recordedAt", "createdAt",
        "cumulativePaidThroughThisPayment",
        "remainingOnCallAfterThisPayment"
      }
    ]
  }
}
```

**`payments`** are **newest first**; cumulative fields follow **chronological** receipt order.

---

## Example IDs (replace with yours from initiate response)

Use values returned by **POST initiate**, not these literals, unless they match your DB:

| Role | Example value |
|------|----------------|
| `fundId` | `cmjfpk2g0000lktwmt25ni8p8` |
| `capitalCallId` | `cmnsk6f9s000bunuklx0mlss6` |
| `allocationId` | `cmnsk6fyt000cunuktbtt3moa` |

---

## Status reference

**Capital call (header):** `INITIATED` → `NOTICES_SENT` → `PARTIALLY_PAID` → `FULLY_PAID` (labels: Initiated, Notices Sent, Partially Paid, Fully Paid).  
**Allocation:** `PENDING` → `PARTIALLY_PAID` → `PAID`.

---

## Reset notice timestamp (ops / retest)

Emails cannot be unsent from inboxes. To clear server state for **`noticesSentAt`** (and **`NOTICES_SENT` → `INITIATED`** when applicable):

```bash
npm run db:reset:capital-call-notice-sent -- {capitalCallId}
```

---

## See also

- **`docs/investee-reporting-frontend-flow.md`** — short index + cross-links.  
- **`npm run db:print:capital-call-postman`** — IDs from your database.
