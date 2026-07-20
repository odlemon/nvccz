# Investment Operations — Swagger audit results

> **Superseded snapshot (2026-07-07).** Current contract: [investments-v2-api.md](./investments-v2-api.md). Re-run `npm run verify:investment-ops:swagger-vps` after migrate-verify for live counts.

**Date:** 2026-07-07  
**Commit:** `1fcb082` — Investment Operations Swagger audit: full spec, strict VPS verify  
**Swagger UI:** https://dev-api.arcus.co.zw/api-docs#/  
**Tag:** Investment Operations  
**Dev API:** https://dev-api.arcus.co.zw/api

## Summary

| Check | Result |
|-------|--------|
| Routes in `investmentOpsRoutes.ts` | **89** |
| Operations in `investment-ops-swagger-paths.ts` | **89** (parity ✓) |
| Strict HTTP verify (`npm run verify:investment-ops:swagger-vps`) | **91/91 passed** (includes auth + swagger parity rows) |
| Browser spot-check: `GET /investment-ops/accounting/journals` | **200**, `success: true`, **11 journals** (with Authorize) |
| Browser without Authorize | **401 Unauthorized** (confirmed by strict verify per endpoint) |

## Authorize instructions (required for Try it out)

1. Open https://dev-api.arcus.co.zw/api-docs#/
2. Confirm server is **`https://dev-api.arcus.co.zw/api`**
3. Click **Authorize** (top right)
4. Paste JWT from `POST /auth/login` (`admin@nts.com` on dev) as the bearer value
5. Expand **Investment Operations** → operation → **Try it out** → **Execute**

Without step 3–4, protected endpoints return `{"success":false,"message":"Unauthorized"}` and Swagger shows no useful response body.

## Browser audit (spot-checks)

Automated strict verify covers all 89 routes; browser walkthrough focused on the reported failure and representative POST examples.

| Operation | Auth | HTTP | Notes |
|-----------|------|------|-------|
| `GET /investment-ops/accounting/journals` | No | 401 | Proves Authorize is required |
| `GET /investment-ops/accounting/journals` | Yes | 200 | `data.length = 11`, journal lines + COA included |
| `POST /investment-ops/orders/preview` | Yes | 200 | Example body with `fundId`, `instrumentId`, `side`, `quantity`, `executionPrice` |
| `POST /investment-ops/simulation/run` | Yes | 201 | Requires `scenario: { side, instrumentId, quantity, price }` |
| `POST /investment-ops/model-portfolios` | Yes | 201 | Allocations use `allocationType` + `allocationKey` (not `instrumentTypeCode`) |
| `GET /investment-ops/documents/{id}/download` | Yes | 502 | Storage backend on VPS; metadata upload works (201) |

## Intentional empty / skipped / business-rule responses

| Endpoint | Behavior | Documented as |
|----------|----------|---------------|
| `GET /investment-ops/documents` | May be `[]` | Allowed empty |
| `POST /investment-ops/market-data/prices/upload` | 400 Source CSV disabled | Settings gate; not a Swagger bug |
| `POST /investment-ops/orders` | 403 FORBIDDEN_FUND_ACCESS | Admin token lacks create on seeded fund; preview still works |
| `POST /investment-ops/trades/{id}/execute` | 400 SETTLEMENT_FAILED | Trade already in terminal state |
| `POST /investment-ops/accounting/events/{id}/reverse` | 400 No journal to reverse | Event has no linked JE on dev |

## Swagger spec improvements (this audit)

- All IO paths use `SWAGGER_JSON_RESPONSES` for Try-it-out response schemas
- Query params: `fundId`, `page`, `pageSize`, `period` where applicable
- POST bodies include `jsonRequestBody` examples (orders preview, valuation, recon, reports, setup)
- Previously missing routes added (tick approve/reject, security prices, ingest batch detail, trade hops, simulation get, model portfolio create, journal by id, documents, setup POSTs, etc.)

## Re-run

```bash
npm run verify:investment-ops:swagger-vps
# alias:
npm run verify:investment-ops:swagger-vps:strict
```

Results JSON: `tmp-investment-ops-swagger-vps-results.json`
