# Fundraising & Investor Relations — Full SRD API

**Audience:** Frontend / integration  
**SRD:** [`fundraising-ir-mandate-srd-v1.md`](./fundraising-ir-mandate-srd-v1.md)  
**Base:** `{host}/api` — **no API versioning**  
**Auth:** `Authorization: Bearer <token>`  
**Envelope:** `{ "success": true, "data": … }` / `{ "success": false, "error": { "code", "message", … } }`

## Mounts

| Prefix | Purpose |
|--------|---------|
| `/api/fundraising` | Campaigns, opportunities, pipeline board, communications, tasks, commitments, closings, mandates, RFPs, DDQ, KYC, data rooms, agreements, placement agents, forecasts, analytics, reports, audit |
| `/api/investors` | Investor organisations, contacts, 360°, relationship summary |
| `/api/fundraising/deals/*` | **Deprecated** — legacy LP deal cards (compat / migration only) |

## Guardrails (server-enforced)

1. Signed document ≠ deal won  
2. Signed commitment ≠ cash received  
3. Awarded mandate ≠ activated AUM  
4. Stage moves validated server-side (`STAGE_GATE_FAILED` + `unmetRequirements`)  
5. Amount changes require `reason` / `amountReason` + history row  
6. Compliance blocks Admit / Fund / Activate when KYC/sanctions blocked  

## Campaigns

| Method | Path |
|--------|------|
| GET/POST | `/fundraising/campaigns` |
| GET/PATCH | `/fundraising/campaigns/:campaignId` |
| POST | `/fundraising/campaigns/:campaignId/activate` |
| GET | `/fundraising/campaigns/:campaignId/dashboard` |
| GET | `/fundraising/campaigns/:campaignId/board` |
| GET | `/fundraising/campaigns/:campaignId/metrics` |

Create → `DRAFT` / `PENDING` + PE/VC (13) or AM (13) stages. Activate → `ACTIVE` / `APPROVED`.

## Opportunities

| Method | Path |
|--------|------|
| GET/POST | `/fundraising/opportunities` |
| GET/PATCH | `/fundraising/opportunities/:opportunityId` |
| POST | `…/transition` · `…/assign` · `…/mark-lost` · `…/set-status` |
| GET | `…/timeline` · `…/checklist` |
| PATCH | `…/checklist` |

## Investors

| Method | Path |
|--------|------|
| GET/POST | `/investors` |
| GET/PATCH | `/investors/:investorId` |
| GET | `/investors/:investorId/360` |
| GET | `/investors/:investorId/relationship-summary` |
| POST | `/investors/:investorId/contacts` |
| PATCH | `/investors/:investorId/contacts/:contactId` |
| POST | `/investors/:investorId/contacts/:contactId/archive` |

## Commitments & closings

| Method | Path |
|--------|------|
| GET/POST | `/fundraising/commitments` |
| GET/PATCH | `/fundraising/commitments/:commitmentId` |
| POST | `…/admit` · `…/fund` |
| GET/POST | `/fundraising/closings` |
| GET/PATCH | `/fundraising/closings/:closingId` |
| POST | `…/readiness` |

## Mandates & RFPs

| Method | Path |
|--------|------|
| GET/POST | `/fundraising/mandates` · `/fundraising/rfps` |
| POST | `/fundraising/mandates/:id/activate` |
| POST | `/fundraising/rfps/:id/convert-to-mandate` (outcome must be `WON`) |

## Other modules

Communications, tasks, commercial-terms, approvals, DDQ (`/fundraising/ddq/*`), KYC cases, data rooms (`/fundraising/campaigns/:id/data-rooms`, upload/download), agreements + versions/signatories, placement agents, forecast scenarios, analytics (`funnel`, `source`, `owner-performance`, `stage-ageing`), reports (`/fundraising/reports/:reportKey`), audit logs.

## Migrations / UAT

```bash
# All three DBs (override DATABASE_URL)
npm run db:migrate:fundraising-srd-expansion

# Dev API (nts) — server must be running
npm run uat:fundraising:srd
npm run uat:fundraising:ir-foundation
```

## Acceptance checklist

- [ ] No `/api/v1/fundraising` or `/api/v1/investors` mounts  
- [ ] Campaign create uses IR stage seeds; board lists opportunities  
- [ ] Amount patch without reason → 400  
- [ ] Checklist seeded on opportunity create  
- [ ] Commitments admit/fund separate from signed document alone  
- [ ] Investor 360 returns aggregate children  
- [ ] Data room / agreement uploads use RemoteUpload (`fundraising-documents`)  
- [ ] Forecast scenarios do not mutate opportunities  
- [ ] Audit log append-only  
