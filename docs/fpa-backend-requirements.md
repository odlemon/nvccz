# FP&A Backend Requirements

Arcus FP&A — Planning, Budgeting, Forecasting and Scenario Modelling.

Base path: `/api/v1/fpa`  
Forecast entities (Tax Return Pack + entity dimension): `/api/forecast-entities`

## Concepts

| Concept | Storage |
|---------|---------|
| Planning model | `planning_models` |
| Version (Draft/Submitted/Approved/Locked/Archived) | `planning_versions` |
| Scenario (Base/Upside/Downside/…) | `planning_scenarios` |
| Line item | `planning_line_items` |
| Cell | `planning_cells` (full coordinate address) |
| Driver | `planning_drivers` |
| Formula | `planning_formulas` + `planning_formula_dependencies` |
| Workflow / tasks | `planning_workflows`, `planning_tasks`, `planning_approvals` |
| Actuals | `planning_actuals_snapshots` + import jobs |
| Variance | `planning_variance_results` + `planning_comments` |
| Audit | `planning_audit_logs` |

Cell address: model + version + scenario + period + entity + department + cost centre + account + line item + currency + source type.

## Roles

| Capability | Roles |
|------------|--------|
| Edit | Analysts, dept heads (own dept), FP&A managers, CFO, admin |
| Approve / lock | CFO, FIN_MGR, FORECAST_LOCK, CEO, admin |
| Board viewer | Read-only approved/locked outputs |

**Locked version rule:** UI and API edits return **403** and write an audit log entry.

## Formula dialect

- Arithmetic: `+ - * /`
- `IF(cond, a, b)`
- `LINE('CODE')` — reference another line item
- `DRIVER('CODE')` — reference a driver
- Circular dependencies are rejected by `POST /formulas/dependency-check`

## Migrations

```bash
npm run db:migrate:fpa-planning
npx prisma generate
# all three DBs on VPS:
python scripts/run-fpa-planning-migration-all-dbs-vps.py
```

Drops legacy `forecast_scenarios` hypercube tables; keeps `forecast_entities` / `entity_chart_of_accounts`.

## UAT

```bash
npm run uat:fpa
```

## Frontend map

- **User journey (start → finish):** [fpa-user-flow.md](./fpa-user-flow.md)
- Screen → path map: [fpa-api-by-ui-section.md](./fpa-api-by-ui-section.md)
- **Full request/response API reference:** [fpa-api-reference.md](./fpa-api-reference.md)

**Model setup:** prefer `POST /v1/fpa/models/setup` (atomic).  
**Setup API doc:** [fpa-model-setup-api.md](./fpa-model-setup-api.md)  
Migration: `npm run db:migrate:fpa-model-setup`.
