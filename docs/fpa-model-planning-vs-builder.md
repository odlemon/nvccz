# FP&A — Model Planning vs Model Builder (combined)

**Audience:** product, FE, API  
**Sources:** SRD PDF · UI screenshots A.1–A.4 · user-story backlog (MB-*/MP-*) · screen backend requirements · existing `/api/v1/fpa` APIs  
**Related:** [fpa-user-flow.md](./fpa-user-flow.md) · [fpa-api-by-ui-section.md](./fpa-api-by-ui-section.md) · [fpa-workflow-approvals-api.md](./fpa-workflow-approvals-api.md) · [fpa-budgeting-api.md](./fpa-budgeting-api.md)

This is the **canonical mental model**. It reconciles earlier “Planning first” pragmatism with the product rule that **Model Planning cannot operate without a published model**.

---

## One-sentence rule

> **Model Builder defines the logic; Model Planning operates the plan.**

A department manager changes **Headcount** or **Marketing Spend** — not `=[Units Sold]*[Price]` and not a dependency DAG.

---

## Three systems — do not conflate

| System | What it is | Who | Already in this repo? |
|--------|------------|-----|------------------------|
| **Model Builder** | Authoring studio: modules, line items, formulas, dimensions, mappings, validate, **publish** | FP&A admin | Partial (setup, line items, drivers, formulas, validate). Missing: first-class modules, publish gate, dependency-map UI API, data-mapping board, impact-preview, allocation rules |
| **Model Planning** | Operational workspace: version + cycle + scenario → KPIs, grid, drivers, compare, comments, slim workflow | Owners, finance, CFO | Partial (home KPIs, grid, scenarios compare, drivers, tasks). Missing: cycle-scoped planning aggregate, trend chart, waterfall bridge, concurrency `record_version`, material driver approval |
| **Budget Planning** | One *use case* of planning: annual budget cycle submit → FP&A → CFO → lock → board pack | Same as Workflow tab | **Largely shipped** (`/budget-cycles/*`, workflow cockpit) |

```text
MODEL BUILDER  →  publish model  →  MODEL PLANNING  →  runs a cycle
                                                      (e.g. Annual Budget = Budget Planning)
```

**Budget Planning runs inside Model Planning’s grid**, but Model Planning is broader (forecasts, rolling, scenario modelling). The Workflow tab is the full control room; Planning screens show a compact tracker.

---

## Shared objects

| Concept | Meaning | Example |
|---------|---------|---------|
| Model | Whole financial machine | FY2026 Corporate Financial Model |
| Module | Pack inside a model | Revenue Planning, Workforce |
| Line item | Row (INPUT / CALCULATED / IMPORTED / …) | Units Sold, Revenue, EBITDA |
| Formula | Bracket syntax for CALCULATED rows | `=[Units Sold]*[Price]` |
| Driver | Assumption knob (often INPUT + library) | Volume Growth, FX rate |
| Dimension | Slice | Time × Dept × Product × Version × Scenario |
| Version | Snapshot of structure/numbers | v3.2 Working → published → Locked |
| Scenario | What-if overlay | Budget, Best Case, Downside |
| Cell | One value at an intersection | Revenue · Jan · Sales · Budget · Working |
| Planning cycle | Time-boxed process | FY2026 Budget |

**Product rule:** Builder edits must never silently rewrite an approved plan. Gate: **Validate → Test → Publish**. Live cycles move to a new published version only via **explicit migrate** (MB-25).

---

## Screens ↔ systems

| Screen | System | Story epics |
|--------|--------|-------------|
| A.3 Modules / dependency map | Model Builder | MB-09–17 |
| A.4 Formula trace / mapping / validation | Model Builder | MB-14–22 |
| A.1 Planning Workspace | Model Planning | MP-05–14 |
| A.2 Scenario Comparison | Model Planning | MP-15–20 |
| `/forecasting/workflow` | Budget Planning (control room) | already shipped |

---

## Build order (locked)

**Logical / product order (authoritative):** finish **Model Builder through MB-23 Publish** before treating Model Planning as complete. Planning has nothing governed to consume without a published model.

```text
PART 1 — MODEL BUILDER (first)
  MB-01..03  Model foundation
  MB-04..08  Dimensions (+ hierarchy, aggregation)
  MB-09..10  Modules + dimensionality
  MB-11..15  Line items + formulas + dependencies
  MB-16..18  Circular check, dependency map, allocations
  MB-19      Data mapping
  MB-20..22  Full validate, test-calculate, impact-preview
  MB-23..26  Publish, audit, migrate cycle, security

PART 2 — MODEL PLANNING (after MB-23 works)
  MP-01..04  Cycle setup / validate / open / baseline
  MP-05..14  Workspace (selectors, KPIs, grid, drivers, rail)
  MP-15..20  Scenarios, compare, waterfall, sync status
  MP-21..26  Submit → review → consolidate → lock → roll-forward
```

**What that means for *this* codebase (pragmatic):**

- Much of **grid / KPIs / scenarios / budget-cycle workflow** already exists and can keep serving FE while Builder gaps close.
- Do **not** invent a second cycle system for Model Planning — reuse `/budget-cycles` (MP-01 = same object; `planning_type` differentiates). Prefer `/budget-cycles` over a dual `/planning-cycles` surface unless product forces rename with aliases.
- Do **not** rebuild the grid three times — one grid component with modes: builder preview | planning edit | budgeting worksheet.
- **Correct the earlier recommendation** that said “Planning first, Builder second.” That was FE-wiring pragmatism. Product dependency is **Builder → Publish → Planning**. Incremental FE polish on Planning is fine in parallel; backend epic priority is Builder through Publish.

---

## End-to-end flow

```text
1. FP&A — Model Builder
   create model → dimensions → modules → line items → formulas
   map sources → validate → test calc → publish (immutable published version)

2. FP&A — Planning cycle (Budget or other type)
   pick published model + version → validate setup → open
   load actuals/baseline → assign owners

3. Owners — Model Planning
   select version + cycle + scenario
   edit INPUT cells / drivers → engine recalculates
   comment / tasks → submit

4. FP&A / CFO — Planning strip or Workflow
   compare scenarios → return/approve → lock → board pack / reports
```

**Analogy:** Builder = named formulas + sheet design. Planning = fill the locked template. Budget Planning / Workflow = who submitted and who signed off.

---

## Driver vs INPUT (open, but working stance)

UI A.4 labels some rows **Driver** and others **Calculated**. Schema elsewhere uses `INPUT | CALCULATED | IMPORTED | …` plus a separate **Driver Library**.

**Working stance until product confirms:**  
`Driver` in the Builder grid = an **INPUT** line item that is also registered (or registerable) in the Driver Library / materiality approval path — not a third conflicting enum. Confirm before freezing schema.

---

## Workspace vs Planning Cycle (open, but working stance)

Builder header shows **Workspace: Budget 2026**. Planning shows **Planning Cycle: FY2026 Budget**.

**Working stance:**  
- **Planning Cycle** = `PlanningBudgetCycle` (process: owners, deadlines, status).  
- **Workspace** in Builder = working **model version / draft copy** used for structure preview (not necessarily the same ID as the cycle). Same *display name* does not imply same ID. Confirm with product before joining tables.

---

## Open product items (block precise schema)

1. Variance bridge config schema (MP-18)
2. Driver slider min/max (MP-16)
3. Driver vs INPUT taxonomy (above)
4. `updated_by` / `updated_at` on line items / formulas
5. Impact-preview contract (MB-22)
6. Validation result `impact` High/Medium/Low (MB-20)
7. Scenario Notes / Planning Narrative object (A.2.5)
8. Data sync status states (MP-20)
9. Builder Workspace vs Planning Cycle ID space (above)
10. Publish dropdown submenu options (MB-23)

---

## Already shipped vs still to build (high level)

| Area | Status |
|------|--------|
| Model create/setup, list/get/update | Exists (`POST /models`, `/models/setup`) |
| Line items, formulas validate/circular/impact-map | Partial |
| Drivers CRUD (no delete / no materiality approval) | Partial |
| Grid + cell edit + spread/growth | Exists |
| Scenarios create/copy/compare/promote | Exists |
| Home KPIs | Exists |
| Budget cycles + workflow cockpit | Exists |
| First-class Modules API | **Missing** |
| `POST …/publish` + publish history | **Missing** |
| Module dependency-map API | **Missing** |
| Data mappings board + % mapped | **Missing** |
| Sandboxed impact-preview | **Missing** |
| Planning trend / waterfall / kpi-summary by cycle | **Missing or composed** |
| Cell optimistic concurrency (`record_version`) | **Missing** |

---

## Confusion to avoid

1. Model Planning ≠ Model Builder with a prettier grid.  
2. Model Planning ≠ Budget Workflow cockpit (slim strip vs full page).  
3. Scenarios: defined/available in Builder context; switched/compared in Planning.  
4. Drivers vs cells: knobs vs detailed grid; formulas bind them.  
5. Do not dual-ship `/planning-cycles` if `/budget-cycles` already is the cycle object.

---

## Acceptance (this combined view)

- [x] Three systems distinguished (Builder / Planning / Budget Planning)
- [x] Screens A.1–A.4 mapped
- [x] Build order locked: **Builder through Publish (MB-23), then Planning**
- [x] Prior “Planning first” recommendation superseded for backend epic order
- [x] Open product questions listed with working stances
