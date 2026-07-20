# LP Portal Backend SRD and API Contract

**Module:** Investor & Limited Partner Portal  
**Frontend route:** `/lp-portal`  
**Canonical API namespace:** `/api/lp-portal`  
**UI requirements source:** `design-refs/lp-portal-srd-ui-requirements.md`  
**Purpose:** Backend implementation source of truth for the investor-facing portal already mocked in the frontend  
**Status:** Proposed backend contract  
**Last reviewed:** 2026-07-19

## 1. Executive summary

The LP Portal is the **investor-facing operating layer** of the investment management system. It is **not** a document vault only and **not** an independent accounting or valuation engine.

The backend must:

1. Resolve the authenticated investor (organisation + person) and entitlements.
2. Serve **approved, investor-scoped** snapshots for funds, positions, performance and ledgers.
3. Support **private-capital** and **open-ended / NAV** operating models in one API surface.
4. Expose capital-call and distribution workflows (acknowledge, payment confirmation, downloads).
5. Accept subscription and redemption requests with dealing rules and compliance gates.
6. Deliver statements, documents and notices with download/view audit trails.
7. Support service requests and record-linked secure messaging.
8. Support organisation colleague administration within entitlement boundaries.
9. Preserve immutable historical FX, valuations and published statements.
10. Emit audit events for every material investor action.

Most `/lp-portal` screens currently use local mock data in `components/lp-portal/screens/*` and `lib/lp-portal/mock-data.ts`. A thinner live contract already exists in `lib/api/lp-portal-api.ts` (`/lp-portal/dashboard`, ledger, vault, reports, colleagues). **Extend `/api/lp-portal` — do not invent a third parallel portal API.**

Primary frontend files that will consume this contract:

- `lib/api/lp-portal-api.ts` (extend)
- `components/lp-portal/lp-portal-context.tsx`
- `components/lp-portal/screens/lp-portal-dashboard-screen.tsx`
- `components/lp-portal/screens/lp-capital-activity-screen.tsx`
- `components/lp-portal/screens/lp-subscriptions-redemptions-screen.tsx`
- `components/lp-portal/screens/lp-performance-screen.tsx`
- `components/lp-portal/screens/lp-account-activity-screen.tsx`
- `components/lp-portal/screens/lp-document-centre-screen.tsx`
- `components/lp-portal/screens/lp-requests-messages-screen.tsx`
- `components/layout/lp-portal-sidebar.tsx`
- `components/layout/lp-portal-topbar.tsx`

## 2. Product rules

1. **Entitlement only** — every fund, call, distribution, document, message and performance figure is filtered by active investor-to-fund entitlement.
2. **Approved data** — portal reads approved snapshots / published statements. Unpublished drafts from GP workflows are invisible.
3. **Not an accounting engine** — NAV, units, IRR, DPI, TVPI, RVPI and cash matching are computed/approved upstream; portal may run **estimate** calculations marked as non-authoritative.
4. **Dual operating models** — `PRIVATE_CAPITAL` vs `OPEN_ENDED` drive navigation, KPIs, labels and workflows. Never show commitment/TVPI concepts to open-ended funds unless configured; never show unit dealing to closed-end funds unless they use unit accounting.
5. **Never substitute totals** — never present fund AUM as investor NAV unless the investor owns 100% of the fund.
6. **Unfunded formula** — `Unfunded Commitment = Total Commitment − Called Capital` (not paid-in).
7. **Capital-call acknowledgement ≠ payment** — acknowledgement only records that the investor saw the notice.
8. **Historical FX is immutable** — never restamp ledger FX with current spot.
9. **Estimates until dealing NAV** — subscription/redemption unit and settlement estimates must be labelled provisional.
10. **Minimum balance** — configured threshold (mock: `$1,000,000` or `100,000` units) unless full redemption.
11. **Notice period** — configured calendar days (mock: `30`) before earliest eligible dealing date.
12. **Valuation status required** — every valuation figure carries `ESTIMATED | PROVISIONAL | FINAL | RESTATED` and an as-of date. Never show unlabeled provisional values.
13. **Documents** — every view/download writes an audit event with user, timestamp and IP where available.
14. **Maker-checker on GP side** — portal shows only ISSUED/PUBLISHED investor artefacts after GP approval.
15. **Idempotent writes** — create/submit/acknowledge actions require `Idempotency-Key`.

## 3. Users and backend permissions

### 3.1 Investor Viewer

- View authorised funds, performance, activity, statements, documents, notices.
- Cannot submit dealing requests, acknowledge capital calls, change banking or manage colleagues.

### 3.2 Investor Authorised Signatory

- Viewer rights plus acknowledge capital calls, upload payment confirmations, submit subscription/redemption requests, submit service requests, acknowledge notices.
- Cannot approve internal GP accounting records.

### 3.3 Institutional Investor Administrator

- Invite / suspend / role-manage colleagues within the organisation.
- Assign fund entitlements only within the organisation's approved set.

### 3.4 Internal roles

- **Investor Relations / Fund Operations** — notices, documents, request routing (economic access separately permissioned).
- **Fund Operations Approver** — publishes capital activity / dealing / statements upstream of portal.
- **Compliance** — KYC / holds / audit; cannot alter posted investor accounting.
- **Portal Administrator** — auth/MFA/platform; no automatic economic access.

### 3.5 Recommended permission codes

```
lp.portal.access
lp.portal.switch_fund
lp.portal.view_notifications
lp.dashboard.view
lp.investments.view
lp.commitment.view
lp.capital_account.view
lp.holdings.view
lp.capital_calls.view
lp.capital_calls.acknowledge
lp.capital_calls.upload_payment_confirmation
lp.capital_calls.download_notice
lp.distributions.view
lp.distributions.download
lp.dealing.view
lp.dealing.subscribe
lp.dealing.redeem
lp.dealing.estimate
lp.performance.view
lp.performance.download_report
lp.activity.view
lp.activity.export
lp.documents.view
lp.documents.download
lp.notices.view
lp.notices.acknowledge
lp.requests.view
lp.requests.create
lp.messages.view
lp.messages.reply
lp.organisation.view
lp.organisation.manage_colleagues
lp.settings.view
lp.settings.manage_mfa
```

Auth note: investor endpoints resolve the client from the token via `lp_user_relations`. `clientId` is for GP impersonation only.

## 4. API conventions

### 4.1 Base path

- Base: `/api/lp-portal`
- Auth: Bearer LP session token

### 4.2 Success envelope

Align with existing `LpPortalResponse`:

```json
{
  "success": true,
  "message": "Capital call acknowledged",
  "data": {},
  "timestamp": "2026-07-19T10:00:00Z"
}
```

Money, quantities, rates, IRR and multiples as **decimal strings**. Prefer also `meta.requestId`.

### 4.3 List envelope

```json
{
  "success": true,
  "data": {
    "items": [],
    "page": 1,
    "pageSize": 50,
    "total": 0,
    "totalPages": 0
  }
}
```

### 4.4 Error envelope

```json
{
  "success": false,
  "message": "Redemption would breach the minimum balance.",
  "error": {
    "code": "LP_MIN_BALANCE_BREACH",
    "message": "Redemption would breach the minimum balance.",
    "fieldErrors": {
      "amount": "Remaining account value would be below $1,000,000"
    },
    "details": {
      "minBalanceAmount": "1000000",
      "remainingValue": "850000"
    },
    "retryable": false
  }
}
```

### 4.5 Common query parameters

| Param | Use |
|---|---|
| `fundId` | Entitled fund; omit or `all` for consolidated |
| `asOfDate` | `YYYY-MM-DD` |
| `presentationCurrency` | Display only — does not rewrite accounting |
| `page`, `pageSize` | `pageSize` ≤ 200 |
| `search`, `sortBy`, `sortDirection` | Registers |
| `from`, `to` | Date ranges |

### 4.6 Idempotency

Require `Idempotency-Key` for acknowledge call, payment confirmation upload, create subscription/redemption, create request, acknowledge notice, invite colleague.

Same key + same payload → original response. Same key + different payload → `409 LP_IDEMPOTENCY_KEY_REUSED`.

## 5. Operating models and fund context

```ts
type OperatingModel = "PRIVATE_CAPITAL" | "OPEN_ENDED"
type ValuationStatus = "ESTIMATED" | "PROVISIONAL" | "FINAL" | "RESTATED"
type AggregatedOperatingModel = OperatingModel | "MIXED"
```

After login resolve: organisation + person + role, entitled funds (operating model, currency, share class, as-of, valuation status), unread counters, presentation currency.

Frontend: `lp-portal-context.tsx` + sidebar model switching.

## 6. Required entities

| Entity | Purpose |
|---|---|
| `LpInvestorOrganisation` | LP legal entity |
| `LpUser` / membership | Person + role (`VIEWER`, `SIGNATORY`, `MANAGER`) |
| `LpFundEntitlement` | Fund access |
| `LpFundContext` | Operating model, currency, investor account ref |
| `LpPortfolioSnapshot` | Approved KPI snapshot |
| `LpCapitalCall` (+ investor allocation) | Notices, amounts, wiring |
| `LpDistribution` | Gross/net, type, docs |
| `LpDealingRequest` | Subscription / redemption |
| `LpDealingRules` | Min balance, notice, dealing calendar, fees |
| `LpHoldingPosition` | Units / share class / NAV |
| `LpBankAccount` | Masked banking |
| `LpLedgerTransaction` | Account activity |
| `LpPerformanceSnapshot` | IRR / multiples / series |
| `LpDocument` + download audit | Document centre |
| `LpServiceRequest` | Service tickets |
| `LpMessageThread` / `LpMessage` | Record-linked messaging |
| `LpNotice` | Announcements |
| `LpComplianceStatus` | KYC / accredited / holds |

## 7. Session and shell APIs

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/lp-portal/session` | Preferred shell bootstrap |
| `GET` | `/lp-portal/dashboard` | Existing — extend |

### Session response example

```json
{
  "success": true,
  "data": {
    "client": {
      "id": "org_001",
      "legalName": "Arcus Capital Partners LP",
      "email": "jane.smith@example.com",
      "investorId": "INV-ACP-001",
      "displayName": "Jane Smith"
    },
    "lpRole": "SIGNATORY",
    "presentationCurrency": "USD",
    "defaultAsOfDate": "2025-05-31",
    "defaultValuationStatus": "FINAL",
    "funds": [
      {
        "fundId": "growth-fund-v",
        "publicReference": "FND-AGFV",
        "fundName": "Arcus Growth Fund V, L.P.",
        "shortName": "Growth Fund V",
        "operatingModel": "PRIVATE_CAPITAL",
        "currencyCode": "USD",
        "shareClass": null,
        "asOfDate": "2025-05-31",
        "valuationStatus": "FINAL",
        "investorAccountReference": "ACC-001234"
      },
      {
        "fundId": "equity-opportunities",
        "publicReference": "FND-AEO",
        "fundName": "Arcus Equity Opportunities Fund",
        "shortName": "Equity Opportunities",
        "operatingModel": "OPEN_ENDED",
        "currencyCode": "USD",
        "shareClass": "Class A",
        "asOfDate": "2025-05-31",
        "valuationStatus": "FINAL",
        "investorAccountReference": "ACC-EO-8891"
      }
    ],
    "unreadCounts": {
      "requests": 3,
      "messages": 2,
      "notices": 5,
      "notifications": 6
    }
  }
}
```

**FE verify:** topbar fund switcher, as-of, FINAL, bell badge; sidebar private vs open-ended trees.

## 8. Dashboard APIs

| Method | Path |
|---|---|
| `GET` | `/lp-portal/dashboard?fundId&asOfDate&presentationCurrency` |
| `GET` | `/lp-portal/dashboard/actions` |
| `GET` | `/lp-portal/dashboard/activity/recent?limit=` |
| `GET` | `/lp-portal/performance/history?fundId&period=SI\|3Y\|1Y\|YTD` |

### Dashboard summary example

```json
{
  "asOfDate": "2025-05-31",
  "valuationStatus": "FINAL",
  "kpis": {
    "totalCommitment": "312500000",
    "paidIn": "156420000",
    "unfunded": "156080000",
    "currentNav": "198760000",
    "distributions": "78340000",
    "netIrr": "0.187",
    "tvpi": "1.27",
    "dpi": "0.50",
    "rvpi": "0.77",
    "investmentCount": 18
  },
  "openEndedSummary": {
    "accountValue": "24680000",
    "unitsHeld": "2468311.45",
    "navPerUnit": "9.9987",
    "ytdReturn": "0.086"
  }
}
```

### Action item

```json
{
  "id": "act_01",
  "type": "CAPITAL_CALL_DUE",
  "severity": "HIGH",
  "title": "Capital Call #7 due Jun 5, 2025",
  "fundId": "growth-fund-v",
  "relatedRecordId": "cc-7",
  "href": "/lp-portal/capital-activity?tab=calls",
  "dueDate": "2025-06-05"
}
```

Types: `CAPITAL_CALL_DUE`, `DOCUMENT_REQUIRES_SIGNATURE`, `KYC_UPDATE`, `SUBSCRIPTION_AWAITING_FUNDS`, `REDEMPTION_UNDER_REVIEW`, `NOTICE_REQUIRES_ACK`.

**FE:** `/lp-portal` — `lp-portal-dashboard-screen.tsx`

## 9. Capital Calls APIs

Statuses: `DRAFT` (hidden) → `ISSUED` → `ACKNOWLEDGED` → `PARTIALLY_PAID` → `PAID` / `OVERDUE` / `CANCELLED`.

| Method | Path | Permission |
|---|---|---|
| `GET` | `/lp-portal/capital-calls?fundId&status&page` | view |
| `GET` | `/lp-portal/capital-calls/{id}` | view |
| `GET` | `/lp-portal/capital-calls/summary?fundId` | KPIs |
| `POST` | `/lp-portal/capital-calls/{id}/acknowledge` | acknowledge |
| `POST` | `/lp-portal/capital-calls/{id}/payment-confirmations` | multipart |
| `GET` | `/lp-portal/capital-calls/{id}/notice/download` | blob |
| `GET` | `/lp-portal/capital-calls/{id}/documents` | linked docs |

### Detail example

```json
{
  "id": "cc-7",
  "callNo": 7,
  "fundId": "growth-fund-v",
  "fundName": "Arcus Growth Fund V, L.P.",
  "issueDate": "2025-05-20",
  "dueDate": "2025-06-05",
  "currencyCode": "USD",
  "amount": "6250000.00",
  "paid": "0.00",
  "outstanding": "6250000.00",
  "status": "ISSUED",
  "acknowledgedAt": null,
  "wiring": {
    "bankName": "JPMorgan Chase Bank, N.A.",
    "accountName": "Arcus Growth Fund V, L.P.",
    "accountNumber": "123456789",
    "accountNumberMasked": "••••6789",
    "abaRouting": "021000021",
    "reference": "AGFV Call 7 – Investor ID ACC-001234"
  },
  "timeline": [
    { "code": "ISSUED", "at": "2025-05-20T09:00:00Z", "completed": true },
    { "code": "ACKNOWLEDGED", "at": null, "completed": false },
    { "code": "PAYMENT_RECEIVED", "at": null, "completed": false },
    { "code": "CLOSED", "at": null, "completed": false }
  ]
}
```

### Acknowledge

```http
POST /api/lp-portal/capital-calls/cc-7/acknowledge
Idempotency-Key: ack-cc7-jane-20250719
```

```json
{ "acknowledgedAt": "2025-05-21T14:22:00Z" }
```

Errors: `LP_CALL_NOT_ISSUED`, `LP_CALL_ALREADY_ACKNOWLEDGED`, `LP_FORBIDDEN`.

**Product rule:** acknowledgement ≠ payment.

**FE:** `/lp-portal/capital-activity?tab=calls`

## 10. Distributions APIs

| Method | Path |
|---|---|
| `GET` | `/lp-portal/distributions?fundId&from&to&page` |
| `GET` | `/lp-portal/distributions/{id}` |
| `GET` | `/lp-portal/distributions/{id}/download` |
| `GET` | `/lp-portal/distributions/statement/download?asOfDate` |

```json
{
  "id": "dist-008",
  "reference": "DIST-008",
  "fundId": "growth-fund-v",
  "paymentDate": "2025-03-20",
  "type": "RETURN_OF_CAPITAL",
  "currencyCode": "USD",
  "gross": "500000.00",
  "adjustments": "10000.00",
  "netPaid": "490000.00",
  "status": "PAID",
  "destinationBankMasked": "JPMorgan Chase •••• 6789",
  "documentId": "doc_dist_008"
}
```

Types: `RETURN_OF_CAPITAL`, `REALISATION_PROCEEDS`, `DIVIDEND`, `INTEREST`, `INCOME`, `OTHER`.

## 11. Account Activity APIs

| Method | Path |
|---|---|
| `GET` | `/lp-portal/account-activity` |
| `GET` | `/lp-portal/account-activity/{id}` |
| `GET` | `/lp-portal/account-activity/export?format=csv\|xlsx\|pdf` |
| `GET` | `/lp-portal/ledger` | keep as alias during migration |

Filters: `fundId`, `type`, `currency`, `structure`, `status`, `from`, `to`, `search`, `page`.

```json
{
  "id": "txn-1007",
  "transactionDate": "2025-07-08",
  "effectiveDate": "2025-08-03",
  "fundId": "equity-opportunities",
  "structure": "OPEN_ENDED",
  "type": "REDEMPTION_REQUEST",
  "reference": "RDM-016",
  "originalCurrency": "USD",
  "originalAmount": "-250000.00",
  "reportingCurrency": "USD",
  "reportingAmount": "-250000.00",
  "exchangeRate": "1",
  "fxDate": "2025-07-08",
  "status": "UNDER_REVIEW",
  "postedDate": null,
  "notes": "Indicative amount. Final settlement will use the approved dealing-date NAV.",
  "documents": [{ "documentId": "doc_rdm_016", "name": "RDM-016 Request.pdf" }]
}
```

Rules: unposted rows excluded from settled cash-flow totals; FX immutable; investors cannot edit.

**FE:** `/lp-portal/account-activity`

## 12. Subscriptions & Redemptions APIs

| Method | Path |
|---|---|
| `GET` | `/lp-portal/dealing/overview?fundId` |
| `GET` | `/lp-portal/dealing/rules?fundId` |
| `GET` | `/lp-portal/dealing/requests?type&status&page` |
| `POST` | `/lp-portal/dealing/subscriptions/estimate` |
| `POST` | `/lp-portal/dealing/subscriptions` | multipart allowed |
| `POST` | `/lp-portal/dealing/redemptions/estimate` |
| `POST` | `/lp-portal/dealing/redemptions` |
| `GET` | `/lp-portal/bank-accounts?fundId` |

### Overview + rules

```json
{
  "fundId": "equity-opportunities",
  "shareClass": "Class A",
  "asOfDate": "2025-05-31",
  "valuationStatus": "FINAL",
  "navPerUnit": "9.9987",
  "accountValue": "24680000.00",
  "unitsHeld": "2468311.45",
  "availableToRedeemValue": "18350000.00",
  "availableUnits": "1835167.32",
  "pendingSubscriptions": "2500000.00",
  "pendingRedemptions": "1200000.00",
  "rules": {
    "minBalanceAmount": "1000000.00",
    "minBalanceUnits": "100000",
    "noticeDays": 30,
    "dealingFrequency": "MONTHLY_LAST_BUSINESS_DAY",
    "nextEligibleDealingDate": "2025-06-30",
    "settlementLagDays": 3,
    "subscription": {
      "mgmtFeeRate": "0.01",
      "otherFeeFlat": "5000.00",
      "maxFileMb": 25
    },
    "redemption": {
      "feeRate": "0.00208613",
      "modes": ["AMOUNT", "UNITS", "FULL"]
    }
  },
  "compliance": {
    "accreditedInvestor": true,
    "kycStatus": "APPROVED",
    "noUnsettledCapitalCalls": true,
    "noLegalHolds": true,
    "blockers": [],
    "termsUrl": "https://…"
  }
}
```

`GET /lp-portal/dealing/rules` powers the single **Validation Rules** card (min balance, notice, dealing frequency, compliance checks, View Full Terms).

### Subscription estimate request/response

```json
{ "fundId": "equity-opportunities", "shareClass": "Class A", "amount": "2000000.00", "currency": "USD" }
```

```json
{
  "navPerUnit": "9.9987",
  "estimatedUnits": "200026.00",
  "managementFee": "20000.00",
  "otherFees": "5000.00",
  "estimatedTotalInvestment": "2025000.00",
  "isEstimate": true,
  "disclaimer": "Final allocation will be based on the NAV on the applicable dealing date and may differ."
}
```

Authoritative: `Units Allocated = Net Subscription Amount / NAV Per Unit` after share-class fees.

### Create subscription (multipart)

Fields: `fundId`, `shareClass`, `amount`, `currency`, `expectedFundingDate`, `sourceBankAccountId`, `files[]`, `investorNotes?`.

Statuses: `SUBMITTED`, `COMPLIANCE_REVIEW`, `AWAITING_FUNDS`, `FUNDS_RECEIVED`, `AWAITING_NAV`, `ALLOCATED`, `REJECTED`, `CANCELLED`.

### Redemption estimate

```json
{ "fundId": "equity-opportunities", "mode": "AMOUNT", "amount": "1000000.00", "full": false }
```

```json
{
  "estimatedUnitsToCancel": "100013.19",
  "estimatedSettlementAmount": "997913.87",
  "earliestDealingDate": "2025-06-30",
  "estimatedSettlementDate": "2025-07-03",
  "noticeDays": 30,
  "aboveMinBalance": true,
  "isEstimate": true
}
```

### Create redemption

```json
{
  "fundId": "equity-opportunities",
  "shareClass": "Class A",
  "mode": "amount",
  "amount": "1000000.00",
  "earliestDealingDate": "2025-06-30"
}
```

Hard validations: `LP_ACCOUNT_INACTIVE`, `LP_NOTICE_PERIOD`, `LP_INSUFFICIENT_UNITS`, `LP_MIN_BALANCE_BREACH`, `LP_COMPLIANCE_HOLD`, `LP_DEALING_SUSPENDED`.

**FE:** `/lp-portal/subscriptions-redemptions`

## 13. Performance APIs

| Method | Path |
|---|---|
| `GET` | `/lp-portal/performance?fundId&period&benchmark&asOfDate` |
| `GET` | `/lp-portal/performance/history?fundId&range=SI\|1Y\|3Y\|5Y\|10Y\|MAX` |
| `GET` | `/lp-portal/performance/benchmarks?metric=NET_IRR\|TVPI` |
| `GET` | `/lp-portal/performance/by-fund?asOfDate` |
| `GET` | `/lp-portal/performance/report/download` |

Private-capital formulas (backend authoritative):

| Metric | Formula |
|---|---|
| DPI | Cumulative Distributions / Paid-In |
| RVPI | Residual NAV / Paid-In |
| TVPI | (Distributions + Residual NAV) / Paid-In |
| Net IRR | Dated cash flows + ending NAV terminal |

Open-ended: 1M/3M/YTD/1Y/SI; NAV return = end NAV/unit ÷ begin NAV/unit − 1; total return uses fund-approved methodology.

Every payload includes snapshot metadata: `calculationDate`, `asOfDate`, `version`, `sourceModule`, `valuationStatus`, `approvedBy`, `reportingCurrency`.

History point: `{ "date", "label", "nav", "paidIn", "distributions" }` as decimal strings.

**FE:** `/lp-portal/performance`

## 14. Document Centre APIs

| Method | Path |
|---|---|
| `GET` | `/lp-portal/documents?fundId&category&q&page` |
| `GET` | `/lp-portal/documents/{id}` |
| `GET` | `/lp-portal/documents/{id}/download` |
| `GET` | `/lp-portal/documents/{id}/preview` |
| `GET` | `/lp-portal/vault` | migrate/unify |

Categories: `STATEMENTS`, `CAPITAL_CALLS`, `DISTRIBUTIONS`, `FUND_REPORTS`, `TAX`, `LEGAL`, `GOVERNANCE`, `NOTICES`, `SUBSCRIPTION`, `REDEMPTION`, `OTHER`.

Statuses: `PUBLISHED`, `REQUIRES_SIGNATURE`, `SUPERSEDED`, `RESTATED`, `WITHDRAWN`.

```json
{
  "id": "doc_901",
  "name": "Q1 2025 Investor Report.pdf",
  "fundId": "growth-fund-v",
  "category": "FUND_REPORTS",
  "period": "2025-Q1",
  "publishedDate": "2025-04-30",
  "version": "1.0",
  "status": "PUBLISHED",
  "accessScope": "INVESTOR_ORGANISATION",
  "checksumSha256": "…",
  "permissions": ["VIEW", "DOWNLOAD"],
  "history": [
    { "user": "Jane Smith", "action": "DOWNLOAD", "at": "2025-05-02T11:00:00Z", "ip": "203.0.113.10" }
  ]
}
```

Every download/preview appends audit history.

**FE:** `/lp-portal/documents`

## 15. Requests APIs

| Method | Path |
|---|---|
| `GET` | `/lp-portal/requests?fundId&status&type&page` |
| `GET` | `/lp-portal/requests/{reference}` |
| `POST` | `/lp-portal/requests` |
| `POST` | `/lp-portal/requests/{reference}/messages` |

```json
{
  "type": "CAPITAL_ACTIVITY",
  "fundId": "growth-fund-v",
  "subject": "Confirm payment reference for Call 7",
  "priority": "HIGH",
  "description": "Please confirm wiring reference format.",
  "attachmentIds": []
}
```

Types: `ACCOUNT_STATEMENT`, `CAPITAL_ACTIVITY`, `OPEN_ENDED_ACTIVITY`, `PROFILE_ACCESS`.  
Statuses: `SUBMITTED`, `UNDER_REVIEW`, `AWAITING_INVESTOR`, `ASSIGNED`, `RESOLVED`, `CLOSED`.

## 16. Messages APIs

| Method | Path |
|---|---|
| `GET` | `/lp-portal/messages/threads` |
| `GET` | `/lp-portal/messages/threads/{id}` |
| `POST` | `/lp-portal/messages/threads/{id}/replies` |
| `POST` | `/lp-portal/messages/threads/{id}/read` |

```json
{ "body": "Attached is the updated wiring confirmation.", "attachmentIds": ["att_12"] }
```

Threads link to fund + optional call/distribution/dealing/statement/request/document. Auditable service record — not a social chat.

**FE:** `/lp-portal/requests` and `?tab=messages`

## 17. Notices APIs

| Method | Path |
|---|---|
| `GET` | `/lp-portal/notices` |
| `GET` | `/lp-portal/notices/{id}` |
| `POST` | `/lp-portal/notices/{id}/acknowledge` |

States: `PUBLISHED`, `DELIVERED`, `OPENED`, `ACKNOWLEDGED`. Target: all / fund / share class / organisation / user.

## 18. Organisation and colleagues

| Method | Path |
|---|---|
| `GET` | `/lp-portal/organisation` |
| `GET` | `/lp-portal/colleagues` | existing |
| `POST` | `/lp-portal/colleagues` | `{ "email", "role", "fundIds" }` |
| `PATCH` | `/lp-portal/colleagues/{membershipId}` | role/funds |
| `PATCH` | `/lp-portal/colleagues/{membershipId}/revoke` | existing |

Roles: `VIEWER`, `SIGNATORY`, `MANAGER`. Statuses: `INVITED`, `ACTIVE`, `SUSPENDED`.  
Manager-gated (maps legacy `LP_MANAGER` / `ADMIN`).

GP admin remains `/lp-portal/admin/*`.

## 19. Settings

| Method | Path |
|---|---|
| `GET` | `/lp-portal/settings` |
| `PATCH` | `/lp-portal/settings/notifications` |
| `GET` | `/lp-portal/settings/mfa` |

## 20. Async jobs

```http
POST /api/lp-portal/jobs/performance-report
→ { "jobId": "job_01", "status": "QUEUED" }

GET /api/lp-portal/jobs/{jobId}
→ { "status": "READY", "downloadUrl": "…" }
```

Use jobs for multi-fund packs; direct blobs OK for notices/single PDFs.

## 21. Audit requirements

Log: login/fund switch, capital-call ack, payment upload (hash), dealing submit (payload hash + estimate snapshot id), document view/download, request/message, notice ack, colleague invite/revoke.

Recommend ≥ 7 year retention for investor financial artefacts.

## 22. Required error codes

| Code | HTTP | Meaning |
|---|---|---|
| `LP_UNAUTHORIZED` | 401 | Auth |
| `LP_FORBIDDEN` | 403 | Entitlement/role |
| `LP_NOT_FOUND` | 404 | Missing / not entitled |
| `LP_VALIDATION` | 422 | Fields |
| `LP_IDEMPOTENCY_KEY_REUSED` | 409 | Idempotency |
| `LP_VERSION_CONFLICT` | 409 | Stale write |
| `LP_CALL_NOT_ISSUED` | 409 | Ack not allowed |
| `LP_CALL_ALREADY_ACKNOWLEDGED` | 409 | Duplicate ack |
| `LP_ACCOUNT_INACTIVE` | 409 | Dealing blocked |
| `LP_NOTICE_PERIOD` | 422 | Date too early |
| `LP_INSUFFICIENT_UNITS` | 422 | Over-redeem |
| `LP_MIN_BALANCE_BREACH` | 422 | Min residual |
| `LP_COMPLIANCE_HOLD` | 403 | KYC/holds/unsettled calls |
| `LP_DEALING_SUSPENDED` | 403 | Fund gate |
| `LP_FILE_TOO_LARGE` | 413 | Upload |
| `LP_UNSUPPORTED_MEDIA` | 415 | File type |
| `LP_EXPORT_FAILED` | 500 | Export/job |

## 23. Non-functional requirements

- P95 session + dashboard ≤ 500ms (snapshots cacheable).
- Server-side pagination for activity/documents/requests.
- Virus-scan uploads; prefer signed URLs for downloads.
- Preserve transaction / fund-base / reporting / display currencies distinctly.
- Same SLA as existing `/lp-portal` surface.

## 24. Delivery priorities

### Phase 1 — Shell + capital money movement

Session/entitlements/unread; dashboard KPIs + actions; capital calls (+ ack/upload/download); distributions; basic account activity.

### Phase 2 — Open-ended dealing

Overview/rules/compliance; estimate + submit subscription/redemption; request history; bank accounts.

### Phase 3 — Performance + documents

Snapshots, history, benchmarks, by-fund, report download; document centre + audit (unify vault); notices.

### Phase 4 — Service + organisation

Requests/messages; organisation colleague admin; settings/notifications; export job framework.

## 25. Backend acceptance criteria

1. No IDOR across investors/organisations.
2. Open-ended context omits private-capital-only KPIs unless configured.
3. Unfunded = commitment − called (unit-tested).
4. Acknowledge never marks call PAID.
5. Min-balance redemption rejected unless FULL.
6. Estimates always `isEstimate: true` and never commit allocated units.
7. Document download appends audit history.
8. Historic ledger FX does not change after FX table updates.
9. Superseded/restated statements remain visible with status.
10. Write endpoints honour idempotency keys.

## 26. Frontend verification map

| Capability | FE |
|---|---|
| Session / fund / as-of / FINAL / badges | `lp-portal-topbar.tsx`, `lp-portal-context.tsx` |
| Nav by operating model | `lp-portal-sidebar.tsx` |
| Dashboard | `/lp-portal` |
| Capital calls / distributions | `/lp-portal/capital-activity` |
| Subscriptions / redemptions + validation card | `/lp-portal/subscriptions-redemptions` |
| Performance | `/lp-portal/performance` |
| Account activity | `/lp-portal/account-activity` |
| Documents / statements | `/lp-portal/documents` |
| Requests / messages | `/lp-portal/requests` |
| Organisation / Settings | `/lp-portal/organisation`, `/lp-portal/settings` |

## 27. Relationship to existing APIs

| Existing | Action |
|---|---|
| `GET /lp-portal/dashboard` | Extend to Phase 1 shape; keep backward-compatible fields |
| `GET /lp-portal/ledger*` | Superset → account-activity; keep aliases |
| `GET /lp-portal/vault*` | Fold into documents; keep verify |
| `GET /lp-portal/reports*` | Map into statements/documents + performance |
| Colleagues endpoints | Keep; extend invite with role + fundIds |
| `/lp-portal/admin/*` | GP/admin only |
| `capital-calls-api` (fund ops) | Source of published investor allocations |

## 28. Important implementation note

Do **not** rebuild valuation, cash matching, IRR or NAV allocation inside the portal service. Consume approved snapshots and published dealing outcomes from Fund Accounting / Valuation / Capital Calls / Dealing engines.

Portal owns: entitlement filtering, investor workflow state (ack, upload, submit), messaging/requests, document delivery audit, and presentation of approved snapshots.

---

**Document owner:** Frontend / Product (contract proposed from FE mocks + UI SRD)  
**Consumers:** Backend engineering, QA, Investor Relations ops  
**Companion UI SRD:** `design-refs/lp-portal-srd-ui-requirements.md`  
**Pattern reference:** `design-refs/investments-v2-backend-srd.md`
