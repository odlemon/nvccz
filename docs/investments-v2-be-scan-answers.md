# Investments V2 — Backend answers (post FE full-page scan)

**Date:** 2026-07-20  
**Related FE ask:** `investments-v2-end-to-end-gaps` / Backend asks (post FE full-page scan)

---

## Ticket answers

### BE-SCAN-1 — `POST /portfolios` vs `POST /setup/funds`

| | |
| --- | --- |
| **Canonical for listed-equity books** | **`POST /api/investment-ops/portfolios`** (what Portfolio Setup uses) |
| **Also valid** | `POST /setup/funds` — same fund purpose (`LISTED_EQUITY`) + `listedEquityFundConfig`; now also creates `investmentPortfolioConfig` for parity |
| **GET** | `GET /portfolios` returns the new fund immediately when the creator is fund manager (or admin) |

**Verify:** Create via Portfolio Setup → fund id appears in place-order fund select.

---

### BE-SCAN-2 — `listedEquitySecurityId` on create

**Shipped:** `POST /instruments` **always** upserts a `listedEquitySecurity` and returns `listedEquitySecurityId` on the create response (even in `DRAFT`).

- Prefer `ticker` + `exchangeCode`
- Fallback: symbol from `instrumentCode`, exchange `OTC` (also backfills ticker/exchange on the instrument when missing)

**Verify:** Create instrument → Manual price dropdown includes ticker before Approve.

---

### BE-SCAN-3 — Compliance overrides list

**Exists + enriched:** `GET /api/investment-ops/compliance/overrides?fundId=&orderId=&status=&page=&pageSize=`

Paged envelope:

```json
{
  "items": [
    {
      "id": "cov_01",
      "orderId": "ord_01",
      "orderRef": "ORD-…",
      "fundId": "fund_01",
      "reason": "Mandate exception",
      "reasonCode": "…",
      "status": "PENDING",
      "createdAt": "…",
      "createdById": "…",
      "createdByName": "Ada",
      "version": 1
    }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 1,
  "totalPages": 1
}
```

FE: reload history from this endpoint (replace session-only list).

---

### BE-SCAN-4 — Instrument subcategories

**Already exists — enable FE:**

- `GET/POST /setup/instrument-subcategories`
- `GET/PATCH /setup/instrument-subcategories/:id` (+ `expectedVersion` / If-Match)
- `POST …/:id/archive`

Settings-backed catalog (same pattern as tags). Subcategory string on the instrument remains valid.

---

### BE-SCAN-5 — Setup catalog PATCH

| Resource | Method | `expectedVersion` |
| --- | --- | --- |
| Tags | `PATCH /setup/tags/:id` | **Required** (If-Match or body) |
| Corporate-action mappings | `PATCH /setup/corporate-action-mappings/:id` | **Required** |
| Corporate-action mappings (bulk) | `PUT /setup/corporate-action-mappings` | Not versioned (settings upsert) |
| Settings map | `PUT /setup/settings` | Not versioned (flat map upsert) |

Pencil edit-in-place should call the PATCH routes with version from list/get.

---

### BE-SCAN-6 — Transaction linked ids

`GET /portfolios/:fundId/transactions` items now include (honest nulls when unknown):

```json
{
  "id": "txn_01",
  "orderId": "…",
  "executionId": "…",
  "tradeId": "trd_01",
  "journalEntryId": "je_01",
  "documentId": "doc_01",
  "valuationRunId": null
}
```

`valuationRunId` is not stored on the transaction row today → always `null` until a future link.

---

### BE-SCAN-7 — Cash recon seed masters

**Already seeded** via `npm run db:seed:stock-picker-cash` on **nts**:

- Client cash accounts (`GET /client-cash-accounts`)
- Provider CBZ custody (`GET /setup/providers`)
- File layout `CBZ_CSV_V1` (`GET /setup/file-layouts`)

Re-run seed if Import Statements pickers are empty.

---

### BE-SCAN-8 — `send-to-broker`

**Still required headers:**

- `Idempotency-Key`
- `expectedVersion` (If-Match or body) — order must be `APPROVED`

**Body:** empty / minimal OK now.

Defaults if omitted:

- `venueCode` ← instrument `exchangeCode` → else trade currency → else `"MANUAL"`
- `brokerProfileId` ← order’s broker profile

Optional body still accepted: `{ "expectedVersion": "2", "venueCode": "ZSE", "brokerProfileId": "…" }`.

---

### BE-SCAN-9 — Export / Columns toolbar

**Product:** **Hide** in FE (no CSV export endpoints this turn). Not blocking create→trade.

---

## Create→trade UAT (BE side)

1. `POST /portfolios` → id in `GET /portfolios`
2. `POST /instruments` → has `listedEquitySecurityId` → submit → approve → `ACTIVE`
3. Manual price on that security → approve tick
4. Order preview → create → submit → approve → `send-to-broker` (version + idempotency)
5. Confirm/settle trade when execution exists
6. Optional: `npm run db:seed:stock-picker-cash` before Fund Cash import
