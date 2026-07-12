# FP&A Model Builder API (A.3 / A.4) — FE contract

Base: `{host}/api/v1/fpa`  
Auth: `Authorization: Bearer <token>`  
FE brief: [Model_Builder_Backend_Integration_Prompt.md](./Model_Builder_Backend_Integration_Prompt.md)

**Out of scope:** Budget cycles, Workflow, IMPORTED mapping engine (P2).

---

## Path aliases

| FE path | Notes |
|---------|--------|
| `GET /models/:id/dependency-graph` | FE graph shape (`modules`, `edges.kind`) |
| `GET /models/:id/dependency-map` | Legacy nodes/edges |
| `GET /models/:id/audit` | `{ entries, nextCursor }` |
| `GET /models/:id/audit-logs` | Legacy array |
| `POST /versions/:id/publish` | Preferred publish |
| `POST /models/:id/publish` | Publishes default DRAFT version |
| `PUT /models/:id/grid/cells` | FE bulk cell seed |
| `POST /models/:id/cells/update` | Legacy single cell |

Dual fields: `parentModuleId`/`parentId`, `calculationOrder`/`calcOrder`, `displayScale`/`decimalPlaces`, `currency`/`currencyCode`.

---

## Models

- `GET /models` → includes `ownerName`, `publishedAt`
- `POST /models` → includes `defaultVersionId`, `defaultScenarioId`, `versions[]`, `scenarios[]`
- `GET /models/:id` → includes `publishedByName`, versions, scenarios

## Modules

- `GET/POST /models/:id/modules`
- `PUT/DELETE /modules/:id` (`?cascade=true`)
- `POST /modules/:id/duplicate`
- `PUT /modules/:id/dimensions` `{ dimensionKeys }`

## Line items

- `GET/POST /models/:id/line-items` (require `moduleId` for Builder)
- `PUT/DELETE /line-items/:id`
- `PUT /line-items/:id/reorder` `{ sortOrder }`
- `PUT /line-items/:id/dimensions` `{ dimensionKeys }`

## Formulas

- `POST /formulas/validate`
- `POST /formulas/dependency-check`
- `POST /models/:id/formulas` → `{ formula, impact, graphDelta }`
- `PUT /formulas/:id` → same enrichment
- `GET /formulas/:id/impact-map` → `precedents`, `dependents`, `usedIn` (+ legacy keys)

## Validate / publish

```http
POST /models/:id/validate
→ { passed, errors[], warnings[], info[], circular, circularPath, … }

POST /versions/:id/publish
{ "notes": "…", "notifyUserIds": [] }
→ publish record; 409 PUBLISH_BLOCKED on ERROR/circular
```

## Graph / templates / audit / calc

- `GET /models/:id/dependency-graph?view=module|line-item&moduleId=`
- `GET /line-item-templates`
- `POST /models/:id/modules/:moduleId/apply-template` `{ templateId }`
- `GET /models/:id/audit`
- `POST /versions/:id/test-calculation`
- `PUT /models/:id/grid/cells` `{ versionId, scenarioId, updates:[{ lineItemId, periodKey, value }] }`

---

## Migration

```bash
npm run db:migrate:fpa-model-builder-fe-contract
npx prisma generate
```

UAT: `npm run uat:fpa:model-builder` · `npm run uat:fpa:model-builder-fe`
