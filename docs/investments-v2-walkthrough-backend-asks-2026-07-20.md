# Investments V2 — Walkthrough Backend Asks Report

**Date:** 2026-07-20 (updated same day — recon BA-R* wave)  
**Source ask:** FE agent walkthrough backend asks (API smoke + Playwright)  
**Tester credentials:** `admin@nts.com` / `admin123`  
**App:** `http://localhost:3001` · **API:** `http://localhost:3009/api`  
**Database:** DEV `nts` only  
**Audience:** Backend + Frontend + Product  

---

## Executive summary

| ID | Area | Priority | BE status |
| --- | --- | --- | --- |
| **BA-1** | Cash ledger purpose filters return 0 rows | Blocker | **DONE** |
| **BA-2** | `POST /orders/:id/execute` ~4 min + no `tradeId` | Blocker | **DONE** |
| **BA-3** | No OPEN recon exceptions to resolve | Blocker | **DONE** |
| **BA-4** | Dedicated holdings/trade recon screens | Can wait | **WONT for V2** (product) |
| **BA-5** | Statement download JSON vs PDF stream | Can wait | **OPEN** (FE base64 workaround works) |
| **BA-6** | No DRAFT/SUBMITTED orders in seed | Can wait | **DONE** |
| **BA-7** | SRD match status labels vs API | Can wait | **OPEN** (docs/mapping) |
| **BA-8** | Excel/CSV statement export | Can wait | **OPEN** (not implemented) |
| **BA-9** | Investor statement capital lines | Can wait | **OPEN** (partial) |
| **BA-T1** | Compliance outcomes vs SRD six | Can wait | **DONE** |
| **BA-T2** | PARTIALLY_EXECUTED / PENDING_SETTLEMENT | Can wait | **DONE** |
| **BA-T3** | Order ticket Stop / settlement / approval route | Can wait | **DONE** (fields accepted + echoed; docs via existing order documents API) |
| **BA-T4** | Fail / Archive order transitions | Can wait | **DONE** |
| **BA-R1** | Import maker-checker + control totals gates | Blocker | **DONE** |
| **BA-R2** | Match score components + competing-candidate rules | Can wait | **PARTIAL** (components + weights returned; competition already skips auto-match) |
| **BA-R3** | Split/net match topologies | Can wait | **OPEN** |
| **BA-R4** | Period close (SRD §15) | Can wait | **OPEN** |
| **BA-R5** | Exception lifecycle / OPEN seed | Blocker | **DONE** (same as BA-3) |
| **BA-R6** | CBZ_CSV_V1 templates + line errors + dup hash | Blocker | **DONE** |

**UAT:**

| Script | Result |
| --- | --- |
| `npm run uat:investments-v2:walkthrough` | **8/8 PASS** |
| `npm run uat:investments-v2:trading-asks` | **10/10 PASS** |
| `npm run uat:investments-v2:recon-asks` | **13/13 PASS** |

---

## Pre-session commands

```powershell
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
npm run db:seed:investments-v2-demo
npm run uat:investments-v2:walkthrough
npm run uat:investments-v2:trading-asks
npm run uat:investments-v2:recon-asks
```

Related FE scripts (from ask):

- `node scripts/uat-walkthrough-investments.mjs`
- `node scripts/walkthrough-investments-browser.mjs`
- `node scripts/uat-trading-lifecycle.mjs`

FE demo CSVs (FE repo): `public/demo-templates/cash-recon/*`  
Canonical header: `value_date,trade_date,amount,debit_credit,reference,counterparty,description`  
Import UI: Provider = CBZ Custody · Layout = `CBZ_CSV_V1` · Currency = USD

---

## BA-1 — Cash ledger purpose filters (DONE)

### Problem

`GET /investment-ops/cash-ledger?accountPurpose=FUND|TRADING` returned **0** rows.

### Fix

1. Seed `ensurePurposeCashAccounts` — TRADING + FUND accounts with journals
2. API filter also maps `CUSTODY_CASH` / `CLIENT_CASH` → TRADING

### Verification

| Check | Result |
| --- | --- |
| `accountPurpose=FUND` | **2** rows |
| `accountPurpose=TRADING` | **7** rows |

---

## BA-2 — Order execute performance + `tradeId` (DONE)

### Problem

Execute ~252s; no top-level `tradeId`.

### Fix

- Response: `{ order, trade, tradeId, status, filledQuantity?, remainingQuantity? }`
- SMTP opt-in (`LISTED_EQUITY_DISPATCH_EMAIL`); auto-confirm when email off
- Async settlement routing in internal mode
- Prisma settlement/journal tx timeout **30s**

### Verification

Execute ~30–40s on remote MySQL with top-level `tradeId` (was ~4 min).

---

## BA-3 — Open reconciliation exceptions (DONE)

Seed upserts 3 exceptions: 2× OPEN, 1× INVESTIGATING (`SEED_WALKTHROUGH:EX-*`).  
Re-seed resets closed ones.

---

## BA-6 — DRAFT / SUBMITTED orders (DONE)

Seed includes `ALP-ORD-DRAFT-ECO`, `ALP-ORD-SUBMIT-CBZ`, `ALP-ORD-APPROVED-DLTA`, plus execute demos.

---

## BA-T1 — Compliance outcomes (DONE)

### Expected (SRD)

Passed, Warning, Failed, Requires Override, Approved with Exception, Rejected

### API canonical values

| API `outcome` | `srdLabel` |
| --- | --- |
| `PASSED` | Passed |
| `WARNING` | Warning |
| `FAILED` | Failed |
| `REQUIRES_OVERRIDE` | Requires Override |
| `APPROVED_WITH_EXCEPTION` | Approved with Exception |
| `REJECTED` | Rejected |

- Legacy `BREACH` / `PASS` normalized → `FAILED` / `PASSED`
- Pending override elevates `FAILED` → `REQUIRES_OVERRIDE`
- `GET /compliance/results` returns `outcome` + `srdLabel`

**Files:** `InvestmentComplianceService.ts`

---

## BA-T2 — PARTIALLY_EXECUTED / PENDING_SETTLEMENT (DONE)

### Behaviour

- State machine includes both statuses (Phase1 + Phase2 aligned)
- `POST /orders/:id/execute` body accepts:
  - `quantity` / `partialFillQuantity` / `filledQuantity`
  - `executionPrice`
- Partial fill → `PARTIALLY_EXECUTED` + `filledQuantity` / `remainingQuantity`
- Full fill while trade still routing → `PENDING_SETTLEMENT` (not jumped to SETTLED until GL posts)

### Seed

| Order ref | Status |
| --- | --- |
| `ALP-ORD-PARTIAL-ECO` | PARTIALLY_EXECUTED (40% fill recorded) |
| `ALP-ORD-PENDING-SETTLE-CBZ` | PENDING_SETTLEMENT |
| `ALP-ORD-FAILED-FBC` | FAILED |

---

## BA-T3 — Order ticket fields (DONE for walkthrough)

### Accepted on preview / create / update

| Field | Notes |
| --- | --- |
| `orderType` | `MARKET` \| `LIMIT` \| `STOP` \| `STOP_LIMIT` |
| `stopPrice` | Required for STOP/STOP_LIMIT (or `limitPrice` for STOP) |
| `settlementAccountId` | Persisted in ticket meta trailer; echoed on GET/list |
| `approvalRouteId` | Same; list applicable routes via existing `GET /orders/:id/applicable-approval-routes` |
| Documents | Existing `POST/GET /orders/:id/documents` |

Ticket extras are stored in `notes` as a trailing `[[IO_TICKET_META]]{…}` block and stripped from the user-facing `notes` on present.

**Not in this turn:** dedicated DB columns / multipart attach on place-order modal (use documents API).

---

## BA-T4 — Fail / Archive (DONE)

| Method | Path | From statuses | Body |
| --- | --- | --- | --- |
| POST | `/investment-ops/orders/:id/fail` | SENT_TO_BROKER, PARTIALLY_EXECUTED, EXECUTED, PENDING_SETTLEMENT | `{ reason }` **required** |
| POST | `/investment-ops/orders/:id/archive` | SETTLED, REJECTED, CANCELLED, FAILED | `{ reason? }` |

Both require `Idempotency-Key`.  
Transition audit rows now allocate next `approvalSequence` (fixes unique constraint on re-transition).

---

## Can-wait still open

| ID | Notes |
| --- | --- |
| BA-4 | Product — use Broker & custodian + Blotter |
| BA-7 | FE semantic mapping |
| BA-8 | Excel/CSV export |
| BA-9 | Investor capital lines on preview |
| BA-R3 | One-to-many / many-to-one match topologies |
| BA-R4 | Cash period close workflow |

---

## BA-R7 — Human labels on recon list payloads (DONE)

Operators never see Prisma cuids as Account / Client / Generated By labels.

| Endpoint | Added fields |
| --- | --- |
| `GET /cash-exceptions` (alias) + `GET /reconciliation-exceptions` | `accountNumber` (display-safe masked), `accountNumberMasked`, `cashAccountLabel`, `clientName`, `amountDifference`, `assignedToName`, `approverName` |
| `GET /cash-ledger` | `accountNumber`, `accountNumberMasked`, `cashAccountName`, `cashAccountLabel`, `clientName`, `fundName` |
| `GET /client-statements` | `generatedByName`, `generatedByEmail`, `generatedBy { id, name, email }`, `approvedByName`, account/client labels |

Cleartext bank numbers remain encrypted; `accountNumber` is the masked/display label (never a `cmr…` cuid).

UAT: `npm run uat:investments-v2:recon-labels-pdf`

---

## BA-5 / BA-R8 — Statement PDF download (DONE)

`GET /client-statements/:id/download`

| Accept | Response |
| --- | --- |
| `application/pdf` | Binary stream: `Content-Type: application/pdf`, body starts with `%PDF` |
| other / JSON | `{ success, data: { fileName, contentBase64, contentType: "application/pdf" } }` where base64 decodes to real PDF (`JVBERi0…`) |

Built with pdfkit (opening/closing cash + movements).

---

## BA-R1 — Import maker-checker + control totals (DONE)

### Flow enforced

`RECEIVED` → Validate → `VALIDATED` → Submit → `PENDING_APPROVAL` → Commit → `COMMITTED`

| Gate | Behaviour |
| --- | --- |
| Create | Status **`RECEIVED`** (legacy `PENDING` aliased in presenters) |
| Submit | **409** unless `VALIDATED` |
| Commit | **409** unless `PENDING_APPROVAL`; requires `controlOpening` + `controlClosing`; rejects if opening+movements≠closing (±0.01) |
| Maker≠checker | **409 `MAKER_CHECKER_CONFLICT`** for non-admin same user; **admins bypass** (demo convenience for `admin@nts.com`) |

Validate / commit responses include `controlTotals: { opening, closing, movements, expectedMovement, balanced }`.

---

## BA-R5 — OPEN exceptions (DONE)

Same seed as BA-3: 2× OPEN + 1× INVESTIGATING. UAT saw `openish=3`.

Walkthrough seed also creates a linked `sp_cash_reconciliation_breaks` row per exception (when `batchId` is set) so break actions work without runtime heal.

---

## BA-R5b — Break mark-reviewed + manual match / unmatch (DONE)

### Mark reviewed

`POST /reconciliation-breaks/:id/mark-reviewed` — `:id` may be a **break id** or an **exception id** (FE often passes exception id). Backend resolves in order: break PK → break by `exceptionId` → heal/create break from exception.

| Case | Response |
| --- | --- |
| Valid break/exception | `200`, `status: REVIEWED` |
| Already reviewed | `200` idempotent (optional `notes` stored as break comment) |
| Unknown/stale id | `404 NOT_FOUND` — not a raw Prisma dump |

UAT: `npm run uat:investments-v2:recon-breaks-match`

### Manual match confirm

| Method | Path | Body |
| --- | --- | --- |
| POST | `/matches/manual` | `{ cashAccountId?, batchId?, internalLineId, externalLineId, matchedAmount }` |
| POST | `/matches/confirm` | Same flat shape or legacy `{ links: [...] }` |

`batchId` optional when `cashAccountId` or `internalLineId` can resolve/create a recon batch. Re-confirming the same pair is idempotent.

### Unmatch / reverse

| Method | Path | Body |
| --- | --- | --- |
| POST | `/matches/:linkId/unmatch` | `{ reason? }` |
| POST | `/matches/:linkId/reverse` | alias |
| POST | `/matches/unmatch` | `{ linkId }` or `{ internalLineId, externalLineId }` |

`:linkId` may be a real match link id or suggestion id `sug_<internal>_<external>`.

---

## BA-R6 — CBZ_CSV_V1 honour (DONE)

| Item | Status |
| --- | --- |
| Seed provider `CBZ_CUSTODY` + ACTIVE layout `CBZ_CSV_V1` | Yes (upserted on every seed) |
| Columns | `value_date,trade_date,amount,debit_credit,reference,counterparty,description` |
| Sign map | Debit=NEGATIVE / Credit=POSITIVE |
| Alternate columns | `debit_amount` / `credit_amount` parser support |
| Validate line errors | `{ lineNumber, code, message }[]` |
| Optional control totals on validate | Yes; `requireControlTotals: true` forces |
| Duplicate hash | **409 `DUPLICATE_SOURCE`** on create after commit |

---

## BA-R2 — Score components (PARTIAL)

Suggestions / score pairs now return `scoreTotal`, `scoreComponents` (amount/date/reference/counterparty), `weights` (0.5/0.2/0.2/0.1), `weighted` contributions, and `hardFailures` / `hardRuleFailures` on hard-rule fails. Competing top scores still skip auto-match (existing behaviour).

---

## Files touched (this wave + prior)

| Path | Why |
| --- | --- |
| `scripts/seed-investments-v2-demo-lean.ts` | Purpose cash, open exceptions, lifecycle orders, CBZ_CSV_V1 layout upsert |
| `src/services/stockPickerCash/SpCashJournalService.ts` | Purpose filters |
| `src/services/stockPickerCash/SpCashImportService.ts` | RECEIVED gates, control totals, line errors, CSV columns |
| `src/services/stockPickerCash/SpCashMatchingService.ts` | scoreComponents + weights on suggestions |
| `src/controllers/StockPickerCashController.ts` | Pass `req.user` into commit/reject for admin bypass |
| `src/services/investmentOps/InvestmentOrderService.ts` | Execute perf/`tradeId`/partial qty; fail/archive |
| `src/services/investmentOps/InvestmentOrderPhase2Service.ts` | STOP types; ticket meta |
| `src/services/investmentOps/InvestmentComplianceService.ts` | SRD six outcomes + `srdLabel` |
| `scripts/uat-walkthrough-investments-http.ts` | BA-1/2/3/6 UAT |
| `scripts/uat-walkthrough-trading-asks-http.ts` | BA-T1..T4 UAT |
| `scripts/uat-walkthrough-recon-asks-http.ts` | BA-R1/R2/R5/R6 UAT |
| `package.json` | `uat:investments-v2:recon-asks` |

---

## Recommended walkthrough script (updated)

1. **Login** → `http://localhost:3001/login`
2. **Recon Overview** → KPIs
3. **Fund cash → Import** → RECEIVED → Validate → Submit → Commit (**checker** if non-admin maker)
4. **Fund cash → New batch** → Run Reconciliation → Confirm suggestion / manual match
5. **Broker & custodian** → 3-way
6. **Exceptions** → resolve an **OPEN** exception live
7. **Cash ledger** → Fund / Trading tabs
8. **Statements** → Preview → Approve → Download
9. **Trading / New order** → Review → Place (optional STOP_LIMIT)
10. **Orderbook** → DRAFT / SUBMITTED / PARTIALLY_EXECUTED / PENDING_SETTLEMENT; Approve → Send → Execute
11. **Failed / Archived** → Fail → Archive
12. **Blotter** → Confirm / settle

---

## Acceptance checklist

- [x] BA-1 FUND/TRADING ledger rows after seed
- [x] BA-2 execute returns `tradeId` in under ~45s
- [x] BA-3 / BA-R5 at least 2 OPEN/INVESTIGATING exceptions
- [x] BA-6 DRAFT + SUBMITTED seeded
- [x] BA-T1 compliance `outcome` + `srdLabel` (no raw BREACH)
- [x] BA-T2 PARTIALLY_EXECUTED + PENDING_SETTLEMENT (seed + execute body)
- [x] BA-T3 STOP_LIMIT preview accepted; settlementAccountId / approvalRouteId echoed
- [x] BA-T4 `POST …/fail` + `POST …/archive`
- [x] BA-R1 RECEIVED→Validate→Submit→Commit + maker≠checker + control totals
- [x] BA-R6 CBZ_CSV_V1 parse + line errors + duplicate hash
- [x] `uat:investments-v2:walkthrough` green
- [x] `uat:investments-v2:trading-asks` green
- [x] `uat:investments-v2:recon-asks` green
- [ ] BA-5 / BA-8 / BA-9 / BA-R3 / BA-R4 optional follow-ups

---

## Related docs

- Module completion: `docs/investments-v2-module-completion.md`
- Lean demo / seed: `docs/investments-v2-lean-demo.md`
- Market data cron: `docs/stock-price-collector-ubuntu-cron-setup.md`
