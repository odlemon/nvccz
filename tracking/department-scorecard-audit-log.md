# Department scorecard audit — 2026-05-29T17:38:07.408Z

- **API_BASE:** http://127.0.0.1:3009
- **Login:** admin@nts.com
- **Year:** 2026
- **Mode:** single (Finance)

- **Auth:** OK

## Department: Finance

- **Timestamp:** 2026-05-29T17:38:12.868Z
- **Period:** 2026

### Prisma inventory (existing data)

- **Contract:** cmosb91rx0001ktuvdb6a8vdk — Department Contracts 2026
- **Period:** 2026

| Dept goals | 1 |
| Individual children | 1 |
| Dept users | 3 |
| Employee scorecards (FINAL) | 0 |
| Employee scorecards (DRAFT) | 1 |
| Latest per user (rollup-eligible) | 1 |

| Goal | Target | Achieved | Weight % | Parent |
|------|--------|----------|----------|--------|
| Finance contribution — annual revenue | 100000 | 50000 | (even split) | yes |

| Child (individual) | Assignee | Target | Achieved | Parent goal |
|--------------------|----------|--------|----------|-------------|
| Individual revenue target | Ashley B | 100000 | 50000 | Finance contribution — annual revenue |

**Latest employee scorecards (DRAFT or FINAL — used for roll-up):**
- Ashley B: **DRAFT** finalScore **2**

### Step 1 — Service preview (in-process, no save)

- Warning: 1 employee scorecard(s) are draft and included in the roll-up. Finalise for official sign-off only.

#### Per-goal formula audit (preview)

#### Finance contribution — annual revenue

- **Target:** 100000 | **Direct actual:** 50000 | **Direct progress:** 50%
- **Roll-up progress:** 50% | **Selected:** direct → 50% (actual 50000)
- **Variance band (standard):** [90000, 110000.00000000001] | reverse: false
- **rawRating:** 2 (recomputed 2) — PASS
- **Matrix variance status:** RED | **Row status (progress+escalation):** RED
- **Weight:** 100% → effective **100%** | weightedScore 2 (expected 2) — PASS
- **Child contributions:**
  - Ashley B: progress 50%, roll-up weight 100%

#### Department score (preview)

- formula: Σ(effectiveWeight × rawRating / 100) / Σ(effectiveWeight) × 100
- activeWeight sum: **100%**
- **departmentScore:** 2 (recomputed **2**)
- **performanceLabel:** Requires Improvement

| Preview score vs recompute | 2 | 2 | PASS |
### Step 2 — HTTP POST generate

- **URL:** POST /api/performance/scorecards/department/Finance/generate
- **HTTP:** 201 | success: true

#### Per-goal formula audit (API response)

#### Finance contribution — annual revenue

- **Target:** 100000 | **Direct actual:** 50000 | **Direct progress:** 50%
- **Roll-up progress:** 50% | **Selected:** direct → 50% (actual 50000)
- **Variance band (standard):** [90000, 110000.00000000001] | reverse: false
- **rawRating:** 2 (recomputed 2) — PASS
- **Matrix variance status:** RED | **Row status (progress+escalation):** RED
- **Weight:** 100% → effective **100%** | weightedScore 2 (expected 2) — PASS
- **Child contributions:**
  - Ashley B: progress 50%, roll-up weight 100%

#### Department score (API)

- **scores.departmentScore:** 2
- **recomputed from goals:** 2
- **performanceLabel:** Requires Improvement
- **savedRecord.finalScore:** 2

| API score vs recompute | 2 | 2 | PASS |
| Preview vs API departmentScore | 2 | 2 | PASS |
| Preview vs API performanceLabel | Requires Improvement | Requires Improvement | PASS |
#### Employee roll-up summary

| Employee | Final score | Roll-up weight % | Weighted contribution |
|----------|-------------|------------------|----------------------|
| Ashley B | 2 | 100 | 2 |
| Blessing Finance | — | 0 | — |
| Nyasha  K | — | 0 | — |

### Comparison matrix

| Check | Actual | Expected | Result |
|-------|--------|----------|--------|

**RESULT: PASS**

