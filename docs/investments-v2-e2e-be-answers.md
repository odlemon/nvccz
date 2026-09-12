# Investments V2 — E2E audit BE answers (2026-07-20)

Companion to FE end-to-end audit. Prior FE contract: [investments-v2-fe-gap-closure.md](./investments-v2-fe-gap-closure.md).

---

## Product decisions (locked)

| Ask | Decision |
| --- | --- |
| **BE-1** New Position | **No** `POST /holdings`. Holdings come from trades / valuation / ops adjustments. FE should remove or repurpose `NewPositionDialog`. Admin substitute (does not invent blotter positions): `POST /portfolios/:fundId/transactions/manual-adjustments` with `transactionType: POSITION_ADJUSTMENT`. |
| **BE-2** P&L runs | Same resource as NAV: `GET /valuation/runs` (+ `/:id/summary`). Runs already include `realizedPnl`, `unrealizedPnl`, `totalPnl`. No `/valuation/pnl-runs`. |
| **BE-4** Cash ledger Capital Calls / Dist / Fees / Docs tabs | **Not cash-owned.** FE should deep-link Fund Ops / LP capital modules. Cash domain stays ledger / recon / statements. |
| **BE-6** Coupon + icons | Real reference catalogs. `GET/POST /setup/coupon-frequencies` (existing) and `GET/POST /setup/icons` (settings-backed). |

---

## Implemented this delivery

### BE-3 Exception collaboration
- `GET/POST /reconciliation-exceptions/:id/comments` → `{ id, body, createdAt, authorId, authorName }`
- `GET/POST /reconciliation-exceptions/:id/attachments` → body `{ fileId, fileName?, note? }`
- `GET /reconciliation-exceptions/:id/audit` → timeline + cash audit events

### BE-5 Posting statuses
- `GET /accounting/posting-status?fundId=` → `{ byStatus, counts, total, recentFailures[] }`

### BE-6 Icons
- `GET/POST/PATCH /setup/icons` (+ archive) via reference catalog

### BE-7 Price history (confirm)
- `GET /market-data/prices/:securityId/history?from&to&page&pageSize`
- Returns paged ticks **and** `series: [{ pricedAt, price }]` (decimal string), `maxRangeDays: 365`

### BE-8 Fund config keys
On `PUT /setup/funds/:id/config` and `listedEquityFundConfig`:
- `costBasisMethod` (e.g. `WAC`, `FIFO`)
- `pricingSource`
- `settlementCycle` (e.g. `T+2`)
- `cutoffTime` (alias body key `cutoff` accepted)

### BE-9 Currency decimals
- `GET /setup/currencies` items include `decimalPlaces` and `decimals` (default `2`)

### BE-10 Owner / trader names
- Blotters: `ownerName`, `createdByName`, `createdById` (set on create)
- Orders: `ownerName`, `createdByName`

---

## Status vs FE audit (2026-07-20 refresh)

| Ask | BE status | FE next step |
| --- | --- | --- |
| BE-1 New Position | **Closed — no API** | Remove/repurpose local dialog |
| BE-2 P&L runs | **Closed — same `/valuation/runs`** | Bind P&L tab to same list + P&L fields |
| BE-3 Exception comments/attachments/audit | **Shipped** | Wire stub tabs to new routes |
| BE-4 Capital Calls / Dist / Fees / Docs | **Closed — deep-link** | Link out; do not call cash API |
| BE-5 Posting Statuses | **Shipped** | Call `GET /accounting/posting-status` |
| BE-6 Coupon + icons | **Shipped** (`/setup/coupon-frequencies`, `/setup/icons`) | Replace local prototypes |
| BE-7 Price history series | **Shipped** (`series[]` + `maxRangeDays`) | Prefer `data.series` for sparkline |
| BE-8 Fund config keys | **Shipped** on `PUT …/config` | Persist cost basis / settlement / cutoff |
| BE-9 Currency decimals | **Shipped** | Map `decimalPlaces` / `decimals` |
| BE-10 Owner names | **Shipped** | Map `ownerName` / `createdByName` |

FE-1…FE-10 write paths are FE-owned (audit Part 1 marks most wired). Remaining create→read holes are mostly **FE adapters on the BE routes above** + seeded tradeable instruments/prices.

### Caveats (honest)

1. **Audit doc is self-contradictory:** Part 1 says FE-1…FE-9 wired; the page scorecard + “FE files still local” footer still describe older local state. Trust Part 1 for FE writes.
2. **Long `investments-v2-api.md` / FE `investments api.md` lag code** for some newer shapes. Prefer this file + live routes for BE-3…BE-10.
3. **Swagger had a hole:** `/setup/icons` was routed in Express but missing from `investment-ops-swagger-paths.ts` (coupon-frequencies was present). Icons swagger entries are now added.
4. **DDL verified on `nts`:** `currencies.decimal_places`, fund config keys, `investment_blotters.created_by_id` present.

---

## Migrate

```bash
npm run db:migrate:investments-v2-e2e-be-gap:all-dbs
# then unset DATABASE_URL; npx prisma generate
```
