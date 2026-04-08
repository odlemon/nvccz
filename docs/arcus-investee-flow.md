# Arcus Investee Reporting & Accounting Integration (V3 SRD Synthesis)

## Goals
- Collect periodic KPI + financial statements from investees with strict reporting-period stamping and document organization.
- Enable NVCCZ (fund) review/approval with auditable trail.
- Drive portfolio dashboards (KPIs, AUM, trends) and trigger accounting entries for valuation changes and dividends after approvals.
- Provide hooks for procurement requests initiated by investees.
- Ship with clear onboarding (user guide/FAQ), reminders, and future-ready doc parsing (out of current scope).
- Enforce double-entry correctness and account-type rules at the accounting API boundary.

## End-to-End Workflow
- **PMRAS-1 KPI Submission**
  - Investee logs into Arcus portal, sees open reporting request, fills KPI web form, attaches required files (prefer XLSX; PDFs allowed for narrative/compliance).
  - Required field: `reportingPeriod` (date: e.g., 2025-09-30). Block submit if missing.
  - On submit, backend writes to `portfolioCompanies/{id}/quarterly_reports/{reportId}` with KPIs + file metadata; updates parent `portfolioCompanies/{id}` with `latestMetrics`, `lastReportDate`.
  - Optional reminder emails before/after due date.
  - Late/invalid: flag submissions missing required docs; support resubmit after rejection.

- **PMRAS-1 Document Rules**
  - Filename pattern: `[YYYY-MM]_[CompanyName]_[DocType]_vNN.ext`.
  - Required categories: Income Statement, Balance Sheet, Cash Flow, Bank Statements, Tax/Compliance (PDF ok), Management Accounts, Business Plan/Proposals (narrative + 3–5y actuals & forecasts).
  - Validation: ensure required categories present; financial statements preferably XLSX; reject “image-only” PDFs for financials; ensure non-empty key fields.
  - Foldering/tags: Financial (IS, BS, CF, bank, tax, audits, management accounts), Operational (HR/payroll, sales, inventory, production), Investment (business plans, investor reports, compliance). Tag by period + company for retrieval.

- **PMRAS-2 External Procurement Request**
  - UI form in investee portal (items, justification, amount); hidden `investeeId`, `fundId`.
  - Backend CF-PMRAS-2.1 posts to Procurement API `/procurement/api/new_external_request` with `originModule: "PMS"`.
  - Procurement module logs requisition, flags as external, sends notification back to PMS; analyst/CIO alerted.

- **Review & Approval**
  - NVCCZ staff reviews KPI values and files; may request resubmission.
  - Approved KPI values sync to dashboards; manual verification remains in scope (no auto parsing yet).

- **PMRAS-3 Valuation Adjustment → Accounting JE**
  - CIO/Analyst sets `newAmount`, `previousAmount`, `valuationDate` in `portfolioCompanies/{id}/valuations/{valuationId}` (immutable record).
  - CF-PMRAS-3.2 guardrails:
    - Reject if `valuationDate <= lastReportDate`.
    - `difference = newAmount - previousAmount`.
    - If `difference > 0`: Debit 1502 Investment Asset, Credit 4050 Unrealized Gain.
    - If `difference < 0`: Debit 6050 Unrealized Loss, Credit 1502 Investment Asset.
  - Sends balanced JE JSON to Accounting API `/accounting/api/post_journal_entry` with `totalDebit == totalCredit`, `date`, `description`, `lines`.
  - Implements retry with exponential backoff; logs success/error.
  - Writes returned `accountingJEId` back to `valuations/{valuationId}`.
  - Immutable source: valuation record remains read-only after create; updates only add linkage/status.

- **Dividend Recording (Realized Income)**
  - Triggered when fund receives dividend and records it in PMS.
  - JE: Debit 1000 Cash/Bank, Credit 4100 Dividend Income. No change to 1502.
  - Endpoint: reuse `/accounting/api/post_journal_entry`.

- **Data & Dashboard**
  - KPI derivations (manual or later automated parsing):
    - From IS: Revenue, COGS, Gross Profit, Operating Profit, EBITDA, Net Profit, margins.
    - From BS: Total Assets, Liabilities, Equity, Working Capital, liquidity ratios.
    - From CF/Bank: Operating CF, Burn Rate, Runway, cash balances, variance checks.
    - From bank vs cashflow: variance check to reconcile stated cash vs bank flows.
  - Portfolio dashboard tiles: Total Portfolio Value (AUM), AUM Growth/CAGR, Sector/Asset Composition, Number of Investments, Deployment Rate, Diversification Score, return metrics (ROI/IRR/MOIC/TVPI/DPI), alerts (rev decline, negative CF, rising debt/liquidity risks).
  - Remove/de-emphasize “Total Requested Value”; move recent disbursements to ops view.
  - Waterfalls/time-series: revenue and profit trend lines; comparative bars; portfolio concentration views.

## KPI Library (from SRD)
- **Financial**: Gross Profit Margin ( (Revenue-COGS)/Revenue ), Net Profit Margin (NI/Revenue), EBITDA Margin (EBITDA/Revenue), Burn Rate (avg monthly outflow), Cash Runway (Cash/Monthly Burn), Current Ratio (CA/CL), Quick Ratio ((Cash+AR)/CL), Debt-to-Equity, Interest Coverage (EBIT/Interest), Revenue Growth Rate (ΔRev/Prev Rev), ROA (NI/Assets), ROE (NI/Equity).
- **Operational**: CAC, LTV, LTV/CAC, Churn Rate, MRR, Net Dollar Retention, Unit Contribution, Inventory Turnover, Conversion Rate, Customer Retention Rate.
- **Auto-derived targets**: IS/BS/CF line items feed KPIs above; bank statements feed cash balance/variance.

## API Surface (proposed/confirmed)
- **PMS (Investee Portal)**
  - `POST /api/applicant/financial-reports` – upload KPIs + files (requires `reportingPeriod`).
  - `POST /api/applicant/financial-reports/submit` – mark draft reports PENDING.
  - `POST /api/applicant/financial-reports/period-kpis` – save KPI values for a period.
  - `GET  /api/applicant/financial-reports` – list own submissions.
  - `POST /api/applicant/procurement-requests` → proxy to `/procurement/api/new_external_request`.
  - `GET /api/applicant/financial-reports/template/:type` – download Excel/CSV template per type.
- **PMS (Internal)**
  - `POST /api/portfolio-companies/{id}/financial-reports/{reportId}/review` – approve/reject with mapping and KPI overrides.
  - `POST /api/portfolio-companies/{id}/valuations` – create valuation adjustment record.
  - `POST /api/portfolio-companies/{id}/dividends` – record dividend (realized income).
- **Accounting Module**
  - `POST /accounting/api/post_journal_entry` – accepts balanced JE (fields: date, description, lines[{accountCode,debitAmount,creditAmount}], totalDebit, totalCredit).
  - JE Example (gain): date, desc “Unrealized Gain on [PC] Valuation Adjustment”, lines: `{accountCode:1502, debit: X, credit:0}`, `{accountCode:4050, debit:0, credit:X}`.
  - JE Example (loss): `{accountCode:6050, debit:Y, credit:0}`, `{accountCode:1502, debit:0, credit:Y}`.
  - JE Example (dividend): `{accountCode:1000, debit:Z, credit:0}`, `{accountCode:4100, debit:0, credit:Z}`.

## Data Model Notes
- `portfolioCompanies/{id}`: `latestMetrics`, `lastReportDate`, links to `valuations`, `quarterly_reports`.
- `quarterly_reports/{id}`: KPIs, files[], `reportingPeriod`, status (DRAFT|PENDING|ACCEPTED|REJECTED|NEEDS_REVISION).
- `valuations/{id}`: `newAmount`, `previousAmount`, `valuationDate`, `difference`, `accountingJEId`.
- `dividends/{id}`: `amount`, `dividendDate`, `accountingJEId`.

## Validation & Guardrails
- Require `reportingPeriod` on all KPI/file submissions.
  - Enforce filename pattern; ensure required document categories uploaded; reject image-only financial PDFs; prefer XLSX for statements.
  - JE balance rule (Debit == Credit) and account-type rule enforced by Accounting API.
  - Valuation guard: only accept dates after `lastReportDate`.
- Reminders: email alerts before/after due dates; consistent calendar (e.g., first week post quarter-end).
- Procurement payload must include `originModule: "PMS"`, `investeeId`, `fundId`.
- Late/missing docs tracked; resubmission path must retain audit trail of timestamps/status changes.
- Storage: tag files by period/company; keep mapping snapshot (if provided) with review for traceability.

## Capital Call & Reporting Notifications (Image Spec)
- **Capital Call (Fund Alpha 10% call)**
  - Step 1: Executive initiates call; system computes pro‑rata per LP from commitments; creates record in `capitalCalls`; expected: per‑LP amounts stored.
  - Step 2: Generate Call Notice PDF with LP Name, Total Commitment, Uncalled Capital, Current Call Amount, Payment Due Date, Bank Instructions; expected: PDF available.
  - Step 3: Email dispatch (“Send Notices”); subject “Capital Call Notice , Fund Alpha , [Date]”; expected: every LP receives email.
  - Step 4: Accounting booking: create JE Debit 1210 Capital Contributions Receivable, Credit 3010 Partners Capital, Uncalled; expected: JE created.
  - Step 5: Payment receipt tracking: record partial $20k on a $50k call; expected: capitalCall status remains Partially Paid; dashboard shows uncalled balance reduced by $20k.

- **Reporting Reminders & Escalation**
  - Step 1: Analyst triggers ‘Request for Data’ for a reporting period (e.g., Q1 2024) from Reporting Calendar; expected: all active portfolio companies get automated notification; investee portal status → Reporting Open.
  - Step 2: Email composition: subject/email to investee CEO/CFO includes reporting period, due date (e.g., 15 Apr), link to Arcus webform, list of required Excel/PDF attachments.
  - Step 3: T‑minus 3 gentle reminder if status is Not Started/Draft.
  - Step 4: T+1 Overdue alert escalates; red highlight; “Urgent: Overdue Report” email to investee and assigned analyst.
  - Step 5: Manual Nudge button on portfolio dashboard sends custom note to investee; include analyst notes in body.
  - Step 6: Notification log audit: timeline shows request, T‑3 reminder, T‑1 overdue, manual nudge with timestamps.
  - Step 7: Read‑receipt tracking: when investee opens portal after email, status updates to Viewed by Investee so analyst sees successful receipt.
