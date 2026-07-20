# Investments V2 API

**Base URL:** `/api/investment-ops`  
**Auth:** `Authorization: Bearer <token>`  
**Count:** 331 endpoints  

One document. Every endpoint below shows permission, headers, query (if any), request body, and response body.

**FE wiring deltas** (decimal-string money, paged lists, compliance results, setup stakeholders, cash recon KPIs, etc.): [investments-v2-fe-gap-closure.md](./investments-v2-fe-gap-closure.md).

---

## Response envelope (all JSON endpoints)

Success:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

Error:

```json
{
  "success": false,
  "message": "Human-readable summary",
  "code": "MACHINE_CODE",
  "details": {},
  "retryable": false,
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

**Rules**
- Money / qty / price fields are usually **strings** (e.g. `"100.0000"`).
- `Idempotency-Key` required when listed (8-200 printable ASCII).
- `If-Match: "<version>"` **or** `expectedVersion` in body when listed.
- Never send caller `fileRef`.

---

## Dashboard

### `GET /api/investment-ops/dashboard/allocation`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "equities": {
      "value": 820000,
      "pct": 65.6
    },
    "cash": {
      "value": 120000,
      "pct": 9.6
    },
    "bonds": {
      "value": 210000,
      "pct": 16.8
    },
    "funds": {
      "value": 0,
      "pct": 0
    },
    "commodities": {
      "value": 0,
      "pct": 0
    },
    "crypto": {
      "value": 0,
      "pct": 0
    },
    "alternatives": {
      "value": 0,
      "pct": 0
    },
    "other": {
      "value": 100000,
      "pct": 8
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/dashboard/currency-exposure`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "currency": "USD",
      "value": 980000
    },
    {
      "currency": "ZWG",
      "value": 270000
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/dashboard/funds`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "fund_arcus_001",
      "name": "Arcus Listed Portfolio",
      "baseCurrencyCode": "USD",
      "status": "OPEN"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/dashboard/recalculate`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "fundId": "fund_arcus_001"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "job_dash_01",
    "jobType": "INVESTMENT_DASHBOARD_RECALCULATE",
    "status": "PENDING",
    "aggregateType": "FUND",
    "aggregateId": "fund_arcus_001",
    "idempotencyKey": "dash-recalc-001"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/dashboard/summary`

- **Permission:** `investments.read`
- **Query:** `period=MTD&startDate=&endDate=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "portfolios": [
      {
        "fundId": "fund_arcus_001",
        "name": "Arcus Listed Portfolio",
        "nav": 1250000.5,
        "valuationDate": "2026-07-18T00:00:00.000Z",
        "pnl": 15234.12,
        "pnlPct": 1.22,
        "periodRealizedPnl": 8200.5,
        "baseCurrency": "USD",
        "status": "COMPLETED",
        "valuationRunId": "valrun_01",
        "lastRecalculation": "2026-07-18T16:00:00.000Z",
        "period": "MTD",
        "periodStart": "2026-07-01T00:00:00.000Z",
        "periodEnd": "2026-07-19T00:00:00.000Z"
      }
    ],
    "period": "MTD",
    "periodStart": "2026-07-01T00:00:00.000Z",
    "periodEnd": "2026-07-19T00:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

## Portfolios

### `PATCH /api/investment-ops/assignments/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "folderId": "folder_01",
  "assignmentRole": "TRADER",
  "effectiveTo": null,
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "asgn_01",
    "folderId": "folder_01",
    "assignmentRole": "TRADER",
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/folders/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "folder_01",
    "name": "Core Equities",
    "path": "Core Equities",
    "children": [],
    "assignments": []
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/folders/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "name": "Core Equities US",
  "parentId": null,
  "sortOrder": 1,
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "folder_01",
    "name": "Core Equities US",
    "path": "Core Equities US",
    "sortOrder": 1,
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/folders/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": "2"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "folder_01",
    "isArchived": true,
    "version": 3
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/folders/:id/restore`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": "3"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "folder_01",
    "isArchived": false,
    "version": 4
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/limits/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "lim_01",
    "limitCode": "MAX_SINGLE_NAME",
    "hardValue": "5.0000",
    "portfolioConfig": {
      "fundId": "fund_arcus_001"
    },
    "complianceRule": null
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/limits/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "warningValue": "3.50",
  "hardValue": "4.50",
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "lim_01",
    "warningValue": "3.5",
    "hardValue": "4.5",
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/limits/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": "2"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "lim_01",
    "isActive": false,
    "version": 3
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/portfolios`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&search=&sortBy=createdAt&sortDirection=desc`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "fund_arcus_001",
        "name": "Arcus Listed Portfolio",
        "status": "OPEN",
        "fundPurpose": "LISTED_EQUITY"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/portfolios`

- **Permission:** `investments.write`

**Request body**

```json
{
  "name": "Arcus Growth Book",
  "baseCurrencyCode": "USD",
  "description": "Listed equity growth sleeve",
  "totalAmount": "5000000",
  "status": "OPEN",
  "valuationPolicyJson": {
    "costBasisMethod": "WAC"
  },
  "settlementPolicyJson": {
    "cycle": "T+2"
  },
  "approvalPolicyJson": {
    "fourEyeOrders": true
  },
  "coaMappingJson": {}
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "fund_new_01",
    "name": "Arcus Growth Book",
    "status": "OPEN",
    "fundPurpose": "LISTED_EQUITY",
    "totalAmount": "5000000",
    "remainingAmount": "5000000",
    "investmentPortfolioConfig": {
      "id": "pcfg_01",
      "fundId": "fund_new_01",
      "baseCurrencyCode": "USD",
      "version": 1,
      "isActive": true
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `DELETE /api/investment-ops/portfolios/:fundId`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": "4"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "fund_arcus_001",
    "status": "ARCHIVED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/portfolios/:fundId`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "fund_arcus_001",
    "name": "Arcus Listed Portfolio",
    "status": "OPEN",
    "listedEquityFundConfig": {
      "fundId": "fund_arcus_001",
      "baseCurrencyCode": "USD"
    },
    "investmentPortfolioConfig": {
      "id": "pcfg_01",
      "fundId": "fund_arcus_001",
      "baseCurrencyCode": "USD",
      "version": 3
    },
    "folders": [
      {
        "id": "folder_root",
        "name": "Core",
        "path": "Core",
        "sortOrder": 0,
        "version": 1,
        "isArchived": false
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/portfolios/:fundId`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "name": "Arcus Listed Portfolio",
  "description": "Primary LE book",
  "status": "OPEN",
  "expectedVersion": "3"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "fund_arcus_001",
    "name": "Arcus Listed Portfolio",
    "investmentPortfolioConfig": {
      "id": "pcfg_01",
      "version": 4
    },
    "listedEquityFundConfig": {
      "fundId": "fund_arcus_001",
      "baseCurrencyCode": "USD"
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/portfolios/:fundId/assignments`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "asgn_01",
      "userId": "user_pm_01",
      "assignmentRole": "PORTFOLIO_MANAGER",
      "folderId": null,
      "version": 1
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/portfolios/:fundId/assignments`

- **Permission:** `investments.write`

**Request body**

```json
{
  "userId": "user_pm_01",
  "assignmentRole": "PORTFOLIO_MANAGER",
  "folderId": null,
  "effectiveFrom": "2026-01-01"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "asgn_01",
    "portfolioConfigId": "pcfg_01",
    "userId": "user_pm_01",
    "assignmentRole": "PORTFOLIO_MANAGER",
    "folderId": null,
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/portfolios/:fundId/config`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "pcfg_01",
    "fundId": "fund_arcus_001",
    "baseCurrencyCode": "USD",
    "valuationPolicyJson": {
      "costBasisMethod": "WAC"
    },
    "settlementPolicyJson": {
      "cycle": "T+2"
    },
    "approvalPolicyJson": {
      "fourEyeOrders": true
    },
    "version": 3,
    "isActive": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/portfolios/:fundId/config`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "baseCurrencyCode": "USD",
  "valuationPolicyJson": {
    "costBasisMethod": "WAC"
  },
  "settlementPolicyJson": {
    "cycle": "T+2"
  },
  "approvalPolicyJson": {
    "fourEyeOrders": true
  },
  "expectedVersion": "3"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "pcfg_01",
    "fundId": "fund_arcus_001",
    "baseCurrencyCode": "USD",
    "version": 4
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/portfolios/:fundId/exposure`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "byExchange": [
      {
        "key": "ZSE",
        "value": 4560,
        "pct": 100
      }
    ],
    "topHoldings": [
      {
        "securityId": "sec_eco",
        "quantity": 1000,
        "marketValue": 4560,
        "security": {
          "symbol": "ECO",
          "exchangeCode": "ZSE"
        }
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/portfolios/:fundId/folders`

- **Permission:** `investments.read`
- **Query:** `includeArchived=false`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "folder_01",
      "fundId": "fund_arcus_001",
      "name": "Core Equities",
      "path": "Core Equities",
      "parentId": null,
      "sortOrder": 0,
      "version": 1,
      "isArchived": false
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/portfolios/:fundId/folders`

- **Permission:** `investments.write`

**Request body**

```json
{
  "name": "Core Equities",
  "parentId": null,
  "sortOrder": 0
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "folder_01",
    "fundId": "fund_arcus_001",
    "name": "Core Equities",
    "path": "Core Equities",
    "parentId": null,
    "sortOrder": 0,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PUT /api/investment-ops/portfolios/:fundId/folders/reorder`

- **Permission:** `investments.write`

**Request body**

```json
{
  "parentId": null,
  "ids": [
    "folder_01",
    "folder_02"
  ]
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "fundId": "fund_arcus_001",
    "parentId": null,
    "orderedIds": [
      "folder_01",
      "folder_02"
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/portfolios/:fundId/holdings`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "hold_01",
      "fundId": "fund_arcus_001",
      "securityId": "sec_eco",
      "quantity": 1000,
      "wac": 3.25,
      "currentPrice": 4.56,
      "marketValue": 4560,
      "unrealizedPnl": 1310,
      "security": {
        "id": "sec_eco",
        "symbol": "ECO",
        "exchangeCode": "ZSE",
        "listingCurrencyCode": "USD"
      }
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/portfolios/:fundId/limits`

- **Permission:** `investments.read`
- **Query:** `includeArchived=false`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "lim_01",
      "limitCode": "MAX_SINGLE_NAME",
      "dimensionType": "SECURITY",
      "unit": "PCT",
      "warningValue": "4.0000",
      "hardValue": "5.0000",
      "version": 1,
      "isActive": true
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/portfolios/:fundId/limits`

- **Permission:** `investments.write`

**Request body**

```json
{
  "limitCode": "MAX_SINGLE_NAME",
  "dimensionType": "SECURITY",
  "unit": "PCT",
  "effectiveFrom": "2026-01-01",
  "warningValue": "4.00",
  "hardValue": "5.00",
  "dimensionValue": null
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "lim_01",
    "portfolioConfigId": "pcfg_01",
    "limitCode": "MAX_SINGLE_NAME",
    "dimensionType": "SECURITY",
    "unit": "PCT",
    "warningValue": "4",
    "hardValue": "5",
    "version": 1,
    "isActive": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/portfolios/:fundId/overview`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "fundId": "fund_arcus_001",
    "name": "Arcus Listed Portfolio",
    "nav": 1250000.5,
    "pnl": 1310,
    "startDate": "2025-01-15T00:00:00.000Z",
    "valuationDate": "2026-07-18T00:00:00.000Z",
    "baseCurrency": "USD",
    "portfolioManager": "Jane Portfolio",
    "status": "COMPLETED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/portfolios/:fundId/positions`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "valuationRunId": "valrun_01",
    "asOf": "2026-07-18T00:00:00.000Z",
    "navBaseCurrency": "1250000.5000",
    "items": [
      {
        "id": "vitem_01",
        "instrumentId": "instr_eco",
        "quantity": "1000.0000",
        "price": "4.5600",
        "marketValue": "4560.0000",
        "baseMarketValue": "4560.0000",
        "unrealizedPnl": "1310.0000"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/portfolios/:fundId/recalculate`

- **Permission:** `investments.write`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "fundId": "fund_arcus_001",
    "asOf": "2026-07-19T09:00:00.000Z",
    "navBaseCurrency": 1250000.5,
    "note": "Shape from PortfolioValuationEngine.runFundValuation"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/portfolios/:fundId/transactions`

- **Permission:** `investments.read`
- **Query:** `status=&type=&page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "txn_01",
        "transactionRef": "ADJ-ABC123",
        "transactionType": "CASH_ADJUSTMENT",
        "tradeDate": "2026-07-15T00:00:00.000Z",
        "netAmount": "50000.0000",
        "currencyCode": "USD",
        "status": "POSTED",
        "version": 1
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/portfolios/:fundId/transactions/manual-adjustments`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "transactionType": "CASH_ADJUSTMENT",
  "reason": "Seed ops cash buffer",
  "tradeDate": "2026-07-15",
  "currencyCode": "USD",
  "netAmount": "50000.00",
  "grossAmount": "50000.00"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "txn_adj_01",
    "transactionRef": "ADJ-XYZ789ABC",
    "fundId": "fund_arcus_001",
    "transactionType": "CASH_ADJUSTMENT",
    "tradeDate": "2026-07-15T00:00:00.000Z",
    "netAmount": "50000",
    "grossAmount": "50000",
    "currencyCode": "USD",
    "status": "POSTED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/positions/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "vitem_01",
    "fundId": "fund_arcus_001",
    "valuationRunId": "valrun_01",
    "quantity": "1000.0000",
    "price": "4.5600",
    "baseMarketValue": "4560.0000"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/transactions/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "txn_01",
    "transactionRef": "ADJ-ABC123",
    "fundId": "fund_arcus_001",
    "transactionType": "CASH_ADJUSTMENT",
    "netAmount": "50000.0000",
    "status": "POSTED",
    "order": null,
    "execution": null,
    "cashEntries": []
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/transactions/:id/reverse`

- **Permission:** `investments.approve`
- **Headers:** `Idempotency-Key`, `If-Match`

**Request body**

```json
{
  "reason": "Posted in error",
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "txn_rev_01",
    "transactionRef": "REV-XYZ789ABC",
    "transactionType": "REVERSAL",
    "netAmount": "-50000",
    "status": "POSTED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

## Portfolios (aliases)

### `POST /api/investment-ops/portfolio-assignments`

- **Permission:** `investments.write`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "OK",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `DELETE /api/investment-ops/portfolio-assignments/:id`

- **Permission:** `investments.write`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "deleted": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/portfolio-folders`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "id_01"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/portfolio-folders`

- **Permission:** `investments.write`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "OK",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/portfolio-folders/:folderId`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "ACTIVE",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/portfolio-folders/:folderId`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "OK",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/portfolio-folders/:folderId/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "reason": "optional note",
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "UPDATED",
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `DELETE /api/investment-ops/portfolio-folders/:folderId/portfolio-assignments/:fundId`

- **Permission:** `investments.write`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "deleted": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/portfolio-folders/:folderId/restore`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "reason": "optional note",
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "UPDATED",
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PUT /api/investment-ops/portfolio-folders/reorder`

- **Permission:** `investments.write`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "OK",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

## Instruments

### `GET /api/investment-ops/instruments`

- **Permission:** `investments.read`
- **Query:** `status=ACTIVE&page=1&pageSize=10&search=ECO`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "instr_eco",
        "instrumentCode": "ECO.ZSE",
        "shortName": "Econet",
        "ticker": "ECO",
        "instrumentTypeCode": "EQUITY",
        "listingCurrencyCode": "USD",
        "status": "ACTIVE",
        "auditVersion": 2,
        "tradeable": true
      }
    ],
    "page": 1,
    "pageSize": 10,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/instruments`

- **Permission:** `investments.write`

**Request body**

```json
{
  "ticker": "ECO",
  "shortName": "Econet Wireless",
  "fullName": "Econet Wireless Zimbabwe Ltd",
  "instrumentTypeCode": "EQUITY",
  "exchangeCode": "ZSE",
  "marketCode": "ZSE",
  "countryCode": "ZW",
  "listingCurrencyCode": "USD",
  "valuationMethod": "MARK_TO_MARKET",
  "isin": "ZW0009012017",
  "sector": "Telecom",
  "industry": "Wireless",
  "pricingSource": "MANUAL"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instr_eco",
    "instrumentCode": "ECO.ZSE",
    "shortName": "Econet Wireless",
    "ticker": "ECO",
    "instrumentTypeCode": "EQUITY",
    "listingCurrencyCode": "USD",
    "valuationMethod": "MARK_TO_MARKET",
    "status": "DRAFT",
    "listedEquitySecurityId": "sec_eco",
    "auditVersion": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/instruments/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instr_eco",
    "instrumentCode": "ECO.ZSE",
    "status": "ACTIVE",
    "tradeable": true,
    "auditVersion": 2,
    "listedEquitySecurityId": "sec_eco"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/instruments/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "pricingSource": "MANSA",
  "expectedVersion": "2"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instr_eco",
    "pricingSource": "MANSA",
    "auditVersion": 3
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PUT /api/investment-ops/instruments/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "shortName": "Econet",
  "sector": "Telecom",
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instr_eco",
    "shortName": "Econet",
    "sector": "Telecom",
    "auditVersion": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/instruments/:id/approve`

- **Permission:** `investments.approve`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": "2"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instr_eco",
    "status": "ACTIVE",
    "auditVersion": 3
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/instruments/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": "4"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instr_eco",
    "status": "ARCHIVED",
    "auditVersion": 5
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/instruments/:id/market-context`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "instrumentId": "instr_eco",
    "latestApprovedPrice": {
      "tickId": "tick_01",
      "price": "4.5600",
      "pricedAt": "2026-07-18T16:00:00.000Z"
    },
    "holding": {
      "quantity": "1000.0000",
      "wac": "3.2500"
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/instruments/:id/reject`

- **Permission:** `investments.approve`
- **Headers:** `If-Match`

**Request body**

```json
{
  "reason": "Incomplete ISIN",
  "expectedVersion": "2"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instr_eco",
    "status": "REJECTED",
    "auditVersion": 3
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/instruments/:id/restrict`

- **Permission:** `investments.approve`
- **Headers:** `If-Match`

**Request body**

```json
{
  "reason": "Compliance hold",
  "expectedVersion": "3"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instr_eco",
    "status": "RESTRICTED",
    "auditVersion": 4
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/instruments/:id/submit`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instr_eco",
    "status": "PENDING_APPROVAL",
    "auditVersion": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/instruments/types`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "typeCode": "EQUITY",
      "displayName": "Equity"
    },
    {
      "typeCode": "BOND",
      "displayName": "Bond"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

## Market data & FX

### `GET /api/investment-ops/market-data/fx-rates`

- **Permission:** `investments.read`
- **Query:** `baseCurrencyCode=USD&quoteCurrencyCode=ZWG&status=APPROVED`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "fx_01",
      "baseCurrencyCode": "USD",
      "quoteCurrencyCode": "ZWG",
      "rate": "26.500000",
      "rateType": "SPOT",
      "approvalStatus": "APPROVED",
      "version": 2
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/market-data/fx-rates`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "baseCurrencyCode": "USD",
  "quoteCurrencyCode": "ZWG",
  "rate": "26.50",
  "rateType": "SPOT",
  "sourceCode": "MANUAL",
  "sourceObservedAt": "2026-07-19T08:00:00.000Z"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "fx_new_01",
    "baseCurrencyCode": "USD",
    "quoteCurrencyCode": "ZWG",
    "rate": "26.5",
    "rateType": "SPOT",
    "sourceCode": "MANUAL",
    "approvalStatus": "PENDING",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/market-data/fx-rates/:id/approve`

- **Permission:** `investments.approve`
- **Headers:** `If-Match`

**Request body**

```json
{
  "reason": "Matched central bank mid",
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "fx_new_01",
    "approvalStatus": "APPROVED",
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/market-data/fx-rates/:id/reject`

- **Permission:** `investments.approve`
- **Headers:** `If-Match`

**Request body**

```json
{
  "reason": "Outlier",
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "fx_new_01",
    "approvalStatus": "REJECTED",
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/market-data/fx-rates/latest`

- **Permission:** `investments.read`
- **Query:** `baseCurrencyCode=USD&quoteCurrencyCode=ZWG`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "fx_01",
    "baseCurrencyCode": "USD",
    "quoteCurrencyCode": "ZWG",
    "rate": "26.500000",
    "approvalStatus": "APPROVED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/market-data/ingest/batches`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "batch_01",
        "sourceCode": "MANSA",
        "status": "COMPLETED"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/market-data/ingest/batches/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "batch_01",
    "sourceCode": "MANSA",
    "status": "COMPLETED",
    "tickCount": 42
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/market-data/ingest/run`

- **Permission:** `investments.write`

**Request body**

```json
{
  "sourceCode": "MANSA"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "sourceCode": "MANSA",
    "status": "COMPLETED",
    "ticksWritten": 42
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/market-data/prices/:securityId/history`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "ACTIVE",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/market-data/prices/latest`

- **Permission:** `investments.read`
- **Query:** `search=ECO&exchangeCode=ZSE`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "tick_appr_01",
      "securityId": "sec_eco",
      "price": "4.5600",
      "priceType": "CLOSE",
      "validationStatus": "APPROVED",
      "pricedAt": "2026-07-18T16:00:00.000Z",
      "security": {
        "symbol": "ECO",
        "exchangeCode": "ZSE"
      }
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/market-data/prices/manual`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "securityId": "sec_eco",
  "price": "4.56",
  "priceType": "CLOSE"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "tick_pend_01",
    "securityId": "sec_eco",
    "sourceCode": "MANUAL",
    "priceType": "CLOSE",
    "price": "4.56",
    "validationStatus": "PENDING",
    "pricedAt": "2026-07-19T09:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/market-data/prices/stale`

- **Permission:** `investments.read`
- **Query:** `hours=24`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "securityId": "sec_eco",
      "symbol": "ECO",
      "lastPricedAt": "2026-07-10T16:00:00.000Z",
      "staleHours": 192
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/market-data/prices/upload`

- **Permission:** `investments.write`

**Request body**

```json
{
  "csvText": "symbol,price\\nECO,4.56\\n",
  "sourceCode": "ZSE"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "sourceCode": "ZSE",
    "accepted": 1,
    "rejected": 0,
    "batchId": "batch_01"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/market-data/securities/:id/prices`

- **Permission:** `investments.read`
- **Query:** `status=APPROVED&page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "tick_appr_01",
        "price": "4.5600",
        "validationStatus": "APPROVED",
        "pricedAt": "2026-07-18T16:00:00.000Z"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/market-data/sources/health`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "sourceCode": "MANSA",
      "healthy": true,
      "lastSuccessAt": "2026-07-19T08:00:00.000Z"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/market-data/validation-queue`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "tick_pend_01",
      "securityId": "sec_eco",
      "price": "4.5600",
      "validationStatus": "PENDING"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/market-data/validation-queue/:tickId/approve`

- **Permission:** `investments.approve`
- **Headers:** `If-Match`

**Request body**

```json
{
  "reason": "Confirmed vs exchange close",
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "tick_pend_01",
    "validationStatus": "APPROVED",
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/market-data/validation-queue/:tickId/reject`

- **Permission:** `investments.approve`
- **Headers:** `If-Match`

**Request body**

```json
{
  "reason": "Stale quote",
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "tick_pend_01",
    "validationStatus": "REJECTED",
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

## Orders

### `GET /api/investment-ops/approval-routes`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "id_01"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/approval-routes`

- **Permission:** `investments.approve`
- **Headers:** `If-Match`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "OK",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/orders`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001&status=&page=1&pageSize=20`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "ord_01",
        "orderRef": "IO-20260719-001",
        "fundId": "fund_arcus_001",
        "side": "BUY",
        "quantity": "100.0000",
        "orderType": "LIMIT",
        "limitPrice": "10.0000",
        "tradeCurrency": "USD",
        "status": "DRAFT",
        "version": 1
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/orders`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "previewId": "prev_01",
  "inputHash": "sha256:9f2c...abc"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ord_draft_01",
    "orderRef": "IO-20260719-001",
    "fundId": "fund_arcus_001",
    "instrumentId": "instr_eco",
    "securityId": "sec_eco",
    "side": "BUY",
    "quantity": "100",
    "orderType": "LIMIT",
    "limitPrice": "10",
    "tradeCurrency": "USD",
    "settlementCurrency": "USD",
    "status": "DRAFT",
    "version": 1,
    "currentRevisionNo": 1,
    "idempotencyKey": "p2-create-order-...",
    "instrument": {
      "id": "instr_eco",
      "ticker": "ECO",
      "status": "ACTIVE"
    },
    "previews": [
      {
        "id": "prev_01",
        "inputHash": "sha256:9f2c...abc"
      }
    ],
    "statusEvents": [
      {
        "toStatus": "DRAFT",
        "reasonCode": "CREATE",
        "sequenceNo": 1
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `DELETE /api/investment-ops/orders/:id`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`, `If-Match`

**Request body**

```json
{
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ord_draft_01",
    "status": "CANCELLED",
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/orders/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ord_draft_01",
    "status": "DRAFT",
    "version": 1,
    "quantity": "100",
    "limitPrice": "10",
    "instrument": {
      "id": "instr_eco",
      "ticker": "ECO"
    },
    "routes": [],
    "executions": [],
    "statusEvents": []
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/orders/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "fundId": "fund_arcus_001",
  "instrumentId": "instr_eco",
  "side": "BUY",
  "quantity": "150",
  "orderType": "LIMIT",
  "limitPrice": "9.75",
  "tradeCurrency": "USD",
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ord_draft_01",
    "quantity": "150",
    "limitPrice": "9.75",
    "version": 2,
    "status": "DRAFT"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/orders/:id/applicable-approval-routes`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "route_def_01",
      "name": "Default equity route",
      "matched": true
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/orders/:id/approval-routes/applicable`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "ACTIVE",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/orders/:id/approve`

- **Permission:** `investments.approve`
- **Headers:** `Idempotency-Key`, `If-Match`

**Request body**

```json
{
  "reason": "Within mandate",
  "expectedVersion": "2"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ord_draft_01",
    "status": "APPROVED",
    "version": 3
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/orders/:id/cancel`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`, `If-Match`

**Request body**

```json
{
  "reason": "Client withdrawn",
  "expectedVersion": "2"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ord_draft_01",
    "status": "CANCELLED",
    "version": 3
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/orders/:id/compliance-check`

- **Permission:** `investments.approve`
- **Headers:** `Idempotency-Key`, `If-Match`

**Request body**

```json
{
  "expectedVersion": "2"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ord_draft_01",
    "status": "COMPLIANCE_REVIEW",
    "version": 3,
    "latestCompliance": {
      "outcome": "FAILED",
      "message": "Weight exceeds limit"
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/orders/:id/documents`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "documentId": "doc_01"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "orderId": "ord_draft_01",
    "documentId": "doc_01",
    "linked": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/orders/:id/execute`

- **Permission:** `investments.execute`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "quantity": "100",
  "price": "10.00"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ord_draft_01",
    "status": "EXECUTED",
    "note": "Legacy LE execute path; prefer /executions"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/orders/:id/executions`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "exec_01",
      "executionRef": "FILL-001",
      "quantity": "100.0000",
      "price": "10.0000",
      "grossAmount": "1000.0000",
      "feeAmount": "0.0000",
      "taxAmount": "0.0000",
      "currencyCode": "USD",
      "executedAt": "2026-07-19T10:00:00.000Z"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/orders/:id/executions`

- **Permission:** `investments.execute`
- **Headers:** `Idempotency-Key`, `If-Match`

**Request body**

```json
{
  "executionRef": "FILL-001",
  "quantity": "100",
  "price": "10.00",
  "executedAt": "2026-07-19T10:00:00.000Z",
  "currencyCode": "USD",
  "feeAmount": "0",
  "taxAmount": "0",
  "routeId": "oroute_01",
  "settlementDate": "2026-07-21",
  "expectedVersion": "4"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "execution": {
      "id": "exec_01",
      "executionRef": "FILL-001",
      "quantity": "100",
      "price": "10",
      "grossAmount": "1000",
      "feeAmount": "0",
      "taxAmount": "0",
      "currencyCode": "USD"
    },
    "cumulativeQuantity": "100",
    "remainingQuantity": "0"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/orders/:id/fills`

- **Permission:** `investments.read`

_Same as `GET /orders/:id/executions` (alias)._

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "exec_01",
      "executionRef": "FILL-001",
      "quantity": "100.0000",
      "price": "10.0000",
      "grossAmount": "1000.0000",
      "feeAmount": "0.0000",
      "taxAmount": "0.0000",
      "currencyCode": "USD",
      "executedAt": "2026-07-19T10:00:00.000Z"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/orders/:id/fills`

- **Permission:** `investments.execute`
- **Headers:** `Idempotency-Key`, `If-Match`

_Same as `POST /orders/:id/executions` (alias)._

**Request body**

```json
{
  "executionRef": "FILL-001",
  "quantity": "100",
  "price": "10.00",
  "executedAt": "2026-07-19T10:00:00.000Z",
  "currencyCode": "USD",
  "feeAmount": "0",
  "taxAmount": "0",
  "routeId": "oroute_01",
  "settlementDate": "2026-07-21",
  "expectedVersion": "4"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "execution": {
      "id": "exec_01",
      "executionRef": "FILL-001",
      "quantity": "100",
      "price": "10",
      "grossAmount": "1000",
      "feeAmount": "0",
      "taxAmount": "0",
      "currencyCode": "USD"
    },
    "cumulativeQuantity": "100",
    "remainingQuantity": "0"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/orders/:id/history`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "sequenceNo": 1,
      "fromStatus": null,
      "toStatus": "DRAFT",
      "reasonCode": "CREATE"
    },
    {
      "sequenceNo": 2,
      "fromStatus": "DRAFT",
      "toStatus": "SUBMITTED",
      "reasonCode": "SUBMIT"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/orders/:id/reject`

- **Permission:** `investments.approve`
- **Headers:** `Idempotency-Key`, `If-Match`

**Request body**

```json
{
  "reason": "Breaches sector limit",
  "expectedVersion": "2"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ord_draft_01",
    "status": "REJECTED",
    "version": 3
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/orders/:id/send-to-broker`

- **Permission:** `investments.execute`
- **Headers:** `Idempotency-Key`, `If-Match`

**Request body**

```json
{
  "venueCode": "ZSE",
  "brokerProfileId": "broker_01",
  "requestPayload": {
    "instruction": "LIMIT"
  },
  "externalOrderRef": null,
  "expectedVersion": "3"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ord_draft_01",
    "status": "SENT_TO_BROKER",
    "version": 4,
    "routes": [
      {
        "id": "oroute_01",
        "venueCode": "ZSE",
        "status": "SENT",
        "routeSequence": 1
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/orders/:id/settlement`

- **Permission:** `investments.execute`
- **Headers:** `Idempotency-Key`, `If-Match`

**Request body**

```json
{
  "status": "SETTLED",
  "allowDeferredAccounting": true,
  "reason": null,
  "expectedVersion": "5"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ord_draft_01",
    "status": "SETTLED",
    "version": 6
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/orders/:id/submit`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`, `If-Match`

**Request body**

```json
{
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ord_draft_01",
    "status": "SUBMITTED",
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/orders/:id/trade-confirmation`

- **Permission:** `investments.execute`
- **Headers:** `Idempotency-Key`, `If-Match`

**Request body**

```json
{
  "externalOrderRef": "BRK-99881",
  "routeId": "oroute_01",
  "confirmation": {
    "confirmedQty": "100"
  },
  "expectedVersion": "5"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "oroute_01",
    "status": "ACKNOWLEDGED",
    "externalOrderRef": "BRK-99881",
    "acknowledgedAt": "2026-07-19T10:05:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/orders/approval-routes`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "version": 1,
    "routes": [
      {
        "id": "route_def_01",
        "name": "Default equity route",
        "criteria": {
          "minNotional": "0"
        },
        "steps": [
          {
            "stepNo": 1,
            "role": "PORTFOLIO_MANAGER"
          }
        ]
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/orders/approval-routes`

- **Permission:** `investments.approve`
- **Headers:** `If-Match`

**Request body**

```json
{
  "name": "Large order route",
  "criteria": {
    "minNotional": "100000"
  },
  "steps": [
    {
      "stepNo": 1,
      "role": "PORTFOLIO_MANAGER"
    },
    {
      "stepNo": 2,
      "role": "COMPLIANCE"
    }
  ],
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "version": 2,
    "routes": [
      {
        "id": "route_def_02",
        "name": "Large order route"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `DELETE /api/investment-ops/orders/approval-routes/:id`

- **Permission:** `investments.approve`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": "3"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "version": 4,
    "deletedRouteId": "route_def_02"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/orders/approval-routes/:id`

- **Permission:** `investments.approve`
- **Headers:** `If-Match`

**Request body**

```json
{
  "name": "Large order route v2",
  "expectedVersion": "2"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "version": 3,
    "routes": [
      {
        "id": "route_def_02",
        "name": "Large order route v2"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/orders/configuration/:fundId`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "fundId": "fund_arcus_001",
    "settlementPolicyJson": {
      "cycle": "T+2"
    },
    "approvalPolicyJson": {
      "fourEyeOrders": true
    },
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/orders/configuration/:fundId`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "approvalPolicyJson": {
    "fourEyeOrders": true
  },
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "fundId": "fund_arcus_001",
    "approvalPolicyJson": {
      "fourEyeOrders": true
    },
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/orders/preview`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "fundId": "fund_arcus_001",
  "instrumentId": "instr_eco",
  "side": "BUY",
  "quantity": "100",
  "orderType": "LIMIT",
  "limitPrice": "10.00",
  "tradeCurrency": "USD",
  "settlementCurrency": "USD",
  "folderId": null,
  "brokerProfileId": null,
  "custodianProfileId": null,
  "tradeDate": "2026-07-19",
  "valueDate": "2026-07-21",
  "notes": "UAT ticket"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "prev_01",
    "orderId": "ord_draft_01",
    "revisionNo": 1,
    "inputHash": "sha256:9f2c...abc",
    "inputJson": {
      "fundId": "fund_arcus_001",
      "instrumentId": "instr_eco",
      "side": "BUY",
      "quantity": "100",
      "orderType": "LIMIT",
      "limitPrice": "10",
      "tradeCurrency": "USD",
      "settlementCurrency": "USD",
      "inputHash": "sha256:9f2c...abc"
    },
    "estimatedJson": {
      "approvedPrice": {
        "tickId": "tick_appr_01",
        "price": "10.0000",
        "priceType": "CLOSE",
        "sourceCode": "UAT_SETUP"
      },
      "approvedFx": {
        "snapshotId": null,
        "rate": "1",
        "pair": "USD/USD"
      },
      "holding": {
        "holdingId": null,
        "quantityBefore": "0",
        "quantityAfter": "100",
        "wac": "0"
      },
      "cash": {
        "cashAccountId": "cash_usd_01",
        "balanceBefore": "5000000",
        "impact": "-1000",
        "balanceAfter": "4999000"
      },
      "feesAndTaxes": {
        "feeAmount": "0",
        "taxAmount": "0",
        "commissionRateBps": "0"
      },
      "settlement": {
        "grossAmount": "1000",
        "netAmount": "1000",
        "tradeCurrency": "USD",
        "settlementCurrency": "USD"
      },
      "pnl": {
        "estimatedRealizedPnl": "0",
        "costBasisMethod": "WAC"
      },
      "exposure": {
        "portfolioValueBeforeBase": "0",
        "portfolioValueAfterBase": "1000",
        "securityWeightAfterPct": "100"
      }
    },
    "complianceJson": {
      "outcome": "PASSED",
      "message": "All checks passed",
      "checks": []
    },
    "priceSnapshotId": "tick_appr_01",
    "fxSnapshotId": null,
    "expiresAt": "2026-07-19T09:15:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

## Blotters, trading & trades

### `GET /api/investment-ops/blotters`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001&status=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "blot_01",
      "fundId": "fund_arcus_001",
      "blotterDate": "2026-07-19T00:00:00.000Z",
      "blotterType": "EQUITY",
      "status": "OPEN",
      "version": 1
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/blotters`

- **Permission:** `investments.write`

**Request body**

```json
{
  "fundId": "fund_arcus_001",
  "blotterDate": "2026-07-19",
  "blotterType": "EQUITY"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "blot_01",
    "fundId": "fund_arcus_001",
    "blotterDate": "2026-07-19T00:00:00.000Z",
    "blotterType": "EQUITY",
    "status": "OPEN",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/blotters/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "blot_01",
    "items": [
      {
        "lineNo": 1,
        "orderId": "ord_draft_01",
        "order": {
          "orderRef": "IO-001"
        }
      }
    ],
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/blotters/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "status": "CLOSED",
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "blot_01",
    "status": "CLOSED",
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/blotters/:id/orders`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "orderId": "ord_draft_01",
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "blot_01",
    "version": 2,
    "items": [
      {
        "lineNo": 1,
        "orderId": "ord_draft_01"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `DELETE /api/investment-ops/blotters/:id/orders/:orderId`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": "2"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "blot_01",
    "version": 3,
    "detachedOrderId": "ord_draft_01"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/trades`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001&page=1&pageSize=20`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "trade_01",
        "fundId": "fund_arcus_001",
        "status": "EXECUTED"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/trades/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "trade_01",
    "fundId": "fund_arcus_001",
    "status": "EXECUTED",
    "investmentOrderId": "ord_draft_01"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/trades/:id/confirm`

- **Permission:** `investments.execute`
- **Headers:** `Idempotency-Key`, `If-Match`

**Request body**

```json
{
  "externalOrderRef": "BRK-99881",
  "expectedVersion": "5"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "oroute_01",
    "status": "ACKNOWLEDGED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/trades/:id/execute`

- **Permission:** `investments.execute`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "quantity": "100",
  "price": "10.00"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "trade_01",
    "status": "EXECUTED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/trades/:id/routing-hops`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "hop_01",
      "status": "PENDING",
      "venueCode": "ZSE",
      "sequenceNo": 1
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/trades/:id/routing-hops/:hopId/cancel`

- **Permission:** `investments.execute`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "hop_01",
    "status": "CANCELLED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/trades/:id/routing-hops/:hopId/confirm`

- **Permission:** `investments.execute`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "hop_01",
    "status": "CONFIRMED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/trades/:id/routing-hops/:hopId/retry`

- **Permission:** `investments.execute`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "hop_01",
    "status": "PENDING",
    "retryCount": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/trades/:id/settle`

- **Permission:** `investments.execute`
- **Headers:** `Idempotency-Key`, `If-Match`

**Request body**

```json
{
  "allowDeferredAccounting": true,
  "expectedVersion": "5"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ord_draft_01",
    "status": "SETTLED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/trades/:id/settlement-document`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "tradeId": "trade_01",
    "documentId": "doc_settle_01",
    "downloadUrl": "/api/investment-ops/documents/doc_settle_01/download"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/trading/portfolios/:fundId/positions`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "fundId": "fund_arcus_001",
    "positions": [
      {
        "securityId": "sec_eco",
        "quantity": "1000.0000",
        "wac": "3.2500"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/trading/portfolios/:fundId/positions/recalculate`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "job_trade_recalc_01",
    "jobType": "TRADING_POSITIONS_RECALCULATE",
    "status": "PENDING",
    "aggregateId": "fund_arcus_001"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/trading/portfolios/:fundId/positions/summary`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "fundId": "fund_arcus_001",
    "positionCount": 12,
    "grossMarketValue": "456000.0000"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/trading/positions`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "id_01"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/trading/recalculate`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "OK",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/trading/saved-views`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "view_01",
      "name": "My blotter",
      "viewType": "TRADING",
      "version": 1,
      "isDefault": false
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/trading/saved-views`

- **Permission:** `investments.write`

**Request body**

```json
{
  "name": "My blotter",
  "filter": {
    "status": [
      "SENT_TO_BROKER"
    ]
  },
  "columns": [
    "orderRef",
    "side",
    "quantity"
  ],
  "sort": {
    "field": "createdAt",
    "direction": "desc"
  },
  "isDefault": false
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "view_01",
    "name": "My blotter",
    "viewType": "TRADING",
    "filterJson": {
      "status": [
        "SENT_TO_BROKER"
      ]
    },
    "columnJson": [
      "orderRef",
      "side",
      "quantity"
    ],
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `DELETE /api/investment-ops/trading/saved-views/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": "2"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "view_01",
    "deleted": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/trading/saved-views/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "name": "Desk blotter",
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "view_01",
    "name": "Desk blotter",
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/trading/summary`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "id_01"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

## Compliance

### `GET /api/investment-ops/compliance/overrides`

- **Permission:** `investments.read`
- **Query:** `status=PENDING`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "cov_01",
      "complianceResultId": "cres_01",
      "status": "PENDING",
      "reasonCode": "CLIENT_MANDATE"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/compliance/overrides/:id/approve`

- **Permission:** `investments.approve`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cov_01",
    "status": "APPROVED",
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/compliance/overrides/:id/reject`

- **Permission:** `investments.approve`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cov_01",
    "status": "REJECTED",
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/compliance/overrides/requests`

- **Permission:** `investments.write`

**Request body**

```json
{
  "complianceResultId": "cres_01",
  "reasonCode": "CLIENT_MANDATE",
  "reason": "Temporary overweight approved by IC",
  "documentId": null
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cov_01",
    "complianceResultId": "cres_01",
    "reasonCode": "CLIENT_MANDATE",
    "status": "PENDING",
    "requestedById": "user_trader_01",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/compliance/rules`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "crule_01",
      "fundId": "fund_arcus_001",
      "ruleCode": "MAX_NAME_5",
      "ruleName": "Max single name 5%",
      "ruleType": "MAX_SINGLE_SECURITY_WEIGHT",
      "thresholdValue": 5,
      "thresholdUnit": "PCT",
      "version": 1,
      "isActive": true
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/compliance/rules`

- **Permission:** `investments.write`

**Request body**

```json
{
  "fundId": "fund_arcus_001",
  "ruleCode": "MAX_NAME_5",
  "ruleName": "Max single name 5%",
  "ruleType": "MAX_SINGLE_SECURITY_WEIGHT",
  "thresholdValue": 5,
  "thresholdUnit": "PCT",
  "sectorCode": null,
  "countryCode": null,
  "issuerName": null,
  "esgFlag": null
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "crule_01",
    "fundId": "fund_arcus_001",
    "ruleCode": "MAX_NAME_5",
    "ruleType": "MAX_SINGLE_SECURITY_WEIGHT",
    "thresholdValue": 5,
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `DELETE /api/investment-ops/compliance/rules/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": "2"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "crule_01",
    "isActive": false,
    "version": 3
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/compliance/rules/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "crule_01",
    "ruleType": "MAX_SINGLE_SECURITY_WEIGHT",
    "thresholdValue": 5,
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/compliance/rules/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "thresholdValue": 4.5,
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "crule_01",
    "thresholdValue": 4.5,
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/compliance/runs`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "crun_01",
      "orderId": "ord_draft_01",
      "outcome": "PASSED",
      "createdAt": "2026-07-19T09:01:00.000Z"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/compliance/runs/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "crun_01",
    "outcome": "FAILED",
    "results": [
      {
        "id": "cres_01",
        "outcome": "FAILED",
        "ruleId": "crule_01"
      }
    ],
    "overrides": []
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

## Simulation & models

### `GET /api/investment-ops/model-portfolios`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "model_01",
      "name": "Balanced Equity",
      "baseCurrencyCode": "USD",
      "currentVersionNo": 1,
      "status": "DRAFT"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/model-portfolios`

- **Permission:** `investments.write`

**Request body**

```json
{
  "name": "Balanced Equity",
  "strategyCode": "BAL_EQ",
  "baseCurrencyCode": "USD",
  "allocations": [
    {
      "allocationType": "SECTOR",
      "allocationKey": "Telecom",
      "targetWeightPct": 40
    },
    {
      "allocationType": "SECTOR",
      "allocationKey": "Banks",
      "targetWeightPct": 60
    }
  ]
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "model_01",
    "name": "Balanced Equity",
    "strategyCode": "BAL_EQ",
    "baseCurrencyCode": "USD",
    "currentVersionNo": 1,
    "allocations": [
      {
        "allocationType": "SECTOR",
        "allocationKey": "Telecom",
        "targetWeightPct": "40"
      },
      {
        "allocationType": "SECTOR",
        "allocationKey": "Banks",
        "targetWeightPct": "60"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/model-portfolios/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "model_01",
    "name": "Balanced Equity",
    "allocations": [],
    "versions": []
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/model-portfolios/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "name": "Balanced Equity v2",
  "changeReason": "Reweight banks",
  "allocations": [
    {
      "allocationType": "SECTOR",
      "allocationKey": "Telecom",
      "targetWeightPct": "35"
    },
    {
      "allocationType": "SECTOR",
      "allocationKey": "Banks",
      "targetWeightPct": "65"
    }
  ],
  "expectedVersion": "1"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "model_01",
    "currentVersionNo": 2,
    "allocations": []
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/model-portfolios/:id/activate`

- **Permission:** `investments.approve`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": "2"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "model_01",
    "status": "ACTIVE",
    "currentVersionNo": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/model-portfolios/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": "2"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "model_01",
    "status": "ARCHIVED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/model-portfolios/:id/drift`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "allocationKey": "Telecom",
      "targetWeightPct": "40.0000",
      "actualWeightPct": "32.5000",
      "driftPct": "-7.5000",
      "rebalanceAction": "INCREASE"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/model-portfolios/:id/rebalance-recommendations`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "fundId": "fund_arcus_001"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "rebal_01",
    "modelPortfolioId": "model_01",
    "fundId": "fund_arcus_001",
    "status": "DRAFT",
    "items": [
      {
        "side": "BUY",
        "targetWeightPct": "40",
        "rebalanceAction": "INCREASE"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/rebalance-runs/:id/convert-to-draft-orders`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "rebalanceRunId": "rebal_01",
    "createdOrderIds": [
      "ord_rebal_01"
    ],
    "skipped": [],
    "status": "CONVERTED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/simulation/run`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "fundId": "fund_arcus_001",
  "scenario": {
    "side": "BUY",
    "instrumentId": "instr_eco",
    "securityId": "sec_eco",
    "quantity": "100",
    "price": "10.00"
  }
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "sim_01",
    "fundId": "fund_arcus_001",
    "status": "COMPLETED",
    "navBefore": "1250000.5000",
    "navAfter": "1251000.5000",
    "compliance": {
      "outcome": "PASSED",
      "checks": []
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/simulation/runs`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "sim_01",
      "fundId": "fund_arcus_001",
      "status": "COMPLETED"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/simulation/runs/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "sim_01",
    "navBefore": "1250000.5000",
    "navAfter": "1251000.5000",
    "compliance": {
      "outcome": "PASSED"
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

## Valuation

### `GET /api/investment-ops/valuation/exceptions`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001&status=OPEN`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "vexc_01",
      "valuationRunId": "valrun_01",
      "status": "OPEN",
      "exceptionType": "MISSING_APPROVED_PRICE",
      "instrumentId": "instr_eco"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/valuation/exceptions/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "vexc_01",
    "status": "OPEN",
    "exceptionType": "MISSING_APPROVED_PRICE",
    "overridePrice": null
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/valuation/exceptions/:id/approve-override`

- **Permission:** `investments.approve`

**Request body**

```json
{
  "reason": "Four-eye approved"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "vexc_01",
    "status": "RESOLVED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/valuation/exceptions/:id/escalate`

- **Permission:** `investments.write`

**Request body**

```json
{
  "reason": "Needs valuation committee"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "vexc_01",
    "status": "ESCALATED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/valuation/exceptions/:id/override`

- **Permission:** `investments.write`

**Request body**

```json
{
  "reason": "Use last good mid",
  "overridePrice": "4.50"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "vexc_01",
    "status": "OVERRIDE_PENDING",
    "overridePrice": "4.5"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/valuation/exceptions/:id/reject-override`

- **Permission:** `investments.approve`

**Request body**

```json
{
  "reason": "Need fresh tape"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "vexc_01",
    "status": "OPEN"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/valuation/exceptions/:id/resolve`

- **Permission:** `investments.approve`

**Request body**

```json
{
  "reason": "Price approved after refresh",
  "resolutionCode": "PRICE_REFRESHED"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "vexc_01",
    "status": "RESOLVED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/valuation/fx-validation`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "fundId": "fund_arcus_001",
    "items": [
      {
        "pair": "USD/ZWG",
        "readiness": "OK"
      },
      {
        "pair": "USD/EUR",
        "readiness": "MISSING_FX"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/valuation/price-validation`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "fundId": "fund_arcus_001",
    "items": [
      {
        "securityId": "sec_eco",
        "readiness": "OK"
      },
      {
        "securityId": "sec_xyz",
        "readiness": "MISSING_APPROVED_PRICE"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/valuation/runs`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001&status=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "valrun_01",
        "status": "COMPLETED",
        "navBaseCurrency": "1250000.5000",
        "asOf": "2026-07-18T00:00:00.000Z"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/valuation/runs`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "fundId": "fund_arcus_001",
  "asOf": "2026-07-18",
  "costBasisMethod": "WAC",
  "processNow": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "valrun_01",
    "fundId": "fund_arcus_001",
    "asOf": "2026-07-18T00:00:00.000Z",
    "status": "COMPLETED",
    "navBaseCurrency": "1250000.5000",
    "startedById": "user_admin",
    "parametersJson": {
      "costBasisMethod": "WAC",
      "formulaVersion": "WAC_MV_V1",
      "policyVersion": "VALUATION_POLICY_V1"
    },
    "jobId": "job_val_01",
    "statusUrl": "/api/investment-ops/jobs/job_val_01"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/valuation/runs/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "valrun_01",
    "status": "COMPLETED_WITH_EXCEPTIONS",
    "navBaseCurrency": "1250000.5000",
    "exceptions": [
      {
        "id": "vexc_01",
        "status": "OPEN"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/valuation/runs/:id/cancel`

- **Permission:** `investments.write`

**Request body**

```json
{
  "reason": "Wrong asOf date"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "valrun_01",
    "status": "CANCELLED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/valuation/runs/:id/inputs`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "vin_01",
      "valuationRunId": "valrun_01",
      "inputType": "PRICE",
      "contentHash": "sha256:..."
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/valuation/runs/:id/items`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "vitem_01",
        "quantity": "1000.0000",
        "price": "4.5600",
        "marketValue": "4560.0000",
        "baseMarketValue": "4560.0000",
        "costValue": "3250.0000",
        "unrealizedPnl": "1310.0000"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/valuation/runs/:id/rerun`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "processNow": false
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "valrun_02",
    "status": "QUEUED",
    "jobId": "job_val_02",
    "statusUrl": "/api/investment-ops/jobs/job_val_02"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/valuation/runs/:id/summary`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "valuationRunId": "valrun_01",
    "navBaseCurrency": "1250000.5000",
    "itemCount": 12,
    "exceptionCount": 1,
    "status": "COMPLETED_WITH_EXCEPTIONS"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

## Reconciliation

### `GET /api/investment-ops/reconciliation/batches`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "rbatch_01",
      "reconType": "HOLDINGS",
      "status": "COMPLETED"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/reconciliation/batches/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "rbatch_01",
    "status": "COMPLETED",
    "items": [
      {
        "id": "ritem_01",
        "status": "UNMATCHED",
        "variance": "3250.0000"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/reconciliation/items`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001&status=UNMATCHED`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "ritem_01",
      "status": "UNMATCHED",
      "variance": "3250.0000",
      "message": "No external line for holding"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/reconciliation/items/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ritem_01",
    "batchId": "rbatch_01",
    "status": "UNMATCHED",
    "internalAmount": "3250.0000",
    "externalAmount": "0.0000",
    "variance": "3250.0000"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/reconciliation/items/:id/approve-write-off`

- **Permission:** `investments.approve`

**Request body**

```json
{
  "reason": "Approved under threshold"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ritem_01",
    "status": "WRITTEN_OFF"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/reconciliation/items/:id/assign`

- **Permission:** `investments.write`

**Request body**

```json
{
  "assigneeId": "user_ops_01",
  "reason": "Investigate with custodian"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ritem_01",
    "status": "ASSIGNED",
    "assigneeId": "user_ops_01"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/reconciliation/items/:id/escalate`

- **Permission:** `investments.write`

**Request body**

```json
{
  "reason": "Material variance"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ritem_01",
    "status": "ESCALATED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/reconciliation/items/:id/history`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "at": "2026-07-19T09:00:00.000Z",
      "fromStatus": "UNMATCHED",
      "toStatus": "ASSIGNED",
      "actorId": "user_ops_01"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/reconciliation/items/:id/investigate`

- **Permission:** `investments.write`

**Request body**

```json
{
  "reason": "Pulling raw statement"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ritem_01",
    "status": "INVESTIGATING"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/reconciliation/items/:id/reject-write-off`

- **Permission:** `investments.approve`

**Request body**

```json
{
  "reason": "Needs further investigation"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ritem_01",
    "status": "INVESTIGATING"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/reconciliation/items/:id/reopen`

- **Permission:** `investments.write`

**Request body**

```json
{
  "reason": "New custodian data arrived"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ritem_01",
    "status": "UNMATCHED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/reconciliation/items/:id/resolve`

- **Permission:** `investments.approve`

**Request body**

```json
{
  "reason": "Timing difference cleared",
  "documentId": "doc_01"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ritem_01",
    "status": "RESOLVED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/reconciliation/items/:id/write-off`

- **Permission:** `investments.write`

**Request body**

```json
{
  "reason": "Immaterial residual"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ritem_01",
    "status": "WRITE_OFF_PENDING"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/reconciliation/run`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "fundId": "fund_arcus_001",
  "reconType": "HOLDINGS",
  "uploadId": "job_rup_01",
  "asOfDate": "2026-07-18",
  "processNow": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "rbatch_01",
    "fundId": "fund_arcus_001",
    "reconType": "HOLDINGS",
    "status": "COMPLETED",
    "items": [
      {
        "id": "ritem_01",
        "status": "UNMATCHED",
        "internalRef": "ECO:ZSE",
        "internalAmount": "3250.0000",
        "externalAmount": "0.0000",
        "variance": "3250.0000"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/reconciliation/summary`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001&reconType=HOLDINGS`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "fundId": "fund_arcus_001",
    "matched": 10,
    "unmatched": 2,
    "investigating": 1,
    "writtenOff": 0,
    "totalVariance": "3250.0000"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/reconciliation/upload`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

_Same as `POST /reconciliation/uploads` (alias)._

**Request body**

```json
{
  "fundId": "fund_arcus_001",
  "reconType": "HOLDINGS",
  "fileName": "custodian-positions.csv",
  "sourceCode": "CUSTODIAN_A",
  "csvText": "symbol,quantity\\nECO,1000\\n"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "uploadId": "job_rup_01",
    "fundId": "fund_arcus_001",
    "reconType": "HOLDINGS",
    "fileName": "custodian-positions.csv",
    "rowCount": 1,
    "sourceId": "rsrc_01"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/reconciliation/uploads`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "fundId": "fund_arcus_001",
  "reconType": "HOLDINGS",
  "fileName": "custodian-positions.csv",
  "sourceCode": "CUSTODIAN_A",
  "csvText": "symbol,quantity\\nECO,1000\\n"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "uploadId": "job_rup_01",
    "fundId": "fund_arcus_001",
    "reconType": "HOLDINGS",
    "fileName": "custodian-positions.csv",
    "rowCount": 1,
    "sourceId": "rsrc_01"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

## Accounting

### `GET /api/investment-ops/accounting/events`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001&page=1&pageSize=20`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "aevt_01",
        "fundId": "fund_arcus_001",
        "eventType": "TRADE_SETTLEMENT",
        "status": "POSTED",
        "amount": "1000.0000",
        "currencyCode": "USD"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/accounting/events/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "aevt_01",
    "status": "POSTED",
    "journalEntryId": "jnl_01",
    "amount": "1000.0000"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/accounting/events/:id/retry`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "aevt_01",
    "status": "POSTED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/accounting/events/:id/reverse`

- **Permission:** `investments.approve`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "reason": "Incorrect economic date"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "arev_01",
    "eventId": "aevt_01",
    "status": "PENDING",
    "reason": "Incorrect economic date"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/accounting/journals`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "jnl_01",
      "status": "DRAFT",
      "fundId": "fund_arcus_001",
      "currencyCode": "USD"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/accounting/journals/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "jnl_01",
    "status": "DRAFT",
    "lines": [
      {
        "accountCode": "1100",
        "debit": "1000.0000",
        "credit": "0.0000"
      },
      {
        "accountCode": "2100",
        "debit": "0.0000",
        "credit": "1000.0000"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/accounting/journals/:id/approve`

- **Permission:** `investments.approve`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "jnl_01",
    "status": "APPROVED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/accounting/journals/:id/post`

- **Permission:** `investments.approve`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "jnl_01",
    "status": "POSTED",
    "postedAt": "2026-07-19T11:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/accounting/journals/:id/reject`

- **Permission:** `investments.approve`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "reason": "Wrong GL mapping"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "jnl_01",
    "status": "REJECTED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/accounting/journals/:id/submit`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "jnl_01",
    "status": "PENDING_APPROVAL"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/accounting/ledger-exports`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "lex_01",
      "fundId": "fund_arcus_001",
      "exportBatchRef": "LEX-ABC",
      "status": "COMPLETED"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/accounting/ledger-exports`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "fundId": "fund_arcus_001",
  "from": "2026-07-01",
  "to": "2026-07-19",
  "format": "JSON"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "lex_01",
    "fundId": "fund_arcus_001",
    "exportBatchRef": "LEX-M8K2",
    "status": "COMPLETED",
    "eventCount": 12
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/accounting/ledger-exports/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "lex_01",
    "exportBatchRef": "LEX-M8K2",
    "status": "COMPLETED",
    "eventCount": 12
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/accounting/ledger-exports/:id/download`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "note": "Binary/JSON file stream; not JSON envelope",
    "fileName": "LEX-M8K2.json"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/accounting/reversals`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "arev_01",
      "status": "PENDING",
      "eventId": "aevt_01"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/accounting/reversals/:id/approve`

- **Permission:** `investments.approve`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "arev_01",
    "status": "APPROVED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/accounting/reversals/:id/reject`

- **Permission:** `investments.approve`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "reason": "Keep original"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "arev_01",
    "status": "REJECTED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

## Files & documents

### `GET /api/investment-ops/documents`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001&approvalStatus=&page=1&pageSize=20`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "doc_01",
        "title": "Custodian pack",
        "documentType": "CUSTODIAN_STATEMENT",
        "approvalStatus": "PENDING_REVIEW"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/documents`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "fundId": "fund_arcus_001",
  "documentType": "CUSTODIAN_STATEMENT",
  "title": "Custodian pack July",
  "fileId": "job_file_01",
  "classification": "INTERNAL",
  "orderId": null,
  "tradeId": null
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "doc_01",
    "fundId": "fund_arcus_001",
    "documentType": "CUSTODIAN_STATEMENT",
    "title": "Custodian pack July",
    "approvalStatus": "PENDING_REVIEW",
    "currentVersionNo": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/documents/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "doc_01",
    "title": "Custodian pack July",
    "versions": [
      {
        "id": "dver_01",
        "versionNo": 1,
        "status": "PENDING_REVIEW"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/documents/:id`

- **Permission:** `investments.write`

**Request body**

```json
{
  "title": "Custodian pack July (final)",
  "classification": "CONFIDENTIAL"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "doc_01",
    "title": "Custodian pack July (final)",
    "classification": "CONFIDENTIAL"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/documents/:id/access`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "documentId": "doc_01",
    "entries": [
      {
        "subjectType": "USER",
        "subjectId": "user_pm_01",
        "accessLevel": "READ"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PUT /api/investment-ops/documents/:id/access`

- **Permission:** `investments.approve`

**Request body**

```json
{
  "entries": [
    {
      "subjectType": "USER",
      "subjectId": "user_pm_01",
      "accessLevel": "READ"
    }
  ]
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "documentId": "doc_01",
    "entries": [
      {
        "subjectType": "USER",
        "subjectId": "user_pm_01",
        "accessLevel": "READ"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/documents/:id/archive`

- **Permission:** `investments.write`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "doc_01",
    "archived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/documents/:id/audit`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "eventType": "DOCUMENT_CREATED",
      "at": "2026-07-19T09:00:00.000Z",
      "actorId": "user_admin"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/documents/:id/download`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "note": "Binary download of latest/approved version"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/documents/:id/versions`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "id": "dver_01",
      "versionNo": 1,
      "status": "PENDING_REVIEW"
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/documents/:id/versions`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "fileId": "job_file_02"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "dver_02",
    "versionNo": 2,
    "status": "PENDING_REVIEW"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/documents/:id/versions/:versionId/approve`

- **Permission:** `investments.approve`

**Request body**

```json
{
  "reason": "Looks good"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "dver_01",
    "status": "APPROVED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/documents/:id/versions/:versionId/download`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "note": "Binary download"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/documents/:id/versions/:versionId/preview`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "note": "Binary/stream preview"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/documents/:id/versions/:versionId/reject`

- **Permission:** `investments.approve`

**Request body**

```json
{
  "reason": "Wrong statement month"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "dver_01",
    "status": "REJECTED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/documents/:id/versions/:versionId/request-changes`

- **Permission:** `investments.write`

**Request body**

```json
{
  "reason": "Need signed version"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "dver_01",
    "status": "CHANGES_REQUESTED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/files`

- **Permission:** `investments.write`

**Request body**

```json
{
  "uploadSessionId": "job_file_01",
  "contentBase64": "JVBERi0xLjQK...",
  "checksumSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "fileId": "job_file_01",
    "status": "UPLOADED",
    "checksumSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "malwareStatus": "SCAN_PENDING"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/files/:fileId/complete`

- **Permission:** `investments.write`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "fileId": "job_file_01",
    "status": "READY",
    "malwareStatus": "CLEAN"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/files/:fileId/status`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "fileId": "job_file_01",
    "status": "READY",
    "malwareStatus": "CLEAN",
    "fileName": "custodian-pack.pdf"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/files/upload-sessions`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "fundId": "fund_arcus_001",
  "fileName": "custodian-pack.pdf",
  "mimeType": "application/pdf",
  "byteSize": 1024,
  "checksumSha256": null
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "uploadSessionId": "job_file_01",
    "fileId": "job_file_01",
    "status": "AWAITING_UPLOAD",
    "maxBytes": 26214400,
    "allowedMimeTypes": [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "text/csv",
      "text/plain",
      "application/json",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

## Reports, jobs, outbox, audit

### `GET /api/investment-ops/audit-events`

- **Permission:** `investments.read`
- **Query:** `aggregateType=Order&aggregateId=ord_draft_01&page=1&pageSize=20`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "aud_01",
        "aggregateType": "Order",
        "aggregateId": "ord_draft_01",
        "eventType": "ORDER_SUBMITTED",
        "actorId": "user_trader_01",
        "correlationId": "req-abc123"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/capabilities`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "userId": "user_admin",
    "isAdmin": true,
    "permissions": [
      "investments.read",
      "investments.write",
      "investments.approve",
      "investments.execute"
    ],
    "permittedActions": [
      "READ",
      "WRITE",
      "APPROVE",
      "EXECUTE"
    ],
    "fundAccess": {
      "fundId": "fund_arcus_001",
      "hasAccess": true,
      "assignmentRoles": [
        "PORTFOLIO_MANAGER"
      ],
      "capabilityCodes": [
        "TRADE",
        "VALUE"
      ]
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/jobs/:jobId`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "job_val_01",
    "jobType": "VALUATION_RUN",
    "status": "COMPLETED",
    "aggregateType": "ValuationRun",
    "aggregateId": "valrun_01",
    "attempts": 1,
    "lastError": null,
    "permittedActions": []
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/jobs/:jobId/cancel`

- **Permission:** `investments.write`

**Request body**

```json
{
  "reason": "User cancelled"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "job_val_01",
    "status": "CANCELLED"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/outbox-events`

- **Permission:** `investments.read`
- **Query:** `status=PENDING&aggregateType=&eventType=&page=1&pageSize=20`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "obx_01",
        "aggregateType": "ReportRun",
        "aggregateId": "rpt_01",
        "eventType": "REPORT_QUEUED",
        "status": "PENDING",
        "payloadJson": {
          "reportRunId": "rpt_01",
          "jobId": "job_rpt_01"
        }
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/outbox-events/poll`

- **Permission:** `investments.read`
- **Query:** `limit=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "obx_01",
        "eventType": "REPORT_QUEUED",
        "status": "PENDING"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/reports`

- **Permission:** `investments.read`
- **Query:** `fundId=fund_arcus_001&reportType=&status=&page=1&pageSize=20`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "rpt_01",
        "reportType": "HOLDINGS_REPORT",
        "format": "PDF",
        "status": "COMPLETED",
        "downloadAvailable": true
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/reports/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "rpt_01",
    "status": "COMPLETED",
    "downloadAvailable": true,
    "permittedActions": [
      "DOWNLOAD"
    ],
    "jobId": "job_rpt_01"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/reports/:id/audit`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "reportRunId": "rpt_01",
    "events": [
      {
        "eventType": "REPORT_QUEUED"
      },
      {
        "eventType": "REPORT_COMPLETED"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/reports/:id/cancel`

- **Permission:** `investments.write`

**Request body**

```json
{
  "reason": "Wrong period"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "rpt_01",
    "status": "CANCELLED",
    "downloadAvailable": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/reports/:id/download`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "note": "Binary PDF/XLSX; may include X-Checksum-Sha256 header"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/reports/:id/retry`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "rpt_01",
    "status": "QUEUED",
    "jobId": "job_rpt_02",
    "permittedActions": [
      "CANCEL"
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/reports/generate`

- **Permission:** `investments.write`
- **Headers:** `Idempotency-Key`

**Request body**

```json
{
  "fundId": "fund_arcus_001",
  "reportType": "HOLDINGS_REPORT",
  "format": "PDF",
  "parameters": {
    "periodStart": "2026-01-01",
    "periodEnd": "2026-06-30"
  },
  "processNow": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "rpt_01",
    "fundId": "fund_arcus_001",
    "clientId": null,
    "scopeType": "FUND",
    "reportType": "HOLDINGS_REPORT",
    "format": "PDF",
    "status": "QUEUED",
    "parameters": {
      "periodStart": "2026-01-01",
      "periodEnd": "2026-06-30"
    },
    "jobId": "job_rpt_01",
    "checksumSha256": null,
    "expiresAt": null,
    "expired": false,
    "templateVersion": "1.0",
    "errorMessage": null,
    "byteSize": null,
    "downloadAvailable": false,
    "permittedActions": [
      "CANCEL"
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/reports/templates`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": [
    {
      "code": "HOLDINGS_REPORT",
      "name": "Holdings Report",
      "scopeType": "FUND",
      "supportedFormats": [
        "PDF",
        "XLSX"
      ],
      "requiresFundId": true,
      "requiresClientId": false,
      "version": "1.0",
      "parameterSchema": {
        "periodStart": "date",
        "periodEnd": "date"
      }
    }
  ],
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

## Setup

### `GET /api/investment-ops/setup/brokers`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "id_01"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/brokers`

- **Permission:** `investments.write`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "OK",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/commissions`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&includeArchived=false&search=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "commissions_01",
        "stakeholderProfileId": "broker_01",
        "instrumentTypeCode": "EQUITY",
        "rateBps": "15",
        "flatFee": "0",
        "currencyCode": "USD",
        "isActive": true,
        "version": 1,
        "isArchived": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/commissions`

- **Permission:** `investments.write`

**Request body**

```json
{
  "stakeholderProfileId": "broker_01",
  "instrumentTypeCode": "EQUITY",
  "rateBps": "15",
  "flatFee": "0",
  "currencyCode": "USD",
  "isActive": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "commissions_01",
    "stakeholderProfileId": "broker_01",
    "instrumentTypeCode": "EQUITY",
    "rateBps": "15",
    "flatFee": "0",
    "currencyCode": "USD",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/commissions/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "commissions_01",
    "stakeholderProfileId": "broker_01",
    "instrumentTypeCode": "EQUITY",
    "rateBps": "15",
    "flatFee": "0",
    "currencyCode": "USD",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/setup/commissions/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "stakeholderProfileId": "broker_01",
  "instrumentTypeCode": "EQUITY",
  "rateBps": "15",
  "flatFee": "0",
  "currencyCode": "USD",
  "isActive": true,
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "commissions_01",
    "stakeholderProfileId": "broker_01",
    "instrumentTypeCode": "EQUITY",
    "rateBps": "15",
    "flatFee": "0",
    "currencyCode": "USD",
    "isActive": true,
    "version": 2,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/commissions/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "commissions_01",
    "stakeholderProfileId": "broker_01",
    "instrumentTypeCode": "EQUITY",
    "rateBps": "15",
    "flatFee": "0",
    "currencyCode": "USD",
    "isActive": false,
    "version": 2,
    "isArchived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/corporate-action-mappings`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&includeArchived=false&search=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "corporate-action-mappings_01",
        "code": "DIV",
        "name": "Cash dividend",
        "externalCode": "DVCA",
        "isActive": true,
        "version": 1,
        "isArchived": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/corporate-action-mappings`

- **Permission:** `investments.write`

**Request body**

```json
{
  "code": "DIV",
  "name": "Cash dividend",
  "externalCode": "DVCA",
  "isActive": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "corporate-action-mappings_01",
    "code": "DIV",
    "name": "Cash dividend",
    "externalCode": "DVCA",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PUT /api/investment-ops/setup/corporate-action-mappings`

- **Permission:** `investments.write`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "OK",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/corporate-action-mappings/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "corporate-action-mappings_01",
    "code": "DIV",
    "name": "Cash dividend",
    "externalCode": "DVCA",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/setup/corporate-action-mappings/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "code": "DIV",
  "name": "Cash dividend",
  "externalCode": "DVCA",
  "isActive": true,
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "corporate-action-mappings_01",
    "code": "DIV",
    "name": "Cash dividend",
    "externalCode": "DVCA",
    "isActive": true,
    "version": 2,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/corporate-action-mappings/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "corporate-action-mappings_01",
    "code": "DIV",
    "name": "Cash dividend",
    "externalCode": "DVCA",
    "isActive": false,
    "version": 2,
    "isArchived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/countries`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&includeArchived=false&search=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "countries_01",
        "countryCode": "ZW",
        "countryName": "Zimbabwe",
        "region": "Africa",
        "isActive": true,
        "version": 1,
        "isArchived": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/countries`

- **Permission:** `investments.write`

**Request body**

```json
{
  "countryCode": "ZW",
  "countryName": "Zimbabwe",
  "region": "Africa",
  "isActive": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "countries_01",
    "countryCode": "ZW",
    "countryName": "Zimbabwe",
    "region": "Africa",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/countries/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "countries_01",
    "countryCode": "ZW",
    "countryName": "Zimbabwe",
    "region": "Africa",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/setup/countries/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "countryCode": "ZW",
  "countryName": "Zimbabwe",
  "region": "Africa",
  "isActive": true,
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "countries_01",
    "countryCode": "ZW",
    "countryName": "Zimbabwe",
    "region": "Africa",
    "isActive": true,
    "version": 2,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/countries/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "countries_01",
    "countryCode": "ZW",
    "countryName": "Zimbabwe",
    "region": "Africa",
    "isActive": false,
    "version": 2,
    "isArchived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/coupon-frequencies`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&includeArchived=false&search=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "coupon-frequencies_01",
        "code": "SEMI",
        "name": "Semi-annual",
        "isActive": true,
        "version": 1,
        "isArchived": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/coupon-frequencies`

- **Permission:** `investments.write`

**Request body**

```json
{
  "code": "SEMI",
  "name": "Semi-annual",
  "isActive": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "coupon-frequencies_01",
    "code": "SEMI",
    "name": "Semi-annual",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/coupon-frequencies/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "coupon-frequencies_01",
    "code": "SEMI",
    "name": "Semi-annual",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/setup/coupon-frequencies/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "code": "SEMI",
  "name": "Semi-annual",
  "isActive": true,
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "coupon-frequencies_01",
    "code": "SEMI",
    "name": "Semi-annual",
    "isActive": true,
    "version": 2,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/coupon-frequencies/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "coupon-frequencies_01",
    "code": "SEMI",
    "name": "Semi-annual",
    "isActive": false,
    "version": 2,
    "isArchived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/currencies`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&includeArchived=false&search=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "currencies_01",
        "code": "USD",
        "name": "US Dollar",
        "symbol": "$",
        "isDefault": true,
        "isActive": true,
        "version": 1,
        "isArchived": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/currencies`

- **Permission:** `investments.write`

**Request body**

```json
{
  "code": "USD",
  "name": "US Dollar",
  "symbol": "$",
  "isDefault": true,
  "isActive": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "currencies_01",
    "code": "USD",
    "name": "US Dollar",
    "symbol": "$",
    "isDefault": true,
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/currencies/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "currencies_01",
    "code": "USD",
    "name": "US Dollar",
    "symbol": "$",
    "isDefault": true,
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/setup/currencies/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "code": "USD",
  "name": "US Dollar",
  "symbol": "$",
  "isDefault": true,
  "isActive": true,
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "currencies_01",
    "code": "USD",
    "name": "US Dollar",
    "symbol": "$",
    "isDefault": true,
    "isActive": true,
    "version": 2,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/currencies/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "currencies_01",
    "code": "USD",
    "name": "US Dollar",
    "symbol": "$",
    "isDefault": true,
    "isActive": false,
    "version": 2,
    "isArchived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/custodians`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "id_01"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/custodians`

- **Permission:** `investments.write`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "OK",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/funds`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "id_01"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/funds`

- **Permission:** `investments.write`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "OK",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/funds/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "ACTIVE",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PUT /api/investment-ops/setup/funds/:id`

- **Permission:** `investments.write`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "OK",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PUT /api/investment-ops/setup/funds/:id/config`

- **Permission:** `investments.write`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "OK",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/funds/:id/managers`

- **Permission:** `investments.approve`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "OK",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/instrument-mappings`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&includeArchived=false&search=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "instrument-mappings_01",
        "code": "ECO_MAP",
        "name": "ECO mapping",
        "externalSymbol": "ECO",
        "internalInstrumentCode": "ECO.ZSE",
        "isActive": true,
        "version": 1,
        "isArchived": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/instrument-mappings`

- **Permission:** `investments.write`

**Request body**

```json
{
  "code": "ECO_MAP",
  "name": "ECO mapping",
  "externalSymbol": "ECO",
  "internalInstrumentCode": "ECO.ZSE",
  "isActive": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instrument-mappings_01",
    "code": "ECO_MAP",
    "name": "ECO mapping",
    "externalSymbol": "ECO",
    "internalInstrumentCode": "ECO.ZSE",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/instrument-mappings/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instrument-mappings_01",
    "code": "ECO_MAP",
    "name": "ECO mapping",
    "externalSymbol": "ECO",
    "internalInstrumentCode": "ECO.ZSE",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/setup/instrument-mappings/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "code": "ECO_MAP",
  "name": "ECO mapping",
  "externalSymbol": "ECO",
  "internalInstrumentCode": "ECO.ZSE",
  "isActive": true,
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instrument-mappings_01",
    "code": "ECO_MAP",
    "name": "ECO mapping",
    "externalSymbol": "ECO",
    "internalInstrumentCode": "ECO.ZSE",
    "isActive": true,
    "version": 2,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/instrument-mappings/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instrument-mappings_01",
    "code": "ECO_MAP",
    "name": "ECO mapping",
    "externalSymbol": "ECO",
    "internalInstrumentCode": "ECO.ZSE",
    "isActive": false,
    "version": 2,
    "isArchived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/instrument-subcategories`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&includeArchived=false&search=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "instrument-subcategories_01",
        "code": "COMMON",
        "name": "Common Stock",
        "parentTypeCode": "EQUITY",
        "isActive": true,
        "version": 1,
        "isArchived": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/instrument-subcategories`

- **Permission:** `investments.write`

**Request body**

```json
{
  "code": "COMMON",
  "name": "Common Stock",
  "parentTypeCode": "EQUITY",
  "isActive": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instrument-subcategories_01",
    "code": "COMMON",
    "name": "Common Stock",
    "parentTypeCode": "EQUITY",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/instrument-subcategories/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instrument-subcategories_01",
    "code": "COMMON",
    "name": "Common Stock",
    "parentTypeCode": "EQUITY",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/setup/instrument-subcategories/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "code": "COMMON",
  "name": "Common Stock",
  "parentTypeCode": "EQUITY",
  "isActive": true,
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instrument-subcategories_01",
    "code": "COMMON",
    "name": "Common Stock",
    "parentTypeCode": "EQUITY",
    "isActive": true,
    "version": 2,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/instrument-subcategories/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instrument-subcategories_01",
    "code": "COMMON",
    "name": "Common Stock",
    "parentTypeCode": "EQUITY",
    "isActive": false,
    "version": 2,
    "isArchived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/instrument-types`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&includeArchived=false&search=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "instrument-types_01",
        "typeCode": "EQUITY",
        "displayName": "Equity",
        "isActive": true,
        "version": 1,
        "isArchived": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/instrument-types`

- **Permission:** `investments.write`

**Request body**

```json
{
  "typeCode": "EQUITY",
  "displayName": "Equity",
  "isActive": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instrument-types_01",
    "typeCode": "EQUITY",
    "displayName": "Equity",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/instrument-types/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instrument-types_01",
    "typeCode": "EQUITY",
    "displayName": "Equity",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/setup/instrument-types/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "typeCode": "EQUITY",
  "displayName": "Equity",
  "isActive": true,
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instrument-types_01",
    "typeCode": "EQUITY",
    "displayName": "Equity",
    "isActive": true,
    "version": 2,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/instrument-types/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "instrument-types_01",
    "typeCode": "EQUITY",
    "displayName": "Equity",
    "isActive": false,
    "version": 2,
    "isArchived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/issuers`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&includeArchived=false&search=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "issuers_01",
        "issuerCode": "ECONET",
        "legalName": "Econet Wireless",
        "countryCode": "ZW",
        "sector": "Telecom",
        "isActive": true,
        "version": 1,
        "isArchived": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/issuers`

- **Permission:** `investments.write`

**Request body**

```json
{
  "issuerCode": "ECONET",
  "legalName": "Econet Wireless",
  "countryCode": "ZW",
  "sector": "Telecom",
  "isActive": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "issuers_01",
    "issuerCode": "ECONET",
    "legalName": "Econet Wireless",
    "countryCode": "ZW",
    "sector": "Telecom",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/issuers/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "issuers_01",
    "issuerCode": "ECONET",
    "legalName": "Econet Wireless",
    "countryCode": "ZW",
    "sector": "Telecom",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/setup/issuers/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "issuerCode": "ECONET",
  "legalName": "Econet Wireless",
  "countryCode": "ZW",
  "sector": "Telecom",
  "isActive": true,
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "issuers_01",
    "issuerCode": "ECONET",
    "legalName": "Econet Wireless",
    "countryCode": "ZW",
    "sector": "Telecom",
    "isActive": true,
    "version": 2,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/issuers/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "issuers_01",
    "issuerCode": "ECONET",
    "legalName": "Econet Wireless",
    "countryCode": "ZW",
    "sector": "Telecom",
    "isActive": false,
    "version": 2,
    "isArchived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/markets`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&includeArchived=false&search=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "markets_01",
        "marketCode": "ZSE",
        "marketName": "Zimbabwe Stock Exchange",
        "countryCode": "ZW",
        "exchangeCode": "ZSE",
        "isActive": true,
        "version": 1,
        "isArchived": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/markets`

- **Permission:** `investments.write`

**Request body**

```json
{
  "marketCode": "ZSE",
  "marketName": "Zimbabwe Stock Exchange",
  "countryCode": "ZW",
  "exchangeCode": "ZSE",
  "isActive": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "markets_01",
    "marketCode": "ZSE",
    "marketName": "Zimbabwe Stock Exchange",
    "countryCode": "ZW",
    "exchangeCode": "ZSE",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/markets/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "markets_01",
    "marketCode": "ZSE",
    "marketName": "Zimbabwe Stock Exchange",
    "countryCode": "ZW",
    "exchangeCode": "ZSE",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/setup/markets/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "marketCode": "ZSE",
  "marketName": "Zimbabwe Stock Exchange",
  "countryCode": "ZW",
  "exchangeCode": "ZSE",
  "isActive": true,
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "markets_01",
    "marketCode": "ZSE",
    "marketName": "Zimbabwe Stock Exchange",
    "countryCode": "ZW",
    "exchangeCode": "ZSE",
    "isActive": true,
    "version": 2,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/markets/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "markets_01",
    "marketCode": "ZSE",
    "marketName": "Zimbabwe Stock Exchange",
    "countryCode": "ZW",
    "exchangeCode": "ZSE",
    "isActive": false,
    "version": 2,
    "isArchived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/price-sources`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&includeArchived=false&search=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "price-sources_01",
        "sourceCode": "MANSA",
        "displayName": "Mansa MD",
        "isEnabled": true,
        "version": 1,
        "isActive": true,
        "isArchived": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/price-sources`

- **Permission:** `investments.write`

**Request body**

```json
{
  "sourceCode": "MANSA",
  "displayName": "Mansa MD",
  "isEnabled": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "price-sources_01",
    "sourceCode": "MANSA",
    "displayName": "Mansa MD",
    "isEnabled": true,
    "version": 1,
    "isActive": true,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/price-sources/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "price-sources_01",
    "sourceCode": "MANSA",
    "displayName": "Mansa MD",
    "isEnabled": true,
    "version": 1,
    "isActive": true,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/setup/price-sources/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "sourceCode": "MANSA",
  "displayName": "Mansa MD",
  "isEnabled": true,
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "price-sources_01",
    "sourceCode": "MANSA",
    "displayName": "Mansa MD",
    "isEnabled": true,
    "version": 2,
    "isActive": true,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/price-sources/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "price-sources_01",
    "sourceCode": "MANSA",
    "displayName": "Mansa MD",
    "isEnabled": true,
    "version": 2,
    "isActive": false,
    "isArchived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/reference-types`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "id_01"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/settings`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "id_01"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PUT /api/investment-ops/setup/settings`

- **Permission:** `investments.write`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "id_01",
    "status": "OK",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/settlement-accounts`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&includeArchived=false&search=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "settlement-accounts_01",
        "code": "USD_OPS",
        "name": "USD Ops Cash",
        "currencyCode": "USD",
        "isActive": true,
        "version": 1,
        "isArchived": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/settlement-accounts`

- **Permission:** `investments.write`

**Request body**

```json
{
  "code": "USD_OPS",
  "name": "USD Ops Cash",
  "currencyCode": "USD",
  "isActive": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "settlement-accounts_01",
    "code": "USD_OPS",
    "name": "USD Ops Cash",
    "currencyCode": "USD",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/settlement-accounts/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "settlement-accounts_01",
    "code": "USD_OPS",
    "name": "USD Ops Cash",
    "currencyCode": "USD",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/setup/settlement-accounts/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "code": "USD_OPS",
  "name": "USD Ops Cash",
  "currencyCode": "USD",
  "isActive": true,
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "settlement-accounts_01",
    "code": "USD_OPS",
    "name": "USD Ops Cash",
    "currencyCode": "USD",
    "isActive": true,
    "version": 2,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/settlement-accounts/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "settlement-accounts_01",
    "code": "USD_OPS",
    "name": "USD Ops Cash",
    "currencyCode": "USD",
    "isActive": false,
    "version": 2,
    "isArchived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/ssis`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&includeArchived=false&search=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "ssis_01",
        "code": "SSI_USD",
        "name": "USD SSI",
        "bankName": "CBZ",
        "accountNumber": "000123",
        "isActive": true,
        "version": 1,
        "isArchived": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/ssis`

- **Permission:** `investments.write`

**Request body**

```json
{
  "code": "SSI_USD",
  "name": "USD SSI",
  "bankName": "CBZ",
  "accountNumber": "000123",
  "isActive": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ssis_01",
    "code": "SSI_USD",
    "name": "USD SSI",
    "bankName": "CBZ",
    "accountNumber": "000123",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/ssis/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ssis_01",
    "code": "SSI_USD",
    "name": "USD SSI",
    "bankName": "CBZ",
    "accountNumber": "000123",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/setup/ssis/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "code": "SSI_USD",
  "name": "USD SSI",
  "bankName": "CBZ",
  "accountNumber": "000123",
  "isActive": true,
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ssis_01",
    "code": "SSI_USD",
    "name": "USD SSI",
    "bankName": "CBZ",
    "accountNumber": "000123",
    "isActive": true,
    "version": 2,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/ssis/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ssis_01",
    "code": "SSI_USD",
    "name": "USD SSI",
    "bankName": "CBZ",
    "accountNumber": "000123",
    "isActive": false,
    "version": 2,
    "isArchived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/stakeholders`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&includeArchived=false&search=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "stakeholders_01",
        "profileType": "BROKER",
        "name": "ABC Securities",
        "contactEmail": "desk@abc.co.zw",
        "deliveryMode": "EMAIL",
        "isActive": true,
        "version": 1,
        "isArchived": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/stakeholders`

- **Permission:** `investments.write`

**Request body**

```json
{
  "profileType": "BROKER",
  "name": "ABC Securities",
  "contactEmail": "desk@abc.co.zw",
  "deliveryMode": "EMAIL",
  "isActive": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "stakeholders_01",
    "profileType": "BROKER",
    "name": "ABC Securities",
    "contactEmail": "desk@abc.co.zw",
    "deliveryMode": "EMAIL",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/stakeholders/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "stakeholders_01",
    "profileType": "BROKER",
    "name": "ABC Securities",
    "contactEmail": "desk@abc.co.zw",
    "deliveryMode": "EMAIL",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/setup/stakeholders/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "profileType": "BROKER",
  "name": "ABC Securities",
  "contactEmail": "desk@abc.co.zw",
  "deliveryMode": "EMAIL",
  "isActive": true,
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "stakeholders_01",
    "profileType": "BROKER",
    "name": "ABC Securities",
    "contactEmail": "desk@abc.co.zw",
    "deliveryMode": "EMAIL",
    "isActive": true,
    "version": 2,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/stakeholders/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "stakeholders_01",
    "profileType": "BROKER",
    "name": "ABC Securities",
    "contactEmail": "desk@abc.co.zw",
    "deliveryMode": "EMAIL",
    "isActive": false,
    "version": 2,
    "isArchived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/tags`

- **Permission:** `investments.read`
- **Query:** `page=1&pageSize=50&includeArchived=false&search=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "tags_01",
        "code": "CORE",
        "name": "Core holding",
        "isActive": true,
        "version": 1,
        "isArchived": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/tags`

- **Permission:** `investments.write`

**Request body**

```json
{
  "code": "CORE",
  "name": "Core holding",
  "isActive": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "tags_01",
    "code": "CORE",
    "name": "Core holding",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `GET /api/investment-ops/setup/tags/:id`

- **Permission:** `investments.read`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "tags_01",
    "code": "CORE",
    "name": "Core holding",
    "isActive": true,
    "version": 1,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `PATCH /api/investment-ops/setup/tags/:id`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "code": "CORE",
  "name": "Core holding",
  "isActive": true,
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "tags_01",
    "code": "CORE",
    "name": "Core holding",
    "isActive": true,
    "version": 2,
    "isArchived": false
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

### `POST /api/investment-ops/setup/tags/:id/archive`

- **Permission:** `investments.write`
- **Headers:** `If-Match`

**Request body**

```json
{
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "tags_01",
    "code": "CORE",
    "name": "Core holding",
    "isActive": false,
    "version": 2,
    "isArchived": true
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T09:00:00.000Z"
  }
}
```

---

## Index

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/investment-ops/accounting/events` | `investments.read` |
| GET | `/api/investment-ops/accounting/events/:id` | `investments.read` |
| POST | `/api/investment-ops/accounting/events/:id/retry` | `investments.write` |
| POST | `/api/investment-ops/accounting/events/:id/reverse` | `investments.approve` |
| GET | `/api/investment-ops/accounting/journals` | `investments.read` |
| GET | `/api/investment-ops/accounting/journals/:id` | `investments.read` |
| POST | `/api/investment-ops/accounting/journals/:id/approve` | `investments.approve` |
| POST | `/api/investment-ops/accounting/journals/:id/post` | `investments.approve` |
| POST | `/api/investment-ops/accounting/journals/:id/reject` | `investments.approve` |
| POST | `/api/investment-ops/accounting/journals/:id/submit` | `investments.write` |
| GET | `/api/investment-ops/accounting/ledger-exports` | `investments.read` |
| POST | `/api/investment-ops/accounting/ledger-exports` | `investments.write` |
| GET | `/api/investment-ops/accounting/ledger-exports/:id` | `investments.read` |
| GET | `/api/investment-ops/accounting/ledger-exports/:id/download` | `investments.read` |
| GET | `/api/investment-ops/accounting/reversals` | `investments.read` |
| POST | `/api/investment-ops/accounting/reversals/:id/approve` | `investments.approve` |
| POST | `/api/investment-ops/accounting/reversals/:id/reject` | `investments.approve` |
| GET | `/api/investment-ops/approval-routes` | `investments.read` |
| POST | `/api/investment-ops/approval-routes` | `investments.approve` |
| PATCH | `/api/investment-ops/assignments/:id` | `investments.write` |
| GET | `/api/investment-ops/audit-events` | `investments.read` |
| GET | `/api/investment-ops/blotters` | `investments.read` |
| POST | `/api/investment-ops/blotters` | `investments.write` |
| GET | `/api/investment-ops/blotters/:id` | `investments.read` |
| PATCH | `/api/investment-ops/blotters/:id` | `investments.write` |
| POST | `/api/investment-ops/blotters/:id/orders` | `investments.write` |
| DELETE | `/api/investment-ops/blotters/:id/orders/:orderId` | `investments.write` |
| GET | `/api/investment-ops/capabilities` | `investments.read` |
| GET | `/api/investment-ops/compliance/overrides` | `investments.read` |
| POST | `/api/investment-ops/compliance/overrides/:id/approve` | `investments.approve` |
| POST | `/api/investment-ops/compliance/overrides/:id/reject` | `investments.approve` |
| POST | `/api/investment-ops/compliance/overrides/requests` | `investments.write` |
| GET | `/api/investment-ops/compliance/rules` | `investments.read` |
| POST | `/api/investment-ops/compliance/rules` | `investments.write` |
| DELETE | `/api/investment-ops/compliance/rules/:id` | `investments.write` |
| GET | `/api/investment-ops/compliance/rules/:id` | `investments.read` |
| PATCH | `/api/investment-ops/compliance/rules/:id` | `investments.write` |
| GET | `/api/investment-ops/compliance/runs` | `investments.read` |
| GET | `/api/investment-ops/compliance/runs/:id` | `investments.read` |
| GET | `/api/investment-ops/dashboard/allocation` | `investments.read` |
| GET | `/api/investment-ops/dashboard/currency-exposure` | `investments.read` |
| GET | `/api/investment-ops/dashboard/funds` | `investments.read` |
| POST | `/api/investment-ops/dashboard/recalculate` | `investments.write` |
| GET | `/api/investment-ops/dashboard/summary` | `investments.read` |
| GET | `/api/investment-ops/documents` | `investments.read` |
| POST | `/api/investment-ops/documents` | `investments.write` |
| GET | `/api/investment-ops/documents/:id` | `investments.read` |
| PATCH | `/api/investment-ops/documents/:id` | `investments.write` |
| GET | `/api/investment-ops/documents/:id/access` | `investments.read` |
| PUT | `/api/investment-ops/documents/:id/access` | `investments.approve` |
| POST | `/api/investment-ops/documents/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/documents/:id/audit` | `investments.read` |
| GET | `/api/investment-ops/documents/:id/download` | `investments.read` |
| GET | `/api/investment-ops/documents/:id/versions` | `investments.read` |
| POST | `/api/investment-ops/documents/:id/versions` | `investments.write` |
| POST | `/api/investment-ops/documents/:id/versions/:versionId/approve` | `investments.approve` |
| GET | `/api/investment-ops/documents/:id/versions/:versionId/download` | `investments.read` |
| GET | `/api/investment-ops/documents/:id/versions/:versionId/preview` | `investments.read` |
| POST | `/api/investment-ops/documents/:id/versions/:versionId/reject` | `investments.approve` |
| POST | `/api/investment-ops/documents/:id/versions/:versionId/request-changes` | `investments.write` |
| POST | `/api/investment-ops/files` | `investments.write` |
| POST | `/api/investment-ops/files/:fileId/complete` | `investments.write` |
| GET | `/api/investment-ops/files/:fileId/status` | `investments.read` |
| POST | `/api/investment-ops/files/upload-sessions` | `investments.write` |
| GET | `/api/investment-ops/folders/:id` | `investments.read` |
| PATCH | `/api/investment-ops/folders/:id` | `investments.write` |
| POST | `/api/investment-ops/folders/:id/archive` | `investments.write` |
| POST | `/api/investment-ops/folders/:id/restore` | `investments.write` |
| GET | `/api/investment-ops/instruments` | `investments.read` |
| POST | `/api/investment-ops/instruments` | `investments.write` |
| GET | `/api/investment-ops/instruments/:id` | `investments.read` |
| PATCH | `/api/investment-ops/instruments/:id` | `investments.write` |
| PUT | `/api/investment-ops/instruments/:id` | `investments.write` |
| POST | `/api/investment-ops/instruments/:id/approve` | `investments.approve` |
| POST | `/api/investment-ops/instruments/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/instruments/:id/market-context` | `investments.read` |
| POST | `/api/investment-ops/instruments/:id/reject` | `investments.approve` |
| POST | `/api/investment-ops/instruments/:id/restrict` | `investments.approve` |
| POST | `/api/investment-ops/instruments/:id/submit` | `investments.write` |
| GET | `/api/investment-ops/instruments/types` | `investments.read` |
| GET | `/api/investment-ops/jobs/:jobId` | `investments.read` |
| POST | `/api/investment-ops/jobs/:jobId/cancel` | `investments.write` |
| GET | `/api/investment-ops/limits/:id` | `investments.read` |
| PATCH | `/api/investment-ops/limits/:id` | `investments.write` |
| POST | `/api/investment-ops/limits/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/market-data/fx-rates` | `investments.read` |
| POST | `/api/investment-ops/market-data/fx-rates` | `investments.write` |
| POST | `/api/investment-ops/market-data/fx-rates/:id/approve` | `investments.approve` |
| POST | `/api/investment-ops/market-data/fx-rates/:id/reject` | `investments.approve` |
| GET | `/api/investment-ops/market-data/fx-rates/latest` | `investments.read` |
| GET | `/api/investment-ops/market-data/ingest/batches` | `investments.read` |
| GET | `/api/investment-ops/market-data/ingest/batches/:id` | `investments.read` |
| POST | `/api/investment-ops/market-data/ingest/run` | `investments.write` |
| GET | `/api/investment-ops/market-data/prices/:securityId/history` | `investments.read` |
| GET | `/api/investment-ops/market-data/prices/latest` | `investments.read` |
| POST | `/api/investment-ops/market-data/prices/manual` | `investments.write` |
| GET | `/api/investment-ops/market-data/prices/stale` | `investments.read` |
| POST | `/api/investment-ops/market-data/prices/upload` | `investments.write` |
| GET | `/api/investment-ops/market-data/securities/:id/prices` | `investments.read` |
| GET | `/api/investment-ops/market-data/sources/health` | `investments.read` |
| GET | `/api/investment-ops/market-data/validation-queue` | `investments.read` |
| POST | `/api/investment-ops/market-data/validation-queue/:tickId/approve` | `investments.approve` |
| POST | `/api/investment-ops/market-data/validation-queue/:tickId/reject` | `investments.approve` |
| GET | `/api/investment-ops/model-portfolios` | `investments.read` |
| POST | `/api/investment-ops/model-portfolios` | `investments.write` |
| GET | `/api/investment-ops/model-portfolios/:id` | `investments.read` |
| PATCH | `/api/investment-ops/model-portfolios/:id` | `investments.write` |
| POST | `/api/investment-ops/model-portfolios/:id/activate` | `investments.approve` |
| POST | `/api/investment-ops/model-portfolios/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/model-portfolios/:id/drift` | `investments.read` |
| POST | `/api/investment-ops/model-portfolios/:id/rebalance-recommendations` | `investments.write` |
| GET | `/api/investment-ops/orders` | `investments.read` |
| POST | `/api/investment-ops/orders` | `investments.write` |
| DELETE | `/api/investment-ops/orders/:id` | `investments.write` |
| GET | `/api/investment-ops/orders/:id` | `investments.read` |
| PATCH | `/api/investment-ops/orders/:id` | `investments.write` |
| GET | `/api/investment-ops/orders/:id/applicable-approval-routes` | `investments.read` |
| GET | `/api/investment-ops/orders/:id/approval-routes/applicable` | `investments.read` |
| POST | `/api/investment-ops/orders/:id/approve` | `investments.approve` |
| POST | `/api/investment-ops/orders/:id/cancel` | `investments.write` |
| POST | `/api/investment-ops/orders/:id/compliance-check` | `investments.approve` |
| POST | `/api/investment-ops/orders/:id/documents` | `investments.write` |
| POST | `/api/investment-ops/orders/:id/execute` | `investments.execute` |
| GET | `/api/investment-ops/orders/:id/executions` | `investments.read` |
| POST | `/api/investment-ops/orders/:id/executions` | `investments.execute` |
| GET | `/api/investment-ops/orders/:id/fills` | `investments.read` |
| POST | `/api/investment-ops/orders/:id/fills` | `investments.execute` |
| GET | `/api/investment-ops/orders/:id/history` | `investments.read` |
| POST | `/api/investment-ops/orders/:id/reject` | `investments.approve` |
| POST | `/api/investment-ops/orders/:id/send-to-broker` | `investments.execute` |
| POST | `/api/investment-ops/orders/:id/settlement` | `investments.execute` |
| POST | `/api/investment-ops/orders/:id/submit` | `investments.write` |
| POST | `/api/investment-ops/orders/:id/trade-confirmation` | `investments.execute` |
| GET | `/api/investment-ops/orders/approval-routes` | `investments.read` |
| POST | `/api/investment-ops/orders/approval-routes` | `investments.approve` |
| DELETE | `/api/investment-ops/orders/approval-routes/:id` | `investments.approve` |
| PATCH | `/api/investment-ops/orders/approval-routes/:id` | `investments.approve` |
| GET | `/api/investment-ops/orders/configuration/:fundId` | `investments.read` |
| PATCH | `/api/investment-ops/orders/configuration/:fundId` | `investments.write` |
| POST | `/api/investment-ops/orders/preview` | `investments.write` |
| GET | `/api/investment-ops/outbox-events` | `investments.read` |
| GET | `/api/investment-ops/outbox-events/poll` | `investments.read` |
| POST | `/api/investment-ops/portfolio-assignments` | `investments.write` |
| DELETE | `/api/investment-ops/portfolio-assignments/:id` | `investments.write` |
| GET | `/api/investment-ops/portfolio-folders` | `investments.read` |
| POST | `/api/investment-ops/portfolio-folders` | `investments.write` |
| GET | `/api/investment-ops/portfolio-folders/:folderId` | `investments.read` |
| PATCH | `/api/investment-ops/portfolio-folders/:folderId` | `investments.write` |
| POST | `/api/investment-ops/portfolio-folders/:folderId/archive` | `investments.write` |
| DELETE | `/api/investment-ops/portfolio-folders/:folderId/portfolio-assignments/:fundId` | `investments.write` |
| POST | `/api/investment-ops/portfolio-folders/:folderId/restore` | `investments.write` |
| PUT | `/api/investment-ops/portfolio-folders/reorder` | `investments.write` |
| GET | `/api/investment-ops/portfolios` | `investments.read` |
| POST | `/api/investment-ops/portfolios` | `investments.write` |
| DELETE | `/api/investment-ops/portfolios/:fundId` | `investments.write` |
| GET | `/api/investment-ops/portfolios/:fundId` | `investments.read` |
| PATCH | `/api/investment-ops/portfolios/:fundId` | `investments.write` |
| GET | `/api/investment-ops/portfolios/:fundId/assignments` | `investments.read` |
| POST | `/api/investment-ops/portfolios/:fundId/assignments` | `investments.write` |
| GET | `/api/investment-ops/portfolios/:fundId/config` | `investments.read` |
| PATCH | `/api/investment-ops/portfolios/:fundId/config` | `investments.write` |
| GET | `/api/investment-ops/portfolios/:fundId/exposure` | `investments.read` |
| GET | `/api/investment-ops/portfolios/:fundId/folders` | `investments.read` |
| POST | `/api/investment-ops/portfolios/:fundId/folders` | `investments.write` |
| PUT | `/api/investment-ops/portfolios/:fundId/folders/reorder` | `investments.write` |
| GET | `/api/investment-ops/portfolios/:fundId/holdings` | `investments.read` |
| GET | `/api/investment-ops/portfolios/:fundId/limits` | `investments.read` |
| POST | `/api/investment-ops/portfolios/:fundId/limits` | `investments.write` |
| GET | `/api/investment-ops/portfolios/:fundId/overview` | `investments.read` |
| GET | `/api/investment-ops/portfolios/:fundId/positions` | `investments.read` |
| POST | `/api/investment-ops/portfolios/:fundId/recalculate` | `investments.write` |
| GET | `/api/investment-ops/portfolios/:fundId/transactions` | `investments.read` |
| POST | `/api/investment-ops/portfolios/:fundId/transactions/manual-adjustments` | `investments.write` |
| GET | `/api/investment-ops/positions/:id` | `investments.read` |
| POST | `/api/investment-ops/rebalance-runs/:id/convert-to-draft-orders` | `investments.write` |
| GET | `/api/investment-ops/reconciliation/batches` | `investments.read` |
| GET | `/api/investment-ops/reconciliation/batches/:id` | `investments.read` |
| GET | `/api/investment-ops/reconciliation/items` | `investments.read` |
| GET | `/api/investment-ops/reconciliation/items/:id` | `investments.read` |
| POST | `/api/investment-ops/reconciliation/items/:id/approve-write-off` | `investments.approve` |
| POST | `/api/investment-ops/reconciliation/items/:id/assign` | `investments.write` |
| POST | `/api/investment-ops/reconciliation/items/:id/escalate` | `investments.write` |
| GET | `/api/investment-ops/reconciliation/items/:id/history` | `investments.read` |
| POST | `/api/investment-ops/reconciliation/items/:id/investigate` | `investments.write` |
| POST | `/api/investment-ops/reconciliation/items/:id/reject-write-off` | `investments.approve` |
| POST | `/api/investment-ops/reconciliation/items/:id/reopen` | `investments.write` |
| POST | `/api/investment-ops/reconciliation/items/:id/resolve` | `investments.approve` |
| POST | `/api/investment-ops/reconciliation/items/:id/write-off` | `investments.write` |
| POST | `/api/investment-ops/reconciliation/run` | `investments.write` |
| GET | `/api/investment-ops/reconciliation/summary` | `investments.read` |
| POST | `/api/investment-ops/reconciliation/upload` | `investments.write` |
| POST | `/api/investment-ops/reconciliation/uploads` | `investments.write` |
| GET | `/api/investment-ops/reports` | `investments.read` |
| GET | `/api/investment-ops/reports/:id` | `investments.read` |
| GET | `/api/investment-ops/reports/:id/audit` | `investments.read` |
| POST | `/api/investment-ops/reports/:id/cancel` | `investments.write` |
| GET | `/api/investment-ops/reports/:id/download` | `investments.read` |
| POST | `/api/investment-ops/reports/:id/retry` | `investments.write` |
| POST | `/api/investment-ops/reports/generate` | `investments.write` |
| GET | `/api/investment-ops/reports/templates` | `investments.read` |
| GET | `/api/investment-ops/setup/brokers` | `investments.read` |
| POST | `/api/investment-ops/setup/brokers` | `investments.write` |
| GET | `/api/investment-ops/setup/commissions` | `investments.read` |
| POST | `/api/investment-ops/setup/commissions` | `investments.write` |
| GET | `/api/investment-ops/setup/commissions/:id` | `investments.read` |
| PATCH | `/api/investment-ops/setup/commissions/:id` | `investments.write` |
| POST | `/api/investment-ops/setup/commissions/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/setup/corporate-action-mappings` | `investments.read` |
| POST | `/api/investment-ops/setup/corporate-action-mappings` | `investments.write` |
| PUT | `/api/investment-ops/setup/corporate-action-mappings` | `investments.write` |
| GET | `/api/investment-ops/setup/corporate-action-mappings/:id` | `investments.read` |
| PATCH | `/api/investment-ops/setup/corporate-action-mappings/:id` | `investments.write` |
| POST | `/api/investment-ops/setup/corporate-action-mappings/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/setup/countries` | `investments.read` |
| POST | `/api/investment-ops/setup/countries` | `investments.write` |
| GET | `/api/investment-ops/setup/countries/:id` | `investments.read` |
| PATCH | `/api/investment-ops/setup/countries/:id` | `investments.write` |
| POST | `/api/investment-ops/setup/countries/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/setup/coupon-frequencies` | `investments.read` |
| POST | `/api/investment-ops/setup/coupon-frequencies` | `investments.write` |
| GET | `/api/investment-ops/setup/coupon-frequencies/:id` | `investments.read` |
| PATCH | `/api/investment-ops/setup/coupon-frequencies/:id` | `investments.write` |
| POST | `/api/investment-ops/setup/coupon-frequencies/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/setup/currencies` | `investments.read` |
| POST | `/api/investment-ops/setup/currencies` | `investments.write` |
| GET | `/api/investment-ops/setup/currencies/:id` | `investments.read` |
| PATCH | `/api/investment-ops/setup/currencies/:id` | `investments.write` |
| POST | `/api/investment-ops/setup/currencies/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/setup/custodians` | `investments.read` |
| POST | `/api/investment-ops/setup/custodians` | `investments.write` |
| GET | `/api/investment-ops/setup/funds` | `investments.read` |
| POST | `/api/investment-ops/setup/funds` | `investments.write` |
| GET | `/api/investment-ops/setup/funds/:id` | `investments.read` |
| PUT | `/api/investment-ops/setup/funds/:id` | `investments.write` |
| PUT | `/api/investment-ops/setup/funds/:id/config` | `investments.write` |
| POST | `/api/investment-ops/setup/funds/:id/managers` | `investments.approve` |
| GET | `/api/investment-ops/setup/instrument-mappings` | `investments.read` |
| POST | `/api/investment-ops/setup/instrument-mappings` | `investments.write` |
| GET | `/api/investment-ops/setup/instrument-mappings/:id` | `investments.read` |
| PATCH | `/api/investment-ops/setup/instrument-mappings/:id` | `investments.write` |
| POST | `/api/investment-ops/setup/instrument-mappings/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/setup/instrument-subcategories` | `investments.read` |
| POST | `/api/investment-ops/setup/instrument-subcategories` | `investments.write` |
| GET | `/api/investment-ops/setup/instrument-subcategories/:id` | `investments.read` |
| PATCH | `/api/investment-ops/setup/instrument-subcategories/:id` | `investments.write` |
| POST | `/api/investment-ops/setup/instrument-subcategories/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/setup/instrument-types` | `investments.read` |
| POST | `/api/investment-ops/setup/instrument-types` | `investments.write` |
| GET | `/api/investment-ops/setup/instrument-types/:id` | `investments.read` |
| PATCH | `/api/investment-ops/setup/instrument-types/:id` | `investments.write` |
| POST | `/api/investment-ops/setup/instrument-types/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/setup/issuers` | `investments.read` |
| POST | `/api/investment-ops/setup/issuers` | `investments.write` |
| GET | `/api/investment-ops/setup/issuers/:id` | `investments.read` |
| PATCH | `/api/investment-ops/setup/issuers/:id` | `investments.write` |
| POST | `/api/investment-ops/setup/issuers/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/setup/markets` | `investments.read` |
| POST | `/api/investment-ops/setup/markets` | `investments.write` |
| GET | `/api/investment-ops/setup/markets/:id` | `investments.read` |
| PATCH | `/api/investment-ops/setup/markets/:id` | `investments.write` |
| POST | `/api/investment-ops/setup/markets/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/setup/price-sources` | `investments.read` |
| POST | `/api/investment-ops/setup/price-sources` | `investments.write` |
| GET | `/api/investment-ops/setup/price-sources/:id` | `investments.read` |
| PATCH | `/api/investment-ops/setup/price-sources/:id` | `investments.write` |
| POST | `/api/investment-ops/setup/price-sources/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/setup/reference-types` | `investments.read` |
| GET | `/api/investment-ops/setup/settings` | `investments.read` |
| PUT | `/api/investment-ops/setup/settings` | `investments.write` |
| GET | `/api/investment-ops/setup/settlement-accounts` | `investments.read` |
| POST | `/api/investment-ops/setup/settlement-accounts` | `investments.write` |
| GET | `/api/investment-ops/setup/settlement-accounts/:id` | `investments.read` |
| PATCH | `/api/investment-ops/setup/settlement-accounts/:id` | `investments.write` |
| POST | `/api/investment-ops/setup/settlement-accounts/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/setup/ssis` | `investments.read` |
| POST | `/api/investment-ops/setup/ssis` | `investments.write` |
| GET | `/api/investment-ops/setup/ssis/:id` | `investments.read` |
| PATCH | `/api/investment-ops/setup/ssis/:id` | `investments.write` |
| POST | `/api/investment-ops/setup/ssis/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/setup/stakeholders` | `investments.read` |
| POST | `/api/investment-ops/setup/stakeholders` | `investments.write` |
| GET | `/api/investment-ops/setup/stakeholders/:id` | `investments.read` |
| PATCH | `/api/investment-ops/setup/stakeholders/:id` | `investments.write` |
| POST | `/api/investment-ops/setup/stakeholders/:id/archive` | `investments.write` |
| GET | `/api/investment-ops/setup/tags` | `investments.read` |
| POST | `/api/investment-ops/setup/tags` | `investments.write` |
| GET | `/api/investment-ops/setup/tags/:id` | `investments.read` |
| PATCH | `/api/investment-ops/setup/tags/:id` | `investments.write` |
| POST | `/api/investment-ops/setup/tags/:id/archive` | `investments.write` |
| POST | `/api/investment-ops/simulation/run` | `investments.write` |
| GET | `/api/investment-ops/simulation/runs` | `investments.read` |
| GET | `/api/investment-ops/simulation/runs/:id` | `investments.read` |
| GET | `/api/investment-ops/trades` | `investments.read` |
| GET | `/api/investment-ops/trades/:id` | `investments.read` |
| POST | `/api/investment-ops/trades/:id/confirm` | `investments.execute` |
| POST | `/api/investment-ops/trades/:id/execute` | `investments.execute` |
| GET | `/api/investment-ops/trades/:id/routing-hops` | `investments.read` |
| POST | `/api/investment-ops/trades/:id/routing-hops/:hopId/cancel` | `investments.execute` |
| POST | `/api/investment-ops/trades/:id/routing-hops/:hopId/confirm` | `investments.execute` |
| POST | `/api/investment-ops/trades/:id/routing-hops/:hopId/retry` | `investments.execute` |
| POST | `/api/investment-ops/trades/:id/settle` | `investments.execute` |
| GET | `/api/investment-ops/trades/:id/settlement-document` | `investments.read` |
| GET | `/api/investment-ops/trading/portfolios/:fundId/positions` | `investments.read` |
| POST | `/api/investment-ops/trading/portfolios/:fundId/positions/recalculate` | `investments.write` |
| GET | `/api/investment-ops/trading/portfolios/:fundId/positions/summary` | `investments.read` |
| GET | `/api/investment-ops/trading/positions` | `investments.read` |
| POST | `/api/investment-ops/trading/recalculate` | `investments.write` |
| GET | `/api/investment-ops/trading/saved-views` | `investments.read` |
| POST | `/api/investment-ops/trading/saved-views` | `investments.write` |
| DELETE | `/api/investment-ops/trading/saved-views/:id` | `investments.write` |
| PATCH | `/api/investment-ops/trading/saved-views/:id` | `investments.write` |
| GET | `/api/investment-ops/trading/summary` | `investments.read` |
| GET | `/api/investment-ops/transactions/:id` | `investments.read` |
| POST | `/api/investment-ops/transactions/:id/reverse` | `investments.approve` |
| GET | `/api/investment-ops/valuation/exceptions` | `investments.read` |
| GET | `/api/investment-ops/valuation/exceptions/:id` | `investments.read` |
| POST | `/api/investment-ops/valuation/exceptions/:id/approve-override` | `investments.approve` |
| POST | `/api/investment-ops/valuation/exceptions/:id/escalate` | `investments.write` |
| POST | `/api/investment-ops/valuation/exceptions/:id/override` | `investments.write` |
| POST | `/api/investment-ops/valuation/exceptions/:id/reject-override` | `investments.approve` |
| POST | `/api/investment-ops/valuation/exceptions/:id/resolve` | `investments.approve` |
| GET | `/api/investment-ops/valuation/fx-validation` | `investments.read` |
| GET | `/api/investment-ops/valuation/price-validation` | `investments.read` |
| GET | `/api/investment-ops/valuation/runs` | `investments.read` |
| POST | `/api/investment-ops/valuation/runs` | `investments.write` |
| GET | `/api/investment-ops/valuation/runs/:id` | `investments.read` |
| POST | `/api/investment-ops/valuation/runs/:id/cancel` | `investments.write` |
| GET | `/api/investment-ops/valuation/runs/:id/inputs` | `investments.read` |
| GET | `/api/investment-ops/valuation/runs/:id/items` | `investments.read` |
| POST | `/api/investment-ops/valuation/runs/:id/rerun` | `investments.write` |
| GET | `/api/investment-ops/valuation/runs/:id/summary` | `investments.read` |
