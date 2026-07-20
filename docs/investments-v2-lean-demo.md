# Investments V2 — lean demo seed

**Date:** 2026-07-20  
**DB:** DEV `nts` only

## Commands

```powershell
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
npm run db:reset:investments-v2-demo
```

Or step-by-step:

```powershell
npm run db:clear:investments-v2
npm run db:seed:investments-v2-demo
```

## What clear does

- Removes UAT / Swagger / Verify junk (funds, securities, instruments, stakeholders)
- Deletes **extra** `LISTED_EQUITY` funds (keeps **Arcus Listed Portfolio** shell empty)
- Clears trades, orders, holdings, valuation, recon, accounting, docs, report runs on listed funds
- Clears SpCash demo accounts tied to those portfolios (keeps CBZ provider/layout if present)

Does **not** touch PE funds, users, banks, or shared instrument-type catalogs beyond junk rows.

Excess empty LISTED_EQUITY funds are deleted after detaching any `FundraisingCampaign.fundId` (Restrict FK).

## What lean seed creates

| Item | Count / names |
| --- | --- |
| Portfolio | 1 — Arcus Listed Portfolio |
| Instruments | 4 — DLTA, ECO, CBZ, INN (ACTIVE + `listedEquitySecurityId` + approved EOD mark) |
| Trades | 2 settled |
| Orders | 3 — DRAFT / APPROVED / SETTLED |
| Broker / custodian | Imara Edwards Securities / CBZ Custodial Services |
| Cash | 1 CBZ provider + layout + fund-linked custody cash account |
| Other | compliance rules, NAV snapshot, 1 pending ECO tick, mandate document |

Designed to be **fast** vs the old 8-fund presentation seed.
