# Investments V2 — rich Arcus demo seed

**Date:** 2026-07-20  
**DB:** DEV `nts` only

## Commands

```powershell
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
npm run db:reset:investments-v2-demo
```

## What you get (one book: Arcus Listed Portfolio)

| Area | Approx counts |
| --- | --- |
| Instruments / holdings | 8 ZSE names (CBZ, DLTA, FBC, ECO, SEED, BAT, OKZ, INN) |
| Trades | 10 SETTLED + 2 ROUTING (Confirm queue) |
| Orders | Full lifecycle (DRAFT→SENT) with `idempotencyKey` + trade links |
| Transactions | One POSTED row per settled trade |
| Valuation | COMPLETED run + 8 item snapshots (positions tab) |
| Recon | Holdings batch + 5 items |
| Accounting | POSTED events from trades |
| Documents / reports | 5 docs + 4 completed report runs |
| Blotters | Today OPEN + yesterday CLOSED |
| Models / sims | Arcus ZSE Core Model + 3 scenarios |
| Prices queue | 2× `PENDING_REVIEW` ticks |
| Cash | CBZ custody account + USD_OPS ledger buffer |

No UAT/Swagger junk names.
