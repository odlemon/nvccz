# Investments V2 — Frontend handoff

Use the single API document:

→ **[investments-v2-api.md](./investments-v2-api.md)**

That file has every `/api/investment-ops` endpoint with permission, headers, query, **request body**, and **response body**.

### FE gap closure (wiring blockers)

Contract answers for money strings, paged lists, compliance results, cash workspace KPIs, ledger `accountPurpose`, statements, etc.:

→ **[investments-v2-fe-gap-closure.md](./investments-v2-fe-gap-closure.md)**

E2E audit BE answers (New Position = no API, P&L = same runs, exception comments, posting-status, fund config keys):

→ **[investments-v2-e2e-be-answers.md](./investments-v2-e2e-be-answers.md)**

Post FE full-page scan (portfolios create, securityId on instrument create, overrides list, send-to-broker):

→ **[investments-v2-be-scan-answers.md](./investments-v2-be-scan-answers.md)**

**Module done (T0/T1 BE answers + T0 seed):**

→ **[investments-v2-module-completion.md](./investments-v2-module-completion.md)**

### Stock Picker Cash (cash / ledger / recon UI)

For **cash accounts, ledger, statement import, cash reconciliation, exceptions, period close, and client statements** under `/investments-v2/reconciliation` (cash tabs), use:

→ **[stock-picker-cash-api.md](./stock-picker-cash-api.md)** (`/api/investment-ops/*` cash routes — not `/api/v1/stock-picker`)

Do **not** wire cash matching to `/api/investment-ops/reconciliation/*` — that path group is Investments V2 holdings/trade recon.

**UI:** `/investments-v2`  
**API base:** `/api/investment-ops`  
**Auth:** `Authorization: Bearer <token>`
