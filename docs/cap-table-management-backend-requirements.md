# Cap Table Management — backend requirements

Design session: [`design-sessions/cap-table-management.md`](../design-sessions/cap-table-management.md)

**Status:** Phase 2 Section 3.8 — immutable transaction ledger, dilution engine, GL sync, certificate generation. Deal Execution Pack integration is **placeholder**.

| Item | Value |
|------|-------|
| Swagger tag | `Cap Table Management` |
| Base path | `/api/cap-table/*` |

---

## 1. Architectural pillars

1. **Strict transactional ledger** — balances computed from `EXECUTED` transaction lines only; no manual balance overrides.
2. **Granular security** — fund-scoped RBAC; investees read own company only.
3. **Downstream sync** — on execute: GL journal, PDF certificate, `PortfolioCompany.capTable` snapshot, LP snapshot refresh when mapped.

---

## 2. Functional requirements (US-3.8.x)

### US-3.8.1 — Share class & ESOP

- Multiple share classes: par value, voting multiplier, seniority, liquidation multiplier, participating flag, `authorizedShares`.
- ESOP pools as `classType = OPTION_POOL` with granted/vested/exercised/cancelled via option grants.

### US-3.8.2 — Transaction ledger

- Types: `ISSUANCE`, `TRANSFER`, `CONVERSION`, `REPURCHASE`, `CANCELLATION`, `OPTION_EXERCISE`, `IMPORT`.
- Workflow: `DRAFT` → `PENDING_APPROVAL` → `EXECUTED` | `REJECTED`.
- Issuance requires: stakeholder, share class, quantity, price per share, issuance date, optional board resolution file URL.
- Transfer enforces seller balance ≥ quantity.
- Execution uses `SELECT … FOR UPDATE` on registry and share class rows.

### US-3.8.3 — Dilution sandbox

- Stateless `POST …/simulator/run` — inputs: preMoneyValuation, roundInvestment, optionPoolTopUpPct, convertible notes.
- Formulas §4.1–4.2 (fully diluted count, note conversion cap/discount min price).

### US-3.8.4 — GL & certificates

- On `ISSUANCE` execute: Dr Cash, Cr Share Capital (par), Cr Share Premium.
- Internal `JournalEntryService` (not HTTP Accounting API).
- PDF certificate with SHA-256 checksum stored on transaction.

---

## 3. Mathematical formulations

### 3.1 Fully diluted

$$S_{FD} = \sum_c S_{issued,c} + \sum_p O_{allocated,p} + N_{conversion}$$

$$\theta_s = \frac{\text{Shares Owned}_s + \text{Options Granted}_s}{S_{FD}} \times 100\%$$

### 3.2 Convertible note conversion

$$P_{note} = \min\left(\frac{Cap}{S_{pre}}, P_{round} \times (1 - D)\right)$$

$$N_{issued} = \frac{P + I}{P_{note}}, \quad I = P \times \left(r \times \frac{t}{365}\right)$$

### 3.3 Liquidation waterfall

Iterative seniority ladder per class: preferential return $R_c = M_c \times C_c \times S_{issued,c}$, payout $P_c = \min(V_{total}, R_c)$, participation pro-rata on remainder.

---

## 4. Data model

| Table | Purpose |
|-------|---------|
| `cap_table_registries` | 1:1 `portfolio_company_id` |
| `cap_table_share_classes` | Classes and ESOP pools |
| `cap_table_stakeholders` | Holders |
| `cap_table_convertible_instruments` | Notes |
| `cap_table_transactions` | Immutable events |
| `cap_table_transaction_lines` | Signed quantity deltas |
| `cap_table_option_grants` | ESOP grants |
| `cap_table_gl_mappings` | COA codes per registry |

**COA seed (migration):** `3000` Share Capital, `3050` Share Premium, `1010` Bank USD Operating (if missing).

Migration: `npm run db:migrate:cap-table-management`

---

## 5. API specification

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/cap-table/registries` | List registries (fund filter) |
| POST | `/cap-table/registries` | Bootstrap registry |
| GET | `/cap-table/registries/:portfolioCompanyId` | Registry detail |
| GET/POST/PATCH | `/cap-table/registries/:portfolioCompanyId/share-classes` | Share classes |
| GET/POST/PATCH | `/cap-table/registries/:portfolioCompanyId/stakeholders` | Stakeholders |
| GET/POST | `/cap-table/registries/:portfolioCompanyId/convertibles` | Convertible notes |
| GET/POST | `/cap-table/registries/:portfolioCompanyId/transactions` | Transactions |
| POST | `/cap-table/registries/:portfolioCompanyId/transactions/:id/submit` | Submit |
| POST | `…/transactions/:id/approve` | Approve |
| POST | `…/transactions/:id/reject` | Reject |
| POST | `…/transactions/:id/execute` | Execute (+ GL + cert) |
| GET | `/cap-table/registries/:portfolioCompanyId/register` | Consolidated view |
| POST | `/cap-table/registries/:portfolioCompanyId/simulator/run` | Dilution sandbox |
| POST | `/cap-table/registries/:portfolioCompanyId/waterfall/evaluate` | Exit waterfall |
| GET | `/cap-table/registries/:portfolioCompanyId/transactions/:id/certificate` | Download PDF |
| GET | `/cap-table/registries/:portfolioCompanyId/transactions/:id/certificate/verify` | SHA-256 verify |
| POST | `/cap-table/integrations/deal-execution/closed` | **Placeholder** — admin only |

---

## 6. RBAC

| Action | Roles |
|--------|-------|
| View | admin, fund_manager, CIO, board viewers, assigned analyst, investee (own company) |
| Configure classes | admin, legal counsel signals |
| Create/submit tx | admin, corporate secretary, fund_manager |
| Approve/execute | admin, CIO, CFO signals |
| Deal execution stub | admin only |

---

## 7. Cross-module integrations

### 7.1 Accounting GL

`CapTableGlPostingService` → `JournalEntryService.createManualJournalEntry` on issuance execute.

### 7.2 Deal Execution Pack (placeholder)

```typescript
export type DealExecutionClosedEvent = {
  dealExecutionPackId: string;
  portfolioCompanyId: string;
  closedAt: string;
  spaMetadata: Array<{
    shareClassCode: string;
    quantity: number;
    pricePerShare: number;
    investorStakeholderRef?: string;
  }>;
};
```

`DealExecutionPackIntegration.onDealPackClosed()` — stub creates DRAFT transactions; real module will call same hook.

### 7.3 LP Portal

`CapTableLpPortalHook` refreshes metric snapshots when stakeholder maps to `clientId`.

### 7.4 Portfolio dashboard

`CapTablePortfolioSyncService` writes compact JSON to `PortfolioCompany.capTable`.

---

## 8. Testing and UAT

- `npm run uat:cap-table:core`
- `npm run uat:cap-table:rbac`
- `npm run uat:cap-table:dilution`
- `npm run test:cap-table` — unit tests for dilution/waterfall/transfer validation

---

## 9. Swagger

Tag: **Cap Table Management**. Paths relative to `/api` (no `/api` prefix in path keys). Protected tag in `swagger-excluded-tags.ts`.
