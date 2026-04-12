# Investee Reporting (Frontend user story)

This doc is the **single place** for frontend/integration: **environment configuration**, **reporting calendar behaviour**, **all HTTP endpoints**, and the **step-by-step user flow**. Request/response **schemas and examples** are in **Swagger** (`/api-docs` or your deployed spec).

## Actors

- **Investee (Applicant / investee portal)**: sees open periods, uploads documents, saves KPIs, submits for review.
- **Investor/Admin (NVCCZ staff / Invesa)**: opens reporting periods, sends reminders and manual nudges, views communication history, lists and reviews submissions, browses the document tree.

---

## Configuration — server (environment variables)

| Variable | Role in this flow |
|----------|---------------------|
| **`FRONTEND_URL`** | Base URL for links in reporting emails (no trailing slash required). Investee deep link is **`{FRONTEND_URL}/application-portal/reports`**. |
| **`REPORTING_REMINDERS_CRON_SECRET`** | If **set**: reporting **cron/public** routes (reminders **and** schedule tick) require header **`X-Reporting-Reminders-Cron-Secret`**: **POST** `/api/cron/reporting/reminders`, **POST** `/api/public/reporting/reminders`, **POST** `/api/cron/reporting/schedule-tick`, **POST** `/api/public/reporting/schedule-tick`. If **unset**, those endpoints accept calls from **localhost only** (shared helper in `ReportingRemindersCronController`). |
| **`PORT`** | API listen port (e.g. `3009`); your UI/Postman base URL must match. |
| Email / SMTP | Reporting mail uses the same **investment** sender config as other modules (`EMAIL_FROM_NAME_INVESTMENT`, transport in `email.config` — see repo env template). |

**CORS:** If the browser calls the reminder triggers from another origin, the API must allow header **`X-Reporting-Reminders-Cron-Secret`** (already listed in `app.ts` when applicable).

---

## Configuration — database

- Notification and read-receipt events live in **`reporting_notification_logs`** (MySQL).  
- **One-time / env setup:** run  
  `npm run db:migrate:reporting-notification-logs`  
  (`scripts/run-reporting-notification-logs-migration.ts`) if the table is missing.
- **Reporting schedule definitions** live in **`reporting_schedule_configs`** (cadence, due-date offsets, default mandatory-attachment ids, reminders-only vs auto-open). Run  
  `npm run db:migrate:reporting-schedule-configs`  
  (`scripts/run-reporting-schedule-configs-migration.ts`) if the table is missing. After any **`prisma/schema.prisma`** change for this area, run **`npx prisma generate`** so the client matches MySQL.
- Each email stores **`meta`** JSON including (when present): `dueDate`, `emailSubject`, `emailHtml`, `mandatoryAttachments`, `recipientSource` (`PRIMARY_FINANCIAL_CONTACT` vs `PORTAL_USER`), `contactPerson`, etc.

---

## Configuration — portfolio company (primary financial contact)

Reporting emails (Tier 1–3 + nudge) resolve the **To** address as:

1. **`portfolio_companies.contactEmail`** if it looks like an email → treated as **primary financial contact / CFO-style**; greeting / MIME display name uses **`contactPerson`** when set.  
2. Else **`users.email`** for the linked portal account.

**Analyst setup:** keep **`contactEmail`** / **`contactPerson`** accurate for each investee (admin UI or API).

- **PUT** `/api/portfolio-companies/:portfolioCompanyId` — update company fields including **`contactEmail`**, **`contactPerson`** (auth per route: admin/applicant; use **admin** for staff-maintained CFO data). See Swagger for full body.

Eligible companies for broadcast reminders are those with **`status`** in **`ACTIVE`** or **`APPROVED`**.

---

## Configuration — reporting calendar rules (product behaviour)

| Rule | Behaviour |
|------|-----------|
| **One calendar open per period** | **POST** `/api/portfolio-companies/reporting/requests` with default **`phase: REQUEST`** returns **409** if a **`REQUEST`** row already exists for that **`reportingPeriod`**. Same-period duplicate **`REQUEST`** is also rejected inside the reminder runner if triggered with **`phase: REQUEST`** without going through the admin open flow. |
| **Mandatory attachments** | Opening the calendar (**Tier 1**) requires **`attachmentOptionIds`** (multi-select from **GET** `.../mandatory-attachment-options`) or explicit **`mandatoryAttachments`** array. Stored on logs and echoed in email. |
| **Investee “reporting open”** | **GET** `/api/applicant/reporting/requests` returns **`portalStatus`: `REPORTING_OPEN`** vs **`SUBMITTED`**; read receipt uses **`VIEWED_BY_INVESTEE`** logs (see Step 1). |
| **Tier 2 / Tier 3 without cron** | Use **POST** `/api/public/reporting/reminders` or **POST** `/api/cron/reporting/reminders` with **`phase`**: **`T_MINUS_3`** or **`OVERDUE`** (no JWT; secret or localhost). |
| **Reporting frequency (monthly / quarterly / …)** | **Optional automation:** admins maintain **`reporting_schedule_configs`** (MONTHLY / QUARTERLY / YEARLY / CUSTOM). A **schedule tick** (**POST** `/api/cron/reporting/schedule-tick` or **POST** `/api/public/reporting/schedule-tick`) evaluates active configs and may open the calendar (REQUEST) and/or run AUTO reminder tiers for periods already opened. **Manual** opening still uses **POST** `/api/portfolio-companies/reporting/requests` (Step 0) when you are not relying on the tick. |

**`GET` calendar list response:** **`GET`** `/api/portfolio-companies/reporting/calendar` returns **`data.periods`** (full per-period snapshot: due date, attachment list, notification counts, submission counts, portal URL) and **`data.meta`** (`totalPeriods`, **`eligiblePortfolioCompanies`**, `limit`, `offset`). Use **`GET`** `.../calendar/detail?reportingPeriod=` for sample **HTML** email of one period.

---

## Recommended integration order (quick reference)

1. Configure **`.env`**: at least **`FRONTEND_URL`**; for server testing of tiers 2–3 without localhost, set **`REPORTING_REMINDERS_CRON_SECRET`**.  
2. Ensure DB table: **`reporting_notification_logs`**.  
3. **Admin login** → **GET** mandatory-attachment options → **POST** open reporting **`requests`** (multi-select **`attachmentOptionIds`**).  
4. **Investee** → **GET** reporting **`requests`** → upload / submit flow.  
5. **Admin** → **GET** reporting **`calendar`** (dashboard) and **`reporting-audit`** / **`communicationLog`** per company.  
6. Optional: **POST** **public** or **cron** **`/reporting/reminders`** for **T_MINUS_3** / **OVERDUE**; **POST** **`.../reporting/nudge`** for manual nudge.
7. Optional automation: create **schedule configs** (JWT) → run **`/cron/reporting/schedule-tick`** or **`/public/reporting/schedule-tick`** (secret or localhost) on your cadence; see **Automation — reporting schedule** below and **Swagger** (multiple **request body examples**).

---

## Conventions

- API base: e.g. `https://your-api-host/api` or `http://localhost:3009/api` (must match **`PORT`**).  
- JWT: `Authorization: Bearer <token>` on all routes **except** the two reminder trigger URLs (they use the **shared secret** or localhost rule above).  
- **Swagger:** canonical list of required fields, enums, and **Try it out** examples for **`/reporting/requests`** (multi-select examples), **`/portfolio-companies/reporting/schedule-configs`** (create/update examples), and **`/cron/reporting/schedule-tick`** / **`/public/reporting/schedule-tick`** (empty body vs `asOfDate`). Production serves the same merged spec at **`/api-docs`** (align **Try it out** base URL with the **`servers`** entry for your environment so paths do not double-prefix `/api`).

---

## Step 0 — Admin opens a reporting period (prerequisite)

Broadcasts the period to investees who have not yet submitted for that **`reportingPeriod`** (emails + **`REQUEST`** rows in `reporting_notification_logs`). Each open request must include **which mandatory attachments apply** — either as catalog ids from a **multi-select** or as an explicit list (see Swagger).

1. **Load rows for the mandatory-attachment multi-select**  
   - **GET** `/api/portfolio-companies/reporting/mandatory-attachment-options`  
   - Response: `data.options` = `[{ id, name, formats }, ...]`.  
   - **Reporting Calendar / open-period UI:** present these as a **multi-select** control (e.g. checklist, multi-select dropdown, or chip list). The analyst must choose **one or more** options.

2. **Open the calendar (Request for data)**  
   - **POST** `/api/portfolio-companies/reporting/requests`  
   - Body: **`reportingPeriod`**, **`dueDate`**, and **either**:  
     - **`attachmentOptionIds`**: string array of selected **`id`** values from step 1 (**recommended**), or  
     - **`mandatoryAttachments`**: `[{ name, formats }, ...]` if not using the catalog.  
   - If **`attachmentOptionIds`** is present and non-empty, it takes precedence. Optional **`phase`** (default **`REQUEST`**).  
   - **Swagger:** includes **examples** (`multiSelectAllCatalog`, `multiSelectSubset`, `explicitNameFormats`) and an **`enum`** on each `attachmentOptionIds` item so “Try it out” can pick valid ids.

**Optional — list calendar periods or inspect email copy**

- **GET** `/api/portfolio-companies/reporting/calendar?limit=200&offset=0`  
  Response: **`data.periods`** (full rows per period — due dates, notification tier counts, mandatory attachments snapshot, submission counts) and **`data.meta`** (`totalPeriods`, `eligiblePortfolioCompanies`, pagination).
- **GET** `/api/portfolio-companies/reporting/calendar/detail?reportingPeriod=YYYY-MM-DD` — sample HTML email for one period.

---

## Step 0b — Admin: manual nudge (lagging company)

Immediate email to **that** portfolio company’s investee with **custom analyst text** in the body. Logged as **`MANUAL_NUDGE`** (visible in reporting audit **`communicationLog`**).

- **POST** `/api/portfolio-companies/:portfolioCompanyId/reporting/nudge`  
  Body: `reportingPeriod`, `dueDate`, **`message`** (or **`notes`**). Optional **`attachmentOptionIds`** (same multi-select ids as Step 0) or **`mandatoryAttachments`**; otherwise the standard full list is used.

---

## Step 1 — Investee: what’s due + read receipt (“Viewed by investee”)

**List open periods** (after Step 0 exists for that period):

- **GET** `/api/applicant/reporting/requests`

Loading this endpoint for an **OPEN** period records a **`VIEWED_BY_INVESTEE`** notification log row (deduplicated within a short window so polling does not flood the log). Analysts see it in **`GET .../reporting-audit`** → **`communicationLog`**.

**Optional** (e.g. home/dashboard deep link from email with period in the URL):

- **GET** `/api/applicant/dashboard?reportingPeriod=YYYY-MM-DD`  
  Same read-receipt logging when `reportingPeriod` is a valid date (also deduplicated).

---

## Step 2 — Investee: period-level KPIs (optional but common before files)

Aggregate summary for the period:

- **POST** `/api/applicant/financial-reports/period-kpis`

Per-statement period saves (when UI splits by statement):

- **POST** `/api/applicant/financial-reports/period-kpis/income-statement`
- **POST** `/api/applicant/financial-reports/period-kpis/balance-sheet`
- **POST** `/api/applicant/financial-reports/period-kpis/cash-flow`

### Step 2b — Operational / non-financial KPIs (draft → submit, like other reports)

Operational KPIs are a **`financial_reports`** row with **`reportType`: `OPERATIONAL_KPIS`**: create a **DRAFT** (fast), optionally **PATCH** `data`, then **submit** manually. **KPI tables and derived metrics** (`reporting_period_operational_kpis`, `financialKpis.derived`) update **on submit only**, not on draft save—same pattern as statement drafts.

| Step | Endpoint |
|------|----------|
| **Create draft (canonical)** | **POST** `/api/applicant/financial-reports/operational-kpis/draft` — body includes `reportingPeriod`, `periodType`, `periodStart`, `periodEnd`, `title`, and **`data.operational`** (all keys below; **0** if N/A). |
| **Create draft (flat alias)** | **POST** `/api/applicant/financial-reports/period-operational-kpis` — same **`operational`** shape; optional `title` (default title is generated). |
| **Edit draft** | **PATCH** `/api/applicant/financial-reports/:reportId/data` with `{ "data": { "operational": { ... } } }` |
| **Submit** | **POST** `/api/applicant/financial-reports/submit/{reportId}` — e.g. `http://localhost:3009/api/applicant/financial-reports/submit/af74f256-b38e-4779-ac17-e71cc3ec7a4a`. Sets **PENDING** (period bundle) and syncs operational KPIs + recomputes when the bundle includes **`OPERATIONAL_KPIS`**. |
| **Read persisted + derived** | **GET** `/api/applicant/financial-reports/period-kpis/summary?periodEnd=YYYY-MM-DD` — **`operational`** from DB after submit; **`derived`** when present. |

**Contract (`operational`):** include **every** field below (numeric **`0`** when not applicable). Omitted keys are stored as **0** when the draft is normalized. Churn: decimal `0.05` = 5%; values `> 1` treated as percent. Full field list and **Swagger** examples: tag **Financial Reporting**.

| Field | Meaning |
|-------|--------|
| `churnRate` | Churn as decimal (e.g. `0.05` = 5%); values `> 1` are treated as percent (`5` → `0.05`). |
| `customerCountAtPeriodStart` | Customers / subscribers at period start. |
| `customerCountAtPeriodEnd` | Customers / subscribers at period end. |
| `customersLost` | Customers lost in the period. |
| `newCustomersCount` | New customers acquired (CAC denominator). |
| `monthlyRecurringRevenue` | MRR (subscription models). |
| `averageRevenuePerCustomerPerMonth` | ARPU per month (LTV-related). |
| `salesAndMarketingSpend` | S&M spend for the period; if `> 0`, overrides statement-derived proxy for CAC numerator. |
| `leadOrVisitorCount` | Leads or visitors (conversion denominator). |
| `customersFromLeads` | Customers from funnel (conversion numerator). |
| `averageSellingPricePerUnit` | ASP (unit economics). |
| `variableCostPerUnit` | Variable cost per unit (unit contribution). |
| `averageInventory` | Average inventory when needed for turnover alongside COGS. |
| `revenueFromExistingCustomersThisPeriod` | Same-cohort revenue this period (net dollar retention numerator). |
| `priorPeriodRevenueFromExistingCustomers` | Same-cohort revenue prior period (NDR denominator). |

**Example — canonical draft create (`POST .../operational-kpis/draft`):**

```json
{
  "reportingPeriod": "2025-03-31",
  "periodType": "QUARTERLY",
  "periodStart": "2025-01-01",
  "periodEnd": "2025-03-31",
  "title": "Operational KPIs — Q1 2025",
  "data": {
    "operational": {
      "churnRate": 0.02,
      "customerCountAtPeriodStart": 1180,
      "customerCountAtPeriodEnd": 1245,
      "customersLost": 24,
      "newCustomersCount": 89,
      "monthlyRecurringRevenue": 138500,
      "averageRevenuePerCustomerPerMonth": 425.5,
      "salesAndMarketingSpend": 192000,
      "leadOrVisitorCount": 12500,
      "customersFromLeads": 89,
      "averageSellingPricePerUnit": 149.99,
      "variableCostPerUnit": 62.4,
      "averageInventory": 480000,
      "revenueFromExistingCustomersThisPeriod": 1060000,
      "priorPeriodRevenueFromExistingCustomers": 1000000
    }
  }
}
```

**Example — flat alias (`POST .../period-operational-kpis`):** same **`operational`** object as above plus **`periodStart`** / **`periodEnd`** at the top level (no `data` wrapper).

**DB:** after **submit**, payloads live in **`reporting_period_operational_kpis`**. Migration: `npm run db:migrate:reporting-period-operational-kpis`.

---

## Step 3 — Investee: uploads and drafts

**Full upload** (multipart: `file` / `files`, plus `reportType`, `reportingPeriod`, period fields, etc. — see Swagger):

- **POST** `/api/applicant/financial-reports`

**Draft-first** (core statements — then attach files with Step 3b; operational KPIs are JSON-only):

- **POST** `/api/applicant/financial-reports/income-statement/draft`
- **POST** `/api/applicant/financial-reports/balance-sheet/draft`
- **POST** `/api/applicant/financial-reports/cash-flow/draft`
- **POST** `/api/applicant/financial-reports/operational-kpis/draft` — Step 2b; no file.
- **POST** `/api/applicant/financial-reports/draft` — **deprecated**; prefer the typed draft routes above.

**Templates** (optional):

- **GET** `/api/applicant/financial-reports/template/:reportType`

---

## Step 3b — Investee: attach file to draft / replace file

- **POST** `/api/applicant/financial-reports/file` — `multipart/form-data`, field **`file`** (use when report id is implied by server rules for the draft).
- **POST** `/api/applicant/financial-reports/:reportId/file` — same, scoped to **`reportId`**.

Core financial statement uploads: **`.xlsx`** only (income statement, balance sheet, cash flow). Other report types may allow PDF per Swagger.

---

## Step 4 — Investee: “My reports” list

- **GET** `/api/applicant/financial-reports?page=1&limit=50`

Each item includes `status`, `reviewerComment`, `reviewedAt`, and flags like `canSubmit` / `canUploadFile` for **DRAFT**, **NEEDS_REVISION**, **REJECTED** flows.

---

## Step 5 — Investee: one report detail + fix after NEEDS_REVISION / REJECTED

1. **GET** `/api/applicant/financial-reports/:reportId`

2. Replace file and/or JSON line items:

   - **POST** `/api/applicant/financial-reports/:reportId/file` — `multipart/form-data`, field **`file`**

   - **PATCH** `/api/applicant/financial-reports/:reportId/data` — body `{ "data": { ... } }` (shape matches `reportType`)

Status stays **NEEDS_REVISION** / **REJECTED** / **DRAFT** until submit (Step 6).

---

## Step 6 — Investee: submit reporting period for review

Any one report in the period can anchor submit; backend submits the **bundle** for that company + **`reportingPeriod`**.

Use this single URL shape (replace host/port and `reportId`):

- **POST** `/api/applicant/financial-reports/submit/{reportId}`  
  Example: **`POST`** `http://localhost:3009/api/applicant/financial-reports/submit/af74f256-b38e-4779-ac17-e71cc3ec7a4a`  
  Headers: **`Authorization: Bearer <investee JWT>`**. No JSON body required.

*(The server still accepts older variants—body `{ "reportId" }`, query `?reportId=`, or `/financial-reports/:reportId/submit`—for backward compatibility; new integrations should standardize on **`/submit/{reportId}`** above.)*

---

## Step 7 — Admin: list company submissions

- **GET** `/api/portfolio-companies/:portfolioCompanyId/financial-reports?page=1&limit=50`

---

## Step 8 — Admin: download a stored report file (optional)

- **GET** `/api/portfolio-companies/:portfolioCompanyId/financial-reports/:reportId/download`  
  Staff-only in API (see Swagger / route guards).

---

## Step 9 — Admin: document library (folder tree)

Returns one company’s files in the **Financial / Operational / Investment** tree (non-draft by default; optional filters).

- **GET** `/api/portfolio-companies/:portfolioCompanyId/document-organisation`  
  Optional query: `status` (comma-separated, e.g. `PENDING,ACCEPTED`), `limit`.

---

## Step 10 — Admin: reporting audit + communication timeline

**Operational audit** (submissions, uploads, period KPI saves, staff reviews): events from **`audit_logs`**.

**Communication audit** (emails + portal read receipt): **`communicationLog`** from **`reporting_notification_logs`** — original request, T−3 reminder, overdue alert, manual nudge, viewed-by-investee, with timestamps and labels.

- **GET** `/api/portfolio-companies/:portfolioCompanyId/reporting-audit?page=1&limit=50`

---

## Step 11 — Admin: accept / reject / needs revision (single review endpoint)

**POST** `/api/portfolio-companies/:portfolioCompanyId/financial-reports/:reportId/review` for all report types. The server uses **`reportType`** to decide whether accounting automation runs on **`ACCEPT`**.

### Operational KPIs and document-only reports (no GL automation on accept)

When **`reportType`** is **`OPERATIONAL_KPIS`**, **`NON_FINANCIAL_KPIS`**, **`BUSINESS_PLAN`**, **`BANK_STATEMENTS`**, **`TAX_COMPLIANCE`**, or **`MANAGEMENT_ACCOUNTS`**:

- Body: **`action`**: **`ACCEPT`** (optional **`comment`**, optional KPI fields). **No** valuation/dividend payload required; if one is sent, it is **ignored** (no GL journals from this action).
- **Effect:** status → **ACCEPTED**; email/audit; for **`OPERATIONAL_KPIS`** re-syncs period operational KPIs + derived `financialKpis`; best-effort **`InvestmentMonitoringKpiService`** recompute for the period.

### Core financial statements (accounting path)

For **income statement**, **balance sheet / SOFP**, **cash flow** (and legacy **`BALANCE_SHEET`** / **`INCOME_STATEMENT`** / **`CASHFLOW_STATEMENT`**):

- **`ACCEPT`** requires the **valuation / dividend automation payload** per Swagger (posts to books when applicable).
- **`NEEDS_REVISION`** / **`REJECT`**: use `comment`; investee sees this via list/detail and email templates.

---

## Step 12 — Admin: portfolio dashboard (optional)

- **GET** `/api/portfolio/dashboard`  
  (Tiles/KPIs for the fund; not a substitute for per-company **`reporting-audit`**.)

---

## Automation — reminder tiers (Tier 2 / Tier 3) — no JWT

Auth and env for these URLs are documented under **Configuration — server** (`REPORTING_REMINDERS_CRON_SECRET`, `X-Reporting-Reminders-Cron-Secret`).  

**Recipient:** emails go to **`portfolio_companies.contactEmail`** when set (primary financial contact / CFO-style), otherwise the **portal user** email on the company account — see **Configuration — portfolio company**.

| Tier | Meaning | Typical trigger |
|------|---------|------------------|
| 1 | Initial “Request for data” / reporting open | **POST** `/api/portfolio-companies/reporting/requests` (admin JWT; calendar rules) |
| 2 | Gentle reminder (T−3) | **`phase`: `T_MINUS_3`** on the routes below |
| 3 | Overdue alert | **`phase`: `OVERDUE`** on the routes below |

**Manual nudge** (analyst / portfolio dashboard): **POST** `/api/portfolio-companies/:portfolioCompanyId/reporting/nudge` (admin JWT).

**Public test / no scheduler:** same body and **shared-secret** behaviour as cron — set **`REPORTING_REMINDERS_CRON_SECRET`** in `.env` and send header **`X-Reporting-Reminders-Cron-Secret`**. If unset, only **localhost** may call.



## Endpoint checklist (quick copy)

| Actor | Method | Path |
|--------|--------|------|
| Any | POST | `/api/auth/login` |
| Admin | PUT | `/api/portfolio-companies/:portfolioCompanyId` *(e.g. `contactEmail`, `contactPerson`)* |
| Admin | GET | `/api/portfolio-companies/reporting/mandatory-attachment-options` |
| Admin | POST | `/api/portfolio-companies/reporting/requests` |
| Admin | GET | `/api/portfolio-companies/reporting/schedule-configs` |
| Admin | POST | `/api/portfolio-companies/reporting/schedule-configs` |
| Admin | GET | `/api/portfolio-companies/reporting/schedule-configs/:id` |
| Admin | PUT | `/api/portfolio-companies/reporting/schedule-configs/:id` |
| Admin | DELETE | `/api/portfolio-companies/reporting/schedule-configs/:id` |
| Admin | GET | `/api/portfolio-companies/reporting/calendar` *(query `limit`, `offset`)* |
| Admin | GET | `/api/portfolio-companies/reporting/calendar/detail` *(query `reportingPeriod`)* |
| Admin | POST | `/api/portfolio-companies/:portfolioCompanyId/reporting/nudge` |
| Admin | GET | `/api/portfolio-companies/:portfolioCompanyId/financial-reports` |
| Admin | GET | `/api/portfolio-companies/:portfolioCompanyId/financial-reports/:reportId/download` |
| Admin | GET | `/api/portfolio-companies/:portfolioCompanyId/document-organisation` |
| Admin | GET | `/api/portfolio-companies/:portfolioCompanyId/reporting-audit` |
| Admin | POST | `/api/portfolio-companies/:portfolioCompanyId/financial-reports/:reportId/review` |
| Admin | GET | `/api/portfolio/dashboard` |
| Investee | GET | `/api/applicant/dashboard` *(optional `?reportingPeriod=` for read receipt)* |
| Investee | GET | `/api/applicant/reporting/requests` |
| Investee | POST | `/api/applicant/financial-reports/period-kpis` |
| Investee | POST | `/api/applicant/financial-reports/period-kpis/income-statement` |
| Investee | POST | `/api/applicant/financial-reports/period-kpis/balance-sheet` |
| Investee | POST | `/api/applicant/financial-reports/period-kpis/cash-flow` |
| Investee | POST | `/api/applicant/financial-reports/operational-kpis/draft` |
| Investee | POST | `/api/applicant/financial-reports/period-operational-kpis` *(alias: creates **DRAFT** only)* |
| Investee | GET | `/api/applicant/financial-reports/period-kpis/summary` *(query `periodEnd`)* |
| Investee | POST | `/api/applicant/financial-reports` |
| Investee | POST | `/api/applicant/financial-reports/income-statement/draft` |
| Investee | POST | `/api/applicant/financial-reports/balance-sheet/draft` |
| Investee | POST | `/api/applicant/financial-reports/cash-flow/draft` |
| Investee | POST | `/api/applicant/financial-reports/draft` *(deprecated)* |
| Investee | POST | `/api/applicant/financial-reports/file` |
| Investee | POST | `/api/applicant/financial-reports/:reportId/file` |
| Investee | GET | `/api/applicant/financial-reports` |
| Investee | GET | `/api/applicant/financial-reports/template/:reportType` |
| Investee | GET | `/api/applicant/financial-reports/:reportId` |
| Investee | PATCH | `/api/applicant/financial-reports/:reportId/data` |
| Investee | POST | `/api/applicant/financial-reports/submit/{reportId}` *(canonical)* |
| Investee | POST | `/api/applicant/procurement-requests` *(related)* |
| Ops / test | POST | `/api/public/reporting/reminders` *(no JWT; secret or localhost)* |
| Ops / test | POST | `/api/cron/reporting/reminders` *(same as above)* |
| Ops / test | POST | `/api/public/reporting/schedule-tick` *(no JWT; secret or localhost)* |
| Ops / test | POST | `/api/cron/reporting/schedule-tick` *(same as above)* |

---

## Login (not under `/api/applicant` or `/api/portfolio-companies`)

Frontends need a JWT before the routes above: **POST** `/api/auth/login` (see Swagger). Use the token for **investee** vs **admin** according to each route’s guards.

---

## Capital calls (LP drawdowns)

**Full specification (prerequisites, ordered REST flow, request bodies, responses, errors, ops):**  
**[`docs/capital-calls-lp-drawdowns.md`](./capital-calls-lp-drawdowns.md)**

**Swagger:** tag **Capital Calls (LP drawdowns)** — paths match the doc order; examples use concrete sample values (not placeholders).

**Quick map** (Bearer token):

| Order | Method | Path |
|-------|--------|------|
| 0a | POST | `/api/clients` — create LP + optional commitment (`fund_id`, `amount`, `currency`, `effective_date`; **admin**) |
| 0b | PUT | `/api/clients/{id}` — add/update commitment on existing LP (**admin**) |
| 1 | POST | `/api/funds/{fundId}/capital-calls` — initiate (body: `callPercent`, `paymentDueDate`, `transactionDate`, `bankInstructions`) |
| 2 | GET | `/api/funds/{fundId}/capital-calls` — list |
| 3 | GET | `/api/funds/{fundId}/capital-calls/lp-summary` — per-LP balances |
| 4 | GET | `/api/funds/{fundId}/capital-calls/{capitalCallId}` — detail |
| 5 | GET | `/api/funds/{fundId}/capital-calls/{capitalCallId}/allocations/{allocationId}/notice` — notice JSON |
| 6 | POST | `/api/funds/{fundId}/capital-calls/{capitalCallId}/send-notices` — HTML + PDF email |
| 7 | GET / POST | `.../allocations/{allocationId}/payments` — ledger + record payment |

**DB:** `npm run db:migrate:capital-calls`, `npm run db:migrate:capital-call-allocation-payments`, `npm run db:ensure:capital-call-accounts` (1210 / 3010). **IDs:** `npm run db:print:capital-call-postman`.

---

## See also (repo)

- **`docs/capital-calls-lp-drawdowns.md`** — capital calls deep dive.  
- **`docs/postman-investee-reporting-test-flow.md`** — Postman-style checklist and sample IDs.  
- **`docs/arcus-investee-flow.md`** — Higher-level workflow narrative (Arcus / PMRAS).  
- **Swagger** — OpenAPI for every path above; search tags **Financial Reporting** (includes schedule CRUD + schedule-tick examples), **Investee Reporting**, and **Capital Calls (LP drawdowns)**.
