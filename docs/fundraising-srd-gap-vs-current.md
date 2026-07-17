# Fundraising SRD v1 — gap vs current backend

**SRD:** [`fundraising-ir-mandate-srd-v1.md`](./fundraising-ir-mandate-srd-v1.md)  
**API:** [`fundraising-srd-api.md`](./fundraising-srd-api.md)

Updated after full SRD expansion on `feature/fundraising`.

## Shipped (canonical non-versioned mounts)

| Area | Status |
|------|--------|
| `/api/fundraising` + `/api/investors` (no `/v1`) | Done |
| Opportunities as canonical pipeline + board | Done |
| Investor 360 + contact patch/archive | Done |
| Opportunity checklists + amount reason required | Done |
| Communications, tasks, commitments, closings | Done |
| Mandates / RFPs / commercial terms / approvals | Done |
| DDQ, KYC cases, data rooms, agreements/signatories | Done |
| Placement agents, forecasts, analytics, reports, audit | Done |
| Migration `db:migrate:fundraising-srd-expansion` (3 DBs) | Done |

## Remaining depth (iterate with FE)

| Area | Note |
|------|------|
| E-sign provider webhooks | Version + signatory records exist; external DocuSign not wired |
| Data-room watermark PDF render | Flags stored; full PDF watermark optional later |
| Calendar sync for meetings | Field/stub only |
| Placement-agent portal login scoping | Assignment table + RBAC extension as FE needs |
| Legacy deal retirement | Routes kept deprecated until data migrated |

## Guardrails

Still enforced: signed ≠ won ≠ cash; awarded ≠ activated AUM; server stage gates; immutable amount/stage history; no investor org duplication by design (single CRM entity).
