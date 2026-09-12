# Performance — BSC data entry, workflow & contracts (implemented)

**Canonical field lists, examples, and request schemas:** OpenAPI tag **Updated performance** at `/api-docs` (BSC entry + workflow + **performance contracts** share this tag; contract routes include **Example Value** payloads).

Base URL on the server includes **`/api`** (e.g. `POST /api/performance/bsc-entry/...`, `POST /api/performance/contracts/...`).

---

## Flow 1 — BSC digital data entry

Authenticated users submit **per-requirement** measurements and evidence. Paths are **named after the requirement** (no numbered “step” segments). Use **JSON** except where **multipart** is noted.

**Cross-cutting:** Every route requires **Bearer JWT**. Optional **`responsibleUserId`** on JSON bodies attributes the entry for audit (else the JWT user is used). Most bodies support optional **`frequency`**, **`periodLabel`**, **`periodStart`**, **`periodEnd`** for reporting periods.

| Endpoint | What the frontend should collect |
|----------|----------------------------------|
| `POST .../bsc-entry/financial-outcome-roi` | Goal picker; **netProfit**, **totalCapitalInvested**; period; **currencyCode**; optional **skipCeoBoardMirror**. |
| `POST .../bsc-entry/internal-process-funding-rate` | **projectsFunded** vs **projectsApproved**; optional **fundId**, **targetPercent**. |
| `POST .../bsc-entry/stakeholder-survey` | Average score + scale max (aliases accepted — see Swagger); optional previous-period average. |
| `POST .../bsc-entry/partnerships-signed` | **multipart**: **goalId** + **mouFile** *or* **signedMouDocumentUrl** / **mouDocumentUrl**; optional **incrementBy**. |
| `POST .../bsc-entry/service-delivery-customer-charter` | **multipart**: **goalId**, **addPercent**, **charterAvailableLocalLanguages**; files **supportingDocuments** (≤10) and/or **supportingDocumentUrls**. |
| `POST .../bsc-entry/jobs-created-aggregate` | **totalFullTimeJobs**; optional **fundId**, **excludeStatuses**[]. |
| `POST .../bsc-entry/resource-budget-alignment` | **actualSpend**, **strategicAllocation**, **criticalOverspendPercent**; **currencyCode**. |
| `POST .../bsc-entry/inclusion-diversity-reporting` | **groupCounts** object (dimension → count). |
| `POST .../bsc-entry/accounting-period-from-gl` | **No goalId** — **periodStart**/**periodEnd**; optional **revenueGoalId**, **netProfitGoalId** to receive GL-derived pushes. |
| `POST .../bsc-entry/statutory-reports-output` | **multipart**: **goalId** + **evidenceFile** *or* URL fields; optional **incrementBy**. |
| `POST .../bsc-entry/governance-checklist-score` | Items met vs total requirements (field aliases in Swagger). |
| `POST .../bsc-entry/procurement-plan-compliance` | Actual procured vs annual plan (aliases in Swagger); **currencyCode**. |
| `POST .../bsc-entry/ease-of-doing-business-progress` | Innovations completed vs target (aliases in Swagger). |
| `POST .../bsc-entry/skills-development-progress` | Certificates completed vs plan target (aliases in Swagger). |
| `POST .../bsc-entry/csr-participation-rate` | Participants completed vs eligible (aliases in Swagger). |

---

## Flow 2 — BSC workflow (variance, statutory, training)

| Endpoint | What the frontend should collect |
|----------|----------------------------------|
| `POST .../bsc-workflow/budget-variance-reports` | **performanceGoalId** or **goalId**; **narrative** (or **varianceAnalysis**); optional spend fields and period. **201** on success. |
| `GET .../bsc-workflow/budget-variance-reports/by-goal/:goalId` | Read-only list for a goal — variance history / table. |
| `POST .../bsc-workflow/statutory-submissions` | **multipart**: **goalId**; **evidenceFile** or URL; optional **incrementBy**. **201** on success. |
| `POST .../bsc-workflow/statutory-submissions/:id/manager-sign-off` | Manager action: optional **note** / **managerSignOffNote**; **id** from list/create. |
| `GET .../bsc-workflow/statutory-submissions/by-goal/:goalId` | Table/timeline of submissions + sign-off state. |
| `POST .../bsc-workflow/training-certificate-recorded` | Usually **HR integration**: **goalId**, optional **incrementBy** (default 1) when a certificate is approved. |

---

## Flow 3 — Performance contract setup (annual cascade)

Routes use **`authenticate` only** (no role matrix). Optional **`createdById`** overrides the JWT user as **creator** for audit.

Each contract covers **exactly one UTC calendar year** (Jan 1 00:00:00.000Z – Dec 31 23:59:59.999Z). For a given **year**, there is at most **one** ACTIVE contract per **entity**: Board (org-wide), **one per CEO user**, **one per department name**, **one per employee**.

**Period (required on every request):** Send **`periodYear`** (integer 2000–2100), **or** both **`periodStart`** and **`periodEnd`** matching those exact UTC bounds for that year. If **`periodYear`** and dates are both sent, they must agree. Optional **`periodLabel`** (defaults to the year string). The API **rejects** empty bodies with no period and **rejects** arbitrary date ranges that are not a full calendar year.

**Org order:** Board → CEO → Department → Employee for the same **`periodYear`**.

**Duplicates:** A second **POST** for the same entity and **same calendar year** is **rejected** with **409 Conflict** — `{ success: false, code: "PERFORMANCE_CONTRACT_DUPLICATE", message, existingContractId, periodYear }`. The first create returns **201** with `{ success: true, contract, created: true }`.

**Reset test data (destructive):** `npm run db:cleanup:performance-contracts` — clears FKs from goals/scorecards, then deletes all `performance_contracts` rows.

| Endpoint | What the frontend should collect |
|----------|----------------------------------|
| `POST /api/performance/contracts/board` | **`periodYear`** (recommended) or exact year bounds; optional **title**; optional **subjectUserId**, **reviewerUserId**, **approverUserId**. |
| `POST /api/performance/contracts/ceo` | **`periodYear`** or exact bounds. **subjectUserId** optional — omit to auto-resolve the user with the **CEO / Chief Executive** role; pass id only to override. Optional **title**, **reviewerUserId**, **approverUserId**. |
| `POST /api/performance/contracts/department` | **`periodYear`** or exact bounds; **departmentName** **required**; optional **title**. |
| `POST /api/performance/contracts/employee` | **`periodYear`** or exact bounds; **subjectUserId** **required**; optional **departmentName**, **firstName**, **lastName**. **404** if user id invalid. |

**Success:** **201** on create — `{ success: true, contract, created: true }`. **409** if a contract already exists for that entity and year.

### Example JSON bodies (Postman / UAT)

Use **Bearer JWT** and the **same `periodYear`** across contracts for one cycle. User ids below are **real examples** from NVCCZ UAT — replace with ids from your DB if different.

**Board** — `POST /api/performance/contracts/board`

```json
{
  "periodYear": 2026,
  "periodLabel": "2026"
}
```

**CEO** — `POST /api/performance/contracts/ceo` (omit `subjectUserId` so the server picks the single **CEO** role user; or override)

```json
{
  "periodYear": 2026
}
```

Optional explicit CEO (example user id):

```json
{
  "periodYear": 2026,
  "subjectUserId": "cmhlnqd460001unnslmw98ry8"
}
```

**Department** — `POST /api/performance/contracts/department` (hardcoded org department name **Investments**)

```json
{
  "departmentName": "Investments",
  "periodYear": 2026
}
```

**Employee** — `POST /api/performance/contracts/employee` (example: **Nyasha Analyst**, Investments)

```json
{
  "subjectUserId": "cml7sq9fo000ekt1b5ln2enub",
  "periodYear": 2026
}
```

**Alternative period (no `periodYear`)** — exact UTC calendar bounds for 2026:

```json
{
  "periodStart": "2026-01-01T00:00:00.000Z",
  "periodEnd": "2026-12-31T23:59:59.999Z"
}
```

---

## Swagger

Operations live under the tag **Updated performance** in `/api-docs` — use **Try it out** with a server URL that ends in **`/api`** so paths resolve correctly. Contract operations include **Examples** (minimal + UAT-style ids where relevant).
