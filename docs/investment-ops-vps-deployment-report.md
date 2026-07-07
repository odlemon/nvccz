# Investment Operations — VPS deployment report

**Date:** 2026-07-07  
**Commit:** `0e0906b` — Add Investment Operations v2 with SRD gap remediation  
**Dev API:** https://dev-api.arcus.co.zw/api  
**Swagger UI:** https://dev-api.arcus.co.zw/api-docs (tag: **Investment Operations**)

## Migrations (all 3 databases)

| Database | Role | `investment-ops-v2` | `investment-ops-gap` |
|----------|------|---------------------|----------------------|
| `nts` | Dev | Applied (tables existed / skipped) | Applied |
| `client1_db` | Prod | Applied (fresh tables) | Applied |
| `demo_env` | Demo | Applied + instrument backfill | Applied |

Script: `python scripts/run-investment-ops-migration-all-dbs-vps.py`

## Deploy

- `nts` + `client1` — `git pull`, `npm i`, `npm run build`, `pm2 restart all`
- Health: `GET /health` → 200 OK, database connected

## Verification results

| Suite | Result |
|-------|--------|
| `npm run verify:investment-ops:swagger-vps` | 42/42 passed (after `/api-docs` HTML spec check fix) |
| `UAT_BASE_URL=https://dev-api.arcus.co.zw/api npm run uat:investment-ops:full` | 11/11 passed |
| `UAT_BASE_URL=https://dev-api.arcus.co.zw/api npm run uat:investment-ops:core` | 9/9 passed |

## Endpoints exercised on VPS

- Dashboard: summary (MTD), allocation, currency exposure, funds
- Portfolios: list, overview, holdings, transactions, exposure
- Instruments: types, list (paginated), get by id
- Market data: latest, stale, validation queue, ingest batches
- Orders: list, preview
- Trades: enriched blotter
- Compliance rules, model portfolios
- Valuation run + exceptions
- Reconciliation run + CSV upload + batches
- Accounting events + journals
- Reports: PDF generate
- Setup: brokers, custodians, commissions, markets, currencies, countries, issuers, price sources, settings

## Known gaps (SRD vs deployed backend)

These are **documented limitations**, not deployment failures:

| Area | Status |
|------|--------|
| Full order→execute→settle E2E on VPS | Not run in smoke (requires approved instrument + broker config + GL accounts) |
| External custodian file matching | CSV upload works; match quality depends on custodian file format |
| Multi-asset allocation beyond equities | Schema + buckets exist; non-equity positions not yet populated |
| FIFO / async valuation | API supports flags; not exercised in VPS smoke |
| Frontend SRD UI | Out of scope (backend only) |
| `/health` deploy marker string | Still shows June 2026 marker text (cosmetic; code is current) |

## Re-run commands

```bash
# Migrations on all 3 VPS DBs
python scripts/run-investment-ops-migration-all-dbs-vps.py

# Deploy
python scripts/deploy_vps.py

# Verify
npm run verify:investment-ops:swagger-vps
UAT_BASE_URL=https://dev-api.arcus.co.zw/api npm run uat:investment-ops:full
```
