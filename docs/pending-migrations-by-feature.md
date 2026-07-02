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
