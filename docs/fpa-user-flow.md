# FP&A — End-to-end user flow

How Planning, Budgeting & Forecasting works in Arcus from a **user’s point of view**: who does what, in which screen, from first setup through board reporting.

For API contracts see [fpa-api-reference.md](./fpa-api-reference.md).  
For screen → endpoint map see [fpa-api-by-ui-section.md](./fpa-api-by-ui-section.md).

---

## 1. Mental model (what you are working in)

Everything hangs off one **planning model** (e.g. “FY2026 Operating Plan”).

| Concept | Plain language |
|---------|----------------|
| **Model** | The plan container: horizon, currency, line items, formulas |
| **Version** | A snapshot of the numbers (Working draft → Locked board pack) |
| **Scenario** | A “what if” on top of a version (BASE, Upside, Downside, Forecast) |
| **Line item** | Rows on the worksheet (Revenue, Salaries, EBITDA, …) |
| **Cell** | One number at the intersection of line item × period × scenario × version |
| **Driver** | Assumptions (growth %, headcount rate) that formulas can use |
| **Workflow / task** | Who must enter or approve which slice of the plan |
| **Actuals** | Closed-period GL numbers synced in for variance |
| **Entity** | Legal entity / COA scope (Settings → Forecast entities) |

**Typical bootstrap in the UI:** pick a model → prefer `defaultScenarioId` / `defaultVersionId` → else first BASE scenario + Working-like version.

```text
Login
  → Models list
    → Home (KPIs, tasks, over-budget)
      → Model Builder (structure)
      → Worksheet (enter numbers)
      → Drivers / Domain tabs
      → Scenarios (compare / promote)
      → Workflow (submit / approve)
      → Actuals sync + Variance
      → Lock version
      → Reports / board-pack export
```

---

## 2. Who is involved

| Role | What they do in this module |
|------|-----------------------------|
| **FP&A / Analyst** | Builds model structure, drivers, formulas; runs scenarios and variance |
| **Department owner** | Fills their worksheet slice; submits their workflow task |
| **Approver (FP&A manager / CFO)** | Returns or approves tasks; cannot approve their own submission |
| **CFO / lock role** | Locks the version when the cycle is done (edits then fail with 403) |
| **Board / viewer** | Reads locked outputs and exports; does not edit cells |

---

## 3. Phase A — Start: open FP&A and land on Home

1. User signs in (same Arcus auth; token is top-level `token` from login).
2. App loads models (`GET /models`) and selects one (e.g. UAT FPA Model).
3. **Home** loads for that model (`GET /home/dashboard`).

**What the user sees**

- KPI cards (revenue, EBITDA, closing cash, runway)
- Workflow progress for active cycles
- Open tasks (same idea as Workflow → My tasks)
- Scenario compare snapshot (BASE vs another)
- Over-budget departments (with department name when available)
- Recent activity from the planning audit log

**Empty state:** no models yet → Home says planning models are missing; user (or admin) must create one in Model Builder.

---   

## 4. Phase B — Planning model setup (requirements wizard)

**Where:** `/forecasting/models` → **Create model** modal (multi-step; draft stays client-side until finish)

Matches SRD **Planning Model Setup Workflow**. Steps collect answers in the UI; **Create model** commits once.

```text
Create model
  → Select model type
  → Select time horizon
  → Select entities and departments
  → Select chart of accounts
  → Select dimensions
  → Select baseline actuals or forecast
  → Create line items
  → Configure formulas
  → Configure drivers
  → Configure workflow
  → Validate model
       ├─ No  → Fix missing dimensions / formulas / access rules → re-validate
       └─ Yes → Open model for planning input (Worksheet)
```

### B.1 Preferred commit: atomic setup

`POST /v1/fpa/models/setup` creates the model + scope + COA + dimensions + baseline + line items + formulas + drivers + optional workflow in **one transaction**. On validation failure of the payload → **400** + `errors[]` and **no orphan model**.

**Full request/response contracts:** [fpa-model-setup-api.md](./fpa-model-setup-api.md)

**Enums**

| Field | Values |
|-------|--------|
| `modelType` | `BUDGET` \| `FORECAST` \| `ROLLING_FORECAST` |
| `timeGranularity` | `MONTHLY` \| `QUARTERLY` \| `ANNUAL` |
| `baseline.mode` | `NONE` \| `ACTUALS_SYNC` \| `PRIOR_FORECAST` |

### B.2 Fallback (legacy / partial)

`POST /v1/fpa/models` still seeds BASE + Working + default line items + empty cells. Frontend may then call helpers:

- `PUT /models/{id}/scope` — entities + departments (`GET /departments` for dept list)
- `PUT /models/{id}/coa` — account ids
- `PUT /models/{id}/dimensions` — dimension keys + value ids
- `POST /models/{id}/baseline` — seed from actuals or prior forecast
- `POST /models/{id}/line-items/bulk`
- `POST /models/{id}/validate` — authoritative gate (`passed` + `errors[]`)

### B.3 Open an existing model

Model selector / list → open. Prefer `defaultScenarioId` / `defaultVersionId`, else BASE + Working.

### B.4 Forecast entities (COA source)

Settings / setup step uses `/api/forecast-entities` (+ entity COA). Departments use existing `GET /departments`.

---

## 5. Phase C — Adjust structure after setup (optional)

Usually covered in the setup modal. After open, FP&A can still tweak:

### C.1 Line items / bulk

Add rows; `POST /models/{id}/line-items/bulk` for batches.

### C.2 Drivers

Create / **update** (`PUT /drivers/{id}`).

### C.3 Formulas

Validate expression → dependency check → impact map.

### C.4 New draft version (mid-cycle)

1. **Create version** (optional `copyFromVersionId`).
2. **Seed cells** if empty.
3. **Lock** when ready (Phase H).

---

## 6. Phase D — Enter the plan (Worksheet)

**Where:** Worksheet (main planning grid)

1. User selects **version** + **scenario**.
2. Grid loads: line items × periods, with `isEditable` / `isLocked` / source type.
3. User edits cells (single or bulk), uses **Spread** or **Copy forward** for seasonal patterns.

**Rules the user will feel**

| Situation | What happens |
|-----------|----------------|
| Version unlocked, cell editable | Edit succeeds |
| Version **locked** (or cell locked) | Edit / spread / copy-forward fails; UI toast — **expected**, not a bug |
| Fresh empty DRAFT (no cells) | Seed or copy-from first; then edit |
| Actuals-sourced cells | Treated as read-only in practice |

**Submit from Worksheet:** needs a workflow **task id** (from Workflow / My tasks). Submit stays gated until that binding exists.

---

## 7. Phase E — Domain views (workforce, revenue, expense, cash)

**Where:** Domain tabs  

Same model data filtered by category: line items + drivers for that domain.  

Today these are **thin views** of structure/numbers — not full hire-plan / waterfall / cash-statement chart packs yet. Users still do detailed entry on the Worksheet.

---

## 8. Phase F — Scenarios (what-if and promote)

**Where:** Scenarios

1. List scenarios for the model.
2. **Create** Upside / Downside / custom, or **copy** an existing scenario (copies cells/drivers for a version).
3. **Compare** BASE vs another → deltas by key line codes (Revenue, EBITDA, cash, …).
4. When one path becomes the official forecast → **Promote to Forecast** (marks official forecast scenario; others can be demoted).

Pixel extras (waterfall bridge, sensitivity matrix, runway sparklines) may still be UI-only / future.

---

## 9. Phase G — Budget cycle (Workflow)

This is the controlled path from “departments enter” to “approved plan”.

### G.1 Open a cycle

FP&A creates a **workflow** (e.g. Annual Budget) with tasks (Finance input, Marketing input, …), optionally assigned.

Users can **list** workflows for the model and open one for progress.

### G.2 Department / analyst works a task

1. **My tasks** shows open work (assigned to them **or** still unassigned — same idea as Home open tasks).
2. They open Worksheet for the right version/scenario, enter numbers.
3. **Submit** task (optional comment) → status `PENDING` → `SUBMITTED`.

### G.3 Approver review

| Action | User intent |
|--------|-------------|
| **Return** | Send back with comment → `RETURNED` |
| **Approve** | Accept submission (approver role; **not** the same person who submitted) |
| **Reassign** | Hand the task to another user (or unassign) |

Home **workflow progress** reflects completed vs total tasks for the cycle.

### G.4 Parallel: Budget screen

Uses workflow list + dashboard progress; without list/dashboard it used to look empty — list is now available.

---

## 10. Phase H — Lock and freeze numbers

When the cycle (or a board snapshot) is ready:

1. Approver / CFO runs **Lock version** (optional reason).
2. All cells on that version become non-editable.
3. Further Worksheet edits → **403** + toast.

To continue planning after lock: create a **new version** (copy-from locked if needed), seed if empty, edit there — do not unlock casually in the product story.

**Archive** retires a version that should no longer appear as active working.

---

## 11. Phase I — Actuals and variance

### I.1 Sync actuals

**Where:** Actuals / import action  

User runs **sync** for a period range. Job may complete with `rowCount: 0` if there is nothing in GL for that window — still a valid run.

### I.2 Variance

User calculates Actual vs Budget (or similar) for model/version/scenario.  
Results are **line-item** level; commentary can be attached.  

Department rollups / commentary queues / cumulative trend charts are future enrichments; core calc + results are live.

---

## 12. Phase J — Reports and board pack (finish line)

**Where:** Reports

1. User requests **Board pack** or **Management report** export for a model + version.
2. Job completes with payload + **download URL**.
3. User opens/downloads the file via the export download endpoint.

AI suggest / commentary draft (if shown) are **assist-only** — they never approve, lock, or overwrite actuals.

---

## 13. Happy path (one continuous story)

```text
1. Admin / FP&A creates model “FY26 Operating Plan”
      → BASE + Working + empty cells appear automatically

2. FP&A adds drivers & formulas; tweaks line items
      → Model Builder

3. FP&A opens workflow “FY26 Budget Cycle” with dept tasks
      → Workflow

4. Dept owners open Home → see their open tasks
      → Worksheet → enter / spread / copy-forward
      → Submit task

5. FP&A reviews submissions → Return or Approve
      → Reassign if ownership wrong

6. Optional: create Upside scenario, copy numbers, compare to BASE
      → Promote chosen path to Forecast

7. Sync actuals for closed months → run variance → add commentary

8. CFO locks Working (or a board draft version)
      → Worksheet becomes read-only for that version

9. Export board pack → download file for pack / board pack distribution

10. Next cycle: new version (copy-from) → seed if needed → repeat from step 3
```

---

## 14. State cheat sheet (what the user should expect)

| State | User can edit cells? | Typical next step |
|-------|----------------------|-------------------|
| Version **DRAFT / Working**, unlocked | Yes (if cell editable) | Enter plan, submit tasks |
| Task **PENDING / RETURNED** | Yes (within scope) | Edit → Submit |
| Task **SUBMITTED** | Usually wait for review | Approver Return / Approve |
| Task **APPROVED** | Cycle may continue elsewhere | Lock when cycle done |
| Version **LOCKED** | No (403) | Export / compare / start new version |
| Version **ARCHIVED** | No (retired) | Pick another version |

---

## 15. Screen map (where each phase lives)

| Phase | Primary screens |
|-------|-----------------|
| Land & monitor | Home |
| Structure | Model Builder, Drivers, Settings (entities) |
| Enter numbers | Worksheet, Domain tabs |
| What-if | Scenarios |
| Governance | Workflow / Budget, task Submit–Approve–Reassign |
| Reality check | Actuals sync, Variance |
| Close & share | Lock version, Reports export |

---

## 16. Out of scope / still thin in the product

These do not block the core flow above, but users may still see empty or toast-only UI for:

- Home KPI sparklines, 12-month R/E trend, cash bar series, owner avatars  
- Rich domain packs (hire plan, revenue waterfall, full cash statement)  
- Scenario waterfall / sensitivity / runway series  
- Variance commentary queue & department rollup  
- Settings: sync-source config, variance thresholds, workflow defaults  
- “Apply growth” style one-click transforms (if UI shows toast only)

Core path — **model → enter → workflow → lock → export** — is the supported finish line.
