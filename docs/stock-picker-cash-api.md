# Stock Picker Cash API

**Base URL:** `/api/investment-ops`  
**Auth:** `Authorization: Bearer <token>`  
**Endpoints documented:** 91  
**Seed (DEV nts):** `npm run db:seed:stock-picker-cash`  
**UAT:** `npm run uat:stock-picker-cash:r1` / `r3`, `uat:stock-picker-cash:acceptance`

Cash subledger, reservations, statement import, cash reconciliation, exceptions, period close, client statements, and cash setup - all under the Investment Ops base path (SRD section 14).

**Not this API:** `/api/investment-ops/reconciliation/*` is Investments V2 section 22 **holdings/trade** reconciliation. Do not call those routes for cash ledger matching. Use `/reconciliation-batches`, `/matches`, `/reconciliation-exceptions`, and `/reconciliation-breaks` instead.

**UI mount:** cash / ledger / recon workspace under `/investments-v2/reconciliation` (cash tabs) -> this doc.

Demo after seed: Sunrise segregated USD cash account on portfolio `SPF-SUNRISE-001`.

**FE wiring deltas (workspace panes, fund-cash KPIs, ledger `accountPurpose` / `view=LINES`, daily-movement, broker queueCounts/amounts, statement promotions):** see [investments-v2-fe-gap-closure.md](./investments-v2-fe-gap-closure.md) Part B. Where this long doc lags, prefer the gap-closure shapes.

---

## Conventions

### Success envelope

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
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
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

### Error envelope

```json
{
  "success": false,
  "message": "Insufficient order-eligible available cash",
  "code": "INSUFFICIENT_AVAILABLE_CASH",
  "details": {
    "requested": "3000.00",
    "available": "2500.00",
    "currency": "USD"
  },
  "retryable": false,
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

### Rules

- Money / amounts are **decimal strings** (e.g. `"3000.00"`). Prefer strings for all money fields.
- `Idempotency-Key` required where marked (8-200 printable ASCII). Same key + different body -> conflict / reuse error.
- Maker-checker actions use **named POST verbs** (`/submit`, `/approve`, `/reject`, `/commit`, `/consume`, `/release`, ...) - not generic PATCH status.
- Optimistic concurrency: send `expectedVersion` in the body on mutating actions when the resource has `version`.
- External bank account numbers are never returned in clear text - only `maskedIdentifier` / `accountNumberMasked`.
- Available cash is computed from the **posted cash ledger + reservations**, never from statement closing balance alone.

---

## Permission codes (`sp.cash.*`)

| Code | Use |
|------|-----|
| `sp.cash.access` | Cash overview |
| `sp.cash.accounts.view` | List/get cash accounts |
| `sp.cash.accounts.manage` | Create/submit/suspend accounts |
| `sp.cash.accounts.approve` | Approve/reject/close accounts |
| `sp.cash.position.view` | Position, explanation, projection, list reservations |
| `sp.cash.reservations.request` | Create reservation |
| `sp.cash.reservations.approve` | Approve reservation |
| `sp.cash.reservations.release` | Consume / release reservation |
| `sp.cash.ledger.view` | Ledger list + get journal |
| `sp.cash.journals.create` | Create/submit journal; manual entry from break |
| `sp.cash.journals.approve` | Approve/reject journal |
| `sp.cash.journals.reverse` | Reverse posted journal |
| `sp.cash.imports.upload` | Create/submit statement import |
| `sp.cash.imports.validate` | Validate import |
| `sp.cash.imports.commit` | Commit/reject import |
| `sp.cash.reconciliation.view` | Batches, workspace, matches get, rules, fund summary, breaks get |
| `sp.cash.reconciliation.run` | Create/run recon batch |
| `sp.cash.reconciliation.match` | Auto-match, confirm/manual match, broker confirm |
| `sp.cash.reconciliation.unmatch` | Reverse match |
| `sp.cash.exceptions.view` | List/get exceptions |
| `sp.cash.exceptions.assign` | Assign / investigate / request-info / reopen / escalate / comments |
| `sp.cash.exceptions.propose` | Propose resolution; adjust-internal break |
| `sp.cash.exceptions.approve` | Approve / reject / close exception; clear broker item |
| `sp.cash.close.precheck` | Period precheck |
| `sp.cash.close.execute` | Close / restate period |
| `sp.cash.close.reopen` | Reopen request |
| `sp.cash.gl.export` | GL export create/get/retry |
| `sp.cash.setup.manage` | Cash setup catalogs + activate |
| `sp.cash.statements.view` | Client statements list/get/preview/download |
| `sp.cash.statements.generate` | Generate statement |
| `sp.cash.statements.approve` | Approve statement |
| `sp.cash.statements.deliver` | Email statement |

---

## Error codes (SRD / runtime)

| Code | HTTP | When |
|------|------|------|
| `VALIDATION_ERROR` | 400 | Missing required field / bad payload |
| `INVALID_DECIMAL` | 400 | Non-decimal or non-positive amount |
| `INVALID_DATE` | 400 | Bad date |
| `INVALID_AMOUNT` | 400 | Consume/release amount invalid |
| `UNBALANCED_JOURNAL` | 400 | Debits ≠ credits |
| `EXPECTED_VERSION_REQUIRED` | 400 | Missing `expectedVersion` where required |
| `NOT_FOUND` | 404 | Unknown id (account/import/batch/...) |
| `INVALID_STATUS` | 409 | Illegal lifecycle transition |
| `STALE_VERSION` | 409 | `expectedVersion` mismatch |
| `MAKER_CHECKER_CONFLICT` | 409 | Same user as maker and checker |
| `INSUFFICIENT_AVAILABLE_CASH` | 409 | Reservation exceeds order-eligible cash |
| `DUPLICATE_SOURCE` | 409 | Import file hash already committed |
| `JOURNAL_IMMUTABLE` | 409 | Posted journal cannot be edited/rejected |
| `IMMUTABLE` | 409 | Committed import cannot be rejected |
| `CLOSE_BLOCKED` | 409 | Period close failed itemized precheck (`details.blockers`) |
| `FORBIDDEN` / hidden as `NOT_FOUND` | 403/404 | Cross-client isolation |

**Close precheck blocker codes** (inside `blockers[]`): `MISSING_STATEMENT`, `OPEN_VARIANCE`, `INCOMPLETE_APPROVALS`, `OPEN_EXCEPTIONS`, `SUSPENSE_AGE`.

---

## Client cash accounts

### `GET /api/investment-ops/client-cash-accounts`

- **Permission:** `sp.cash.accounts.view`
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `portfolioId=&clientOrVehicleId=&status=&providerId=&currency=&search=&page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "accountId": "cca_sunrise_usd_001",
        "id": "cca_sunrise_usd_001",
        "tenantId": "le_arcus",
        "legalEntityId": "le_arcus",
        "clientOrVehicleId": "cli_sunrise_wealth",
        "mandateId": null,
        "portfolioId": "SPF-SUNRISE-001",
        "ownerModel": "SEGREGATED",
        "moneyClass": "CLIENT_CASH",
        "accountType": "CUSTODY_CASH",
        "providerId": "prov_cbz_cash",
        "maskedIdentifier": "CBZ***001",
        "accountNumberMasked": "CBZ***001",
        "clientName": "Sunrise Wealth Management",
        "baseCurrency": "USD",
        "currency": "USD",
        "status": "ACTIVE",
        "effectiveFrom": "2024-01-01T00:00:00.000Z",
        "effectiveTo": null,
        "calendarId": null,
        "timezone": "Africa/Harare",
        "tolerancePolicyId": "tol_usd_1",
        "glMappingId": null,
        "reconciliationHealth": "HEALTHY",
        "version": 3,
        "cashBalance": {
          "amount": "10000.00",
          "currency": "USD"
        },
        "availableBalance": {
          "amount": "7000.00",
          "currency": "USD"
        },
        "createdAt": "2026-06-01T08:00:00.000Z",
        "updatedAt": "2026-07-19T10:00:00.000Z"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/client-cash-accounts`

- **Permission:** `sp.cash.accounts.manage`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "tenantId": "le_arcus",
  "legalEntityId": "le_arcus",
  "clientOrVehicleId": "cli_sunrise_wealth",
  "portfolioId": "SPF-SUNRISE-001",
  "ownerModel": "SEGREGATED",
  "moneyClass": "CLIENT_CASH",
  "accountType": "CUSTODY_CASH",
  "providerId": "prov_cbz_cash",
  "currency": "USD",
  "externalAccountIdentifier": "CBZ-CUST-77821001",
  "effectiveFrom": "2024-01-01",
  "clientName": "Sunrise Wealth Management",
  "timezone": "Africa/Harare"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "accountId": "cca_sunrise_usd_001",
    "id": "cca_sunrise_usd_001",
    "tenantId": "le_arcus",
    "legalEntityId": "le_arcus",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "mandateId": null,
    "portfolioId": "SPF-SUNRISE-001",
    "ownerModel": "SEGREGATED",
    "moneyClass": "CLIENT_CASH",
    "accountType": "CUSTODY_CASH",
    "providerId": "prov_cbz_cash",
    "maskedIdentifier": "CBZ***001",
    "accountNumberMasked": "CBZ***001",
    "clientName": "Sunrise Wealth Management",
    "baseCurrency": "USD",
    "currency": "USD",
    "status": "DRAFT",
    "effectiveFrom": "2024-01-01T00:00:00.000Z",
    "effectiveTo": null,
    "calendarId": null,
    "timezone": "Africa/Harare",
    "tolerancePolicyId": "tol_usd_1",
    "glMappingId": null,
    "reconciliationHealth": "HEALTHY",
    "version": 1,
    "cashBalance": null,
    "availableBalance": null,
    "createdAt": "2026-06-01T08:00:00.000Z",
    "updatedAt": "2026-07-19T10:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/client-cash-accounts/:accountId`

- **Permission:** `sp.cash.accounts.view`
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `clientOrVehicleId=&tenantId=` (optional isolation filters)

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "accountId": "cca_sunrise_usd_001",
    "id": "cca_sunrise_usd_001",
    "tenantId": "le_arcus",
    "legalEntityId": "le_arcus",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "mandateId": null,
    "portfolioId": "SPF-SUNRISE-001",
    "ownerModel": "SEGREGATED",
    "moneyClass": "CLIENT_CASH",
    "accountType": "CUSTODY_CASH",
    "providerId": "prov_cbz_cash",
    "maskedIdentifier": "CBZ***001",
    "accountNumberMasked": "CBZ***001",
    "clientName": "Sunrise Wealth Management",
    "baseCurrency": "USD",
    "currency": "USD",
    "status": "ACTIVE",
    "effectiveFrom": "2024-01-01T00:00:00.000Z",
    "effectiveTo": null,
    "calendarId": null,
    "timezone": "Africa/Harare",
    "tolerancePolicyId": "tol_usd_1",
    "glMappingId": null,
    "reconciliationHealth": "HEALTHY",
    "version": 3,
    "cashBalance": {
      "amount": "10000.00",
      "currency": "USD"
    },
    "availableBalance": {
      "amount": "7000.00",
      "currency": "USD"
    },
    "createdAt": "2026-06-01T08:00:00.000Z",
    "updatedAt": "2026-07-19T10:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/client-cash-accounts/:accountId/submit`

- **Permission:** `sp.cash.accounts.manage`
- **Headers:** `Authorization: Bearer <token>`

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
    "accountId": "cca_sunrise_usd_001",
    "id": "cca_sunrise_usd_001",
    "tenantId": "le_arcus",
    "legalEntityId": "le_arcus",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "mandateId": null,
    "portfolioId": "SPF-SUNRISE-001",
    "ownerModel": "SEGREGATED",
    "moneyClass": "CLIENT_CASH",
    "accountType": "CUSTODY_CASH",
    "providerId": "prov_cbz_cash",
    "maskedIdentifier": "CBZ***001",
    "accountNumberMasked": "CBZ***001",
    "clientName": "Sunrise Wealth Management",
    "baseCurrency": "USD",
    "currency": "USD",
    "status": "PENDING_APPROVAL",
    "effectiveFrom": "2024-01-01T00:00:00.000Z",
    "effectiveTo": null,
    "calendarId": null,
    "timezone": "Africa/Harare",
    "tolerancePolicyId": "tol_usd_1",
    "glMappingId": null,
    "reconciliationHealth": "HEALTHY",
    "version": 2,
    "cashBalance": {
      "amount": "10000.00",
      "currency": "USD"
    },
    "availableBalance": {
      "amount": "7000.00",
      "currency": "USD"
    },
    "createdAt": "2026-06-01T08:00:00.000Z",
    "updatedAt": "2026-07-19T10:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/client-cash-accounts/:accountId/approve`

- **Permission:** `sp.cash.accounts.approve`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "expectedVersion": 2
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "accountId": "cca_sunrise_usd_001",
    "id": "cca_sunrise_usd_001",
    "tenantId": "le_arcus",
    "legalEntityId": "le_arcus",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "mandateId": null,
    "portfolioId": "SPF-SUNRISE-001",
    "ownerModel": "SEGREGATED",
    "moneyClass": "CLIENT_CASH",
    "accountType": "CUSTODY_CASH",
    "providerId": "prov_cbz_cash",
    "maskedIdentifier": "CBZ***001",
    "accountNumberMasked": "CBZ***001",
    "clientName": "Sunrise Wealth Management",
    "baseCurrency": "USD",
    "currency": "USD",
    "status": "ACTIVE",
    "effectiveFrom": "2024-01-01T00:00:00.000Z",
    "effectiveTo": null,
    "calendarId": null,
    "timezone": "Africa/Harare",
    "tolerancePolicyId": "tol_usd_1",
    "glMappingId": null,
    "reconciliationHealth": "HEALTHY",
    "version": 3,
    "cashBalance": {
      "amount": "10000.00",
      "currency": "USD"
    },
    "availableBalance": {
      "amount": "7000.00",
      "currency": "USD"
    },
    "createdAt": "2026-06-01T08:00:00.000Z",
    "updatedAt": "2026-07-19T10:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/client-cash-accounts/:accountId/reject`

- **Permission:** `sp.cash.accounts.approve`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "expectedVersion": 2,
  "reason": "Incomplete KYC linkage"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "accountId": "cca_sunrise_usd_001",
    "id": "cca_sunrise_usd_001",
    "tenantId": "le_arcus",
    "legalEntityId": "le_arcus",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "mandateId": null,
    "portfolioId": "SPF-SUNRISE-001",
    "ownerModel": "SEGREGATED",
    "moneyClass": "CLIENT_CASH",
    "accountType": "CUSTODY_CASH",
    "providerId": "prov_cbz_cash",
    "maskedIdentifier": "CBZ***001",
    "accountNumberMasked": "CBZ***001",
    "clientName": "Sunrise Wealth Management",
    "baseCurrency": "USD",
    "currency": "USD",
    "status": "REJECTED",
    "effectiveFrom": "2024-01-01T00:00:00.000Z",
    "effectiveTo": null,
    "calendarId": null,
    "timezone": "Africa/Harare",
    "tolerancePolicyId": "tol_usd_1",
    "glMappingId": null,
    "reconciliationHealth": "HEALTHY",
    "version": 3,
    "cashBalance": {
      "amount": "10000.00",
      "currency": "USD"
    },
    "availableBalance": {
      "amount": "7000.00",
      "currency": "USD"
    },
    "createdAt": "2026-06-01T08:00:00.000Z",
    "updatedAt": "2026-07-19T10:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/client-cash-accounts/:accountId/suspend`

- **Permission:** `sp.cash.accounts.manage`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "expectedVersion": 3,
  "reason": "Compliance hold"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "accountId": "cca_sunrise_usd_001",
    "id": "cca_sunrise_usd_001",
    "tenantId": "le_arcus",
    "legalEntityId": "le_arcus",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "mandateId": null,
    "portfolioId": "SPF-SUNRISE-001",
    "ownerModel": "SEGREGATED",
    "moneyClass": "CLIENT_CASH",
    "accountType": "CUSTODY_CASH",
    "providerId": "prov_cbz_cash",
    "maskedIdentifier": "CBZ***001",
    "accountNumberMasked": "CBZ***001",
    "clientName": "Sunrise Wealth Management",
    "baseCurrency": "USD",
    "currency": "USD",
    "status": "SUSPENDED",
    "effectiveFrom": "2024-01-01T00:00:00.000Z",
    "effectiveTo": null,
    "calendarId": null,
    "timezone": "Africa/Harare",
    "tolerancePolicyId": "tol_usd_1",
    "glMappingId": null,
    "reconciliationHealth": "HEALTHY",
    "version": 4,
    "cashBalance": {
      "amount": "10000.00",
      "currency": "USD"
    },
    "availableBalance": {
      "amount": "7000.00",
      "currency": "USD"
    },
    "createdAt": "2026-06-01T08:00:00.000Z",
    "updatedAt": "2026-07-19T10:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/client-cash-accounts/:accountId/close`

- **Permission:** `sp.cash.accounts.approve`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "expectedVersion": 3,
  "reason": "Account exit"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "accountId": "cca_sunrise_usd_001",
    "id": "cca_sunrise_usd_001",
    "tenantId": "le_arcus",
    "legalEntityId": "le_arcus",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "mandateId": null,
    "portfolioId": "SPF-SUNRISE-001",
    "ownerModel": "SEGREGATED",
    "moneyClass": "CLIENT_CASH",
    "accountType": "CUSTODY_CASH",
    "providerId": "prov_cbz_cash",
    "maskedIdentifier": "CBZ***001",
    "accountNumberMasked": "CBZ***001",
    "clientName": "Sunrise Wealth Management",
    "baseCurrency": "USD",
    "currency": "USD",
    "status": "CLOSED",
    "effectiveFrom": "2024-01-01T00:00:00.000Z",
    "effectiveTo": null,
    "calendarId": null,
    "timezone": "Africa/Harare",
    "tolerancePolicyId": "tol_usd_1",
    "glMappingId": null,
    "reconciliationHealth": "HEALTHY",
    "version": 4,
    "cashBalance": {
      "amount": "10000.00",
      "currency": "USD"
    },
    "availableBalance": {
      "amount": "7000.00",
      "currency": "USD"
    },
    "createdAt": "2026-06-01T08:00:00.000Z",
    "updatedAt": "2026-07-19T10:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
## Cash overview / position / explanation / projection

### `GET /api/investment-ops/cash-overview`

- **Permission:** `sp.cash.access`
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `legalEntityId=&currency=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "accountCount": 3,
    "totalPostedSettledCash": "245000.00",
    "totalOrderEligibleAvailableCash": "198500.00",
    "totalActiveReservations": "45000.00",
    "byCurrency": [
      {
        "currency": "USD",
        "postedSettledCash": "245000.00",
        "orderEligibleAvailableCash": "198500.00"
      }
    ],
    "unhealthyAccounts": 0
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/portfolios/:portfolioId/cash-position`

- **Permission:** `sp.cash.position.view`
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `cashAccountId=<required>&currency=USD&asOf=2026-07-19`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "portfolioId": "SPF-SUNRISE-001",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "asOf": "2026-07-19T12:00:00.000Z",
    "postedSettledCash": "10000.00",
    "activeReservations": "3000.00",
    "holdsAndBuffers": "0.00",
    "pendingWithdrawals": "0.00",
    "eligibleAdditions": "0.00",
    "diagnosticAvailableCash": "7000.00",
    "orderEligibleAvailableCash": "7000.00",
    "withdrawableCash": "7000.00",
    "unsettledAdditions": "0.00",
    "calculationVersion": "AVAIL-USD-v4",
    "accountVersion": 3,
    "dataFreshness": {
      "ledger": "CURRENT",
      "lastStatementReceivedAt": "2026-07-18T16:00:00.000Z"
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/portfolios/:portfolioId/cash-explanation`

- **Permission:** `sp.cash.position.view`
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `cashAccountId=&currency=USD&asOf=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "portfolioId": "SPF-SUNRISE-001",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "asOf": "2026-07-19T12:00:00.000Z",
    "postedSettledCash": "10000.00",
    "activeReservations": "3000.00",
    "holdsAndBuffers": "0.00",
    "pendingWithdrawals": "0.00",
    "eligibleAdditions": "0.00",
    "diagnosticAvailableCash": "7000.00",
    "orderEligibleAvailableCash": "7000.00",
    "withdrawableCash": "7000.00",
    "unsettledAdditions": "0.00",
    "calculationVersion": "AVAIL-USD-v4",
    "accountVersion": 3,
    "dataFreshness": {
      "ledger": "CURRENT",
      "lastStatementReceivedAt": "2026-07-18T16:00:00.000Z"
    },
    "lineItems": [
      {
        "code": "POSTED_SETTLED",
        "label": "Posted settled cash",
        "amount": "10000.00",
        "sign": "+"
      },
      {
        "code": "ACTIVE_RESERVATIONS",
        "label": "Active reservations",
        "amount": "3000.00",
        "sign": "-"
      },
      {
        "code": "ORDER_ELIGIBLE",
        "label": "Order-eligible available",
        "amount": "7000.00",
        "sign": "="
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/portfolios/:portfolioId/cash-projection`

- **Permission:** `sp.cash.position.view`
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `cashAccountId=&currency=USD&horizonDays=7`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "portfolioId": "SPF-SUNRISE-001",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "asOf": "2026-07-19T12:00:00.000Z",
    "horizonDays": 7,
    "points": [
      {
        "date": "2026-07-19",
        "projectedAvailable": "7000.00",
        "inflows": "0.00",
        "outflows": "0.00"
      },
      {
        "date": "2026-07-20",
        "projectedAvailable": "5125.00",
        "inflows": "0.00",
        "outflows": "1875.00"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
## Cash reservations

### `GET /api/investment-ops/cash-reservations`

- **Permission:** `sp.cash.position.view`
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `portfolioId=&cashAccountId=&status=&currency=&page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "cres_01HXYZ",
        "idempotencyKey": "uat:r1-resv-key",
        "sourceEventId": "ord_buy_dlta_001",
        "portfolioId": "SPF-SUNRISE-001",
        "cashAccountId": "cca_sunrise_usd_001",
        "currency": "USD",
        "originalAmount": "3000.00",
        "consumedAmount": "0.00",
        "releasedAmount": "0.00",
        "remainingAmount": "3000.00",
        "requiredDate": "2026-07-20T00:00:00.000Z",
        "expiryDate": null,
        "purpose": "BUY_ORDER",
        "status": "ACTIVE",
        "makerId": "usr_maker",
        "checkerId": "usr_checker",
        "version": 2,
        "createdAt": "2026-07-19T10:05:00.000Z",
        "updatedAt": "2026-07-19T10:06:00.000Z"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/cash-reservations`

- **Permission:** `sp.cash.reservations.request`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "portfolioId": "SPF-SUNRISE-001",
  "cashAccountId": "cca_sunrise_usd_001",
  "currency": "USD",
  "amount": "3000.00",
  "autoActivate": true,
  "purpose": "BUY_ORDER",
  "sourceEventId": "ord_buy_dlta_001",
  "expectedCashVersion": 3
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cres_01HXYZ",
    "idempotencyKey": "uat:r1-resv-key",
    "sourceEventId": "ord_buy_dlta_001",
    "portfolioId": "SPF-SUNRISE-001",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "originalAmount": "3000.00",
    "consumedAmount": "0.00",
    "releasedAmount": "0.00",
    "remainingAmount": "3000.00",
    "requiredDate": "2026-07-20T00:00:00.000Z",
    "expiryDate": null,
    "purpose": "BUY_ORDER",
    "status": "ACTIVE",
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "version": 2,
    "createdAt": "2026-07-19T10:05:00.000Z",
    "updatedAt": "2026-07-19T10:06:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/cash-reservations/:id/approve`

- **Permission:** `sp.cash.reservations.approve`
- **Headers:** `Authorization: Bearer <token>`

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
    "id": "cres_01HXYZ",
    "idempotencyKey": "uat:r1-resv-key",
    "sourceEventId": "ord_buy_dlta_001",
    "portfolioId": "SPF-SUNRISE-001",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "originalAmount": "3000.00",
    "consumedAmount": "0.00",
    "releasedAmount": "0.00",
    "remainingAmount": "3000.00",
    "requiredDate": "2026-07-20T00:00:00.000Z",
    "expiryDate": null,
    "purpose": "BUY_ORDER",
    "status": "ACTIVE",
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "version": 2,
    "createdAt": "2026-07-19T10:05:00.000Z",
    "updatedAt": "2026-07-19T10:06:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/cash-reservations/:id/consume`

- **Permission:** `sp.cash.reservations.release`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "amount": "3000.00",
  "expectedVersion": 2
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cres_01HXYZ",
    "idempotencyKey": "uat:r1-resv-key",
    "sourceEventId": "ord_buy_dlta_001",
    "portfolioId": "SPF-SUNRISE-001",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "originalAmount": "3000.00",
    "consumedAmount": "3000.00",
    "releasedAmount": "0.00",
    "remainingAmount": "0.00",
    "requiredDate": "2026-07-20T00:00:00.000Z",
    "expiryDate": null,
    "purpose": "BUY_ORDER",
    "status": "CONSUMED",
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "version": 3,
    "createdAt": "2026-07-19T10:05:00.000Z",
    "updatedAt": "2026-07-19T10:06:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/cash-reservations/:id/release`

- **Permission:** `sp.cash.reservations.release`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "amount": "500.00",
  "expectedVersion": 2,
  "reason": "Order cancelled"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cres_01HXYZ",
    "idempotencyKey": "uat:r1-resv-key",
    "sourceEventId": "ord_buy_dlta_001",
    "portfolioId": "SPF-SUNRISE-001",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "originalAmount": "3000.00",
    "consumedAmount": "0.00",
    "releasedAmount": "500.00",
    "remainingAmount": "2500.00",
    "requiredDate": "2026-07-20T00:00:00.000Z",
    "expiryDate": null,
    "purpose": "BUY_ORDER",
    "status": "RELEASED",
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "version": 3,
    "createdAt": "2026-07-19T10:05:00.000Z",
    "updatedAt": "2026-07-19T10:06:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
## Cash ledger / journals

### `GET /api/investment-ops/cash-ledger`

- **Permission:** `sp.cash.ledger.view`
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `cashAccountId=&portfolioId=&currency=&status=&from=&to=&page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "cjnl_01HSET",
        "sourceSystem": "UAT",
        "sourceEventId": "settle-ord_buy_dlta_001",
        "postingPurpose": "SETTLEMENT",
        "idempotencyKey": "uat:r1-jnl",
        "tradeDate": "2026-07-19T00:00:00.000Z",
        "settlementDate": "2026-07-19T00:00:00.000Z",
        "valueDate": "2026-07-19T00:00:00.000Z",
        "postingBusinessDate": null,
        "currency": "USD",
        "status": "POSTED",
        "makerId": "usr_maker",
        "checkerId": "usr_checker",
        "reversalOf": null,
        "cashAccountId": "cca_sunrise_usd_001",
        "portfolioId": "SPF-SUNRISE-001",
        "rejectReason": null,
        "version": 3,
        "postedAt": "2026-07-19T10:20:00.000Z",
        "auditHash": "sha256:abc...",
        "lines": [
          {
            "id": "cjl_1",
            "ledgerAccountCode": "CASH",
            "cashAccountId": "cca_sunrise_usd_001",
            "beneficialOwnerId": null,
            "debit": "0.00",
            "credit": "3005.00",
            "signedCashAmount": "-3005.00",
            "currency": "USD",
            "description": "Trade settlement outflow",
            "matchStatus": "UNMATCHED",
            "residualAmount": null,
            "lineVersion": 1
          },
          {
            "id": "cjl_2",
            "ledgerAccountCode": "BROKER_CLEARING",
            "cashAccountId": null,
            "beneficialOwnerId": null,
            "debit": "3005.00",
            "credit": "0.00",
            "signedCashAmount": "0.00",
            "currency": "USD",
            "description": "Broker clearing",
            "matchStatus": "UNMATCHED",
            "residualAmount": null,
            "lineVersion": 1
          }
        ],
        "createdAt": "2026-07-19T10:15:00.000Z",
        "updatedAt": "2026-07-19T10:20:00.000Z"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/cash-journals`

- **Permission:** `sp.cash.journals.create`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "sourceSystem": "TRADING",
  "sourceEventId": "settle-ord_buy_dlta_001",
  "postingPurpose": "SETTLEMENT",
  "currency": "USD",
  "cashAccountId": "cca_sunrise_usd_001",
  "portfolioId": "SPF-SUNRISE-001",
  "valueDate": "2026-07-19",
  "settlementDate": "2026-07-19",
  "lines": [
    {
      "ledgerAccountCode": "CASH",
      "cashAccountId": "cca_sunrise_usd_001",
      "debit": "0",
      "credit": "3005",
      "signedCashAmount": "-3005",
      "currency": "USD",
      "description": "Trade settlement outflow"
    },
    {
      "ledgerAccountCode": "BROKER_CLEARING",
      "debit": "3005",
      "credit": "0",
      "signedCashAmount": "0",
      "currency": "USD",
      "description": "Broker clearing"
    }
  ]
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cjnl_01HSET",
    "sourceSystem": "UAT",
    "sourceEventId": "settle-ord_buy_dlta_001",
    "postingPurpose": "SETTLEMENT",
    "idempotencyKey": "uat:r1-jnl",
    "tradeDate": "2026-07-19T00:00:00.000Z",
    "settlementDate": "2026-07-19T00:00:00.000Z",
    "valueDate": "2026-07-19T00:00:00.000Z",
    "postingBusinessDate": null,
    "currency": "USD",
    "status": "DRAFT",
    "makerId": "usr_maker",
    "checkerId": null,
    "reversalOf": null,
    "cashAccountId": "cca_sunrise_usd_001",
    "portfolioId": "SPF-SUNRISE-001",
    "rejectReason": null,
    "version": 1,
    "postedAt": null,
    "auditHash": "sha256:abc...",
    "lines": [
      {
        "id": "cjl_1",
        "ledgerAccountCode": "CASH",
        "cashAccountId": "cca_sunrise_usd_001",
        "beneficialOwnerId": null,
        "debit": "0.00",
        "credit": "3005.00",
        "signedCashAmount": "-3005.00",
        "currency": "USD",
        "description": "Trade settlement outflow",
        "matchStatus": "UNMATCHED",
        "residualAmount": null,
        "lineVersion": 1
      },
      {
        "id": "cjl_2",
        "ledgerAccountCode": "BROKER_CLEARING",
        "cashAccountId": null,
        "beneficialOwnerId": null,
        "debit": "3005.00",
        "credit": "0.00",
        "signedCashAmount": "0.00",
        "currency": "USD",
        "description": "Broker clearing",
        "matchStatus": "UNMATCHED",
        "residualAmount": null,
        "lineVersion": 1
      }
    ],
    "createdAt": "2026-07-19T10:15:00.000Z",
    "updatedAt": "2026-07-19T10:20:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/cash-journals/:id`

- **Permission:** `sp.cash.ledger.view`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cjnl_01HSET",
    "sourceSystem": "UAT",
    "sourceEventId": "settle-ord_buy_dlta_001",
    "postingPurpose": "SETTLEMENT",
    "idempotencyKey": "uat:r1-jnl",
    "tradeDate": "2026-07-19T00:00:00.000Z",
    "settlementDate": "2026-07-19T00:00:00.000Z",
    "valueDate": "2026-07-19T00:00:00.000Z",
    "postingBusinessDate": null,
    "currency": "USD",
    "status": "POSTED",
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "reversalOf": null,
    "cashAccountId": "cca_sunrise_usd_001",
    "portfolioId": "SPF-SUNRISE-001",
    "rejectReason": null,
    "version": 3,
    "postedAt": "2026-07-19T10:20:00.000Z",
    "auditHash": "sha256:abc...",
    "lines": [
      {
        "id": "cjl_1",
        "ledgerAccountCode": "CASH",
        "cashAccountId": "cca_sunrise_usd_001",
        "beneficialOwnerId": null,
        "debit": "0.00",
        "credit": "3005.00",
        "signedCashAmount": "-3005.00",
        "currency": "USD",
        "description": "Trade settlement outflow",
        "matchStatus": "UNMATCHED",
        "residualAmount": null,
        "lineVersion": 1
      },
      {
        "id": "cjl_2",
        "ledgerAccountCode": "BROKER_CLEARING",
        "cashAccountId": null,
        "beneficialOwnerId": null,
        "debit": "3005.00",
        "credit": "0.00",
        "signedCashAmount": "0.00",
        "currency": "USD",
        "description": "Broker clearing",
        "matchStatus": "UNMATCHED",
        "residualAmount": null,
        "lineVersion": 1
      }
    ],
    "createdAt": "2026-07-19T10:15:00.000Z",
    "updatedAt": "2026-07-19T10:20:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/cash-journals/:id/submit`

- **Permission:** `sp.cash.journals.create`
- **Headers:** `Authorization: Bearer <token>`

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
    "id": "cjnl_01HSET",
    "sourceSystem": "UAT",
    "sourceEventId": "settle-ord_buy_dlta_001",
    "postingPurpose": "SETTLEMENT",
    "idempotencyKey": "uat:r1-jnl",
    "tradeDate": "2026-07-19T00:00:00.000Z",
    "settlementDate": "2026-07-19T00:00:00.000Z",
    "valueDate": "2026-07-19T00:00:00.000Z",
    "postingBusinessDate": null,
    "currency": "USD",
    "status": "PENDING_APPROVAL",
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "reversalOf": null,
    "cashAccountId": "cca_sunrise_usd_001",
    "portfolioId": "SPF-SUNRISE-001",
    "rejectReason": null,
    "version": 2,
    "postedAt": "2026-07-19T10:20:00.000Z",
    "auditHash": "sha256:abc...",
    "lines": [
      {
        "id": "cjl_1",
        "ledgerAccountCode": "CASH",
        "cashAccountId": "cca_sunrise_usd_001",
        "beneficialOwnerId": null,
        "debit": "0.00",
        "credit": "3005.00",
        "signedCashAmount": "-3005.00",
        "currency": "USD",
        "description": "Trade settlement outflow",
        "matchStatus": "UNMATCHED",
        "residualAmount": null,
        "lineVersion": 1
      },
      {
        "id": "cjl_2",
        "ledgerAccountCode": "BROKER_CLEARING",
        "cashAccountId": null,
        "beneficialOwnerId": null,
        "debit": "3005.00",
        "credit": "0.00",
        "signedCashAmount": "0.00",
        "currency": "USD",
        "description": "Broker clearing",
        "matchStatus": "UNMATCHED",
        "residualAmount": null,
        "lineVersion": 1
      }
    ],
    "createdAt": "2026-07-19T10:15:00.000Z",
    "updatedAt": "2026-07-19T10:20:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/cash-journals/:id/approve`

- **Permission:** `sp.cash.journals.approve`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "expectedVersion": 2
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cjnl_01HSET",
    "sourceSystem": "UAT",
    "sourceEventId": "settle-ord_buy_dlta_001",
    "postingPurpose": "SETTLEMENT",
    "idempotencyKey": "uat:r1-jnl",
    "tradeDate": "2026-07-19T00:00:00.000Z",
    "settlementDate": "2026-07-19T00:00:00.000Z",
    "valueDate": "2026-07-19T00:00:00.000Z",
    "postingBusinessDate": null,
    "currency": "USD",
    "status": "POSTED",
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "reversalOf": null,
    "cashAccountId": "cca_sunrise_usd_001",
    "portfolioId": "SPF-SUNRISE-001",
    "rejectReason": null,
    "version": 3,
    "postedAt": "2026-07-19T10:20:00.000Z",
    "auditHash": "sha256:abc...",
    "lines": [
      {
        "id": "cjl_1",
        "ledgerAccountCode": "CASH",
        "cashAccountId": "cca_sunrise_usd_001",
        "beneficialOwnerId": null,
        "debit": "0.00",
        "credit": "3005.00",
        "signedCashAmount": "-3005.00",
        "currency": "USD",
        "description": "Trade settlement outflow",
        "matchStatus": "UNMATCHED",
        "residualAmount": null,
        "lineVersion": 1
      },
      {
        "id": "cjl_2",
        "ledgerAccountCode": "BROKER_CLEARING",
        "cashAccountId": null,
        "beneficialOwnerId": null,
        "debit": "3005.00",
        "credit": "0.00",
        "signedCashAmount": "0.00",
        "currency": "USD",
        "description": "Broker clearing",
        "matchStatus": "UNMATCHED",
        "residualAmount": null,
        "lineVersion": 1
      }
    ],
    "createdAt": "2026-07-19T10:15:00.000Z",
    "updatedAt": "2026-07-19T10:20:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/cash-journals/:id/reject`

- **Permission:** `sp.cash.journals.approve`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "expectedVersion": 2,
  "reason": "Wrong value date"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cjnl_01HSET",
    "sourceSystem": "UAT",
    "sourceEventId": "settle-ord_buy_dlta_001",
    "postingPurpose": "SETTLEMENT",
    "idempotencyKey": "uat:r1-jnl",
    "tradeDate": "2026-07-19T00:00:00.000Z",
    "settlementDate": "2026-07-19T00:00:00.000Z",
    "valueDate": "2026-07-19T00:00:00.000Z",
    "postingBusinessDate": null,
    "currency": "USD",
    "status": "REJECTED",
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "reversalOf": null,
    "cashAccountId": "cca_sunrise_usd_001",
    "portfolioId": "SPF-SUNRISE-001",
    "rejectReason": null,
    "version": 3,
    "postedAt": "2026-07-19T10:20:00.000Z",
    "auditHash": "sha256:abc...",
    "lines": [
      {
        "id": "cjl_1",
        "ledgerAccountCode": "CASH",
        "cashAccountId": "cca_sunrise_usd_001",
        "beneficialOwnerId": null,
        "debit": "0.00",
        "credit": "3005.00",
        "signedCashAmount": "-3005.00",
        "currency": "USD",
        "description": "Trade settlement outflow",
        "matchStatus": "UNMATCHED",
        "residualAmount": null,
        "lineVersion": 1
      },
      {
        "id": "cjl_2",
        "ledgerAccountCode": "BROKER_CLEARING",
        "cashAccountId": null,
        "beneficialOwnerId": null,
        "debit": "3005.00",
        "credit": "0.00",
        "signedCashAmount": "0.00",
        "currency": "USD",
        "description": "Broker clearing",
        "matchStatus": "UNMATCHED",
        "residualAmount": null,
        "lineVersion": 1
      }
    ],
    "createdAt": "2026-07-19T10:15:00.000Z",
    "updatedAt": "2026-07-19T10:20:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/cash-journals/:id/reverse`

- **Permission:** `sp.cash.journals.reverse`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "expectedVersion": 3,
  "reason": "Duplicate settlement"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "reversalJournal": {
      "id": "cjnl_rev_01",
      "sourceSystem": "UAT",
      "sourceEventId": "settle-ord_buy_dlta_001",
      "postingPurpose": "SETTLEMENT",
      "idempotencyKey": "uat:r1-jnl",
      "tradeDate": "2026-07-19T00:00:00.000Z",
      "settlementDate": "2026-07-19T00:00:00.000Z",
      "valueDate": "2026-07-19T00:00:00.000Z",
      "postingBusinessDate": null,
      "currency": "USD",
      "status": "POSTED",
      "makerId": "usr_maker",
      "checkerId": "usr_checker",
      "reversalOf": "cjnl_01HSET",
      "cashAccountId": "cca_sunrise_usd_001",
      "portfolioId": "SPF-SUNRISE-001",
      "rejectReason": null,
      "version": 3,
      "postedAt": "2026-07-19T10:20:00.000Z",
      "auditHash": "sha256:abc...",
      "lines": [
        {
          "id": "cjl_1",
          "ledgerAccountCode": "CASH",
          "cashAccountId": "cca_sunrise_usd_001",
          "beneficialOwnerId": null,
          "debit": "0.00",
          "credit": "3005.00",
          "signedCashAmount": "-3005.00",
          "currency": "USD",
          "description": "Trade settlement outflow",
          "matchStatus": "UNMATCHED",
          "residualAmount": null,
          "lineVersion": 1
        },
        {
          "id": "cjl_2",
          "ledgerAccountCode": "BROKER_CLEARING",
          "cashAccountId": null,
          "beneficialOwnerId": null,
          "debit": "3005.00",
          "credit": "0.00",
          "signedCashAmount": "0.00",
          "currency": "USD",
          "description": "Broker clearing",
          "matchStatus": "UNMATCHED",
          "residualAmount": null,
          "lineVersion": 1
        }
      ],
      "createdAt": "2026-07-19T10:15:00.000Z",
      "updatedAt": "2026-07-19T10:20:00.000Z"
    },
    "original": {
      "id": "cjnl_01HSET",
      "sourceSystem": "UAT",
      "sourceEventId": "settle-ord_buy_dlta_001",
      "postingPurpose": "SETTLEMENT",
      "idempotencyKey": "uat:r1-jnl",
      "tradeDate": "2026-07-19T00:00:00.000Z",
      "settlementDate": "2026-07-19T00:00:00.000Z",
      "valueDate": "2026-07-19T00:00:00.000Z",
      "postingBusinessDate": null,
      "currency": "USD",
      "status": "REVERSED",
      "makerId": "usr_maker",
      "checkerId": "usr_checker",
      "reversalOf": null,
      "cashAccountId": "cca_sunrise_usd_001",
      "portfolioId": "SPF-SUNRISE-001",
      "rejectReason": null,
      "version": 3,
      "postedAt": "2026-07-19T10:20:00.000Z",
      "auditHash": "sha256:abc...",
      "lines": [
        {
          "id": "cjl_1",
          "ledgerAccountCode": "CASH",
          "cashAccountId": "cca_sunrise_usd_001",
          "beneficialOwnerId": null,
          "debit": "0.00",
          "credit": "3005.00",
          "signedCashAmount": "-3005.00",
          "currency": "USD",
          "description": "Trade settlement outflow",
          "matchStatus": "UNMATCHED",
          "residualAmount": null,
          "lineVersion": 1
        },
        {
          "id": "cjl_2",
          "ledgerAccountCode": "BROKER_CLEARING",
          "cashAccountId": null,
          "beneficialOwnerId": null,
          "debit": "3005.00",
          "credit": "0.00",
          "signedCashAmount": "0.00",
          "currency": "USD",
          "description": "Broker clearing",
          "matchStatus": "UNMATCHED",
          "residualAmount": null,
          "lineVersion": 1
        }
      ],
      "createdAt": "2026-07-19T10:15:00.000Z",
      "updatedAt": "2026-07-19T10:20:00.000Z"
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
## External statements / imports

### `POST /api/investment-ops/external-statements/imports`

- **Permission:** `sp.cash.imports.upload`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "providerId": "prov_cbz_cash",
  "cashAccountId": "cca_sunrise_usd_001",
  "currency": "USD",
  "fileName": "cbz-stmt-2026-07-19.csv",
  "fileHash": "a1b2c3d4e5f6...",
  "layoutId": "clay_cbz_v1",
  "controlOpening": "10000.00",
  "controlClosing": "9950.00",
  "rawContent": "value_date,amount,debit_credit,reference,counterparty\n2026-07-19,100,Debit,R2-DEBIT-1,CBZ\n2026-07-19,50,Credit,R2-CREDIT-1,CBZ",
  "lines": [
    {
      "valueDate": "2026-07-19",
      "tradeDate": "2026-07-19",
      "amount": 100,
      "debitCredit": "Debit",
      "reference": "R2-DEBIT-1",
      "counterparty": "CBZ"
    },
    {
      "valueDate": "2026-07-19",
      "tradeDate": "2026-07-19",
      "amount": 50,
      "debitCredit": "Credit",
      "reference": "R2-CREDIT-1",
      "counterparty": "CBZ"
    }
  ]
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cimp_01HCBZ",
    "providerId": "prov_cbz_cash",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "fileName": "cbz-stmt-2026-07-19.csv",
    "fileHash": "a1b2c3d4e5f6...",
    "layoutId": "clay_cbz_v1",
    "status": "DRAFT",
    "controlOpening": "10000.00",
    "controlClosing": "9950.00",
    "lineCount": 2,
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "rejectReason": null,
    "version": 1,
    "committedAt": null,
    "statementId": null,
    "createdAt": "2026-07-19T10:40:00.000Z",
    "updatedAt": "2026-07-19T11:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/external-statements/imports/:id`

- **Permission:** `sp.cash.reconciliation.view`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cimp_01HCBZ",
    "providerId": "prov_cbz_cash",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "fileName": "cbz-stmt-2026-07-19.csv",
    "fileHash": "a1b2c3d4e5f6...",
    "layoutId": "clay_cbz_v1",
    "status": "VALIDATED",
    "controlOpening": "10000.00",
    "controlClosing": "9950.00",
    "lineCount": 2,
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "rejectReason": null,
    "version": 4,
    "committedAt": "2026-07-19T11:00:00.000Z",
    "statementId": "cstmt_ext_01",
    "createdAt": "2026-07-19T10:40:00.000Z",
    "updatedAt": "2026-07-19T11:00:00.000Z",
    "stagedLines": [
      {
        "reference": "R2-DEBIT-1",
        "debitCredit": "DEBIT",
        "signedCashAmount": "-100.00",
        "amount": "100.00",
        "valueDate": "2026-07-19"
      },
      {
        "reference": "R2-CREDIT-1",
        "debitCredit": "CREDIT",
        "signedCashAmount": "50.00",
        "amount": "50.00",
        "valueDate": "2026-07-19"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/external-statements/imports/:id/errors`

- **Permission:** `sp.cash.reconciliation.view`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "importId": "cimp_01HCBZ",
    "errors": [
      {
        "code": "CONTROL_MISMATCH",
        "message": "Control closing does not equal opening + movements",
        "field": "controlClosing"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/external-statements/imports/:id/validate`

- **Permission:** `sp.cash.imports.validate`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cimp_01HCBZ",
    "providerId": "prov_cbz_cash",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "fileName": "cbz-stmt-2026-07-19.csv",
    "fileHash": "a1b2c3d4e5f6...",
    "layoutId": "clay_cbz_v1",
    "status": "VALIDATED",
    "controlOpening": "10000.00",
    "controlClosing": "9950.00",
    "lineCount": 2,
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "rejectReason": null,
    "version": 4,
    "committedAt": "2026-07-19T11:00:00.000Z",
    "statementId": "cstmt_ext_01",
    "createdAt": "2026-07-19T10:40:00.000Z",
    "updatedAt": "2026-07-19T11:00:00.000Z",
    "valid": true,
    "errors": [],
    "stagedLines": []
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/external-statements/imports/:id/submit`

- **Permission:** `sp.cash.imports.upload`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cimp_01HCBZ",
    "providerId": "prov_cbz_cash",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "fileName": "cbz-stmt-2026-07-19.csv",
    "fileHash": "a1b2c3d4e5f6...",
    "layoutId": "clay_cbz_v1",
    "status": "PENDING_APPROVAL",
    "controlOpening": "10000.00",
    "controlClosing": "9950.00",
    "lineCount": 2,
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "rejectReason": null,
    "version": 3,
    "committedAt": "2026-07-19T11:00:00.000Z",
    "statementId": "cstmt_ext_01",
    "createdAt": "2026-07-19T10:40:00.000Z",
    "updatedAt": "2026-07-19T11:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/external-statements/imports/:id/commit`

- **Permission:** `sp.cash.imports.commit`
- **Headers:** `Authorization: Bearer <token>`
- **Notes:** Checker ≠ maker

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cimp_01HCBZ",
    "providerId": "prov_cbz_cash",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "fileName": "cbz-stmt-2026-07-19.csv",
    "fileHash": "a1b2c3d4e5f6...",
    "layoutId": "clay_cbz_v1",
    "status": "COMMITTED",
    "controlOpening": "10000.00",
    "controlClosing": "9950.00",
    "lineCount": 2,
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "rejectReason": null,
    "version": 4,
    "committedAt": "2026-07-19T11:00:00.000Z",
    "statementId": "cstmt_ext_01",
    "createdAt": "2026-07-19T10:40:00.000Z",
    "updatedAt": "2026-07-19T11:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/external-statements/imports/:id/reject`

- **Permission:** `sp.cash.imports.commit`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "reason": "Wrong account mapping"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cimp_01HCBZ",
    "providerId": "prov_cbz_cash",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "fileName": "cbz-stmt-2026-07-19.csv",
    "fileHash": "a1b2c3d4e5f6...",
    "layoutId": "clay_cbz_v1",
    "status": "REJECTED",
    "controlOpening": "10000.00",
    "controlClosing": "9950.00",
    "lineCount": 2,
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "rejectReason": "Wrong account mapping",
    "version": 4,
    "committedAt": null,
    "statementId": null,
    "createdAt": "2026-07-19T10:40:00.000Z",
    "updatedAt": "2026-07-19T11:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
## Reconciliation batches (cash subledger)

> **Scope note:** These are **cash** reconciliation routes. Investments V2 section 22 holdings/trade recon remains at `/api/investment-ops/reconciliation/*` and is documented in [investments-v2-api.md](./investments-v2-api.md).

### `POST /api/investment-ops/reconciliation-batches`

- **Permission:** `sp.cash.reconciliation.run`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "cashAccountId": "cca_sunrise_usd_001",
  "currency": "USD",
  "periodFrom": "2026-07-19",
  "periodTo": "2026-07-19",
  "reconType": "CASH_STATEMENT",
  "autoMatchEnabled": true,
  "fundId": "SPF-SUNRISE-001"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "periodFrom": "2026-07-19T00:00:00.000Z",
    "periodTo": "2026-07-19T00:00:00.000Z",
    "reconType": "CASH_STATEMENT",
    "openingInternal": "10000.00",
    "closingInternal": "6995.00",
    "openingExternal": "10000.00",
    "closingExternal": "9950.00",
    "adjustedExternal": "9950.00",
    "variance": null,
    "toleranceAmount": "1.00",
    "status": "OPEN",
    "autoMatchEnabled": true,
    "fundId": "SPF-SUNRISE-001",
    "version": 1,
    "createdAt": "2026-07-19T11:05:00.000Z",
    "updatedAt": "2026-07-19T11:10:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/reconciliation-batches`

- **Permission:** `sp.cash.reconciliation.view`
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `cashAccountId=&status=&from=&to=&page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "creb_01HREC",
        "cashAccountId": "cca_sunrise_usd_001",
        "currency": "USD",
        "periodFrom": "2026-07-19T00:00:00.000Z",
        "periodTo": "2026-07-19T00:00:00.000Z",
        "reconType": "CASH_STATEMENT",
        "openingInternal": "10000.00",
        "closingInternal": "6995.00",
        "openingExternal": "10000.00",
        "closingExternal": "9950.00",
        "adjustedExternal": "9950.00",
        "variance": "2955.00",
        "toleranceAmount": "1.00",
        "status": "IN_PROGRESS",
        "autoMatchEnabled": true,
        "fundId": "SPF-SUNRISE-001",
        "version": 2,
        "createdAt": "2026-07-19T11:05:00.000Z",
        "updatedAt": "2026-07-19T11:10:00.000Z"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/reconciliation-batches/:id`

- **Permission:** `sp.cash.reconciliation.view`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "periodFrom": "2026-07-19T00:00:00.000Z",
    "periodTo": "2026-07-19T00:00:00.000Z",
    "reconType": "CASH_STATEMENT",
    "openingInternal": "10000.00",
    "closingInternal": "6995.00",
    "openingExternal": "10000.00",
    "closingExternal": "9950.00",
    "adjustedExternal": "9950.00",
    "variance": "2955.00",
    "toleranceAmount": "1.00",
    "status": "IN_PROGRESS",
    "autoMatchEnabled": true,
    "fundId": "SPF-SUNRISE-001",
    "version": 2,
    "createdAt": "2026-07-19T11:05:00.000Z",
    "updatedAt": "2026-07-19T11:10:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/reconciliation-batches/:id/run`

- **Permission:** `sp.cash.reconciliation.run`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "autoMatch": true
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "currency": "USD",
    "periodFrom": "2026-07-19T00:00:00.000Z",
    "periodTo": "2026-07-19T00:00:00.000Z",
    "reconType": "CASH_STATEMENT",
    "openingInternal": "10000.00",
    "closingInternal": "6995.00",
    "openingExternal": "10000.00",
    "closingExternal": "9950.00",
    "adjustedExternal": "9950.00",
    "variance": "2955.00",
    "toleranceAmount": "1.00",
    "status": "IN_PROGRESS",
    "autoMatchEnabled": true,
    "fundId": "SPF-SUNRISE-001",
    "version": 2,
    "createdAt": "2026-07-19T11:05:00.000Z",
    "updatedAt": "2026-07-19T11:10:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/reconciliation-batches/:id/workspace`

- **Permission:** `sp.cash.reconciliation.view`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "batchId": "creb_01HREC",
    "unmatchedInternal": [
      {
        "id": "cjl_fee_1",
        "signedCashAmount": "-100.00",
        "currency": "USD",
        "description": "R2-DEBIT-1"
      }
    ],
    "unmatchedExternal": [
      {
        "id": "cesl_1",
        "signedCashAmount": "-100.00",
        "currency": "USD",
        "reference": "R2-DEBIT-1"
      }
    ],
    "suggested": [
      {
        "internalLineId": "cjl_fee_1",
        "externalLineId": "cesl_1",
        "scoreTotal": 0.96
      }
    ],
    "matches": [
      {
        "id": "cml_01HMATCH",
        "linkId": "cml_01HMATCH",
        "batchId": "creb_01HREC",
        "internalLineId": "cjl_1",
        "externalLineId": "cesl_1",
        "matchedAmount": "100.00",
        "topology": "ONE_TO_ONE",
        "scoreTotal": 0.96,
        "scoreComponents": {
          "amount": 1,
          "date": 1,
          "reference": 0.9,
          "counterparty": 0.85
        },
        "method": "AUTO",
        "status": "CONFIRMED",
        "makerId": "usr_maker",
        "checkerId": "usr_checker",
        "version": 1,
        "createdAt": "2026-07-19T11:12:00.000Z"
      }
    ],
    "breaks": [
      {
        "breakId": "cbrk_01HVAR",
        "id": "cbrk_01HVAR",
        "batchId": "creb_01HREC",
        "cashAccountId": "cca_sunrise_usd_001",
        "status": "OPEN",
        "amount": "50.00",
        "currency": "USD",
        "category": "AMOUNT_VARIANCE",
        "comments": [],
        "version": 1
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/reconciliation-batches/:id/summary`

- **Permission:** `sp.cash.reconciliation.view`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "batchId": "creb_01HREC",
    "status": "IN_PROGRESS",
    "matchedCount": 1,
    "unmatchedInternalCount": 0,
    "unmatchedExternalCount": 1,
    "openBreakCount": 1,
    "variance": "50.00",
    "currency": "USD"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/reconciliation-batches/:id/auto-match`

- **Permission:** `sp.cash.reconciliation.match`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "batchId": "creb_01HREC",
    "matchedCount": 1,
    "links": [
      {
        "id": "cml_01HMATCH",
        "linkId": "cml_01HMATCH",
        "batchId": "creb_01HREC",
        "internalLineId": "cjl_1",
        "externalLineId": "cesl_1",
        "matchedAmount": "100.00",
        "topology": "ONE_TO_ONE",
        "scoreTotal": 0.96,
        "scoreComponents": {
          "amount": 1,
          "date": 1,
          "reference": 0.9,
          "counterparty": 0.85
        },
        "method": "AUTO",
        "status": "CONFIRMED",
        "makerId": "usr_maker",
        "checkerId": "usr_checker",
        "version": 1,
        "createdAt": "2026-07-19T11:12:00.000Z"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/reconciliation-rules/active`

- **Permission:** `sp.cash.reconciliation.view`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "matchWeightPolicy": {
      "amountWeight": 0.4,
      "dateWeight": 0.25,
      "referenceWeight": 0.2,
      "counterpartyWeight": 0.15,
      "autoMatchThreshold": 0.9,
      "suggestThreshold": 0.7,
      "weakThreshold": 0.5,
      "dateToleranceDays": 2,
      "amountTolerance": 1
    },
    "hardRules": [
      "CURRENCY_MUST_MATCH",
      "SIGN_MUST_AGREE",
      "SAME_CASH_ACCOUNT"
    ],
    "scoring": {
      "amount": 0.4,
      "date": 0.25,
      "reference": 0.2,
      "counterparty": 0.15
    },
    "thresholds": {
      "autoMatch": 0.9,
      "suggest": 0.7,
      "weak": 0.5
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/fund-cash-summary`

- **Permission:** `sp.cash.reconciliation.view`
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `fundId=SPF-SUNRISE-001&asOf=2026-07-19`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "fundId": "SPF-SUNRISE-001",
    "asOf": "2026-07-19",
    "postedSettledCash": "6995.00",
    "orderEligibleAvailableCash": "6995.00",
    "openBreakVariance": "50.00",
    "openExceptionCount": 1,
    "currency": "USD"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
## Matches

### `POST /api/investment-ops/matches/confirm`

- **Permission:** `sp.cash.reconciliation.match`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "batchId": "creb_01HREC",
  "topology": "ONE_TO_ONE",
  "links": [
    {
      "internalLineId": "cjl_fee_1",
      "externalLineId": "cesl_1",
      "matchedAmount": "100.00"
    }
  ]
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "batchId": "creb_01HREC",
    "links": [
      {
        "id": "cml_01HMATCH",
        "linkId": "cml_01HMATCH",
        "batchId": "creb_01HREC",
        "internalLineId": "cjl_1",
        "externalLineId": "cesl_1",
        "matchedAmount": "100.00",
        "topology": "ONE_TO_ONE",
        "scoreTotal": 0.96,
        "scoreComponents": {
          "amount": 1,
          "date": 1,
          "reference": 0.9,
          "counterparty": 0.85
        },
        "method": "AUTO",
        "status": "CONFIRMED",
        "makerId": "usr_maker",
        "checkerId": "usr_checker",
        "version": 1,
        "createdAt": "2026-07-19T11:12:00.000Z"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/matches/manual`

- **Permission:** `sp.cash.reconciliation.match`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "batchId": "creb_01HREC",
  "topology": "ONE_TO_MANY",
  "reason": "Fee split across two bank lines",
  "links": [
    {
      "internalLineId": "cjl_fee_1",
      "externalLineId": "cesl_1",
      "matchedAmount": "60.00"
    },
    {
      "internalLineId": "cjl_fee_1",
      "externalLineId": "cesl_2",
      "matchedAmount": "40.00"
    }
  ]
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "batchId": "creb_01HREC",
    "links": [
      {
        "id": "cml_01HMATCH",
        "linkId": "cml_01HMATCH",
        "batchId": "creb_01HREC",
        "internalLineId": "cjl_1",
        "externalLineId": "cesl_1",
        "matchedAmount": "100.00",
        "topology": "ONE_TO_ONE",
        "scoreTotal": 0.96,
        "scoreComponents": {
          "amount": 1,
          "date": 1,
          "reference": 0.9,
          "counterparty": 0.85
        },
        "method": "AUTO",
        "status": "CONFIRMED",
        "makerId": "usr_maker",
        "checkerId": "usr_checker",
        "version": 1,
        "createdAt": "2026-07-19T11:12:00.000Z"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/matches/:linkId`

- **Permission:** `sp.cash.reconciliation.view`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cml_01HMATCH",
    "linkId": "cml_01HMATCH",
    "batchId": "creb_01HREC",
    "internalLineId": "cjl_1",
    "externalLineId": "cesl_1",
    "matchedAmount": "100.00",
    "topology": "ONE_TO_ONE",
    "scoreTotal": 0.96,
    "scoreComponents": {
      "amount": 1,
      "date": 1,
      "reference": 0.9,
      "counterparty": 0.85
    },
    "method": "AUTO",
    "status": "CONFIRMED",
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "version": 1,
    "createdAt": "2026-07-19T11:12:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/matches/:linkId/reverse`

- **Permission:** `sp.cash.reconciliation.unmatch`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "reason": "Matched wrong external line",
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cml_01HMATCH",
    "linkId": "cml_01HMATCH",
    "batchId": "creb_01HREC",
    "internalLineId": "cjl_1",
    "externalLineId": "cesl_1",
    "matchedAmount": "100.00",
    "topology": "ONE_TO_ONE",
    "scoreTotal": 0.96,
    "scoreComponents": {
      "amount": 1,
      "date": 1,
      "reference": 0.9,
      "counterparty": 0.85
    },
    "method": "AUTO",
    "status": "REVERSED",
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "version": 2,
    "createdAt": "2026-07-19T11:12:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
## Broker & custodian

### `GET /api/investment-ops/broker-custodian/workspace`

- **Permission:** `sp.cash.reconciliation.view`
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `portfolioId=SPF-SUNRISE-001&overallStatus=&page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "counts": {
      "total": 1,
      "matched": 0,
      "potential": 1,
      "exception": 0
    },
    "items": [
      {
        "id": "cbc_01HDLTA",
        "portfolioId": "SPF-SUNRISE-001",
        "instrumentIsin": "ZW000901RFT6",
        "instrumentName": "Delta Corporation",
        "symbol": "DLTA",
        "quantity": "100.00",
        "price": "18.75",
        "tradeDate": "2026-07-18T00:00:00.000Z",
        "settleDate": "2026-07-20T00:00:00.000Z",
        "internalStatus": "MATCHED",
        "brokerStatus": "MATCHED",
        "custodianStatus": "PENDING",
        "overallStatus": "POTENTIAL",
        "differenceAmount": "0.00",
        "currency": "USD",
        "assignedToId": null,
        "comments": null,
        "version": 1,
        "createdAt": "2026-07-18T09:00:00.000Z",
        "updatedAt": "2026-07-18T09:00:00.000Z"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/broker-custodian/matches/confirm`

- **Permission:** `sp.cash.reconciliation.match`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "itemIds": [
    "cbc_01HDLTA"
  ]
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "cbc_01HDLTA",
        "portfolioId": "SPF-SUNRISE-001",
        "instrumentIsin": "ZW000901RFT6",
        "instrumentName": "Delta Corporation",
        "symbol": "DLTA",
        "quantity": "100.00",
        "price": "18.75",
        "tradeDate": "2026-07-18T00:00:00.000Z",
        "settleDate": "2026-07-20T00:00:00.000Z",
        "internalStatus": "MATCHED",
        "brokerStatus": "MATCHED",
        "custodianStatus": "MATCHED",
        "overallStatus": "MATCHED",
        "differenceAmount": "0.00",
        "currency": "USD",
        "assignedToId": null,
        "comments": null,
        "version": 2,
        "createdAt": "2026-07-18T09:00:00.000Z",
        "updatedAt": "2026-07-18T09:00:00.000Z"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/broker-custodian/items/:id/escalate`

- **Permission:** `sp.cash.exceptions.assign`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "assignedToId": "usr_ops",
  "notes": "Custodian pending > 2 days"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cbc_01HDLTA",
    "portfolioId": "SPF-SUNRISE-001",
    "instrumentIsin": "ZW000901RFT6",
    "instrumentName": "Delta Corporation",
    "symbol": "DLTA",
    "quantity": "100.00",
    "price": "18.75",
    "tradeDate": "2026-07-18T00:00:00.000Z",
    "settleDate": "2026-07-20T00:00:00.000Z",
    "internalStatus": "MATCHED",
    "brokerStatus": "MATCHED",
    "custodianStatus": "PENDING",
    "overallStatus": "EXCEPTION",
    "differenceAmount": "0.00",
    "currency": "USD",
    "assignedToId": "usr_ops",
    "comments": null,
    "version": 2,
    "createdAt": "2026-07-18T09:00:00.000Z",
    "updatedAt": "2026-07-18T09:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/broker-custodian/items/:id/clear`

- **Permission:** `sp.cash.exceptions.approve`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "reason": "Custodian confirmed off-platform"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cbc_01HDLTA",
    "portfolioId": "SPF-SUNRISE-001",
    "instrumentIsin": "ZW000901RFT6",
    "instrumentName": "Delta Corporation",
    "symbol": "DLTA",
    "quantity": "100.00",
    "price": "18.75",
    "tradeDate": "2026-07-18T00:00:00.000Z",
    "settleDate": "2026-07-20T00:00:00.000Z",
    "internalStatus": "MATCHED",
    "brokerStatus": "MATCHED",
    "custodianStatus": "MATCHED",
    "overallStatus": "CLEARED",
    "differenceAmount": "0.00",
    "currency": "USD",
    "assignedToId": null,
    "comments": null,
    "version": 3,
    "createdAt": "2026-07-18T09:00:00.000Z",
    "updatedAt": "2026-07-18T09:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
## Reconciliation exceptions

### `GET /api/investment-ops/reconciliation-exceptions`

- **Permission:** `sp.cash.exceptions.view`
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `status=&severity=&category=&cashAccountId=&page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "exceptionId": "cexc_01HBRK",
        "id": "cexc_01HBRK",
        "batchId": "creb_01HREC",
        "cashAccountId": "cca_sunrise_usd_001",
        "clientOrVehicleId": "cli_sunrise_wealth",
        "category": "UNMATCHED_EXTERNAL",
        "severity": "MEDIUM",
        "status": "OPEN",
        "amountTxn": "50.00",
        "currencyTxn": "USD",
        "amountReporting": "50.00",
        "currencyReporting": "USD",
        "difference": {
          "transaction": {
            "amount": "50.00",
            "currency": "USD"
          },
          "reporting": {
            "amount": "50.00",
            "currency": "USD"
          }
        },
        "assignedToId": null,
        "assignedTo": null,
        "approverId": null,
        "approver": null,
        "ownerRole": "CashOperations",
        "slaDueAt": "2026-07-22T17:00:00.000Z",
        "resolutionJson": null,
        "ageDays": 0,
        "instrument": null,
        "tradeDate": null,
        "settleDate": null,
        "source": "STATEMENT_IMPORT",
        "counterparty": "CBZ",
        "version": 1,
        "createdAt": "2026-07-19T11:15:00.000Z",
        "updatedAt": "2026-07-19T11:15:00.000Z"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/reconciliation-exceptions/summary`

- **Permission:** `sp.cash.exceptions.view`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "open": 4,
    "assigned": 2,
    "investigating": 1,
    "pendingApproval": 1,
    "closed": 12,
    "bySeverity": {
      "HIGH": 1,
      "MEDIUM": 3,
      "LOW": 0
    },
    "byCategory": {
      "UNMATCHED_EXTERNAL": 3,
      "AMOUNT_VARIANCE": 1
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/reconciliation-exceptions/:id`

- **Permission:** `sp.cash.exceptions.view`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "exceptionId": "cexc_01HBRK",
    "id": "cexc_01HBRK",
    "batchId": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "category": "UNMATCHED_EXTERNAL",
    "severity": "MEDIUM",
    "status": "OPEN",
    "amountTxn": "50.00",
    "currencyTxn": "USD",
    "amountReporting": "50.00",
    "currencyReporting": "USD",
    "difference": {
      "transaction": {
        "amount": "50.00",
        "currency": "USD"
      },
      "reporting": {
        "amount": "50.00",
        "currency": "USD"
      }
    },
    "assignedToId": null,
    "assignedTo": null,
    "approverId": null,
    "approver": null,
    "ownerRole": "CashOperations",
    "slaDueAt": "2026-07-22T17:00:00.000Z",
    "resolutionJson": null,
    "ageDays": 0,
    "instrument": null,
    "tradeDate": null,
    "settleDate": null,
    "source": "STATEMENT_IMPORT",
    "counterparty": "CBZ",
    "version": 1,
    "createdAt": "2026-07-19T11:15:00.000Z",
    "updatedAt": "2026-07-19T11:15:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/reconciliation-exceptions/:id/timeline`

- **Permission:** `sp.cash.exceptions.view`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "exceptionId": "cexc_01HBRK",
    "items": [
      {
        "eventType": "CREATED",
        "actorId": "system",
        "notes": null,
        "createdAt": "2026-07-19T11:15:00.000Z"
      },
      {
        "eventType": "ASSIGNED",
        "actorId": "usr_ops",
        "notes": "Take ownership",
        "createdAt": "2026-07-19T11:30:00.000Z"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/reconciliation-exceptions/:id/assign`

- **Permission:** `sp.cash.exceptions.assign`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "assignedToId": "usr_ops",
  "notes": "Take ownership"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "exceptionId": "cexc_01HBRK",
    "id": "cexc_01HBRK",
    "batchId": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "category": "UNMATCHED_EXTERNAL",
    "severity": "MEDIUM",
    "status": "ASSIGNED",
    "amountTxn": "50.00",
    "currencyTxn": "USD",
    "amountReporting": "50.00",
    "currencyReporting": "USD",
    "difference": {
      "transaction": {
        "amount": "50.00",
        "currency": "USD"
      },
      "reporting": {
        "amount": "50.00",
        "currency": "USD"
      }
    },
    "assignedToId": "usr_ops",
    "assignedTo": null,
    "approverId": null,
    "approver": null,
    "ownerRole": "CashOperations",
    "slaDueAt": "2026-07-22T17:00:00.000Z",
    "resolutionJson": null,
    "ageDays": 0,
    "instrument": null,
    "tradeDate": null,
    "settleDate": null,
    "source": "STATEMENT_IMPORT",
    "counterparty": "CBZ",
    "version": 2,
    "createdAt": "2026-07-19T11:15:00.000Z",
    "updatedAt": "2026-07-19T11:15:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/reconciliation-exceptions/:id/investigate`

- **Permission:** `sp.cash.exceptions.assign`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "notes": "Checking bank memo"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "exceptionId": "cexc_01HBRK",
    "id": "cexc_01HBRK",
    "batchId": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "category": "UNMATCHED_EXTERNAL",
    "severity": "MEDIUM",
    "status": "INVESTIGATING",
    "amountTxn": "50.00",
    "currencyTxn": "USD",
    "amountReporting": "50.00",
    "currencyReporting": "USD",
    "difference": {
      "transaction": {
        "amount": "50.00",
        "currency": "USD"
      },
      "reporting": {
        "amount": "50.00",
        "currency": "USD"
      }
    },
    "assignedToId": null,
    "assignedTo": null,
    "approverId": null,
    "approver": null,
    "ownerRole": "CashOperations",
    "slaDueAt": "2026-07-22T17:00:00.000Z",
    "resolutionJson": null,
    "ageDays": 0,
    "instrument": null,
    "tradeDate": null,
    "settleDate": null,
    "source": "STATEMENT_IMPORT",
    "counterparty": "CBZ",
    "version": 2,
    "createdAt": "2026-07-19T11:15:00.000Z",
    "updatedAt": "2026-07-19T11:15:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/reconciliation-exceptions/:id/propose-resolution`

- **Permission:** `sp.cash.exceptions.propose`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "resolutionType": "WRITE_OFF",
  "amount": "50.00",
  "notes": "Immaterial bank fee"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "exceptionId": "cexc_01HBRK",
    "id": "cexc_01HBRK",
    "batchId": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "category": "UNMATCHED_EXTERNAL",
    "severity": "MEDIUM",
    "status": "PENDING_APPROVAL",
    "amountTxn": "50.00",
    "currencyTxn": "USD",
    "amountReporting": "50.00",
    "currencyReporting": "USD",
    "difference": {
      "transaction": {
        "amount": "50.00",
        "currency": "USD"
      },
      "reporting": {
        "amount": "50.00",
        "currency": "USD"
      }
    },
    "assignedToId": null,
    "assignedTo": null,
    "approverId": null,
    "approver": null,
    "ownerRole": "CashOperations",
    "slaDueAt": "2026-07-22T17:00:00.000Z",
    "resolutionJson": null,
    "ageDays": 0,
    "instrument": null,
    "tradeDate": null,
    "settleDate": null,
    "source": "STATEMENT_IMPORT",
    "counterparty": "CBZ",
    "version": 2,
    "createdAt": "2026-07-19T11:15:00.000Z",
    "updatedAt": "2026-07-19T11:15:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/reconciliation-exceptions/:id/approve`

- **Permission:** `sp.cash.exceptions.approve`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "expectedVersion": 4
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "exceptionId": "cexc_01HBRK",
    "id": "cexc_01HBRK",
    "batchId": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "category": "UNMATCHED_EXTERNAL",
    "severity": "MEDIUM",
    "status": "RESOLVED",
    "amountTxn": "50.00",
    "currencyTxn": "USD",
    "amountReporting": "50.00",
    "currencyReporting": "USD",
    "difference": {
      "transaction": {
        "amount": "50.00",
        "currency": "USD"
      },
      "reporting": {
        "amount": "50.00",
        "currency": "USD"
      }
    },
    "assignedToId": null,
    "assignedTo": null,
    "approverId": null,
    "approver": null,
    "ownerRole": "CashOperations",
    "slaDueAt": "2026-07-22T17:00:00.000Z",
    "resolutionJson": null,
    "ageDays": 0,
    "instrument": null,
    "tradeDate": null,
    "settleDate": null,
    "source": "STATEMENT_IMPORT",
    "counterparty": "CBZ",
    "version": 2,
    "createdAt": "2026-07-19T11:15:00.000Z",
    "updatedAt": "2026-07-19T11:15:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/reconciliation-exceptions/:id/request-info`

- **Permission:** `sp.cash.exceptions.assign`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "notes": "Need broker advice copy"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "exceptionId": "cexc_01HBRK",
    "id": "cexc_01HBRK",
    "batchId": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "category": "UNMATCHED_EXTERNAL",
    "severity": "MEDIUM",
    "status": "INFO_REQUESTED",
    "amountTxn": "50.00",
    "currencyTxn": "USD",
    "amountReporting": "50.00",
    "currencyReporting": "USD",
    "difference": {
      "transaction": {
        "amount": "50.00",
        "currency": "USD"
      },
      "reporting": {
        "amount": "50.00",
        "currency": "USD"
      }
    },
    "assignedToId": null,
    "assignedTo": null,
    "approverId": null,
    "approver": null,
    "ownerRole": "CashOperations",
    "slaDueAt": "2026-07-22T17:00:00.000Z",
    "resolutionJson": null,
    "ageDays": 0,
    "instrument": null,
    "tradeDate": null,
    "settleDate": null,
    "source": "STATEMENT_IMPORT",
    "counterparty": "CBZ",
    "version": 2,
    "createdAt": "2026-07-19T11:15:00.000Z",
    "updatedAt": "2026-07-19T11:15:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/reconciliation-exceptions/:id/reject`

- **Permission:** `sp.cash.exceptions.approve`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "reason": "Amount not immaterial",
  "expectedVersion": 4
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "exceptionId": "cexc_01HBRK",
    "id": "cexc_01HBRK",
    "batchId": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "category": "UNMATCHED_EXTERNAL",
    "severity": "MEDIUM",
    "status": "INVESTIGATING",
    "amountTxn": "50.00",
    "currencyTxn": "USD",
    "amountReporting": "50.00",
    "currencyReporting": "USD",
    "difference": {
      "transaction": {
        "amount": "50.00",
        "currency": "USD"
      },
      "reporting": {
        "amount": "50.00",
        "currency": "USD"
      }
    },
    "assignedToId": null,
    "assignedTo": null,
    "approverId": null,
    "approver": null,
    "ownerRole": "CashOperations",
    "slaDueAt": "2026-07-22T17:00:00.000Z",
    "resolutionJson": null,
    "ageDays": 0,
    "instrument": null,
    "tradeDate": null,
    "settleDate": null,
    "source": "STATEMENT_IMPORT",
    "counterparty": "CBZ",
    "version": 2,
    "createdAt": "2026-07-19T11:15:00.000Z",
    "updatedAt": "2026-07-19T11:15:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/reconciliation-exceptions/:id/close`

- **Permission:** `sp.cash.exceptions.approve`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "reason": "Resolved off-platform",
  "expectedVersion": 5
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "exceptionId": "cexc_01HBRK",
    "id": "cexc_01HBRK",
    "batchId": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "category": "UNMATCHED_EXTERNAL",
    "severity": "MEDIUM",
    "status": "CLOSED",
    "amountTxn": "50.00",
    "currencyTxn": "USD",
    "amountReporting": "50.00",
    "currencyReporting": "USD",
    "difference": {
      "transaction": {
        "amount": "50.00",
        "currency": "USD"
      },
      "reporting": {
        "amount": "50.00",
        "currency": "USD"
      }
    },
    "assignedToId": null,
    "assignedTo": null,
    "approverId": null,
    "approver": null,
    "ownerRole": "CashOperations",
    "slaDueAt": "2026-07-22T17:00:00.000Z",
    "resolutionJson": null,
    "ageDays": 0,
    "instrument": null,
    "tradeDate": null,
    "settleDate": null,
    "source": "STATEMENT_IMPORT",
    "counterparty": "CBZ",
    "version": 2,
    "createdAt": "2026-07-19T11:15:00.000Z",
    "updatedAt": "2026-07-19T11:15:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/reconciliation-exceptions/:id/reopen`

- **Permission:** `sp.cash.exceptions.assign`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "reason": "Bank reversed fee"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "exceptionId": "cexc_01HBRK",
    "id": "cexc_01HBRK",
    "batchId": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "clientOrVehicleId": "cli_sunrise_wealth",
    "category": "UNMATCHED_EXTERNAL",
    "severity": "MEDIUM",
    "status": "OPEN",
    "amountTxn": "50.00",
    "currencyTxn": "USD",
    "amountReporting": "50.00",
    "currencyReporting": "USD",
    "difference": {
      "transaction": {
        "amount": "50.00",
        "currency": "USD"
      },
      "reporting": {
        "amount": "50.00",
        "currency": "USD"
      }
    },
    "assignedToId": null,
    "assignedTo": null,
    "approverId": null,
    "approver": null,
    "ownerRole": "CashOperations",
    "slaDueAt": "2026-07-22T17:00:00.000Z",
    "resolutionJson": null,
    "ageDays": 0,
    "instrument": null,
    "tradeDate": null,
    "settleDate": null,
    "source": "STATEMENT_IMPORT",
    "counterparty": "CBZ",
    "version": 2,
    "createdAt": "2026-07-19T11:15:00.000Z",
    "updatedAt": "2026-07-19T11:15:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
## Reconciliation breaks

### `GET /api/investment-ops/reconciliation-breaks/:breakId`

- **Permission:** `sp.cash.reconciliation.view`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "breakId": "cbrk_01HVAR",
    "id": "cbrk_01HVAR",
    "batchId": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "status": "OPEN",
    "amount": "50.00",
    "currency": "USD",
    "category": "AMOUNT_VARIANCE",
    "comments": [],
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/reconciliation-breaks/:breakId/adjust-internal`

- **Permission:** `sp.cash.exceptions.propose`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "amount": "50.00",
  "reason": "Timing difference accepted",
  "expectedVersion": 1
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "breakId": "cbrk_01HVAR",
    "id": "cbrk_01HVAR",
    "batchId": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "status": "ADJUSTED",
    "amount": "50.00",
    "currency": "USD",
    "category": "AMOUNT_VARIANCE",
    "comments": [],
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/reconciliation-breaks/:breakId/mark-reviewed`

- **Permission:** `sp.cash.exceptions.assign`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "notes": "Reviewed - awaiting bank"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "breakId": "cbrk_01HVAR",
    "id": "cbrk_01HVAR",
    "batchId": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "status": "REVIEWED",
    "amount": "50.00",
    "currency": "USD",
    "category": "AMOUNT_VARIANCE",
    "comments": [],
    "version": 2
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/reconciliation-breaks/:breakId/create-manual-entry`

- **Permission:** `sp.cash.journals.create`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "postingPurpose": "ADJUSTMENT",
  "currency": "USD",
  "lines": [
    {
      "ledgerAccountCode": "CASH",
      "cashAccountId": "cca_sunrise_usd_001",
      "debit": "0",
      "credit": "50",
      "signedCashAmount": "-50",
      "currency": "USD"
    },
    {
      "ledgerAccountCode": "SUSPENSE",
      "debit": "50",
      "credit": "0",
      "signedCashAmount": "0",
      "currency": "USD"
    }
  ]
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "breakId": "cbrk_01HVAR",
    "journal": {
      "id": "cjnl_adj_01",
      "sourceSystem": "UAT",
      "sourceEventId": "settle-ord_buy_dlta_001",
      "postingPurpose": "ADJUSTMENT",
      "idempotencyKey": "uat:r1-jnl",
      "tradeDate": "2026-07-19T00:00:00.000Z",
      "settlementDate": "2026-07-19T00:00:00.000Z",
      "valueDate": "2026-07-19T00:00:00.000Z",
      "postingBusinessDate": null,
      "currency": "USD",
      "status": "DRAFT",
      "makerId": "usr_maker",
      "checkerId": "usr_checker",
      "reversalOf": null,
      "cashAccountId": "cca_sunrise_usd_001",
      "portfolioId": "SPF-SUNRISE-001",
      "rejectReason": null,
      "version": 3,
      "postedAt": "2026-07-19T10:20:00.000Z",
      "auditHash": "sha256:abc...",
      "lines": [
        {
          "id": "cjl_1",
          "ledgerAccountCode": "CASH",
          "cashAccountId": "cca_sunrise_usd_001",
          "beneficialOwnerId": null,
          "debit": "0.00",
          "credit": "3005.00",
          "signedCashAmount": "-3005.00",
          "currency": "USD",
          "description": "Trade settlement outflow",
          "matchStatus": "UNMATCHED",
          "residualAmount": null,
          "lineVersion": 1
        },
        {
          "id": "cjl_2",
          "ledgerAccountCode": "BROKER_CLEARING",
          "cashAccountId": null,
          "beneficialOwnerId": null,
          "debit": "3005.00",
          "credit": "0.00",
          "signedCashAmount": "0.00",
          "currency": "USD",
          "description": "Broker clearing",
          "matchStatus": "UNMATCHED",
          "residualAmount": null,
          "lineVersion": 1
        }
      ],
      "createdAt": "2026-07-19T10:15:00.000Z",
      "updatedAt": "2026-07-19T10:20:00.000Z"
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/reconciliation-breaks/:breakId/comments`

- **Permission:** `sp.cash.exceptions.assign`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "comment": "Checking with CBZ ops"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "breakId": "cbrk_01HVAR",
    "id": "cbrk_01HVAR",
    "batchId": "creb_01HREC",
    "cashAccountId": "cca_sunrise_usd_001",
    "status": "OPEN",
    "amount": "50.00",
    "currency": "USD",
    "category": "AMOUNT_VARIANCE",
    "comments": [
      {
        "text": "Checking with CBZ ops",
        "actorId": "usr_ops",
        "createdAt": "2026-07-19T12:00:00.000Z"
      }
    ],
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
## Cash periods / GL exports

### `POST /api/investment-ops/cash-periods/:period/precheck`

- **Permission:** `sp.cash.close.precheck`
- **Headers:** `Authorization: Bearer <token>`
- **Notes:** `:period` = `YYYY-MM`

**Request body**

```json
{
  "legalEntityId": "le_arcus",
  "periodFrom": "2026-07-01"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "legalEntityId": "le_arcus",
    "periodCode": "2026-07",
    "periodFrom": "2026-07-01T00:00:00.000Z",
    "periodTo": "2026-07-31T00:00:00.000Z",
    "canClose": false,
    "blockerCount": 2,
    "blockers": [
      {
        "code": "OPEN_EXCEPTIONS",
        "severity": "BLOCKING",
        "value": "1",
        "owner": "CashOperations",
        "remediation": "Close or approve open exceptions",
        "remediationLink": "/api/investment-ops/reconciliation-exceptions"
      },
      {
        "code": "MISSING_STATEMENT",
        "severity": "BLOCKING",
        "cashAccountId": "cca_sunrise_usd_001",
        "owner": "CashOperations",
        "remediation": "Import and commit statement",
        "remediationLink": "/api/investment-ops/external-statements/imports"
      }
    ]
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/cash-periods/:period/close`

- **Permission:** `sp.cash.close.execute`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "legalEntityId": "le_arcus",
  "periodFrom": "2026-07-01",
  "controlTotals": {}
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cpc_01HJUL",
    "legalEntityId": "le_arcus",
    "periodCode": "2026-07",
    "periodFrom": "2026-07-01T00:00:00.000Z",
    "periodTo": "2026-07-31T00:00:00.000Z",
    "status": "CLOSED",
    "closeVersion": 1,
    "controlTotals": {
      "blockerCount": 0
    },
    "blockers": [],
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "closedAt": "2026-08-02T09:00:00.000Z",
    "createdAt": "2026-08-02T09:00:00.000Z",
    "updatedAt": "2026-08-02T09:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/cash-periods/:period/reopen-request`

- **Permission:** `sp.cash.close.reopen`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "legalEntityId": "le_arcus",
  "reason": "Late fee booking"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cpc_01HJUL",
    "legalEntityId": "le_arcus",
    "periodCode": "2026-07",
    "periodFrom": "2026-07-01T00:00:00.000Z",
    "periodTo": "2026-07-31T00:00:00.000Z",
    "status": "REOPEN_REQUESTED",
    "closeVersion": 1,
    "controlTotals": {
      "blockerCount": 0
    },
    "blockers": [],
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "closedAt": "2026-08-02T09:00:00.000Z",
    "createdAt": "2026-08-02T09:00:00.000Z",
    "updatedAt": "2026-08-02T09:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/cash-periods/:period/restate`

- **Permission:** `sp.cash.close.execute`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "legalEntityId": "le_arcus",
  "reason": "Restate after fee correction"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cpc_01HJUL",
    "legalEntityId": "le_arcus",
    "periodCode": "2026-07",
    "periodFrom": "2026-07-01T00:00:00.000Z",
    "periodTo": "2026-07-31T00:00:00.000Z",
    "status": "CLOSED",
    "closeVersion": 2,
    "controlTotals": {
      "blockerCount": 0
    },
    "blockers": [],
    "makerId": "usr_maker",
    "checkerId": "usr_checker",
    "closedAt": "2026-08-02T09:00:00.000Z",
    "createdAt": "2026-08-02T09:00:00.000Z",
    "updatedAt": "2026-08-02T09:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/cash-gl-exports`

- **Permission:** `sp.cash.gl.export`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "legalEntityId": "le_arcus",
  "periodCloseId": "cpc_01HJUL",
  "controlTotals": {
    "uat": true
  }
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cglx_01HEXP",
    "periodCloseId": "cpc_01HJUL",
    "legalEntityId": "le_arcus",
    "status": "SUCCEEDED",
    "controlTotals": {
      "uat": true
    },
    "externalPostingRef": "GL-POST-202607-001",
    "attemptCount": 1,
    "idempotencyKey": "uat:r3-gl",
    "lastError": null,
    "createdAt": "2026-08-02T09:05:00.000Z",
    "updatedAt": "2026-08-02T09:05:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/cash-gl-exports/:id`

- **Permission:** `sp.cash.gl.export`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cglx_01HEXP",
    "periodCloseId": "cpc_01HJUL",
    "legalEntityId": "le_arcus",
    "status": "SUCCEEDED",
    "controlTotals": {
      "uat": true
    },
    "externalPostingRef": "GL-POST-202607-001",
    "attemptCount": 1,
    "idempotencyKey": "uat:r3-gl",
    "lastError": null,
    "createdAt": "2026-08-02T09:05:00.000Z",
    "updatedAt": "2026-08-02T09:05:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/cash-gl-exports/:id/retry`

- **Permission:** `sp.cash.gl.export`
- **Headers:** `Authorization`, `Idempotency-Key` (required)
- **Notes:** Safe retry - same externalPostingRef when already succeeded

**Request body**

```json
{}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cglx_01HEXP",
    "periodCloseId": "cpc_01HJUL",
    "legalEntityId": "le_arcus",
    "status": "SUCCEEDED",
    "controlTotals": {
      "uat": true
    },
    "externalPostingRef": "GL-POST-202607-001",
    "attemptCount": 2,
    "idempotencyKey": "uat:r3-gl",
    "lastError": null,
    "createdAt": "2026-08-02T09:05:00.000Z",
    "updatedAt": "2026-08-02T09:05:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
## Client statements

### `GET /api/investment-ops/client-statements`

- **Permission:** `sp.cash.statements.view`
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `cashAccountId=&clientOrVehicleId=&status=&page=1&pageSize=50`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "ccst_01HQ1",
        "runId": "ccsr_01HQ1",
        "openingCash": "10000.00",
        "closingCash": "6995.00",
        "sections": {
          "movements": [],
          "fees": [],
          "settlements": []
        },
        "checksum": "sha256:stmt...",
        "status": "APPROVED",
        "approvedById": "usr_checker",
        "approvedAt": "2026-07-19T14:00:00.000Z",
        "version": 2,
        "createdAt": "2026-07-19T13:50:00.000Z",
        "updatedAt": "2026-07-19T14:00:00.000Z",
        "run": {
          "id": "ccsr_01HQ1",
          "clientOrVehicleId": "cli_sunrise_wealth",
          "cashAccountId": "cca_sunrise_usd_001",
          "periodFrom": "2026-07-01T00:00:00.000Z",
          "periodTo": "2026-07-19T00:00:00.000Z",
          "statementType": "PERIODIC",
          "currency": "USD",
          "status": "APPROVED"
        }
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/client-statements/summary`

- **Permission:** `sp.cash.statements.view`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "draft": 1,
    "pendingApproval": 0,
    "approved": 4,
    "delivered": 3
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/client-statements/generate`

- **Permission:** `sp.cash.statements.generate`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "cashAccountId": "cca_sunrise_usd_001",
  "clientOrVehicleId": "cli_sunrise_wealth",
  "currency": "USD",
  "periodFrom": "2026-07-01",
  "periodTo": "2026-07-19",
  "statementType": "PERIODIC"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ccst_01HQ1",
    "runId": "ccsr_01HQ1",
    "openingCash": "10000.00",
    "closingCash": "6995.00",
    "sections": {
      "movements": [],
      "fees": [],
      "settlements": []
    },
    "checksum": "sha256:stmt...",
    "status": "DRAFT",
    "approvedById": null,
    "approvedAt": null,
    "version": 1,
    "createdAt": "2026-07-19T13:50:00.000Z",
    "updatedAt": "2026-07-19T14:00:00.000Z",
    "run": {
      "id": "ccsr_01HQ1",
      "clientOrVehicleId": "cli_sunrise_wealth",
      "cashAccountId": "cca_sunrise_usd_001",
      "periodFrom": "2026-07-01T00:00:00.000Z",
      "periodTo": "2026-07-19T00:00:00.000Z",
      "statementType": "PERIODIC",
      "currency": "USD",
      "status": "APPROVED"
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/client-statements/:id`

- **Permission:** `sp.cash.statements.view`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "ccst_01HQ1",
    "runId": "ccsr_01HQ1",
    "openingCash": "10000.00",
    "closingCash": "6995.00",
    "sections": {
      "movements": [],
      "fees": [],
      "settlements": []
    },
    "checksum": "sha256:stmt...",
    "status": "APPROVED",
    "approvedById": "usr_checker",
    "approvedAt": "2026-07-19T14:00:00.000Z",
    "version": 2,
    "createdAt": "2026-07-19T13:50:00.000Z",
    "updatedAt": "2026-07-19T14:00:00.000Z",
    "run": {
      "id": "ccsr_01HQ1",
      "clientOrVehicleId": "cli_sunrise_wealth",
      "cashAccountId": "cca_sunrise_usd_001",
      "periodFrom": "2026-07-01T00:00:00.000Z",
      "periodTo": "2026-07-19T00:00:00.000Z",
      "statementType": "PERIODIC",
      "currency": "USD",
      "status": "APPROVED"
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/client-statements/:id/preview`

- **Permission:** `sp.cash.statements.view`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "statementId": "ccst_01HQ1",
    "previewHtml": "<html>...Sunrise Wealth cash statement...</html>",
    "openingCash": "10000.00",
    "closingCash": "6995.00"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/client-statements/:id/approve`

- **Permission:** `sp.cash.statements.approve`
- **Headers:** `Authorization: Bearer <token>`

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
    "id": "ccst_01HQ1",
    "runId": "ccsr_01HQ1",
    "openingCash": "10000.00",
    "closingCash": "6995.00",
    "sections": {
      "movements": [],
      "fees": [],
      "settlements": []
    },
    "checksum": "sha256:stmt...",
    "status": "APPROVED",
    "approvedById": "usr_checker",
    "approvedAt": "2026-07-19T14:00:00.000Z",
    "version": 2,
    "createdAt": "2026-07-19T13:50:00.000Z",
    "updatedAt": "2026-07-19T14:00:00.000Z",
    "run": {
      "id": "ccsr_01HQ1",
      "clientOrVehicleId": "cli_sunrise_wealth",
      "cashAccountId": "cca_sunrise_usd_001",
      "periodFrom": "2026-07-01T00:00:00.000Z",
      "periodTo": "2026-07-19T00:00:00.000Z",
      "statementType": "PERIODIC",
      "currency": "USD",
      "status": "APPROVED"
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/client-statements/:id/email`

- **Permission:** `sp.cash.statements.deliver`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

```json
{
  "to": "client.statements@example.com"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "statementId": "ccst_01HQ1",
    "delivery": {
      "channel": "EMAIL",
      "to": "client.statements@example.com",
      "status": "QUEUED"
    }
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/client-statements/:id/download`

- **Permission:** `sp.cash.statements.view`
- **Headers:** `Authorization: Bearer <token>`
- **Notes:** May return PDF binary or JSON with download URL depending on Accept

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "statementId": "ccst_01HQ1",
    "contentType": "application/pdf",
    "downloadUrl": "/api/investment-ops/client-statements/ccst_01HQ1/download?token=...",
    "checksum": "sha256:stmt..."
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
## Setup (cash-specific)

Cash setup catalogs under `/setup/providers|file-layouts|account-mappings|tolerance-policies|match-weight-policies`. Distinct from Investments V2 listed-equity reference catalogs (`/setup/brokers`, `/setup/currencies`, ...).

Activate any draft row via `POST /setup/:resource/:id/activate` where `:resource` is one of the five kebab names above.

### `GET /api/investment-ops/setup/providers`

- **Permission:** `sp.cash.setup.manage`
- **Headers:** `Authorization: Bearer <token>`
- **Query:** `page=1&pageSize=50&status=`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "prov_cbz_cash",
        "tenantId": "le_arcus",
        "code": "CBZ_CASH",
        "displayName": "CBZ Bank Cash Statements",
        "providerType": "BANK",
        "status": "ACTIVE",
        "version": 2,
        "createdAt": "2026-06-01T08:00:00.000Z",
        "updatedAt": "2026-06-01T09:00:00.000Z"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/setup/providers`

- **Permission:** `sp.cash.setup.manage`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "tenantId": "le_arcus",
  "code": "CBZ_CASH",
  "displayName": "CBZ Bank Cash Statements",
  "providerType": "BANK"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "prov_cbz_cash",
    "tenantId": "le_arcus",
    "code": "CBZ_CASH",
    "displayName": "CBZ Bank Cash Statements",
    "providerType": "BANK",
    "status": "DRAFT",
    "version": 1,
    "createdAt": "2026-06-01T08:00:00.000Z",
    "updatedAt": "2026-06-01T09:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/setup/file-layouts`

- **Permission:** `sp.cash.setup.manage`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clay_cbz_v1",
        "providerId": "prov_cbz_cash",
        "layoutCode": "CBZ_CSV_V1",
        "versionNo": 1,
        "status": "ACTIVE",
        "signMapJson": {
          "Debit": "NEGATIVE",
          "Credit": "POSITIVE"
        },
        "dateMapJson": {
          "valueDate": "value_date"
        }
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "totalPages": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/setup/file-layouts`

- **Permission:** `sp.cash.setup.manage`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "providerId": "prov_cbz_cash",
  "layoutCode": "CBZ_CSV_V1",
  "versionNo": 1,
  "signMap": {
    "Debit": "NEGATIVE",
    "Credit": "POSITIVE"
  },
  "dateMap": {
    "valueDate": "value_date"
  },
  "effectiveFrom": "2024-01-01"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "clay_cbz_v1",
    "providerId": "prov_cbz_cash",
    "layoutCode": "CBZ_CSV_V1",
    "versionNo": 1,
    "status": "DRAFT"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/setup/account-mappings`

- **Permission:** `sp.cash.setup.manage`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "cam_01",
        "providerId": "prov_cbz_cash",
        "layoutId": "clay_cbz_v1",
        "externalFingerprint": "fp...",
        "currency": "USD",
        "cashAccountId": "cca_sunrise_usd_001",
        "status": "ACTIVE",
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
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/setup/account-mappings`

- **Permission:** `sp.cash.setup.manage`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "providerId": "prov_cbz_cash",
  "layoutId": "clay_cbz_v1",
  "externalFingerprint": "sha256:provider|ext|USD",
  "currency": "USD",
  "cashAccountId": "cca_sunrise_usd_001",
  "effectiveFrom": "2024-01-01"
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "cam_01",
    "status": "DRAFT",
    "version": 1,
    "currency": "USD",
    "cashAccountId": "cca_sunrise_usd_001"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/setup/tolerance-policies`

- **Permission:** `sp.cash.setup.manage`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "tol_usd_1",
        "code": "USD_ONE_CENT",
        "currency": "USD",
        "amountTolerance": "1.00",
        "dateToleranceDays": 2,
        "status": "ACTIVE",
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
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/setup/tolerance-policies`

- **Permission:** `sp.cash.setup.manage`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "code": "USD_ONE_CENT",
  "currency": "USD",
  "amountTolerance": "1.00",
  "dateToleranceDays": 2
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "tol_usd_1",
    "code": "USD_ONE_CENT",
    "currency": "USD",
    "amountTolerance": "1.00",
    "dateToleranceDays": 2,
    "status": "DRAFT",
    "version": 1
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `GET /api/investment-ops/setup/match-weight-policies`

- **Permission:** `sp.cash.setup.manage`
- **Headers:** `Authorization: Bearer <token>`

**Request body**

_None_

**Response body**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "mwp_default",
        "code": "DEFAULT",
        "amountWeight": 0.4,
        "dateWeight": 0.25,
        "referenceWeight": 0.2,
        "counterpartyWeight": 0.15,
        "autoMatchThreshold": 0.9,
        "suggestThreshold": 0.7,
        "weakThreshold": 0.5,
        "status": "ACTIVE",
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
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/setup/match-weight-policies`

- **Permission:** `sp.cash.setup.manage`
- **Headers:** `Authorization`, `Idempotency-Key` (required)

**Request body**

```json
{
  "code": "DEFAULT",
  "amountWeight": 0.4,
  "dateWeight": 0.25,
  "referenceWeight": 0.2,
  "counterpartyWeight": 0.15,
  "autoMatchThreshold": 0.9,
  "suggestThreshold": 0.7,
  "weakThreshold": 0.5
}
```

**Response body**

```json
{
  "success": true,
  "data": {
    "id": "mwp_default",
    "code": "DEFAULT",
    "status": "DRAFT",
    "version": 1,
    "amountWeight": 0.4
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
### `POST /api/investment-ops/setup/:resource/:id/activate`

- **Permission:** `sp.cash.setup.manage`
- **Headers:** `Authorization: Bearer <token>`
- **Notes:** `:resource` ∈ `providers` | `file-layouts` | `account-mappings` | `tolerance-policies` | `match-weight-policies`. Example: `/setup/providers/{id}/activate`

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
    "id": "prov_cbz_cash",
    "tenantId": "le_arcus",
    "code": "CBZ_CASH",
    "displayName": "CBZ Bank Cash Statements",
    "providerType": "BANK",
    "status": "ACTIVE",
    "version": 2,
    "createdAt": "2026-06-01T08:00:00.000Z",
    "updatedAt": "2026-06-01T09:00:00.000Z"
  },
  "meta": {
    "requestId": "req-abc123",
    "serverTime": "2026-07-19T12:00:00.000Z"
  }
}
```

---
## Quick path index

| Group | Paths |
|-------|-------|
| Accounts | `/client-cash-accounts` |
| Position | `/cash-overview`, `/portfolios/:id/cash-position\|explanation\|projection` |
| Reservations | `/cash-reservations` |
| Ledger | `/cash-ledger`, `/cash-journals` |
| Imports | `/external-statements/imports` |
| Cash recon | `/reconciliation-batches`, `/reconciliation-rules/active`, `/fund-cash-summary` |
| Matches | `/matches` |
| Broker/custodian | `/broker-custodian/*` |
| Exceptions | `/reconciliation-exceptions` |
| Breaks | `/reconciliation-breaks` |
| Close / GL | `/cash-periods`, `/cash-gl-exports` |
| Client stmts | `/client-statements` |
| Setup | `/setup/providers\|file-layouts\|account-mappings\|tolerance-policies\|match-weight-policies` |

**Out of scope here:** `/api/investment-ops/reconciliation/*` (holdings/trade section 22).
