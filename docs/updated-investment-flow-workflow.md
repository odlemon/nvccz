# Investment application flow — frontend integration guide

This is the **canonical order** of API calls from first apply through CFO disbursement. Use it as the single sequence reference.

**Base URL:** your API host + `/api` (for example `http://localhost:3000/api`).

**Auth:** send `Authorization: Bearer <jwt>` on every step except **Step 1** (and optional status poll).

**Swagger:** operations are also tagged **`Updated investment flow`**. Swagger UI may list paths **alphabetically** within that tag—follow the **step numbers here** for the real sequence.

**Sample IDs** below are shaped like real CUIDs so you can copy into Postman; replace with values from your environment after each create.

---

## Step 1 — Apply (public)

**What happens:** A new deal is created. You get `id` (application id), `dealReference` (human-readable deal id, e.g. `VST-2026-000001`), and `currentStage` (typically `SCREENING_PENDING` until automated screening runs).

### `POST /applications`

**Option A — `application/json`** (documents as URLs or metadata your backend accepts):

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

**Option B — `multipart/form-data`** (typical for file upload from browser): include the same business fields as form fields plus **`files`** (one or more binary parts). Optional **`documentTypes`**: JSON string array matching file order, e.g. `["BUSINESS_PLAN","PROOF_OF_CONCEPT","MARKET_RESEARCH","PROJECTED_CASH_FLOWS"]`.

**Save from response:** `applicationId` (e.g. `cmi78trsi0000jx048i72bb7m`), `dealReference`, `currentStage`.

### Optional — `GET /applications/status/:id`

Lightweight poll for `currentStage` after submission (no heavy joins).

---

## Step 2 — Assign lead analyst

**When:** `SCREENING_PENDING` or `SCREENING`.

**What happens:** The chosen user becomes `assignedAnalystId`. Later, Active DD tasks prefer this assignee.

### `PATCH /applications/{applicationId}/assigned-analyst`

```json
{
  "analystUserId": "cml7udye80014kt1b65oncfdl"
}
```

---

## Step 3 — Analyst screening score

**When:** `SCREENING` only. Only the **assigned** analyst may call.

**What happens:** Score recorded. If score is **below 50**, stage becomes `REJECTED_SCREENING`. If **50 or above**, the deal moves to **Active DD** (`ACTIVE_DD`), due diligence is seeded, and PMS-style tasks are created for the analyst.

### `POST /applications/{applicationId}/analyst-screening`

```json
{
  "score": 72
}
```

---

## Step 4 — (Optional) Trigger AI shortlisting

**When:** `SCREENING_PENDING` only.

### `POST /applications/{applicationId}/trigger-shortlisting`

Usually no body; confirm in Swagger for your build.

---

## Step 5 — RBZ document and KYC verification

**When:** Any time before you need **`complianceCleared`** for fund disbursement. Disbursements are blocked until compliance is cleared.

### `POST /applications/{applicationId}/rbz-exchange-control-document`

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Example |
|--------|------|----------|---------|
| `file` | binary | Yes | RBZ approval PDF |

### `PATCH /applications/{applicationId}/statutory-compliance`

```json
{
  "kycVerified": true
}
```

Requires the RBZ document to exist when setting `kycVerified` true; response should show `complianceCleared: true` when rules are satisfied.

---

## Step 6 — Deal collaboration (internal thread)

**When:** Any authenticated user on the deal; use during screening / DD / board prep.

### `GET /applications/{applicationId}/collaboration/messages`

No body.

### `POST /applications/{applicationId}/collaboration/messages`

```json
{
  "content": "@cml7udye80014kt1b65oncfdl please upload updated Q3 management accounts before Friday.",
  "mentionUserIds": ["cml7udye80014kt1b65oncfdl"]
}
```

### `POST /applications/{applicationId}/collaboration/comments`

**Content-Type:** `multipart/form-data` when attaching files.

| Field | Type | Required | Example |
|--------|------|----------|---------|
| `content` | string | Yes | "See attached legal opinion." |
| `attachments` | file[] | No | One or more PDFs (field name repeated per file) |

---

## Step 7 — Active due diligence (if not already in `ACTIVE_DD`)

**When:** From `SCREENING` if DD was not opened by the screening score path.

**What happens:** Stage becomes `ACTIVE_DD`; DD record and tasks are seeded.

### `POST /applications/{applicationId}/due-diligence/initiate`

Typically **no body** (confirm in Swagger).

**UI:** Show **`currentStage`** as `ACTIVE_DD` and display **`dealReference`** on deal headers (not the legacy label `UNDER_DUE_DILIGENCE`).

---

## Step 8 — Board review: create review and upload Investment Memorandum

**When:** Application is in the board-review part of your funnel (per your stage rules).

**What happens:** Final IM is stored; review moves toward **ready for vote**; IC members may be notified.

### `POST /board-reviews/{applicationId}`

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Example value |
|--------|------|----------|----------------|
| `document` | file | **Yes** | `Acme_IM_Final_v3.pdf` (binary) |
| `recommendationReport` | string | No | "Recommend approval subject to conditions below." |
| `additionalInformation` | string | No | "Management meeting held 2026-04-01." |
| `decisionReason` | string | No | "Strong unit economics and clear exit path." |
| `conditions` | string | No | "Quarterly reporting within 30 days of quarter end." |
| `nextSteps` | string | No | "Legal to finalize SHA within 14 days." |
| `overallScore` | string | No | "82.5" |
| `finalComments` | string | No | "IC to note currency hedging discussion." |
| `investmentApproved` | string | No | `"true"` or `"false"` |
| `investmentRejected` | string | No | `"false"` |
| `conditionalApproval` | string | No | `"true"` |

---

## Step 9 — Board votes

**What happens:** Each voter submits once. For **`APPROVE`**, **`comment` is required**. When enough APPROVE votes and quorum rules pass, the service may auto-complete the review (see env `BOARD_VOTE_QUORUM_YES_COUNT`).

### `POST /board-reviews/{applicationId}/votes`

**Approve:**

```json
{
  "vote": "APPROVE",
  "comment": "I approve subject to conditions in the IM §4.2."
}
```

**Reject:**

```json
{
  "vote": "REJECT",
  "comment": "Valuation gap vs comparables."
}
```

### `GET /board-reviews/{applicationId}/votes/summary`

No body (may be restricted in strict board-vote mode).

### `POST /board-reviews/{applicationId}/complete`

No body — finalizes review and updates application stage when used manually (if not auto-completed).

---

## Step 10 — Term sheet and investment implementation

After board approval, your product flow should reach **signed term sheet** and **`INVESTMENT_IMPLEMENTATION`** (or equivalent) on the application.

### `GET /investment-implementations/signed-term-sheets`

Query: `page`, `limit`. Lists applications ready to start implementation.

### `POST /investment-implementations/initiate`

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

**Save:** `investmentImplementationId` from the response (example shape: `cmnvimpl0001ktwm9abcde01`).

---

## Step 11 — Create a disbursement request (tranche)

**What happens:** A row with `status: "PENDING"` and `cfoApprovalStatusLabel: "PENDING_CFO_APPROVAL"`.

### `POST /investment-implementations/disbursements`

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

**Save:** `disbursementId` from response (e.g. `cmnvpjsep0001unnsx7bwfjdi`).

### `GET /investment-implementations/{investmentImplementationId}/disbursement-summary`

No body — shows committed vs drawn, each tranche with `trancheIndex`, compliance flags.

---

## Step 12 — CFO: banks, queue, approve or reject

### `GET /investment-implementations/disbursement-banks`

Optional query: `paymentCurrencyId=cmh3bymy70000una4yk8leusu` to filter banks by payout currency.

### `GET /investment-implementations/disbursements/pending`

CFO work queue.

### `POST /investment-implementations/disbursements/{disbursementId}/decision`

**Approve** (posts cashbook + GL, marks tranche `DISBURSED`, sets `disbursedById` / `disbursedAt` / `transactionReference`; when all tranches are disbursed, application stage becomes `DISBURSED`):

```json
{
  "decision": "APPROVE",
  "bankId": "cmh3bank00001unnvccbzusd01"
}
```

**Reject:**

```json
{
  "decision": "REJECT",
  "reason": "Incorrect milestone evidence — please resubmit tranche request."
}
```

### `POST /investment-implementations/disbursements/{disbursementId}/approve`

Legacy shortcut — body only:

```json
{
  "bankId": "cmh3bank00001unnvccbzusd01"
}
```

**Emails (async):** applicant receives approval + completed disbursement messages; lead analyst receives “disbursement approved / posted” if `assignedAnalystId` has an email.

---

## Appendix A — Stage cheat sheet (`applications.currentStage`)

| Stage | Meaning |
|--------|---------|
| `SCREENING_PENDING` | Submitted; automated screening may still run |
| `SCREENING` | Passed shortlist gate; analyst assignment and score happen here |
| `ACTIVE_DD` | Active due diligence |
| `REJECTED_SCREENING` | Failed analyst score or screening |
| `AUTO_REJECTED` | Automated rejection |
| `BELOW_THRESHOLD` | Below investment threshold |
| `INVESTMENT_IMPLEMENTATION` | Post–term sheet implementation work |
| `DISBURSED` | All tranches for the implementation are disbursed |

---

## Appendix B — DB scripts (local / QA reset)

| Command | Use |
|---------|-----|
| `npm run db:revert:latest-fund-disbursement-approval` | Undo latest approved/disbursed tranche: restore fund, delete cashbook/JE, set tranche `PENDING`, roll application back to `INVESTMENT_IMPLEMENTATION` when no disbursed tranches remain |
| `npm run db:reset:rejected-disbursement-pending` | Turn latest `REJECTED` tranche back to `PENDING` |
| `npm run db:rollback:fund-disbursement-cashbook` | Clean orphan cashbook after a failed approve |

---

## Appendix C — Optional environment behaviour

| Variable | Effect |
|----------|--------|
| `NVCCZ_STRICT_DEAL_ACCESS=true` | Stricter rules on who may assign analysts / read deals |
| `NVCCZ_STRICT_BOARD_VOTE=true` | Stricter board vote and complete rules |
| `BOARD_VOTE_QUORUM_YES_COUNT` | Minimum APPROVE vote count for auto-complete (default `3`; `0` disables) |

---

*For migrations and task metadata JSON shape, see **`docs/deal-workflow-api-tracker.md`**.*
