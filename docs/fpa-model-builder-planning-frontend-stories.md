# Frontend User & Design Stories  
## Model Builder + Model Planning only

**Audience:** Frontend / design agents  
**Product:** Arcus FP&A  
**Companion:** [fpa-model-planning-vs-builder.md](./fpa-model-planning-vs-builder.md)  
**API map (non-budget):** [fpa-api-by-ui-section.md](./fpa-api-by-ui-section.md) § B.2–B.4  

---

# 0. Scope fence (read first)

## IN SCOPE — build these two product areas

| Area | Route suggestion | Screens |
|------|------------------|---------|
| **Model Builder** | `/forecasting/model-builder` (or existing models route) | A.3 Modules / Line Items / Dependency Map · A.4 Formula Trace / Mapping / Validation |
| **Model Planning** | `/forecasting/model-planning` (or planning workspace) | A.1 Planning Workspace · A.2 Scenario Comparison |

## OUT OF SCOPE — do **not** build, redesign, or call in this workstream

| Forbidden | Why |
|-----------|-----|
| Budget cycle create / open / validate / assign owners | Budget Planning — already separate |
| Workflow cockpit (`/forecasting/workflow`) | Already shipped |
| Submit-to-FP&A · FP&A accept/return · CFO approve/return | Budget workflow |
| Lock version · board pack · export board pack | Budget / CFO close |
| Owner budgeting worksheet “Submit my budget” as a budget task | Budgeting tab |
| Building a second “planning cycle admin” UI | Same as budget cycles — leave alone |
| Changing Home “workflow progress” to become a budget console | Out of scope |

**Hard rule for FE agents:** If a control would create, advance, approve, lock, or board-pack a **budget cycle**, it is **out of scope**. Hide it, omit it, or deep-link later — do not implement it here.

**Allowed context only:** Model Planning may *select* an existing model version / scenario (and later a cycle id as a **read-only filter** if the API already returns one). Selecting context ≠ managing the budget process.

---

# 1. Product intent (give the FE agent this mental model)

```text
Model Builder  =  design the calculator (formulas, modules, mappings)
        ↓ Publish (when backend ready)
Model Planning =  use the calculator (edit inputs/drivers, see KPIs, compare scenarios)
```

- **Builder users** change structure and formulas.  
- **Planning users** change assumptions and inputs. They never edit formulas.  
- **Budget/Workflow** is a different tab. Do not recreate it inside these screens.

---

# 2. Roles & permissions (UI behaviour)

| Role | Model Builder | Model Planning |
|------|---------------|----------------|
| FP&A Admin / power user | Full: create model, modules, formulas, validate, publish | Full view + edit inputs/drivers |
| Finance Manager / Analyst | Limited or full Builder if granted | Full Planning |
| Department Budget Owner | **No** Builder (redirect / empty state) | Edit **their** dept inputs only; calculated cells read-only |
| Viewer / Executive | No Builder | Read-only Planning (KPIs, grid, compare) |

**UI rules**

- Calculated cells: never show as editable inputs (no fake enabled state).  
- Actual / locked cells: read-only with distinct styling (icon/badge, not colour alone).  
- Builder routes: if role cannot build, show “You don’t have access to Model Builder” — do not soft-hide then allow deep-link edit.

---

# 3. Shared shell (both areas)

## 3.1 Global left nav (existing FP&A shell)

Highlight the correct item:

- **Model Builder** when on Builder routes  
- **Model Planning** when on Planning routes  

Do **not** add Budget or Workflow UI into these pages’ main chrome.

## 3.2 Top bar

- Global search (⌘K) — scope search placeholder by section:
  - Builder: `Search line items, modules, dimensions…`
  - Planning: `Search Arcus…` or `Search line items, scenarios…`
- Notifications / help / settings / avatar — existing patterns.

## 3.3 Empty & loading states (both)

| State | Behaviour |
|-------|-----------|
| No models | Builder: primary CTA “Create model”. Planning: “No models yet — ask FP&A to publish a model.” |
| Loading | Skeleton for KPI row + grid; do not flash empty error. |
| API 403 | Inline permission message, not a blank white page. |
| API 409 / validation | Surface server `message` + field errors; keep form values. |

---

# PART A — MODEL BUILDER  
## Design target: screens A.3 + A.4

**Persona:** FP&A Administrator  
**Goal:** Define how money is calculated, validate the model, publish when ready.  
**Non-goal:** Entering department budgets or running approvals.

---

## A.0 Builder header (shared on A.3 and A.4)

### Layout

```
[Model: FY2026 Financial Model ▾]   [Workspace: Budget 2026 ▾]
✓ Valid    ✓ Circular Check Passed
Last Published: May 12, 2026 9:15 AM by Sarah Delgado
[Validate Model]   [Test Calculation]   [Change History]   [Publish ▾]
```

### Design requirements

| Element | Behaviour |
|---------|-----------|
| **Model selector** | Lists models user can access. Changing model reloads entire Builder. |
| **Workspace selector** | Draft / working copy context for **preview values** in the line-item grid. This is **not** the Budget Workflow cycle admin UI. Label may say “Budget 2026” as a version/workspace name only. |
| **Valid chip** | Green if last validation has zero ERROR severity; red/amber otherwise. Live from last validate response — not a hard-coded label. |
| **Circular Check Passed** | Green only if dependency check found no cycles; failed = red + tooltip with cycle path when available. |
| **Last Published** | Show date + user if ever published; else “Never published”. |
| **Validate Model** | Triggers full-model validate; opens/ refreshes Exceptions + Validation Summary. |
| **Test Calculation** | Runs calc preview for current workspace; shows progress if async. |
| **Change History** | Opens audit log drawer/panel (same data as A.4 audit). |
| **Publish** | Primary action when valid. If backend publish not ready: disable with tooltip “Publish API coming” — **do not** fake-publish client-side. Dropdown submenu (notify / schedule) only if product confirms; otherwise single Publish. |

### User stories — header

#### MB-FE-01 — Select model and workspace
**As an** FP&A admin, **I want** to pick which model and workspace I’m editing **so that** formulas and preview numbers are scoped correctly.

**Acceptance**

- Model list loads from API; selection persists in URL query (`?modelId=&versionId=` preferred).  
- Changing either selector refetches modules, dimensions, line items, validation chips.  
- No budget-cycle create/edit UI appears in this header.

#### MB-FE-02 — Validate and see status chips
**As an** FP&A admin, **I want** Validate to update Valid / Circular chips **so that** I know if I can publish.

**Acceptance**

- Clicking Validate shows loading on button.  
- On success/failure, chips and Exceptions panel update.  
- Circular failure shows actionable message (path if API returns it).

#### MB-FE-03 — Publish (when available)
**As an** FP&A admin, **I want** to publish a valid model **so that** Planning can use a frozen recipe.

**Acceptance**

- Publish disabled when ERROR count > 0.  
- Confirm modal: “Publishing freezes this structure. Existing approved plans will not change until migrated.”  
- Success toast + Last Published updates.  
- **Out of scope:** migrating budget cycles, notifying via budget workflow.

---

## A.1 Screen — Modules, Line Items, Dependency Map (SRD A.3)

### Layout (3 columns + bottom map)

```
┌──────────────┬─────────────────────────────┬──────────────────┐
│ Modules tree │ Line Item Builder grid      │ Properties /     │
│ Dimensions   │                             │ Formula / Refs   │
├──────────────┴─────────────────────────────┴──────────────────┤
│ Dependency Map (module graph)                                 │
└───────────────────────────────────────────────────────────────┘
```

### Left — Modules tree

**UI**

```
[+ Module]  [Search modules…]

▾ Revenue Planning (8)
    Revenue Summary
    Units & Pricing          ← selected
    Discounts & Adjustments
    …
▸ Opex Planning (7)
▸ Workforce (6)
```

**Requirements**

- `(N)` = live line-item count for that module.  
- Selecting a leaf module loads the centre grid for that module.  
- Folders/modules expandable.  
- Search filters tree client-side or via API query.  
- **+ Module** opens create dialog: Name, Description, Time scale, Dimensionality multi-select, Calculation order.

#### MB-FE-04 — Browse modules
**As an** FP&A admin, **I want** a module tree with counts **so that** I can open the right calculation area quickly.

**Acceptance**

- Tree shows all modules for the model.  
- Count updates after add/delete line item without full page reload.  
- Empty model shows CTA “Create your first module”.

#### MB-FE-05 — Create / rename module
**As an** FP&A admin, **I want** to create a module and assign dimensions **so that** line items know how values are addressed.

**Acceptance**

- Required: name + at least Time (system).  
- Dimensionality multi-select from model dimensions.  
- On save, module appears in tree with `(0)`.

### Left — Dimensions panel

**UI**

```
[+ Dimension]  [Search…]

Time              Monthly / Jan 2026 – Dec 2026
Product           All Products (14)
Region            All Regions (6)
…
```

**Requirements**

- Subtitle = member count or horizon summary.  
- System dimensions (Time, Version, Scenario, Currency) show lock icon — cannot delete.  
- **+ Dimension** and member hierarchy editors in drawer (name, code, hierarchy toggle).

#### MB-FE-06 — Manage dimensions (UI)
**As an** FP&A admin, **I want** to add custom dimensions and members **so that** planning can slice by Dept/Region/Product.

**Acceptance**

- Create dimension → appears in list.  
- Add members with optional parent; reject circular parent with inline error.  
- Deactivate member = soft; still visible as inactive, not hard-deleted from UI list.

### Centre — Line Item Builder grid

**Title:** `Revenue Planning / Units & Pricing`  
**Tabs:** `Line Items` | `Templates` | `Validations` | `History`  
**Toolbar:** `+ Line Item` · view toggles · filter `All` · expand

**Columns**

| # | Line Item | Formula | Jan 2026 | Feb … | … |

**Row behaviour**

| Type | Formula column | Period cells |
|------|----------------|--------------|
| INPUT / Driver | *(Input)* or empty | Editable in Builder **preview** context (sample/workspace values) |
| CALCULATED | `=[Units Sold]*[Price]` + `fx` badge | Read-only computed preview |

**Footer:** `+ Add Line Item` · `10 line items` · `View: Monthly` · `Currency: USD`

#### MB-FE-07 — Create INPUT line item
**As an** FP&A admin, **I want** to add an input row **so that** planners have somewhere to type assumptions later.

**Acceptance**

- Dialog/fields: Name, Description, Data type, Format, Currency, Decimal places, Summary method, Display order, Validation rule (e.g. ≥ 0).  
- Type fixed to INPUT (or Driver label = INPUT).  
- No formula field for INPUT.  
- Row appears immediately; periods show blank or seeded zeros.

#### MB-FE-08 — Create CALCULATED line item with formula
**As an** FP&A admin, **I want** to define `=[A]*[B]` **so that** planners never compute Revenue by hand.

**Acceptance**

- Formula uses bracket names: `[Units Sold] * [Price]`.  
- Cross-module (when supported): `[Workforce.Headcount] * …`.  
- Inline Validate on formula → green “No issues” or specific error text.  
- Period cells never editable.  
- Saving formula that creates a circular ref: block save, show cycle path.

#### MB-FE-09 — Preview calculated values in Builder
**As an** FP&A admin, **I want** to see monthly preview numbers next to formulas **so that** I know the logic works before publish.

**Acceptance**

- Grid returns definition + preview values for selected workspace/version.  
- Changing an INPUT preview cell recalculates dependents in-grid (or after save + refresh).  
- This is **not** Model Planning and **not** a budget submission.

### Right — Properties / Formula Editor / References

**Tabs:** Properties · Formula Editor · References

**Properties (example: Revenue)**

- Name, Description  
- Format, Currency, Decimal places, Summary method  
- Dimensionality tags  
- Data type: Calculated / Input  
- Formula + Validate  

**References**

- Precedents list with module path  
- Used In (N) expandable  
- Created / Last modified by + timestamps  

#### MB-FE-10 — Inspect line item
**As an** FP&A admin, **I want** properties and references for the selected row **so that** I understand blast radius before editing a formula.

**Acceptance**

- Selecting a grid row updates the inspector without full page reload.  
- Used In count matches dependency API.  
- Formula Editor tab focuses the expression with syntax highlighting if available.

### Bottom — Dependency Map

**Controls:** `View: Module ▾` · `Layout: Left to Right ▾` · `Show Line Items` toggle · zoom · fullscreen

**Nodes:** modules (optionally listing line items).  
**Edges:** Direct (solid) · Indirect (dotted) · External Input (distinct).  
**Legend** required.

#### MB-FE-11 — Explore dependency map
**As an** FP&A admin, **I want** a visual module graph **so that** I can see how Units & Pricing feeds Revenue Summary.

**Acceptance**

- Map loads for selected module context (or whole model).  
- Toggle Show Line Items expands/collapses member lists in nodes.  
- Click node selects that module/line item in the tree/grid.  
- If API missing: show empty state “Dependency map API not available yet” — do not fake random graph data.

---

## A.2 Screen — Formula Trace, Mapping, Validation (SRD A.4)

Same Builder shell; this is the **governance** view of a module.

### Centre top — Line item grid (full chain)

Same grid pattern as A.3 but emphasize **Type** column: `Driver | Calculated`.

Example types: Starting ARR (Driver), Net ARR (Calculated), EBITDA (Calculated), Cash Balance with `PREVIOUS(...)`.

### Formula Trace panel

**Tabs:** Summary · Precedents (n) · Dependents (n) · Calculation Chain  

**Calculation Chain:** visual flow into selected result (e.g. EBITDA) with **current values** on nodes.

#### MB-FE-12 — Trace a formula
**As an** FP&A admin, **I want** precedents/dependents/chain for EBITDA **so that** I can debug logic visually.

**Acceptance**

- Selecting a calculated row opens Trace with formula text.  
- Chain shows input → intermediate → result with values.  
- Legend: Drivers / Calculated / Result.

### Data Mapping panel

**Header:** `96% Mapped` (live computed)  
**Filters:** search · All Sources · Show unmapped only  

| Source Field | Source System | Target Line Item | Status |

Status icons: mapped ✓ · warning ⚠ · unmapped  

#### MB-FE-13 — Review mappings
**As an** FP&A admin, **I want** to see source→line mappings and % complete **so that** I know what’s blocking publish.

**Acceptance**

- % Mapped = mapped / required, never a stale hard-coded 96.  
- Show unmapped only filters list.  
- Click row opens mapping detail drawer (source system, field, target, status).  
- Creating/editing mapping UI if API exists; else list + empty CTA.

### Model Audit Log

| Time | User | Action | Details |

Actions examples: Updated Formula, Updated Mapping, Added Line Item, Updated Driver, Validated Module, Imported Data.

#### MB-FE-14 — View audit log
**As an** FP&A admin/auditor, **I want** a chronological change list **so that** modelling decisions are traceable.

**Acceptance**

- Filter by user / action / date (if API supports).  
- Entries read-only.  
- “View all” paginates.

### Exceptions + Validation Summary

**Exceptions tabs:** Errors (n) · Warnings (n) · Info (n)  

| Type | Line Item / Mapping | Issue | Impact (High/Med/Low) |

**Validation Summary:** donut — Total checks · Passed · Warnings · Errors.

#### MB-FE-15 — Act on validation results
**As an** FP&A admin, **I want** grouped exceptions and a summary donut **so that** I can clear blockers before publish.

**Acceptance**

- Tab counts match rows (or total with pagination + View all).  
- Clicking an exception focuses the related line item/mapping when possible.  
- Publish remains disabled while Errors > 0.

### Impact Analysis (what-if)

**Title:** `Impact Analysis (if Net ARR +5%)`  
Charts: Base vs simulated for downstream metrics (EBITDA, Cash Balance) with delta labels.

#### MB-FE-16 — Run impact preview
**As an** FP&A admin, **I want** a sandboxed +5% simulation **so that** I see downstream impact without creating a scenario.

**Acceptance**

- Control: pick line item + delta % or absolute.  
- Charts update from preview API; **no** persisted scenario created.  
- If API missing: disabled panel with explanation — do not invent chart numbers.

---

# PART B — MODEL PLANNING  
## Design target: screens A.1 + A.2

**Persona:** Finance Manager, Analyst, Department Owner, CFO (view)  
**Goal:** Enter assumptions, see results, compare scenarios, collaborate lightly.  
**Non-goal:** Running the annual budget approval process (that is Workflow / Budgeting).

---

## B.0 Planning header (shared A.1 + A.2)

```
Model Planning
[Model Version: v3.2 Working  Latest ▾]   [Context: FY2026 plan ▾]   ← context filter only
Scenario tabs:  Budget 2026 | Forecast Q3 | Best Case | Base Case | Downside
[Compare]   [Actions ▾]   ← Actions menu MUST NOT include budget approve/lock/board-pack
```

### Critical scope rules for this header

| Control | Allowed | Forbidden |
|---------|---------|-----------|
| Model Version dropdown | Yes — switch version | Creating budget cycles |
| Context / cycle dropdown | Yes — **read-only list** of existing contexts if API provides; label as “Plan context” | Create/open/validate/assign owners on cycles |
| Scenario tabs | Yes — switch `scenarioId` | — |
| **Compare** | Yes — navigate to A.2 | — |
| **Actions** | Export grid CSV, refresh calc, copy link | Submit to FP&A, CFO approve, Lock, Board pack, Return plan |

#### MP-FE-01 — Scope the page
**As a** planner, **I want** version + scenario (and optional context) selectors **so that** every widget on the page uses the same scope.

**Acceptance**

- Changing version or scenario refetches KPIs, grid, chart, drivers, comments.  
- No stale widget left on previous scenario.  
- URL reflects `modelId`, `versionId`, `scenarioId` (and `cycleId` only if used as filter).  
- Zero budget workflow side-effects on selector change.

---

## B.1 Screen — Planning Workspace (SRD A.1)

### B.1.1 KPI cards

**Five cards** (example):

| Card | Value | Delta |
|------|-------|-------|
| Revenue | $128.4M | ↑ 8.7% vs Plan |
| Opex | $72.6M | ↑ 6.3% vs Plan |
| EBITDA | $55.8M | ↑ 12.4% vs Plan |
| Cash Runway | 14.6 Months | ↓ 1.1 MoM |
| Variance to Plan | $3.9M | ↑ 2.1% of Revenue |

Each card: label · value · delta · sparkline.

**Footer of KPI row:** `All values in USD` · `View by: Total Company ▾` · refresh icon.

#### MP-FE-02 — View KPIs
**As a** finance manager, **I want** headline KPIs with sparklines **so that** I see plan health without opening the grid.

**Acceptance**

- Cards load for current version + scenario.  
- `View by` changes aggregation dimension (e.g. Total Company vs a department) and refetches.  
- Cash Runway shows **“Cash Generative”** when burn ≤ 0 (not a negative months figure).  
- Refresh triggers recalculate (if API) then refetch cards — **not** a budget submit.

### B.1.2 Planning Grid

**Title:** Planning Grid · subtitle currency  
**Toolbar:** `%` toggle · Auto-fit · Columns · ⋯  

**Structure (as designed)**

- Rows: dimension members (e.g. departments) + bold **Total Company** rollup row  
- Columns: months + FY total  

**Cell rules**

| State | Editable? | Visual |
|-------|-----------|--------|
| INPUT | Yes (if permitted) | Default input |
| CALCULATED | Never | `fx` / calculated badge |
| ACTUAL | Never | Actual badge |
| LOCKED | Never | Lock icon |
| ERROR | No | Error badge + tooltip |
| PENDING_CALC | No | Spinner/subtle pending |

**After edit:** optimistic UI optional; must reconcile with server response; recalculated dependents update in place.

**`%` toggle:** display-only transform (of total or PoP) — same payload, different format. No second fetch required unless API demands it.

#### MP-FE-03 — Edit planning inputs
**As a** budget owner, **I want** to edit INPUT cells in my department rows **so that** I can set plan assumptions.

**Acceptance**

- Only INPUT + permitted + unlocked cells accept edit.  
- CALCULATED/ACTUAL/LOCKED ignore click or show read-only popover.  
- Owner scoped to own department(s); other depts read-only or hidden per access.  
- Total Company row is **not** independently editable (live aggregate).  
- Spread / copy-forward / apply-growth available from cell menu if APIs exist.  
- **Do not** wire “Submit to FP&A” from this grid in this workstream.

#### MP-FE-04 — Concurrency conflict (when API supports)
**As a** planner, **I want** a conflict warning if someone else saved first **so that** I don’t overwrite silently.

**Acceptance**

- On 409: dialog with current value, who changed, when; choices Reload / Compare.  
- Never silently win with stale data.  
- If API has no `record_version` yet: skip UI but don’t invent client-only locking.

### B.1.3 Revenue vs Expense trend

Four series: Revenue Actual / Revenue Plan / Opex Actual / Opex Plan.  
Controls: Actuals through (derived from cut-off — display, preferably not a free rogue setting) · Frequency Monthly/Quarterly/Annual · Edit Chart (optional).

#### MP-FE-05 — View trend chart
**As a** finance manager, **I want** actual vs plan trends **so that** I see divergence visually.

**Acceptance**

- Series respect current scenario for Plan lines.  
- Frequency change re-aggregates (server or client per API).  
- Empty state if line items missing.

### B.1.4 Driver Assumptions

| Driver | Prior actual | Current plan | Change |
|--------|--------------|--------------|--------|
| Volume Growth | 12.5% | 9.8% | −2.7 pp |
| Headcount Plan | 512 | 568 | +56 |

**Edit Drivers** opens editor.  
Change formatting: percentage-point vs absolute from driver unit — not hard-coded per row name.

#### MP-FE-06 — Edit drivers
**As a** planner, **I want** to change drivers **so that** the model recalculates dependents.

**Acceptance**

- Save driver → dependent grid/KPI refresh.  
- Materiality approval gate: if backend returns “pending approval”, show pending state — **do not** implement full budget approval inbox here.  
- Footnote for `pp` when relevant.

### B.1.5 Right rail — Comments / Tasks / Activity

**Tabs:** Comments · Tasks (badge count) · Activity  

**Comments**

- Composer with attachment icon  
- Thread: author, time, @mention, body, Reply, optional reactions  
- View all → paginated drawer  

**Tasks (display)**

- List title · assignee · due date  
- View all  

**Scope for this workstream**

- Comments: **in scope** at planning page / model / cell level as APIs allow.  
- Tasks: **read/list in scope**; creating workflow-return tasks tied to budget approve/return is **out of scope**.  
- Do **not** build Approvals action cards that call budget approve/return APIs.

#### MP-FE-07 — Comment in context
**As a** planner, **I want** to comment on the plan **so that** discussion stays on the page.

**Acceptance**

- Post comment appears in thread.  
- @mention autocomplete users; notification is backend’s job.  
- Scope stored (cycle/model/cell) per API.

### B.1.6 Workflow footer — OUT OF SCOPE for implementation

The SRD shows Draft → Submitted → Under Review → Approved.

**FE instruction for this workstream:**

- **Omit** the workflow footer, **or** show a static “Approvals managed in Workflow” link that navigates away.  
- Do **not** implement stage advancement, due dates editing, or approve/return from this footer.

---

## B.2 Screen — Scenario Comparison (SRD A.2)

### Header difference

Scenario control becomes **multi-select** (“5 selected”), not a single active tab.  
Compare screen is inherently multi-scenario.

### B.2.1 KPI cards (vs Budget / vs anchor)

Cards compare active/current scenario set against an **anchor** (typically Budget).  
Confirm anchor with product; default UX: Variance always vs Budget column.

#### MP-FE-08 — Comparison KPIs
**As a** CFO, **I want** KPIs vs Budget **so that** I see uplift/risk at a glance.

**Acceptance**

- Delta labels say `vs Budget` (or configured anchor).  
- Same sparkline rules as A.1.  
- No approve/lock actions on this row.

### B.2.2 Scenario comparison table

**Columns:** Metric · each selected scenario · Variance to Budget $ · Variance to Budget %  

**Example metrics:** Revenue, COGS, Gross Profit, Gross Margin %, Opex, EBITDA, EBITDA Margin %, Capex, Headcount  

**Toolbar:** `%` / `$` · Columns · ⋯  

**Formatting:** use `variance_direction` (higher favourable vs lower favourable) for colour — e.g. COGS +% is unfavourable.

#### MP-FE-09 — Compare scenarios side-by-side
**As a** CFO, **I want** a metric×scenario table **so that** I see the range of outcomes.

**Acceptance**

- Multi-select scenarios updates columns.  
- Variance columns always vs fixed anchor.  
- Favourable/unfavourable colours respect line-item direction.  
- Row set configurable/extendable — not forever hard-coded to 9 rows if API returns a list.

### B.2.3 Variance waterfall (bridge)

Budget → Price / Volume / Mix / … → Forecast.  
Controls: `Bridge by: Revenue ▾` · `Edit Bridge` (FP&A admin only; owners hidden).

#### MP-FE-10 — View waterfall
**As an** analyst, **I want** a bridge chart **so that** I can explain *why* Revenue moved.

**Acceptance**

- Chart shows start, steps, end.  
- Bridge by changes metric and refetches.  
- Edit Bridge: admin-only; if config API missing, hide Edit.  
- Do not block Compare shipping on Edit Bridge.

### B.2.4 Scenario assumptions (sliders)

Drivers across scenarios with slider visualization.  
Requires min/max on drivers when available; if missing, show numeric inputs only (no fake sliders).

#### MP-FE-11 — Adjust scenario assumptions
**As an** analyst, **I want** to tweak scenario driver overrides **so that** I can explore what-ifs.

**Acceptance**

- Edits write scenario overrides (not base plan) via scenario APIs.  
- Materiality pending state if API requires approval — no budget inbox UI.  
- Sliders only when min/max present.

### B.2.5 Right rail — Comments / Approvals / Activity

**Comments:** same as A.1 — in scope.  

**Approvals tab — OUT OF SCOPE actions**

- Do **not** implement Open → approve/return against budget plan APIs.  
- Replace with: “Open in Workflow” deep link, or hide Approvals tab until a non-budget approvals API exists.

**Scenario Notes:** show link/placeholder to narrative if API exists; else hide.

### B.2.6 Footer

`Last updated by …` · `Data Status: All data synced` · link to Data Hub  

#### MP-FE-12 — Sync status
**As a** finance manager, **I want** to see if actuals are synced **so that** I trust the numbers.

**Acceptance**

- Status from API when available (`SYNCED` / `STALE` / `PARTIAL`).  
- If no API: omit status pill rather than hard-code “All data synced”.

---

# 4. Cross-cutting design rules

1. **One shared grid component** with modes: `builder` | `planning` — do not fork three grids.  
2. **Accessibility:** cell state not by colour alone; badges/icons required.  
3. **Density:** compact institutional tables for 13–14″ laptops; sticky first column + header.  
4. **No cards in Builder chrome** for KPIs — Builder is tool-like; Planning owns KPI cards.  
5. **Don’t invent numbers** when APIs 404 — empty/disabled states.  
6. **Don’t call budget endpoints** listed in §0.  
7. **Publish / Validate** live only in Builder.  
8. **Formula editing** live only in Builder.

---

# 5. Suggested FE build order (within this fence)

```text
1. Shell + routing for Model Builder and Model Planning (nav highlight)
2. Builder: model/workspace header + modules tree + line item grid + properties
3. Builder: formula validate UX + calculated preview
4. Builder: validation/exceptions panels + audit log
5. Builder: dependency map + formula trace (as APIs land)
6. Builder: mappings panel + publish button (wire when API ready)
7. Planning: header selectors + KPI cards + planning grid edit
8. Planning: drivers panel + trend chart
9. Planning: comments rail
10. Planning: Scenario Comparison table + KPIs
11. Planning: waterfall + assumption sliders (as APIs land)
```

Skip anything that requires budget submit/approve/lock.

---

# 6. API touchpoints FE may use (non-budget)

Base: `/api/v1/fpa`

**Builder-oriented**

- `POST/GET /models`, `POST /models/setup`, `GET/PUT /models/{id}`  
- `GET/POST /models/{id}/line-items`, bulk line items  
- `POST /models/{id}/formulas`, `PUT /formulas/{id}`  
- `POST /formulas/validate`, `POST /formulas/dependency-check`  
- `GET /formulas/{id}/impact-map`  
- `GET/POST /models/{id}/drivers`, `PUT /drivers/{id}`  
- `PUT /models/{id}/dimensions`, `GET /dimensions`  
- `POST /models/{id}/validate`  
- Versions: `POST /versions`, seed-cells  

**Planning-oriented**

- `GET /home/dashboard?modelId=` (KPIs — ok to reuse)  
- `GET /models/{id}/grid`, cell update/bulk/spread/copy-forward/apply-growth  
- `GET/POST` cell comments  
- `GET /scenarios`, `POST /scenarios`, copy, **compare**  
- Drivers list/update  

**Do not use in this workstream**

- `/budget-cycles/**` mutations (create, open, submit-fpa, fpa-accept, cfo-approve, lock, board-pack)  
- Workflow approve/return that advances budget state  
- Board pack download as a Builder/Planning feature  

*(Read-only `GET /budget-cycles` as a context label is optional and discouraged unless product insists; prefer version + scenario only.)*

---

# 7. Acceptance checklist for FE handoff

### Model Builder
- [ ] Admin can open Builder, select model/workspace  
- [ ] Modules tree + line item grid + properties work  
- [ ] INPUT vs CALCULATED behaviour correct  
- [ ] Formula validate shows real errors  
- [ ] Validation chips + exceptions panel update after Validate  
- [ ] No budget/workflow controls on Builder  

### Model Planning
- [ ] Version + scenario scope all widgets  
- [ ] KPI cards + sparklines + View by  
- [ ] Grid edits INPUT only; calculated/actual locked  
- [ ] Drivers panel edits recalculate  
- [ ] Compare screen multi-scenario table + variance direction colours  
- [ ] Comments work without budget APIs  
- [ ] **No** submit/approve/lock/board-pack anywhere on these pages  

---

# 8. Copy for empty / blocked states

| Situation | Copy |
|-----------|------|
| Owner opens Builder | “Model Builder is limited to FP&A admins. Use Model Planning to enter your numbers.” |
| Planning with no model | “No published model yet. Ask FP&A to build and publish a model first.” |
| Publish disabled | “Fix validation errors before publishing.” |
| Dependency map API missing | “Dependency map will appear when the model graph API is available.” |
| Approvals tab hidden | (hidden) — do not show fake approvals |

---

# 9. One-line brief for the frontend agent

> Build **Model Builder** (design formulas/modules/validate/publish UI) and **Model Planning** (KPIs, input grid, drivers, scenario compare, comments).  
> **Do not touch Budget or Workflow** — no cycle admin, no approve/return/lock/board-pack.  
> Owners edit assumptions; only Builder edits formulas.

---

**End of frontend user & design stories.**
