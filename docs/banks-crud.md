# Banks CRUD (Cashbook)

Base URL: `/api/cashbook/banks`

Auth: All cashbook routes require `Authorization: Bearer <token>`.

All responses follow:

```json
{
  "success": true,
  "message": "…",
  "data": {},
  "timestamp": "2026-…"
}
```

---

## 1) List Banks

**GET** `/api/cashbook/banks`

### Query params

| Param             | Type    | Required | Description                                      |
| ----------------- | ------- | -------- | ------------------------------------------------ |
| `includeInactive` | boolean | No       | `true` = include `isActive=false` banks; default only active |

### Examples

```
GET /api/cashbook/banks
GET /api/cashbook/banks?includeInactive=true
```

### Response `data`

Array of `Bank` objects (each includes nested `currency` and `glAccount`).

```json
[
  {
    "id": "cmh5u1h3y0001unagy8qtrkng",
    "name": "Cash and Cash Equivalents",
    "accountNumber": "CASH-001",
    "currencyId": "cmh3bymy70000una4yk8leusu",
    "glAccountId": "cmh3c1dq80000unxkthh69y9g",
    "isActive": true,
    "currency": { "id": "…", "code": "USD", "name": "US Dollar", "symbol": "$" },
    "glAccount": { "id": "…", "accountNo": "1000", "accountName": "Cash and Cash Equivalents", "accountType": "Current Asset" }
  }
]
```

---

## 2) Create Bank

**POST** `/api/cashbook/banks`

### Request body

| Field           | Type    | Required | Description                          |
| --------------- | ------- | -------- | ------------------------------------ |
| `name`          | string  | Yes      | Bank account name                    |
| `accountNumber` | string  | Yes      | Unique bank account number           |
| `currencyId`    | string  | Yes      | `Currency.id`                        |
| `glAccountId`   | string  | Yes      | `ChartOfAccounts.id` (must be Current Asset or Fixed Asset) |
| `bankCode`      | string  | No       | Bank code (e.g. "CBZ")              |
| `branchCode`    | string  | No       | Branch code (e.g. "001")            |
| `isActive`      | boolean | No       | Default `true`                       |

### Validation rules

- `glAccountId` must exist and have `accountType` of `"Current Asset"` or `"Fixed Asset"`.
- `accountNumber` must be unique across all banks.
- `glAccountId` can only be linked to **one** bank (unique constraint).

### Example

```json
{
  "name": "CBZ",
  "accountNumber": "1234530",
  "currencyId": "cmh3bymy70000una4yk8leusu",
  "glAccountId": "cmh3c1fdt0001unxkqzzihy55"
}
```

### Response `data`

Created `Bank` object (includes `currency` and `glAccount`).

### Error examples

```json
{ "success": false, "message": "Missing required fields: name, accountNumber, currencyId, glAccountId" }
{ "success": false, "message": "GL account must be an asset type for bank accounts" }
{ "success": false, "message": "GL account is already associated with bank account \"Main Bank Account\". Each GL account can only be linked to one bank account." }
{ "success": false, "message": "Bank account with this account number already exists" }
```

---

## 3) Get Single Bank

**GET** `/api/cashbook/banks/:id`

### Path params

| Param | Type   | Description |
| ----- | ------ | ----------- |
| `id`  | string | `Bank.id`   |

### Response `data`

Single `Bank` object (includes `currency` and `glAccount`).

### Errors

- `404` — Bank account not found.

---

## 4) Update Bank

**PUT** `/api/cashbook/banks/:id`

### Path params

| Param | Type   | Description |
| ----- | ------ | ----------- |
| `id`  | string | `Bank.id`   |

### Request body (all optional)

| Field           | Type    | Description                          |
| --------------- | ------- | ------------------------------------ |
| `name`          | string  | New name                             |
| `accountNumber` | string  | New account number (must stay unique)|
| `currencyId`    | string  | New `Currency.id`                    |
| `glAccountId`   | string  | New `ChartOfAccounts.id`             |
| `isActive`      | boolean | Activate / deactivate                |

Same validation rules as Create (GL type check, uniqueness).

### Example

```json
{
  "name": "CBZ Updated",
  "isActive": true
}
```

### Response `data`

Updated `Bank` object.

### Errors

- `404` — Bank account not found.
- `400` — Validation error (duplicate account number, GL already linked, etc.).

---

## 5) Delete Bank (Soft Delete)

**DELETE** `/api/cashbook/banks/:id`

### Path params

| Param | Type   | Description |
| ----- | ------ | ----------- |
| `id`  | string | `Bank.id`   |

### Behavior

- Sets `isActive = false` and clears `glAccountId` (so that GL account can be reused).
- The bank row stays in the database.

### Response `data`

Updated `Bank` object (now inactive).

### Errors

- `404` — Bank account not found.

### To view deleted banks

```
GET /api/cashbook/banks?includeInactive=true
```

---

## Helper: Get GL Accounts Available for Bank

**GET** `/api/cashbook/gl-accounts?availableForBank=true`

Returns only `Current Asset` / `Fixed Asset` chart accounts **not** already linked to an existing bank. Use this when building the "create bank" form to populate the GL dropdown.
