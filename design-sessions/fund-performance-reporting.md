# Automated Fund Performance Reporting & Email Distribution — frontend design session

This document is for **product and frontend implementation**. It describes **what users should see and do** in the Arcus **Automated Fund Performance Reporting & Email Distribution** module (US-3.5.1–US-3.5.4): GP operations console, template editor, distribution lists, delivery monitoring, and LP self-service portal. It intentionally **does not** list API routes or request bodies; wire screens to the backend contract in [`docs/fund-performance-reporting-backend-requirements.md`](../docs/fund-performance-reporting-backend-requirements.md).

---

## How to use this document

- Use this in a **design session** with the frontend developer before or alongside backend implementation.
- Each section mixes **user stories** with **UI expectations** and **roles**.
- **Backend alignment notes** flag where today's codebase already supports behaviour vs what is net-new.
- **Numeric display** uses monospaced fonts (JetBrains Mono) for TVPI, DPI, IRR, and capital account figures.
- Acceptance criteria traceability: see [Section 10](#10-acceptance-criteria--frontend-mapping).

---

## 1. Purpose and audience

### What this module is

The **Arcus Automated Fund Performance Reporting & Email Distribution Engine** programmatically compiles fund performance report packs (Investor vs Board level), stages PDFs, and distributes them to verified LP recipients via email (direct attachment or secure download link when >10MB). It decouples **report compilation** from **email transport** and enforces multi-tenant isolation per fund and recipient.

All backend APIs live under one Swagger module: **Fund Performance Reporting** (same pattern as **Forecasting Engine** and **Stock Price Collector**). See [Section 14](#14-api-contract-summary-frontend-handoff).

### Who uses it

| Role | Typical tasks |
|------|----------------|
| GP Operations Manager | Configure schedules, trigger on-demand runs, monitor progress |
| GP Chief Financial Officer | Maintain Investor vs Board templates, preview KPI sections |
| HR / System Administrator | Bind distribution lists to roles, audit list changes |
| Systems Engineer | Monitor delivery logs, bounces, retries |
| Limited Partner (portal) | View my reports, download PDFs, verify secure links |

### Scope — workspaces mapped to user stories

| Client section | User story | UI workspace |
|----------------|------------|--------------|
| **2.1** | US-3.5.1 — Schedule & on-demand runs | Run console |
| **2.2** | US-3.5.2 — Template-driven packaging | Template editor |
| **2.3** | US-3.5.3 — Permissioned distribution | Distribution list manager |
| **2.4** | US-3.5.4 — Mail monitoring & failover | Delivery status board |
| — | LP portal | My Performance Reports |

**Backend alignment note:** LPs are `Client` records today; v1 adds optional `Client.userId` linkage so LPs with `LIMITED_PARTNER` role can log in to the portal. Email distribution uses `Client.email` resolved from the user directory — no manual address override in runs.

---

## 2. Design tokens

| Token | Value | Usage |
|-------|-------|-------|
| Font (numeric columns) | **JetBrains Mono** | TVPI, DPI, RVPI, IRR, paid-in, distributions |
| Background primary | `#0F172A` | Console shell, email header |
| Surface / panel | `#1E293B` | Run cards, recipient table |
| Accent / primary action | `#6366F1` | Trigger run, Save template |
| Success / delivered | `#10B981` | DELIVERED, COMPILED |
| Warning | Amber | IN_PROGRESS, RETRYING, soft bounce |
| Danger | Red | FAILED, BOUNCED (hard), expired link |

**Density:** GP console tables are compact (32–36px rows). LP portal uses slightly larger spacing for readability on mobile.

---

## 3. Information architecture

### Placement

- Primary nav (GP): **Fund Operations → Performance Reporting**
- LP portal: **My Portal → Performance Reports**

### Sub-areas

| Area | Route suggestion | Story |
|------|------------------|-------|
| Run console | `/fund-reporting/runs` | US-3.5.1 |
| Run detail | `/fund-reporting/runs/:id` | US-3.5.1, US-3.5.4 |
| Schedules | `/fund-reporting/schedules` | US-3.5.1 |
| Templates | `/fund-reporting/templates` | US-3.5.2 |
| Distribution lists | `/fund-reporting/distribution-lists` | US-3.5.3 |
| Delivery logs | `/fund-reporting/runs/:id/logs` | US-3.5.4 |
| LP portal home | `/lp/performance-reports` | LP |
| LP report detail | `/lp/performance-reports/:jobId` | LP |

---

## 4. Workspace A — Run console (US-3.5.1)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  FUND PERFORMANCE REPORTING          Fund: Fund-II Alpha    [Trigger Run ▼] │
├─────────────────────────────────────────────────────────────────────────────┤
│  ACTIVE RUNS                                                                │
│  Run ID: 6c4d7b1a… | Q1 2026 | IN_PROGRESS  [████████░░░░] 71%              │
│  Targets: 42 | Compiled: 30 | Dispatched: 18 | Delivered: 12                │
├─────────────────────────────────────────────────────────────────────────────┤
│  SCHEDULES                                                                  │
│  Quarterly · 15th 08:00 CAT · Fund-II Alpha · Investor pack · [Edit]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**User story:** As GP Operations, I configure recurring schedules or trigger immediate runs for specific funds/cohorts.

**UI behaviour:**
- **Trigger New Run** modal: fund, template, period start/end, optional client cohort filter.
- Progress bar driven by `compiledCount / targetCount` from run detail API.
- Schedule editor: period type (Monthly, Quarterly, Semi-Annual, Annual), day-of-month, time, timezone.

---

## 5. Workspace B — Template editor (US-3.5.2)

**User story:** As CFO, I maintain Investor vs Board report templates with segregated sections.

| Template level | Sections (preview panes) |
|----------------|------------------------|
| **Investor** | Commitments, paid-in, distributions, holdings summary, DPI, TVPI, Net IRR |
| **Board** | Above + forecast variance, overhead breakdown, legal fee accruals, transaction expenses |

**UI behaviour:**
- Toggle **Investor** / **Board** baseline structure (read-only section list in v1; variable manifest from API).
- Live preview uses sample fund metrics (or selected fund dry-run).
- All KPI values labelled "sourced from ledger" — no hardcoded constants in UI.

---

## 6. Workspace C — Distribution lists (US-3.5.3)

**User story:** As System Admin, I bind distribution lists to roles and audit changes.

- List name, fund, source type: **ROLE** (e.g. LIMITED_PARTNER) or **COMMITMENT_COHORT**.
- Recipient grid: legal name, verified email, user link status.
- **No manual email override** in run UI — disabled field with tooltip "Address must match user directory".
- Audit trail drawer: author, timestamp, JSON diff on each list save.

---

## 7. Workspace D — Delivery status board (US-3.5.4)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  DISTRIBUTION & DELIVERY STATUS — Run 6c4d7b1a…                             │
├──────────────────────────┬────────────┬──────────────────┬──────────────────┤
│ Recipient                │ PDF        │ Transport        │ Status           │
├──────────────────────────┼────────────┼──────────────────┼──────────────────┤
│ institutional@omz.co.zw  │ COMPILED   │ DIRECT_ATTACH    │ DELIVERED        │
│ compliance@corp.co.zw    │ COMPILED   │ SECURE_LINK      │ SENT             │
│ investor3@gmail.com      │ COMPILED   │ DIRECT_ATTACH    │ BOUNCED (H)      │
└──────────────────────────┴────────────┴──────────────────┴──────────────────┘
```

- Filter by status: COMPILED, SENT, DELIVERED, BOUNCED, FAILED.
- Hard bounce rows show admin warning badge; link to LP client record.
- Retry action (admin) for transient failures where `retryCount < 3`.

---

## 8. LP portal — My Performance Reports

**User story:** As an LP, I view and download my fund performance reports.

- Card per report: fund name, period end, KPI summary (TVPI, DPI), delivery date.
- Download button → PDF stream or secure link (if emailed as link).
- Empty state when `Client.userId` not linked: "Contact your fund administrator".

**JWT scope:** Portal APIs resolve the LP from the logged-in `User` → linked `Client` — no `clientId` in path for self-service list endpoints.

---

## 9. Backend alignment notes

| Topic | Today | This module |
|-------|-------|-------------|
| LP records | `Client` + email | Add `userId` FK for portal login |
| Fund KPIs | `PortfolioDashboardService` (fund-level) | Per-LP pro-rata metrics engine |
| PDF | Capital call notices (pdfkit) | New LP performance PDF |
| Email | ZeptoMail via `emailTransport` | Thin `FundPerformanceEmailService` wrapper |
| Large attachments | `RemoteUploadService` | 10MB threshold → secure token link (7-day TTL) |
| Queue | In-process async (capital call pool pattern) | DB-backed run + recipient jobs |
| Cron | Reporting reminder pattern | `POST /api/cron/fund-reporting/schedule-tick` (ops only) |

Do **not** use HR `ReportTemplate` / `GeneratedReport` tables — dedicated `fund_report_*` schema.

---

## 10. Acceptance criteria — frontend mapping

| US-ID | UI element |
|-------|------------|
| US-3.5.1-A1 | Schedule editor with Quarterly/Monthly/Semi-Annual/Annual |
| US-3.5.1-A2 | Trigger New Run modal (fund + cohort) |
| US-3.5.1-A3 | Run progress bar from parent `report_runs` record |
| US-3.5.2-A1 | Template preview (Investor vs Board) |
| US-3.5.2-A2 | KPI sections populated from API snapshot (no static numbers) |
| US-3.5.3-A1 | Distribution list from active Client/User records |
| US-3.5.3-A2 | Disabled manual email override |
| US-3.5.3-A3 | Audit trail drawer on list save |
| US-3.5.4-A1 | Delivery log table with bounce/delivery events |
| US-3.5.4-A2 | Retry indicator when `retryCount > 0` |
| US-3.5.4-A3 | SECURE_LINK badge when attachment exceeded 10MB |

---

## 11. Key flows

### Quarterly automated run

1. Cron tick fires schedule → creates `FundReportRun` + recipient jobs.
2. Console shows IN_PROGRESS with live counters.
3. Each LP receives unique PDF via email (or secure link).
4. Run completes → COMPLETED; failures visible on status board.

### On-demand run

1. GP selects fund, template, period → POST trigger.
2. Same pipeline as scheduled run; `triggeredBy` shows staff user.

### LP portal download

1. LP logs in → portal lists reports for linked `Client`.
2. Download uses job id scoped to own `clientId`.

---

## 12. Open questions for design session

1. Should Board pack variance charts use forecasting-engine scenario picker in v1 or static tables only?
2. Show gross vs net IRR on investor email KPI cards?
3. LP portal: allow download of reports received only via email link token without login?

---

## 14. API contract summary (frontend handoff)

| Item | Value |
|------|-------|
| **Swagger tag** | `Fund Performance Reporting` (GP/ops only) |
| **GP base path** | `/api/fund-reporting/*` |
| **LP investor UI** | [`LP Portal`](./lp-portal.md) — `/api/lp-portal/*` (separate Swagger section) |
| **Auth** | Bearer JWT; GP routes: admin / fund_manager / cfo; LP routes: LIMITED_PARTNER |
| **Cron** | `POST /api/cron/fund-reporting/schedule-tick` — **not in Swagger** (ops) |

Primary endpoints: templates CRUD, schedules CRUD, distribution lists CRUD, `POST /runs`, `GET /runs/:id`, `GET /runs/:id/logs`.

LP self-service (dashboard, ledger, vault, reports) is documented in [`design-sessions/lp-portal.md`](lp-portal.md).

See [`docs/fund-performance-reporting-backend-requirements.md`](../docs/fund-performance-reporting-backend-requirements.md) for full contract.
