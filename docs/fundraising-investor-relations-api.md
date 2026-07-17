# Fundraising & Investor Relations API

**Superseded for new FE work by:** [`fundraising-srd-api.md`](./fundraising-srd-api.md)
**SRD:** [`fundraising-ir-mandate-srd-v1.md`](./fundraising-ir-mandate-srd-v1.md)

**Base:** `{host}/api` — **no `/v1` prefix**
**Mounts:** `/api/fundraising`, `/api/investors`
**Legacy deals:** `/api/fundraising/deals/*` deprecated.

## Core endpoints (IR foundation)

| Area | Paths |
|------|--------|
| Dashboard | `GET /fundraising/dashboard` |
| Campaigns | `GET/POST /fundraising/campaigns`, `GET/PATCH /fundraising/campaigns/:id`, `POST …/activate`, `GET …/dashboard`, `GET …/board` |
| Opportunities | `GET/POST /fundraising/opportunities`, `GET/PATCH …/:id`, `POST …/transition`, `…/assign`, `…/mark-lost`, `GET …/timeline`, checklist |
| Investors | `GET/POST /investors`, `GET/PATCH /investors/:id`, contacts, `GET …/360`, `GET …/relationship-summary` |

## Enums

Campaign types, opportunity amount types, PE/VC + AM stages, and stage gates — unchanged from the IR foundation. See full SRD API doc for commitments, closings, mandates, DDQ, data rooms, etc.

## Migration / UAT

```bash
npm run db:migrate:fundraising-ir-foundation
npm run db:migrate:fundraising-srd-expansion
npm run uat:fundraising:ir-foundation
npm run uat:fundraising:srd
```
