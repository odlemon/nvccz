# Deal Execution Pack — backend requirements

Design session: [`design-sessions/deal-execution-pack.md`](../design-sessions/deal-execution-pack.md)

**Status:** Phase 2 Section 3.11 — portfolio equity closing workspace.

| Item | Value |
|------|-------|
| Swagger tag | `Deal Execution Pack` |
| Base path | `/api/deal-execution-packs/*` |

---

## 1. Architectural pillars

1. **Strict completion safeguards** — execute blocked unless mandatory docs, CPs, and signatures complete.
2. **Cryptographic hash preservation** — SHA-256 on every upload; verify before download.
3. **Traceable version evolution** — audit ledger for upload, CP satisfy, sign, execute.

---

## 2. Functional requirements

### US-3.11.1 — Automated closing pack creation

- Manual `POST` with `fundId`, `portfolioCompanyId`, optional `applicationId`, `transactionType`.
- Auto-provision hook when application enters `ACTIVE_DD` or term sheet fully signed (if `InvestmentImplementation` links portfolio company).
- Seed mandatory slots: `SPA`, `SHA`, `SUBSCRIPTION`, `BOARD_RESOLUTION`, `CLOSING_CHECKLIST`.
- Idempotent per `(fundId, portfolioCompanyId, applicationId?)`.

### US-3.11.2 — CP tracker

- Weighted checklist; satisfy requires assigned verification owner.
- Status `PENDING` | `SATISFIED`; audit on satisfy.

### US-3.11.3 — Document versioning

- Upload increments version; prior → `SUPERSEDED`.
- SHA-256 stored on upload; verify endpoint; download blocked on mismatch.

### US-3.11.4 — Final sign-off

- Execute blocked unless \(R_{legal} = 1\).
- On `EXECUTED`: lock pack, closing summary PDF, cap table DRAFT issuances, GL Dr 1502 / Cr 1000.

---

## 3. Formulas

- **I_CP:** \((\sum w_i C_i / \sum w_i) \times 100\%\) — execute requires 100%.
- **R_legal:** product of mandatory doc integrity, signature flags, and \(I_{CP}=100\%\).

---

## 4. Data model

| Table | Purpose |
|-------|---------|
| `deal_execution_packs` | Pack header |
| `deal_execution_pack_document_slots` | Slot definitions |
| `deal_execution_pack_documents` | Versioned files |
| `deal_execution_pack_cps` | Conditions precedent |
| `deal_execution_pack_signatures` | Role sign-offs |
| `deal_execution_pack_audit_events` | Immutable audit |

Migration: `npm run db:migrate:deal-execution-pack`

COA seed: `1502` Investment Asset, `1000` Cash Operating.

---

## 5. API specification

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/deal-execution-packs` | List / create |
| GET | `/deal-execution-packs/:packId` | Detail |
| GET | `/deal-execution-packs/:packId/dashboard` | I_CP, R_legal, doc/sig summary |
| GET | `…/documents` | List slots + active versions |
| POST | `…/documents/:slotCode/upload` | Multipart upload |
| GET | `…/documents/:documentId/verify` | SHA-256 check |
| GET | `…/documents/:documentId/download` | Download (integrity gate) |
| GET/POST | `…/cps` | List / add CP |
| PATCH | `…/cps/:cpId` | Update CP |
| POST | `…/cps/:cpId/satisfy` | Owner satisfy |
| GET | `…/signatures` | List signatories |
| POST | `…/signatures/:signatureId/sign` | Record sign-off |
| POST | `…/execute` | Final execute |
| GET | `…/audit` | Audit trail |

---

## 6. Integrations

| Module | Integration |
|--------|-------------|
| Cap Table §3.8 | `DealExecutionPackIntegration.onDealPackClosed` on EXECUTED |
| Accounting | `DealExecutionPackGlPostingService` Dr 1502 / Cr 1000 |
| Application workflow | Auto-provision hook on `ACTIVE_DD` / term sheet signed |
| Fundraising §3.9 | Out of scope for v1 auto-trigger |

---

## 7. UAT

- `npm run uat:deal-execution-pack:core`
- `npm run uat:deal-execution-pack:gate`
- `npm run uat:deal-execution-pack:execute`
