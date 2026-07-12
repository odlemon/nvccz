# Fundraising & Investor Relations API (foundation)

**Audience:** Frontend / integration  
**Base URL:** `{host}/api/v1`  
**Auth:** `Authorization: Bearer <token>`  
**Envelope:** Success `{ "success": true, "data": … }`. Errors `{ "success": false, "error": { "code", "message", "unmetRequirements?" | "unmet?" } }`.

**Legacy note:** The older LP deal-close Kanban path remains at `/api/fundraising/*` (deals, checklists, agreement upload, WON close + GL). This document covers the **IR SRD foundation** only (`/api/v1/fundraising`, `/api/v1/investors`).

**Related:** Prisma models `InvestorOrganisation`, `InvestorContact`, `FundraisingOpportunity`, `OpportunityAmountHistory`, `OpportunityStageHistory`; extended `FundraisingCampaign`.

---

## Mounts

| Prefix | Router |
|--------|--------|
| `/api/v1/fundraising` | Campaigns, opportunities, dashboards |
| `/api/v1/investors` | Investor organisations & contacts |
| `/api/fundraising` | Legacy LP pipeline (unchanged) |

---

## Enums

### Campaign `campaignType`

| Value | Stage seed |
|-------|------------|
| `PE_FUNDRAISE` | PE/VC |
| `VC_FUNDRAISE` | PE/VC |
| `CO_INVESTMENT` | PE/VC |
| `SPV` | PE/VC |
| `CONTINUATION_VEHICLE` | PE/VC |
| `INSTITUTIONAL_MANDATE` | AM mandate |
| `PRODUCT_LAUNCH` | AM mandate |
| `DISTRIBUTOR_CAMPAIGN` | AM mandate |

PE/VC types require `fundId` on create/activate. AM types may omit `fundId` and use optional `productId`.

### Campaign `status` / `approvalStatus`

| Field | Values |
|-------|--------|
| `status` | `DRAFT` \| `ACTIVE` \| `CLOSED` \| `ARCHIVED` (create → `DRAFT`; activate → `ACTIVE`) |
| `approvalStatus` | `PENDING` \| `APPROVED` \| `REJECTED` (create → `PENDING`; activate → `APPROVED`) |

### Opportunity `status`

`OPEN` \| `WON` \| `LOST` \| `WITHDRAWN`

### Amount history `amountType`

| Field on opportunity | `amountType` |
|----------------------|--------------|
| `indicativeAmount` | `INDICATIVE` |
| `qualifiedAmount` | `QUALIFIED` |
| `softCircleAmount` | `SOFT_CIRCLE` |
| `proposedAmount` | `PROPOSED` |
| `signedAmount` | `SIGNED` |
| `admittedAmount` | `ADMITTED` |
| `fundedAmount` | `FUNDED` |
| `expectedAum` | `EXPECTED_AUM` |
| `activatedAum` | `ACTIVATED_AUM` |

Amount patches always write `OpportunityAmountHistory` (never silent overwrite).

### Investor KYC / sanctions (gate-relevant)

- `kycStatus`: `NOT_STARTED` \| `IN_PROGRESS` \| `CLEARED` \| `REJECTED` \| `EXPIRED` | …
- `sanctionsStatus`: `NOT_SCREENED` \| `CLEAR` \| `BLOCKED` \| `FAILED` | …

---

## PE / VC stages (seed)

| stageCode | winProbabilityPct | Notable gateRules |
|-----------|-------------------|-------------------|
| `TARGET_INVESTOR` | 10 | — |
| `CONTACTED` | 15 | — |
| `QUALIFIED` | 25 | `requiresIndicativeAmount` |
| `ENGAGED` | 35 | `requiresPreviousStageChecklist` (soft-pass in foundation) |
| `DATA_ROOM` | 45 | `requiresSoftCircle` |
| `DUE_DILIGENCE` | 55 | checklist soft-pass |
| `IC_REVIEW` | 60 | checklist soft-pass |
| `COMMERCIAL_NEGOTIATION` | 70 | `requiresProposed` |
| `SUBSCRIPTION_DOCS` | 80 | checklist soft-pass |
| `KYC_COMPLIANCE` | 85 | `requiresKycNotBlocked` |
| `SIGNED` | 95 | `requiresSigned` |
| `ADMITTED` | 98 | `requiresSigned` |
| `FUNDED` | 100 | `requiresSigned` |

## AM mandate stages (seed)

`TARGET_CLIENT` → `INITIAL_CONTACT` → `DISCOVERY` → `QUALIFIED` → `RFI_RFP` → `PROPOSAL` → `DUE_DILIGENCE` → `PRESENTATION` → `PREFERRED_BIDDER` → `NEGOTIATION` → `AWARDED` → `ASSETS_IN_TRANSITION` → `ACTIVATED`

---

## Stage gate checks (forward transitions)

On `POST …/transition` when moving to a higher `sortOrder`:

| Gate | Requirement |
|------|-------------|
| `requiresIndicativeAmount` | `indicativeAmount` **or** `qualifiedAmount` **or** `expectedAum` > 0 |
| `requiresSoftCircle` | `softCircleAmount` > 0 |
| `requiresProposed` | `proposedAmount` > 0 |
| `requiresSigned` | `signedAmount` > 0 |
| `requiresKycNotBlocked` | investor `kycStatus` not `REJECTED`/`EXPIRED`; `sanctionsStatus` not `BLOCKED`/`FAILED` |
| `requiresPreviousStageChecklist` | Soft-pass (no opportunity checklist yet) |

Failure: **400**

```json
{
  "success": false,
  "error": {
    "code": "STAGE_GATE_FAILED",
    "message": "Stage gate requirements not met",
    "unmetRequirements": ["requiresSoftCircle: softCircleAmount required"]
  }
}
```

---

## Endpoints

### Dashboard

`GET /v1/fundraising/dashboard?campaignId=&campaignType=`

Returns `targetTotal`, `signedTotal`, `admittedTotal`, `fundedTotal`, `expectedAumTotal`, `activatedAumTotal`, `grossPipeline`, `weightedPipeline`, `coverageRatio`, `opportunityCounts`, `openTasks: []`.

- **grossPipeline:** sum of best open amount (`softCircle` ‖ `qualified` ‖ `indicative` ‖ `proposed` ‖ `expectedAum`) for `OPEN` opps  
- **weightedPipeline:** `base * stageProbability/100 * confidenceAdjustment`  
- **coverageRatio:** `weightedPipeline / max(targetTotal - signedTotal, 1)`

`GET /v1/fundraising/campaigns/:campaignId/dashboard` — same metrics scoped + per-stage counts/totals.

### Campaigns

| Method | Path | Notes |
|--------|------|-------|
| GET | `/v1/fundraising/campaigns` | Filters: `campaignType`, `status`, `fundId` |
| POST | `/v1/fundraising/campaigns` | Seeds stages; `status=DRAFT`, `approvalStatus=PENDING`; GL mapping if `fundId` |
| GET | `/v1/fundraising/campaigns/:campaignId` | Includes stages + checklist templates |
| PATCH | `/v1/fundraising/campaigns/:campaignId` | Partial update (`targetCapital` preferred over `targetAmount`) |
| POST | `/v1/fundraising/campaigns/:campaignId/activate` | Sets `APPROVED` + `ACTIVE`; 400 with `error.unmet[]` if incomplete |

**Create example**

```json
POST /api/v1/fundraising/campaigns
{
  "campaignType": "PE_FUNDRAISE",
  "name": "Fund IV First Close",
  "fundId": "<fundId>",
  "targetCapital": 100000000,
  "primaryCurrency": "USD",
  "startDate": "2026-01-01",
  "closeDate": "2027-12-31"
}
```

### Opportunities

| Method | Path |
|--------|------|
| GET | `/v1/fundraising/opportunities` |
| POST | `/v1/fundraising/opportunities` |
| GET | `/v1/fundraising/opportunities/:opportunityId` |
| PATCH | `/v1/fundraising/opportunities/:opportunityId` |
| POST | `/v1/fundraising/opportunities/:opportunityId/transition` |
| POST | `/v1/fundraising/opportunities/:opportunityId/assign` |
| POST | `/v1/fundraising/opportunities/:opportunityId/mark-lost` |
| GET | `/v1/fundraising/opportunities/:opportunityId/timeline` |

Create requires campaign `status === ACTIVE`. Starts at first stage; writes amount + stage history.

```json
POST /api/v1/fundraising/opportunities
{
  "campaignId": "<id>",
  "investorId": "<id>",
  "opportunityType": "LP_COMMITMENT",
  "indicativeAmount": 2500000
}
```

```json
POST /api/v1/fundraising/opportunities/:id/transition
{ "toStageCode": "CONTACTED", "reason": "Intro call done" }
```

### Investors

| Method | Path |
|--------|------|
| GET | `/v1/investors` |
| POST | `/v1/investors` |
| GET | `/v1/investors/:investorId` |
| PATCH | `/v1/investors/:investorId` |
| POST | `/v1/investors/:investorId/contacts` |
| GET | `/v1/investors/:investorId/relationship-summary` |

```json
POST /api/v1/investors
{
  "legalName": "National Pension Fund",
  "investorType": "PENSION_FUND",
  "countryCode": "ZW"
}
```

---

## Auth / RBAC

- All routes: `authenticate`
- Campaign view (`:campaignId`): `FundraisingAccessService.assertCanView`
- Mutations: `assertCanEdit` (fund manager / IR / admin)
- Investor routes (no campaign): authenticate + `assertCanEdit` on writes
- Opportunity `:opportunityId`: resolve campaign then `assertCanView`

---

## Migration / ops

```bash
npm run db:migrate:fundraising-ir-foundation
# VPS all DBs:
python scripts/run-fundraising-ir-foundation-migration-all-dbs-vps.py
npm run uat:fundraising:ir-foundation
```

Idempotent DDL: alter `fundraising_campaigns`, widen `stage_code`, create IR tables; backfill existing campaigns to `campaign_type=PE_FUNDRAISE`, `approval_status=APPROVED` when `ACTIVE`.

---

## Acceptance checklist

- [ ] Create PE campaign with `fundId` → 13 PE stages + GL mapping; status `DRAFT` / `PENDING`
- [ ] Activate → `ACTIVE` / `APPROVED`; missing target/stages → 400 `unmet`
- [ ] Create AM campaign without fund → AM stages; activate without fund OK
- [ ] Create investor + contact; relationship-summary returns amounts/stages
- [ ] Create opportunity only on ACTIVE campaign; amount history on create + patch
- [ ] Transition forward blocked by gates until amounts/KYC satisfied; soft-pass checklist
- [ ] Timeline merges amount + stage history chronologically
- [ ] Executive + campaign dashboards return pipeline metrics; `openTasks` is `[]`
- [ ] Legacy `/api/fundraising` still works for deal close path
- [ ] Swagger tag **Fundraising & Investor Relations** lists `/v1/fundraising` and `/v1/investors`
