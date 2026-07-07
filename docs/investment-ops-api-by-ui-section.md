# Investment Operations — API by UI Section

Screen → endpoint mapping for frontend handoff. Base: `https://{host}/api/investment-ops`

---

## Dashboard (SRD §5)

| Screen element | Method | Path |
|----------------|--------|------|
| Portfolio summary table | GET | `/dashboard/summary?period=` |
| Asset allocation card | GET | `/dashboard/allocation?fundId=` |
| Currency exposure card | GET | `/dashboard/currency-exposure?fundId=` |
| Funds table | GET | `/dashboard/funds` |
| Recalculate | POST | `/dashboard/recalculate` body: `{ fundId? }` |

---

## Portfolios (SRD §6)

| Screen | Method | Path |
|--------|--------|------|
| List portfolios | GET | `/portfolios` |
| Create portfolio link | POST | `/portfolios` |
| Overview | GET | `/portfolios/:fundId/overview` |
| Holdings / positions | GET | `/portfolios/:fundId/holdings` |
| Transactions | GET | `/portfolios/:fundId/transactions` |
| Recalculate | POST | `/portfolios/:fundId/recalculate` |
| Exposure breakdown | GET | `/portfolios/:fundId/exposure` |

---

## Instruments (SRD §7) — under Portfolios → Instruments

| Screen | Method | Path |
|--------|--------|------|
| List instruments | GET | `/instruments?type=&exchange=&status=` |
| Create | POST | `/instruments` |
| Update | PUT | `/instruments/:id` |
| Approve | POST | `/instruments/:id/approve` |
| Instrument types | GET | `/instruments/types` |

---

## Market data (SRD §7.4–7.5)

| Screen | Method | Path |
|--------|--------|------|
| Latest prices | GET | `/market-data/prices/latest` |
| Security history | GET | `/market-data/securities/:id/prices` |
| Manual upload | POST | `/market-data/prices/upload` |
| Manual entry | POST | `/market-data/prices/manual` |
| Stale prices | GET | `/market-data/prices/stale` |
| Validation queue | GET | `/market-data/validation-queue` |
| Approve / reject tick | POST | `/market-data/validation-queue/:tickId/approve` |
| Ingest run | POST | `/market-data/ingest/run` |
| Batches | GET | `/market-data/ingest/batches` |

---

## Orders (SRD §8)

| Screen | Method | Path |
|--------|--------|------|
| Orderbook (tab filter) | GET | `/orders?status=` |
| Create order | POST | `/orders` |
| Submit | POST | `/orders/:id/submit` |
| Approve | POST | `/orders/:id/approve` |
| Reject | POST | `/orders/:id/reject` |
| Cancel | POST | `/orders/:id/cancel` |
| Compliance check | POST | `/orders/:id/compliance-check` |

---

## Trade blotter (SRD §8.6)

| Screen | Method | Path |
|--------|--------|------|
| List trades | GET | `/trades` |
| Trade detail | GET | `/trades/:id` |
| Execute | POST | `/trades/:id/execute` |
| Routing hops | GET | `/trades/:id/routing-hops` |
| Settlement PDF | GET | `/trades/:id/settlement-document` |

---

## Compliance (SRD §9)

| Screen | Method | Path |
|--------|--------|------|
| Rules list | GET | `/compliance/rules?fundId=` |
| Create rule | POST | `/compliance/rules` |
| Override | POST | `/compliance/overrides` |

---

## Simulation (SRD §9.3)

| Screen | Method | Path |
|--------|--------|------|
| Run simulation | POST | `/simulation/run` |
| Get result | GET | `/simulation/runs/:id` |

---

## Model portfolios (SRD §9.4)

| Screen | Method | Path |
|--------|--------|------|
| List | GET | `/model-portfolios` |
| Create | POST | `/model-portfolios` |
| Drift vs live | GET | `/model-portfolios/:id/drift?fundId=` |

---

## Valuation (SRD §10)

| Screen | Method | Path |
|--------|--------|------|
| Run valuation | POST | `/valuation/runs` |
| Run status | GET | `/valuation/runs/:id` |
| Exceptions | GET | `/valuation/exceptions?fundId=` |

---

## Reconciliation (SRD §11.1)

| Screen | Method | Path |
|--------|--------|------|
| Run | POST | `/reconciliation/run` |
| Batches | GET | `/reconciliation/batches` |
| Batch detail | GET | `/reconciliation/batches/:id` |
| Resolve item | POST | `/reconciliation/items/:id/resolve` |

---

## Accounting (SRD §11.2)

| Screen | Method | Path |
|--------|--------|------|
| Events list | GET | `/accounting/events?fundId=&status=` |
| Journals list | GET | `/accounting/journals?fundId=` |
| Journal detail | GET | `/accounting/journals/:id` |
| Reverse event | POST | `/accounting/events/:id/reverse` |

---

## Documentation (SRD §12.2)

| Screen | Method | Path |
|--------|--------|------|
| List | GET | `/documents?fundId=&type=` |
| Upload | POST | `/documents` |
| Download | GET | `/documents/:id/download` |

---

## Reporting (SRD §12.1)

| Screen | Method | Path |
|--------|--------|------|
| Generate | POST | `/reports/generate` |
| Download | GET | `/reports/:id/download` |

---

## Setup (SRD §12.3)

| Screen | Method | Path |
|--------|--------|------|
| Brokers | GET/POST | `/setup/brokers` |
| Custodians | GET/POST | `/setup/custodians` |
| Commissions | GET/POST | `/setup/commissions` |
| Markets | GET/POST | `/setup/markets` |
| Currencies | GET | `/setup/currencies` |
| Price sources + heartbeat | GET | `/setup/price-sources` |
| System settings | GET/PUT | `/setup/settings` |

---

*All authenticated routes: Bearer JWT unless noted (webhooks on `/market-data/webhooks/:providerCode` use HMAC).*
