# Investment application flow — frontend guide

Call the API in **this step order**. Base URL + `/api`. Send `Authorization: Bearer <jwt>` except **Step 1** (and optional status).

Swagger tag **`Updated investment flow`** groups these routes (the UI may still sort paths alphabetically—use this doc for sequence).

Replace sample IDs with values from your own responses.

---

## Step 1 — Create application (public)

### `POST /api/applications`

**Response (save):** `data.id` → `applicationId`, `data.dealReference`, `data.currentStage`.

**JSON example:**

```json
{
  "applicantName": "Thandiwe Moyo",
  "applicantEmail": "thandiwe.moyo@acmecrops.example",
  "applicantPhone": "+263771234567",
  "applicantAddress": "12 Enterprise Rd, Harare",
  "businessName": "Acme Agri Processing Pvt Ltd",
  "businessDescription": "Grain aggregation and cold storage for smallholder farmers.",
  "industry": "Agri-processing",
  "businessStage": "OPERATIONAL",
  "foundingDate": "2019-03-01",
  "requestedAmount": 250000,
  "fundId": "cmjfpk2g0000lktwmt25ni8p8",
  "documents": [
    {
      "documentType": "BUSINESS_PLAN",
      "fileName": "acme-business-plan.pdf",
      "fileUrl": "https://storage.example.com/deals/acme/business-plan.pdf",
      "fileSize": 524288,
      "isRequired": true
    },
    {
      "documentType": "PROOF_OF_CONCEPT",
      "fileName": "pilot-warehouse-photo.pdf",
      "fileUrl": "https://storage.example.com/deals/acme/poc.pdf",
      "fileSize": 1024000,
      "isRequired": true
    },
    {
      "documentType": "MARKET_RESEARCH",
      "fileName": "sadc-grain-market-2025.pdf",
      "fileUrl": "https://storage.example.com/deals/acme/market.pdf",
      "fileSize": 890000,
      "isRequired": true
    },
    {
      "documentType": "PROJECTED_CASH_FLOWS",
      "fileName": "acme-5yr-projections.xlsx",
      "fileUrl": "https://storage.example.com/deals/acme/cashflows.xlsx",
      "fileSize": 156000,
      "isRequired": true
    }
  ]
}
```

**Multipart:** same fields as form values + `files[]` binary parts; optional `documentTypes` JSON string array matching file order.

### Optional `GET /api/applications/status/:applicationId`

Read `currentStage` only.

---

## Step 2 — Assign lead analyst

**Allowed stages:** `SCREENING_PENDING` or `SCREENING`.

### `PATCH /api/applications/{applicationId}/assigned-analyst`

```json
{
  "analystUserId": "cml7udye80014kt1b65oncfdl"
}
```

---

## Step 3 — Analyst screening score

**Allowed stage:** `SCREENING`. **Caller:** must be the assigned analyst.

**Resulting `currentStage`:** `REJECTED_SCREENING` if `score < 50`, else `ACTIVE_DD`.

### `POST /api/applications/{applicationId}/analyst-screening`

```json
{
  "score": 72
}
```

---

## Step 4 (optional) — Shortlisting trigger

**Allowed stage:** `SCREENING_PENDING`.

### `POST /api/applications/{applicationId}/trigger-shortlisting`

Body: see Swagger (often empty).

---

## Step 5 — RBZ file + KYC flag

Disbursement screens should check `complianceCleared` on the application; fund disbursement APIs return an error until it is true.

### `POST /api/applications/{applicationId}/rbz-exchange-control-document`

`multipart/form-data`: field **`file`** (single RBZ PDF).

### `PATCH /api/applications/{applicationId}/statutory-compliance`

```json
{
  "kycVerified": true
}
```

---

## Step 6 — Deal collaboration

### `GET /api/applications/{applicationId}/collaboration/messages`

### `POST /api/applications/{applicationId}/collaboration/messages`

```json
{
  "content": "@cml7udye80014kt1b65oncfdl please upload Q3 management accounts before Friday.",
  "mentionUserIds": ["cml7udye80014kt1b65oncfdl"]
}
```

### `POST /api/applications/{applicationId}/collaboration/comments`

`multipart/form-data`: **`content`** (string); optional **`attachments`** files (repeat field name, up to 10).

---

## Step 7 — Start due diligence (when still on `SCREENING`)

### `POST /api/applications/{applicationId}/due-diligence/initiate`

No body. **After success:** read `currentStage` → expect `ACTIVE_DD`.

**UI:** show `dealReference` on the deal shell; use `currentStage` for labels (`ACTIVE_DD`, not old `UNDER_DUE_DILIGENCE`).

---

## Step 8 — Board review: Investment Memorandum

### `POST /api/board-reviews/{applicationId}`

`multipart/form-data`:

| Field | Required | Example |
|--------|----------|---------|
| `document` | Yes | PDF binary |
| `recommendationReport` | No | "Recommend approval subject to conditions below." |
| `additionalInformation` | No | "Management meeting held 2026-04-01." |
| `decisionReason` | No | "Strong unit economics and clear exit path." |
| `conditions` | No | "Quarterly reporting within 30 days of quarter end." |
| `nextSteps` | No | "Legal to finalize SHA within 14 days." |
| `overallScore` | No | "82.5" |
| `finalComments` | No | "IC to note currency hedging discussion." |
| `investmentApproved` | No | `"true"` / `"false"` |
| `investmentRejected` | No | `"false"` |
| `conditionalApproval` | No | `"true"` |

---

## Step 9 — Board votes

### `POST /api/board-reviews/{applicationId}/votes`

If `vote` is **`APPROVE`**, **`comment` is required.**

```json
{
  "vote": "APPROVE",
  "comment": "I approve subject to conditions in the IM section 4.2."
}
```

```json
{
  "vote": "REJECT",
  "comment": "Valuation gap vs comparables."
}
```

### `GET /api/board-reviews/{applicationId}/votes/summary`

### `POST /api/board-reviews/{applicationId}/complete`

No body (manual finalize if your flow needs it).

---

## Step 10 — Investment implementation

**Application `currentStage`:** should be `INVESTMENT_IMPLEMENTATION` (after term sheet / board outcome in your product).

### `GET /api/investment-implementations/signed-term-sheets`

Query: `page`, `limit`.

### `POST /api/investment-implementations/initiate`

```json
{
  "portfolioCompanyId": "cmi79aihl000ajx04sc7x6ec7",
  "applicationId": "cmi78trsi0000jx048i72bb7m",
  "fundId": "cmjfpk2g0000lktwmt25ni8p8",
  "implementationPlan": "Tranche 1: working capital. Tranche 2: equipment after milestone 1.",
  "notes": "Acme — first draw aligned with harvest cycle.",
  "disbursementMode": "MILESTONE_BASED",
  "totalCommittedAmount": 200000,
  "commitmentCurrencyId": "cmh3bymy70000una4yk8leusu"
}
```

**Save:** `data.id` → `investmentImplementationId`.

---

## Step 11 — Create tranche (CFO queue item)

### `POST /api/investment-implementations/disbursements`

```json
{
  "investmentImplementationId": "cmnvimpl0001ktwm9abcde01",
  "amount": 20000,
  "disbursementDate": "2026-04-12T12:00:00.000Z",
  "disbursementType": "INITIAL",
  "notes": "Tranche 1 — first draw",
  "paymentCurrencyId": "cmh3bymy70000una4yk8leusu"
}
```

**Save:** `data.id` → `disbursementId`. List row shows `status: "PENDING"`, `cfoApprovalStatusLabel: "PENDING_CFO_APPROVAL"`.

### `GET /api/investment-implementations/{investmentImplementationId}/disbursement-summary`

Shows caps, tranches, `trancheIndex`, compliance flags.

---

## Step 12 — CFO: list payout banks + GL, queue, approve/reject

### 12a — **Banks and GL accounts (required before APPROVE)**

### `GET /api/investment-implementations/disbursement-banks`

Full URL: **`GET /api/investment-implementations/disbursement-banks`**

Optional query (match tranche payout currency):  
`?paymentCurrencyId=cmh3bymy70000una4yk8leusu`

**Use this response to build the bank picker.** Each item includes the **GL account** that will be credited on approve.

**Example response:**

```json
{
  "success": true,
  "message": "Banks for disbursement approval retrieved successfully",
  "data": [
    {
      "id": "cmh3bank00001unnvccbzusd01",
      "name": "NVCCZ USD Operating Account",
      "accountNumber": "10002938475621",
      "currencyId": "cmh3bymy70000una4yk8leusu",
      "currencyCode": "USD",
      "currencyName": "US Dollar",
      "glAccount": {
        "id": "cmglacct0001coaoperating01",
        "accountNo": "1010",
        "accountName": "Bank — USD Operating",
        "accountType": "ASSET"
      }
    }
  ]
}
```

**Approve payload:** set **`bankId`** to the chosen row’s **`id`** (not `glAccount.id`).

---

### 12b — Pending tranches

### `GET /api/investment-implementations/disbursements/pending`

---

### 12c — Approve or reject

### `POST /api/investment-implementations/disbursements/{disbursementId}/decision`

```json
{
  "decision": "APPROVE",
  "bankId": "cmh3bank00001unnvccbzusd01"
}
```

```json
{
  "decision": "REJECT",
  "reason": "Incorrect milestone evidence — please resubmit tranche request."
}
```

**After APPROVE:** response tranche has `status: "DISBURSED"`, `transactionReference`, `disbursedById`, `disbursedAt`. When every tranche is `DISBURSED`, application `currentStage` becomes **`DISBURSED`**.

### `POST /api/investment-implementations/disbursements/{disbursementId}/approve`

```json
{
  "bankId": "cmh3bank00001unnvccbzusd01"
}
```

Same effect as `decision: APPROVE`.

---

## Appendix — `currentStage` values (UI labels)

| Value | Typical UI meaning |
|--------|-------------------|
| `SCREENING_PENDING` | Submitted / in screening queue |
| `SCREENING` | Analyst work |
| `ACTIVE_DD` | Due diligence |
| `REJECTED_SCREENING` | Rejected at screening |
| `AUTO_REJECTED` | Auto-rejected |
| `BELOW_THRESHOLD` | Below threshold |
| `INVESTMENT_IMPLEMENTATION` | Implementation / tranches |
| `DISBURSED` | All tranches paid out |

---

## Appendix — Local DB reset scripts (QA only)

| Command | Use |
|---------|-----|
| `npm run db:revert:latest-fund-disbursement-approval` | Undo last CFO approve: tranche → `PENDING`, restore fund, remove cashbook/JE, set app back to `INVESTMENT_IMPLEMENTATION` when nothing left disbursed |
| `npm run db:reset:rejected-disbursement-pending` | Last `REJECTED` tranche → `PENDING` |
| `npm run db:rollback:fund-disbursement-cashbook` | Orphan cashbook cleanup |

---

## Appendix — Environment (only if you need stricter prod behaviour)

| Variable | Effect |
|----------|--------|
| `NVCCZ_STRICT_DEAL_ACCESS=true` | Stricter deal read / assign analyst |
| `NVCCZ_STRICT_BOARD_VOTE=true` | Stricter board vote / complete |
| `BOARD_VOTE_QUORUM_YES_COUNT` | Vote count for auto-complete (`0` = off) |

---

Schema and migration notes: **`docs/deal-workflow-api-tracker.md`**.
