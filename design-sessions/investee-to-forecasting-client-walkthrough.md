# Investee → Investor → Forecasting Engine — Client Walkthrough

Brief demo script with **exact values to enter** at every step. Use this while clicking through the UI.

---

## Demo cast (logins)

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| **Investor / admin** | `admin@nts.com` | `admin123` | Opens calendar, reviews, forecasting |
| **Investee (portfolio company)** | `karatakundai@gmail.com` | `password123` | Application portal only |

| Entity | Value |
|--------|-------|
| **Portfolio company** | **Test Company** |
| **Fund** | **ZimFund** |
| **Forecast legal entity** | **Default Entity** |

> Investees do **not** use Finance → Forecasting. They use **Application portal → Reports** (`/application-portal/reports`).

---

## Recommended reporting period (use one period end-to-end)

| Field | Value |
|-------|-------|
| **Reporting period** | `2026-12-31` |
| **Period type** | `MONTHLY` |
| **Period start** | `2026-12-01` |
| **Period end** | `2026-12-31` |
| **Due date** (when opening calendar) | `2027-01-15` |
| **Grid period column** (after accept) | `2026-12` |

If `2026-12-31` is already submitted for Test Company, pick the next open month (e.g. `2027-01-31`) and shift **period start/end** and **grid column** to match that month.

---

## Part 0 — Investor prep: open reporting calendar

**Who:** `admin@nts.com`  
**Where:** Portfolio companies → Reporting (open calendar / request for data)

### Step 0.1 — Mandatory attachments (multi-select)

Pick **at least one** from the catalog, e.g.:

- **Operational KPIs** (formats: xlsx, pdf)

### Step 0.2 — Open the period

| Field | Enter |
|-------|-------|
| Reporting period | `2026-12-31` |
| Due date | `2027-01-15` |
| Phase | `REQUEST` (default) |
| Mandatory attachments | Operational KPIs (selected above) |

**Expected:** Success message; investees notified. Test Company sees the period as **open** in the portal.

---

## Part 0b — Investor prep: forecasting scenario (do once per fund demo)

**Who:** `admin@nts.com`  
**Where:** Finance → Forecasting → Create scenario

Skip if an **ACTIVE** scenario already exists for **ZimFund** on **Default Entity**. Otherwise create one:

### Step 0b.1 — Scenario identity

| Field | Enter |
|-------|-------|
| **Name** | `Client Demo — ZimFund 2026` |
| **Legal entity** | `Default Entity` |
| **Fund** | `ZimFund` |
| **Base currency** | `USD` |
| **Granularity** | `MONTHLY` |
| **Horizon start date** | `2026-01-01` |
| **Horizon end date** | `2026-12-31` |

### Step 0b.2 — Account dimensions (multi-select)

Select at least:

| Type | Value to select | Label in UI |
|------|-----------------|-------------|
| `ACCOUNT` | `COA_RANGE_REVENUE` | Revenue (accounts 4000–4999) |

**Recommended for a fuller grid demo** (add these too):

| Type | Value to select | Label in UI |
|------|-----------------|-------------|
| `ACCOUNT` | `COA_RANGE_OPEX` | Operating expense (5000–5999) |
| `PORTFOLIO_COMPANY` | `Test Company` | Portfolio company slice |

### Step 0b.3 — Promote to ACTIVE

| Field | Enter |
|-------|-------|
| **Status** | `ACTIVE` |

**Expected:** Scenario appears in list with badge **ACTIVE**. Fund = **ZimFund**, entity = **Default Entity**.

---

## Part 1 — Investee: submit operational KPIs

**Who:** `karatakundai@gmail.com`  
**Where:** Application portal → Reports (`/application-portal/reports`)

### Step 1.1 — Choose period

| Field | Enter |
|-------|-------|
| Reporting period | `2026-12-31` |
| Report type | **Operational KPIs** |

### Step 1.2 — Report header

| Field | Enter |
|-------|-------|
| Title | `December 2026 Operational KPIs` |
| Description | `Client demo submission` |
| Period type | `MONTHLY` |
| Period start | `2026-12-01` |
| Period end | `2026-12-31` |

### Step 1.3 — Operational KPI values

| Field | Enter |
|-------|-------|
| Monthly recurring revenue (MRR) | `20833.33` |
| Customer count at period end | `120` |
| Churn rate | `0.02` (2%) |

### Step 1.4 — Save and submit

1. **Save draft**  
   **Expected:** Status **DRAFT**; you can still edit.

2. **Submit for review**  
   **Expected:** Status **PENDING**; investee cannot edit until investor sends back.

---

## Part 2 — Investor: review and accept

**Who:** `admin@nts.com`  
**Where:** Portfolio companies → **Test Company** → Financial reports (or reporting inbox)

### Step 2.1 — Find the report

| Filter | Value |
|--------|-------|
| Portfolio company | `Test Company` |
| Reporting period | `2026-12-31` |
| Status | `PENDING` |

### Step 2.2 — Review and accept

| Field | Enter |
|-------|-------|
| **Action** | `ACCEPT` |
| **Comment** | `Accepted for client demo — forecast dispatch` |
| **Total revenue** | `250000` |
| **Net profit** | `42000` |
| **Cash flow (net)** | `33600` (optional; 80% of net profit) |

**Expected:**

- Report status → **ACCEPTED**
- Revenue/profit stored on the report
- Backend pushes data into forecasting (**PORTFOLIO_DISPATCH**) — no visible button; happens on accept

---

## Part 3 — Forecasting engine: verify portfolio dispatch

**Who:** `admin@nts.com`  
**Where:** Finance → Forecasting

### Step 3.1 — Open scenario

| Field | Select |
|-------|--------|
| Scenario | `Client Demo — ZimFund 2026` (or your ACTIVE ZimFund scenario) |
| Status | `ACTIVE` |

### Step 3.2 — Grid filters

| Filter | Select |
|--------|--------|
| Fund | `ZimFund` |
| Portfolio company | `Test Company` |
| Period column | `2026-12` |
| Analytical tag (if shown) | `PORTFOLIO_DISPATCH` |

### Step 3.3 — Expected cell values (approximate)

Dispatch maps accepted figures to the **first revenue** and **first expense** accounts on Default Entity:

| Account (COA) | Period | Expected source | Expected value (USD tx) |
|---------------|--------|-----------------|-------------------------|
| `4000` Management Fees Income (Revenue) | `2026-12` | Accepted **total revenue** | `250000` |
| `5000` Rent Expense (Expense) | `2026-12` | Derived from **net profit** | `42000` |

> Values may differ slightly if FX projection applies (scenario base currency vs USD). Tag should show **PORTFOLIO_DISPATCH**.

**Expected:** Grid loads HTTP 200; portfolio company slice shows populated cells for `2026-12`. Audit trail (if exposed) shows action **PORTFOLIO_DISPATCH** linked to the accepted report.

---

## Part 4 — Optional: drivers and formulas (investor planning demo)

**Who:** `admin@nts.com`  
**Where:** Forecasting → scenario → **Drivers** tab

Use the same scenario: `Client Demo — ZimFund 2026`.

### Step 4.1 — CAGR revenue driver

| Field | Enter |
|-------|-------|
| Target account range start | `4000` |
| Target account range end | `4999` |
| Driver type | `CAGR_DRIVEN` |
| Formula expression | `HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t` |
| Parameter: `cagr_scalar` | `0.08` (8% growth) |
| Parameter: `historical_base` | `250000` |
| Parameter: `tx_currency` | `USD` |

**Expected:** Future months after `2026-12` recalculate upward from the base; cascade/spinner on affected cells.

### Step 4.2 — Headcount / OpEx driver (optional second row)

| Field | Enter |
|-------|-------|
| Target account range start | `5000` |
| Target account range end | `5000` |
| Driver type | `HEADCOUNT_GROWTH` |
| Formula expression | `parameters.headcount * (1 + parameters.growth_rate)^t * parameters.cost_per_head` |
| Parameter: `headcount` | `42` |
| Parameter: `growth_rate` | `0.03` |
| Parameter: `cost_per_head` | `2850` |
| Parameter: `tx_currency` | `USD` |

**Expected:** OpEx line projects forward with headcount growth.

### Step 4.3 — Manual cell override (optional)

**Where:** Forecast grid workspace

| Field | Enter |
|-------|-------|
| Period | `2027-01` |
| Account | `4000` Management Fees Income |
| Portfolio company filter | `Test Company` |
| New forecast value | `275000` |
| Transaction currency | `USD` |

**Expected:** Cell shows manual override; dependent formula cells may recalc on save.

---

## End-to-end pass/fail checklist

| # | Step | Pass if… |
|---|------|----------|
| 1 | Open calendar `2026-12-31` | Test Company sees period **open** |
| 2 | Investee submits KPIs | Status **PENDING** |
| 3 | Investor **ACCEPT** | Status **ACCEPTED**; revenue `250000`, profit `42000` |
| 4 | Forecast grid (ACTIVE, ZimFund) | **Test Company** row has `2026-12` cells; tag **PORTFOLIO_DISPATCH** |
| 5 | (Optional) Driver save | Future periods recalculate |

---

## One-line story for the client

> The portfolio company submits through **Investee Reporting**; when the investor **accepts**, that data flows into the **Forecasting Engine** on the **ZimFund** scenario, where the VC plans and monitors performance alongside GL actuals.

---

## Reference — COA lines on Default Entity (for grid orientation)

| Account no | Name | Type |
|------------|------|------|
| 4000 | Management Fees Income | Revenue |
| 4001 | Management Fees Income | Revenue |
| 4002 | Performance Fees (Carried Interest) | Revenue |
| 4010 | Investment Gains | Revenue |
| 4020 | Other Income | Revenue |
| 5000 | Rent Expense | Expense |
| 5010 | Office Supplies Expense | Expense |
| 5020 | Bank Charges | Expense |

---

## Production note (internal)

Before demo on production, ensure these backend fixes are deployed and the API restarted:

- `src/services/ForecastingPortfolioDispatchService.ts`
- `src/services/FinancialReportService.ts`

No database migration required for that fix.
