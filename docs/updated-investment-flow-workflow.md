# Updated investment flow — workflow & implementation summary

This document describes the **end-to-end deal journey** from application through CFO disbursement, and summarizes **APIs, behaviour changes, emails, and helper scripts** added or tightened in this iteration.

For field-level API detail and env flags, see also **`docs/deal-workflow-api-tracker.md`**.

---

## Application flow (ordered)

### 1. Apply

- **POST `/api/applications`** (public) — create application; response includes **`dealReference`** and initial **`currentStage`** (e.g. `SCREENING_PENDING` after automated screening pipeline).
- Optional: **GET `/api/applications/status/:id`** — lightweight status.

### 2. Assign deal to analyst

- **PATCH `/api/applications/:id/assigned-analyst`** — body `{ "analystUserId": "<cuid>" }`.  
  Assign the **lead investment analyst** (Investments department, analyst role).  
  This user is used for **Active DD PMS task** assignee when DD is seeded.

### 3. Score application (analyst screening)

- **POST `/api/applications/:id/analyst-screening`** — body `{ "score": 0..100 }`.  
  Only the **assigned lead analyst** may call.  
  Score **&lt; 50** → `REJECTED_SCREENING`; **≥ 50** → records score, moves deal into **Active DD** path and seeds tasks (see tracker).

### 4. Upload KYC / compliance documents

- Upload required application documents per your existing document flows.
- **POST `/api/applications/:id/rbz-exchange-control-document`** — `multipart/form-data`, field **`file`** (RBZ Exchange Control).

### 5. Verify KYC

- **PATCH `/api/applications/:id/statutory-compliance`** — body `{ "kycVerified": true }`.  
  Business rules require RBZ document when verifying; sets **`complianceCleared`** when satisfied.  
  **Fund disbursement** endpoints remain **blocked** until `complianceCleared` is true.

### 6. Deal collaboration

- **GET/POST `/api/applications/:id/collaboration/messages`**, **POST `.../collaboration/comments`** (optional attachments), mention suggestions, etc. — same patterns as task chat (internal deal thread).

### 7. Active DD

- **POST `/api/applications/:id/due-diligence/initiate`** — when applicable from **`SCREENING`** (see tracker for exact guards).  
- **POST `/api/applications/:id/submit`** (applicant) — alternative path that can move **`SCREENING` → `ACTIVE_DD`** and seed PMS tasks.  
- Tasks carry **`taskMetadata`** (`dealId`, `applicationId`, `workflowPack`, etc.) — see **`docs/deal-workflow-api-tracker.md`**.

**Frontends (e.g. Blessing):** drive labels from **`applications.currentStage`**. Use **`ACTIVE_DD`** (not legacy `UNDER_DUE_DILIGENCE`) and show **`dealReference`** where a human deal id is needed.

### 8. Board review

- **POST `/api/board-reviews/:applicationId`** — **`multipart/form-data` only**.  
  Required field **`document`** (final Investment Memorandum file).  
  Optional text fields: `recommendationReport`, `finalComments`, `decisionReason`, `nextSteps`, `conditions`, `additionalInformation`, `overallScore`, `investmentApproved`, etc.  
  After success: IM stored, workflow advances toward vote / IC process (see **Voting Process** in Swagger).

### 9. Investment implementation

- **GET `/api/investment-implementations/signed-term-sheets`** — queue of applications ready to implement.  
- **POST `/api/investment-implementations/initiate`** — link **portfolio company**, **application**, **fund**; optional **milestone** vs **one-time** disbursement mode.  
- **POST `/api/investment-implementations/disbursements`** — create tranche; **`status`: `PENDING`** until CFO acts.  
- **GET `/api/investment-implementations/:investmentImplementationId/disbursement-summary`** — cap, pending vs disbursed, **`cfoApprovalStatusLabel`**, **`trancheIndex`**.

### 10. CFO — pending requests, approve or reject

- **GET `/api/investment-implementations/disbursements/pending`** — CFO queue.  
- **GET `/api/investment-implementations/disbursement-banks`** — payout banks (must be registered **before** `/:portfolioCompanyId` routes).  
- **POST `/api/investment-implementations/disbursements/:disbursementId/decision`** — body `{ "decision": "APPROVE" | "REJECT", "bankId"?: "...", "reason"?: "..." }`.  
  - **APPROVE** (requires **`bankId`**): cashbook payment + posted journal (1501 / bank GL), tranche set to **`DISBURSED`** with **`disbursedById` / `disbursedAt` / `transactionReference`**. When no non-`DISBURSED` tranches remain on the implementation, **application** → **`DISBURSED`**, implementation completed.  
  - **REJECT**: status **`REJECTED`**, notes appended; no cashbook.  
- **POST `/api/investment-implementations/disbursements/:disbursementId/approve`** — legacy alias of **APPROVE** with body `{ "bankId" }` only.

**Emails (non-blocking):** applicant receives **approval** (same-step disbursement copy) + **completed/disbursement** emails; **assigned lead analyst** receives **“disbursement request approved”** (posted) if **`assignedAnalystId`** has an email.

---

## Behaviour & code changes (high level)

| Area | Change |
|------|--------|
| **Period lock** | Single combined BANK+GL check for cashbook payments (`assertBankAndGlOpenForCashbookPayment`). |
| **Cashbook** | Optional **skip VAT refresh**, **preloaded bank**, **journal header** on create; fewer round trips. |
| **Audit / JE** | Transaction timeouts tuned for approve path. |
| **Approve disbursement** | One CFO action completes **accounting + DISBURSED**; optional **`markDisbursementAsDisbursed`** remains for legacy **`APPROVED`** rows. |
| **Emails** | Applicant: approved + completed templates; analyst: `sendFundDisbursementApprovedAnalystEmail`. |

---

## UAT / DB helper scripts

| Script | Purpose |
|--------|---------|
| **`npm run db:revert:latest-fund-disbursement-approval`** | Latest **APPROVED** or **DISBURSED** tranche with cashbook → **PENDING**, restore fund cap, delete cashbook/JE; roll **application** back to **`INVESTMENT_IMPLEMENTATION`** when no **`DISBURSED`** tranches remain. |
| **`npm run db:reset:rejected-disbursement-pending`** | Latest **REJECTED** tranche → **PENDING** (retest approve). |
| **`npm run db:rollback:fund-disbursement-cashbook`** | Orphan cashbook after failed approve (see script header). |

---

## Related Swagger tag

Operations that participate in this journey are also tagged **`Updated investment flow`** in OpenAPI so they appear under one section in Swagger UI, alongside the tag description.

---

*Workflow narrative aligned with repo as of CFO disbursement + email updates; cross-check `deal-workflow-api-tracker.md` for enum and env flag changes.*
