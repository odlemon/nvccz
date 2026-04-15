# Procurement UAT

This folder documents **Suites 01–06** (aligned with UAT spreadsheets). **OpenAPI** lists paths **without** repeating the global `/api` prefix (e.g. `GET /procurement/rfq`); in Postman or curl use `{{baseUrl}}/api/...`.

## Suite index (all)

| Suite | Name (matches Swagger tag) | Primary doc |
|-------|---------------------------|-------------|
| **01** | **`Vendor Master, Compliance & KYC (Suite 01)`** | [§ Suite 01](#vendor-master-compliance--kyc-suite-01) below |
| **02** | **`Investee Portal — Investment Drawdown`** (often with **`Applicant Portal`** or **`Procurement - *`**) | [§ Suite 02](#investee-portal-investment-drawdown--pr-suite-02--2026) below |
| **03** | **`Procurement — RFQ & Bidding (Suite 03)`** (plus **`Procurement - RFQ`** on shared routes) | [procurement-uat-suites-03-05.md](./procurement-uat-suites-03-05.md#suite-03--rfq--competitive-bidding) |
| **04** | **`Procurement — PO & Sign-off (Suite 04)`** (plus **`Procurement - Purchase Orders`**) | [procurement-uat-suites-03-05.md](./procurement-uat-suites-03-05.md#suite-04--po-management--sign-off) |
| **05** | **`Procurement — GRN & QC (Suite 05)`** (plus **`Procurement - GRN`**) | [procurement-uat-suites-03-05.md](./procurement-uat-suites-03-05.md#suite-05--grn--quality-control) |
| **06** | **`Procurement — AI invoice intake (Suite 06)`**, **`Procurement — 3-way match (Suite 06)`**, **`Procurement — Match dashboard (Suite 06)`** | [procurement-uat-suite-06.md](./procurement-uat-suite-06.md) |

### Where to read details

- **Suites 01 & 02** — sections below on this page.
- **Suites 03, 04 & 05** — [procurement-uat-suites-03-05.md](./procurement-uat-suites-03-05.md) (IDs 3.x–5.x, migrations, endpoints).
- **Suite 06** — [procurement-uat-suite-06.md](./procurement-uat-suite-06.md) (AI intake, 3-way match, env vars, tests).

---

## Vendor Master, Compliance & KYC (Suite 01)

### Vendor self-registration (portal + staff approval)

#### Flow summary

1. **Vendor (unauthenticated)** submits registration; the API returns a **`kycUploadToken`** (and optional `kycDocumentsUrl`). The frontend must **persist that token** (e.g. show “save this link” or store it for the session).
2. **Vendor** uploads KYC files using that **same token** in the URL (no login).
3. **Staff (authenticated)** lists vendors awaiting approval, reviews them, then approves each vendor. Approval clears the portal token and sets the vendor to **ACTIVE**.

#### Endpoints (four)

| Step | Method | Path | Auth |
|------|--------|------|------|
| 1. Register | `POST` | `/api/public/vendor-registration` | None |
| 2. Upload KYC | `POST` | `/api/public/vendor-registration/:token/kyc-documents` | None (token in path) |
| 3. List pending | `GET` | `/api/accounting/vendors/pending-review` | Bearer JWT |
| 4. Approve | `PUT` | `/api/accounting/vendors/:id/approve-registration` | Bearer JWT |

Replace `:token` with the value of **`kycUploadToken`** from the registration response. Replace `:id` with the vendor **`id`** from the pending list (or vendor detail).

#### Frontend notes

- After **register**, read **`data.kycUploadToken`** from the JSON body (or use **`data.kycDocumentsUrl`** which embeds the token).
- **KYC upload** is `multipart/form-data`: attach one or more files. Either name each part with the document code (`CR14`, `BANK_LETTER`, `CERTIFICATE_OF_INCORPORATION`, `ITF263`, `OTHER`) or send a single part named **`file`** plus a text field **`documentType`** with one of those codes. Optional: **`GET /api/public/vendor-registration/:token/kyc-requirements`** returns labels, required slots, and what is still missing.
- **Staff** calls use the same login as the rest of the app: **`Authorization: Bearer <access_token>`**.

#### Approval behaviour

- **`GET /api/accounting/vendors/pending-review`** returns vendors with **`registrationStatus: PENDING_REVIEW`**.
- **`PUT /api/accounting/vendors/:id/approve-registration`** sets the vendor to **ACTIVE** and invalidates the self-registration token so portal KYC uploads for that vendor are closed.

### Vendor rating (auto from GRN vs promised delivery)

The system recalculates **`vendorRating`** (1.00–5.00, two decimals) from **approved/received GRNs** for that vendor. Each GRN is scored from **`PurchaseOrder.expectedDeliveryDate`** (end of that calendar day) vs **`GoodsReceivedNote.receivedDate`**:

| Lateness (after end of promised day) | Stars for that GRN |
|--------------------------------------|--------------------|
| On time or early                     | 5 |
| 1–3 days                             | 4 |
| 4–7 days                             | 3 |
| 8–14 days                            | 2 |
| 15+ days                             | 1 |

If **`expectedDeliveryDate`** is null on the PO, that GRN is **skipped**. The vendor’s stored rating is the **average** of all included GRNs (then clamped to 1–5).

**When it recalculates:** after **`POST /api/procurement/goods-received-notes`** (GRN is created with status **`RECEIVED`**), and when a **GRN** approval workflow completes (**`ApprovalService`**).

A PO alone does **not** set **`vendorRating`** — at least one qualifying GRN is required.

### Endpoints (vendor rating UAT)

| Step | Method | Path | Auth |
|------|--------|------|------|
| Login | `POST` | `/api/auth/login` | None |
| List / detail PO | `GET` | `/api/procurement/purchase-orders` or `/api/procurement/purchase-orders/:id` | Bearer JWT |
| Create GRN | `POST` | `/api/procurement/goods-received-notes` | Bearer JWT |
| Read vendor rating | `GET` | `/api/accounting/vendors/:vendorId` | Bearer JWT |

### Sample body — create GRN

1. From the PO, note **`vendorId`**, **`purchaseOrderId`**, and a line **`id`** with **`quantityPending` > 0.
2. **`POST /api/procurement/goods-received-notes`** — JSON example:

```json
{
  "purchaseOrderId": "<PO_UUID>",
  "receivedDate": "2026-04-20T10:00:00.000Z",
  "items": [
    {
      "purchaseOrderItemId": "<PO_LINE_UUID>",
      "quantityReceived": 1,
      "quantityAccepted": 1,
      "quantityRejected": 0,
      "qualityStatus": "PASSED"
    }
  ]
}
```

Use **`receivedDate`** to simulate early/on-time vs late delivery relative to the PO’s **`expectedDeliveryDate`**. Omit **`receivedDate`** to use “now”.

3. **`GET /api/accounting/vendors/:vendorId`** — **`data.vendorRating`**, **`data.vendorRatingUpdatedAt`**.

Repeat the GRN call with different **`receivedDate`** values to see the **average** rating move. Quantities must not exceed **`quantityPending`** on the line.

### Blacklisted vendors vs RFQs

Blacklisted vendors are **not** returned from the RFQ picker and **cannot** be targeted by **`POST /api/procurement/rfq`** (hard error). New **purchase orders** are also rejected for a blacklisted vendor.

### Endpoints (authenticated)

| Action | Method | Path | Body |
|--------|--------|------|------|
| Blacklist | `POST` | `/api/accounting/vendors/:id/blacklist` | `{ "blacklistReason": "Why (optional)" }` or `{ "reason": "..." }` |
| Unblacklist | `POST` | `/api/accounting/vendors/:id/unblacklist` | none |

Both write **`BLACKLIST` / `UNBLACKLIST`** rows to **`audit_logs`** (`entityType: Vendor`).

### Related endpoints (RFQ picker + send)

| Step | Method | Path | Auth |
|------|--------|------|------|
| RFQ-eligible vendors | `GET` | `/api/accounting/vendors/for-rfq` | Bearer JWT |
| Send RFQ | `POST` | `/api/procurement/rfq` | Bearer JWT |

### UAT sequence (blacklist + RFQ exclusion)

1. **`GET /api/accounting/vendors/for-rfq?search=<vendor name>`** — note **`id`**.
2. **`POST /api/accounting/vendors/:id/blacklist`** — body `{ "blacklistReason": "UAT test" }` (optional).
3. **`GET /api/accounting/vendors/for-rfq?search=...`** — vendor **must not** appear.
4. **`POST /api/procurement/rfq`** with `"vendorIds": ["<id>"]` — **400**, blacklisted message.
5. **`POST /api/accounting/vendors/:id/unblacklist`** — vendor can appear again on **`/for-rfq`** when otherwise eligible (active, email, not suspended/pending review).

### Swagger (Suite 01)

In **`/api-docs`**, filter by **`Vendor Master, Compliance & KYC (Suite 01)`**. Staff vendor APIs are also tagged **`Accounting - Vendors`**. Public self-registration and KYC uploads use the same suite tag on paths under **`/public/vendor-registration`** (no auth) and **`/accounting/vendors/...`** (JWT).

---

## Investee Portal: Investment Drawdown & PR (Suite 02) — *2026*

Portfolio-linked purchase requisitions: drawdown is capped vs committed tranche; investee submits with a **use of funds** URL; **VC CFO** (or **SYSADMIN**) approves the executive gate and triggers **auto-RFQ**; **FundManagers** only see investee PRs for **their** funds (CFO / SYSADMIN / **PROC_MGR** see all for listing endpoints that apply scope).

### Flow summary

1. **Investee (applicant JWT)** creates a **DRAFT** PR with `drawdownRequestAmount`, `useOfFundsDocumentUrl`, line items, optional `sourcingCategory`.
2. **Investee** submits → status **`PENDING_VC_EXECUTIVE_REVIEW`**, procurement desk notified (email; optional env override).
3. **VC CFO / SYSADMIN** approves → status moves through **APPROVED** then **RFQ_SENT** (auto-invite up to **5** eligible vendors by category + rating).
4. **Cancel** (before award): investee may cancel from **DRAFT** or **PENDING_VC_EXECUTIVE_REVIEW** → back to **DRAFT**, drawdown reservation released.
5. **Hard cap:** if `(pending + this PR) > tranche`, submit/create fails with **`Drawdown Request Exceeds Available Investment Tranche.`**

### Endpoints — suggested Postman order

| Step | Who | Method | Path | Auth |
|------|-----|--------|------|------|
| 1 | Investee | `GET` | `/api/applicant/procurement/drawdown` | Bearer (applicant) |
| 2 | Investee | `POST` | `/api/applicant/procurement/requisitions` | Bearer (applicant) |
| 3 | Investee | `PUT` | `/api/applicant/procurement/requisitions/:id/submit` | Bearer (applicant) |
| 4 | VC desk / FM | `GET` | `/api/procurement/requisitions/investee` | Bearer |
| 5 | VC desk / FM | `GET` | `/api/procurement/requisitions/investee/sla-breached` | Bearer (>48h pending VC) |
| 6 | VC CFO | `PUT` | `/api/procurement/requisitions/:id/approve` | Bearer |
| 7a | VC CFO | `PUT` | `/api/procurement/requisitions/:id/reject` | Bearer + body `rejectionReason` |
| 7b | Investee | `POST` | `/api/applicant/procurement/requisitions/:id/cancel` | Bearer (draft / pending VC only) |
| — | Staff | `GET` | `/api/procurement/requisitions/:id` | Bearer (fund-scoped / owner) |
| — | Staff | `GET` | `/api/procurement/dashboard` | Bearer (`suite02InvesteeDrawdown` + scoped recent rows) |

Staff may also **`POST /api/procurement/requisitions`** with optional `portfolioCompanyId`, `fundId`, `useOfFundsDocumentUrl`, `drawdownRequestAmount` (department workflow differs from investee path).

### Sample body — create investee PR (step 2)

`POST /api/applicant/procurement/requisitions`

```json
{
  "title": "Equipment for program delivery",
  "description": "Capex aligned to approved use of funds",
  "sourcingCategory": "IT_SERVICES",
  "drawdownRequestAmount": 5000,
  "useOfFundsDocumentUrl": "https://storage.example.com/investee/use-of-funds.pdf",
  "items": [
    {
      "itemName": "Laptops",
      "quantity": 2,
      "unit": "ea"
    }
  ]
}
```

### Sample body — reject (step 7a)

`PUT /api/procurement/requisitions/:id/reject`

```json
{
  "rejectionReason": "Insufficient detail on use of funds"
}
```

### Configuration

- **`PROCUREMENT_INVESTEE_NOTIFY_EMAILS`** (optional, comma-separated): override recipients for “procurement desk” email on investee submit. If unset, users in **Procurement** department or roles **PROC_MGR**, **PROC_OFF**, **BUYER**, **PROC_COORD** are notified.

### Related

- [procurement-uat-suites-03-05.md](./procurement-uat-suites-03-05.md) — Suites **03–05** (RFQ & bidding, PO sign-off, GRN & QC).
- [procurement-uat-suite-06.md](./procurement-uat-suite-06.md) — Suite **06** (AI-assisted vendor invoice intake and 3-way match).

### Swagger (Suite 02)

Filter **`/api-docs`** by **`Investee Portal — Investment Drawdown`** and **`Applicant Portal`**. Applicant-only routes (`/applicant/procurement/...`) use both tags where applicable. Staff investee lists use **`Procurement - Requisitions`** / **`Procurement - Dashboard`** as well. Investee **GRN** create is tagged **`Procurement — GRN & QC (Suite 05)`** in addition to the investee tags.

**Path prefix:** OpenAPI lists paths **without** `/api` (e.g. `GET /applicant/procurement/drawdown`). Call **`{{baseUrl}}/api/applicant/procurement/drawdown`** in clients.

---

## Suites 03–06 (summary)

For full acceptance tables, migrations, and endpoint lists, use the linked files above. Swagger groups the same suite names:

| Suite | OpenAPI tags to filter |
|-------|-------------------------|
| 03 | **`Procurement — RFQ & Bidding (Suite 03)`** · **`Procurement - RFQ`** |
| 04 | **`Procurement — PO & Sign-off (Suite 04)`** · **`Procurement - Purchase Orders`** |
| 05 | **`Procurement — GRN & QC (Suite 05)`** · **`Procurement - GRN`** |
| 06 | **`Procurement — AI invoice intake (Suite 06)`** · **`Procurement — 3-way match (Suite 06)`** · **`Procurement — Match dashboard (Suite 06)`** |

Base path for Suite 06 APIs: **`/procurement/suite06`** (full URL: **`/api/procurement/suite06/...`**).
