# Quarterly Client Statements — backend requirements

Design session: [`design-sessions/quarterly-client-statements.md`](../design-sessions/quarterly-client-statements.md)

**Status:** Phase 2 Section 3.6 — automated quarterly LP statements with maker-checker, dual-currency, portal publish.

| Item | Value |
|------|-------|
| Swagger tag | `Quarterly Client Statements` |
| Base path | `/api/quarterly-statements/*` |

Parallel module (does not replace [`fund-performance-reporting-backend-requirements.md`](./fund-performance-reporting-backend-requirements.md)).

---

## 1. Architectural pillars

1. **Immutable ledger sync** — statements from frozen snapshots; no manual metric edits.
2. **Dual-currency temporal matching** — tx-date FX for history; quarter-end spot for NAV.
3. **Strict multi-tenant isolation** — per-LP compile; fund-scoped RBAC.

---

## 2. Functional requirements

### US-3.6.1 — Batch initiation

- Select fund, financial year, calendar quarter (Q1–Q4).
- Freeze ledger data for period on compile.
- Block if unposted fund-linked journals exist in period.
- Default status `COMPILING`.

### US-3.6.2 — Performance ratios

- NAV at quarter-end per LP.
- Net IRR via dated cashflows (Newton-Raphson).
- DPI, TVPI, RVPI to **four decimal places**.

### US-3.6.3 — Dual-currency

- Historical tx amounts at transaction-date rates.
- NAV at quarter-end spot rate.
- USD and ZiG columns in snapshot JSON.

### US-3.6.4 — Checker approval & portal

- Maker compile → `REVIEW`; checker approve → `COMPLETED`.
- Checker must differ from maker (admin bypass for UAT).
- PDF + SHA-256 → storage → LP Portal vault (`QUARTERLY_STATEMENT`).

---

## 3. Formulas

- DPI = ΣD_dist / ΣC_called
- RVPI = NAV_ending / ΣC_called
- TVPI = DPI + RVPI
- Net IRR: NPV of cashflows + terminal NAV = 0 (365-day basis)
- A_base,i = A_i × R_i (tx-date); NAV_base = NAV × R_end

---

## 4. Data model

| Table | Purpose |
|-------|---------|
| `quarterly_statement_runs` | Batch header |
| `quarterly_statement_recipients` | Per-LP metrics + PDF |
| `quarterly_statement_ledger_snapshots` | Frozen ledger lines |
| `quarterly_statement_audit_events` | Audit trail |

Migration: `npm run db:migrate:quarterly-client-statements`

**Spec mapping:** `trust_cashbook_ledger` → `cashbook_entries` + capital-call/distribution allocations.

---

## 5. API specification

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/quarterly-statements/runs` | List / create |
| GET | `/quarterly-statements/runs/:runId` | Detail |
| POST | `/quarterly-statements/runs/:runId/compile` | Preflight + freeze + metrics |
| GET | `/quarterly-statements/runs/:runId/recipients` | LP list |
| GET | `/quarterly-statements/runs/:runId/recipients/:clientId/preview` | Preview |
| POST | `/quarterly-statements/runs/:runId/recipients/:clientId/recompute` | Recompute (REVIEW only) |
| POST | `/quarterly-statements/runs/:runId/submit-review` | Maker submit |
| POST | `/quarterly-statements/runs/:runId/approve` | Checker approve + publish |
| GET | `/quarterly-statements/runs/:runId/dashboard` | Batch summary |

---

## 6. RBAC

| Action | Roles |
|--------|-------|
| View | admin, fund_manager, cfo, IR signals |
| Compile / submit | admin, fund_manager, IR |
| Approve | admin, cfo, executive partner signals |

---

## 7. Testing

- `npm run uat:quarterly-statements:core`
- `npm run uat:quarterly-statements:rbac`
- `npm run uat:quarterly-statements:approve`
- `npm run test:quarterly-statements`
