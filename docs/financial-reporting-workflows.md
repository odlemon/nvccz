# Financial Reporting Workflow Translation

## 1. Accounting Scenarios

### 1.1 Portfolio Performance Improves (Unrealized Gain)
| Line | Account Type | Account Code | Action | Amount | Rationale |
|------|--------------|--------------|--------|--------|-----------|
| 1 (Asset Increase) | Asset | 1502 – Investment Asset | **Debit** | $X | Debiting the investment asset increases its carrying value to the new fair value. |
| 2 (Gain Recognition) | Revenue / Equity | 4050 – Unrealized Gain on Investment | **Credit** | $X | Credit records the “paper” gain in income/equity. |

### 1.2 Portfolio Performance Declines (Unrealized Loss)
| Line | Account Type | Account Code | Action | Amount | Rationale |
|------|--------------|--------------|--------|--------|-----------|
| 1 (Loss Recognition) | Expense | 6050 – Unrealized Loss on Investment | **Debit** | $Y | Debiting expense increases the reported loss. |
| 2 (Asset Decrease) | Asset | 1502 – Investment Asset | **Credit** | $Y | Crediting the asset reduces its value to the new fair value. |

### 1.3 Cash Dividend Received (Realized Gain)
| Line | Account Type | Account Code | Action | Amount | Rationale |
|------|--------------|--------------|--------|--------|-----------|
| 1 (Cash Receipt) | Asset | 1000 – Bank / Cash | **Debit** | $Z | Increase cash balance. |
| 2 (Dividend Income) | Revenue | 4100 – Dividend Income | **Credit** | $Z | Recognize real income. |

> **Developer note:** Dividend receipts do **not** change the investment asset value (code 1502). They are separate cash income entries.

### Accounting Rule Reminders
- Debits must equal credits in each journal entry.
- Account behaviour follows the standard rule set: Assets/Expenses increase with debits; Liabilities/Revenue/Equity increase with credits.

### Chart of Accounts Check
Current seed data (`prisma/seedChartOfAccounts.ts`) **does not** include the following codes referenced above:
- `1502` – Investment Asset
- `4050` – Unrealized Gain on Investment
- `6050` – Unrealized Loss on Investment
- `4100` – Dividend Income
These need to be added to the chart of accounts before we can automate postings.

## 2. Technical Workflow (PMRAS Flows)

### Flow PMRAS-1: KPI Data Submission & Reporting
1. **Input (Investee Portal UI)** – Portfolio company submits KPI form and uploads management accounts. UI must enforce a `reportingPeriod` field (e.g., 2025-09-30) for historical accuracy.
2. **Storage (PMS Database)** – Data saved under `portfolioCompanies/{id}/quarterly_reports/{id}`; CIO dashboard reads from this collection.
3. **Update Logic (Cloud Function CF-PMRAS-1.1)** – Triggered by new report; updates the parent `portfolioCompanies/{id}` document with latest metrics and `lastReportDate`.

### Flow PMRAS-2: Investee Procurement Request Integration
1. **Request (Investee Portal UI)** – Investee submits procurement request (items, justification, amount). UI must embed `investeeId` and `fundId` in the payload.
2. **API Call (CF-PMRAS-2.1)** – Backend posts securely to Procurement module endpoint `/procurement/api/new_external_request` with originModule metadata.
3. **Processing (Procurement Module)** – Logs request as a new requisition, flags it as “External”, and routes for approval.
4. **Oversight Alert (Procurement Cloud Function)** – Sends push notification back to PMS for oversight tracking.

### Flow PMRAS-3: Valuation Adjustment & Accounting JE Sync
1. **Manual Trigger (CIO/Analyst UI)** – Analyst reviews performance, sets `newValuationAmount`, saves valuation document in `portfolioCompanies/{id}/valuations/{id}` with fields: `newAmount`, `previousAmount`, `valuationDate`.
2. **JE Generation (CF-PMRAS-3.2)** – Function fires on new valuation document, validates:
   - `valuationDate` must be after `portfolioCompanies/{id}.lastReportDate`.
   - Difference = `newAmount - previousAmount`.
   - If positive → apply Scenario 1.1 logic (Debit 1502, Credit 4050).
   - If negative → apply Scenario 1.2 logic (Debit 6050, Credit 1502).
   - Abort with error/log if validations fail.

## 3. Performance Module Alignment
Relevant hardcoded KPIs (`src/config/hardcodedKPIs.ts`) to link with financial uploads:
- `TOTAL_REVENUE` (account 4000, credit) – ties to P&L revenue figures.
    - Could map to uploaded income statement totals.
- `NET_PROFIT` (account 3200, credit) – reflects profitability driving valuation decisions.
- `OPERATING_EXPENSES` (account 5090, debit) – aligns with expense lines in reports.
- `CASH_FLOW_NET` (account 1000, debit) – mirrors cashflow submissions.
- `ACCOUNTS_RECEIVABLE_OUTSTANDING` (account 1200, debit) – matches balance sheet AR.
- `ACCOUNTS_PAYABLE_OUTSTANDING` (account 2000, credit) – matches balance sheet AP.
- `PORTFOLIO_FAIR_VALUE` (account 1502, debit) – set automatically when valuation adjustments are approved.
- `UNREALIZED_GAIN_LOSS` (account 4050, credit) – tracks valuation differences (negative values reflect losses).
- `DIVIDEND_INCOME` (account 4100, credit) – updated each time a dividend is recorded.

These KPIs can be populated automatically once the applicant’s data is parsed, ensuring the performance dashboards stay synchronized with reported financials.

## 4. Next Steps / Validation Items
- **Accounting:** add missing chart-of-account codes (1502, 4050, 6050, 4100) and confirm mapping in the journal automation.
- **Performance:** map parsed financial metrics to the hardcoded KPIs above; ensure `reportingPeriod` and `lastReportDate` updates remain consistent.
- **Workflow:** implement Cloud Functions/queue workers according to PMRAS flows so approvals trigger the appropriate automations.
- **Automation Trigger:** When the investment team approves a submission through `/portfolio-companies/{id}/financial-reports/{reportId}/review` (action=`ACCEPT`), include the valuation/dividend mapping payload so the background job posts journals and updates KPIs automatically. Optional fallback endpoints (`POST /api/portfolio-companies/{id}/valuation-adjustments` and `/api/portfolio-companies/{id}/dividends`) remain available for manual overrides.

Everything aligns with the provided documentation: investees supply data, the fund approves valuations, and our system handles KPI updates plus the accounting entries once the necessary accounts are present.
