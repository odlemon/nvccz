# FP&A Model Planning — Backend API status

**Date:** 2026-07-14  
**Audience:** FE + Backend  
**FE Phase 1:** §49 live shell on `FpaWorksheet` (compose existing endpoints)  
**API base:** `/api/v1/fpa`

Related FE ask: [Model_Planning_CSV_Calendar_Backend_Ask.md](./Model_Planning_CSV_Calendar_Backend_Ask.md) (ingest/calendar). Planning chrome sources: Model Planning SRD §27–55 / §66–67.

---

## Ask for BE — answers

| Ask | Answer |
|-----|--------|
| **1. Aggregate vs compose** | **Compose is supported.** There is **no** `GET …/models/{id}/planning-workspace`. FE should keep combining dashboard + drivers + grid + cycles + tasks. |
| **2. `budget-cycles?modelId=`** | **Confirmed server-side.** `GET /v1/fpa/budget-cycles?modelId=` filters `PlanningBudgetCycle.modelId`. No `sourceModelId` column — client-side re-filter is unnecessary. |
| **3. Waterfall (§42)** | **Shipped v1:** `GET …/models/{modelId}/variance-bridge` (start → variance → end). Full Price/Volume/Mix later. |
| **4. Migration (§54)** | **Scheduled — not this sprint.** Publish freezes versions; cycles do **not** auto-recalc on new model publish (§53). Today: re-point `cycle.versionId` only (no preview/impact/apply). |
| **Cut-over (§31)** | Documented below (partial). |
| **Audit (§67)** | Partial — field matrix below. |
| **Async calc (§66)** | Not shipped — sync recalc on cell write; export jobs exist separately. |

---

## Phase 1 — keep stable (FE already uses)

| Area | Endpoints |
|------|-----------|
| Grid | `GET …/models/{id}/grid`; cell update / bulk / spread / copy-forward / growth |
| Scenarios | list/create/copy/promote; `compareScenarios` |
| Versions | list / select on planning |
| Drivers | `listDrivers`, `updateDriver` |
| Dashboard KPIs | `GET …/home/dashboard?modelId&versionId` |
| Budget cycles | `listBudgetCycles?modelId`, get, open/assign/submit/accept/return/approve/lock |
| Owner submit | `validateOwnerSubmit`, `submitTask`, owner workspace |
| Comments | cell comments; budget-cycle comments |
| Tasks | cycle tasks, myTasks, approve/return |
| Activity | `listBudgetApprovalEvents` |
| Variance | `calculateVariance`, `listVarianceResults`, `addVarianceCommentary` |

Prefer **not** breaking response shapes without notice.

---

## SRD gaps scoreboard (1–11)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | `planning-workspace` aggregate | **MISSING** (compose OK) | Use dashboard + drivers + cycle + tasks |
| 2 | Cycles `?modelId=` filter | **EXISTING** | Server-side on `modelId` |
| 3 | Variance waterfall bridge | **EXISTING (v1)** | `GET …/variance-bridge` |
| 4 | Scenario overlay `effectiveValue` / deltas-only | **MISSING** | Scenarios are full cell copies; grid has `OVERRIDE` status only |
| 5 | Material variance submit gate | **EXISTING** | Hardcoded **ABS ≥ 10%** + commentary; after `POST /variance/calculate` |
| 6 | Rich commentary (@, threads, resolve, attachments) | **PARTIAL** | Cell/cycle/task comments + status string; task attachments only |
| 7 | Model→cycle migration (§54) | **MISSING** | Scheduled; hard rule holds |
| 8 | Actuals cut-over | **PARTIAL** | See § Cut-over |
| 9 | Advanced spread methods | **PARTIAL** | EVEN, copy-forward, growth, bulk; not PRIOR_YEAR_PATTERN / weights / etc. |
| 10 | Audit full field list | **PARTIAL** | See § Audit |
| 11 | Async `calculate` + jobs | **MISSING** | Sync on write; board-pack jobs only |

---

## Variance bridge v1 (§42)

```http
GET /v1/fpa/models/{modelId}/variance-bridge?metric=REVENUE&from=BUDGET&to=FORECAST&versionId=&scenarioId=&cycleId=
```

**Response**

```json
{
  "success": true,
  "data": {
    "metric": "REVENUE",
    "from": "BUDGET",
    "to": "FORECAST",
    "startLabel": "Budget",
    "endLabel": "Forecast",
    "startValue": 1000000,
    "endValue": 1120000,
    "variance": 120000,
    "points": [
      { "label": "Budget", "value": 1000000 },
      { "label": "Variance", "value": 120000 },
      { "label": "Forecast", "value": 1120000 }
    ],
    "versionId": "…",
    "scenarioId": "…",
    "cycleId": null
  }
}
```

`from` / `to` support: `BUDGET` | `PLAN` | `BASE` | `FORECAST` | `ACTUAL` (case-insensitive). Metric matches line-item **code** (e.g. `REVENUE`, `EBITDA`) or category fallback.

---

## Cut-over (§31 / §55.6) — current behaviour

| Step | Behaviour today |
|------|-----------------|
| Import / sync actuals | `POST /actuals/sync`, `POST …/budget-cycles/:id/load-actuals` |
| Closed periods | Matching cells → `sourceType`/`valueType` **ACTUAL**; closed/locked fiscal periods locked |
| Grid bands | `periodRole` `ACTUAL` \| `FORECAST` from cycle `actualsCutoffDate` / `forecastStartPeriod` |
| Prior forecast history | **Not** separately snapshotted on cut-over (cell audit history only) |
| Forecast start advance | Fields on cycle + grid cutoff; no dedicated one-shot cut-over workflow API |

---

## Audit (§67) — field matrix

| Field | Present? |
|-------|----------|
| user | Yes (`userId`) |
| action | Yes (`actionType`) |
| model | Yes |
| module | Yes when passed |
| line item | Yes when passed |
| scenario | Yes when passed |
| version | Yes when passed |
| old / new value | Yes |
| formula change | In `reason` JSON for formula updates |
| timestamp | Yes (`createdAt`) |
| reason | Yes (`reason`; cell updates often use generated `summary`) |
| source IP | Yes (`ipAddress`) |
| planning cycle | **No** |
| session | **No** |

Routes: `GET …/models/{id}/audit`, `…/audit-logs`; `GET …/cells/{cellId}/history`.

---

## Async calc (§66)

| Surface | Status |
|---------|--------|
| Sync dependent recalc on cell write | **Yes** |
| `POST …/models/{id}/calculate` → `{ jobId }` | **No** |
| `GET …/jobs/{jobId}` (calc) | **No** |
| Board-pack export jobs | **Yes** (`/exports/…`) |

Performance targets (small &lt; 2s / grid &lt; 3s / large async) are goals; no async calc queue yet.

---

## Migration (§53–54) — schedule

**Hard rule:** approved / locked planning versions must **not** auto-recalc when a new model version is published.

Today: `PATCH …/budget-cycles/:id` may set `versionId` without structure migration.

**Future epic:** preview structure diff → expected impact → authorised approve → snapshot → apply → recalculate.

---

## Scheduled (not this sprint)

- Scenario overlay deltas-only + grid `effectiveValue` / `isOverride`
- Model migration preview/approve/apply
- Advanced spread: `PRIOR_YEAR_PATTERN` | `CUSTOM_WEIGHT` | `WORKING_DAYS` | `SEASONAL_PROFILE` | `HISTORICAL_PATTERN` | `MANUAL`
- Commentary: @mentions, threads, resolution API, comment attachments
- Configurable material-variance threshold (today **10%**)
- Async model calculate jobs
