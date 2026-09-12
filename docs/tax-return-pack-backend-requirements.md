# Tax Return Pack — backend requirements

Design session: [`design-sessions/tax-return-pack.md`](../design-sessions/tax-return-pack.md)

**Status:** Phase 2 Section 3.15 — ZIMRA tax return pack generation engine.

| Item | Value |
|------|-------|
| Swagger tag | `Tax Return Pack` |
| Base path | `/api/tax-return-packs/*` |
| Entity anchor | `ForecastEntity` |

---

## 1. Architectural pillars

1. **Fiducially verified GL integration** — values from posted journals only; corrections via adjusting entries.
2. **Historical dual-currency reconciliation** — transaction-date FX (`ZIMRATE_STREET`).
3. **Maker-checker governance** — compiler ≠ checker on sign-off.

---

## 2. Functional requirements

### US-3.15.1 — Tax return compilation initialization

- `POST` with `forecastEntityId`, `taxYear`, `taxPeriod` (`ANNUAL` \| `Q1`–`Q4`), `baseCurrency`, `taxRegime` (`ZIMRA_CIT`), optional `fundId`.
- Pull closed ledger actuals grouped by tax categories on compile.
- Block if unposted journals exist in period (`blockers[]`).

### US-3.15.2 — ITF 12C and CGT schedules

- CIT reconciliation: accounting profit + add-backs − deductions; rate 24%.
- CGT: 2.5%/year indexation; rate 20% unlisted.
- USD / ZiG liability split on summary.

### US-3.15.3 — Dual-currency cost basis

- FX at transaction date via `QuarterlyStatementFxService`.
- Weighted ETR (Eq. 6) on dashboard.

### US-3.15.4 — Maker-checker and cryptographic locking

- `DRAFT_REVIEW` until checker `sign-off`.
- `SIGNED_OFF`: lock schedules, PDF + SHA-256, GL Dr 5500 / Cr 2210, LP portal `TAX` category when `fundId` set.

---

## 3. Formulas

- \(I_{taxable} = P_{accounting} + \sum D_i - \sum E_j\)
- \(L_{CIT} = I_{taxable} \times 0.24\)
- \(C_{adjusted} = C_{original} \times (1 + 0.025 \times t_{years})\)
- \(G_{capital} = \max(0, S_{price} - C_{adjusted})\)
- \(L_{CGT} = G_{capital} \times 0.20\)
- \(ETR_{weighted} = \frac{T_{USD} R_{closing} + T_{ZiG}}{I_{USD} R_{closing} + I_{ZiG}} \times 100\%\)

---

## 4. Data model

| Table | Purpose |
|-------|---------|
| `tax_return_packs` | Pack header |
| `tax_return_pack_reconciliation_lines` | ITF 12C lines |
| `tax_return_pack_cgt_lines` | CGT schedule |
| `tax_return_pack_ledger_snapshots` | Frozen GL + FX |
| `tax_return_pack_line_overrides` | Manual tax reclassification |
| `tax_adjustment_rules` | Default account → tax category |
| `tax_return_pack_audit_events` | Audit trail |

Migration: `npm run db:migrate:tax-return-pack`

COA seed: `5500` Corporate Tax Expense, `2210` Corporate Tax Liabilities — ZIMRA.

---

## 5. API specification

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/tax-return-packs` | List / provision |
| GET | `/tax-return-packs/:packId` | Detail + summary |
| GET | `/tax-return-packs/:packId/dashboard` | Reconciliation + CGT panes |
| POST | `/tax-return-packs/:packId/compile` | GL sync + recompute |
| GET | `/tax-return-packs/:packId/reconciliation` | ITF 12C lines |
| PATCH | `/tax-return-packs/:packId/reconciliation/:lineId` | Tax category override |
| GET | `/tax-return-packs/:packId/cgt` | CGT schedule |
| POST | `/tax-return-packs/:packId/submit-review` | Maker submit |
| POST | `/tax-return-packs/:packId/sign-off` | Checker finalize |
| GET | `/tax-return-packs/:packId/pdf` | Download PDF |
| GET | `/tax-return-packs/:packId/audit` | Audit trail |

---

## 6. Integrations

| Module | Integration |
|--------|-------------|
| General Ledger | `AccountingGlPeriodTotalsService`, `JournalEntryService` |
| Cap Table / Assets | CGT from disposals + listed equity sells |
| LP Portal §3.4 | `LpPortalVaultService.publishDocument` category `TAX` |
| FX | `QuarterlyStatementFxService` / `ZIMRATE_STREET` |

---

## 7. v1 limitations

- **EXTERNAL_STARTUP CIT:** Full ITF 12C requires INTERNAL_SUBSIDIARY (singleton GP GL); investees get CGT + limited reconciliation.
- **Withholding allocations:** Out of v1 scope.

---

## 8. UAT

- `npm run uat:tax-return-pack:core`
- `npm run uat:tax-return-pack:signoff`
- `npm run uat:tax-return-pack:preflight`
