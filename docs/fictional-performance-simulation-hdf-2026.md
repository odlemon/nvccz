# Fictional performance simulation — Horizon Development Fund (HDF) 2026

**Paper only.** Nothing in this document is written to any database. Use it to explain the performance module to a client or to enter the same values in Arcus/NVCCZ for UAT.

Scoring rules match the live backend: **1–6 raw ratings** with **10% allowable variance**, CEO sections **A1–D**, optional **10% budget blend**, default section blend **redistribute**.

---

## 1. Company profile

| Field | Value |
|--------|--------|
| **Organisation** | Horizon Development Fund (HDF) |
| **Tagline** | SME growth capital and development finance |
| **CEO** | Alex Nkomo |
| **Board reviewer** | Dr. Chipo Moyo (Board Chairperson) |
| **Review period** | 1 Jan 2026 – 31 Dec 2026 (`periodLabel`: `"2026"`) |
| **Simulation “as at”** | 25 May 2026 (period in progress → **LIVE** scorecard) |

### Performance contracts (fictional)

| Contract type | Status | Subject / scope | Notes |
|---------------|--------|-----------------|--------|
| **CEO** | ACTIVE | Alex Nkomo | 8 company indicators, all with `scorecardSection` A1–D |
| **DEPARTMENT — Finance** | ACTIVE | Finance dept | 2 department goals |
| **DEPARTMENT — Operations** | ACTIVE | Operations dept | 2 department goals |
| **DEPARTMENT — Human Resources** | ACTIVE | HR dept | 2 department goals |
| **EMPLOYEE** (×4) | ACTIVE | Tendai M, Rudo K, Farai P, + 1 ops analyst | Individual goals below |

### CEO contract settings

| Setting | Value |
|---------|--------|
| `stretchScoringEnabled` | `false` |
| Section weights | A1 **30%**, A2 **20%**, B **20%**, C **25%**, D **5%** |
| `allocatedBudget` | ZWL **12,000,000** |
| `actualSpend` | ZWL **11,100,000** |
| Budget utilisation | **92%** (included in final CEO score) |
| `reviewerId` | Set (Dr. Chipo Moyo) — no “missing reviewer” warning |

### Org chart (compact)

```
Board of Directors
    └── CEO — Alex Nkomo
            ├── Finance (Head: Tendai M)
            ├── Operations (Head: Rudo K)
            └── Human Resources (Head: Farai P)
```

---

## 2. Layer 1 — Company goals (CEO contract indicators)

All goals: `type: company`, linked to **CEO performance contract**, `allowableVariance: 0.1`, weights **sum to 100% per section**.

| # | `scorecardSection` | Title | `formulaType` | `scorecardPillar` | Unit | Target | Actual (`currentValue`) | Weight % | Reverse KPI | `activities` / notes |
|---|-------------------|-------|---------------|-------------------|------|--------|-------------------------|----------|-------------|----------------------|
| 1 | **A1** | Annual revenue | `DIRECT` | Financial | USD | 5,000,000 | 5,600,000 | 50 | No | Stored actual |
| 2 | **A1** | Return on investment | `ROI` | Financial | % | 12 | 14 | 50 | No | `initialCost`: 1,000,000; `finalValue`: 1,140,000 → ROI **14%** |
| 3 | **A2** | Statutory reports produced | `STATUTORY_REPORTS` | Internal Operations | % | 100 | 100 | 50 | No | `completedCount`: 12, `targetCount`: 12 |
| 4 | **A2** | Capital disbursed | `CAPITAL_DISBURSED` | Internal Operations | % | 100 | 88 | 50 | No | `capitalDisbursed`: 88,000,000; `budgetedCapital`: 100,000,000 |
| 5 | **B** | Customer satisfaction index | `CUSTOMER_SATISFACTION_INDEX` | Customer & Market | % | 80 | 76 | 60 | No | `surveyScores`: [0.76, 0.78, 0.74] → avg **76%** |
| 6 | **B** | Customer service charter | `CHARTER_SCORE` | Customer & Market | % | 100 | 91 | 40 | No | Composite checklist → **91%** (stored) |
| 7 | **C** | Payroll expense cap | `DIRECT` | Learning, Growth & HR | USD | 2,400,000 | 2,520,000 | 50 | **Yes** | Over cap |
| 8 | **C** | Strategic allocation compliance | `STRATEGIC_ALLOCATION_COMPLIANCE` | Internal Operations | % | 70 | 72 | 50 | No | `budgetAlignedToPolicy`: 72M; `totalBudget`: 100M |
| 9 | **D** | Integrity and anti-corruption | `DIRECT` | Learning, Growth & HR | % | 100 | 98 | 100 | No | Stored **98%** |

---

## 3. Layer 2 — Department goals (2026)

`type: department`, `departmentName` as below, period overlaps 2026. Not all are linked to the CEO contract; they feed **department scorecards** separately.

| Department | Goal | Target | Actual | Weight % | Reverse? | Progress % (display) |
|------------|------|--------|--------|----------|----------|------------------------|
| **Finance** | Month-end close on time | 12 closes | 11 | 50 | No | 91.7% |
| **Finance** | Audit findings (major) | 0 | 1 | 50 | **Yes** | 0% (over target) |
| **Operations** | Projects delivered on schedule | 20 | 17 | 60 | No | 85% |
| **Operations** | Procurement plan compliance | 100% | 94% | 40 | No | 94% |
| **Human Resources** | Staff retention | 95% | 93% | 50 | No | 97.9% |
| **Human Resources** | Training hours per FTE | 40 hrs | 38 hrs | 50 | No | 95% |

*Narrative links:* Finance statutory discipline supports CEO **A2**; Operations delivery supports **A2** capital/output; HR retention/training supports **D** / learning themes.

---

## 4. Layer 3 — Individual goals (2026)

`type: individual`, `assignedToId` per employee, overlapping 2026.

| Employee | Department | Goal | Target | Actual | Weight % | Reverse? | Progress % |
|----------|------------|------|--------|--------|----------|----------|------------|
| **Tendai M** | Finance | Reconcile 100% bank accounts monthly | 12 months | 12 | 60 | No | 100% |
| **Tendai M** | Finance | Complete compliance training | 1 course | 1 | 40 | No | 100% |
| **Rudo K** | Operations | Close milestone tasks | 20 | 17 | 100 | No | 85% |
| **Farai P** | Human Resources | Run wellness events | 4 | 4 | 50 | No | 100% |
| **Farai P** | Human Resources | Reduce time-to-hire (days) | 45 | 52 | 50 | **Yes** | 86.5% |

*Optional product feature:* link individual goals to department goals via `parentGoalId` for roll-up (not required for CEO scorecard).

---

## 5. CEO scorecard — rating worksheet

**Rules:** Forward KPI — higher actual is better. Reverse KPI — lower actual is better. Variance **10%** on target. Rating scale **1–6** (see band labels below).

### 5.1 Per-indicator ratings (verified against `computeRawRating`)

| Section | Indicator | Actual | Target | Raw (1–6) | Band label | Progress % |
|---------|-----------|--------|--------|-----------|------------|------------|
| A1 | Annual revenue | 5,600,000 | 5,000,000 | **6** | Exceeds — Beyond Variance | 100% (capped) |
| A1 | Return on investment | 14% | 12% | **6** | Exceeds — Beyond Variance | 100% (capped) |
| A2 | Statutory reports | 100% | 100% | **4** | Meets Target | 100% |
| A2 | Capital disbursed | 88% | 100% | **2** | Requires Improvement | 88% |
| B | Customer satisfaction | 76% | 80% | **3** | Within Variance | 95% |
| B | Customer charter | 91% | 100% | **3** | Within Variance | 91% |
| C | Payroll expense cap | 2,520,000 | 2,400,000 | **3** | Within Variance | 95.2% |
| C | Strategic allocation | 72% | 70% | **5** | Exceeds — Within Variance | 100% (capped) |
| D | Integrity | 98% | 100% | **3** | Within Variance | 98% |

**Variance intuition (examples):**

- **Revenue:** Actual > target × 1.1 → rating **6**.
- **Capital disbursed:** Actual 88% is below target × 0.9 (90%) but above 50% of target → rating **2**.
- **Payroll (reverse):** Actual above target but within target × 1.1 → rating **3** (not yet in worst overspend band).

### 5.2 Within-section weighted scores

| Section | Indicators | Weights | Calculation | **Section score** | Section label |
|---------|------------|---------|-------------|-------------------|---------------|
| **A1** | Revenue 6, ROI 6 | 50% / 50% | (50×6 + 50×6) / 100 | **6.00** | Exceeds Expectations |
| **A2** | Statutory 4, Capital 2 | 50% / 50% | (50×4 + 50×2) / 100 | **3.00** | Satisfactory |
| **B** | CSAT 3, Charter 3 | 60% / 40% | (60×3 + 40×3) / 100 | **3.00** | Satisfactory |
| **C** | Payroll 3, Strategic 5 | 50% / 50% | (50×3 + 50×5) / 100 | **4.00** | Meets Expectations |
| **D** | Integrity 3 | 100% | 3 | **3.00** | Satisfactory |

### 5.3 Section blend (results delivery)

Default **`sectionBlendMode: redistribute`** — all five sections have scoreable indicators, so weights apply in full:

| Section | Contract weight % | Section score | Contribution |
|---------|-------------------|---------------|--------------|
| A1 | 30 | 6.00 | 1.80 |
| A2 | 20 | 3.00 | 0.60 |
| B | 20 | 3.00 | 0.60 |
| C | 25 | 4.00 | 1.00 |
| D | 5 | 3.00 | 0.15 |
| **Total** | 100 | — | **sectionBlendScore = 4.15** |

### 5.4 Budget component (10% of final)

| Field | Value |
|-------|--------|
| Allocated budget | ZWL 12,000,000 |
| Actual spend | ZWL 11,100,000 |
| Utilisation | **92%** |
| Budget rating (reverse KPI vs 100% target) | **5** (Exceeds — Within Variance) |
| Included in final? | **Yes** |

**Final CEO score:**

```
finalScore = 0.9 × 4.15 + 0.1 × 5 = 4.235 → rounded 4.24
```

| Score | Label |
|-------|--------|
| **4.24** | **Meets Expectations** |

---

## 6. Expected CEO scorecard API response (preview)

Simulated shape after `POST /api/performance/scorecards/ceo/generate` with `periodLabel: "2026"` and `persist: true`.

### 6.1 Header / contract

```json
{
  "scorecardType": "CEO",
  "ceo": { "name": "Alex Nkomo", "title": "Chief Executive Officer" },
  "contract": {
    "title": "CEO performance contract (2026)",
    "periodLabel": "2026",
    "stretchScoringEnabled": false,
    "reviewerName": "Dr. Chipo Moyo"
  },
  "lifecycle": {
    "phase": "LIVE",
    "bannerMessage": "Live — period in progress. Scores reflect performance to date."
  }
}
```

### 6.2 Warnings (expected)

| Warning | Present? |
|---------|----------|
| No Board Chairperson reviewer | **No** (reviewer assigned) |
| Period not ended | **Yes** (May 2026) |
| Indicator in UNASSIGNED section | **No** (all sections set) |
| Section weights not 100% | **No** |

### 6.3 `scores` block

```json
{
  "scores": {
    "sectionScores": { "A1": 6, "A2": 3, "B": 3, "C": 4, "D": 3 },
    "sectionBlendScore": 4.15,
    "budgetScore": 5,
    "finalScore": 4.24,
    "performanceLabel": "Meets Expectations",
    "ratingScale": { "min": 1, "max": 6 }
  }
}
```

### 6.4 `agreedRatingsSummary` (excerpt)

| Section | Heading | sectionScore | label |
|---------|---------|--------------|--------|
| A1 | Outcomes | 6.00 | Exceeds Expectations |
| A2 | Outputs | 3.00 | Satisfactory |
| B | Service Delivery Standards | 3.00 | Satisfactory |
| C | Management of Resources… | 4.00 | Meets Expectations |
| D | Cross-Cutting… | 3.00 | Satisfactory |
| TOTAL | Final Score | **4.24** | **Meets Expectations** |

### 6.5 `matrixRows` (excerpt — all scoreable)

| indicatorName | section | target | computedActual | rawRating | progressPct | weight | effectiveWeight | weightedScore |
|---------------|---------|--------|----------------|-----------|-------------|--------|-----------------|---------------|
| Annual revenue | A1 | 5000000 | 5600000 | 6 | 100 | 50 | 50 | 3.0 |
| Return on investment | A1 | 12 | 14 | 6 | 100 | 50 | 50 | 3.0 |
| Statutory reports produced | A2 | 100 | 100 | 4 | 100 | 50 | 50 | 2.0 |
| Capital disbursed | A2 | 100 | 88 | 2 | 88 | 50 | 50 | 1.0 |
| Customer satisfaction index | B | 80 | 76 | 3 | 95 | 60 | 60 | 1.8 |
| Customer service charter | B | 100 | 91 | 3 | 91 | 40 | 40 | 1.2 |
| Payroll expense cap | C | 2400000 | 2520000 | 3 | 95.24 | 50 | 50 | 1.5 |
| Strategic allocation compliance | C | 70 | 72 | 5 | 100 | 50 | 50 | 2.5 |
| Integrity and anti-corruption | D | 100 | 98 | 3 | 98 | 100 | 100 | 3.0 |

### 6.6 Qualitative / signatures

- **Personal attributes** grid: all `selected: null` (manual at review meeting).
- **Training & development:** empty lists until captured.
- **Signatures:** CEO name filled; board chair name filled; dates/signatures null until finalise.

---

## 7. Org BSC vs CEO scorecard (do not confuse)

Same company goals can power two different surfaces:

| Surface | Formula (simplified) | HDF illustration |
|---------|----------------------|------------------|
| **Org BSC dashboard** | Σ (pillar/goal weight × **progress %**) | Dominated by many goals at ~90–100% progress → high **%** score (e.g. high 90s if equally weighted) |
| **CEO scorecard** | Σ (section weight × **section score on 1–6 scale**) | **4.24** — Meets Expectations |

Progress % is shown on CEO rows for transparency but **does not** drive `finalScore`; **raw rating 1–6** does.

---

## 8. UAT checklist — entering HDF data in Arcus

Use this order so generate succeeds and matches this document.

### 8.1 Contracts

- [ ] Create **CEO** contract 2026 for Alex Nkomo, ACTIVE, reviewer = Dr. Chipo Moyo.
- [ ] Set `allocatedBudget` = 12,000,000 and `actualSpend` = 11,100,000 on CEO contract.
- [ ] Create **DEPARTMENT** contracts for Finance, Operations, Human Resources (2026).
- [ ] Create **EMPLOYEE** contracts for Tendai M, Rudo K, Farai P (and ops analyst if used).

### 8.2 Company goals (CEO indicators)

For each of the **8 rows in §2**, `POST` performance goal with:

- [ ] `type: "company"`
- [ ] `performanceContractId` = CEO contract id
- [ ] `scorecardSection`: A1, A2, B, C, or D ( **required** — avoids UNASSIGNED)
- [ ] `scorecardWeight`: as table (50/50, 60/40, etc.)
- [ ] `targetValue` / `preciseTargetValue`, `currentValue` / `preciseCurrentValue`
- [ ] `allowableVariance`: 0.1
- [ ] `isReverseKpi`: true only for payroll cap
- [ ] `formulaType` and `activities` as in table
- [ ] `startDate` / `endDate` overlapping 2026

### 8.3 Department and individual goals

- [ ] Department goals: `type: "department"`, correct `departmentName`, weights, targets/actuals.
- [ ] Individual goals: `type: "individual"`, `assignedToId`, weights, targets/actuals.

### 8.4 Generate and verify

- [ ] `POST /performance/scorecards/ceo/generate` with `periodLabel: "2026"`.
- [ ] Compare `scores.finalScore` ≈ **4.24**, `performanceLabel` = **Meets Expectations**.
- [ ] Confirm **no** UNASSIGNED warnings.
- [ ] Confirm `sections.A1` has 2 indicators, `A2` has 2, etc.

### 8.5 Contrast with Niakazi-style mistake

| Issue | Niakazi (your earlier run) | HDF (this fiction) |
|-------|---------------------------|---------------------|
| `scorecardSection` | Missing → UNASSIGNED | Set on every CEO goal |
| Section tables | Empty | Populated |
| `finalScore` | 0 despite good `matrixRows` | **4.24** reflects ratings |

---

## 9. Reference — rating band labels (1–6)

| Rating | Label |
|--------|--------|
| 6 | Exceeds — Beyond Variance |
| 5 | Exceeds — Within Variance |
| 4 | Meets Target |
| 3 | Within Variance |
| 2 | Requires Improvement |
| 1 | Unsatisfactory |

| Final score | Overall label |
|-------------|----------------|
| ≥ 5.5 | Exceptional |
| ≥ 4.5 | Exceeds Expectations |
| ≥ 3.5 | **Meets Expectations** ← HDF **4.24** |
| ≥ 2.5 | Satisfactory |
| ≥ 2.0 | Requires Improvement |
| &lt; 2.0 | Unsatisfactory |

---

*Document version: fictional simulation HDF-2026. Calculations cross-checked with `computeRawRating`, `computeGoalProgress`, and `computeBudgetUtilisationRating` in `src/services/performanceScorecardSupport.ts`.*
