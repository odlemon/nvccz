## HDF CEO simulation UAT — 2026-05-29T15:17:43.852Z

- **API_BASE:** http://127.0.0.1:3009
- **Year:** 2026
- **Doc:** docs/fictional-performance-simulation-hdf-2026.md

### Identity mapping (fiction → NTS)

| Fiction | NTS user |
|---------|----------|
| Alex Nkomo (CEO) | Tatenda R <tatenda@niakazi.com> |
| Tendai M (Finance) | Ashley B <info@niakazi.com> |
| Dr. Chipo Moyo (reviewer) | Tatenda R <tatenda@niakazi.com> |
| Admin (setup) | Admin User <admin@nts.com> |

### Auth

| Step | Result |
|------|--------|
| Login as admin | OK |

### CEO contract (2026)

- **id:** cmpl15m120001ktcint1qti0t
- **sectionWeights:** A1=50%, A2=30%, D=20%
- **budget:** allocated ZWL 12,000,000 / spent ZWL 11,100,000 (92%)

- **Revenue KPI:** Revenue contribution (test KPI) (cmot5aoaz0009un44i6j7ovjf)

### Step 1 — Company goals created

| Section | Title | Target | Achieved | id |
|---------|-------|--------|----------|-----|
| A1 | HDF 2026 simulation — Annual revenue | 100000 | 0 | cmpr2gqoo0001uncsyhd1zjio |
| A2 | HDF 2026 simulation — Statutory reports on time | 12 | 12 | cmpr2grwk0003uncs2e5ayfau |
| D | HDF 2026 simulation — Integrity & anti-corruption | 100 | 98 | cmpr2gsu00005uncsoma7bypo |

### Step 2 — Department breakdown (Finance)

- **HTTP:** 201
- **success:** true
- **Finance dept goal id:** cmpr2gwuw000nun4shq7ftmqw

### Step 3 — Individual breakdown + auto-task

- **HTTP:** 201
- **success:** true
- **Individual goal id:** cmpr2h16b000pun4sjfeiuead
- **Auto-task id:** cmpr2h7c2000run4s0f8lxw2t (target 100000)

### Goal chain after progress

| Level | Target | Achieved | Progress % |
|-------|--------|----------|------------|
| individual | 100000 | 50000 | 50 |
| department | 100000 | 50000 | 50 |
| company | 100000 | 50000 | 50 |

| Company revenue achieved | 50000 | 50000 | PASS |
### Step 4 — Formula audit (before generate)

#### A1 Annual revenue

- actual: **50000**, target: **100000**, variance: **10%**, reverse: **false**
- bands: `{"targetValue":100000,"actualValue":50000,"allowableVariance":0.1,"lowerVarianceBound":90000,"upperVarianceBound":110000.00000000001,"fiftyPctOfTarget":50000,"oneFiftyPctOfTarget":150000}`
- branch: 50% target <= actual < lowerVarianceBound → 2
- rating: **2** (expected **2**) — PASS

#### A2 Statutory reports

- actual: **12**, target: **12**, variance: **10%**, reverse: **false**
- bands: `{"targetValue":12,"actualValue":12,"allowableVariance":0.1,"lowerVarianceBound":10.8,"upperVarianceBound":13.200000000000001,"fiftyPctOfTarget":6,"oneFiftyPctOfTarget":18}`
- branch: actual ≈ target → 4
- rating: **4** (expected **4**) — PASS

#### D Integrity

- actual: **98**, target: **100**, variance: **10%**, reverse: **false**
- bands: `{"targetValue":100,"actualValue":98,"allowableVariance":0.1,"lowerVarianceBound":90,"upperVarianceBound":110.00000000000001,"fiftyPctOfTarget":50,"oneFiftyPctOfTarget":150}`
- branch: lowerVarianceBound <= actual < target → 3
- rating: **3** (expected **3**) — PASS

#### Section blend

- formula: (50% × 2.00) + (30% × 4.00) + (20% × 3.00) = **2.80**

#### Budget component

- utilisation: 92.50% (11.1M / 12M)
- reverse KPI rating: **5** (expected **5**) — PASS
- branch: actual < target (not equal) → 5

#### Final score (expected)

- formula: 90% × 2.80 + 10% × 5 = **3.02**

### Step 5 — CEO scorecard generate

- **HTTP:** 201
- **success:** true
- **message:** CEO scorecard generated successfully
- **finalScore:** 3.02
- **sectionBlendScore:** 2.8
- **performanceLabel:** Satisfactory
- **budgetScore:** n/a

### Comparison vs simulation document

| Check | Actual | Expected | Result |
|-------|--------|----------|--------|
| A1 rating | 2 | 2 | PASS |
| A2 rating | 4 | 4 | PASS |
| D rating | 3 | 3 | PASS |
| Section blend | 2.8 | 2.8000000000000003 | PASS |
| Final score | 3.02 | 3.02 | PASS |

### Overall

- **RESULT: PASS** — matches simulation document.

