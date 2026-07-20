# Investments V2 — FE gap closure (2026-07-19)

Backend responses for the asks in **Investments V2 — Backend asks** (Part A core + Part B cash).
Base path: `/api/investment-ops`.

---

## Product clarifications

| Ask | Decision |
| --- | --- |
| **A5** Portfolios vs setup/funds | **Source of truth for fund pickers** = `GET /portfolios` (and dashboard funds). `GET /setup/funds` is the same fund list with setup enrichment (broker/custodian names) — either works for pickers; prefer `/portfolios` for investment workflows. |
| **A6** Path namespaces | Holdings/trade recon stays under `/reconciliation/*`. Cash recon uses flat `/reconciliation-batches`, `/matches`, `/cash-ledger`, `/fund-cash-summary`, etc. Never mix. |
| **A8** Blotters | Real API: `GET/POST /blotters`, `POST /blotters/:id/orders`, etc. (paged list). |
| **A21** `createValuationRun` | `asOf` accepts date-only (`YYYY-MM-DD`) or datetime (ISO). Price/FX source selectors are **not** required on create; run uses approved market inputs. |
| **A23** Approval routes | CRUD under `/approval-routes` (and `/setup/approval-routes` alias). |
| **B3** Status enums | See canonical lists below. |
| **B7** Investor statements | Same `/client-statements*` resource; filter/generate with `statementType=INVESTOR_CAPITAL` (aliases `INVESTOR`, `CAPITAL`). |
| **B8** Period close | Backend exists; FE later. |

---

## Part A — what changed

### Money strings (A1)
`GET /dashboard/summary`, allocation, currency exposure, `GET /portfolios/:id/overview` return money as **decimal strings** (`nav`, `pnl`, `cashBalance`, …).

### Portfolio cash split (A11)
Overview adds `cashBalance`, `cashPct`, `securitiesValue` (strings; null when unknown — FE must not invent).

### List envelopes (A2)
Prefer `{ items, page, pageSize, total, totalPages }` for: orders, trades, blotters, model portfolios, setup brokers/custodians/funds/currencies/commissions/countries/markets/issuers/price-sources, compliance runs/results.

### Settings (A20)
`GET /setup/settings` returns a **flat map** `{ four_eye_orders: … }` — never `{ items: […] }`.

### Compliance results (A7)
`GET /compliance/results` — paged flat items:

```json
{
  "id": "cr_1",
  "orderId": "ord_1",
  "orderRef": "ORD-…",
  "fundId": "fund_1",
  "instrumentTicker": "DELTA",
  "side": "BUY",
  "ruleId": "rule_1",
  "ruleName": "Maximum single-security exposure",
  "ruleType": "SECURITY_EXPOSURE",
  "limitDisplay": null,
  "currentDisplay": null,
  "afterTradeDisplay": null,
  "outcome": "BREACH",
  "createdAt": "…"
}
```

Also still: `GET /compliance/runs`, `GET /orders/:id` embeds `complianceRuns`.

### Orders / trades enrichment (A9)
List items include `brokerName`, `custodianName`, `fundName` / nested `fund`, `filledQuantity`, `taxes`, `fees`, `feesBreakdown`. Trades are paged.

### Model portfolios (A10)
`PATCH /model-portfolios/:id` supports `name`, `allocations`, optional `linkedFundId`. Create accepts `linkedFundId`.

### Transactions (A12)
Canonical fields (both names): `transactionType`/`type`, `transactionRef`/`tradeRef`, `quantity`, `price`/`unitPrice`, `netAmount` (strings), paged.

### Instruments (A13)
`GET /instruments` items include `latestPrice`, `pricedAt` when a security-linked approved tick exists.

### Valuation (A14–A16, A21)
Exception actions already live. `GET /valuation/runs/:id/inputs` returns `{ inputs, prices, fxRates }`. Run list/detail/summary include `realizedPnl`, `unrealizedPnl`, `totalPnl`.

### Accounting / docs (A17–A19)
Journal post/submit/approve, reversals, ledger-exports, document `fileId` upload + versions — already shipped; confirm Idempotency-Key on mutating posts.

### Fund limits (A22)
`GET/PUT /setup/funds/:id/limits` (Phase1) already exists.

### Error codes (A4)
Stable codes used in envelopes:

| code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Bad input (often with `details.field` / `fields`) |
| `UNAUTHORIZED` | 401 | Auth missing/invalid |
| `FORBIDDEN` | 403 | Capability denied |
| `NOT_FOUND` | 404 | Missing resource |
| `VERSION_CONFLICT` | 409 | Optimistic lock / expectedVersion |
| `IDEMPOTENCY_REPLAY` / replayed body | 200/201 | Same Idempotency-Key returns prior result |
| `INVALID_STATUS` | 409 | Illegal lifecycle transition |
| `ORDER_NOT_EDITABLE` | 409 | Draft-only edit |
| `INSTRUMENT_NOT_FOUND` | 404 | … |

FE may toast `message` and optionally surface `code`.

---

## Part B — cash recon

### Workspace (B1)
`GET /reconciliation-batches/:id/workspace` returns nested `internal` / `external` / `results` **and** flat aliases `unmatchedInternal`, `unmatchedExternal`, `matches`, `breaks`, `suggested`. Entry rows include `id` and `lineId`.

### Fund cash summary (B2)
Includes `totalCash`, `matchedCount`, `unmatchedCount`, `breakCount`, `exceptionCount`, `openBreaks`, `matchRate`, `trendVsPrior7d`.

### Status enums (B3)

**Batch:** `OPEN`, `RUNNING`, `READY`, `CLOSED`  
**Import:** `PENDING`, `VALIDATED`, `VALIDATION_FAILED`, `PENDING_APPROVAL`, `COMMITTED`, `REJECTED`  
**Match link:** `PROPOSED`, `CONFIRMED`, `REJECTED`  
**Exception severity:** `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`  
**Exception status:** `OPEN`, `ASSIGNED`, `INVESTIGATING`, `PENDING_APPROVAL`, `INFO_REQUESTED`, `CLOSED`, `REJECTED`

### Cash ledger (B4/B10/B11)
`GET /cash-ledger?accountPurpose=TRADING|FUND&view=LINES|JOURNALS`  
Default `view=LINES` — flat rows with `debit`, `credit`, `balance`, `runningBalance`, `accountPurpose`.

### Daily movement (B9)
`GET /cash-overview/daily-movement?from=&to=&currency=&portfolioId=&cashAccountId=`  
→ `{ items: [{ date, net, close }] }`

### Broker workspace (B5/B14)
`queueCounts: { new, potential, matched, exception, escalated }`, flat `items[]`, plus `internalAmount` / `brokerAmount` / `custodianAmount` / refs.

### Exceptions (B6/B13)
Item `overdue` boolean; summary includes `criticalExceptions`, `overdueApprovals`, `pendingAdjustments`, `straightThroughMatchRate` and aliases `criticalAmount`, `overdue`, `stpRate`, `matchRate`.

### Statements (B7/B12/B15–B17)
- List promotes `periodFrom`, `periodTo`, `cashAccountId`, `clientOrVehicleId`, `currency`, `statementType`
- Generate accepts `cashAccountIds[]` (batch) or single `cashAccountId`; field-level 400 on missing picker fields
- Summary: `clientCashCovered`, `periodMovements`, `accountsInScope`, counts
- Preview: `previewHtml` + `sections.movements[]`
- Download: JSON by default; `Accept: application/pdf` returns `contentBase64` (+ `downloadUrl: null` until object storage)

---

## Verify (smoke)

1. `GET /dashboard/summary` → string `nav`/`pnl`
2. `GET /portfolios/:id/overview` → `cashBalance` / `cashPct`
3. `GET /compliance/results` → paged
4. `GET /setup/brokers` → full stakeholder fields in `items`
5. `GET /setup/settings` → object map (not list)
6. `GET /cash-ledger?accountPurpose=FUND&view=LINES` → `runningBalance`
7. `GET /cash-overview/daily-movement` → series
8. `GET /reconciliation-batches/:id/workspace` → nested + flat
9. `GET /fund-cash-summary` → `matchRate` / `totalCash`
10. `GET /broker-custodian/workspace` → `queueCounts` + amounts
