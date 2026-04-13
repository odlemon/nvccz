# Performance module — BSC rating scale & scorecard API updates

**Feature:** Consolidated BSC / performance spec (1–6 raw ratings, HOD framing, impact line-of-sight).  
**Date:** 2026-04-08  

This document is for **frontend** consumers of `/api/performance/scorecards/*` and related payloads.

---

## Summary

- **Raw indicator ratings** (`rawRating` on goals/matrix rows) are now on a **1–6** scale (was 1–4). Weighted **final** scores for employee / department / CEO / Board remain a **weighted mean** of those ratings, so finals typically fall in **~1–6** (not capped at 4).
- **Performance labels** (e.g. `scores.performanceLabel`) use new **wording and bands** aligned to the 1–6 finals (see below).
- **Row / indicator colours** use new **`rowSeverity` string tokens** (see below).
- **Employee** scorecard JSON adds **`impactProgress`** and **`scores.ratingScale`**.
- **Department** scorecard adds HOD fields and document header fields; **`scores.ratingScale`** added.
- **CEO / Board** score responses add **`scores.ratingScale`**.
- **Org BSC** (`GET .../scorecards/org-bsc`) adds **`ratingScale`** for consistency; pillar/goal scores there remain **progress %** for the heatmap (unchanged semantics).

---

## Modified endpoints (response shape / semantics)

### `GET /api/performance/scorecards/user`  
### `GET /api/performance/scorecards/employee/:employeeId`  
### `POST /api/performance/scorecards/employee/:employeeId/generate`

| Area | Change |
|------|--------|
| **`goals[].rawRating`** | Integer **1–6** (was 1–4). Same weighting formula; numeric finals can exceed 4. |
| **`goals[].rowSeverity`** (inside `document.performanceMatrix[]`) | Now one of: `dark_green`, `green`, `light_green`, `amber`, `orange`, `red`, plus `pending` / `excluded` / `neutral` where applicable. |
| **`scores.performanceLabel`** | New label set and bands (see table below). |
| **`scores`** | **Added** `ratingScale: { min: 1, max: 6 }`. |
| **Root** | **Added** `impactProgress`: array (see below). |

#### New: `impactProgress[]`

Each element corresponds to one employee goal row (line-of-sight to department parent):

| Field | Type | Description |
|-------|------|-------------|
| `performanceGoalId` | string | Goal id |
| `goalName` | string | Goal title |
| `parentDepartmentGoalId` | string \| null | `parentGoalId` when linked to a department goal |
| `parentDepartmentGoalTitle` | string \| null | Parent goal title |
| `contributionPercentOfParentGoal` | number \| null | From `contributionWeightPercent` / `rollupWeightPercent` on the goal when set |
| `progressPct` | number \| null | Employee goal progress % |
| `rawRating` | number \| null | 1–6 raw rating |

---

### `GET /api/performance/scorecards/department/:department`  
### `POST /api/performance/scorecards/department/:department/generate`

| Area | Change |
|------|--------|
| **`goals[].rawRating`** | **1–6** |
| **`document.performanceMatrix[].rowSeverity`** | Same token set as employee (`dark_green` … `red`). |
| **`scores.performanceLabel`** | New bands/labels (same as employee). |
| **`scores`** | **Added** `ratingScale: { min: 1, max: 6 }`. |
| **`department`** | **Added** `headOfDepartmentName`, `headOfDepartmentTitle` (same person as manager / HOD). |
| **`document.header`** | **Added** `scorecardFraming` (short explanatory string), **`headOfDepartmentName`**, **`headOfDepartmentTitle`**. Existing `managerName` / `departmentManagerName` retained for compatibility. |

---

### `GET /api/performance/scorecards/ceo`  
### `POST /api/performance/scorecards/ceo/generate`

| Area | Change |
|------|--------|
| **Indicator `rawRating` / `document.sectionTables[*].rows[].rawRating`** | **1–6** |
| **`rowSeverity`** on CEO indicator rows | `dark_green` … `red` (plus `pending` / `excluded`). |
| **`scores.performanceLabel`** | New bands/labels. |
| **`scores`** | **Added** `ratingScale: { min: 1, max: 6 }`. |

---

### `GET /api/performance/scorecards/board`  
### `POST /api/performance/scorecards/board/generate`

Same pattern as CEO: **1–6** raw ratings, new **rowSeverity** tokens, new **performanceLabel** bands, **`scores.ratingScale`**.

---

### `GET /api/performance/scorecards/org-bsc`

| Area | Change |
|------|--------|
| **Root** | **Added** `ratingScale: { min: 1, max: 6 }` (documentation for clients; pillar scores remain **0–100%-style progress** for the dashboard). |

---

## Performance label bands (final weighted score)

Used for `scores.performanceLabel` (and equivalent labels on CEO/Board section summaries).

| Score range | Label |
|-------------|--------|
| 5.50 – 6.00 | Exceptional |
| 4.50 – 5.49 | Exceeds Expectations |
| 3.50 – 4.49 | Meets Expectations |
| 2.50 – 3.49 | Satisfactory |
| 2.00 – 2.49 | Requires Improvement |
| 1.00 – 1.99 | Unsatisfactory |

*(Scores below 1.0 still map to **Unsatisfactory**.)*

**Removed** old labels such as “Outstanding”, “Excellent”, “Very Good” on **numeric** final scores (qualitative personal-attribute grids may still use their own column headers).

---

## Raw rating 1–6 (logic reference)

- **Standard KPI:** symmetric variance above/below target; **5** = above target within upper band; **6** = above upper band; **4** = on target; **3** = below target within lower band; **2** = between 50% of target and lower band; **1** = below 50% of target.
- **Reverse KPI:** lower actual is better (e.g. cost ceiling); **6** = well below lower variance bound; **5** = between lower bound and target; **4** = on target; **3** = over target within upper band; **2** = between upper band and 150% of target; **1** = above 150% of target.

---

## Request bodies

**Unchanged** for the routes above (period query/body parameters as before).

---

## Supplement (2026-04-12): `rawRatingLabel`, `lifecycle`, impact % fallback

- **`rawRatingLabel`** (string | null): Part 1 short names for integer **`rawRating`** (e.g. `"Meets Target"` for 4). Present on employee **`goals`**, **`impactProgress`**, **`document.performanceMatrix`**, department **`goals`** / matrix, CEO/Board **`document.sectionTables[*].rows`**, and CEO/Board top-level **`sections.<A1|A2|B|C|D>.indicators[]`** (same payload many UIs consume first).
- **`lifecycle`**: `{ phase: string, bannerMessage: string }` on **employee**, **department**, **CEO**, and **Board** scorecard JSON roots. Derived from contract period end + latest matching **`performance_scorecards`** row (`status`, `isLocked`, `archivedAt`). Phases include at least: `LIVE`, `AWAITING_SIGNOFF`, `FINAL_LOCKED`, `FINAL_UNLOCKED`, `ARCHIVED`, `PERIOD_ENDED`. **No automatic finalisation** when the period ends.
- **`impactProgress[].contributionPercentOfParentGoal`**: if explicit rollup weight is unset, backend fills **100 ÷ N** where **N** = count of this employee’s goals sharing the same **`parentGoalId`** in the period.

**Requirement cross-check:** see `docs/performance-requirements-compliance-tracker.md`.

---

## Not in this change (follow-up work)

Per product spec, these are **still** not fully implemented:

- Evidence upload + manager verification workflow  
- **Automatic** finalisation at period end (cron/job)  
- PDF download + history endpoints  
- Shared fiscal period config across all modules  
- Investee portal ingestion  
- Executive Command Center heatmap / trends beyond current org-bsc  
- DB-driven indicator library (still seed / contract goals as today)

---

## Suggested frontend updates

1. Map **`rowSeverity`** to colours: `dark_green` → `green` → `light_green` → `amber` → `orange` → `red`.  
2. Render **Impact Progress Bar** from **`impactProgress`**; show **`rawRating`** + **`rawRatingLabel`**.  
3. Show top **`lifecycle.bannerMessage`** as the Rule 4–style status strip.  
4. Treat **`scores.finalScore` / department / CEO finals** as **~1–6** for gauges and label lookup.  
5. Department PDF/header: prefer **`headOfDepartmentName` / `headOfDepartmentTitle`** + **`scorecardFraming`** where shown.
