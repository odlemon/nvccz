# Procurement UAT — Suites 03, 04 & 05 (2026)

This document maps spreadsheet acceptance criteria to **API behaviour**, **auth**, and **configuration**. Global API prefix: **`/api`** (e.g. staff RFQ matrix: `GET /api/procurement/rfqs/:id/comparison-matrix`).

---

## Suite 03 — RFQ & competitive bidding

| ID | Expected behaviour | How to exercise (backend) |
|----|----------------------|---------------------------|
| **3.1** | Automated RFQ from approved investee PR | Existing Suite 02 auto-RFQ after VC approval; **new** RFQs also create rows in `procurement_rfqs` when using `POST /api/procurement/rfq`. |
| **3.2** | Encrypted / hidden bids until closing | **Service redaction:** staff quotation list/detail hides `unitPrice`, `totalAmount`, line prices until `closingAt` (see `bidPricesSealed` in JSON). |
| **3.3** | No bid prices before deadline (incl. admin) | Same redaction for all authenticated vendor-quotation reads. |
| **3.4** | Comparison matrix | `GET /api/procurement/rfqs/:id/comparison-matrix` — highlights lowest **normalized** cost and highest **vendorRating** when open. |
| **3.5** | FX normalization | Matrix uses `MultiCurrencyService.convertCurrency` into RFQ `reportingCurrencyId` (or company default). |
| **3.6** | Award + regret | `POST /api/procurement/rfqs/:id/award` body: `winningQuotationId`, `awardRationale` — sets RFQ `AWARDED`, marks winner accepted, rejects others, emails regret. |
| **3.7** | RFQ extension | `PATCH /api/procurement/rfqs/:id/closing` body: `newClosingAt` — emails invited vendors (reuses RFQ email). |
| **3.8** | Technical weighting | Store `technicalScoreJson` on quotation submit; RFQ has `priceWeight` / `technicalWeight` (default 0.5 / 0.5) for composite score in matrix. |
| **3.9** | Clarification log | `POST /api/procurement/rfqs/:id/clarifications` (staff), `GET /api/procurement/rfqs/:id/clarifications`. |
| **3.10** | Public vs private | `visibility` on RFQ (`INVITED_ONLY` \| `PUBLIC_LISTING`). **Public list:** `GET /api/public/procurement/rfqs` (no auth). |

**Swagger tags:** `Procurement — RFQ & Bidding (Suite 03)` (see `swagger.ts`).

---

## Suite 04 — PO management & sign-off

| ID | Expected behaviour | How to exercise |
|----|----------------------|-----------------|
| **4.1** | PO from awarded bid | Existing `createPurchaseOrder` from quotation; PR portfolio fields copied onto PO when `requisitionId` is set. |
| **4.2** | PO approval limits | `AMOUNT_THRESHOLD` stages in approval config: if PO `totalAmount` **>** `amountThreshold`, approvers resolve from `roleCode` (default **CFO**). Implemented in `ApprovalService`. |
| **4.3** | PDF + QR placeholder | `GET /api/procurement/purchase-orders/:id/pdf` — MVP PDF (pdfkit) with QR **placeholder** and signature block. |
| **4.4** | Dispatch timestamp | On send: `dispatchedAt`, `sentAt`, status `SENT`. |
| **4.5** | Vendor acknowledgement | Email contains link to `POST /api/public/purchase-orders/:token/acknowledge` (token = `vendorAckToken`). |
| **4.6** | Amendments / versioning | `version` incremented on **line cancel**; full amendment workflow can extend same pattern. |
| **4.7** | Partial line cancel | `PATCH /api/procurement/purchase-orders/:poId/lines/:lineId/cancel` — line `CANCELLED`, PO totals recalculated from active lines. |
| **4.8** | Validity / expiry | `validityEndDate` on PO; grace days in `procurement_settings.po_validity_grace_days` (default 30) — reporting layer can flag overdue GRNs. |
| **4.9** | Multi-tranche delivery | `purchase_order_items.expected_delivery_date` per line. |
| **4.10** | Investee / tranche tags | `portfolio_company_id`, `fund_id`, `drawdown_tranche_id` on `purchase_orders` (filled from PR / params). |

**Verification URL (email):** `GET /api/procurement/purchase-orders/verify?token=` matches `po_pdf_verification_token`.

---

## Suite 05 — GRN & quality control

| ID | Expected behaviour | How to exercise |
|----|----------------------|-----------------|
| **5.1** | Investee site GRN | `POST /api/applicant/procurement/goods-received-notes` (applicant JWT) — PO must belong to applicant’s portfolio PR. |
| **5.2** | Partial receipt | PO status **`PARTIALLY_RECEIVED`** when some lines still pending. |
| **5.3** | Over-delivery tolerance | Default **5%** (`procurement_settings.over_delivery_tolerance_pct`); exceeded → error. |
| **5.4** | Quality rejection | Existing `quantityRejected` / `qualityStatus` on lines. |
| **5.5** | Attachments | `attachmentUrls` JSON on GRN; staff `POST /api/procurement/goods-received-notes` passes through body. |
| **5.6** | SES / services | `line_type` **GOODS** \| **SERVICE**, `milestone_description` on GRN lines. |
| **5.7** | GP review | Investee GRN gets status **`PENDING_GP_REVIEW`** until GP workflow extends approvals (hook via existing approval engine as needed). |
| **5.8** | Geo stamp | Optional `latitude`, `longitude`, `geoCapturedAt` on GRN create. |
| **5.9** | RTV | `POST /api/procurement/grn-return-to-vendor` — creates `grn_return_to_vendors` row (posting layer TBD). |
| **5.10** | Serial numbers | `serial_numbers` JSON on `goods_received_note_items`. |

---

## Migration

```bash
npm run db:migrate:procurement-suites-03-05
npx prisma generate
```

Re-run the migration to confirm **idempotent** `[skip]` logs.

---

## Related

- [procurement-uat.md](./procurement-uat.md) — Suites 01 & 02 (vendor master, investee drawdown).
