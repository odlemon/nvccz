# Performance module — requirements vs implementation tracker

**Purpose:** Map the consolidated BSC / performance spec (Parts 1–7) to the codebase, mark **Met / Partial / Gap**, and record follow-up **issue IDs** (below).  
**Last reviewed:** 2026-04-12 (cross-check vs client **Performance Module — Consolidated Analysis**).

| Status | Meaning |
|--------|---------|
| **Met** | Behaviour or API matches the requirement in substance. |
| **Partial** | Some behaviour exists; gaps remain (see notes). |
| **Gap** | Not implemented or materially different. |

---

## Executive summary (requirements doc vs code)

| Area | Met | Partial | Gap |
|------|-----|---------|-----|
| **Part 1** — 1–6 math, final-score bands, colours, KPI/matrix labels | 6 | 2 (1.7 traffic light; 1.8 qualitative grid) | 0 |
| **Part 2** — hierarchy / HOD | 1 | 2 | 0 |
| **Part 3** — Command Center extras, evidence, fiscal, PDF, diversity, etc. | 1 | 3 | 6 |
| **Part 4** — dynamic KPI architecture | 0 | 1 | 1 |
| **Part 5** — module integration triggers | 0 | 0 | 1 (entire map) |
| **Part 6** — changes 1–8 | 2 (core Ch.1 & Ch.3) | 3 | 4 |
| **Part 7** — explicit non-changes | 2 | 0 | 0 |

**Headline:** Numeric KPI scorecards implement **Part 1** and **Part 6 Changes 1 & 3** in substance. **Part 3, 5, and Part 6 (4, 5 rules 2–3, 7, 8)** are largely **not built**. If “labels everywhere” includes the **personal attributes** grid, columns remain **legacy** (`Excellent`, `Very Good`, … in `EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS`).

---

## Part 1 — Rating scale 1–6

| # | Requirement | Status | Evidence / notes | Issue |
|---|-------------|--------|------------------|-------|
| 1.1 | Standard KPI raw logic (upper/lower band, 50% floor, exact target = 4, 5 within upper band, 6 beyond) | **Met** | `computeRawRating` forward branch in `src/services/performanceScorecardSupport.ts`; order avoids `actual === target` being classified as 5. | — |
| 1.2 | Reverse KPI raw logic (6 below lower band, 5 under target in band, 4 on target, 3 over within band, 2 up to 150%, 1 above) | **Met** | Same file, `isReverseKpi` branch. | — |
| 1.3 | Weighted finals use 1–6 raw ratings (not capped at 4) | **Met** | `summariseEmployeeResultsDelivery` + department/CEO/Board weighting unchanged, now on 1–6 inputs. | — |
| 1.4 | Performance **label bands** on final score (5.50–6.00 Exceptional, … 1.00–1.99 Unsatisfactory) | **Met** | `performanceLabelFromScore` (+ department/CEO delegates) in `performanceScorecardSupport.ts`. | — |
| 1.5 | **Per-rating labels** (table: 1 Unsatisfactory … 6 Exceeds — Beyond Variance) on each indicator | **Met** | `rawRatingBandLabel` in `performanceScorecardSupport.ts`; on employee `goals` / `impactProgress`, employee & dept **document** matrices, CEO/Board **`document.sectionTables`** rows, and CEO/Board **`sections.*.indicators[]`** (JSON API). | PERF-UI-001 ✓ |
| 1.6 | Display colours 1–6 (dark green … red) | **Met** | `rawRatingToRowSeverity` in `performanceScorecardSupport.ts`; used in `PerformanceScorecardService` matrix/CEO/Board rows. | — |
| 1.7 | `computeStatus` / traffic-light (GREEN/AMBER/RED) aligned to 1–6 semantics | **Partial** | Still **3-state** variance traffic lights for matrix variance columns; not a 6-step scale. Acceptable for “status” unless client insists full alignment. | PERF-TL-002 |
| 1.8 | Spec: “labels … updated **everywhere**” on all scorecard surfaces | **Partial** | **KPI/matrix path:** `performanceLabelFromScore`, `rawRatingBandLabel`, `rawRatingToRowSeverity` on employee/dept/CEO/Board payloads + documents. **Qualitative personal attributes** grid still uses **legacy column titles** (`Excellent`, `Very Good`, …) in `EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS` — not the new Exceptional / Exceeds Expectations / … band and not the 1–6 wording. | PERF-QUAL-017 |

---

## Part 2 — Scorecard hierarchy

| # | Requirement | Status | Evidence / notes | Issue |
|---|-------------|--------|------------------|-------|
| 2.1 | Department scorecard = HOD; header shows department + HOD name + title | **Partial** | HOD fields + framing **Met**; spec asked to drop the separate “department vs HOD” notion — **`managerName` / `departmentManagerName` still duplicated** until frontend migrates. | PERF-HOD-003 |
| 2.2 | CEO = org-level formal contract; Exec Command Center = live view not a scorecard type | **Met** (model) | Org BSC remains `viewType: ORG_BSC` without signature flow; CEO routes unchanged. Command Center **UI** is frontend. | — |
| 2.3 | Board cascade narrative (individual → dept → CEO → Board) | **Partial** | Rollups / `RollupCalculationService` exist; **no** explicit “trace to Board indicator” API or docs in product UI. | PERF-CAS-004 |

---

## Part 3 — SRD additions

| # | Requirement | Status | Evidence / notes | Issue |
|---|-------------|--------|------------------|-------|
| 3.1 | Executive Command Center: heatmap, trends, risk/opportunity flags | **Partial** | `getOrgBSCDashboard` provides pillars, alerts, scores; **no** dedicated trend series or “opportunity” taxonomy. | PERF-ECC-005 |
| 3.2 | Employee impact progress bar (line-of-sight to department goal + %) | **Met** | `impactProgress` + equal split of **100 / sibling count** under same `parentGoalId` when rollup % unset. | PERF-IMP-006 ✓ |
| 3.3 | Evidence upload + manager verification before KPI counts | **Gap** | No evidence entities, flags, or approval flow wired to goals/scorecards. | PERF-EV-007 |
| 3.4 | Manager sign-off workflow + notifications | **Gap** | Uses existing `isPendingApproval` patterns partially; no full verification flow. | PERF-EV-007 |
| 3.5 | Fiscal period alignment across modules | **Gap** | Performance uses contract/strategy dates; **no** shared fiscal calendar consumer for “Q1 = same everywhere”. | PERF-FIS-008 |
| 3.6 | Scheduled integrations (5th BD GL pull, HR/procurement/events triggers) | **Gap** | `PerformanceIntegrationService` / ETL exist; **no** spec’d cron triggers or notifications as described. | PERF-INT-009 |
| 3.7 | Investee portal / external quarterly data | **Gap** | No investee submission path for Jobs Created / survival rate. | PERF-INV-010 |
| 3.8 | Scorecard visible mid-period | **Partial** | APIs return mid-period with warning; **throws** if no scoreable goals / no recorded performance — can block “always see something”. | PERF-VIS-011 |
| 3.9 | PDF download anytime (current + history, letterhead) | **Gap** | Document payload exists; **no** dedicated download/history endpoints verified in this pass. | PERF-PDF-012 |
| 3.10 | Diversity / inclusion rollups on new investment attributes | **Gap** | Not in performance module scope implemented. | PERF-DIV-013 |

---

## Part 4 — KPIs dynamic (future)

| # | Requirement | Status | Evidence / notes | Issue |
|---|-------------|--------|------------------|-------|
| 4.1 | Indicators as configurable DB data (add/retire/weights per period) | **Gap** | Goals/contracts in DB, but **no** indicator library product separate from goals; weights still goal fields. | PERF-KPI-014 |
| 4.2 | For now: seed CEO/Board indicators | **Partial** | Seeds/scripts exist (`seed-ceo-performance-contract.ts`, etc.); not re-verified line-by-line here. | PERF-KPI-015 |

---

## Part 5 — Module integration map

| # | Requirement | Status | Notes | Issue |
|---|-------------|--------|-------|-------|
| 5.1–5.6 | Accounting / HR / Procurement / Investee / Events / Internal task flows | **Gap** | Same as Part 3.6–3.7; trigger map not implemented as specified. | PERF-INT-009 |

---

## Part 6 — “Change list” checklist

| Change | Description | Status | Issue |
|--------|-------------|--------|-------|
| **1** | 1–6 scale, labels (final + per-row), colours | **Met** (see Part 1.1–1.6); **Partial** on 1.7–1.8 (traffic light + qualitative columns). | PERF-TL-002, PERF-QUAL-017 |
| **2** | Department header = dept + HOD; remove duplicate “views” | **Partial** | HOD name/title + framing on document/API; **legacy** `managerName` / `departmentManagerName` still present. | PERF-HOD-003 |
| **3** | Impact progress (link + % of parent) | **Met** | `impactProgress` + explicit % or sibling equal-split; frontend draws the bar. | PERF-IMP-006 ✓ |
| **4** | Evidence upload + manager approval before KPI counts | **Gap** | No evidence store, verification state machine, or notifications per spec. | PERF-EV-007 |
| **5** | Visibility / locking / PDF / banners (Rules 1–4) | **Partial** | See **sub-table below**. | PERF-LIFE-016, PERF-PDF-012, PERF-VIS-011 |
| **7** | Fiscal alignment across modules | **Gap** | No shared fiscal period service consumed by performance. | PERF-FIS-008 |
| **8** | Investee portal / external data path | **Gap** | No investee submission or PMS aggregation for Jobs / survival as specified. | PERF-INV-010 |

#### Part 6 — Change 5 breakdown (your Rules 1–4)

| Rule | Requirement (your doc) | Status | Notes |
|------|------------------------|--------|-------|
| **1** | Always visible mid-period | **Partial** | APIs work mid-period with warnings, but **throw** if no scoreable goals or no recorded performance — not “always open an empty/live shell”. | PERF-VIS-011 |
| **2** | Auto-finalise at period end; freeze actuals | **Gap** | No scheduled/job auto-finalise; manual `finalize` + DB lock. Post–period-end edits not universally blocked by a single gate (relies on process). | PERF-LIFE-016 |
| **3** | PDF download anytime (current + history) | **Gap** | Rich `document` JSON only; no PDF generation/list/history endpoint in scope. | PERF-PDF-012 |
| **4** | Banner strings (Live / Awaiting sign-off / Final / Archived) | **Partial** | `lifecycle.phase` + `lifecycle.bannerMessage` on four scorecard types; **does not** read both signature lines separately — uses `status` + `isLocked` + `archivedAt`. | PERF-LIFE-016 |

---

## Part 7 — Explicit non-changes

| # | Requirement | Status |
|---|-------------|--------|
| 7.1 | Four scorecard types; org BSC = dashboard | **Met** |
| 7.2 | Section structure/weights, access, DRAFT→FINAL→ARCHIVED, signatures shape | **Met** (unchanged as stated) |

---

## Issue summary (backlog)

| ID | Title | Priority |
|----|-------|----------|
| PERF-UI-001 | Expose Part 1 **per-rating labels** on API (`rawRatingLabel`) | **Done** |
| PERF-TL-002 | Optional: align `computeStatus` to 6-band or document 3-state as separate | Low |
| PERF-HOD-003 | Deprecate duplicate manager fields when frontend migrated | Low |
| PERF-CAS-004 | Cascade traceability API / narrative for Board | Medium |
| PERF-ECC-005 | Command Center: trends + opportunity flags | Medium |
| PERF-IMP-006 | Impact % when no explicit rollup weight (equal split) | **Done** |
| PERF-EV-007 | Evidence upload + manager verification workflow | High |
| PERF-FIS-008 | Shared fiscal period configuration | High |
| PERF-INT-009 | Scheduled / event-driven module integrations | High |
| PERF-INV-010 | Investee portal / quarterly submissions | High |
| PERF-VIS-011 | Relax or soften errors for “empty” mid-period scorecard view | Medium |
| PERF-PDF-012 | PDF generation + history download | High |
| PERF-DIV-013 | Diversity metrics on Board dashboard | Medium |
| PERF-KPI-014 | Indicator library / versioned weights | Medium |
| PERF-LIFE-016 | Auto-finalise at period end; enrich lifecycle (e.g. both signatures) | High — **banners partial** |
| PERF-QUAL-017 | Align qualitative personal-attribute column labels with new band vocabulary (or confirm 5-point grid is intentional) | Medium |

---

## How to use this doc

1. When implementing a feature, change **Gap → Partial → Met** and add a file reference.  
2. Link PRs to **Issue IDs** above.  
3. Keep `docs/api-changes/performance-bsc-rating-scale-2026-04-08.md` in sync with any **response shape** change.

---

## Re-verification checklist (code vs tracker)

| Check | Result |
|-------|--------|
| `computeRawRating` 1–6 standard + reverse in `performanceScorecardSupport.ts` | OK |
| `performanceLabelFromScore` bands (5.5–6 … 1–1.99) | OK |
| `rawRatingToRowSeverity` on employee/dept/CEO/Board matrix rows | OK |
| `rawRatingBandLabel` on employee goals, `impactProgress`, document matrices | OK |
| `rawRatingBandLabel` on CEO/Board `document.sectionTables` rows | OK |
| `rawRatingBandLabel` on CEO/Board **`sections.*.indicators[]`** | OK (added on re-check) |
| `lifecycle` on employee, department, CEO, Board scorecard JSON | OK |
| `getOrgBSCDashboard`: `ratingScale` only (no lifecycle on dashboard) | By design |
| PDF / auto-finalise / evidence / fiscal / investee | Still **Gap** |
