# Model Builder — List, Create, and Detail Navigation (FE brief)

**Audience:** Frontend  
**Product area:** FP&A → Model Builder only (not Budget / Workflow / Model Planning)  
**APIs:** [fpa-model-builder-api.md](./fpa-model-builder-api.md) · list/create also in [fpa-api-by-ui-section.md](./fpa-api-by-ui-section.md) § B.3  
**Mental model:** [fpa-model-planning-vs-builder.md](./fpa-model-planning-vs-builder.md)

---

## 1. Why we are doing this

The design screenshots (A.3 / A.4) show Model Builder **already inside a model**, with:

- **Model:** FY2026 Financial Model  
- **Workspace:** Budget 2026  

That confused people into thinking you “pick a budget to build a model.” That is wrong.

| What the mock shows | What it actually is |
|---------------------|---------------------|
| Mid-edit Builder workspace | Detail page for a model that **already exists** |
| Model dropdown | Switch which model you are editing |
| Workspace / “Budget 2026” | Optional version/preview context — **not** Budget Planning cycle admin |

**We need a clear create path** so FP&A can:

1. See all models  
2. Open one to edit structure/formulas  
3. Create a **new** model with a small form  
4. Land in Builder with that new model selected  

Without a list + create modal, the screenshot looks like “select a budget to invent a model,” which mixes up **Model Builder** and **Budget Workflow**.

### Product rule (one sentence)

> **List and create on the list page; build structure on the detail page.**

```text
Create model (list modal)  →  Builder detail (modules, formulas, validate, publish)
                                      ↓
                              Model Planning uses published model
                                      ↓
                              Budget / Workflow = separate process (do not rebuild here)
```

---

## 2. Information architecture

### Routes (suggested)

| Route | Page | Purpose |
|-------|------|---------|
| `/forecasting/model-builder` | **List** | Browse models, open one, create new |
| `/forecasting/model-builder/:modelId` | **Detail / Builder workspace** | A.3 + A.4 UI for that model |

Query alternative (also fine): `/forecasting/model-builder?modelId=` — prefer path param so refresh/share works.

### Nav

Left nav **Model Builder** → always lands on the **list** first (or last-opened model only if product prefers; default = list).

---

## 3. Page A — Models list

### Purpose

Answer: “Which models do we have, and which one do I open or create?”

### Layout

- Page title: **Model Builder**  
- Primary button: **+ New model**  
- Table (or cards) of models the user can access  

### Columns (minimum)

| Column | Source |
|--------|--------|
| Name | `model.name` |
| Status | `DRAFT` / `VALID` / `INVALID` / `PUBLISHED` / `ARCHIVED` |
| Type | `modelType` |
| Currency | `baseCurrency` |
| Horizon | `startPeriod` – `endPeriod` |
| Last updated | `updatedAt` |
| Last published | `publishedAt` (or “—” if never) |

### Row actions

- **Click row** (or Open) → navigate to detail `/forecasting/model-builder/{id}`  
- Optional overflow: Archive (if API allowed) — not required for v1  

### Empty state

Copy:

> No planning models yet. Create a model to define line items, formulas, and publish it for Model Planning.

CTA: **+ New model**

### API

`GET /api/v1/fpa/models`

---

## 4. Create model — modal (from list only)

### Why a modal (not the full Builder screenshot)

- Create needs **few fields**.  
- Builder needs **modules, formulas, validation** — that is a whole workspace.  
- Mixing “create” into the A.3 header made the mock feel like selecting a budget cycle.

### Open

List page → **+ New model** → modal.

### Fields (v1 — keep light)

| Field | Required | Notes |
|-------|----------|-------|
| Name | Yes | e.g. `FY2026 Financial Model` |
| Description | No | Short text |
| Model type | Yes | `BUDGET` \| `FORECAST` \| `ROLLING_FORECAST` |
| Base currency | Yes | e.g. `USD` |
| Planning start | Yes | Date / period |
| Planning end | Yes | Must be after start |
| Time granularity | Yes | Default **Monthly** (`MONTHLY` \| `QUARTERLY` \| `ANNUAL`) |

**Do not** put in the create modal (v1):

- Modules / line items / formulas  
- Department owners / budget cycle / submit / approve  
- Data mappings / publish  

Those belong on the **detail** page (or later wizards).

### Actions

- **Cancel** → close modal, stay on list  
- **Create** → call API → on success **navigate to detail** with the new `modelId` selected  

### API

Prefer simple create for this modal:

`POST /api/v1/fpa/models`

```json
{
  "name": "FY2026 Financial Model",
  "description": "Optional",
  "modelType": "BUDGET",
  "baseCurrency": "USD",
  "startPeriod": "2026-01-01",
  "endPeriod": "2026-12-31",
  "timeGranularity": "MONTHLY"
}
```

Response includes `id` (and usually a default working version + BASE scenario).

Optional later: `POST /models/setup` for a fat one-shot wizard. **Not required** for this navigation story.

### After create

1. Close modal  
2. `navigate(/forecasting/model-builder/{newModelId})`  
3. Detail page loads modules / line items for that id (may be empty or seeded defaults)  
4. User builds structure → Validate → Publish  

---

## 5. Page B — Builder detail (screenshots A.3 / A.4)

### Purpose

Answer: “How is **this** model’s calculator wired?”

This is where the existing UI inspiration lives:

- Modules tree + dimensions  
- Line item grid + formulas  
- Dependency map  
- Properties / formula editor / references  
- Formula trace, mappings (when ready), audit, validation, publish  

### Header

```text
Model Builder
[Model: FY2026 Financial Model ▾]     ← switch model (same as leaving and opening another)
[Workspace: Working ▾]                ← optional; hide if only one version
✓ Valid   ✓ Circular Check Passed
Last Published: …
[Validate Model]  [Publish]
```

### Model dropdown behaviour

- Options = same list as `GET /models` (or cached from list).  
- On change → navigate to `/forecasting/model-builder/{otherId}` (full reload of builder data).  
- Does **not** create a model.  
- Does **not** open Budget Workflow.

### Workspace dropdown (optional v1)

- Means **version / preview context** for sample numbers in the grid.  
- Label may say “Budget 2026” in mocks — treat as **workspace name**, not cycle admin.  
- If confusing, **omit in v1** and use `defaultVersionId` from the model payload.

### Back to list

Breadcrumb or link: **All models** → `/forecasting/model-builder`

### APIs (already shipped for Builder)

See [fpa-model-builder-api.md](./fpa-model-builder-api.md):

- Modules, line items, dependency map  
- Validate / validation-summary / publish  
- Audit logs, line-item trace / dependencies  

---

## 6. End-to-end user journeys

### Journey 1 — First-time FP&A admin

1. Open **Model Builder** → empty list  
2. **+ New model** → fill name, type, currency, dates → **Create**  
3. Land on detail for that model  
4. Add modules / line items / formulas  
5. **Validate** → fix issues → **Publish**  
6. (Later, elsewhere) Model Planning / Budget uses the published model  

### Journey 2 — Continue editing

1. Open **Model Builder** → list  
2. Click **FY2026 Financial Model**  
3. Edit formulas, re-validate, publish again if needed  
4. Use Model dropdown to jump to another model without going back (optional convenience)  

### Journey 3 — Wrong mental model (what we avoid)

- User should **not** need a “Budget 2026” cycle to exist before creating a model.  
- User should **not** create department submissions from Builder.  
- User should **not** confuse Workspace with Workflow approvals.

---

## 7. Why list → modal → detail (vs one giant page)

| Approach | Problem |
|----------|---------|
| Only screenshot (no list) | No obvious “create”; looks like picking a budget |
| Create fields inside Builder header | Overloads A.3; mixes create with edit |
| Full SRD wizard before any UI | Slow; blocks learning the Builder canvas |
| **List + light modal + detail** | Clear create, clear edit, matches APIs, keeps Budget out |

---

## 8. Permissions

| Role | List | Create | Detail (edit formulas / publish) |
|------|------|--------|----------------------------------|
| FP&A admin / finance manager (approve roles) | Yes | Yes | Yes |
| Department owner | No (or read-only list) | No | No — send to Model Planning |
| Viewer | Read-only list if allowed | No | Read-only detail |

If a non-builder hits detail:  

> Model Builder is for FP&A admins. Use Model Planning to enter assumptions.

---

## 9. FE acceptance checklist

- [ ] `/forecasting/model-builder` shows model list from `GET /models`  
- [ ] Row click opens `/forecasting/model-builder/:modelId`  
- [ ] **+ New model** opens modal with the light field set only  
- [ ] Create calls `POST /models`, then navigates to new model’s detail  
- [ ] Detail Model dropdown switches `modelId` and reloads Builder data  
- [ ] Detail does **not** create budget cycles or call Workflow approve/lock/board-pack  
- [ ] Empty list CTA creates via modal  
- [ ] After create, user is clearly “in” that model (header shows its name)  

---

## 10. One-line brief for the frontend agent

> Model Builder = **list of models** + **New model modal** (few fields) + **detail workspace** (A.3/A.4) for the selected model, with a Model dropdown to switch. Create never requires a Budget cycle; Workspace is optional version preview only.

---

**End of brief.**
