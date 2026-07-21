# Investments V2 — Module completion (BE single source of truth)

**Date:** 2026-07-20  
**Audience:** Backend + Frontend + Product  
**Base:** `/api/investment-ops`  
**This file supersedes parallel asks for BE status.** FE Part B (F1–F13) remains FE-owned.

Historical: `investments-v2-be-scan-answers.md`, `investments-v2-e2e-be-answers.md`, `investments-v2-fe-gap-closure.md`

---

## Definition

| Tier | Meaning |
| --- | --- |
| **T0** | Create→trade + cash recon smoke |
| **T1** | Every sidebar route usable with real API data |
| **T2** | Polish / optional |

---

## BE response (filled)

```text
A1 seed/migrate: DONE | npm run db:reset:investments-v2-demo  (clear UAT + lean real Arcus demo on nts)
A2 POST /portfolios canonical: ALREADY | GET /portfolios lists new fund; POST /setup/funds also OK (parity)
A3 listedEquitySecurityId on create: ALREADY | always assigned on POST /instruments
A4 instrument submit/approve version: ALREADY | body/If-Match expectedVersion; returns status + auditVersion
A5 validation-queue version: ALREADY | tick.version; approve/reject require expectedVersion
A6 send-to-broker body: empty OK | Idempotency-Key optional (auto-minted if missing); defaults venue/broker
A7 cash masters seed: DONE | included in db:seed:investments-v2-t0 (+ fund-linked cash account)
A8 GET /compliance/overrides: ALREADY | paged items with id,orderId,reason,status,createdAt,createdByName
A9 transaction linked ids: DONE | tradeId,journalEntryId,documentId; valuationRunId always null today
A10 setup PATCH + subcategories: ALREADY | tags/CA/instrument-types PATCH need expectedVersion; subcategories live
A11 setup enrichment: ALREADY | brokers/custodians name+contact+status; currencies decimalPlaces/decimals (not on brokers)
A12 document download: ALREADY | format: file stream (Content-Disposition); FE downloadDocument already exists
A13 accounting workflow: submit→approve→post supported; posting-status: ALREADY; ledger-exports: POST create then GET download
A14 valuation inputs/PnL: ALREADY | runs include realizedPnl/unrealizedPnl/totalPnl; inputs return prices+fxRates
A15 reporting: ALREADY | templates/generate/download; seed creates sample report fixture on demo fund
A16 exception fileId pipeline: ALREADY | same upload-session→/files→complete→POST …/attachments {fileId}
A17 order→trade UAT path: APPROVED → POST /orders/:id/execute (expectedVersion; Idempotency-Key optional)
             → creates listedEquityTrade + sets order.tradeId → Blotter Confirm → Settle
             Optional: send-to-broker first; execute also auto-routes if still APPROVED
P1 Manual position UI: WONT for T1 | API exists: POST /portfolios/:fundId/transactions/manual-adjustments
P2 Holdings recon in V2 sidebar: WONT for T1 | keep §22 /reconciliation/* separate from cash
P3 Cash period close / GL screens: WONT for T1 | APIs exist; FE later
P4 Recon Export/Columns: WONT | hide in FE
P5 Instrument restrict/archive UI: WONT for T1 | APIs exist; FE optional (F11)
```

---

Leaves nonempty (rich Arcus book): 8 ZSE instruments/holdings, 12 trades (10 settled + 2 routing), 8 orders, 10 transactions, valuation run + items, recon, accounting, docs/reports, blotters, model/sims, PENDING_REVIEW prices, cash masters.

---

## Part B reminder (FE — do not wait on BE)

F1–F13 from the module-completion ask remain FE wiring against existing OpenAPI.

---

## A17 detail (blotter smoke)

1. Place order → Submit → Approve  
2. `POST /orders/:id/execute` with `expectedVersion` (Idempotency-Key optional)  
3. Order gains `tradeId`; blotter lists trade  
4. `POST /trades/:id/confirm` then settle/post as already wired  

Do **not** expect send-to-broker alone to create a blotter trade.

---

## After this

1. FE runs T0 checklist against seeded `nts`  
2. FE closes Part B F1–F13  
3. Hide P4 Export buttons  
4. Mark IDs closed in this file — avoid a third parallel asks doc

---

## UX polish enrichments (2026-07-20)

| # | Ask | Status |
| --- | --- | --- |
| 1 | Positions/holdings nested `instrument` | **DONE** — `GET …/holdings`, `GET …/positions`, `GET /positions/:id` |
| 2 | `GET /instruments` → `createdByName` | **DONE** — list + detail |
| 3 | Overview income KPIs | **DONE** — `dividendIncome`, `interestIncome`, `marginUsed` (null until margin model) |
| 4 | Exposure `bySector`, `byCountry` | **DONE** — alongside `byExchange` |
| 5 | Price queue `reviewable` + `PENDING_REVIEW` approve | **DONE** — `GET /market-data/validation-queue`; approve/reject accepts queue status |
| 6 | Import `canSubmit` / `canValidate` / `canCommit` | **DONE** — on `GET /external-statements/imports/:id` |

**UAT:** `npm run uat:investments-v2:ux-polish` (DEV `nts`, live login)

---

## Walkthrough backend asks (2026-07-20)

Full report: [`docs/investments-v2-walkthrough-backend-asks-2026-07-20.md`](./investments-v2-walkthrough-backend-asks-2026-07-20.md)

| ID | Status |
| --- | --- |
| BA-1 cash-ledger purpose filters | **DONE** |
| BA-2 execute latency + `tradeId` | **DONE** (~36s, top-level `tradeId`) |
| BA-3 OPEN recon exceptions | **DONE** |
| BA-6 DRAFT/SUBMITTED seed | **DONE** |
| BA-T1 compliance SRD six + `srdLabel` | **DONE** |
| BA-T2 PARTIALLY_EXECUTED / PENDING_SETTLEMENT | **DONE** |
| BA-T3 STOP/STOP_LIMIT + settlement/approval route fields | **DONE** |
| BA-T4 fail + archive | **DONE** |
| BA-R1 import maker-checker + control totals | **DONE** |
| BA-R5 OPEN exceptions (same as BA-3) | **DONE** |
| BA-R6 CBZ_CSV_V1 + line errors + dup hash | **DONE** |
| BA-R7 recon display labels (no cuid in tables) | **DONE** |
| BA-5 / BA-R8 statement PDF binary download | **DONE** |
| Break mark-reviewed + match confirm/unmatch harden | **DONE** — exception id heals break; confirm accepts flat body; reverse/unmatch + 30s tx |
| BA-R2 score components | **PARTIAL** |
| BA-4 / BA-7 / BA-8 / BA-9 / BA-R3 / BA-R4 | Can wait — see report |

**UAT:** `uat:investments-v2:walkthrough` · `trading-asks` · `recon-asks` · `recon-labels-pdf` · `recon-breaks-match`
