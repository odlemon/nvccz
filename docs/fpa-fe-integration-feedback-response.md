# FP&A API — Frontend integration feedback response

Date: 2026-07-12  
Responds to FE smoke notes against `admin@nts.com` / model `cmrgagtqn0003kt4m1ykg39vb`.

## Section 1 — Broken / failing (status)

| Item | Status |
|------|--------|
| `PUT /drivers/{id}` | **Exists** — use `/api/v1/fpa/drivers/{id}` |
| Cells locked → 403 | **Expected** after version lock |
| Cells update 404 on empty DRAFT | **Fixed** — path `modelId` injected; coordinate upsert creates cell; prefer `POST /versions/{id}/seed-cells` for full grid |
| Spread / copy-forward 403 when locked | **Expected** |
| `POST /scenarios/{id}/promote` | **Exists** |
| `POST /tasks/{id}/reassign` | **Exists** (+ notify/email) |
| `GET /exports/{id}/download` | **Exists** — job also returns `downloadUrl` |
| `GET /workflows` | **Exists** (`?modelId=&status=`) |

## Section 7 + suggested extras — shipped this pass

| Need | Endpoint / field |
|------|------------------|
| Period band | Grid `periods[].periodRole`, `cells[].periodRole`, `actualCutoff` |
| Owner display | Grid + home `ownerName` / `ownerAvatarUrl` |
| Cell comments | `GET/POST /models/{id}/cells/{cellId}/comments` |
| Apply Growth | `POST /models/{id}/cells/apply-growth` |
| Validation strip | `GET /models/{id}/grid/validations?versionId=` |
| History authors | Cell history includes `userName` |
| Home sparklines / cash | `kpis.sparklines`, `cashByMonth[]` |
| Over-budget owners | `departmentName`, `ownerName`, `ownerAvatarUrl` |
| Worksheet Submit binder | `GET /tasks/my-tasks?modelId=&versionId=` |

## Still thin (not blocking core path)

- Domain hire-plan / revenue waterfall / full cash statement rows  
- Scenario waterfall / sensitivity matrix  
- Variance commentary queue + department rollup  
- Settings sync-source / thresholds / workflow defaults  

UI mapping: [fpa-api-by-ui-section.md](./fpa-api-by-ui-section.md) · Contracts: [fpa-api-reference.md](./fpa-api-reference.md)
