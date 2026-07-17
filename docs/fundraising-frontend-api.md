# Fundraising & Investor Relations ? Frontend API Reference

**Audience:** Frontend engineers  
**Base URL:** `{API_HOST}/api` (e.g. `http://localhost:3009/api` or `https://dev-api.arcus.co.zw/api`)  
**Auth:** every route below requires `Authorization: Bearer <token>` from `POST /api/auth/login`  
**Do not use** `/api/v1/...` ? there is no versioning on this module.

| Mount | Purpose |
|-------|---------|
| `/api/fundraising` | Campaigns, pipeline, opportunities, ops modules |
| `/api/investors` | Investor organisations, contacts, 360? |

**Deprecated (do not wire new UI):** `/api/fundraising/deals/*`

Demo login: `admin@nts.com` / `admin123`

---

## Response envelope

**Success**

```json
{ "success": true, "data": { } }
```

**Error** ? toast on `error.code`

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

Some activation errors use `error.unmet` (string array) instead of `unmetRequirements`.

### Common error codes

| code | HTTP | When |
|------|------|------|
| `VALIDATION_ERROR` | 400 | Missing/invalid fields (e.g. amount change without `reason`) |
| `STAGE_GATE_FAILED` | 400 | Forward stage move blocked ? show `unmetRequirements` checklist |
| `ACTIVATION_REQUIREMENTS_UNMET` | 400 | Campaign activate incomplete ? show `unmet` |
| `CAMPAIGN_NOT_ACTIVE` | 400 | Creating opportunity on non-ACTIVE campaign |
| `COMPLIANCE_BLOCKED` | 400 | Admit / fund / activate while KYC/sanctions blocked |
| `OPPORTUNITY_NOT_FOUND` | 404 | Bad opportunity id |
| `CAMPAIGN_NOT_FOUND` | 404 | Bad campaign id |
| `INVESTOR_NOT_FOUND` | 404 | Bad investor id |
| `COMMITMENT_NOT_FOUND` | 404 | Bad commitment id |
| `REPORT_NOT_FOUND` | 404 | Unknown report key |
| `REPORT_JOB_NOT_FOUND` | 404 | Unknown report job id |
| `MEETING_OUTCOME_REQUIRED` | 422 | Complete meeting without `outcomeSummary` |
| `MEETING_CANCELLED` | 409 | Complete on cancelled meeting |
| `HOLD_ALREADY_ACTIVE` | 409 | Place hold while one is active |
| `HOLD_NOT_FOUND` / `HOLD_NOT_ACTIVE` | 404 / 409 | Release invalid hold |
| `DOCUMENT_VERSION_NOT_FOUND` | 404 | Bad document version |
| `SIGNATORY_NOT_FOUND` | 404 | Bad agreement signatory |
| `FUND_REQUIRED` | 400 | PE/VC campaign missing `fundId` |

---

## Suggested FE call order (happy path)

1. Login ? store token  
2. `POST /investors` ? `POST /investors/:id/contacts`  
3. `POST /fundraising/campaigns` ? `POST ?/activate`  
4. `POST /fundraising/opportunities`  
5. Board: `GET /fundraising/campaigns/:id/board`  
6. Drag column ? `POST ?/opportunities/:id/transition` `{ toStageCode }`  
7. Amount edits ? `PATCH ?/opportunities/:id` **with `reason`**  
8. Drawer: `GET /investors/:id/360`  

---

## Auth

### `POST /api/auth/login`

```json
{ "email": "admin@nts.com", "password": "admin123" }
```

Use returned `token` (or `data.token`) as Bearer on all fundraising routes.

---

# Investors ? `/api/investors`

## `GET /investors`

Query: `q`, `status`, `investorType`, `countryCode` (alias `country`), `jurisdiction`, `kycStatus`, `sanctionsStatus`, `riskRating`, `investorClassification`, `relationshipOwnerId` (alias `ownerId`), `campaignId`, `minAum`, `maxAum`, `page`, `pageSize`

List items include `complianceHoldActive` and `complianceHoldId` when a hold is active (denormalized for filters / badges).

```json
{
  "success": true,
  "data": {
    "items": [ { "id": "?", "legalName": "?", "investorType": "PENSION_FUND", "kycStatus": "CLEARED" } ],
    "page": 1,
    "pageSize": 25,
    "total": 10,
    "totalPages": 1
  }
}
```

## `POST /investors`

```json
{
  "legalName": "National Pension Fund",
  "tradingName": "NPF",
  "investorType": "PENSION_FUND",
  "registrationNumber": "REG-001",
  "countryCode": "ZW",
  "jurisdiction": "Zimbabwe",
  "baseCurrency": "USD",
  "estimatedAum": 500000000,
  "typicalMinimumTicket": 1000000,
  "typicalMaximumTicket": 25000000,
  "assetClassPreferences": ["PRIVATE_EQUITY", "INFRASTRUCTURE"],
  "geographicInterests": ["SSA"],
  "relationshipOwnerId": "<userId>",
  "source": "CONFERENCE",
  "kycStatus": "NOT_STARTED",
  "sanctionsStatus": "NOT_SCREENED",
  "riskRating": "MEDIUM",
  "investorClassification": "INSTITUTIONAL",
  "nextAction": "Intro call",
  "nextActionDate": "2026-08-01"
}
```

**investorType examples:** `PENSION_FUND`, `INSURANCE`, `FAMILY_OFFICE`, `DFI`, `SOVEREIGN`, `BANK`, `CONSULTANT`

**kycStatus:** `NOT_STARTED` \| `IN_PROGRESS` \| `CLEARED` \| `DOCUMENTS_REQUESTED` \| `UNDER_REVIEW` \| `APPROVED` \| `APPROVED_WITH_CONDITIONS` \| `REJECTED` \| `EXPIRED`  
**sanctionsStatus:** `NOT_SCREENED` \| `CLEAR` \| `BLOCKED` \| `FAILED`

## `GET /investors/:investorId`

Org + contacts.

## `PATCH /investors/:investorId`

Partial update ? same fields as create (optional).

## `GET /investors/:investorId/360`

Investor drawer / 360 page.

```json
{
  "success": true,
  "data": {
    "organisation": { "id": "?", "legalName": "?", "kycStatus": "CLEARED" },
    "investor": { },
    "contacts": [],
    "opportunities": [],
    "commitments": [],
    "mandates": [],
    "communications": [],
    "kycCases": [],
    "ddqCases": [],
    "agreements": [],
    "tasks": [],
    "internalTaskCommunications": []
  }
}
```

Prefer `data.organisation` for the summary header.

## `GET /investors/:investorId/relationship-summary`

Lighter rollup (counts / amounts) for list KPIs.

## Contacts

### `POST /investors/:investorId/contacts`

```json
{
  "fullName": "Ada Owner",
  "roleTitle": "CIO",
  "department": "Investments",
  "email": "ada@example.com",
  "phone": "+263771234567",
  "decisionInfluence": "DECISION_MAKER",
  "communicationConsent": true,
  "isPrimary": true,
  "nextAction": "Send teaser",
  "nextActionDate": "2026-08-05"
}
```

### `PATCH /investors/:investorId/contacts/:contactId`

Partial update.

### `POST /investors/:investorId/contacts/:contactId/archive`

Sets contact status to archived (soft).

---

# Fundraising ? `/api/fundraising`

## Dashboard

### `GET /fundraising/dashboard`

Query: `campaignId`, `campaignType`

Returns pipeline KPIs: `targetTotal`, `signedTotal`, `admittedTotal`, `fundedTotal`, `expectedAumTotal`, `activatedAumTotal`, `grossPipeline`, `weightedPipeline`, `coverageRatio`, `opportunityCounts`, `openTasks`.

---

## Campaigns

### `GET /fundraising/campaigns`

Query: `campaignType`, `status`, `fundId`

### `POST /fundraising/campaigns`

Creates **DRAFT** / **PENDING** campaign and seeds stages (13 PE/VC or 13 AM).

```json
{
  "campaignType": "PE_FUNDRAISE",
  "name": "Fund IV First Close",
  "fundId": "<fundId>",
  "productId": null,
  "description": "First close push",
  "targetCapital": 100000000,
  "minimumTargetAmount": 50000000,
  "hardCapAmount": 120000000,
  "primaryCurrency": "USD",
  "startDate": "2026-01-01",
  "closeDate": "2027-12-31",
  "firstCloseTargetDate": "2026-09-30",
  "finalCloseTargetDate": "2027-12-31",
  "regionTags": ["SSA"],
  "investorSegments": { "types": ["PENSION_FUND", "DFI"] },
  "campaignOwnerId": "<userId>"
}
```

**campaignType**

| Value | Stages | `fundId` |
|-------|--------|---------|
| `PE_FUNDRAISE` | PE/VC 13 | **required** |
| `VC_FUNDRAISE` | PE/VC 13 | **required** |
| `CO_INVESTMENT` | PE/VC 13 | **required** |
| `SPV` | PE/VC 13 | **required** |
| `CONTINUATION_VEHICLE` | PE/VC 13 | **required** |
| `INSTITUTIONAL_MANDATE` | AM 13 | optional |
| `PRODUCT_LAUNCH` | AM 13 | optional |
| `DISTRIBUTOR_CAMPAIGN` | AM 13 | optional |

**status:** `DRAFT` \| `ACTIVE` \| `CLOSED` \| `ARCHIVED`  
**approvalStatus:** `PENDING` \| `APPROVED` \| `REJECTED`

### `GET /fundraising/campaigns/:campaignId`

Includes `stages[]` (+ checklist templates) and `glMapping`.

### `PATCH /fundraising/campaigns/:campaignId`

Partial update (`targetCapital` preferred over `targetAmount`).

### `POST /fundraising/campaigns/:campaignId/activate`

Sets `ACTIVE` + `APPROVED`. On failure:

```json
{
  "success": false,
  "error": {
    "code": "ACTIVATION_REQUIREMENTS_UNMET",
    "message": "Campaign cannot be activated",
    "unmet": ["campaign owner / team assigned required"]
  }
}
```

### `GET /fundraising/campaigns/:campaignId/dashboard`

Campaign-scoped metrics + per-stage counts.

### `GET /fundraising/campaigns/:campaignId/board`  ? Kanban

```json
{
  "success": true,
  "data": {
    "campaignId": "?",
    "columns": [
      {
        "stage": {
          "id": "?",
          "stageCode": "CONTACTED",
          "stageName": "Contacted",
          "sortOrder": 2,
          "winProbabilityPct": "15"
        },
        "cards": [
          {
            "id": "?",
            "indicativeAmount": "5000000",
            "softCircleAmount": null,
            "priority": "HIGH",
            "status": "OPEN",
            "investor": { "id": "?", "legalName": "National Pension Fund" },
            "currentStage": { "stageCode": "CONTACTED" }
          }
        ],
        "totals": {
          "count": 1,
          "indicativeAmount": 5000000,
          "qualifiedAmount": 0,
          "softCircleAmount": 0,
          "proposedAmount": 0,
          "signedAmount": 0,
          "weightedAmount": 750000
        }
      }
    ]
  }
}
```

**Drag-and-drop:** call `POST /opportunities/:id/transition` with `toStageCode`. Only update the board UI after `success: true`. On `STAGE_GATE_FAILED`, show `unmetRequirements` and snap the card back.

### `GET /fundraising/campaigns/:campaignId/metrics`

Campaign metrics summary (commitments + opportunity amounts).

### `POST /fundraising/campaigns/:campaignId/pause`

Body: `{ "reason": "IC calendar slip" }` ? records pause metadata on campaign.

### `POST /fundraising/campaigns/:campaignId/submit-for-approval`

Creates activation approval request; sets `approvalStatus: PENDING`.

```json
{ "reason": "Ready for compliance sign-off", "requestType": "CAMPAIGN_ACTIVATION" }
```

---

## Opportunities

### `GET /fundraising/opportunities`

Query: `campaignId`, `investorId`, `status`, `stageCode`, `ownerId`

### `POST /fundraising/opportunities`

Campaign must be **ACTIVE**.

```json
{
  "campaignId": "<id>",
  "investorId": "<id>",
  "primaryContactId": "<contactId>",
  "opportunityType": "LP_COMMITMENT",
  "opportunityCurrency": "USD",
  "indicativeAmount": 2500000,
  "qualifiedAmount": null,
  "softCircleAmount": null,
  "proposedAmount": null,
  "signedAmount": null,
  "expectedAum": null,
  "confidenceAdjustment": 1,
  "expectedCloseDate": "2026-12-15",
  "opportunityOwnerId": "<userId>",
  "priority": "HIGH",
  "source": "DIRECT",
  "consultantName": null,
  "placementAgentName": null,
  "notes": "Warm intro via CIO"
}
```

### `GET /fundraising/opportunities/:opportunityId`

Includes investor, stage, amount/stage history samples.

### `PATCH /fundraising/opportunities/:opportunityId`

Partial update. **If any amount field changes, `reason` (or `amountReason`) is required.**

```json
{
  "softCircleAmount": 2000000,
  "reason": "Soft circle confirmed on call"
}
```

Amount fields (independent ? never overwrite each other silently; history is written):

| Field | amountType |
|-------|------------|
| `indicativeAmount` | `INDICATIVE` |
| `qualifiedAmount` | `QUALIFIED` |
| `softCircleAmount` | `SOFT_CIRCLE` |
| `proposedAmount` | `PROPOSED` |
| `signedAmount` | `SIGNED` |
| `admittedAmount` | `ADMITTED` |
| `fundedAmount` | `FUNDED` |
| `expectedAum` | `EXPECTED_AUM` |
| `activatedAum` | `ACTIVATED_AUM` |

### `POST /fundraising/opportunities/:opportunityId/transition`

```json
{ "toStageCode": "QUALIFIED", "reason": "DDQ started" }
```

Or `{ "toStageId": "<stageId>" }`.

### `POST /fundraising/opportunities/:opportunityId/assign`

```json
{ "opportunityOwnerId": "<userId>" }
```

### `POST /fundraising/opportunities/:opportunityId/mark-lost`

```json
{ "lostReason": "Chose competitor" }
```

### `POST /fundraising/opportunities/:opportunityId/set-status`

```json
{ "status": "ON_HOLD", "reason": "Waiting on IC calendar" }
```

**status values:** `OPEN` \| `LOST` \| `WITHDRAWN` \| `DEFERRED` \| `ON_HOLD` \| `DISQUALIFIED` \| `TENDER_CANCELLED` \| `WON`

### `GET /fundraising/opportunities/:opportunityId/timeline`

```json
{
  "success": true,
  "data": {
    "opportunityId": "?",
    "events": [
      { "type": "AMOUNT", "at": "?", "amountType": "INDICATIVE", "newValue": "2500000" },
      { "type": "stage", "at": "?", "toStageCode": "CONTACTED" }
    ]
  }
}
```

### Checklist

**`GET /fundraising/opportunities/:opportunityId/checklist`**  
Query: `stageId` (optional)

**`PATCH /fundraising/opportunities/:opportunityId/checklist`**

```json
{
  "items": [
    { "id": "<checklistItemId>", "isComplete": true },
    { "itemKey": "nda_signed", "stageId": "<stageId>", "isComplete": true }
  ]
}
```

---

## PE / VC stage codes (seed order)

`TARGET_INVESTOR` ? `CONTACTED` ? `QUALIFIED` ? `ENGAGED` ? `DATA_ROOM` ? `DUE_DILIGENCE` ? `IC_REVIEW` ? `COMMERCIAL_NEGOTIATION` ? `SUBSCRIPTION_DOCS` ? `KYC_COMPLIANCE` ? `SIGNED` ? `ADMITTED` ? `FUNDED`

## AM mandate stage codes

`TARGET_CLIENT` ? `INITIAL_CONTACT` ? `DISCOVERY` ? `QUALIFIED` ? `RFI_RFP` ? `PROPOSAL` ? `DUE_DILIGENCE` ? `PRESENTATION` ? `PREFERRED_BIDDER` ? `NEGOTIATION` ? `AWARDED` ? `ASSETS_IN_TRANSITION` ? `ACTIVATED`

### Stage gates (server)

| Gate | Requirement |
|------|-------------|
| `requiresIndicativeAmount` | indicative / qualified / expectedAum > 0 |
| `requiresSoftCircle` | softCircleAmount > 0 |
| `requiresProposed` | proposedAmount > 0 |
| `requiresSigned` | signedAmount > 0 |
| `requiresKycNotBlocked` | investor KYC/sanctions not blocked |
| `requiresPreviousStageChecklist` | required checklist items complete on previous stage |

---

## Communications

### `GET /fundraising/contacts`

Global contact index (gap 10). Query: `q`, `investorId`, `status`, `decisionInfluence`, `campaignId`, `page`, `pageSize`

### `GET /fundraising/communications`

Query: `campaignId`, `opportunityId`, `investorId`, `external=true` (hides `INTERNAL` / `INTERNAL_NOTE`)

### `POST /fundraising/communications`

```json
{
  "campaignId": "<id>",
  "opportunityId": "<id>",
  "investorId": "<id>",
  "contactId": "<id>",
  "interactionType": "PHONE_CALL",
  "subject": "Intro call",
  "summary": "Positive interest; follow up with teaser",
  "outcome": "FOLLOW_UP",
  "sentiment": "POSITIVE",
  "confidentiality": "INTERNAL",
  "nextAction": "Send teaser deck",
  "dueDate": "2026-08-10",
  "ownerId": "<userId>",
  "participants": ["ada@example.com"],
  "attachments": [],
  "occurredAt": "2026-07-16T10:00:00.000Z"
}
```

**interactionType examples:** `EMAIL`, `PHONE_CALL`, `VIDEO_MEETING`, `PHYSICAL_MEETING`, `CONFERENCE`, `PRESENTATION`, `FOLLOW_UP`, `INTERNAL_NOTE`, `DATA_ROOM_INVITATION`, `PROPOSAL_SUBMISSION`, `DDQ_RESPONSE`

**confidentiality:** `INTERNAL` \| `INTERNAL_NOTE` \| `EXTERNAL` \| `CONFIDENTIAL`  
Never expose `INTERNAL` / `INTERNAL_NOTE` to investor-facing UIs (`external=true`).

### `GET /fundraising/communications/:communicationId`

---

## Tasks

### `GET /fundraising/tasks`

Query: `campaignId`, `opportunityId`, `investorId`

```json
{
  "success": true,
  "data": {
    "performanceTasks": [ { "id": "?", "title": "?", "taskMetadata": { "sourceModule": "fundraising" } } ],
    "internalTaskCommunications": []
  }
}
```

### `POST /fundraising/tasks`

```json
{
  "title": "Follow up soft circle",
  "description": "Confirm ticket size",
  "dueDate": "2026-08-01",
  "priority": "HIGH",
  "status": "NOT_STARTED",
  "campaignId": "<id>",
  "opportunityId": "<id>",
  "investorId": "<id>"
}
```

### `PATCH /fundraising/tasks/:taskId`

Partial update of title/description/dueDate/priority/status/stage.

---

## Commitments

**Guardrail:** signed ? admitted ? funded ? cash.

### `GET /fundraising/commitments`

Query: `campaignId`, `investorId`, `opportunityId`, `status`

### `POST /fundraising/commitments`

```json
{
  "opportunityId": "<id>",
  "investorId": "<id>",
  "campaignId": "<id>",
  "fundId": "<fundId>",
  "currency": "USD",
  "commitmentAmount": 5000000,
  "status": "SIGNED",
  "signedAt": "2026-07-01T00:00:00.000Z",
  "closingId": null,
  "capitalCallContact": "ops@lp.example.com"
}
```

**status examples:** `INDICATIVE` \| `SOFT_CIRCLED` \| `PROPOSED` \| `DOCUMENTS_ISSUED` \| `SIGNED` \| `ACCEPTED` \| `ADMITTED_AT_CLOSE` \| `PARTIALLY_FUNDED` \| `FUNDED` \| `REDUCED` \| `CANCELLED` \| `DEFAULTED` \| `DRAFT`

### `GET /fundraising/commitments/:commitmentId`

### `PATCH /fundraising/commitments/:commitmentId`

### `POST /fundraising/commitments/:commitmentId/admit`

```json
{ "closingId": "<closingId>" }
```

? status `ADMITTED_AT_CLOSE`, sets admission date; may provision LP/GL when fund linked. Blocked if compliance hold.

### `POST /fundraising/commitments/:commitmentId/fund`

```json
{
  "fundedAmount": 2000000,
  "accountingStatus": "CASH_RECEIVED",
  "reason": "Wire received and reconciled"
}
```

`fundedAmount` must be positive. Legacy aliases `fundAmount` and `amount` are also accepted.
Returns `FUNDED` or `PARTIALLY_FUNDED`. Does **not** run from signed document alone.

---

## Closings

### `GET /fundraising/closings`

Query: `campaignId`, `status`

### `POST /fundraising/closings`

```json
{
  "campaignId": "<id>",
  "fundId": "<fundId>",
  "closeType": "FIRST_CLOSE",
  "closingDate": "2026-09-30",
  "status": "PLANNED",
  "notes": "Target first close"
}
```

**closeType:** `FIRST_CLOSE` \| `INTERIM_CLOSE` \| `SUBSEQUENT_CLOSE` \| `EXTENDED_CLOSE` \| `FINAL_CLOSE`

### `GET /fundraising/closings/:closingId`

### `PATCH /fundraising/closings/:closingId`

### `POST /fundraising/closings/:closingId/readiness`

```json
{
  "legalReady": true,
  "complianceReady": true,
  "fundReady": true,
  "equalisationStatus": "PENDING"
}
```

`GET /fundraising/closings/:closingId` also returns `readinessJson` and `postCloseJson` when populated. **Post-close LP provisioning** is represented in `postCloseJson` (checklist / status blob) ? there is no separate external LP portal integration unless added elsewhere. Persist provisioning UI state via `PATCH /fundraising/closings/:closingId` with `postCloseJson` / `readinessJson` when the closing record accepts those fields.

---

## Mandates

### `GET /fundraising/mandates`

### `POST /fundraising/mandates`

```json
{
  "investorId": "<id>",
  "campaignId": "<id>",
  "opportunityId": "<id>",
  "name": "Pension equity mandate",
  "status": "AWARDED",
  "expectedAum": 50000000,
  "currency": "USD",
  "ownerId": "<userId>"
}
```

**status:** `AWARDED` \| `ONBOARDING` \| `ASSETS_IN_TRANSITION` \| `PARTIALLY_FUNDED` \| `ACTIVE` \| `SUSPENDED` \| `TERMINATED` \| `LOST_BEFORE_ACTIVATION` \| `DRAFT`

### `GET|PATCH /fundraising/mandates/:mandateId`

Checklist booleans on patch: `agreementSigned`, `kycApproved`, `guidelinesConfigured`, `benchmarkConfigured`, `feesConfigured`, `reportingConfigured`, `custodianConfirmed`, `openingBalancesVerified`, `assetsReceived`

### `POST /fundraising/mandates/:mandateId/activate`

Requires all activation checklist flags + KYC clear. Sets `ACTIVE` / `activatedAum`. **Awarded ? activated.**

---

## RFPs / Tenders

### `GET /fundraising/rfps`

### `POST /fundraising/rfps`

```json
{
  "investorId": "<id>",
  "campaignId": "<id>",
  "referenceNumber": "RFP-2026-041",
  "institutionName": "National Pension Fund",
  "deadline": "2026-10-01",
  "presentationDate": "2026-09-15",
  "evaluationCriteria": { "fees": 30, "trackRecord": 40, "team": 30 },
  "status": "SUBMITTED",
  "commercialInfo": { "feeBps": 45, "benchmark": "MSCI EM" }
}
```

### `GET|PATCH /fundraising/rfps/:rfpId`

Set `outcome`: `WON` \| `LOST` \| `PENDING` before convert.

### `POST /fundraising/rfps/:rfpId/convert-to-mandate`

Only when `outcome === "WON"`. Returns new mandate.

### `GET /fundraising/rfps/:rfpId/proposal-versions`

### `POST /fundraising/rfps/:rfpId/proposal-versions` (multipart)

Field: **`file`**. Optional body: `status`, `approvalRequestId`, `reason`.

---

## Commercial terms & approvals

### `GET /fundraising/opportunities/:opportunityId/commercial-terms`

### `PUT /fundraising/opportunities/:opportunityId/commercial-terms`

```json
{
  "termsType": "PE_VC",
  "terms": {
    "managementFee": 2,
    "carriedInterest": 20,
    "hurdle": 8,
    "mfn": true,
    "sideLetters": []
  }
}
```

`termsType`: `PE_VC` \| `AM`  
Body accepts `terms` or `termsJson`.

### `GET /fundraising/approvals`

Query: `status`, `objectType`

### `POST /fundraising/approvals`

```json
{
  "objectType": "COMMERCIAL_TERMS",
  "objectId": "<opportunityId>",
  "requestType": "FEE_EXCEPTION",
  "reason": "Side letter MFN",
  "amount": 5000000,
  "currency": "USD",
  "payload": { "opportunityId": "<id>" }
}
```

### `GET /fundraising/approvals/:approvalId/history`

Returns `{ approval, events[] }` (append-only event stream).

### `POST /fundraising/approvals/:approvalId/decide`

```json
{ "decision": "APPROVED", "decisionNotes": "Within policy" }
```

`decision`: `APPROVED` \| `REJECTED`

---

## Due Diligence (DDQ)

### `GET /fundraising/ddq/templates`

### `POST /fundraising/ddq/templates`

```json
{
  "name": "Standard LP DDQ",
  "category": "Compliance",
  "questions": [ { "q": "List UBOs", "required": true } ]
}
```

Accepts `questions` or `questionsJson`.

### `GET /fundraising/ddq/cases`

Query: `investorId`, `campaignId`, `opportunityId`, `status`

### `POST /fundraising/ddq/cases`

```json
{
  "investorId": "<id>",
  "campaignId": "<id>",
  "opportunityId": "<id>",
  "templateId": "<id>",
  "title": "Fund IV DDQ ? NPF",
  "ownerId": "<userId>"
}
```

### `GET|PATCH /fundraising/ddq/cases/:caseId`

Case includes lifecycle timestamps (`submittedAt`, `approvedAt`, `archivedAt`) when set.

### `PATCH /fundraising/ddq/cases/:caseId/items/:itemId`

```json
{ "status": "SUBMITTED", "ownerId": "<userId>", "reviewerComments": "Looks good", "dueDate": "2026-08-15" }
```

Updates case `progressPct` from item statuses.

### `GET /fundraising/ddq/cases/:caseId/questions`

Query: `status`

### `POST /fundraising/ddq/cases/:caseId/questions`

```json
{ "questionText": "Who are UBOs?", "itemId": "<itemId>", "visibility": "INTERNAL" }
```

### `GET /fundraising/ddq/answer-library`

Query: `category`, `q`, `status`

### `POST /fundraising/ddq/answer-library`

```json
{ "questionKey": "ubo_list", "approvedAnswer": "?", "category": "Compliance" }
```

### `GET /fundraising/ddq/cases/:caseId/items/:itemId/comments`

### `POST /fundraising/ddq/cases/:caseId/items/:itemId/comments`

```json
{ "commentText": "Please attach certified IDs" }
```

### `GET /fundraising/ddq/cases/:caseId/export`

Returns CSV export payload (`headers`, `rows`, `csv`).

### `POST /fundraising/ddq/cases/:caseId/items/:itemId/evidence` (multipart)

- `Content-Type: multipart/form-data`  
- Field name: **`file`**  
- Max ~25 MB  

---

## KYC cases

### `GET /fundraising/kyc-cases`

Query: `investorId`, `status`

### `POST /fundraising/kyc-cases`

```json
{
  "investorId": "<id>",
  "status": "UNDER_REVIEW",
  "riskRating": "MEDIUM",
  "pepFlag": false,
  "adverseMediaFlag": false,
  "details": { "sourceOfWealth": "?" },
  "ownerId": "<userId>"
}
```

### `GET|PATCH /fundraising/kyc-cases/:caseId`

Commercial talk may continue while KYC open; **Admit / Fund / Activate** blocked if compliance fails.

---

## Data rooms

### `GET /fundraising/campaigns/:campaignId/data-rooms`

### `POST /fundraising/campaigns/:campaignId/data-rooms`

```json
{ "name": "Fund IV Data Room", "requiresMfa": false, "status": "ACTIVE" }
```

### `GET /fundraising/data-rooms/:dataRoomId`

Includes folders / documents / access as returned by BE.

### `PATCH /fundraising/data-rooms/:dataRoomId`

```json
{
  "name": "Fund IV Data Room",
  "status": "ACTIVE",
  "requiresMfa": true,
  "expiresAt": "2026-12-31T00:00:00.000Z",
  "defaultWatermarkEnabled": true,
  "defaultDownloadLimit": 5
}
```

### `POST /fundraising/data-rooms/:dataRoomId/folders`

```json
{ "name": "Legal", "parentId": null, "sortOrder": 1 }
```

### `POST /fundraising/data-rooms/:dataRoomId/documents` (multipart)

- Field: **`file`**  
- Optional body fields: `folderId`, `viewOnly`, `downloadLimit`, `watermarkEnabled`

### `GET /fundraising/data-rooms/:dataRoomId/documents/:documentId/download`

Auth-gated binary download (do not rely on public URL alone for sensitive docs).

### `POST /fundraising/data-rooms/:dataRoomId/access`

```json
{
  "investorId": "<id>",
  "contactId": "<contactId>",
  "permissionLevel": "DOWNLOAD",
  "expiresAt": "2026-12-31T00:00:00.000Z",
  "downloadLimit": 3,
  "watermarkEnabled": true
}
```

### `DELETE /fundraising/data-rooms/:dataRoomId/access/:accessId`

Body (optional): `{ "reason": "Investor withdrew" }` ? soft-revokes grant (`revokedAt`).

---

## Agreements & e-sign

### `GET /fundraising/agreements`

Query: `opportunityId`, `investorId`, `campaignId`

### `POST /fundraising/agreements`

```json
{
  "opportunityId": "<id>",
  "investorId": "<id>",
  "campaignId": "<id>",
  "commitmentId": null,
  "documentType": "SUBSCRIPTION_AGREEMENT",
  "title": "Subscription ? NPF"
}
```

**documentType (PE/VC examples):** `NDA`, `TERM_SHEET`, `SUBSCRIPTION_AGREEMENT`, `LPA`, `SIDE_LETTER`, `CO_INVESTMENT_AGREEMENT`  
**AM examples:** `IMA`, `MANDATE`, `FEE_SCHEDULE`, `INVESTMENT_GUIDELINES`

### `GET /fundraising/agreements/:agreementId`

### `POST /fundraising/agreements/:agreementId/versions` (multipart)

- Field: **`file`**  
- New version **invalidates** pending signatories on previous version.

### `POST /fundraising/agreements/:agreementId/signatories`

`versionId` is optional. Signatories can be added while the agreement is still `DRAFT` with no
uploaded document; they return `versionId: null` and are attached automatically when the first
agreement version is uploaded.

```json
{
  "fullName": "Ada Owner",
  "email": "ada@example.com",
  "sequenceOrder": 1,
  "expiresAt": "2026-08-31T00:00:00.000Z"
}
```

### `POST /fundraising/agreements/:agreementId/signatories/:signatoryId/sign`

```json
{ "certificateRef": "manual-ack-2026-07-16" }
```

### `POST /fundraising/agreements/:agreementId/send`

Marks agreement `OUT_FOR_SIGNATURE` and stores provider metadata. **Does not call an external e-sign vendor.**

```json
{
  "versionId": "<versionId>",
  "provider": "MANUAL",
  "providerEnvelopeId": "env-optional-external-ref",
  "providerStatus": "SENT",
  "expiresAt": "2026-08-31T00:00:00.000Z"
}
```

Returns agreement + `artifacts[]` (uploaded / registered provider artifacts).

### `POST /fundraising/agreements/:agreementId/signatories/:signatoryId/decline`

```json
{ "reason": "Terms not acceptable" }
```

### `GET /fundraising/agreements/:agreementId/signed-copy`

Query: `artifactId` (optional) ? metadata + download refs for signed artifact.

### `GET /fundraising/agreements/:agreementId/certificate`

Completion certificate metadata for the agreement envelope.

**Guardrail:** uploading / signing a document does **not** auto-mark opportunity WON or commitment funded. E-sign adapter stores envelope/artifact metadata and serves uploaded artifacts only ? **no DocuSign/Adobe SDK**.

---

## Placement agents

### `GET /fundraising/placement-agents`

### `POST /fundraising/placement-agents`

```json
{
  "legalName": "Africa Placement Partners",
  "territory": "SSA",
  "geography": ["ZW", "ZA", "KE"],
  "commissionPct": 1.5,
  "retainer": 25000,
  "successFee": 0,
  "appointmentStart": "2026-01-01",
  "appointmentEnd": "2027-12-31",
  "protectedUntil": "2028-06-30"
}
```

### `GET|PATCH /fundraising/placement-agents/:agentId`

### `POST /fundraising/placement-agents/:agentId/assign-opportunity`

```json
{ "opportunityId": "<id>" }
```

### `GET /fundraising/placement-exclusions`

Query: `agentId`, `investorId`, `status`

### `POST /fundraising/placement-exclusions`

```json
{ "agentId": "<id>", "investorId": "<id>", "countryCode": "ZW", "reason": "Conflict", "status": "ACTIVE" }
```

### `DELETE /fundraising/placement-exclusions/:exclusionId`

Soft-deactivates exclusion (`status: INACTIVE`).

### `POST /fundraising/placement-agents/:agentId/commissions/pay`

Ledger event ? `eventType`: `ACCRUE` | `PAY` | `HOLD` | `RELEASE_HOLD`

```json
{ "eventType": "PAY", "amount": 15000, "currency": "USD", "opportunityId": "<id>", "notes": "Q3 success fee" }
```

### `POST /fundraising/placement-assignments/:assignmentId/unassign`

```json
{ "reason": "Investor direct-sourced" }
```

---

## Forecasts

### `GET /fundraising/forecasts/scenarios`

Query: `campaignId`

### `POST /fundraising/forecasts/scenarios`

```json
{
  "campaignId": "<id>",
  "name": "Base case",
  "scenarioType": "BASE",
  "assumptions": { "winRate": 0.4 },
  "projectedSigned": 40000000,
  "projectedAum": 0,
  "projectedFees": 800000
}
```

**scenarioType:** `DOWNSIDE` \| `BASE` \| `UPSIDE`  
Scenarios **never** mutate live opportunities.

### `POST /fundraising/forecasts/scenarios/:scenarioId/recalculate`

Recomputes `projectedSigned`, `projectedAum`, `projectedFees`, `monthlyProjection` from open opportunities + assumptions; sets `recalculatedAt` / `assumptionHash`.

```json
{ "assumptions": { "winRate": 0.35 }, "reason": "Refresh after board review" }
```

---

## Analytics

All accept query `campaignId` (optional unless noted).

| Method | Path |
|--------|------|
| GET | `/fundraising/analytics/funnel` |
| GET | `/fundraising/analytics/source` |
| GET | `/fundraising/analytics/owner-performance` |
| GET | `/fundraising/analytics/stage-ageing` |
| GET | `/fundraising/analytics/concentration` |
| GET | `/fundraising/analytics/geography` |

**concentration** query: `campaignId`, `groupBy` (`investorType` \| `owner` \| `stage`)  
**geography** query: `campaignId`

---

## Reports

Reports support **catalog**, **on-demand run**, **job records**, **schedules**, and **run history**. Job endpoints execute **synchronously** in-process (status moves to `COMPLETED` or `FAILED` before the HTTP response returns) but expose an async-style job contract for FE polling / history.

### `GET /fundraising/reports` ? catalog

```json
{
  "success": true,
  "data": [
    { "reportKey": "pipeline-summary", "label": "Pipeline summary", "requiresCampaignId": true },
    { "reportKey": "ddq-export", "label": "DDQ case export", "requiresCampaignId": false }
  ]
}
```

**reportKey values:** `pipeline-summary`, `campaign-metrics`, `funnel`, `pipeline-funnel`, `source`, `source-analysis`, `owner-performance`, `stage-ageing`, `ddq-export`, `documents-export`, `audit-export`

### `GET /fundraising/reports/:reportKey` ? immediate run

Query: `campaignId` (required for `pipeline-summary` / `campaign-metrics`), plus report-specific filters. Returns JSON (or CSV string for `*-export` keys).

### `POST /fundraising/reports/:reportKey/run` ? job-style run

Same body as `POST /reports/jobs`. Returns **202** with `{ job, resultPayload, result }` when synchronous execution completes.

### `GET /fundraising/reports/jobs`

Query: `reportKey`, `status`, `limit`

### `POST /fundraising/reports/jobs`

```json
{
  "reportKey": "pipeline-summary",
  "format": "JSON",
  "filters": { "campaignId": "<id>" },
  "scheduleId": null
}
```

### `GET /fundraising/reports/jobs/:jobId`

Returns `{ job, resultPayload, artifactMeta, artifactUrl }`.

### `GET /fundraising/reports/schedules`

Query: `reportKey`, `isActive`

### `POST /fundraising/reports/schedules`

```json
{
  "reportKey": "documents-export",
  "name": "Weekly doc index",
  "cadence": "WEEKLY",
  "format": "CSV",
  "filters": { "campaignId": "<id>" },
  "recipients": ["ops@example.com"],
  "isActive": true
}
```

**cadence:** `DAILY` | `WEEKLY` | `MONTHLY` | `QUARTERLY`

### `PATCH /fundraising/reports/schedules/:scheduleId`

Partial update of name, cadence, format, filters, recipients, `isActive`, `nextRunAt`.

### `DELETE /fundraising/reports/schedules/:scheduleId`

Soft-deactivates schedule (`isActive: false`). **No background scheduler** auto-runs due schedules yet.

### `GET /fundraising/reports/history`

Query: `scheduleId`, `reportKey`, `limit` ? unified run history (scheduled runs + jobs).

### `GET /fundraising/reports/:reportKey/history`

Run history filtered to one `reportKey`.

---

## Audit logs

### `GET /fundraising/audit-logs`

Query: `objectType`, `objectId`, `userId`, `action`, `from`, `to`, `page`, `pageSize`, `limit` (max 500)

Paginated response when `page` / `pageSize` supplied: `{ items, page, pageSize, total, totalPages }`.

### `GET /fundraising/audit-logs/export`

Same filters as list; returns CSV export payload for download UI.

---

## Multipart uploads (summary)

| Endpoint | Form field |
|----------|------------|
| `POST ?/ddq/cases/:caseId/items/:itemId/evidence` | `file` |
| `POST ?/data-rooms/:id/documents` | `file` |
| `POST ?/agreements/:id/versions` | `file` |
| `POST ?/documents/:documentId/versions` | `file` |
| `POST ?/rfps/:rfpId/proposal-versions` | `file` |
| `POST ?/campaigns/:campaignId/materials` | `file` |

```http
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

---

## What FE must never do

1. Call `/api/v1/fundraising` or `/api/v1/investors`  
2. Wire new screens to `/api/fundraising/deals/*`  
3. Optimistically complete Kanban moves before transition succeeds  
4. Treat signed PDF / signed commitment as cash or as activated AUM  
5. Overwrite amount fields without sending `reason`  
6. Show `INTERNAL` / `INTERNAL_NOTE` communications externally  

---

## Verify against running API

```bash
npm run uat:fundraising:fe-gaps      # gaps 1?8
npm run uat:fundraising:srd          # full SRD incl. gaps 9?24
```

Related: [`fundraising-srd-api.md`](./fundraising-srd-api.md) ? [`fundraising-srd-fe-handoff.md`](./fundraising-srd-fe-handoff.md) ? SRD [`fundraising-ir-mandate-srd-v1.md`](./fundraising-ir-mandate-srd-v1.md)

---

# FE gap APIs (Settings / Meetings / Documents / extras)

Shipped to unblock Settings, Meetings, Documents tabs and related KPIs. Full asks: `fundraising-fe-backend-asks.md`.

## Settings

| Method | Path |
|--------|------|
| GET | `/fundraising/settings` |
| PATCH | `/fundraising/settings` |
| POST | `/fundraising/settings/pipelines/:pipelineKey/stages` |
| PATCH | `/fundraising/settings/pipelines/:pipelineKey/stages/:stageId` |
| DELETE | `/fundraising/settings/pipelines/:pipelineKey/stages/:stageId` |
| PATCH | `/fundraising/settings/stage-gates` |
| PATCH | `/fundraising/settings/amount-types` |
| PATCH | `/fundraising/settings/notifications` |

`pipelineKey`: `PE_VC` | `AM`

`GET /fundraising/settings` returns `pipelines`, `stageGates`, `amountTypes`, `notifications`, `roles`.

Template edits apply to **new** campaigns (seeded from `fundraising_pipeline_templates`). Existing campaign stages are unchanged.

**Errors:** `VALIDATION_ERROR`, `STAGE_IN_USE` (409), `SETTINGS_NOT_FOUND`, `FORBIDDEN`

### Example ? patch stage

`PATCH /fundraising/settings/pipelines/PE_VC/stages/:stageId`

```json
{ "stageName": "Contacted", "winProbabilityPct": 15, "sortOrder": 2 }
```

### Example ? stage gates

`PATCH /fundraising/settings/stage-gates`

```json
{
  "gates": [
    { "stageCode": "COMMERCIAL_NEGOTIATION", "requiresSoftCircle": true, "requiresKycNotBlocked": true }
  ]
}
```

### Notifications merge patch

`PATCH /fundraising/settings/notifications`

```json
{
  "notifications": [
    { "id": "stage_gate_failed", "enabled": true },
    { "id": "commitment_signed", "enabled": false }
  ]
}
```

Accepts `{ notifications: [{ id, enabled, ? }] }` (or `eventKey` instead of `id`). **Merged** into stored `notificationsJson` ? omitted keys are unchanged; unknown ids are upserted.

## Meetings

| Method | Path |
|--------|------|
| GET | `/fundraising/meetings` |
| POST | `/fundraising/meetings` |
| GET | `/fundraising/meetings/:meetingId` |
| PATCH | `/fundraising/meetings/:meetingId` |
| POST | `/fundraising/meetings/:meetingId/cancel` |
| POST | `/fundraising/meetings/:meetingId/complete` |

Query: `campaignId`, `investorId`, `opportunityId`, `ownerId`, `from`, `to`, `meetingType`, `status`, `page`, `pageSize`

**meetingType:** `VIDEO` | `IN_PERSON` | `PHONE`  
**status:** `SCHEDULED` | `COMPLETED` | `CANCELLED` | `NO_SHOW`

### Example ? create

```json
{
  "title": "Fund IV intro ? NPF CIO",
  "meetingType": "VIDEO",
  "scheduledStart": "2026-08-05T14:00:00.000Z",
  "scheduledEnd": "2026-08-05T15:00:00.000Z",
  "timezone": "Africa/Harare",
  "campaignId": "<id>",
  "investorId": "<id>",
  "opportunityId": "<id>",
  "contactId": "<id>",
  "ownerId": "<userId>",
  "attendees": [
    { "email": "ada@example.com", "fullName": "Ada Owner", "role": "EXTERNAL" }
  ],
  "agenda": "Teaser walkthrough"
}
```

`POST /fundraising/meetings/:meetingId/cancel` body: `{ "reason": "Investor rescheduled" }`.

### Complete (gap 22 ? outcome-rich)

`POST /fundraising/meetings/:meetingId/complete`

**Requires** `outcomeSummary` (422 `MEETING_OUTCOME_REQUIRED` if missing). Idempotent: already-`COMPLETED` meetings return current row; cancelled meetings return 409 `MEETING_CANCELLED`.

```json
{
  "outcomeSummary": "Positive ? requested DDQ pack",
  "discussionNotes": "CIO asked for fee comparison vs peers",
  "decisions": [{ "text": "Send teaser + DDQ template", "ownerId": "<userId>" }],
  "actionItems": [
    {
      "title": "Send DDQ pack",
      "ownerId": "<userId>",
      "dueDate": "2026-08-10",
      "priority": "high",
      "createTask": true
    }
  ],
  "createCommunication": true,
  "idempotencyKey": "optional-client-nonce"
}
```

Atomically persists `discussionNotes`, `decisionsJson`, action items (with optional `linkedTaskId` when `createTask` is true), sets `status: COMPLETED`, and optionally creates a linked communication. Re-post with the same `idempotencyKey` / payload hash does not duplicate action items.

The create response, meeting detail, completed meeting response, and meeting-list items expose the
same outcome fields:

```json
{
  "id": "<meetingId>",
  "status": "COMPLETED",
  "agenda": "Teaser walkthrough",
  "discussionNotes": "CIO asked for fee comparison vs peers",
  "outcomeSummary": "Positive ? requested DDQ pack",
  "decisions": [
    { "text": "Send teaser + DDQ template", "ownerId": "<userId>" }
  ],
  "actionItems": [
    {
      "id": "<actionItemId>",
      "title": "Send DDQ pack",
      "ownerId": "<userId>",
      "dueDate": "2026-08-10T00:00:00.000Z",
      "status": "OPEN",
      "linkedTaskId": "<taskId>"
    }
  ],
  "completedAt": "2026-08-05T15:04:00.000Z",
  "completedBy": { "id": "<userId>" }
}
```

## Documents (unified index ? Option A)

| Method | Path |
|--------|------|
| GET | `/fundraising/documents` |
| POST | `/fundraising/documents` (optional multipart `file`) |
| GET | `/fundraising/documents/:documentId` |
| PATCH | `/fundraising/documents/:documentId` |
| GET | `/fundraising/documents/:documentId/download` |
| GET | `/fundraising/documents/:documentId/versions` |
| POST | `/fundraising/documents/:documentId/versions` (multipart `file`) |
| GET | `/fundraising/documents/:documentId/versions/:versionNumber/download` |
| GET | `/fundraising/documents/export` |

Query: `campaignId`, `investorId`, `opportunityId`, `category`, `q`, `confidential`, `sourceType`, `page`, `pageSize`

**sourceType:** `DATA_ROOM` | `AGREEMENT` | `DDQ_EVIDENCE` | `UPLOAD`  
**category examples:** `Legal`, `Track Record`, `Marketing`, `Due Diligence`, `KYC`, `Financials`

List merges registered rows with virtual data-room / agreement entries (ids may be prefixed `dr-` / `agr-`). Register uploads via `POST /documents` before versioning; virtual rows cannot receive new versions (`VALIDATION_ERROR`).

**Versions:** `GET ?/versions` returns metadata + `downloadPath` per version. Upload via `POST ?/versions` (field `file`; optional `changeNotes`). Download a specific revision via `GET ?/versions/:versionNumber/download` or `GET ?/download?version=N`. `GET ?/documents/export` returns CSV of the index (query filters same as list).

## Campaign engagement

`GET /fundraising/campaigns/:campaignId/engagement`

```json
{
  "success": true,
  "data": {
    "campaignId": "?",
    "sent": 165,
    "opened": 112,
    "replied": 38,
    "meetingsBooked": 24,
    "materialsDownloaded": 51,
    "progressPct": 47
  }
}
```

Uses `engagement_json` when set; otherwise computes from communications / meetings / downloads.

## Forecast monthly curve

`GET /fundraising/forecasts/scenarios/:scenarioId/curve`

```json
{
  "success": true,
  "data": {
    "scenarioId": "?",
    "monthlyProjection": [
      { "month": "2026-08", "cumulativeSigned": 5000000 }
    ]
  }
}
```

Also returned on scenario create/list as `monthlyProjection`. If omitted on create, BE generates a linear curve from `projectedSigned`.

## Mandate / RFP classification

On mandates: `assetClass`, `geography`, `rfpDueDate` (create/patch/list/get).  
On RFPs: `assetClass`, `geography`, `fitScore`.

## Placement agent commissions

`GET /fundraising/placement-agents/:agentId/commissions`

Agent list/detail also include `commissionStatus`, `accruedCommission`, `paidCommission`. Accrued may be derived from assigned funded opportunities ? `commissionPct` when stored accrued is 0.

## Commitment checklist

| Method | Path |
|--------|------|
| GET | `/fundraising/commitments/:commitmentId/checklist` |
| PATCH | `/fundraising/commitments/:commitmentId/checklist/:itemId` |

```json
{ "isComplete": true }
```

Seeds default closing items if empty (subscription docs, wire instructions, tax forms, side letter, bank details). Distinct from opportunity stage checklist.

---

# Requirements gap APIs (9?24)

Shipped on non-versioned `/api/fundraising` and `/api/investors`. Status table: [`fundraising-fe-backend-asks.md`](./fundraising-fe-backend-asks.md).

## Gap 9 ? Investor filters + compliance hold

**Extended** `GET /investors` ? see [Investors](#investors--apiinvestors) for full query list (`countryCode`, `kycStatus`, `minAum`, `campaignId`, ?).

| Method | Path |
|--------|------|
| POST | `/fundraising/investors/:investorId/compliance-hold` |
| POST | `/fundraising/compliance-holds/:holdId/release` |

Place hold:

```json
{ "reason": "Sanctions review pending" }
```

Release hold (**note path** ? not under `/investors`):

```json
{ "releaseReason": "Cleared after enhanced DD" }
```

Sets `complianceHoldActive` on the investor org; blocks admit / fund / activate while active (`COMPLIANCE_BLOCKED`).

## Gap 10 ? Global contacts

`GET /fundraising/contacts`

Query: `q`, `investorId`, `status`, `decisionInfluence`, `campaignId`, `page`, `pageSize`

Cross-investor contact index with investor summary on each row.

## Gap 11 ? Campaign ops kit

| Method | Path |
|--------|------|
| GET/POST | `/fundraising/campaigns/:campaignId/templates` |
| GET/POST | `/fundraising/campaigns/:campaignId/distribution-lists` |
| GET/POST | `/fundraising/campaigns/:campaignId/events` |
| GET/POST | `/fundraising/campaigns/:campaignId/materials` (multipart `file` on POST) |
| POST | `/fundraising/campaigns/:campaignId/submit-for-approval` |
| POST | `/fundraising/campaigns/:campaignId/pause` |

**submit-for-approval** creates a `FundraisingApprovalRequest` and sets campaign `approvalStatus: PENDING`.

**pause** body: `{ "reason": "IC hold" }` ? sets campaign paused metadata.

## Gap 12 ? RFP proposal versions

| Method | Path |
|--------|------|
| GET | `/fundraising/rfps/:rfpId/proposal-versions` |
| POST | `/fundraising/rfps/:rfpId/proposal-versions` (multipart `file`) |

RFP/mandate records expose `stageCode`, `stageName`, `onboardingKycCaseId` when linked. Auto KYC on RFP `WON` is handled when converting / patching outcome (creates or reuses open KYC case).

## Gap 13 ? DDQ workflow

See [Due Diligence (DDQ)](#due-diligence-ddq) for item patch, Q&A, answer library, comments, and CSV export.

## Gap 14 ? Data room admin

See [Data rooms](#data-rooms) ? `PATCH` room settings, `DELETE ?/access/:accessId` revoke.

## Gap 15 ? Document versions

See [Documents (gap section)](#documents-unified-index--option-a) and main Documents routes for version upload + per-version download + CSV export.

## Gap 16 ? E-sign adapter

See [Agreements & e-sign](#agreements--e-sign) ? `send`, signatory `decline`, `signed-copy`, `certificate`. **No vendor SDK** ? metadata + uploaded artifacts only.

## Gap 17 ? KYC lifecycle + compliance

KYC case GET/PATCH returns extended fields (`docsNote`, `conditionsJson`, `terminalStatus`, approver ids). Compliance blocking uses org-level hold (gap 9) plus KYC/sanctions status on investor.

## Gap 18 ? Placement exclusions + ledger

See [Placement agents](#placement-agents) ? exclusions CRUD, `commissions/pay` ledger, assignment `unassign`.

## Gap 19 ? Closing readiness / post-close

See [Closings](#closings). `GET ?/closings/:id` includes `readinessJson` and `postCloseJson`. Post-close LP provisioning UI state lives in `postCloseJson` ? **not** an external LP portal integration.

## Gap 20 ? Reports catalog / jobs / schedules

See [Reports](#reports).

## Gap 21 ? Forecast recalc + analytics

`POST /fundraising/forecasts/scenarios/:scenarioId/recalculate` ? see [Forecasts](#forecasts).

Analytics: `GET /fundraising/analytics/concentration`, `GET /fundraising/analytics/geography` ? see [Analytics](#analytics).

## Gap 22 ? Meeting outcome-rich complete

See [Meetings complete](#complete-gap-22--outcome-rich) above.

## Gap 23 ? Approval create + history

See [Commercial terms & approvals](#commercial-terms--approvals) ? `POST /fundraising/approvals`, `GET ?/:approvalId/history`.

## Gap 24 ? Audit export + filters

See [Audit logs](#audit-logs) ? paginated filters + `GET ?/audit-logs/export`.

## Known limitations (gaps 9?24)

| Area | Behavior |
|------|----------|
| E-sign | Stores `provider`, `providerEnvelopeId`, artifact rows; serves uploads. No DocuSign/Adobe API calls. |
| Report jobs | Synchronous execution; job row + history for UX contract. Schedules persist; no cron worker. |
| Post-close | `postCloseJson` on closing record only ? no automatic external LP account provisioning. |
| Report schedules | `DELETE` soft-deactivates; does not purge history. |

## Migration / UAT

```bash
# Gaps 1?8
npm run db:migrate:fundraising-fe-gaps
npm run uat:fundraising:fe-gaps

# Gaps 9?24 (+ outcome-rich meeting DDL)
npm run db:migrate:fundraising-requirements-gap
npm run uat:fundraising:requirements-gap
```

Set `API_URL=http://localhost:3002/api` when running UAT against a local API.
The requirements migration was applied twice (idempotency verified) on `nts`, `client1_db`, and
`demo_env`; the `nts` dev HTTP UAT passed **62/62** on 2026-07-17.
