# What is going on: Model Builder vs Model Planning

**Read this if you only want one document.**  
It is the final decision on how Arcus FP&A’s two tabs work, how they connect to Budgeting/Workflow, and what we build in what order.

**Frontend build brief (Builder + Planning only, no Budget):**  
[fpa-model-builder-planning-frontend-stories.md](./fpa-model-builder-planning-frontend-stories.md)  
**List / create / detail navigation (why + how):**  
[fpa-model-builder-list-create-navigation.md](./fpa-model-builder-list-create-navigation.md)

---

## The short version

Think of a **calculator you design once**, then **everyone uses**.

| Tab | Job | Who uses it |
|-----|-----|-------------|
| **Model Builder** | Design the calculator (rows, formulas, where data comes from) | FP&A admin |
| **Model Planning** | Use the calculator (type assumptions, see results, compare what-ifs) | Budget owners, finance, CFO |

**Rule:** Builder defines the logic. Planning operates the plan.

A marketing manager should change **Headcount** or **Marketing Spend**.  
They should never edit `=[Units Sold] * [Price]` or stare at a dependency graph.

```text
  Model Builder          Publish              Model Planning
  (design machine)  →  (freeze recipe)  →  (enter assumptions)
                                                 ↓
                                          Numbers recalculate
                                                 ↓
                                    Review / approve / lock / report
```

Until a model is **published**, Planning has nothing solid to run. That is why **Builder comes before Planning** for backend completeness.

---

## There are three things, not two

People mix these up. They are related but not the same:

### 1. Model Builder
The **factory**. You create:

- the model (e.g. “FY2026 Financial Model”)
- modules (Revenue, Workforce, Opex…)
- line items (Units Sold, Price, Revenue…)
- formulas (`Revenue = Units × Price`)
- dimensions (Time, Department, Product…)
- data mappings (NetSuite → Starting ARR)
- validation, then **Publish**

Screens: **A.3** (modules + dependency map) and **A.4** (formula trace, mapping, validation).

### 2. Model Planning
The **operating room**. You pick:

- which **model version** (e.g. v3.2 Working / published)
- which **planning cycle** (e.g. FY2026 Budget)
- which **scenario** (Budget, Forecast, Best Case, Downside)

Then you:

- watch KPI cards
- edit the planning grid
- tweak drivers
- compare scenarios
- comment / track small tasks
- see a slim workflow strip (Draft → Submitted → Under Review → Approved)

Screens: **A.1** (workspace) and **A.2** (scenario comparison).

### 3. Budget Planning / Workflow
One **special use** of Planning: the annual budget process (assign owners → submit → FP&A accept → CFO approve → lock → board pack).

That is mostly the **Workflow** tab you already shipped.  
Model Planning shows a *compact* status strip; Workflow is the *full control room*.

```text
Builder builds the model
        ↓
Publish freezes that recipe
        ↓
Planning uses it for any cycle type
        ↓
Budget Workflow is the annual-budget process on top
```

---

## Everyday objects (same words both tabs use)

| Word | Plain meaning | Example |
|------|---------------|---------|
| **Model** | The whole machine | FY2026 Corporate Financial Model |
| **Module** | A section of the machine | Revenue Planning |
| **Line item** | A row | Units Sold, Revenue, EBITDA |
| **Formula** | How a calculated row is made | `=[Units Sold]*[Price]` |
| **Driver** | A knob planners are allowed to turn | Volume growth %, FX rate |
| **Dimension** | How you slice a number | Department, Month, Scenario |
| **Version** | A snapshot of the recipe/numbers | Working draft → Published → Locked |
| **Scenario** | A what-if | Budget, Best Case, Downside |
| **Cell** | One number at one intersection | Revenue · Jan · Sales · Budget |
| **Planning cycle** | A time-boxed process | FY2026 Budget with deadlines |

**Important:** Changing Builder after people already approved a plan must **not** silently rewrite their numbers. Publish freezes the recipe. Moving a live cycle to a new published recipe needs an **explicit migration**, not an automatic sneak update.

---

## How a year actually flows

1. **FP&A opens Model Builder**  
   Creates the model, modules, line items, formulas, mappings.  
   Runs Validate → Test calculation → **Publish**.

2. **FP&A opens a planning cycle** (often Annual Budget)  
   Points it at the **published** model version.  
   Loads actuals / baseline. Assigns department owners.

3. **Owners open Model Planning**  
   Choose version + cycle + scenario.  
   Enter drivers and input cells.  
   The engine recalculates Revenue, Opex, EBITDA, cash, etc.  
   They comment, finish tasks, **Submit**.

4. **FP&A / CFO review**  
   In Planning (compare scenarios) and/or Workflow (full approvals).  
   Return or approve → **Lock** → board pack / reports.

**Analogy:**  
Builder = designing the Excel template with named formulas.  
Planning = filling that template.  
Workflow = signing it off.

---

## What each screenshot is

| Screenshot | Tab | What you are looking at |
|------------|-----|-------------------------|
| **A.1** | Model Planning | Main workspace: KPIs + dept×month grid + drivers + comments/tasks + slim workflow |
| **A.2** | Model Planning | Scenario comparison: multi-scenario table + waterfall + assumption sliders |
| **A.3** | Model Builder | Modules tree, line-item formulas, dependency map, properties panel |
| **A.4** | Model Builder | Formula trace, ERP mappings, audit log, exceptions, validation donut, what-if impact |

---

## Decision: what we build first

**Product / backend order (final):**

1. **Model Builder through Publish** — so Planning has a real published model to consume.  
2. **Model Planning** — workspace, compare, submit path on top of that.  
3. **Budget Workflow** — already largely done; keep using `/budget-cycles`, do not invent a second cycle system.

**Why not “Planning first”?**  
We already have a grid, KPIs, and scenarios, so FE can polish Planning screens early. That is fine as *UI wiring*.  
But for the *product to be correct*, Publish must exist. Without it, Planning is running on draft structure that can change under people’s feet.

**Do not:**

- Treat Planning as “Builder with a nicer grid”
- Duplicate Budget cycles under a new `/planning-cycles` API if `/budget-cycles` already is the cycle
- Let owners edit formulas from Planning
- Silently recalculate locked/approved plans when someone republishes a model

---

## What is already true in our backend (roughly)

| Piece | Status |
|-------|--------|
| Create model, line items, some formulas, drivers | Mostly there |
| Planning grid + cell edits | There |
| Scenario compare + home KPIs | There |
| Annual budget cycle + Workflow cockpit | There |
| First-class **Modules** | **Shipped** — `GET/POST /models/{id}/modules` |
| Explicit **Publish** + history | **Shipped** — `POST /models/{id}/publish` + `publishedAt`; audit via `GET …/audit-logs` |
| Full dependency map / data-mapping board | **Map shipped** (`…/dependency-map`); data-mapping board still follow-up |
| Planning waterfall / material driver approval | Missing |

So: you are not starting from zero. You are finishing Builder’s “publishable model” story, then hardening Planning around it.

---

## Two naming traps (working answers)

**“Driver” vs “INPUT”**  
In Builder screens some rows say Driver. In the schema we mostly say INPUT / CALCULATED.  
**Working answer:** a “Driver” row is an INPUT line item that also lives in the Driver Library (with optional approval when the change is big). Not a third conflicting type — unless product later says otherwise.

**“Workspace” (Builder) vs “Planning Cycle” (Planning)**  
Both screens may show “Budget 2026”.  
**Working answer:** same *label*, not necessarily the same *ID*.  
Workspace ≈ which draft/published **model version** you are editing in Builder.  
Planning Cycle ≈ the **process** (owners, deadlines, submissions).

---

## One picture to remember

```text
┌─────────────────────┐
│   MODEL BUILDER     │  Design modules, formulas, mappings
│   (A.3 / A.4)       │  Validate → Publish
└──────────┬──────────┘
           │ published model version
           ▼
┌─────────────────────┐
│   MODEL PLANNING    │  Pick version + cycle + scenario
│   (A.1 / A.2)       │  Edit drivers/inputs → see KPIs/grid
└──────────┬──────────┘
           │ submit / compare
           ▼
┌─────────────────────┐
│ BUDGET / WORKFLOW   │  Approvals, lock, board pack
│ (already mostly     │  (full cockpit; Planning shows a slim strip)
│  shipped)           │
└─────────────────────┘
```

---

## Bottom line

- **Two tabs, one model.** Builder designs it; Planning uses it.  
- **Budget/Workflow** is the approval process for (usually) the annual budget — already largely built.  
- **Build Builder → Publish next**, then finish Planning features that need that published model.  
- Owners touch assumptions. Admins touch formulas. Approved plans stay frozen unless someone deliberately migrates.

That is the whole story.
