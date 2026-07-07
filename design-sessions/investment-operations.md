# Arcus Investment Operations — Frontend Design Session

Backend contract: [`docs/investment-ops-backend-requirements.md`](../docs/investment-ops-backend-requirements.md) · Screen → API: [`docs/investment-ops-api-by-ui-section.md`](../docs/investment-ops-api-by-ui-section.md)

---

## Purpose

Institutional investment operations terminal (SRD v2.0) — not a narrow stock price collector. Dark high-density hedge-fund UI with left nav rail per client wireframes.

---

## Left navigation (SRD §4)

| Module | Route suggestion |
|--------|------------------|
| Dashboard | `/investment-ops/dashboard` |
| Portfolios | `/investment-ops/portfolios` |
| Orders | `/investment-ops/orders` |
| Reconciliation | `/investment-ops/reconciliation` |
| Valuation | `/investment-ops/valuation` |
| Reporting | `/investment-ops/reporting` |
| Documentation | `/investment-ops/documents` |
| Accounting | `/investment-ops/accounting` |
| Setup | `/investment-ops/setup` |

Wire each screen to endpoints in the API-by-UI-section doc. Swagger tag: **Investment Operations**.

---

## Broker vs custodian (UI copy)

- **Broker node** — execution firm; show DISPATCHED until confirmation received.
- **Custodian node** — settlement/safekeeping; may show **Skipped (internal mode)** when custodian integration disabled.
- **Accounting tab** — read-only list of module journals; link opens core accounting JE detail.

---

## Design tokens

Same as prior market terminal spec: `#070A13` shell, `#0E1626` cards, JetBrains Mono for numerics, green/red P&L.

---

*Version 2.0 — replaces stock-price-collector design session for new builds*
