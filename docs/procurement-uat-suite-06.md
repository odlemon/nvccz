# Procurement UAT — Suite 06 (AI-assisted intake & 3-way match)

Global API prefix: `/api`. Suite 06 base path: `/api/procurement/suite06`.

## Environment (configurable LLM)

The stack uses an **OpenAI-compatible** HTTP API (`/v1/chat/completions`). Configure:

| Variable | Purpose |
|----------|---------|
| `LLM_API_BASE_URL` | Base URL (no trailing slash), e.g. `https://api.openai.com/v1` |
| `LLM_API_KEY` | Optional override; if unset, defaults come from **`src/config/llmGlobals.ts`** (same as portfolio shortlisting). |
| `LLM_MODEL` | Model name (default `gpt-4o`) |
| `LLM_TIMEOUT_MS` | Request timeout (default 60000) |
| `API_INTERNAL_BASE_URL` | **Server-side PDF fetch:** origin used when `documentUrl` is stored as a relative path (e.g. `/api/public-media/...`). Should be the API host **without** a trailing `/api` if paths already include `/api/...` (e.g. `http://localhost:3000`). |
| `VENDOR_INVOICE_EXTRACT_MAX_CHARS` | Optional cap (default **120000**) for PDF text passed to the LLM after whitespace collapse — must be **much larger** than the 4000-char portfolio shortlisting cap. |
| `SUITE06_MATCH_CONFIDENCE_THRESHOLD` | 0–1; below this, intake status is `PENDING_VERIFICATION` (default `0.85`) |
| `SUITE06_PRICE_VARIANCE_PCT` | Invoice unit price may not exceed PO line price by more than this percent without DISPUTED match (default `1`) |
| `SUITE06_REQUIRE_MATCH_WHEN_PO_GRN_LINKED` | When `true` (default), bills with both PO and GRN linked cannot be submitted or paid until `suite06_match_status` is `MATCHED`. Set `false` only for legacy data or experiments. |

Portfolio application scoring uses the same **`LlmChatService`** / `LLM_*` variables as Suite 06 invoice extraction (OpenAI-compatible `POST …/chat/completions`). When `LLM_API_KEY` is unset, the server falls back to the embedded DeepSeek test defaults (UAT only — set real keys in production).

### Uploading PDFs (fixes “upload not working”)

- **Suite 06 (staff, JWT):** `POST /api/procurement/suite06/intakes` — **multipart/form-data** with required **`document`** (PDF), **`vendorId`**, **`sourcePurchaseOrderId`**, **`goodsReceivedNoteId`**. Then `POST /api/procurement/suite06/intakes/:id/extract` with **no body** or optional **JSON** to override links — uses the PDF URL and ids already on the intake (no second upload). List intakes: `GET /api/procurement/suite06/intakes?take=50&skip=0`. Replace PDF only: `POST /api/procurement/suite06/intakes/:id/document` (multipart **`document`**). URL-only intake (`documentUrl`) is **not** accepted on create.
- **Legacy public vendor invoice (no JWT):** `POST /api/procurement/invoices/upload-document` — same multipart field; use returned **`documentUrl`** as **`documentPath`** (or URL) on `POST /api/procurement/invoices`.

Previously, the UI had to obtain a hosted URL elsewhere; there was **no** multipart upload on these routes. Text extraction also reused the portfolio **4000-character** truncation for all PDFs, which broke multi-line invoice extraction and confused the LLM.

## Behaviour map (6.1–6.10)

| ID | Expected | How to exercise |
|----|----------|------------------|
| **6.1** | Extract invoice header + lines from PDF text | `POST .../intakes` (multipart) then `POST .../intakes/:id/extract` (optional JSON overrides) — `extractedPayloadJson` on intake |
| **6.2** | 3-way match PO vs GRN vs bill | Vendor bill must have `source_purchase_order_id` and `source_goods_received_note_id`; `POST /api/procurement/suite06/purchase-invoices/:purchaseInvoiceId/run-match`. Bills created from PO only: on **DRAFT** bill, `PUT /api/accounting/purchase-invoices/:id` with `sourceGoodsReceivedNoteId` (and `sourcePurchaseOrderId` if missing) to link GRN before running match. **Deterministic matcher** compares PO lines to bill lines **by index** (same line count and order); GRN accepted qty is summed **per PO line id**. If the LLM draft bill has a different number of lines than the PO, match returns **DISPUTED** (`LINE_MISMATCH`) — align line count/order with the PO before re-running match. |
| **6.3** | Price over PO (default >1%) | Match sets `suite06_match_status` = `DISPUTED` with `PRICE_OVER_PO` in JSON; **single pay, batch pay, and submit-invoice** (BANK/CASH/CREDIT) are blocked until resolved |
| **6.4** | Invoice qty > GRN accepted | `QTY_OVER_GRN` flag; payment blocked when DISPUTED |
| **6.5** | Correction map | `POST .../field-corrections` — merged into next extraction prompt for that vendor |
| **6.6** | Duplicate supplier ref | Unique `(vendor_id, vendor_invoice_reference)`; duplicate rejected on draft bill creation |
| **6.7** | Tax parse vs vendor | `tax_parse_status` on intake: `MISMATCH` when extracted `taxTreatment` is `VAT_15` and the vendor’s `taxComplianceStatus` is `INVALID` (not a full tax matrix) |
| **6.8** | Scanned PDFs | Same text-extraction + LLM pipeline (no separate bitmap OCR); empty or poor text → weaker extraction and often `PENDING_VERIFICATION` via confidence threshold |
| **6.9** | CFO view | `GET .../cfo-dashboard` |
| **6.10** | Human verification queue | `GET .../verification-queue`; `PATCH .../intakes/:id/verify` after review |

## Status values

**Intake:** `DRAFT` → after extract: `EXTRACTED` or `PENDING_VERIFICATION` (low confidence).

**Vendor bill (`suite06_match_status`):** `MATCHED`, `DISPUTED`, `PENDING_VERIFICATION` (from low-confidence intake path), or null (not evaluated). With default env, **null is not sufficient to pay or submit** once both PO and GRN are linked: you must run match so the status becomes `MATCHED` (or fix `DISPUTED`).

## Migration

```bash
npm run db:migrate:procurement-suite06
npx prisma generate
```

Re-run to confirm idempotent `[skip]` logs.

## Local checks

```bash
npm run test:uat:suite06:all
```

Or step by step: `npm run test:api:timeout-paths`, `npm run test:uat:suite06`, `npm run uat:suite06:smoke`. (`test:api:timeout-paths` asserts Suite 06 + vendor-bill routes use the long HTTP timeout bucket where expected.)

With database: `npm run test:uat:three-way-variance` (PO variance / submit behaviour).

## Swagger (`/api-docs`)

Filter by these tags (exact names):

- **`Procurement — AI invoice intake (Suite 06)`** — `POST /procurement/suite06/intakes`, extract, verify, draft bill, field corrections, verification queue.
- **`Procurement — 3-way match (Suite 06)`** — `POST /procurement/suite06/purchase-invoices/{purchaseInvoiceId}/run-match`.
- **`Procurement — Match dashboard (Suite 06)`** — `GET /procurement/suite06/cfo-dashboard`.

Suite index: [procurement-uat.md](./procurement-uat.md).
