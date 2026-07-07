# Investment Operations — VPS deployment report

**Date:** 2026-07-07  
**Commit:** `1fcb082` — Investment Operations Swagger audit: full spec, strict VPS verify  
**Dev API:** https://dev-api.arcus.co.zw/api  
**Swagger UI:** https://dev-api.arcus.co.zw/api-docs (tag: **Investment Operations**)

## Swagger completeness checklist

| Item | Count / status |
|------|----------------|
| Routes in `investmentOpsRoutes.ts` | **89** |
| Operations in `investment-ops-swagger-paths.ts` | **89** ✓ |
| Strict verify matrix | **89** endpoints + auth + swagger parity |
| `SWAGGER_JSON_RESPONSES` on all IO ops | ✓ |
| POST `requestBody` examples | ✓ (orders preview, valuation, recon, reports, setup, …) |
| Browser audit doc | `docs/investment-ops-swagger-audit-results.md` |

## Authorize before Try it out

Swagger UI does **not** auto-login. For any **Investment Operations** endpoint:

1. `POST /auth/login` → copy JWT  
2. Swagger → **Authorize** → paste token  
3. **Try it out** → **Execute**

Without Authorize, e.g. `GET /investment-ops/accounting/journals` returns `401 Unauthorized` (not an empty success).

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
| `npm run verify:investment-ops:swagger-vps` | **91/91 passed** (strict: 401 without token, shape + data assertions) |
| `npm run verify:investment-ops:swagger-browser` | Journals Authorize UX checks |
| `UAT_BASE_URL=https://dev-api.arcus.co.zw/api npm run uat:investment-ops:full` | 11/11 passed |
| `UAT_BASE_URL=https://dev-api.arcus.co.zw/api npm run uat:investment-ops:core` | 9/9 passed |

See **Swagger audit:** `docs/investment-ops-swagger-audit-results.md`

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

# Verify (strict)
npm run verify:investment-ops:swagger-vps
npm run verify:investment-ops:swagger-browser
UAT_BASE_URL=https://dev-api.arcus.co.zw/api npm run uat:investment-ops:full
```
