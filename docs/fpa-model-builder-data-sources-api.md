# FP&A Model Builder — data sources / seed-catalog (Arcus-owned)

**Date:** 2026-07-14  
**Audience:** FE + Backend

## Why

FE no longer offers NetSuite / Salesforce / Workday / Plaid / ADP. Seed and refresh use **Arcus-owned** source labels. Mapping CRUD still accepts any free-text `sourceSystem`.

## Default seed systems

`POST /v1/fpa/models/{modelId}/data-mappings/seed-catalog`

Empty / omitted `systems` seeds:

| Label | Sample field prefixes |
|-------|------------------------|
| Custom / CSV | `CSV.*` |
| Excel | `XLS.*` |
| API | `API.*` |
| Manual | `MANUAL.*` |
| Procurement | `PROC.*` |
| Fixed Assets | `FA.*` |
| Stock | `INV.*` |
| Portfolio | `PF.*` |
| Accounting GL | `GL_ACCOUNT.*` |
| Payroll | `PR.*` |
| CRM | `CRM.*` |
| Banking | `BANK.*` |
| Loan | `LOAN.*` |

**Blocked from seed** (ignored if sent): NetSuite GL, Salesforce, Workday HR, Plaid, ADP Payroll.

## Endpoints

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `…/data-mappings/seed-catalog` | Arcus catalog sample fields + fuzzy map suggestions |
| `POST` | `…/data-mappings/refresh` | Ensures **Accounting GL**; COA → `GL_ACCOUNT.{accountNo}` |
| `GET/POST/PUT/DELETE` | `…/data-mappings` | Free-text `sourceSystem` |

## File ingest

CSV / Excel upload ingest endpoints are **not** shipped yet — labels only. When ready, document under this file and leave FE create as label-only until then.

## Acceptance

1. Seed with FE systems list creates fields only for Arcus systems above.  
2. Default seed (no body) matches that list — not SaaS connectors.  
3. Mapping CRUD accepts any `sourceSystem` string.  
4. Existing demo rows with SaaS names may remain until remapped; new seed does not recreate them. Soft-rename on ensure/refresh maps legacy NetSuite→Accounting GL, Salesforce→CRM, Workday/ADP→Payroll, Plaid→Banking.
