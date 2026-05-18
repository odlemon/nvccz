# Portfolio monitoring: valuation events & exit management

Single API base for §2.4 monitoring features:

**`{{baseUrl}}/api/investments/{{investmentImplementationId}}/...`**

`investmentImplementationId` = `InvestmentImplementation.id` from  
`GET /api/investment-implementations/{{portfolioCompanyId}}` → `data.id`.

Auth: JWT + role `admin` | `fund_manager` | `ceo` | `cfo`.

DB: `npm run db:migrate:investment-valuation-exit` then `npx prisma generate`.

---

## Valuations

| Method | Path | Body |
|--------|------|------|
| GET | `/api/investments/:investmentImplementationId/valuations` | — |
| POST | `/api/investments/:investmentImplementationId/valuations` | `valuationDate`, `valuationType`, `valuationAmount`, **`currencyId`** (required), optional `notes` |
| PATCH | `/api/investments/:investmentImplementationId/valuations/:valuationEventId` | partial fields |
| DELETE | `/api/investments/:investmentImplementationId/valuations/:valuationEventId` | — |

`valuationType`: `POST_MONEY` | `FAIR_MARKET_VALUE` | `PRE_MONEY` | `OTHER`

---

## Exit

| Method | Path | Body |
|--------|------|------|
| GET | `/api/investments/:investmentImplementationId/exit` | `data: []` if none, `[{ ... }]` if one exit exists |
| POST | `/api/investments/:investmentImplementationId/exit` | `exitDate`, `exitType`, `exitProceedsAmount`, **`currencyId`** (required), optional `notes` |
| DELETE | `/api/investments/:investmentImplementationId/exit` | — |

Sets `investment_implementations.status` and `portfolio_companies.status` to `EXITED`. IRR/ROI from APPROVED+DISBURSED disbursements.

---

## Postman example (create valuation)

```
POST http://localhost:3009/api/investments/{{investmentImplementationId}}/valuations
Authorization: Bearer {{jwt}}
Content-Type: application/json

{
  "valuationDate": "2026-03-31",
  "valuationType": "FAIR_MARKET_VALUE",
  "valuationAmount": 12500000,
  "currencyId": "cmh3bymy70000una4yk8leusu",
  "notes": "Q1 test"
}
```

**Do not** use `portfolioCompanyId` in this path. **Do not** use `/investment-implementations/by-implementation/...` (removed).

---

## Code

- Routes: `src/routes/investmentMonitoringRoutes.ts`
- Mount: `app.use("/api/investments", ...)` in `src/app.ts`
- Service: `src/services/InvestmentMonitoringService.ts`
