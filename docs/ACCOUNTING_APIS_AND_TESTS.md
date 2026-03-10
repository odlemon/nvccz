# Accounting APIs – Endpoints, Request/Response, Test Cases

---

## 1. Audit-Ready Cashbook Export

**Endpoint:** `GET /api/cashbook/export-audit`

**Request:** Query: `year` (required), `month` (required, 1–12), `bankId` (optional)

**Response:** Binary Excel file

**Test case:** Cashbook audit export

---

## 2. Revenue Receipting

**Endpoint:** Cashbook create receipt (e.g. `POST /api/cashbook/...` — existing cashbook entry that posts Dr Bank 1100 / Cr Income 4000)

**Request:** (Cashbook receipt payload)

**Response:** (Cashbook entry / receipt response)

**Test case:** Revenue receipting

---

## 3. Year-End Close

**Endpoint:** None (service only: `YearEndCloseService.runYearEndClose({ year })`). Optional future: `POST /api/accounting/year-end-close` body `{ "year": 2024 }`.

**Request:** `{ "year": number }` (if endpoint added)

**Response:** (closure result)

**Test case:** Year-end close 2024

---

## 4. Profit & Loss (P&L)

**Endpoints:**
- `POST /api/accounting/income-statement/generate`
- `GET /api/accounting/income-statement`

**Request:**  
- POST body: `{ "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "currencyId"?: string }`  
- GET query: `startDate`, `endDate`, optional `currencyId`, or `periodType`, `periodValue`

**Response:** P&L data (sections, totals, netIncomeBeforeTaxes, etc.)

**Test case:** P&L (Net Profit formula)

---

## 5. Balance Sheet

**Endpoints:**
- `POST /api/accounting/balance-sheet/generate`
- `GET /api/accounting/balance-sheet`

**Request:**  
- POST body: `{ "asOfDate": "YYYY-MM-DD", "currencyId"?: string }`  
- GET query: `asOfDate`, optional `currencyId`

**Response:** `{ data: { assets, liabilities, equity, isBalanced, totalLiabilitiesAndEquity, ... } }`

**Test case:** Balance sheet

---

## 6. VAT Report & VAT Output Audit Trail

**Endpoints:**
- `GET /api/vat/report`
- `GET /api/vat/report/output-tax-audit`

**Request:** Query: `startDate`, `endDate` (YYYY-MM-DD), optional `currencyId`

**Response:**  
- Report: input tax, output tax, net liability  
- Audit: `{ lines: [...], totalOutputTax, ... }`

**Test case:** VAT output audit trail

---

## 7. P&L with Budget Variance

**Endpoints:**
- `GET /api/accounting/income-statement/with-budget-variance`
- `POST /api/accounting/income-statement/with-budget-variance`

**Request:** Query or body: `startDate`, `endDate` (or `periodType`, `periodValue`), optional `currencyId`

**Response:** P&L with `budgetVariance` on lines: `budgetedAmount`, `actualAmount`, `variance`, `variancePercentage`, `isOverBudget`

**Test case:** Budget vs actual

---

## 8. Comparative P&L

**Endpoints:**
- `GET /api/accounting/income-statement/comparative/this-month-vs-last-month`
- `POST /api/accounting/income-statement/comparative`

**Request:**  
- GET query: optional `asOfDate`, `currencyId`  
- POST body: `{ "periods": [ { "startDate", "endDate", "currencyId"? }, ... ], "periodLabels"?: string[] }` (min 2 periods)

**Response:** `{ periods: [...], variance: { revenue: { dollarChange, percentChange }, expenses: {...}, netIncome: {...} }, lineItems?: [...] }`

**Test case:** Comparative P&L (this month vs last month)

---

## 9. Trial Balance (Hide Zero Balances)

**Endpoint:** `GET /api/accounting/trial-balance`

**Request:** Query: `date` | `startDate` & `endDate` | `periodType` & `periodValue`; **`hideZeroBalances`** (optional: `true` | `1`)

**Response:** Trial balance lines; when `hideZeroBalances=true`, zero-balance accounts omitted

**Test case:** Trial balance hide zero balances

---

## 11. Audit Trail (Sequential Integrity)

**Endpoints:**
- `GET /api/accounting/journal-entries/audit-trail/last-entries`
- `GET /api/accounting/journal-entries/audit-trail/verify-sequential`

**Request:** Query: `limit` (optional, default 10, max 100)

**Response:**  
- Last entries: `{ entries: [ { id, auditTrailSequenceNumber, referenceNumber, transactionDate, description, createdAt }, ... ], count }`  
- Verify: `{ entries, isSequential, expectedCount, gaps, message }`

**Test case:** Audit trail sequential integrity

---

## 12. System Audit Log

**Endpoints:**
- `GET /api/system-audit-log`
- `GET /api/system-audit-log/last-24-hours`

**Request:** Query (first only): `hours` (default 24), `action`, `entityType`, `limit` (default 200, max 500)

**Response:** `{ entries: [ { id, action, entityType, entityId, userId, user: {...}, ipAddress, userAgent, createdAt, summary }, ... ], total, hours? }`

**Test case:** System audit log (last 24 hours)

---

## 13. PO to Bill Conversion

**Endpoint:** `POST /api/accounting/purchase-invoices/from-purchase-order`

**Request:** Body: `{ "purchaseOrderId": string, "supplierInvoiceNumber": string, "dueDate"?: "YYYY-MM-DD" }`

**Response:** Created purchase invoice (vendor bill) with lines from PO

**Test case:** PO to Bill conversion

---

## 14. Accounting Dashboard (Committed Spend)

**Endpoint:** `GET /api/accounting/dashboard`

**Request:** Query: optional `currencyId`, `period`, `startDate`, `endDate`, etc.

**Response:** `{ data: { committedSpend: number, metrics, monthlyData, expenses, assets, liabilitiesEquity, ... } }`

**Test case:** Three-way match (committed spend)
