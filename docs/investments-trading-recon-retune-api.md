# Investments V2 — Trading & Reconciliation retune API

**Date:** 2026-07-21  
**Module:** Investments V2 (`/api/investment-ops`)  
**Audience:** Frontend + backend  
**Product rule:** Digitise the **asset manager’s books and controls**; the **broker stays outside**. Record instructions + confirmations, book executed trades, settle via custodian, reconcile three ways.

Related: [investments-trading-recon-client-retune-backend-asks.md](./investments-trading-recon-client-retune-backend-asks.md) (BA-TR-*/BA-RC-*).

**FE status:** Wired — orderbook live confirmations (BA-TR-2); Phase-1 custodian auth on Send + blotter settle; trade-recon batch wizard at `/reconciliation/trade` (BA-RC-1); blotter recon-summary CTA (BA-TR-4). Phase-2: outbound custodian instruction message.

---

## Lifecycle (orderbook → blotter)

```text
DRAFT → SUBMITTED → APPROVED → SENT_TO_BROKER
  → BROKER_CONFIRMATION_RECORDED (optional status; confirmation entity is source of truth)
  → Accept confirmation → EXECUTED (+ trade on blotter)
  → POST /trades/:id/settle → order SETTLED, trade settlementStatus SETTLED
```

| Screen | Contains |
|--------|----------|
| **Orderbook** | Pending orders (`DRAFT` … `BROKER_CONFIRMATION_RECORDED`, `PARTIALLY_EXECUTED`) |
| **Trade blotter** | Executed LE trades only (`EXECUTED` / `ROUTING` / `SETTLED` / `SETTLEMENT_FAILED`) — never drafts |

**Deprecate as primary FE path:** `POST /orders/:id/execute` with ad-hoc fill. Prefer **Record confirmation → Accept**. Legacy execute remains for back-compat / internal accept implementation.

---

## BA-TR-1 — Send to broker

`POST /api/investment-ops/orders/:id/send-to-broker`

Headers: `Authorization`, `Idempotency-Key`, `If-Match` **or** `body.expectedVersion`

```json
{
  "expectedVersion": 3,
  "sentAt": "2026-07-21T14:00:00.000Z",
  "channel": "EMAIL",
  "notes": "Instruction emailed to ABC Brokers",
  "venueCode": "ZSE",
  "brokerProfileId": null,
  "custodianProfileId": "cust_…",
  "custodianId": "cust_…",
  "valueDate": "2026-07-23",
  "settlementAccountId": "settle-usd-001"
}
```

`custodianId` is an alias for `custodianProfileId`. Phase-1 custodian auth fields are persisted on the order at send (outbound instruction message = Phase-2, not this wave).

**Response `200`:**

```json
{
  "success": true,
  "data": {
    "order": {
      "id": "…",
      "status": "SENT_TO_BROKER",
      "sentToBrokerAt": "2026-07-21T14:00:00.000Z",
      "sentToBrokerChannel": "EMAIL",
      "sentToBrokerNotes": "Instruction emailed to ABC Brokers",
      "version": 4
    },
    "route": { "id": "…", "status": "ROUTED" }
  }
}
```

Errors: `409` version / not approved; `422` invalid transition.

**FE:** After send, order stays on orderbook. **Do not** expect a blotter row.

---

## BA-TR-2 — Broker confirmation

### Record

`POST /api/investment-ops/orders/:id/broker-confirmations`

```json
{
  "expectedVersion": 4,
  "outcome": "FILLED",
  "quantity": "1000",
  "price": "10.00",
  "currencyCode": "USD",
  "brokerReference": "BRK-8821",
  "tradeDate": "2026-07-21",
  "valueDate": "2026-07-23",
  "notes": "Filled at limit",
  "attachmentFileId": null
}
```

`outcome`: `FILLED` | `COUNTER` | `UNABLE` | `PARTIAL`

Order → `BROKER_CONFIRMATION_RECORDED` (from `SENT_TO_BROKER`).

### List

`GET /api/investment-ops/orders/:id/broker-confirmations`

### Accept → creates trade

`POST /api/investment-ops/orders/:id/broker-confirmations/:confirmationId/accept`

```json
{ "expectedVersion": 5 }
```

Response:

```json
{
  "success": true,
  "data": {
    "order": { "id": "…", "status": "EXECUTED", "tradeId": "…" },
    "trade": {
      "id": "…",
      "orderId": "…",
      "orderRef": "ORD-…",
      "quantity": "1000",
      "price": "10.00",
      "status": "EXECUTED",
      "settlementStatus": "PENDING_SETTLEMENT"
    },
    "confirmation": { "id": "…", "status": "ACCEPTED" }
  }
}
```

Partial fill (`quantity` < order qty) → order `PARTIALLY_EXECUTED`.

### Reject

`POST /api/investment-ops/orders/:id/broker-confirmations/:confirmationId/reject`

```json
{ "expectedVersion": 5, "reason": "Price too high — keep looking" }
```

Order returns to `SENT_TO_BROKER`. No blotter row.

---

## BA-TR-3 — Blotter + custodian settle

### List trades (executed only)

`GET /api/investment-ops/trades?fundId=&status=&page=&pageSize=`

Default filter excludes `DRAFT` / `CANCELLED`. Each item includes:

- `orderId`, `orderRef` (BA-T5)
- `brokerId` / `brokerName`, `custodianId` / `custodianName`
- `quantity`, `price` / `executionPrice`, `tradeDate`, `valueDate`
- `settlementStatus`: `PENDING_SETTLEMENT` | `SETTLED` | …

### Settle (custodian)

`POST /api/investment-ops/trades/:id/settle`

```json
{
  "expectedVersion": 2,
  "settledAt": "2026-07-23T16:00:00.000Z",
  "custodianReference": "CSD-99102",
  "allowDeferredAccounting": true
}
```

**Response:** `{ order, trade }` — order `SETTLED` (BA-T6), trade `settlementStatus: "SETTLED"`.

Optional confirm (terms locked): existing `POST /trades/:id/confirm`.

---

## BA-TR-4 — Blotter → recon handoff

`GET /api/investment-ops/trades/:id/reconciliation-summary`

```json
{
  "tradeId": "…",
  "internalMatched": true,
  "brokerStatementMatched": false,
  "custodianMatched": false,
  "openExceptionIds": [],
  "deepLink": "/investments-v2/reconciliation?tab=trade&tradeId=…"
}
```

**FE CTA:** navigate to `data.deepLink` (or `/investments-v2/reconciliation?tab=trade&tradeId={id}`).

---

## BA-RC-1 — Trade 3-way recon

Namespace: **`/api/investment-ops/trade-reconciliation/*`**  
(Distinct from cash `/reconciliation-batches` and holdings `/reconciliation/*`.)

| Method | Path |
|--------|------|
| GET | `/trade-reconciliation/templates` |
| POST | `/trade-reconciliation/batches` `{ fundId, asOfDate, brokerTemplateCode?, custodianTemplateCode? }` |
| GET | `/trade-reconciliation/batches/:id` |
| POST | `/trade-reconciliation/batches/:id/ingest-broker` `{ csvText, templateCode? }` |
| POST | `/trade-reconciliation/batches/:id/ingest-custodian` `{ csvText, templateCode? }` |
| POST | `/trade-reconciliation/batches/:id/run-match` |
| POST | `/trade-reconciliation/batches/:id/complete` |
| POST | `/trade-reconciliation/exceptions/:id/manual-match` |
| POST | `/trade-reconciliation/exceptions/:id/write-off` `{ reason }` |

Exception codes: `QTY_MISMATCH`, `PRICE_MISMATCH`, `MISSING_INTERNAL`, `MISSING_BROKER`, `MISSING_CUSTODIAN`, `DUPLICATE`.

CSV columns (default templates): `symbol,side,quantity,price,trade_date,broker_ref|custodian_ref,currency`.

---

## BA-RC-2 — Cash recon

Fund cash engine unchanged (`stock-picker-cash-api` / flat cash paths).

- `sp_cash_journals.trade_id` links settlement cash to blotter trades.
- `POST /trades/:id/settle` backfills `tradeId` on journals whose `sourceEventId` / idempotency key matches the trade.
- Filter ledger: `GET /cash-ledger?tradeId={id}&fundId=` (also `portfolioId`, date range).
- Label UI as **Cash reconciliation**.

---

## BA-RC-3 — Client account recon

`GET /api/investment-ops/client-account-reconciliation?fundId=`

Read-only: holdings vs sum of **SETTLED** trades; `breaks[]` when variance ≠ 0.

---

## BA-RC-4 — Statement templates

`GET /trade-reconciliation/templates` — registry (`BROKER_ZSE_CSV_V1`, `CUSTODIAN_CSD_CSV_V1`).

Demo files:

- `public/demo-templates/trade-recon/broker-happy.csv`
- `public/demo-templates/trade-recon/broker-qty-mismatch.csv` (1000 vs 900 story)
- `public/demo-templates/trade-recon/broker-missing.csv`
- Same trio for `custodian-*.csv`

---

## FE wiring checklist

1. [x] Orderbook actions: **Send to broker → Record confirmation → Accept / Reject**.
2. [x] Hide primary “Execute (create trade)” without confirmation (legacy `executeOrder` kept on API client / Redux only).
3. [x] Blotter empty states / copy = executed trades only.
4. [x] Settlement labels = **custodian** (+ settle modal: `settledAt`, required `custodianReference`).
5. [x] Recon home tabs: **Trade | Cash | Client** — Trade → `/reconciliation/trade` batch wizard.
6. [x] Blotter CTA → `GET …/reconciliation-summary` then deep-link (fallback `reconDeepLink` → `/reconciliation/trade`).
7. [x] Clients: `lib/api/investment-ops-api.ts` — confirmation + trade-recon + client-account methods.
8. [x] Phase-1 custodian auth on Send (custodian + value date + settlement account shown).
9. [x] Broker email instruction + magic-link reply (PO-style email via ZeptoMail; public `/broker-instruction/:token`).
10. [ ] Custodian outbound settlement instruction (same pattern later; SWIFT later).

**Public broker reply**

| Method | Path |
|--------|------|
| GET | `/api/investment-ops/public/broker-instructions/:token` |
| POST | `/api/investment-ops/public/broker-instructions/:token/reply` `{ outcome, quantity?, price?, notes?, proceed?, brokerReference? }` |
| GET | `/api/investment-ops/orders/:id/broker-messages` (auth) |

`POST …/send-to-broker` now returns `instruction: { replyUrl, status, toEmail, deliveryError }`. Optional body `brokerEmail` overrides profile inbox.

---

## Verify

```powershell
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
npm run db:migrate:investments-trading-recon-retune
npm run db:migrate:investments-broker-instruction-email
npx prisma generate
npm run dev   # separate terminal
npm run uat:investments-v2:trading-recon-retune
```

Walkthrough:

1. Create → Submit → Approve → Send to broker (set broker email) → **email + reply link**.
2. Open `/broker-instruction/{token}` → Counter / Unable / Filled.
3. On orderbook: Accept → trade on blotter.
4. Settle → order + trade Settled.
5. Import broker 900 vs internal 1000 → `QTY_MISMATCH`.
6. Happy ingest → match → complete batch.

---

## npm scripts

| Script | Purpose |
|--------|---------|
| `db:migrate:investments-trading-recon-retune` | Idempotent DDL |
| `db:migrate:investments-trading-recon-retune:all-dbs` | nts + client1_db + demo_env |
| `db:migrate:investments-broker-instruction-email` | Broker instruction + message log tables |
| `uat:investments-v2:trading-recon-retune` | HTTP acceptance on DEV `nts` |
