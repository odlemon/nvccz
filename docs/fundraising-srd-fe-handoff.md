# Fundraising SRD — FE handoff

**Stop waiting on:** BE mounts for the full Fundraising / IR / Mandate module.  
**Use:** `/api/fundraising/*` and `/api/investors/*` — **not** `/api/v1/...`.

## Auth

`POST /api/auth/login` → Bearer token on all routes.

Demo: `admin@nts.com` / `admin123`

## What to call first

1. `POST /api/investors` + contacts  
2. `POST /api/fundraising/campaigns` → `POST …/activate`  
3. `POST /api/fundraising/opportunities`  
4. Board: `GET /api/fundraising/campaigns/:id/board` (`data.columns[]`)  
5. Stage move: `POST /api/fundraising/opportunities/:id/transition` `{ toStageCode }` — handle `STAGE_GATE_FAILED.unmetRequirements`  
6. Amounts: `PATCH …/opportunities/:id` **must include `reason`**  
7. Investor drawer: `GET /api/investors/:id/360`  

## Do not use

- `/api/v1/fundraising` / `/api/v1/investors` (removed)  
- `/api/fundraising/deals/*` for new UI (deprecated)

## Toast / error codes

| code | When |
|------|------|
| `STAGE_GATE_FAILED` | Forward stage missing amounts/KYC/checklist |
| `VALIDATION_ERROR` | Missing reason on amount change, etc. |
| `ACTIVATION_REQUIREMENTS_UNMET` | Campaign activate incomplete (`error.unmet[]`) |
| `COMPLIANCE_BLOCKED` | Admit/fund/activate blocked |
| `CAMPAIGN_NOT_ACTIVE` | Opportunity create before activate |

## Verify

```bash
npm run uat:fundraising:srd
```

**Full endpoint reference for FE implementation:** [`fundraising-frontend-api.md`](./fundraising-frontend-api.md)

Also: [`fundraising-srd-api.md`](./fundraising-srd-api.md) · SRD [`fundraising-ir-mandate-srd-v1.md`](./fundraising-ir-mandate-srd-v1.md).
