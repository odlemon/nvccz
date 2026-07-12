# Model Builder — FE updates (2026-07-12 evening)

**Audience:** Frontend  
**API base (use this):** `http://31.220.82.129:3009/api`  
**Also OK:** `https://dev-api.arcus.co.zw/api`  
**Do not use:** `https://nvccz-pi.vercel.app/api` — login returns **402 Payment Required** (hosting/billing). Set:

```bash
NEXT_PUBLIC_API_BASE_URL=http://31.220.82.129:3009/api
# or
NEXT_PUBLIC_API_BASE_URL=https://dev-api.arcus.co.zw/api
```

Full API reference: [fpa-model-builder-api.md](./fpa-model-builder-api.md)

---

## What was fixed on backend

### 1. Dependency graph edges

**Before:** `GET /models/:id/dependency-graph` returned `modules` but `edges: []` when calculated LIs had no formulas.

**Now:**

- New models seed formulas for **Gross Profit** and **EBITDA** at create time.
- Existing models: calling the graph (or `POST …/seed-defaults`) auto-creates those formulas if missing.
- Edges are built from `LINE('CODE')` **and** bracket refs `[Name]` / `[Module.Name]`.
- Edge `kind`: `direct` | `indirect` | `external` | `invalid`.

**Expected after seed on a default model**

```http
GET /v1/fpa/models/{modelId}/dependency-graph
```

```json
{
  "success": true,
  "data": {
    "circular": false,
    "circularPath": [],
    "modules": [/* … */],
    "edges": [
      {
        "id": "e_…",
        "sourceLineItemId": "…",
        "targetLineItemId": "…",
        "kind": "direct"
      }
    ]
  }
}
```

Typical edges: `REVENUE`→`GROSS_PROFIT`, `COGS`→`GROSS_PROFIT`, `GROSS_PROFIT`→`EBITDA`, `SALARIES`/`RENT`/`MARKETING`→`EBITDA`, plus **indirect** hops.

**FE:** After create or open, refetch `dependency-graph`. No need for empty-edge special casing once formulas exist.

---

### 2. Formula coverage (MISSING_FORMULA)

**Before:** Validate warned `MISSING_FORMULA` for Gross Profit / EBITDA (WARNING — did not block publish).

**Now — default formulas**

| Line item | Expression |
|-----------|------------|
| `GROSS_PROFIT` | `LINE('REVENUE') - LINE('COGS')` |
| `EBITDA` | `LINE('GROSS_PROFIT') - LINE('SALARIES') - LINE('RENT') - LINE('MARKETING')` |

**Repair older models**

```http
POST /v1/fpa/models/{modelId}/seed-defaults
Authorization: Bearer …
```

```json
{
  "success": true,
  "data": {
    "modelId": "…",
    "formulasCreated": 2,
    "formulas": [/* … */]
  }
}
```

Idempotent (`formulasCreated: 0` if already present).  
Graph endpoint also runs this heal once before building edges.

**FE:** After open of an older model, either call `seed-defaults` once or rely on first `dependency-graph` fetch; then re-run validate — Gross Profit / EBITDA warnings should clear.

---

### 3. Dimension attach (Builder “+ Dimension”)

**Already live — use these from the Dimensions panel:**

| Action | Method | Path |
|--------|--------|------|
| Catalog | `GET` | `/v1/fpa/dimensions` |
| Read model attach | `GET` | `/v1/fpa/models/{modelId}/dimensions` |
| Attach / replace model dims | `PUT` | `/v1/fpa/models/{modelId}/dimensions` |
| Module dim keys | `PUT` | `/v1/fpa/modules/{moduleId}/dimensions` |
| Line-item dim keys | `PUT` | `/v1/fpa/line-items/{id}/dimensions` |

**Model attach body**

```json
PUT /v1/fpa/models/{modelId}/dimensions
{
  "dimensions": [
    { "key": "Product", "valueIds": ["memIdOrCode1", "memIdOrCode2"] },
    { "key": "Region", "valueIds": ["ZW", "ZA"] }
  ]
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "modelId": "…",
    "dimensions": [
      { "key": "PRODUCT", "dimensionId": "…", "valueIds": ["…"] }
    ]
  }
}
```

Notes:

- `PUT` **replaces** the full model dimension set (send the complete list you want attached).
- Empty `dimensions: []` clears all model attachments.
- Module / LI panels should use `dimensionKeys: ["Time","Product",…]` on the module/LI PUT endpoints (keys only, not members).

This is **not** setup-wizard-only — Builder “+ Dimension” should call model `PUT …/dimensions`.

---

### 4. Hosted API / env

| Host | Status |
|------|--------|
| `http://31.220.82.129:3009/api` | **Working** (smoke host) |
| `https://dev-api.arcus.co.zw/api` | **Working** (preferred public URL) |
| `https://nvccz-pi.vercel.app/api` | **402** — do not use until billing restored |

Permanent FE recommendation: **`https://dev-api.arcus.co.zw/api`**.

---

### 5. Reminder — Last Published name

Use `publishedByName` on **model** and on each **`versions[]`** entry. Do not render `publishedById`.

---

### 6. Validate 500 (`byCode is not defined`) — fixed

`POST /models/:id/validate` was throwing **500** because `enrichedValidate` referenced `byCode` / `allLines` without defining them.

**Now:** validate builds those maps from the model’s line items and returns the normal `{ passed, errors, warnings, issues, … }` payload. FE can finish the validate modal again.

---

### 7. After publish → auto DRAFT working copy

Publish still locks the published version (`status: LOCKED`). The API **also creates a new `DRAFT` working copy** (cells cloned, unlocked) and returns:

| Field | Use |
|-------|-----|
| `publishedVersionId` / `versionId` | The LOCKED published snapshot |
| `workingCopyVersionId` | **Switch Builder here** for further edits |
| `workingCopy` | Full DRAFT version row |

**FE:** On publish success, set active version to `data.workingCopyVersionId` (do not leave the user on the locked published version).

---

## Suggested FE checklist

- [ ] Point env at `dev-api.arcus.co.zw` or `:3009`
- [ ] On model open: `GET dependency-graph` (edges non-empty after seed)
- [ ] Wire Dimensions “+” → `PUT /models/:id/dimensions` (+ optional `GET` for current attach)
- [ ] Optional: `POST /models/:id/seed-defaults` for legacy models before validate
- [ ] Header “Last Published by …” → `publishedByName`
- [ ] Confirm validate no longer shows Gross Profit / EBITDA `MISSING_FORMULA` after seed
- [ ] Confirm `POST …/validate` returns 200 (not 500)
- [ ] On publish success: switch active version to `workingCopyVersionId`

---

## Deploy

Shipped with Model Builder FE-gap fixes on `master` (nts + client1). Re-smoke:

```http
POST /v1/fpa/models/{id}/seed-defaults
GET  /v1/fpa/models/{id}/dependency-graph
POST /v1/fpa/models/{id}/validate
GET  /v1/fpa/models/{id}/dimensions
PUT  /v1/fpa/models/{id}/dimensions
POST /v1/fpa/versions/{versionId}/publish
```
