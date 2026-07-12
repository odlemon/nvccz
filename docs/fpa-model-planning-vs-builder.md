# FP&A — Model Planning vs Model Builder

**Audience:** product, FE, API  
**Source:** [Arcus_FPA_Model_Planning_and_Model_Builder_SRD_with_UI_Inspiration.pdf](./Arcus_FPA_Model_Planning_and_Model_Builder_SRD_with_UI_Inspiration.pdf)  
**Related:** [fpa-user-flow.md](./fpa-user-flow.md) · [fpa-api-by-ui-section.md](./fpa-api-by-ui-section.md) · [fpa-workflow-approvals-api.md](./fpa-workflow-approvals-api.md)

This doc locks the **mental model** for the two tabs. It is not an API contract for new endpoints.

---

## One-sentence rule

> **Model Builder defines the logic; Model Planning operates the plan.**

| Tab | Audience | Job |
|-----|----------|-----|
| **Model Builder** | FP&A admin / power user | Design *how* numbers are calculated (structure, formulas, mappings) |
| **Model Planning** | Budget owners, finance managers, CFO | Enter *assumptions*, see results, compare scenarios, submit/approve |

A department manager should change **Headcount** or **Marketing Spend** — not edit `=[Units Sold]*[Price]` or stare at a dependency DAG.

```text
Model Builder
  → defines modules, line items, formulas, mappings
Published model structure
  → available to planners
Model Planning
  → edit drivers / input cells
Calculation engine
  → recalculates dependents
Planning results
  → review, compare, approve
Reports / dashboards / board pack
```

---

## Shared objects (both tabs)

Both hang off the **same planning model**. Different faces of one machine.

| Concept | Plain language | Example |
|---------|----------------|---------|
| **Model** | The whole financial machine | FY2026 Corporate Financial Model |
| **Module** | A pack inside the model | Revenue Planning, Workforce, Opex |
| **Line item** | A row | Units Sold, Price, Revenue, EBITDA |
| **Formula** | How a calculated row is derived | `=[Units Sold]*[Price]` |
| **Driver** | Assumption planners may change | Volume Growth 8%, FX rate |
| **Dimension** | How a value is sliced | Time × Dept × Product × Scenario × Version |
| **Version** | Snapshot of structure/numbers | v3.2 Working → Locked |
| **Scenario** | What-if on a version | Budget 2026, Best Case, Downside |
| **Cell** | One number at an intersection | Revenue · Jan 2026 · Sales · Budget · Working |
| **Planning cycle** | Process wrapper (deadlines, owners) | FY2026 Budget |

**Product rule:** changing Builder logic must **not** silently rewrite an already-approved plan. SRD gate: **Validate → Test → Publish** before planners use a new structure.

---

## Tab 1 — Model Builder

**Purpose:** build and govern the machine (authoring studio, not the owner spreadsheet).

### SRD workflow

```text
Create model → calendar/currency → dimensions → modules
  → line items (Input vs Calculated) → formulas → data mapping
  → dependency graph → validate → test calc → publish
  → available in Model Planning
```

### UI inspiration (SRD screenshots)

**A.3 — Modules / line grid / dependency map**

- Left: Modules tree + Dimensions
- Center: line-item grid (Formula + monthly values) + Dependency Map
- Right: Properties / Formula Editor / References
- Header: Valid / Circular Check Passed · Validate · Publish

**A.4 — Formula Trace, Mapping, Validation**

- Line Item Builder (Driver vs Calculated)
- Formula Trace (precedents / dependents / calculation chain)
- Data Mapping (ERP/CRM/HR → line items)
- Audit log, Exceptions, Validation Summary, Impact Analysis

### Closest backend today

| Need | Path |
|------|------|
| Atomic create | `POST /api/v1/fpa/models/setup` |
| Structure | line items, drivers, formulas, dimensions, validate |
| Circular / impact | `POST /formulas/dependency-check`, `GET /formulas/{id}/impact-map` |

See [fpa-api-by-ui-section.md](./fpa-api-by-ui-section.md) § B.3.

---

## Tab 2 — Model Planning

**Purpose:** run the plan against a usable/published model version + cycle + scenario.

Planners:

1. Pick **model version** + **planning cycle** + **scenario**
2. Edit **authorised inputs / drivers** (not formulas)
3. Watch KPIs and the grid recalculate
4. Compare scenarios, comment, complete tasks, submit/approve

### UI inspiration (SRD screenshots)

**A.1 — Planning Workspace**

- Header: Model Version + Planning Cycle + scenario tabs + Compare / Actions
- KPI cards (Revenue, Opex, EBITDA, Cash Runway, Variance)
- Planning Grid (department × months)
- Lower: trend chart + Driver Assumptions
- Footer workflow strip: Draft → Submitted → Under Review → Approved
- Right rail: Comments / Tasks / Activity

**A.2 — Scenario Comparison**

- Multi-scenario selection
- Side-by-side metrics + variance $/%
- Variance waterfall (“bridge”)
- Scenario assumptions comparison
- Right rail: Comments / Approvals / Activity

### Closest backend today

| Need | Path |
|------|------|
| KPIs | `GET /home/dashboard?modelId=` |
| Grid | `GET /models/{id}/grid` + cell update/spread/growth |
| Compare | `POST /scenarios/{id}/compare` |
| Drivers | `GET/POST /models/{id}/drivers`, `PUT /drivers/{id}` |
| Tasks / cycle | `/tasks/my-tasks`, `/budget-cycles/*` |

In older docs, **Planning Worksheet** ≈ this Model Planning grid. See [fpa-api-by-ui-section.md](./fpa-api-by-ui-section.md) § B.2 / B.4.

---

## End-to-end flow (how the tabs cooperate)

```text
1. FP&A — Model Builder
   create FY2026 model, modules, line items, formulas, mappings
   validate → publish (or lock a version for planning)

2. FP&A — Planning cycle (Budgeting / Workflow)
   select published model + version
   actuals cut-off, assign department owners

3. Owners — Model Planning
   enter drivers / dept inputs
   engine recalculates Revenue, Payroll, EBITDA, Cash, …
   comment, tasks → Submit

4. FP&A / CFO — Planning strip or Workflow tab
   compare Budget vs Forecast vs Downside
   return or approve → lock → board pack / reports
```

**Analogy:** Builder = Excel *named formulas + sheet design*. Planning = the workbook people *fill in* after the template is locked.

---

## Confusion to avoid

1. **Model Planning ≠ Model Builder with a prettier grid.** Same data model; different permissions and UX.
2. **Model Planning ≠ Annual Budgeting Workflow cockpit.** Planning = enter and see numbers. Workflow (`/forecasting/workflow`) = who submitted / approve / lock / board pack. Screenshots put a *slim* workflow strip inside Planning; the Workflow tab is the full control room.
3. **Scenarios live in both places.** Builder may define which scenarios exist; Planning *switches and compares* them.
4. **Drivers vs cells.** Drivers = assumption knobs; cells = detailed grid. Owners edit drivers + input cells; they do not edit formula definitions.

---

## Known SRD gaps vs current backend (awareness)

| SRD concept | Today |
|-------------|--------|
| First-class **Modules** | Mostly `lineItem.category` / domain filters |
| Explicit **Publish** + history/checksum | Validate exists; no dedicated publish gate |
| Model-wide **dependency map** | Per-formula impact-map + circular check |
| Rich **data mapping** UI | Partial / not a full source→line status board |
| Single **Model Planning** aggregate | FE composes home + grid + scenarios + tasks |

---

## Recommended first implementation slice

**Decision (locked for next build):** start with **Model Planning workspace composition**, then Model Builder modules/publish.

| Phase | Scope | Why first / second |
|-------|--------|---------------------|
| **1 — Model Planning** | Harden FE workspace against existing APIs: context bar (version/cycle/scenario), KPIs, dept grid, drivers panel, scenario compare, slim right rail (comments/tasks). Add only small backend gaps if FE is blocked (e.g. planning aggregate, waterfall). | Planners use this daily; grid/KPIs/compare already exist; matches screenshots A.1–A.2 fastest. |
| **2 — Model Builder** | First-class modules, publish gate + history, richer dependency map / mapping / validation UX. | Larger schema + governance; must not silently alter approved plans; builds on Phase 1 once planners have a stable surface. |

Do **not** treat Builder as “done” without Publish; do **not** block Planning FE on Modules if category filters are enough for v1.

---

## Acceptance (this doc)

- [x] Mental model documented for FE/API
- [x] Screenshots A.1–A.4 mapped to tabs
- [x] Relationship to Workflow / Budgeting clarified
- [x] Next build slice chosen (Planning first, Builder second)
