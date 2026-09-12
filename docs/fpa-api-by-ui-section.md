# FP&A — API by UI Section

Screen → endpoint mapping for frontend handoff.  
**Full request/response contracts:** [fpa-api-reference.md](./fpa-api-reference.md)  
**Model Planning vs Model Builder (tabs):** [fpa-model-planning-vs-builder.md](./fpa-model-planning-vs-builder.md)

Base: `https://{host}/api/v1/fpa`  
Auth: Bearer token (same as rest of Arcus).

Entities (legal entities / COA clones): `https://{host}/api/forecast-entities`

---

## B.1 FP&A Home Dashboard

| Screen element | Method | Path |
|----------------|--------|------|
| KPI cards, trend, scenario summary, workflow progress, tasks, over-budget | GET | `/home/dashboard?modelId=` |
| List models (selector) | GET | `/models` |
| Scenario list (selector) | GET | `/scenarios?modelId=` |
| Version list (via model detail) | GET | `/models/{modelId}` |

**Home payload (typical):** `kpis` (incl. `sparklines`), `cashByMonth`, `scenarioCompare`, `workflowProgress`, `openTasks`, `overBudgetDepartments` (`departmentName`, `ownerName`, `ownerAvatarUrl`), `activity`, `model.ownerName`.

---

## B.2 Planning Worksheet (Model Planning grid)

Primary surface for the **Model Planning** tab (enter assumptions / view calculated rows). Product naming: Model Planning; older docs said Worksheet.

| Screen element | Method | Path |
|----------------|--------|------|
| Load grid | GET | `/models/{modelId}/grid?versionId=&scenarioId=&page=&pageSize=` |
| Validation strip | GET | `/models/{modelId}/grid/validations?versionId=&scenarioId=` |
| Edit cell | POST | `/models/{modelId}/cells/update` body: `{ cellId, value }` **or** `{ versionId, scenarioId, lineItemId, periodDate, value }` (upserts if missing) |
| Bulk edit | POST | `/models/{modelId}/cells/bulk-update` body: `{ updates: [...] }` |
| Spread | POST | `/models/{modelId}/cells/spread` |
| Copy forward | POST | `/models/{modelId}/cells/copy-forward` |
| Apply growth | POST | `/models/{modelId}/cells/apply-growth` `{ versionId, scenarioId, lineItemId, fromPeriodDate, ratePct, mode? }` |
| Cell history | GET | `/models/{modelId}/cells/{cellId}/history` → includes `userName` |
| Cell comments | GET/POST | `/models/{modelId}/cells/{cellId}/comments` |
| Seed empty version | POST | `/versions/{id}/seed-cells` |
| Submit workflow task | POST | `/tasks/{taskId}/submit` |
| My open tasks (Worksheet Submit binder) | GET | `/tasks/my-tasks?modelId=&versionId=` |

**Grid response:** `periods[]` (`periodDate`, `periodRole: ACTUAL|FORECAST`), `lineItems[]`, `cells[]` (with `periodRole`, `isEditable`, `isLocked`, `sourceType`), `ownerName`, `actualCutoff`, pagination.

Locked / actual cells: treat as read-only; API returns 403 if edited.

---

## B.3 Model Builder

Technical modelling studio (structure, formulas, validate, **publish**). Not the owner planning grid — see [fpa-model-planning-vs-builder.md](./fpa-model-planning-vs-builder.md).  
**Full Model Builder contracts:** [fpa-model-builder-api.md](./fpa-model-builder-api.md)

| Screen element | Method | Path |
|----------------|--------|------|
| Create model (atomic setup) | POST | `/models/setup` |
| Create model (simple fallback) | POST | `/models` |
| Get / update / archive | GET/PUT `/models/{modelId}` ; POST `/models/{modelId}/archive` |
| Modules tree | GET/POST | `/models/{modelId}/modules` |
| Update / delete module | PUT/DELETE | `/modules/{moduleId}` |
| Dependency map | GET | `/models/{modelId}/dependency-map?view=MODULE\|LINE` |
| Scope (entities + depts) | PUT | `/models/{modelId}/scope` |
| COA accounts | PUT | `/models/{modelId}/coa` |
| Dimensions | PUT | `/models/{modelId}/dimensions` |
| Baseline | POST | `/models/{modelId}/baseline` |
| Validate (chips + issues) | POST | `/models/{modelId}/validate` |
| Validation summary | GET | `/models/{modelId}/validation-summary` |
| Publish | POST | `/models/{modelId}/publish` |
| Audit / Change History | GET | `/models/{modelId}/audit-logs` |
| Line items | GET/POST | `/models/{modelId}/line-items` (`?moduleId=`) |
| Update / delete line item | PUT/DELETE | `/line-items/{id}` |
| Line dependencies / trace | GET | `/line-items/{id}/dependencies` · `/line-items/{id}/trace` |
| Bulk line items | POST | `/models/{modelId}/line-items/bulk` |
| Dimension catalog | GET | `/dimensions` |
| Drivers | GET/POST | `/models/{modelId}/drivers` or `/drivers` |
| Update driver | PUT | `/drivers/{id}` |
| Create formula | POST | `/models/{modelId}/formulas` |
| Update formula | PUT | `/formulas/{formulaId}` |
| Validate formula | POST | `/formulas/validate` body: `{ expression }` |
| Dependency / circular check | POST | `/formulas/dependency-check` |
| Impact map | GET | `/formulas/{formulaId}/impact-map` |
| Create version (optional copy) | POST | `/versions` body may include `copyFromVersionId` |
| Seed empty version cells | POST | `/versions/{id}/seed-cells` |

**Preferred create:** `POST /models/setup` (modal single-commit).  
**Fallback create body:** `{ name, modelType, baseCurrency, startPeriod, endPeriod, timeGranularity, description? }`  
`modelType`: `BUDGET` \| `FORECAST` \| `ROLLING_FORECAST`.  
`timeGranularity`: `MONTHLY` \| `QUARTERLY` \| `ANNUAL`.

---

## B.4 Scenario Comparison

| Screen element | Method | Path |
|----------------|--------|------|
| List scenarios | GET | `/scenarios?modelId=` |
| Create scenario | POST | `/scenarios` |
| Copy scenario | POST | `/scenarios/{id}/copy` |
| Promote to forecast | POST | `/scenarios/{id}/promote` |
| Compare | POST | `/scenarios/{id}/compare` body: `{ versionId, compareScenarioId }` or `{ versionId, scenarioIds: [baseId, otherId] }` |

---

## B.5 Workflow & Approvals

| Screen element | Method | Path |
|----------------|--------|------|
| Create cycle | POST | `/budget-cycles` |
| List cycles | GET | `/budget-cycles?modelId=` |
| Get cycle | GET | `/budget-cycles/{id}` |
| Assign owners | PUT | `/budget-cycles/{id}/owners` |
| Validate | POST | `/budget-cycles/{id}/validate` |
| Submit to FP&A | POST | `/budget-cycles/{id}/submit-fpa` |
| FP&A accept / return | POST | `/budget-cycles/{id}/fpa-accept` · `fpa-return` |
| CFO approve / return | POST | `/budget-cycles/{id}/cfo-approve` · `cfo-return` |
| Lock / board pack | POST | `/budget-cycles/{id}/lock` · `board-pack` |
| Summary | GET | `/budget-cycles/{id}/summary` |
| Create cycle (legacy) | POST | `/workflows` |
| List workflows | GET | `/workflows?modelId=` |
| Get workflow | GET | `/workflows/{id}` |
| My tasks | GET | `/tasks/my-tasks?modelId=` (assigned **or unassigned** open tasks) |
| Submit | POST | `/tasks/{id}/submit` |
| Return | POST | `/tasks/{id}/return` |
| Approve | POST | `/tasks/{id}/approve` |
| Reassign | POST | `/tasks/{id}/reassign` body: `{ assigneeId?, comment? }` |
| Lock version (CFO) | POST | `/versions/{id}/lock` |
| Archive version | POST | `/versions/{id}/archive` |
| Create version | POST | `/versions` |
| Seed cells | POST | `/versions/{id}/seed-cells` |

**Budgeting API doc:** [fpa-budgeting-api.md](./fpa-budgeting-api.md)

Maker cannot approve their own submission (enforced server-side).

---

## B.6 Variance Analysis

| Screen element | Method | Path |
|----------------|--------|------|
| Calculate | POST | `/variance/calculate` |
| Results | GET | `/variance/results?modelId=&varianceType=` |
| Commentary | POST | `/variance/{id}/commentary` body: `{ body, correctiveAction? }` |

Direction: `FAVOURABLE` / `UNFAVOURABLE` / `NEUTRAL` based on line item type (revenue/cash vs expense).

---

## Actuals integration

| Action | Method | Path |
|--------|--------|------|
| Sync closed-period GL | POST | `/actuals/sync` |
| List snapshots | GET | `/actuals/snapshots?modelId=` |

---

## Domain views (thin filters)

| Screen | Method | Path |
|--------|--------|------|
| Workforce / Revenue / Expense / Cash | GET | `/domain/{category}?modelId=` (`workforce` \| `revenue` \| `expense` \| `cash`) |

---

## Exports & AI (assist-only)

| Action | Method | Path |
|--------|--------|------|
| Board pack / management export | POST | `/exports/board-pack` body: `{ modelId, versionId, exportType? }` → includes `downloadUrl` |
| Get export job | GET | `/exports/{id}` |
| Download export file | GET | `/exports/{id}/download` |
| Forecast suggestion stub | POST | `/ai/suggest` |
| Commentary draft stub | POST | `/ai/commentary-draft` |

AI never approves, locks, or overrides actuals.

---

## Forecast entities (shared with Tax Return Pack)

| Action | Method | Path |
|--------|--------|------|
| List entities | GET | `/api/forecast-entities` |
| Create | POST | `/api/forecast-entities` |
| Get | GET | `/api/forecast-entities/{id}` |
| Entity COA | GET | `/api/forecast-entities/{id}/chart-of-accounts` |
| Resync COA | POST | `/api/forecast-entities/{id}/resync-coa` |

Use `id` as `entityId` on planning cells / filters when scoping by legal entity.
