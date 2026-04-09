# Postman test checklist — Investee Reporting workflow

Use this doc as the live “what we tested / what we didn’t” tracker.

## Known IDs / credentials (current DB)

- **Investee portfolio company**
  - **portfolioCompanyId**: `cml7udyen0016kt1bmo61s5c5`
  - **companyName**: `Vexma Tech`
  - **investee login email**: `veximagames@gmail.com`
  - **investee temp password**: `TempPostmanPass123!`

- **Admin (NVCCZ staff)**
  - **adminUserId**: `cmislgonq0001unfkpukqyiah`
  - **admin login email**: `admin@nts.com`
  - **admin password**: (use the real one you have; I did not reset it)

## Postman environment variables

- `BASE_URL` = e.g. `http://localhost:3000`
- `JWT` = investee JWT after login
- `ADMIN_JWT` = admin JWT after login

## Reporting period we’re testing

- `reportingPeriod` = `2026-03-31`
- `periodStart` = `2026-01-01`
- `periodEnd` = `2026-03-31`
- `dueDate` = `2026-04-15`

---

## Flow A — Admin opens reporting request (must happen first)

- [ ] **A1 Admin login (get `ADMIN_JWT`)**

**POST** `{{BASE_URL}}/auth/login`

```json
{
  "email": "admin@nts.com",
  "password": "PASTE_ADMIN_PASSWORD"
}
```

- [ ] **A2 Open reporting request for the period**

**POST** `{{BASE_URL}}/api/portfolio-companies/reporting/requests`

Headers:
- `Authorization: Bearer {{ADMIN_JWT}}`

```json
{
  "reportingPeriod": "2026-03-31",
  "dueDate": "2026-04-15",
  "phase": "REQUEST"
}
```

Expected:
- success true
- emails sent only to companies not yet submitted for that period
- `reporting_notification_logs` has `event_type = 'REQUEST'` rows

---

## Flow B — Investee sees open request, fills KPIs, uploads docs, submits

- [ ] **B1 Investee login (get `JWT`)**

**POST** `{{BASE_URL}}/auth/login`

```json
{
  "email": "veximagames@gmail.com",
  "password": "TempPostmanPass123!"
}
```

- [ ] **B2 Investee lists open reporting requests (should show OPEN)**

**GET** `{{BASE_URL}}/api/applicant/reporting/requests`

Headers:
- `Authorization: Bearer {{JWT}}`

Expected:
- item for `reportingPeriod=2026-03-31`
- status `OPEN` (until submit happens)
- dueDate populated from latest request

- [ ] **B3 (Optional) mark “Viewed by investee” audit trail**

**GET** `{{BASE_URL}}/api/applicant/dashboard?reportingPeriod=2026-03-31`

Headers:
- `Authorization: Bearer {{JWT}}`

Expected:
- a `VIEWED_BY_INVESTEE` row in `reporting_notification_logs` (non-blocking)

- [ ] **B4 Save KPI values for the reporting period**

**POST** `{{BASE_URL}}/api/applicant/financial-reports/period-kpis`

Headers:
- `Authorization: Bearer {{JWT}}`

```json
{
  "periodStart": "2026-01-01",
  "periodEnd": "2026-03-31",
  "totalRevenue": 100000,
  "netProfit": 12000,
  "cashFlowNet": 8000
}
```

Expected:
- success true
- blocked with clear error if admin did **not** open a request first

---

## Flow C — Upload required documents (7 categories)

All uploads:
- Method: **POST**
- URL: `{{BASE_URL}}/api/applicant/financial-reports`
- Headers: `Authorization: Bearer {{JWT}}`
- Body: **form-data**
  - `file` (File)
  - `reportType` (Text)
  - `reportingPeriod` (Text) = `2026-03-31`
  - `periodType` (Text) = `QUARTERLY`
  - `periodStart` (Text) = `2026-01-01`
  - `periodEnd` (Text) = `2026-03-31`
  - `title` (Text)

Required categories:

- [ ] **C1 INCOME_STATEMENTS** (xlsx/csv only)
  - `reportType=INCOME_STATEMENTS`
  - file: `.xlsx` preferred

- [ ] **C2 STATEMENT_OF_FINANCIAL_POSITION** (xlsx/csv only)
  - `reportType=STATEMENT_OF_FINANCIAL_POSITION`

- [ ] **C3 CASHFLOW_STATEMENTS** (xlsx/csv only)
  - `reportType=CASHFLOW_STATEMENTS`

- [ ] **C4 BANK_STATEMENTS** (pdf allowed)
  - `reportType=BANK_STATEMENTS`

- [ ] **C5 TAX_COMPLIANCE** (pdf allowed)
  - `reportType=TAX_COMPLIANCE`

- [ ] **C6 MANAGEMENT_ACCOUNTS** (pdf allowed)
  - `reportType=MANAGEMENT_ACCOUNTS`

- [ ] **C7 BUSINESS_PLAN** (pdf allowed)
  - `reportType=BUSINESS_PLAN`

Expected:
- PDFs rejected for IS/BS/CF categories
- stored name normalized (patterned) even if your local filename is “natural”

---

## Flow D — Submit (moves full period bundle to PENDING)

- [ ] **D1 List drafts and copy any single report id**

**GET** `{{BASE_URL}}/api/applicant/financial-reports?page=1&limit=50`

Headers:
- `Authorization: Bearer {{JWT}}`

Expected:
- returns `{ page, limit, items: [...] }`

- [ ] **D2 Submit (pass ONE reportId in the path; backend submits the whole period bundle)**

**POST** `{{BASE_URL}}/api/applicant/financial-reports/submit/PASTE_ONE_REPORT_ID_FROM_D1`

Example: `http://localhost:3009/api/applicant/financial-reports/submit/af74f256-b38e-4779-ac17-e71cc3ec7a4a`

Headers:
- `Authorization: Bearer {{JWT}}`

No body required (empty body is fine).

Expected:
- success true
- blocked if required categories missing for the period
- should set all draft docs for `reportingPeriod=2026-03-31` to `PENDING`

---

## Flow E — NVCCZ review (approve/reject/needs revision)

- [ ] **E1 Admin lists company reports (find PENDING reportId)**

**GET** `{{BASE_URL}}/api/portfolio-companies/cml7udyen0016kt1bmo61s5c5/financial-reports?page=1&limit=50`

Headers:
- `Authorization: Bearer {{ADMIN_JWT}}`

- [ ] **E2 Review**

**POST** `{{BASE_URL}}/api/portfolio-companies/cml7udyen0016kt1bmo61s5c5/financial-reports/{{REPORT_ID}}/review`

Headers:
- `Authorization: Bearer {{ADMIN_JWT}}`

Example ACCEPT:
```json
{
  "action": "ACCEPT",
  "comment": "Reviewed and accepted",
  "mapping": {}
}
```

Example NEEDS_REVISION:
```json
{
  "action": "NEEDS_REVISION",
  "comment": "Missing bank statement pages, please re-upload and resubmit",
  "mapping": {}
}
```

Example REJECT:
```json
{
  "action": "REJECT",
  "comment": "Values inconsistent with prior period",
  "mapping": {}
}
```

---

## Flow F — Reminders (automation)

- [ ] **F1 T-3 reminder (manual trigger)**

**POST** `{{BASE_URL}}/cron/reporting/reminders`

Headers:
- `X-Reporting-Reminders-Cron-Secret: {{REPORTING_REMINDERS_CRON_SECRET}}`

```json
{
  "reportingPeriod": "2026-03-31",
  "dueDate": "2026-04-15",
  "asOfDate": "2026-04-12",
  "phase": "T_MINUS_3"
}
```

- [ ] **F2 Overdue T+1 reminder**

```json
{
  "reportingPeriod": "2026-03-31",
  "dueDate": "2026-04-15",
  "asOfDate": "2026-04-16",
  "phase": "OVERDUE"
}
```

- [ ] **F3 Manual nudge (single company)**

**POST** `{{BASE_URL}}/api/portfolio-companies/cml7udyen0016kt1bmo61s5c5/reporting/nudge`

Headers:
- `Authorization: Bearer {{ADMIN_JWT}}`

```json
{
  "reportingPeriod": "2026-03-31",
  "dueDate": "2026-04-15"
}
```

