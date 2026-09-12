# FP&A Annual Budgeting — Backend gap response (2026-07-12)

FE gap doc covered P0–P2 blocking full SRD. Backend response: **extend `/budget-cycles`** (canonical). No `/planning-cycles` dual surface.

## Shipped in this pass

| Gap | Fix |
|-----|-----|
| P0.1 Model PUT scope/COA | `PUT /models/{id}` now persists `entityIds` / `departmentIds` / `accountIds` via setup services; GET round-trips |
| P0.2 Create fields | Already persisted; added `workflowTemplateId`, per-owner `dueDate`/`baselineMethod`/`categories`, version archive reject, `VERSION_NOT_READY` on `openImmediately` |
| P0.3 Validate-setup | Full list; stronger `DRIVER_RATE_MISSING`, model validate merge → `COA_MISSING`/`SCOPE_MISSING`; open still `SETUP_INCOMPLETE` + full list |
| P0.4 Open side-effects | `actualsRowCount` + `actualsLoadReason`; baseline by method (+ per-owner override); owners notified |
| P0.5–8 Grid / cells | Dept scope API-enforced; `CELL_NOT_EDITABLE`; `LOCKED_VERSION`; 409 payload; `updatedCells` after recalc; submit gate codes aligned |
| P0.9 Baseline methods | SRD methods on cycle + owner; register returns method / prior / current / changePct |
| P1 Review workspace | `GET /budget-cycles/{id}/review-workspace` |
| P1 Reopen | `POST /versions/{id}/request-reopen` → new working copy (no silent unlock) |
| P1 Board pack | Failures → `BOARD_PACK_FAILED` (not empty 200) |
| P2 Trace | `GET /models/{id}/cells/{cellId}/trace` |

## Still deferred (P2 / later)

- Async `calculate` job queue (`POST …/calculate` + job polling)
- Cycle-scoped driver submit/approve beyond existing driver APIs
- Per-line-item baseline override UI fields beyond owner/cycle method

## FE docs

- [fpa-budgeting-owner-workspace-api.md](./fpa-budgeting-owner-workspace-api.md)

## Migrate

```bash
npm run db:migrate:fpa-budget-srd-gaps
npx prisma generate
```
