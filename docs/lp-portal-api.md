# LP Portal API

**Base URL:** `/api/lp-portal`  
**Auth:** `Authorization: Bearer <token>`  
**Endpoints documented:** 68  
**Product SRD:** [lp_portal_srd.md](./lp_portal_srd.md)  
**Seed (DEV nts):** `npm run db:seed:lp-portal-srd`  
**UAT:** `npm run uat:lp-portal:phase1` … `phase4`, `uat:lp-portal:srd-acceptance`

Every live route below includes permission, headers, query (if any), **request body**, and **response body**.

Demo logins after seed: `lp.signatory@example.com` / `lp.viewer@example.com` · `Password123!`  
GP impersonation: append `?clientId=<clientId>` on investor routes.

---

## Conventions

### Success envelope

```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

### List envelope

```json
{
  "success": true,
  "data": {
    "items": [],
    "page": 1,
    "pageSize": 50,
    "total": 0,
    "totalPages": 0
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

### Error envelope

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
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

### Rules

- Money / qty / multiples / rates are **decimal strings** (e.g. `"6250000.00"`).
- `Idempotency-Key` required where marked (8–200 printable ASCII). Same key + different body → `409 LP_IDEMPOTENCY_KEY_REUSED`.
- Capital call `:id` is the investor **allocation id**, not the GP call header id.
- Acknowledge never marks a call `PAID`. Unfunded = Commitment − Called (not paid-in).

### Roles

| Role | Capability |
|------|------------|
| `VIEWER` | Read + estimates |
| `SIGNATORY` | Ack calls, dealing, notices, requests, messages |
| `MANAGER` | + colleague invite / patch / revoke |
| GP admin | `/admin/*` + `?clientId=` impersonation |

---

## Session & dashboard

### `GET /api/lp-portal/dashboard`

- **Permission:** `lp.dashboard.view`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_growth_v&asOfDate=2025-05-31&presentationCurrency=USD`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "asOfDate": "2025-05-31",
    "valuationStatus": "FINAL",
    "kpis": {
      "totalCommitment": "312500000.00",
      "paidIn": "156420000.00",
      "unfunded": "156080000.00",
      "currentNav": "198760000.00",
      "distributions": "78340000.00",
      "netIrr": "0.1870",
      "tvpi": "1.2700",
      "dpi": "0.5000",
      "rvpi": "0.7700",
      "investmentCount": 14
    },
    "openEndedSummary": {
      "accountValue": "24680000.00",
      "unitsHeld": "2468311.450000",
      "navPerUnit": "9.99870000",
      "ytdReturn": "0.0425"
    }
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/dashboard/actions`

- **Permission:** `lp.dashboard.view`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "act_cc_cca_alloc_001",
        "type": "CAPITAL_CALL_DUE",
        "severity": "MEDIUM",
        "title": "Capital Call #531 due 2025-06-15",
        "fundId": "fund_arcus_growth_v",
        "relatedRecordId": "cca_alloc_001",
        "href": "/lp-portal/capital-activity?tab=calls",
        "dueDate": "2025-06-15"
      },
      {
        "id": "act_notice_ntc_001",
        "type": "NOTICE_REQUIRES_ACK",
        "severity": "MEDIUM",
        "title": "Quarterly investor letter — Q1 2025",
        "fundId": "fund_arcus_growth_v",
        "relatedRecordId": "ntc_001",
        "href": "/lp-portal/documents?tab=notices",
        "dueDate": null
      }
    ]
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/dashboard/activity/recent`

- **Permission:** `lp.activity.view`
- **Headers:** `Authorization`
- **Query:** `limit=10`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "actv_cc_cca_alloc_001",
        "type": "CAPITAL_CALL",
        "title": "Capital call — Arcus Growth Fund V",
        "fundId": "fund_arcus_growth_v",
        "amount": "6250000.00",
        "status": "ISSUED",
        "at": "2025-05-28T14:00:00.000Z"
      },
      {
        "id": "actv_dist_da_alloc_001",
        "type": "DISTRIBUTION",
        "title": "Distribution — Arcus Growth Fund V",
        "fundId": "fund_arcus_growth_v",
        "amount": "1250000.00",
        "status": "PAID",
        "at": "2025-05-20T09:30:00.000Z"
      }
    ]
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/session`

- **Permission:** `lp.portal.access`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "client": {
      "id": "cl_arcus_lp_001",
      "legalName": "Arcus Capital Partners LP",
      "email": "lp-arcus-portal@example.com",
      "investorId": "LP-ARCUS-001",
      "displayName": "Jane Signatory"
    },
    "lpRole": "SIGNATORY",
    "presentationCurrency": "USD",
    "defaultAsOfDate": "2025-05-31",
    "defaultValuationStatus": "FINAL",
    "funds": [
      {
        "fundId": "fund_arcus_growth_v",
        "publicReference": "AGF-V",
        "fundName": "Arcus Growth Fund V",
        "shortName": "Growth V",
        "operatingModel": "PRIVATE_CAPITAL",
        "currencyCode": "USD",
        "shareClass": null,
        "asOfDate": "2025-05-31",
        "valuationStatus": "FINAL",
        "investorAccountReference": "LP-ARCUS-001-GV",
        "commitmentAmount": "312500000.00"
      },
      {
        "fundId": "fund_arcus_income_oe",
        "publicReference": "AIOF",
        "fundName": "Arcus Income Opportunities Fund",
        "shortName": "Income OE",
        "operatingModel": "OPEN_ENDED",
        "currencyCode": "USD",
        "shareClass": "Class A",
        "asOfDate": "2025-05-31",
        "valuationStatus": "FINAL",
        "investorAccountReference": "LP-ARCUS-001-IO",
        "commitmentAmount": "25000000.00"
      }
    ],
    "unreadCounts": {
      "requests": 1,
      "messages": 1,
      "notices": 1,
      "notifications": 3
    }
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

## Capital calls

### `GET /api/lp-portal/capital-calls`

- **Permission:** `lp.capital_calls.view`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_growth_v&status=ISSUED&page=1&pageSize=20`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "cca_alloc_001",
        "callNo": 531,
        "fundId": "fund_arcus_growth_v",
        "fundName": "Arcus Growth Fund V",
        "issueDate": "2025-05-28",
        "dueDate": "2025-06-15",
        "currencyCode": "USD",
        "amount": "6250000.00",
        "paid": "0.00",
        "outstanding": "6250000.00",
        "status": "ISSUED",
        "acknowledgedAt": null
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/capital-calls/:id`

- **Permission:** `lp.capital_calls.view`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cca_alloc_001",
    "callNo": 531,
    "fundId": "fund_arcus_growth_v",
    "fundName": "Arcus Growth Fund V",
    "issueDate": "2025-05-28",
    "dueDate": "2025-06-15",
    "currencyCode": "USD",
    "amount": "6250000.00",
    "paid": "0.00",
    "outstanding": "6250000.00",
    "status": "ISSUED",
    "acknowledgedAt": null,
    "wiring": {
      "bankName": "First National Bank",
      "accountName": "Arcus Growth Fund V Collection Account",
      "accountNumber": null,
      "accountNumberMasked": "••••4821",
      "abaRouting": "021000089",
      "reference": "Arcus Growth Fund V Call 531 – Investor",
      "raw": null
    },
    "timeline": [
      {
        "code": "ISSUED",
        "at": "2025-05-28T08:00:00.000Z",
        "completed": true
      },
      {
        "code": "ACKNOWLEDGED",
        "at": null,
        "completed": false
      },
      {
        "code": "PAYMENT_RECEIVED",
        "at": null,
        "completed": false
      },
      {
        "code": "CLOSED",
        "at": null,
        "completed": false
      }
    ]
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `POST /api/lp-portal/capital-calls/:id/acknowledge`

- **Permission:** `lp.capital_calls.acknowledge`
- **Headers:** `Authorization`, `Idempotency-Key`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "acknowledgedAt": "2025-06-01T10:00:00.000Z"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

_Does not set amountPaid or allocation status to PAID_

---

### `GET /api/lp-portal/capital-calls/:id/documents`

- **Permission:** `lp.capital_calls.view`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "doc_call_notice_001",
      "name": "Capital Call #531 Notice",
      "category": "CALL_NOTICE",
      "publishedDate": "2025-05-28",
      "checksumSha256": "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
      "status": "PUBLISHED"
    }
  ],
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/capital-calls/:id/notice/download`

- **Permission:** `lp.capital_calls.download_notice`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

_Binary notice file (text/plain stub or PDF); Content-Disposition attachment_

---

### `POST /api/lp-portal/capital-calls/:id/payment-confirmations`

- **Permission:** `lp.capital_calls.upload_payment_confirmation`
- **Headers:** `Authorization`, `Idempotency-Key`, `Content-Type: multipart/form-data`

**Request body**

_Multipart form-data_

```json
{
  "file": "<wire confirmation PDF>",
  "amountClaimed": "6250000.00",
  "notes": "Wire sent 2025-06-10 ref ARCUS-CC531"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "payconf_001",
    "fileName": "wire-confirmation.pdf",
    "sha256": "a3f5c8d9e2b1479086f5a4c3d2e1b0a9876543210fedcba9876543210abcdef12",
    "amountClaimed": "6250000.00",
    "uploadedAt": "2025-06-10T16:45:00.000Z"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/capital-calls/summary`

- **Permission:** `lp.capital_calls.view`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_growth_v`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "openCount": 1,
    "outstanding": "6250000.00",
    "overdue": "0.00",
    "paidYtd": "0.00",
    "currencyCode": "USD"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

## Distributions

### `GET /api/lp-portal/distributions`

- **Permission:** `lp.distributions.view`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_growth_v&page=1&pageSize=20`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "da_alloc_001",
        "reference": "DIST-001234",
        "fundId": "fund_arcus_growth_v",
        "fundName": "Arcus Growth Fund V",
        "paymentDate": "2025-05-20",
        "type": "REALISATION_PROCEEDS",
        "currencyCode": "USD",
        "gross": "1250000.00",
        "adjustments": "0.00",
        "netPaid": "1250000.00",
        "status": "PAID",
        "destinationBankMasked": null,
        "documentId": null
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/distributions/:id`

- **Permission:** `lp.distributions.view`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "da_alloc_001",
    "reference": "DIST-001234",
    "fundId": "fund_arcus_growth_v",
    "fundName": "Arcus Growth Fund V",
    "paymentDate": "2025-05-20",
    "type": "REALISATION_PROCEEDS",
    "currencyCode": "USD",
    "gross": "1250000.00",
    "adjustments": "0.00",
    "netPaid": "1250000.00",
    "status": "PAID",
    "destinationBankMasked": null,
    "documentId": null
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/distributions/:id/download`

- **Permission:** `lp.distributions.download`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

_Binary distribution notice; Content-Disposition attachment_

---

### `GET /api/lp-portal/distributions/statement/download`

- **Permission:** `lp.distributions.download`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_growth_v&asOfDate=2025-05-31`

**Request body**

_None_

**Response body**

_Binary distribution statement (text/plain stub); Content-Disposition attachment_

---

## Account activity & ledger

### `GET /api/lp-portal/account-activity`

- **Permission:** `lp.activity.view`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_growth_v&from=2025-01-01&to=2025-05-31&currency=USD&page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "entryId": "cca_alloc_001",
        "entryType": "CAPITAL_CALL",
        "fundId": "fund_arcus_growth_v",
        "fundName": "Arcus Growth Fund V",
        "transactionDate": "2025-05-28",
        "amount": "6250000.00",
        "currency": "USD",
        "description": "Capital call — 2.00%",
        "status": "ISSUED"
      },
      {
        "entryId": "da_alloc_001",
        "entryType": "DISTRIBUTION",
        "fundId": "fund_arcus_growth_v",
        "fundName": "Arcus Growth Fund V",
        "transactionDate": "2025-05-20",
        "amount": "1250000.00",
        "currency": "USD",
        "description": "Distribution declared",
        "status": "PAID"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 2,
    "totalPages": 1
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/account-activity/export`

- **Permission:** `lp.activity.export`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_growth_v&from=2025-01-01&to=2025-05-31&format=csv`

**Request body**

_None_

**Response body**

_Default format=csv returns text/csv attachment account-activity.csv_

---

### `GET /api/lp-portal/ledger`

- **Permission:** `lp.activity.view`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_growth_v&from=2025-01-01&to=2025-05-31&currency=USD`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "entryId": "cca_alloc_001",
      "entryType": "CAPITAL_CALL",
      "fundId": "fund_arcus_growth_v",
      "fundName": "Arcus Growth Fund V",
      "transactionDate": "2025-05-28",
      "amount": "6250000.00",
      "currency": "USD",
      "description": "Capital call — 2.00%",
      "status": "ISSUED"
    }
  ],
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/ledger/:entryId`

- **Permission:** `lp.activity.view`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "entryType": "CAPITAL_CALL",
    "allocation": {
      "id": "cca_alloc_001",
      "clientId": "cl_arcus_lp_001",
      "currentCallAmount": "6250000.00",
      "amountPaid": "0.00",
      "status": "ISSUED"
    },
    "payments": [],
    "callNoticeDocumentId": "doc_call_notice_001"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

## Dealing (subscriptions & redemptions)

### `GET /api/lp-portal/dealing/bank-accounts`

- **Permission:** `lp.dealing.view`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_income_oe`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "bank_acct_001",
      "label": "Primary USD account",
      "bankName": "Chase Bank",
      "accountName": "Arcus Capital Partners LP",
      "accountNumberMasked": "••••7890",
      "currencyCode": "USD",
      "isDefault": true,
      "fundId": null,
      "status": "ACTIVE"
    }
  ],
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/dealing/overview`

- **Permission:** `lp.dealing.view`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_income_oe`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "fundId": "fund_arcus_income_oe",
    "shareClass": "Class A",
    "asOfDate": "2025-05-31",
    "valuationStatus": "FINAL",
    "navPerUnit": "9.99870000",
    "accountValue": "24680000.00",
    "unitsHeld": "2468311.450000",
    "availableToRedeemValue": "23680000.00",
    "availableUnits": "2368311.450000",
    "pendingSubscriptions": "0.00",
    "pendingRedemptions": "0.00",
    "rules": {
      "minBalanceAmount": "1000000.00",
      "minBalanceUnits": "100000.000000",
      "noticeDays": 30,
      "dealingFrequency": "MONTHLY_LAST_BUSINESS_DAY",
      "nextEligibleDealingDate": "2025-06-30",
      "settlementLagDays": 3,
      "subscription": {
        "mgmtFeeRate": "0.000000",
        "otherFeeFlat": "0.00",
        "maxFileMb": 25
      },
      "redemption": {
        "feeRate": "0.00000000",
        "modes": [
          "AMOUNT",
          "UNITS",
          "FULL"
        ]
      }
    },
    "compliance": {
      "accreditedInvestor": true,
      "kycStatus": "CLEAR",
      "noUnsettledCapitalCalls": true,
      "noLegalHolds": true,
      "blockers": [],
      "termsUrl": null,
      "holdReason": null
    }
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `POST /api/lp-portal/dealing/redemptions`

- **Permission:** `lp.dealing.redeem`
- **Headers:** `Authorization`, `Idempotency-Key`

**Request body**

```json
{
  "fundId": "fund_arcus_income_oe",
  "shareClass": "Class A",
  "mode": "FULL",
  "full": true,
  "earliestDealingDate": "2025-08-01",
  "bankAccountId": "bank_acct_001",
  "notes": "Full exit from open-ended sleeve",
  "estimateSnapshotId": "550e8400-e29b-41d4-a716-446655440004"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "deal_req_red_001",
    "fundId": "fund_arcus_income_oe",
    "requestType": "REDEMPTION",
    "status": "SUBMITTED",
    "amount": "24680000.00",
    "units": "2468311.450000",
    "redemptionMode": "FULL",
    "currencyCode": "USD",
    "requestedDealingDate": "2025-08-01",
    "estimateSnapshotId": "550e8400-e29b-41d4-a716-446655440004",
    "isEstimate": true,
    "createdAt": "2025-06-15T09:00:00.000Z",
    "notes": "Full exit from open-ended sleeve"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `POST /api/lp-portal/dealing/redemptions/estimate`

- **Permission:** `lp.dealing.estimate`
- **Headers:** `Authorization`

**Request body**

```json
{
  "fundId": "fund_arcus_income_oe",
  "shareClass": "Class A",
  "mode": "AMOUNT",
  "amount": "100000.00",
  "earliestDealingDate": "2025-08-01"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "estimateSnapshotId": "550e8400-e29b-41d4-a716-446655440003",
    "estimatedUnitsToCancel": "10001.300000",
    "estimatedSettlementAmount": "100000.00",
    "earliestDealingDate": "2025-08-01",
    "estimatedSettlementDate": "2025-08-04",
    "noticeDays": 30,
    "aboveMinBalance": true,
    "isEstimate": true,
    "redemptionFee": "0.00",
    "disclaimer": "Indicative amounts. Final settlement will use the approved dealing-date NAV."
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/dealing/requests`

- **Permission:** `lp.dealing.view`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_income_oe&type=SUBSCRIPTION&page=1&pageSize=20`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "deal_req_sub_001",
        "fundId": "fund_arcus_income_oe",
        "requestType": "SUBSCRIPTION",
        "status": "SUBMITTED",
        "amount": "50000.00",
        "units": "5001.300000",
        "redemptionMode": null,
        "currencyCode": "USD",
        "requestedDealingDate": "2025-07-15",
        "estimateSnapshotId": "550e8400-e29b-41d4-a716-446655440001",
        "isEstimate": true,
        "createdAt": "2025-06-12T11:20:00.000Z",
        "notes": "Additional allocation Q3"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/dealing/rules`

- **Permission:** `lp.dealing.view`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_income_oe`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "fundId": "fund_arcus_income_oe",
    "minBalanceAmount": "1000000.00",
    "minBalanceUnits": "100000.000000",
    "noticeDays": 30,
    "dealingFrequency": "MONTHLY_LAST_BUSINESS_DAY",
    "nextEligibleDealingDate": "2025-06-30",
    "settlementLagDays": 3,
    "subscription": {
      "mgmtFeeRate": "0.000000",
      "otherFeeFlat": "0.00",
      "maxFileMb": 25
    },
    "redemption": {
      "feeRate": "0.00000000",
      "modes": [
        "AMOUNT",
        "UNITS",
        "FULL"
      ]
    },
    "compliance": {
      "accreditedInvestor": true,
      "kycStatus": "CLEAR",
      "noLegalHolds": true,
      "blockers": []
    }
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `POST /api/lp-portal/dealing/subscriptions`

- **Permission:** `lp.dealing.subscribe`
- **Headers:** `Authorization`, `Idempotency-Key`, `Content-Type: multipart/form-data`

**Request body**

```json
{
  "fundId": "fund_arcus_income_oe",
  "shareClass": "Class A",
  "amount": "50000.00",
  "currency": "USD",
  "expectedFundingDate": "2025-07-15",
  "sourceBankAccountId": "bank_acct_001",
  "investorNotes": "Q3 top-up",
  "estimateSnapshotId": "550e8400-e29b-41d4-a716-446655440002"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "deal_req_sub_001",
    "fundId": "fund_arcus_income_oe",
    "requestType": "SUBSCRIPTION",
    "status": "SUBMITTED",
    "amount": "50000.00",
    "units": "5001.300000",
    "redemptionMode": null,
    "currencyCode": "USD",
    "requestedDealingDate": "2025-07-15",
    "estimateSnapshotId": "550e8400-e29b-41d4-a716-446655440002",
    "isEstimate": true,
    "createdAt": "2025-06-12T11:20:00.000Z",
    "notes": "Q3 top-up"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

_Optional multipart with file proof-of-funds; JSON body shown_

---

### `POST /api/lp-portal/dealing/subscriptions/estimate`

- **Permission:** `lp.dealing.estimate`
- **Headers:** `Authorization`

**Request body**

```json
{
  "fundId": "fund_arcus_income_oe",
  "shareClass": "Class A",
  "amount": "100000.00",
  "currency": "USD"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "estimateSnapshotId": "550e8400-e29b-41d4-a716-446655440002",
    "navPerUnit": "9.99870000",
    "estimatedUnits": "10001.300000",
    "managementFee": "0.00",
    "otherFees": "0.00",
    "estimatedTotalInvestment": "100000.00",
    "isEstimate": true,
    "disclaimer": "Final allocation will be based on the NAV on the applicable dealing date and may differ."
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

## Performance & jobs

### `GET /api/lp-portal/jobs/:jobId`

- **Permission:** `lp.portal.access`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "jobId": "job_perf_001",
    "jobType": "PERFORMANCE_REPORT",
    "status": "READY",
    "result": {
      "asOfDate": "2025-05-31",
      "metrics": {
        "totalCommitment": "312500000.00",
        "paidIn": "156420000.00",
        "currentNav": "198760000.00",
        "netIrr": "0.1870",
        "tvpi": "1.2700"
      }
    },
    "downloadUrl": null,
    "errorMessage": null,
    "createdAt": "2025-06-01T12:00:00.000Z",
    "completedAt": "2025-06-01T12:00:05.000Z"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `POST /api/lp-portal/jobs/performance-report`

- **Permission:** `lp.performance.download_report`
- **Headers:** `Authorization`, `Idempotency-Key`

**Request body**

```json
{
  "fundId": "fund_arcus_growth_v",
  "asOfDate": "2025-05-31",
  "period": "SI"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "jobId": "job_perf_001",
    "status": "READY",
    "createdAt": "2025-06-01T12:00:00.000Z"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/performance`

- **Permission:** `lp.performance.view`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_growth_v&period=SI&asOfDate=2025-05-31`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "asOfDate": "2025-05-31",
    "valuationStatus": "FINAL",
    "period": "SI",
    "calculationDate": "2025-05-31",
    "version": "1",
    "sourceModule": "LpFundMetricsService",
    "reportingCurrency": "USD",
    "approvedBy": null,
    "metrics": {
      "totalCommitment": "312500000.00",
      "paidIn": "156420000.00",
      "distributions": "78340000.00",
      "currentNav": "198760000.00",
      "netIrr": "0.1870",
      "tvpi": "1.2700",
      "dpi": "0.5000",
      "rvpi": "0.7700"
    },
    "byFund": [
      {
        "fundId": "fund_arcus_growth_v",
        "fundName": "Arcus Growth Fund V",
        "netIrr": "0.1870",
        "tvpi": "1.2700",
        "dpi": "0.5000",
        "rvpi": "0.7700",
        "nav": "198760000.00",
        "paidIn": "156420000.00",
        "distributions": "78340000.00"
      }
    ],
    "benchmark": null
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/performance/benchmarks`

- **Permission:** `lp.performance.view`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_growth_v&metric=NET_IRR`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "metric": "NET_IRR",
    "asOfDate": "2025-05-31",
    "valuationStatus": "FINAL",
    "series": [
      {
        "date": "2020-05-31",
        "label": "Y-5",
        "value": "0.1200"
      },
      {
        "date": "2025-05-31",
        "label": "Now",
        "value": "0.1700"
      }
    ],
    "note": "Placeholder peer benchmark series — replace with approved index when available."
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/performance/by-fund`

- **Permission:** `lp.performance.view`
- **Headers:** `Authorization`
- **Query:** `asOfDate=2025-05-31`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "asOfDate": "2025-05-31",
    "valuationStatus": "FINAL",
    "funds": [
      {
        "fundId": "fund_arcus_growth_v",
        "fundName": "Arcus Growth Fund V",
        "netIrr": "0.1870",
        "tvpi": "1.2700",
        "dpi": "0.5000",
        "rvpi": "0.7700",
        "nav": "198760000.00",
        "paidIn": "156420000.00",
        "distributions": "78340000.00"
      }
    ]
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/performance/history`

- **Permission:** `lp.performance.view`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_growth_v&period=3Y`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "asOfDate": "2025-05-31",
    "valuationStatus": "FINAL",
    "range": "3Y",
    "points": [
      {
        "date": "2022-05-31",
        "label": "−36M",
        "nav": "142500000.00",
        "paidIn": "98000000.00",
        "distributions": "22000000.00"
      },
      {
        "date": "2025-05-31",
        "label": "Now",
        "nav": "198760000.00",
        "paidIn": "156420000.00",
        "distributions": "78340000.00"
      }
    ]
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/performance/report/download`

- **Permission:** `lp.performance.download_report`
- **Headers:** `Authorization`
- **Query:** `fundId=fund_arcus_growth_v`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "jobId": "job_perf_001",
    "status": "READY",
    "createdAt": "2025-06-01T12:00:00.000Z"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

_Creates async job; poll GET /jobs/:jobId for result JSON (not a direct PDF stream)_

---

## Documents & vault

### `GET /api/lp-portal/documents`

- **Permission:** `lp.documents.view`
- **Headers:** `Authorization`
- **Query:** `category=PERFORMANCE_REPORT&fundId=fund_arcus_growth_v&q=quarterly&page=1&pageSize=20`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "doc_perf_q1_001",
        "name": "Arcus Growth Fund V — Q1 2025 Performance Report",
        "fundId": "fund_arcus_growth_v",
        "fundName": "Arcus Growth Fund V",
        "category": "PERFORMANCE_REPORT",
        "period": null,
        "publishedDate": "2025-04-15",
        "version": "1.0",
        "status": "PUBLISHED",
        "accessScope": "INVESTOR_ORGANISATION",
        "checksumSha256": "c4d5e6f7890123456789012345678901234567890abcdef1234567890abcdef1234",
        "permissions": [
          "VIEW",
          "DOWNLOAD"
        ],
        "sourceType": "FUND_REPORT_SYNC",
        "sourceRefId": "frr_job_001"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/documents/:id`

- **Permission:** `lp.documents.view`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "doc_perf_q1_001",
    "name": "Arcus Growth Fund V — Q1 2025 Performance Report",
    "fundId": "fund_arcus_growth_v",
    "fundName": "Arcus Growth Fund V",
    "category": "PERFORMANCE_REPORT",
    "period": null,
    "publishedDate": "2025-04-15",
    "version": "1.0",
    "status": "PUBLISHED",
    "accessScope": "INVESTOR_ORGANISATION",
    "checksumSha256": "c4d5e6f7890123456789012345678901234567890abcdef1234567890abcdef1234",
    "permissions": [
      "VIEW",
      "DOWNLOAD"
    ],
    "sourceType": "FUND_REPORT_SYNC",
    "sourceRefId": "frr_job_001",
    "history": [
      {
        "user": "usr_lp_signatory",
        "action": "VIEW",
        "at": "2025-06-01T08:30:00.000Z",
        "ip": "203.0.113.10"
      }
    ]
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/documents/:id/download`

- **Permission:** `lp.documents.download`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

_Binary PDF attachment; writes DOWNLOAD audit event_

---

### `GET /api/lp-portal/documents/:id/preview`

- **Permission:** `lp.documents.view`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

_Binary PDF inline (Content-Disposition inline); writes PREVIEW audit event_

---

### `GET /api/lp-portal/vault`

- **Permission:** `lp.documents.view`
- **Headers:** `Authorization`
- **Query:** `category=LEGAL&fundId=fund_arcus_growth_v&search=subscription`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "documentId": "doc_sub_agreement_001",
      "category": "LEGAL",
      "title": "Subscription Agreement — Arcus Growth Fund V",
      "fundId": "fund_arcus_growth_v",
      "fundName": "Arcus Growth Fund V",
      "publishedAt": "2023-03-15T00:00:00.000Z",
      "sourceType": "GP_UPLOAD",
      "sha256": "d5e6f7890123456789012345678901234567890abcdef1234567890abcdef12345678"
    }
  ],
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/vault/:documentId/download`

- **Permission:** `lp.documents.download`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

_Binary PDF attachment (vault alias of documents download)_

---

### `GET /api/lp-portal/vault/:documentId/verify`

- **Permission:** `lp.documents.view`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "documentId": "doc_sub_agreement_001",
    "verified": true,
    "expectedSha256": "d5e6f7890123456789012345678901234567890abcdef1234567890abcdef12345678",
    "actualSha256": "d5e6f7890123456789012345678901234567890abcdef1234567890abcdef12345678"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

## Notices

### `GET /api/lp-portal/notices`

- **Permission:** `lp.notices.view`
- **Headers:** `Authorization`
- **Query:** `page=1&pageSize=20`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "ntc_001",
        "title": "Quarterly investor letter — Q1 2025",
        "status": "PUBLISHED",
        "fundId": "fund_arcus_growth_v",
        "shareClass": null,
        "publishedAt": "2025-04-10T10:00:00.000Z",
        "acknowledgedAt": null,
        "preview": "Dear Limited Partner, please find enclosed our Q1 2025 update..."
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/notices/:id`

- **Permission:** `lp.notices.view`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ntc_001",
    "title": "Quarterly investor letter — Q1 2025",
    "body": "Dear Limited Partner,\n\nPlease find enclosed our Q1 2025 update for Arcus Growth Fund V.",
    "status": "OPENED",
    "fundId": "fund_arcus_growth_v",
    "shareClass": null,
    "publishedAt": "2025-04-10T10:00:00.000Z",
    "openedAt": "2025-06-01T09:00:00.000Z",
    "acknowledgedAt": null
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `POST /api/lp-portal/notices/:id/acknowledge`

- **Permission:** `lp.notices.acknowledge`
- **Headers:** `Authorization`, `Idempotency-Key`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "acknowledgedAt": "2025-06-01T10:15:00.000Z"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

## Requests & messages

### `GET /api/lp-portal/messages`

- **Permission:** `lp.messages.view`
- **Headers:** `Authorization`
- **Query:** `page=1&pageSize=20`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "msg_thread_001",
        "subject": "Capital call wiring question",
        "fundId": "fund_arcus_growth_v",
        "fundName": "Arcus Growth Fund V",
        "relatedType": "CAPITAL_CALL",
        "relatedId": "cca_alloc_001",
        "status": "OPEN",
        "lastMessageAt": "2025-06-03T10:00:00.000Z",
        "lastMessagePreview": "Please confirm the SWIFT code for the wiring instructions.",
        "unreadCount": 1
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/messages/:id`

- **Permission:** `lp.messages.view`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "msg_thread_001",
    "subject": "Capital call wiring question",
    "fundId": "fund_arcus_growth_v",
    "fundName": "Arcus Growth Fund V",
    "relatedType": "CAPITAL_CALL",
    "relatedId": "cca_alloc_001",
    "status": "OPEN",
    "messages": [
      {
        "id": "msg_001",
        "authorType": "INVESTOR",
        "authorId": "usr_lp_signatory",
        "body": "Please confirm the SWIFT code for the wiring instructions.",
        "readAt": null,
        "createdAt": "2025-06-03T09:45:00.000Z"
      },
      {
        "id": "msg_002",
        "authorType": "OPS",
        "authorId": "usr_ops_001",
        "body": "SWIFT CHASUS33 applies for USD wires to the collection account.",
        "readAt": null,
        "createdAt": "2025-06-03T10:00:00.000Z"
      }
    ]
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `POST /api/lp-portal/messages/:id/read`

- **Permission:** `lp.messages.view`
- **Headers:** `Authorization`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "threadId": "msg_thread_001",
    "markedRead": 1
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `POST /api/lp-portal/messages/:id/replies`

- **Permission:** `lp.messages.reply`
- **Headers:** `Authorization`

**Request body**

```json
{
  "body": "Thank you — wire will be sent today."
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "msg_003",
    "authorType": "INVESTOR",
    "body": "Thank you — wire will be sent today.",
    "createdAt": "2025-06-03T10:30:00.000Z"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/requests`

- **Permission:** `lp.requests.view`
- **Headers:** `Authorization`
- **Query:** `status=SUBMITTED&page=1&pageSize=20`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "sr_row_001",
        "reference": "SR-ABC123",
        "type": "DOCUMENT_REQUEST",
        "fundId": "fund_arcus_growth_v",
        "fundName": "Arcus Growth Fund V",
        "status": "SUBMITTED",
        "subject": "Please provide latest K-1",
        "description": "For tax year 2025",
        "createdAt": "2025-06-01T08:00:00.000Z",
        "updatedAt": "2025-06-01T08:00:00.000Z"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `POST /api/lp-portal/requests`

- **Permission:** `lp.requests.create`
- **Headers:** `Authorization`, `Idempotency-Key`

**Request body**

```json
{
  "type": "DOCUMENT_REQUEST",
  "fundId": "fund_arcus_growth_v",
  "subject": "Please provide latest K-1",
  "description": "For tax year 2025",
  "priority": "NORMAL"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "sr_row_001",
    "reference": "SR-ABC123",
    "type": "DOCUMENT_REQUEST",
    "fundId": "fund_arcus_growth_v",
    "fundName": "Arcus Growth Fund V",
    "status": "SUBMITTED",
    "subject": "Please provide latest K-1",
    "description": "For tax year 2025",
    "createdAt": "2025-06-01T08:00:00.000Z",
    "updatedAt": "2025-06-01T08:00:00.000Z"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/requests/:reference`

- **Permission:** `lp.requests.view`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "sr_row_001",
    "reference": "SR-ABC123",
    "type": "DOCUMENT_REQUEST",
    "fundId": "fund_arcus_growth_v",
    "fundName": "Arcus Growth Fund V",
    "status": "SUBMITTED",
    "subject": "Please provide latest K-1",
    "description": "For tax year 2025",
    "createdAt": "2025-06-01T08:00:00.000Z",
    "updatedAt": "2025-06-01T08:00:00.000Z",
    "messages": [
      {
        "id": "srm_001",
        "authorType": "INVESTOR",
        "authorId": "usr_lp_signatory",
        "body": "For tax year 2025",
        "createdAt": "2025-06-01T08:00:00.000Z"
      }
    ]
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `POST /api/lp-portal/requests/:reference/messages`

- **Permission:** `lp.messages.reply`
- **Headers:** `Authorization`

**Request body**

```json
{
  "body": "Following up — could you confirm expected delivery date?"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "srm_002",
    "authorType": "INVESTOR",
    "body": "Following up — could you confirm expected delivery date?",
    "createdAt": "2025-06-02T14:30:00.000Z"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

## Organisation, colleagues & settings

### `GET /api/lp-portal/colleagues`

- **Permission:** `lp.organisation.manage_colleagues`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "membershipId": "lp_mem_002",
      "userId": "usr_lp_viewer",
      "email": "lp.viewer@example.com",
      "name": "Alex Viewer",
      "lpRole": "VIEWER",
      "fundIds": [
        "fund_arcus_growth_v"
      ],
      "isActive": true,
      "status": "ACTIVE",
      "revokedAt": null
    }
  ],
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `POST /api/lp-portal/colleagues`

- **Permission:** `lp.organisation.manage_colleagues`
- **Headers:** `Authorization`, `Idempotency-Key`

**Request body**

```json
{
  "email": "lp.viewer@example.com",
  "role": "VIEWER",
  "fundIds": [
    "fund_arcus_growth_v"
  ]
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "lp_mem_002",
    "userId": "usr_lp_viewer",
    "clientId": "cl_arcus_lp_001",
    "lpRole": "VIEWER",
    "fundIds": [
      "fund_arcus_growth_v"
    ],
    "isActive": true,
    "invitedById": "usr_lp_manager"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

_User must already exist in the platform_

---

### `PATCH /api/lp-portal/colleagues/:membershipId`

- **Permission:** `lp.organisation.manage_colleagues`
- **Headers:** `Authorization`

**Request body**

```json
{
  "role": "VIEWER",
  "fundIds": [
    "fund_arcus_growth_v",
    "fund_arcus_income_oe"
  ]
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "lp_mem_002",
    "userId": "usr_lp_viewer",
    "clientId": "cl_arcus_lp_001",
    "lpRole": "VIEWER",
    "fundIds": [
      "fund_arcus_growth_v",
      "fund_arcus_income_oe"
    ],
    "isActive": true
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `PATCH /api/lp-portal/colleagues/:membershipId/revoke`

- **Permission:** `lp.organisation.manage_colleagues`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "membershipId": "lp_mem_002",
    "userId": "usr_lp_viewer",
    "revokedById": "usr_lp_manager"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/organisation`

- **Permission:** `lp.organisation.view`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cl_arcus_lp_001",
    "legalName": "Arcus Capital Partners LP",
    "investorId": "LP-ARCUS-001",
    "email": "lp-arcus-portal@example.com",
    "country": "US",
    "phone": "+1-212-555-0100",
    "address": "350 Park Avenue, New York, NY 10022",
    "status": "ACTIVE",
    "lpRole": "SIGNATORY",
    "colleagues": []
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

_colleagues array populated for MANAGER role or GP staff impersonation_

---

### `GET /api/lp-portal/settings`

- **Permission:** `lp.settings.view`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "notifications": {
      "emailCapitalCalls": true,
      "emailDistributions": true,
      "emailDocuments": true,
      "emailMessages": true,
      "emailNotices": true
    },
    "mfa": {
      "requireMfaForLp": false,
      "issuerName": "Arcus LP Portal",
      "enabled": false,
      "enabledAt": null
    },
    "presentationCurrency": "USD"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/settings/mfa`

- **Permission:** `lp.settings.view`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "requireMfaForLp": false,
    "issuerName": "Arcus LP Portal",
    "enabled": false,
    "enabledAt": null
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `PATCH /api/lp-portal/settings/notifications`

- **Permission:** `lp.settings.view`
- **Headers:** `Authorization`

**Request body**

```json
{
  "emailCapitalCalls": true,
  "emailDistributions": true,
  "emailDocuments": false,
  "emailMessages": true,
  "emailNotices": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "emailCapitalCalls": true,
    "emailDistributions": true,
    "emailDocuments": false,
    "emailMessages": true,
    "emailNotices": true
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

## Reports (legacy)

### `GET /api/lp-portal/reports`

- **Permission:** `lp.documents.view`
- **Headers:** `Authorization`
- **Query:** `page=1&limit=20`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "jobId": "frr_job_001",
        "runId": "frr_run_001",
        "fundName": "Arcus Growth Fund V",
        "templateName": "Investor Performance Report",
        "reportLevel": "INVESTOR",
        "periodStart": "2025-01-01T00:00:00.000Z",
        "periodEnd": "2025-03-31T00:00:00.000Z",
        "status": "DELIVERED",
        "deliveredAt": "2025-04-15T16:00:00.000Z",
        "transportMethod": "PORTAL",
        "metrics": {
          "nav": "198760000.00",
          "tvpi": "1.2700"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "pages": 1
    }
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/reports/:jobId/download`

- **Permission:** `lp.documents.download`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

_Binary PDF fund performance report; Content-Disposition attachment_

---

## GP / system admin

### `POST /api/lp-portal/admin/documents`

- **Permission:** `GP admin`
- **Headers:** `Authorization`, `Content-Type: multipart/form-data`

**Request body**

_Multipart form-data_

```json
{
  "file": "<PDF document>",
  "clientId": "cl_arcus_lp_001",
  "fundId": "fund_arcus_growth_v",
  "category": "LEGAL",
  "title": "Side Letter — Arcus Growth Fund V"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "doc_side_letter_001",
    "clientId": "cl_arcus_lp_001",
    "fundId": "fund_arcus_growth_v",
    "category": "LEGAL",
    "title": "Side Letter — Arcus Growth Fund V",
    "fileUrl": "https://storage.example.com/lp-portal-vault/side-letter.pdf",
    "sha256": "e6f7890123456789012345678901234567890abcdef1234567890abcdef1234567890",
    "publishedAt": "2025-06-01T12:00:00.000Z",
    "sourceType": "GP_UPLOAD"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/admin/memberships`

- **Permission:** `GP admin`
- **Headers:** `Authorization`
- **Query:** `clientId=cl_arcus_lp_001`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "membershipId": "lp_mem_001",
      "clientId": "cl_arcus_lp_001",
      "clientName": "Arcus Capital Partners LP",
      "userId": "usr_lp_signatory",
      "email": "lp.signatory@example.com",
      "lpRole": "SIGNATORY",
      "isActive": true,
      "revokedAt": null
    }
  ],
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

_GP admin only — no lp.* permission matrix_

---

### `POST /api/lp-portal/admin/memberships`

- **Permission:** `GP admin`
- **Headers:** `Authorization`

**Request body**

```json
{
  "clientId": "cl_arcus_lp_001",
  "userId": "usr_lp_viewer",
  "lpRole": "VIEWER",
  "fundIds": [
    "fund_arcus_growth_v"
  ]
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "lp_mem_002",
    "userId": "usr_lp_viewer",
    "clientId": "cl_arcus_lp_001",
    "lpRole": "VIEWER",
    "fundIds": [
      "fund_arcus_growth_v"
    ],
    "isActive": true,
    "invitedById": "usr_gp_admin"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `PATCH /api/lp-portal/admin/memberships/:membershipId/revoke`

- **Permission:** `GP admin`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "membershipId": "lp_mem_002",
    "userId": "usr_lp_viewer",
    "revokedById": "usr_gp_admin"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

---

### `GET /api/lp-portal/admin/mfa-policy`

- **Permission:** `SysAdmin`
- **Headers:** `Authorization`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "default",
    "requireMfaForLp": false,
    "issuerName": "Arcus LP Portal",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

_SysAdmin only_

---

### `PUT /api/lp-portal/admin/mfa-policy`

- **Permission:** `SysAdmin`
- **Headers:** `Authorization`

**Request body**

```json
{
  "requireMfaForLp": true,
  "issuerName": "Arcus LP Portal"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "default",
    "requireMfaForLp": true,
    "issuerName": "Arcus LP Portal",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-06-01T12:00:00.000Z"
  },
  "timestamp": "2026-07-19T12:00:00.000Z",
  "meta": {
    "requestId": "req-abc123"
  }
}
```

_SysAdmin only_

---

## Common error codes

| Code | HTTP | Meaning |
|------|------|--------|
| `LP_UNAUTHORIZED` | 401 | Auth |
| `LP_FORBIDDEN` | 403 | Role / entitlement |
| `LP_NOT_FOUND` | 404 | Missing or not entitled |
| `LP_VALIDATION` | 422 | Fields |
| `LP_IDEMPOTENCY_KEY_REUSED` | 409 | Idempotency conflict |
| `LP_CALL_NOT_ISSUED` | 409 | Ack not allowed |
| `LP_CALL_ALREADY_ACKNOWLEDGED` | 409 | Duplicate ack |
| `LP_MIN_BALANCE_BREACH` | 422 | Redemption residual too low |
| `LP_NOTICE_PERIOD` | 422 | Dealing date too early |
| `LP_INSUFFICIENT_UNITS` | 422 | Over-redeem |
| `LP_COMPLIANCE_HOLD` | 403 | KYC / hold |
| `LP_DEALING_SUSPENDED` | 403 | Fund gate |
| `LP_FILE_TOO_LARGE` | 413 | Upload |
| `LP_UNSUPPORTED_MEDIA` | 415 | File type |

## Index

| Method | Path | Permission | Idem |
|--------|------|------------|:----:|
| GET | `/api/lp-portal/account-activity` | `lp.activity.view` |  |
| GET | `/api/lp-portal/account-activity/export` | `lp.activity.export` |  |
| POST | `/api/lp-portal/admin/documents` | `GP admin` |  |
| GET | `/api/lp-portal/admin/memberships` | `GP admin` |  |
| POST | `/api/lp-portal/admin/memberships` | `GP admin` |  |
| PATCH | `/api/lp-portal/admin/memberships/:membershipId/revoke` | `GP admin` |  |
| GET | `/api/lp-portal/admin/mfa-policy` | `SysAdmin` |  |
| PUT | `/api/lp-portal/admin/mfa-policy` | `SysAdmin` |  |
| GET | `/api/lp-portal/capital-calls` | `lp.capital_calls.view` |  |
| GET | `/api/lp-portal/capital-calls/:id` | `lp.capital_calls.view` |  |
| POST | `/api/lp-portal/capital-calls/:id/acknowledge` | `lp.capital_calls.acknowledge` | Y |
| GET | `/api/lp-portal/capital-calls/:id/documents` | `lp.capital_calls.view` |  |
| GET | `/api/lp-portal/capital-calls/:id/notice/download` | `lp.capital_calls.download_notice` |  |
| POST | `/api/lp-portal/capital-calls/:id/payment-confirmations` | `lp.capital_calls.upload_payment_confirmation` | Y |
| GET | `/api/lp-portal/capital-calls/summary` | `lp.capital_calls.view` |  |
| GET | `/api/lp-portal/colleagues` | `lp.organisation.manage_colleagues` |  |
| POST | `/api/lp-portal/colleagues` | `lp.organisation.manage_colleagues` | Y |
| PATCH | `/api/lp-portal/colleagues/:membershipId` | `lp.organisation.manage_colleagues` |  |
| PATCH | `/api/lp-portal/colleagues/:membershipId/revoke` | `lp.organisation.manage_colleagues` |  |
| GET | `/api/lp-portal/dashboard` | `lp.dashboard.view` |  |
| GET | `/api/lp-portal/dashboard/actions` | `lp.dashboard.view` |  |
| GET | `/api/lp-portal/dashboard/activity/recent` | `lp.activity.view` |  |
| GET | `/api/lp-portal/dealing/bank-accounts` | `lp.dealing.view` |  |
| GET | `/api/lp-portal/dealing/overview` | `lp.dealing.view` |  |
| POST | `/api/lp-portal/dealing/redemptions` | `lp.dealing.redeem` | Y |
| POST | `/api/lp-portal/dealing/redemptions/estimate` | `lp.dealing.estimate` |  |
| GET | `/api/lp-portal/dealing/requests` | `lp.dealing.view` |  |
| GET | `/api/lp-portal/dealing/rules` | `lp.dealing.view` |  |
| POST | `/api/lp-portal/dealing/subscriptions` | `lp.dealing.subscribe` | Y |
| POST | `/api/lp-portal/dealing/subscriptions/estimate` | `lp.dealing.estimate` |  |
| GET | `/api/lp-portal/distributions` | `lp.distributions.view` |  |
| GET | `/api/lp-portal/distributions/:id` | `lp.distributions.view` |  |
| GET | `/api/lp-portal/distributions/:id/download` | `lp.distributions.download` |  |
| GET | `/api/lp-portal/distributions/statement/download` | `lp.distributions.download` |  |
| GET | `/api/lp-portal/documents` | `lp.documents.view` |  |
| GET | `/api/lp-portal/documents/:id` | `lp.documents.view` |  |
| GET | `/api/lp-portal/documents/:id/download` | `lp.documents.download` |  |
| GET | `/api/lp-portal/documents/:id/preview` | `lp.documents.view` |  |
| GET | `/api/lp-portal/jobs/:jobId` | `lp.portal.access` |  |
| POST | `/api/lp-portal/jobs/performance-report` | `lp.performance.download_report` | Y |
| GET | `/api/lp-portal/ledger` | `lp.activity.view` |  |
| GET | `/api/lp-portal/ledger/:entryId` | `lp.activity.view` |  |
| GET | `/api/lp-portal/messages` | `lp.messages.view` |  |
| GET | `/api/lp-portal/messages/:id` | `lp.messages.view` |  |
| POST | `/api/lp-portal/messages/:id/read` | `lp.messages.view` |  |
| POST | `/api/lp-portal/messages/:id/replies` | `lp.messages.reply` |  |
| GET | `/api/lp-portal/notices` | `lp.notices.view` |  |
| GET | `/api/lp-portal/notices/:id` | `lp.notices.view` |  |
| POST | `/api/lp-portal/notices/:id/acknowledge` | `lp.notices.acknowledge` | Y |
| GET | `/api/lp-portal/organisation` | `lp.organisation.view` |  |
| GET | `/api/lp-portal/performance` | `lp.performance.view` |  |
| GET | `/api/lp-portal/performance/benchmarks` | `lp.performance.view` |  |
| GET | `/api/lp-portal/performance/by-fund` | `lp.performance.view` |  |
| GET | `/api/lp-portal/performance/history` | `lp.performance.view` |  |
| GET | `/api/lp-portal/performance/report/download` | `lp.performance.download_report` |  |
| GET | `/api/lp-portal/reports` | `lp.documents.view` |  |
| GET | `/api/lp-portal/reports/:jobId/download` | `lp.documents.download` |  |
| GET | `/api/lp-portal/requests` | `lp.requests.view` |  |
| POST | `/api/lp-portal/requests` | `lp.requests.create` | Y |
| GET | `/api/lp-portal/requests/:reference` | `lp.requests.view` |  |
| POST | `/api/lp-portal/requests/:reference/messages` | `lp.messages.reply` |  |
| GET | `/api/lp-portal/session` | `lp.portal.access` |  |
| GET | `/api/lp-portal/settings` | `lp.settings.view` |  |
| GET | `/api/lp-portal/settings/mfa` | `lp.settings.view` |  |
| PATCH | `/api/lp-portal/settings/notifications` | `lp.settings.view` |  |
| GET | `/api/lp-portal/vault` | `lp.documents.view` |  |
| GET | `/api/lp-portal/vault/:documentId/download` | `lp.documents.download` |  |
| GET | `/api/lp-portal/vault/:documentId/verify` | `lp.documents.view` |  |

_Generated from `src/routes/lpPortalRoutes.ts` (68 routes)._
