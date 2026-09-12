# Pending database migrations by feature

Track migrations that are **written** but **not yet applied** when the DB/SSH host is unreachable.

When the server is back up, run each listed script against **dev (`nts`)**, **prod (`client1_db`)**, and **demo (`demo_env`)**, then re-run idempotently and mark the feature **APPLIED** below.

**Do not** use `prisma migrate dev` / `prisma db push` — use the TypeScript scripts only (see workspace rule `nvccz-database-no-prisma-migrate`).

---

## How to apply (when servers are up)

```bash
# Dev (default .env)
npm run db:migrate:<feature>

# Prod / demo — set DATABASE_URL first, or on VPS:
python scripts/run-cap-table-migration-all-dbs-vps.py   # cap table only
```

After each apply: `npx prisma generate`, re-run the same script (expect `[skip]`), then run the feature UAT scripts.

---

## Cap Table Management

| Status | **APPLIED** (2026-06-17 — dev `nts`, prod `client1_db`, demo `demo_env`) |
|--------|--------------------------------------------------------|

| # | Script | npm command | What it creates |
|---|--------|-------------|-----------------|
| A | `scripts/run-cap-table-management-migration.ts` | `npm run db:migrate:cap-table-management` | Tables: `cap_table_registries`, `cap_table_gl_mappings`, `cap_table_share_classes`, `cap_table_stakeholders`, `cap_table_convertible_instruments`, `cap_table_transactions`, `cap_table_transaction_lines`, `cap_table_option_grants` |
| B | *(same script)* | — | COA seed if missing: `3000` Share Capital, `3050` Share Premium, `1010` Bank USD Operating |

**Prisma:** models in `prisma/schema.prisma` (`CapTable*` — already in repo; `prisma generate` done locally).

**UAT after apply:** `npm run uat:cap-table:core`, `uat:cap-table:rbac`, `uat:cap-table:dilution`

**Deploy after apply:** `python scripts/deploy_vps.py` (per `.cursor/rules/nvccz-vps-deploy.mdc`)

---

## Fundraising LP Pipeline

| Status | **APPLIED** (2026-06-17 — dev `nts`, prod `client1_db`, demo `demo_env`) |

| # | Script | npm command | What it creates |
|---|--------|-------------|-----------------|
| A | `scripts/run-fundraising-lp-pipeline-migration.ts` | `npm run db:migrate:fundraising-lp-pipeline` | Tables: `fundraising_campaigns`, `fundraising_pipeline_stages`, `fundraising_stage_checklist_templates`, `fundraising_pipeline_deals`, `fundraising_deal_checklist_items`, `fundraising_deal_agreements`, `pipeline_interactions`, `fundraising_campaign_gl_mappings` |
| B | *(same script)* | — | COA seed if missing: `1125` AR LP Commitments, `3010` Partners Capital Committed |

**Prisma:** models in `prisma/schema.prisma` (`Fundraising*`, `PipelineInteraction`).

**UAT after apply:** `npm run uat:fundraising:core`, `uat:fundraising:rbac`, `uat:fundraising:close`

**Deploy after apply:** `python scripts/deploy_vps.py`

---

## Quarterly Client Statements

| Status | **APPLIED** (2026-06-17 — dev `nts`, prod `client1_db`, demo `demo_env`) |

| # | Script | npm command | What it creates |
|---|--------|-------------|-----------------|
| A | `scripts/run-quarterly-client-statements-migration.ts` | `npm run db:migrate:quarterly-client-statements` | Tables: `quarterly_statement_runs`, `quarterly_statement_recipients`, `quarterly_statement_ledger_snapshots`, `quarterly_statement_audit_events` |

**Prisma:** models in `prisma/schema.prisma` (`QuarterlyStatement*`).

**UAT after apply:** `npm run uat:quarterly-statements:core`, `uat:quarterly-statements:rbac`, `uat:quarterly-statements:approve`

**Deploy after apply:** `python scripts/deploy_vps.py`

---

## Deal Execution Pack

| Status | **APPLIED** (2026-07-03 — dev `nts`, prod `client1_db`, demo `demo_env`) |

| # | Script | npm command | What it creates |
|---|--------|-------------|-----------------|
| A | `scripts/run-deal-execution-pack-migration.ts` | `npm run db:migrate:deal-execution-pack` | Tables: `deal_execution_packs`, `deal_execution_pack_document_slots`, `deal_execution_pack_documents`, `deal_execution_pack_cps`, `deal_execution_pack_signatures`, `deal_execution_pack_audit_events` |
| B | *(same script)* | — | COA seed if missing: `1502` Investment Asset — Portfolio, `1000` Cash — Bank Operating |

**Prisma:** models in `prisma/schema.prisma` (`DealExecutionPack*`).

**UAT after apply:** `npm run uat:deal-execution-pack:core`, `uat:deal-execution-pack:gate`, `uat:deal-execution-pack:execute`

**Deploy after apply:** `python scripts/deploy_vps.py`

---

## Tax Return Pack

| Status | **APPLIED** (2026-07-03 — dev `nts` local); **PENDING VPS** push + `python scripts/run-tax-return-pack-migration-all-dbs-vps.py` |

| # | Script | npm command | What it creates |
|---|--------|-------------|-----------------|
| A | `scripts/run-tax-return-pack-migration.ts` | `npm run db:migrate:tax-return-pack` | Tables: `tax_return_packs`, `tax_return_pack_reconciliation_lines`, `tax_return_pack_cgt_lines`, `tax_return_pack_ledger_snapshots`, `tax_return_pack_line_overrides`, `tax_adjustment_rules`, `tax_return_pack_audit_events` |
| B | *(same script)* | — | COA seed if missing: `5500` Corporate Tax Expense, `2210` Corporate Tax Liabilities — ZIMRA; ZIMRA adjustment rule seeds |

**Prisma:** models in `prisma/schema.prisma` (`TaxReturnPack*`, `TaxAdjustmentRule`).

**UAT after apply:** `npm run uat:tax-return-pack:core`, `uat:tax-return-pack:signoff`, `uat:tax-return-pack:preflight`

**Deploy after apply:** `python scripts/deploy_vps.py`

---

## Other features (already applied — reference only)

| Feature | npm command | Notes |
|---------|-------------|-------|
| Investment Memo Editing | `db:migrate:investment-memo-editing` | Applied previously |
| LP Portal | `db:migrate:lp-portal` | Applied previously |
| Fund Performance Reporting | `db:migrate:fund-performance-reporting` | Applied previously |
| Street Exchange Rate Display | `db:migrate:street-exchange-rate-display` | Applied previously |

---

## Changelog

| Date | Feature | Action |
|------|---------|--------|
| 2026-06-28 | Cap Table Management | Migration script added; **not run** — server unreachable |
| 2026-06-17 | Cap Table Management | **Applied** on nts, client1_db, demo_env; idempotent re-run confirmed on dev |
| 2026-06-17 | Fundraising LP Pipeline | **Applied** on nts, client1_db, demo_env |
| 2026-06-17 | Quarterly Client Statements | Migration script added; **not run** yet |
| 2026-07-03 | Deal Execution Pack | **Applied** on nts, client1_db, demo_env |
| 2026-07-03 | Tax Return Pack | **Applied** on dev `nts` (local); VPS migrate pending code push |
