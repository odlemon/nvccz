# Arcus Investment Operations v2.0 — Backend Requirements

Companion to client SRD v2.0. Frontend design session: [`design-sessions/investment-operations.md`](../design-sessions/investment-operations.md). UI → endpoint matrix: [`investment-ops-api-by-ui-section.md`](./investment-ops-api-by-ui-section.md).

**Status:** Wave 1–4 backend under `/api/investment-ops`. Legacy `/api/investments/*` routes remain as aliases.

**Database:** MySQL via Prisma + idempotent migration `npm run db:migrate:investment-ops-v2`.

---

## Broker and custodian glossary

| Term | Meaning | Examples |
|------|---------|----------|
| **Broker** | Execution counterparty — places buy/sell orders at the exchange | Imara Capital, Morgan & Co, IH Securities (ZSE); Interactive Brokers (US) |
| **Custodian** | Safekeeping and settlement — holds securities, receives settlement instructions | CABS Custody, Stanbic Custody, Coronation |
| **Core banking** | Trust/cash account — liquidity holds via cashbook | Fund trust bank account |
| **Accounting (GL)** | General ledger — balanced journal entries on settlement | COA 1210 listed securities, 1105 clearing |

---

## API base path

All UI facades: **`/api/investment-ops`**

Legacy aliases (deprecated): `/api/investments/market-data`, `/portfolio`, `/trades`

Swagger tag: **Investment Operations**

---

## Navigation → endpoint groups (SRD §4)

| Nav module | Base path |
|------------|-----------|
| Dashboard | `/dashboard` |
| Portfolios | `/portfolios` |
| Orders | `/orders`, `/trades` |
| Compliance | `/compliance` |
| Simulation | `/simulation` |
| Model portfolios | `/model-portfolios` |
| Valuation | `/valuation` |
| Reconciliation | `/reconciliation` |
| Accounting | `/accounting` |
| Documentation | `/documents` |
| Reporting | `/reports` |
| Setup | `/setup` |
| Market data | `/market-data` |

---

## Roles (SRD §3)

Mapped to existing Arcus roles where possible: `admin`, `fund_manager`, `ceo`, `cfo` plus compliance via `compliance_officer` permission flag on order approval routes.

---

## Accounting facade principle

Investment Operations **does not duplicate** journal lines. `GET /accounting/events` and `/journals` query `JournalEntry` + `ListedEquityTradeSettlement` filtered by `referenceNumber` prefix `LE-` or `investment_accounting_events.source_type`.

---

## Delivery waves

See implementation plan. Waves 1–4 tables created in single migration; features enabled per service layer.

---

*Document version: 2.0 — aligns with client SRD v2.0*
