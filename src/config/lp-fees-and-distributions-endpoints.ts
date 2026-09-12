/**
 * OpenAPI paths for **LP Fees & Distributions** (management fees + LP distributions).
 * Paths are relative to `servers[].url` (ends with `/api`).
 * Merged in `swagger.ts` so production/fallback specs stay complete.
 */

const TAG = "LP Fees & Distributions";

const AUD =
  "**Auth:** `Authorization: Bearer <token>`. Any authenticated user may call these routes. ";

const FE_ENVELOPE =
  "**Response shape:** `{ success: boolean, message?: string, data: … }`. On errors, `success` is `false` and `message` is user-facing (no GL codes or internal hints). ";

const FE_PREREQ =
  "**Prerequisites (fund setup):** The fund must have **limited partners** (`Client` records) with **ACTIVE** or **PENDING** `investment_commitment` rows on this fund, all in the **same currency**. Capital calls (money in) are separate — see **Capital Calls**. ";

const FE_IDS =
  "**IDs to keep in app state:** `fundId` (route) → after accrue/declare save `data.id` as `periodId` or `distributionId` → from detail view use `data.allocations[].id` for payment/payout actions. ";

// ─── Per-endpoint frontend guides ───────────────────────────────────────────

const FE_1_GET_POLICY = `${AUD}${FE_ENVELOPE}${FE_PREREQ}

**Purpose (frontend):** Load the fund’s **fee & carry settings** screen before showing “Accrue management fee” or “Declare distribution”. Use on fund settings tab or a dedicated “LP economics” panel.

**What it does:** Reads persisted columns on the \`Fund\` record — no side effects. Returns management fee terms (annual rate, what capital the fee is calculated on, billing frequency, start date) and carry/waterfall terms (GP carry %, preferred return hurdle, catch-up, European vs American label).

**Display tips:**
- Show rates as **percentages in the UI** (API stores fractions: \`0.02\` → display **2%**).
- If \`managementFeeRate\` is \`null\`, show “Not configured” and disable accrue until **PUT** (endpoint 2).
- \`managementFeeBase\`: **COMMITTED** = sum of LP commitments; **INVESTED** = disbursed fund investments; **NAV** = invested minus dividends (proxy).
- Carry fields can be null until distributions need them.

**When to call:** On fund detail mount, after saving policy (endpoint 2), and before opening accrue/distribution modals.`;

const FE_2_PUT_POLICY = `${AUD}${FE_ENVELOPE}${FE_PREREQ}

**Purpose (frontend):** Save the fund’s **LP fee & carry policy** form (create or update in one request).

**What it does:** Upserts all policy fields on the fund. Does **not** bill LPs or post journals by itself — it only stores defaults used by accrue (4) and declare (9).

**Request body (all optional except validation rules):**
| Field | UI meaning |
|-------|------------|
| \`managementFeeRate\` | Annual fee as fraction (\`0.02\` = 2%/year). If set, **\`managementFeeBase\`** and **\`managementFeeFrequency\`** are required. |
| \`managementFeeBase\` | COMMITTED / INVESTED / NAV — what the fee % applies to. |
| \`managementFeeFrequency\` | MONTHLY / QUARTERLY / SEMI_ANNUAL / ANNUAL — informational for ops; accrue still uses explicit \`periodStart\`/\`periodEnd\`. |
| \`managementFeeStartDate\` | First date fees may apply (ISO date). |
| \`carryRate\` | GP share of profits above hurdle (e.g. \`0.20\` = 20%). |
| \`hurdleRate\` + \`hurdleType\` | If \`hurdleType\` is \`PREFERRED_RETURN\`, \`hurdleRate\` is required. \`NONE\` = no preferred return slice on declare. |
| \`catchUpRate\`, \`waterfallType\` | Advanced carry labels (stored for reporting; simplified waterfall on declare). |
| Send \`null\` on a field to **clear** it. |

**After success:** Replace local policy state with \`data\` from response; refresh endpoint 1 if you cache separately.

**Typical errors (400):** Missing base/frequency when rate set; missing hurdle rate when preferred return selected.`;

const FE_3_LIST_FEES = `${AUD}${FE_ENVELOPE}${FE_PREREQ}${FE_IDS}

**Purpose (frontend):** **Management fees list** table for a fund — one row per billed period (quarter, half-year, etc.).

**What it does:** Returns all \`management_fee_periods\` for \`fundId\`, sorted **newest \`periodEnd\` first**. Each row is a summary (totals, status, dates) — not per-LP lines.

**Use \`data[]\` columns:**
- \`id\` → navigate to period detail (endpoint 5) or pass as \`periodId\`.
- \`periodStart\` / \`periodEnd\` → period label in UI.
- \`totalFee\`, \`feeBaseAmount\`, \`rate\` → header amounts.
- \`status\` + \`statusLabel\` → badge: **Accrued** → **Invoices Sent** → **Partially Paid** → **Fully Paid** (rollup from LP lines).

**When to call:** Management fees tab load; after accrue (4), send-invoices (6), or payment (7) to refresh the list.`;

const FE_4_ACCRUE = `${AUD}${FE_ENVELOPE}${FE_PREREQ}${FE_IDS}

**Purpose (frontend):** **“Accrue management fee”** wizard — user picks a date range and confirms; backend calculates LP shares and books the accrual.

**What it does (backend, plain language):**
1. Resolves fee rate/base from fund policy (or request overrides).
2. Computes **total fee** = \`feeBaseAmount × rate × (days in period / 365)\` (2 decimal places).
3. Splits total **pro-rata by LP commitment** into one \`management_fee_allocation\` per eligible LP.
4. Posts an **accrual** journal entry (LP receivable up, management fee income).
5. Creates period with status **ACCRUED**.

**Request body:**
| Field | Required | UI |
|-------|----------|-----|
| \`periodStart\`, \`periodEnd\` | Yes | Date range picker (inclusive billing period). |
| \`transactionDate\` | No | GL date; defaults to \`periodEnd\`. |
| \`feeBase\` | No | Override COMMITTED / INVESTED / NAV for this run only. |
| \`rateOverride\` | No | Override annual rate (fraction) for this run. |
| \`feeBaseAmountOverride\` | No | Manual NAV/base amount when auto calc is wrong. |
| \`notes\` | No | Free text on the period. |

**After success (201):** Save \`data.id\` as \`periodId\`; redirect to period detail (5) or show success + “Send invoices” CTA.

**Typical errors (400):** Policy not configured; zero fee base; no eligible commitments; mixed LP currencies.`;

const FE_5_FEE_DETAIL = `${AUD}${FE_ENVELOPE}${FE_PREREQ}${FE_IDS}

**Purpose (frontend):** **Management fee period detail** — header + table of LPs with amounts owed, paid, and status.

**What it does:** Loads one period with nested \`allocations[]\`. Each allocation is one LP’s share of the period fee.

**Per allocation (LP row):**
| Field | UI |
|-------|-----|
| \`client\` / \`clientId\` | LP name, email (for invoice button enablement). |
| \`shareOfFee\` | Amount invoiced to this LP. |
| \`amountPaid\` | Sum of payments recorded. |
| \`status\` / \`statusLabel\` | PENDING → PARTIALLY_PAID → PAID. |
| \`payments[]\` | Payment history (amount, date, journal link if exposed). |
| \`id\` | Use as \`allocationId\` for endpoint 7. |

**Period header:** \`journalEntry\` / \`journalEntryId\` is the **accrual only**. Each LP payment (7) creates a **separate** receipt journal — do not treat period JE as “cash received”.

**Period \`status\` rollup:** ACCRUED → INVOICED (after send-invoices) → PARTIALLY_PAID → PAID.

**When to call:** Period detail route \`/funds/:fundId/management-fees/:periodId\`; refresh after invoices (6) or payment (7).`;

const FE_6_INVOICES = `${AUD}${FE_ENVELOPE}${FE_PREREQ}${FE_IDS}

**Purpose (frontend):** **“Send invoices”** button on period detail — emails each LP their fee notice.

**What it does:** For each allocation with a valid \`client.email\`, sends HTML email (company letterhead). On **full** SMTP success: period → **INVOICED**, \`invoicesSentAt\` set. Response may include \`invoiceDispatch\` with sent/failed/skipped counts — show a toast or modal summary.

**Request body:** Empty \`{}\` is fine (no fields).

**UI cautions:**
- **Not idempotent** — clicking again **re-sends** all emails.
- Disable button if no allocations have email; show skipped count from dispatch.
- Partial failure → 400 with message; still refresh detail — some rows may have updated.

**After success:** Refresh period detail (5) and list (3) for new status badges.`;

const FE_7_FEE_PAYMENT = `${AUD}${FE_ENVELOPE}${FE_PREREQ}${FE_IDS}

**Purpose (frontend):** **“Record payment”** on one LP row — cash received against their management fee invoice.

**What it does:** Records cash for one allocation: creates payment row, increases \`amountPaid\`, updates allocation status, rolls up period status, posts **receipt** journal (debit bank, credit LP receivable).

**Request body:**
| Field | UI |
|-------|-----|
| \`amount\` | Required. > 0 and ≤ **remaining** = \`shareOfFee − amountPaid\`. Pre-fill “Pay in full” with remaining. |
| \`transactionDate\` | Payment date (defaults to today). |
| \`cashChartOfAccountId\` | **Bank account** COA id — show dropdown of bank/cash accounts. Strongly recommended so treasury knows which account received funds. If omitted, server picks env/default bank. |

**After success:** Response \`data\` is full period detail — replace detail state; refresh list (3).

**Typical errors (400):** Amount over remaining or ≤ 0.`;

const FE_8_LIST_DIST = `${AUD}${FE_ENVELOPE}${FE_PREREQ}${FE_IDS}

**Purpose (frontend):** **Distributions list** for a fund — historical and in-progress payouts to LPs.

**What it does:** Returns all \`distributions\` for the fund, **newest \`distributionDate\` first\`. Summary rows only (gross, carry, net, status).

**Use \`data[]\`:** \`id\` → detail (10); \`grossAmount\`, \`carryAmount\`, \`netToLPs\`, \`source\`, \`status\` / \`statusLabel\` for table columns.

**When to call:** Distributions tab load; after declare (9), notices (11), or payout (12).`;

const FE_9_DECLARE = `${AUD}${FE_ENVELOPE}${FE_PREREQ}${FE_IDS}

**Purpose (frontend):** **“Declare distribution”** form — fund declares how much cash is available to pay LPs after carry/waterfall.

**What it does:**
1. Takes **gross** cash available (\`grossAmount\`).
2. Applies simplified **waterfall**: optional preferred-return slice (from policy), then **GP carry** on remainder, **net to LPs** = gross − carry.
3. Splits **net** pro-rata: by **paid-in capital** (sum of capital-call payments) if any; else by **commitment**.
4. Creates \`distribution\` + per-LP \`distribution_allocation\` rows; posts **declaration** journal (distribution payable / carry income).
5. Status **DECLARED**.

**Request body:**
| Field | UI |
|-------|-----|
| \`distributionDate\` | Required. Event date. |
| \`source\` | DIVIDEND / EXIT_PROCEEDS / INTEREST / OTHER — drives labels and optional links. |
| \`grossAmount\` | Required. Total pool before carry. |
| \`sourceCompanyId\` | Optional. Portfolio company for dividend/exit flows. |
| \`sourceDividendId\` | Optional. Link to portfolio dividend record. |
| \`carryRateOverride\` | Optional fraction for this event only. |
| \`currencyCode\` | Optional; must match LP commitment currency. |
| \`notes\` | Optional memo. |

**After success (201):** Save \`data.id\` as \`distributionId\`; open detail (10) or offer “Send notices”.

**Typical errors (400):** Net to LPs is zero; validation on source/links.`;

const FE_10_DIST_DETAIL = `${AUD}${FE_ENVELOPE}${FE_PREREQ}${FE_IDS}

**Purpose (frontend):** **Distribution detail** — waterfall summary + per-LP payout table.

**What it does:** Full distribution with \`allocations[]\` (each LP’s \`shareAmount\`, \`paidInSnapshot\`, \`amountPaid\`, \`client\`, payout history).

**Header fields for summary cards:**
- \`grossAmount\`, \`carryAmount\`, \`netToLPs\`, \`hurdleAppliedAmount\`
- \`source\`, \`distributionDate\`, \`status\` / \`statusLabel\`
- \`journalEntryId\` — declaration entry (not cash payout)

**Per allocation:** \`id\` → endpoint 12; remaining = \`shareAmount − amountPaid\`.

**Status rollup:** DECLARED → NOTICES_SENT → PARTIALLY_PAID → PAID.

**When to call:** Detail route; refresh after notices (11) or payout (12).`;

const FE_11_NOTICES = `${AUD}${FE_ENVELOPE}${FE_PREREQ}${FE_IDS}

**Purpose (frontend):** **“Send distribution notices”** — email each LP their share (gross/carry/net breakdown).

**What it does:** Same pattern as send-invoices (6): one email per allocation with email; on full success status → **NOTICES_SENT**. Response may include \`noticeDispatch\`.

**Request body:** Empty \`{}\`.

**UI cautions:** Re-send on repeat click; show dispatch summary; refresh detail (10) after.`;

const FE_12_PAYOUT = `${AUD}${FE_ENVELOPE}${FE_PREREQ}${FE_IDS}

**Purpose (frontend):** **“Record payout”** — pay one LP from the distribution (wire/EFT out).

**What it does:** Records outbound cash for one allocation (mirror of fee payment 7): payment row, updates \`amountPaid\`, period status rollup, posts payout journal (debit distribution payable, credit bank).

**Request body:** Same as **AllocationPaymentRequest** — \`amount\`, optional \`transactionDate\`, recommended \`cashChartOfAccountId\` (bank account **paid from**).

**After success:** \`data\` is full distribution detail — replace state; refresh list (8).

**Typical errors (400):** Amount over remaining.`;

const EX = {
  fundId: "cmjfpk2g0000lktwmt25ni8p8",
  periodId: "cmpayd4r10007uncgkr6bjtlb",
  allocationId: "cmpayd5kr000auncg27rptxd5",
  distributionId: "cmdist0000000000000000001",
  distAllocationId: "cmdistalloc00000000000001",
  bankGlId: "clx0bankglacctid",
};

const fundIdParam = {
  name: "fundId",
  in: "path" as const,
  required: true,
  description: "Fund primary key (cuid) — from fund list or fund detail route.",
  schema: { type: "string", example: EX.fundId },
};

const periodIdParam = {
  name: "periodId",
  in: "path" as const,
  required: true,
  description: "Management fee period id — `data.id` from POST accrue (4) or `data[].id` from list (3).",
  schema: { type: "string", example: EX.periodId },
};

const mgtAllocationIdParam = {
  name: "allocationId",
  in: "path" as const,
  required: true,
  description: "Management fee allocation id — `data.allocations[].id` from period detail (5). One row per LP.",
  schema: { type: "string", example: EX.allocationId },
};

const distributionIdParam = {
  name: "distributionId",
  in: "path" as const,
  required: true,
  description: "Distribution id — `data.id` from POST declare (9) or `data[].id` from list (8).",
  schema: { type: "string", example: EX.distributionId },
};

const distAllocationIdParam = {
  name: "allocationId",
  in: "path" as const,
  required: true,
  description: "Distribution allocation id — `data.allocations[].id` from distribution detail (10).",
  schema: { type: "string", example: EX.distAllocationId },
};

const jsonSuccess = {
  type: "object",
  properties: {
    success: { type: "boolean", example: true },
    message: { type: "string" },
    data: { type: "object" },
  },
};

const allocationPaymentBody = {
  required: true,
  description:
    "Payment/payout amount and optional bank account. Use the same schema for management fee receipts (7) and distribution payouts (12).",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/AllocationPaymentRequest" },
      examples: {
        fullPayment: {
          summary: "Pay full remaining balance",
          value: {
            amount: 49.31,
            transactionDate: "2026-04-10",
          },
        },
        partialWithBank: {
          summary: "Partial payment — explicit bank GL",
          value: {
            amount: 25,
            transactionDate: "2026-04-10",
            cashChartOfAccountId: EX.bankGlId,
          },
        },
      },
    },
  },
};

export const lpFeesAndDistributionsEndpoints: Record<string, Record<string, unknown>> = {
  "/funds/{fundId}/fee-policy": {
    get: {
      tags: [TAG],
      summary: "1. Get fund LP fee & carry policy",
      description: FE_1_GET_POLICY,
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam],
      responses: {
        200: {
          description: "`data` = FundFeePolicy — use to populate settings form.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: { $ref: "#/components/schemas/FundFeePolicy" },
                },
              },
            },
          },
        },
        404: { description: "Fund not found" },
        401: { description: "Unauthorized" },
      },
    },
    put: {
      tags: [TAG],
      summary: "2. Create or update fund LP fee & carry policy",
      description: FE_2_PUT_POLICY,
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam],
      requestBody: {
        required: true,
        description: "All fields optional; validation applies when rate or hurdle rules are set. See schema FundFeePolicyUpsertRequest.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/FundFeePolicyUpsertRequest" },
            examples: {
              twoAndTwenty: {
                summary: 'Classic "2 and 20" with 8% preferred return',
                value: {
                  managementFeeRate: 0.02,
                  managementFeeBase: "COMMITTED",
                  managementFeeFrequency: "QUARTERLY",
                  managementFeeStartDate: "2025-01-01",
                  carryRate: 0.2,
                  hurdleRate: 0.08,
                  hurdleType: "PREFERRED_RETURN",
                  catchUpRate: 1.0,
                  waterfallType: "EUROPEAN",
                },
              },
              managementFeeOnly: {
                summary: "Management fee only (no carry yet)",
                value: {
                  managementFeeRate: 0.02,
                  managementFeeBase: "COMMITTED",
                  managementFeeFrequency: "QUARTERLY",
                  managementFeeStartDate: "2026-01-01",
                  hurdleType: "NONE",
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "`message` e.g. Fund fee policy saved.; `data` = updated policy.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Fund fee policy saved." },
                  data: { $ref: "#/components/schemas/FundFeePolicy" },
                },
              },
            },
          },
        },
        400: { description: "Validation error — show `message` in form alert." },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/funds/{fundId}/management-fees": {
    get: {
      tags: [TAG],
      summary: "3. List management fee periods",
      description: FE_3_LIST_FEES,
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam],
      responses: {
        200: {
          description: "`data` = array of ManagementFeePeriodSummary — table rows.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "array",
                    items: { $ref: "#/components/schemas/ManagementFeePeriodSummary" },
                  },
                },
              },
            },
          },
        },
        400: { description: "Fund not found" },
        401: { description: "Unauthorized" },
      },
    },
    post: {
      tags: [TAG],
      summary: "4. Accrue management fee for one period",
      description: FE_4_ACCRUE,
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam],
      requestBody: {
        required: true,
        description: "Billing period and optional overrides. Requires fund policy or rateOverride + fee base.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ManagementFeeAccrueRequest" },
            examples: {
              q1FromPolicy: {
                summary: "Q1 accrual — uses fund policy rate & base",
                value: {
                  periodStart: "2026-01-01",
                  periodEnd: "2026-03-31",
                  transactionDate: "2026-03-31",
                  notes: "Q1 2026 management fee accrual",
                },
              },
              halfYearOverride: {
                summary: "H1 with custom base and rate",
                value: {
                  periodStart: "2026-01-01",
                  periodEnd: "2026-06-30",
                  feeBase: "INVESTED",
                  rateOverride: 0.015,
                  feeBaseAmountOverride: 12000000,
                  transactionDate: "2026-06-30",
                  notes: "Mid-year accrual at reduced rate on invested capital",
                },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "Created — save `data.id` as periodId; `data` = ManagementFeePeriodDetail with allocations.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Management fee accrued successfully." },
                  data: { $ref: "#/components/schemas/ManagementFeePeriodDetail" },
                },
              },
            },
          },
        },
        400: { description: "Policy missing, zero base, no LPs, or currency mismatch." },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/funds/{fundId}/management-fees/{periodId}": {
    get: {
      tags: [TAG],
      summary: "5. Get one management fee period (allocations + payments)",
      description: FE_5_FEE_DETAIL,
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, periodIdParam],
      responses: {
        200: {
          description: "`data` = ManagementFeePeriodDetail — LP table + payment history.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: { $ref: "#/components/schemas/ManagementFeePeriodDetail" },
                },
              },
            },
          },
        },
        404: { description: "Period not found for this fund" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/funds/{fundId}/management-fees/{periodId}/send-invoices": {
    post: {
      tags: [TAG],
      summary: "6. Email management fee invoices to LPs",
      description: FE_6_INVOICES,
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, periodIdParam],
      requestBody: {
        required: false,
        description: "No body fields required — send `{}` or omit.",
        content: {
          "application/json": {
            schema: {
              type: "object",
              description: "Empty object.",
              additionalProperties: false,
            },
            examples: {
              empty: { summary: "Send all invoices", value: {} },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Success — check `invoiceDispatch` in `data` if present; refresh period detail.",
          content: { "application/json": { schema: jsonSuccess } },
        },
        400: { description: "No valid LP emails or SMTP failures — show `message`." },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/funds/{fundId}/management-fees/{periodId}/allocations/{allocationId}/payments": {
    post: {
      tags: [TAG],
      summary: "7. Record LP payment against management fee allocation",
      description: FE_7_FEE_PAYMENT,
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, periodIdParam, mgtAllocationIdParam],
      requestBody: allocationPaymentBody,
      responses: {
        200: {
          description: "`data` = updated ManagementFeePeriodDetail — replace detail view state.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Management fee payment recorded successfully." },
                  data: { $ref: "#/components/schemas/ManagementFeePeriodDetail" },
                },
              },
            },
          },
        },
        400: { description: "Invalid amount or exceeds remaining balance." },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/funds/{fundId}/distributions": {
    get: {
      tags: [TAG],
      summary: "8. List distributions",
      description: FE_8_LIST_DIST,
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam],
      responses: {
        200: {
          description: "`data` = array of DistributionSummary.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "array",
                    items: { $ref: "#/components/schemas/DistributionSummary" },
                  },
                },
              },
            },
          },
        },
        400: { description: "Fund not found" },
        401: { description: "Unauthorized" },
      },
    },
    post: {
      tags: [TAG],
      summary: "9. Declare a distribution (carry waterfall + LP split)",
      description: FE_9_DECLARE,
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam],
      requestBody: {
        required: true,
        description: "Declare gross pool and source; backend computes carry and per-LP net shares.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/DistributionCreateRequest" },
            examples: {
              generalDistribution: {
                summary: "General distribution (OTHER)",
                value: {
                  distributionDate: "2026-05-30",
                  source: "OTHER",
                  grossAmount: 10000,
                  notes: "Postman test distribution",
                },
              },
              dividendPassthrough: {
                summary: "Dividend pass-through from portfolio company",
                value: {
                  distributionDate: "2026-05-30",
                  source: "DIVIDEND",
                  grossAmount: 25000,
                  sourceCompanyId: "cmpxxxxxxxxxxxxxxxxxxxxxxx",
                  sourceDividendId: "cmdyxxxxxxxxxxxxxxxxxxxxx",
                  notes: "FY2025 interim dividend pass-through",
                },
              },
              exitWithCarry: {
                summary: "Exit proceeds — explicit 20% carry",
                value: {
                  distributionDate: "2026-06-15",
                  source: "EXIT_PROCEEDS",
                  grossAmount: 5000000,
                  carryRateOverride: 0.2,
                  notes: "Realized exit — full liquidation",
                },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "Created — save `data.id` as distributionId; `data` = DistributionDetail.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Distribution declared successfully." },
                  data: { $ref: "#/components/schemas/DistributionDetail" },
                },
              },
            },
          },
        },
        400: { description: "Validation failed or net to LPs is zero." },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/funds/{fundId}/distributions/{distributionId}": {
    get: {
      tags: [TAG],
      summary: "10. Get one distribution (allocations + payouts)",
      description: FE_10_DIST_DETAIL,
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, distributionIdParam],
      responses: {
        200: {
          description: "`data` = DistributionDetail — waterfall header + LP payout rows.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: { $ref: "#/components/schemas/DistributionDetail" },
                },
              },
            },
          },
        },
        404: { description: "Distribution not found" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/funds/{fundId}/distributions/{distributionId}/send-notices": {
    post: {
      tags: [TAG],
      summary: "11. Email distribution notices to LPs",
      description: FE_11_NOTICES,
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, distributionIdParam],
      requestBody: {
        required: false,
        description: "No body fields required — send `{}`.",
        content: {
          "application/json": {
            schema: { type: "object", additionalProperties: false },
            examples: { empty: { summary: "Send all notices", value: {} } },
          },
        },
      },
      responses: {
        200: {
          description: "Success — may include `noticeDispatch` in `data`.",
          content: { "application/json": { schema: jsonSuccess } },
        },
        400: { description: "No valid emails or send failures." },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/funds/{fundId}/distributions/{distributionId}/allocations/{allocationId}/payouts": {
    post: {
      tags: [TAG],
      summary: "12. Record LP payout for one distribution allocation",
      description: FE_12_PAYOUT,
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, distributionIdParam, distAllocationIdParam],
      requestBody: allocationPaymentBody,
      responses: {
        200: {
          description: "`data` = updated DistributionDetail.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  message: { type: "string", example: "Distribution payout recorded successfully." },
                  data: { $ref: "#/components/schemas/DistributionDetail" },
                },
              },
            },
          },
        },
        400: { description: "Invalid amount or exceeds remaining." },
        401: { description: "Unauthorized" },
      },
    },
  },
};
