# Arcus FP&A — Model Builder Backend Integration Prompt

> **Audience:** Backend / API team  
> **Source:** Frontend Model Builder UI (final) — wire APIs; do not redesign screens.  
> **Date:** 2026-07-12  
> **Envelope:** `{ success, message?, data? }` under `/api/v1/fpa`

This document is the FE contract for Model Builder. Full UI action catalog (IDs A–K) lives with the frontend team; this file records **backend obligations**, path aliases, and acceptance gates.

**Related:** [fpa-model-builder-api.md](./fpa-model-builder-api.md) (full req/res) · [fpa-model-builder-fe-updates-2026-07-12.md](./fpa-model-builder-fe-updates-2026-07-12.md) (latest FE gap fixes)

---

## Product rules

```
Model Builder → Validate → Publish version → Model Planning
```

- Circular refs and `severity=ERROR` **block publish** (HTTP 409).
- Prefer entity + delta responses (no full-page reload).
- Selection sync: Modules ↔ Grid ↔ Map ↔ Inspector ↔ Exceptions.

---

## Path aliases (FE preferred → existing)

| FE path | Backend |
|---------|---------|
| `GET /models/:id/dependency-graph` | Adapter over `dependency-map` + FE graph shape |
| `GET /models/:id/audit` | Alias of `audit-logs` with FE entry shape |
| `POST /versions/:id/publish` | Version publish (+ model stamp); model publish still works |
| `PUT /models/:id/grid/cells` | Alias of cell update / bulk |
| `PUT /line-items/:id/reorder` | Thin wrapper on `PUT /line-items/:id` `{ sortOrder }` |

Dual field names (both returned / accepted):

| FE | Legacy |
|----|--------|
| `parentModuleId` | `parentId` |
| `calculationOrder` | `calcOrder` |
| `displayScale` | `decimalPlaces` |
| `currency` | `currencyCode` |

---

## P0 acceptance (catalog)

- **D.*** Modules tree from API (`dimensionKeys`, dual parent/order keys)
- **G.2.*** `PUT /line-items/:id` properties persist
- **H.*** `dependency-graph` with `direct|indirect|external|invalid`
- **G.4** Impact-map `precedents` / `dependents` / `usedIn`
- **C.6–C.9** Version publish + Last Published metadata
- **C.7** Validate → `errors` / `warnings` / `info` + `circular` / `circularPath`

## P1 acceptance

- **J / F.8** Audit drawer shape
- **D.7** Module duplicate
- **F.6.2** Templates + apply
- **F.4.3** Grid cell seed via PUT alias
- **C.11** `POST /versions/:id/test-calculation`

## Out of scope (P2)

IMPORTED mapping engine, ALLOCATION, full time-intelligence dialect, realtime websockets, Budget/Workflow UI.
