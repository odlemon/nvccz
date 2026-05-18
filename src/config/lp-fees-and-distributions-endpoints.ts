/**
 * OpenAPI paths for **LP Fees & Distributions** (management fees + LP distributions).
 * Paths are relative to `servers[].url` (ends with `/api`).
 * Merged in `swagger.ts` so production/fallback specs stay complete.
 *
 * **Prerequisites:** LPs (`POST /clients`) with **ACTIVE** or **PENDING** `investment_commitment` on the fund (one currency).
 * **DB:** `npm run db:migrate:lp-fees-distributions` then `npx prisma generate`.
 */

const TAG = "LP Fees & Distributions";

const AUD =
  "**Auth:** `Authorization: Bearer <token>`. Any authenticated user may call these routes. ";

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
  description: "Fund primary key (cuid)",
  schema: { type: "string", example: EX.fundId },
};

const periodIdParam = {
  name: "periodId",
  in: "path" as const,
  required: true,
  description: "Management fee period id — `data.id` from accrue or list",
  schema: { type: "string", example: EX.periodId },
};

const mgtAllocationIdParam = {
  name: "allocationId",
  in: "path" as const,
  required: true,
  description: "Management fee allocation id — `data.allocations[].id` from period detail",
  schema: { type: "string", example: EX.allocationId },
};

const distributionIdParam = {
  name: "distributionId",
  in: "path" as const,
  required: true,
  description: "Distribution id — `data.id` from declare or list",
  schema: { type: "string", example: EX.distributionId },
};

const distAllocationIdParam = {
  name: "allocationId",
  in: "path" as const,
  required: true,
  description: "Distribution allocation id — `data.allocations[].id` from distribution detail",
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
  // ─── 1–2: Fee policy ───────────────────────────────────────────────────────
  "/funds/{fundId}/fee-policy": {
    get: {
      tags: [TAG],
      summary: "1. Get fund LP fee & carry policy",
      description:
        AUD +
        "Returns **management fee** settings (`managementFeeRate`, `managementFeeBase`, `managementFeeFrequency`, `managementFeeStartDate`) and **carry** settings (`carryRate`, `hurdleRate`, `hurdleType`, `catchUpRate`, `waterfallType`). All nullable until configured via **PUT**.",
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam],
      responses: {
        200: {
          description: "Policy returned",
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
      description:
        AUD +
        "Upserts policy in one call. **Rates are fractions** (`0.02` = 2%/yr, `0.20` = 20% carry). " +
        "If `managementFeeRate` is set, **`managementFeeBase`** and **`managementFeeFrequency`** are required. " +
        "If `hurdleType` is `PREFERRED_RETURN`, **`hurdleRate`** is required. Send `null` to clear a field.",
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam],
      requestBody: {
        required: true,
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
          description: "Policy saved",
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
        400: { description: "Validation error" },
        401: { description: "Unauthorized" },
      },
    },
  },

  // ─── 3–4: Management fees ──────────────────────────────────────────────────
  "/funds/{fundId}/management-fees": {
    get: {
      tags: [TAG],
      summary: "3. List management fee periods",
      description:
        AUD + "All **`management_fee_periods`** for the fund, newest `periodEnd` first. Use `id` as **`periodId`** for detail, invoices, and payments.",
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam],
      responses: {
        200: {
          description: "Array of period summaries",
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
      description:
        AUD +
        "Creates **`management_fee_periods`** + per-LP **`management_fee_allocations`**, posts accrual to the GL. " +
        "**Formula:** `totalFee = feeBaseAmount × rate × (periodDays / 365)` (half-up 2dp), split pro-rata by LP commitment. " +
        "**Fee base:** `COMMITTED` (default from policy), `INVESTED` (disbursed fund amounts), or `NAV` (invested − dividends proxy). " +
        "Eligible commitments: **ACTIVE** or **PENDING**, **one currency** per fund. " +
        "Overrides: `rateOverride`, `feeBase`, `feeBaseAmountOverride`, `transactionDate`, `notes`.",
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam],
      requestBody: {
        required: true,
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
          description: "Period created — save `data.id` as periodId",
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
        400: { description: "Missing policy, zero base, no commitments, or mixed currencies" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/funds/{fundId}/management-fees/{periodId}": {
    get: {
      tags: [TAG],
      summary: "5. Get one management fee period (allocations + payments)",
      description:
        AUD +
        "Full period with **`allocations[]`** (per-LP `shareOfFee`, `amountPaid`, `status`, `client.email`) and **`payments[]`** on each allocation. " +
        "Period-level **`journalEntry`** is the **accrual** entry only; each LP payment creates a separate receipt journal entry.",
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, periodIdParam],
      responses: {
        200: {
          description: "Period detail",
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
      description:
        AUD +
        "Sends one HTML email per allocation with a valid **`client.email`** (company letterhead). " +
        "On full success: `status` → **INVOICED**, `invoicesSentAt` set. **Re-running re-sends** — not idempotent. " +
        "Response includes **`invoiceDispatch`** (sent / failed / skipped recipients).",
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, periodIdParam],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              description: "No fields required.",
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
          description: "Invoices sent (or dispatch report on partial SMTP failure)",
          content: { "application/json": { schema: jsonSuccess } },
        },
        400: { description: "No valid LP emails or send failures" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/funds/{fundId}/management-fees/{periodId}/allocations/{allocationId}/payments": {
    post: {
      tags: [TAG],
      summary: "7. Record LP payment against management fee allocation",
      description:
        AUD +
        "Records cash received from one LP: appends **`management_fee_allocation_payments`**, updates `amountPaid` / allocation `status`, recomputes period `status`. " +
        "`amount` must be **> 0** and **≤ remaining** (`shareOfFee − amountPaid`). " +
        "**`cashChartOfAccountId`** (recommended): chart-of-accounts id for the bank account that received funds; otherwise server picks first active bank GL / env / 1100 fallback. " +
        "Creates a **receipt** journal entry (separate from the period accrual `journalEntryId`).",
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, periodIdParam, mgtAllocationIdParam],
      requestBody: allocationPaymentBody,
      responses: {
        200: {
          description: "Payment recorded — returns updated period detail",
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
        400: { description: "Amount invalid or exceeds remaining" },
        401: { description: "Unauthorized" },
      },
    },
  },

  // ─── 8–12: Distributions ─────────────────────────────────────────────────
  "/funds/{fundId}/distributions": {
    get: {
      tags: [TAG],
      summary: "8. List distributions",
      description: AUD + "All **`distributions`** for the fund, newest `distributionDate` first.",
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam],
      responses: {
        200: {
          description: "Array of distribution summaries",
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
      description:
        AUD +
        "Creates **`distributions`** + per-LP **`distribution_allocations`**, posts declaration to the GL. " +
        "**Waterfall (simplified):** optional preferred-return slice on gross, then **GP carry** on remainder (`carryRate` from policy or `carryRateOverride`), **net to LPs** = gross − carry. " +
        "**LP split:** pro-rata by **paid-in capital** (sum of capital-call `amountPaid`); if no paid-in yet, pro-rata by **commitment**. " +
        "**`source`:** `DIVIDEND` | `EXIT_PROCEEDS` | `INTEREST` | `OTHER`. Optional `sourceCompanyId`, `sourceDividendId` for traceability.",
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam],
      requestBody: {
        required: true,
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
          description: "Distribution declared — save `data.id` as distributionId",
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
        400: { description: "Validation error or net to LPs is zero" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/funds/{fundId}/distributions/{distributionId}": {
    get: {
      tags: [TAG],
      summary: "10. Get one distribution (allocations + payouts)",
      description:
        AUD +
        "Full distribution with **`allocations[]`** (`shareAmount`, `paidInSnapshot`, `amountPaid`, `client`) and payout history. " +
        "Includes `grossAmount`, `carryAmount`, `netToLPs`, `hurdleAppliedAmount`.",
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, distributionIdParam],
      responses: {
        200: {
          description: "Distribution detail",
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
      description:
        AUD +
        "Sends one HTML email per allocation (gross, carry, net, LP share, paid-in). " +
        "On full success: `status` → **NOTICES_SENT**. **`noticeDispatch`** in response. Re-running re-sends emails.",
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, distributionIdParam],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: { type: "object", additionalProperties: false },
            examples: { empty: { summary: "Send all notices", value: {} } },
          },
        },
      },
      responses: {
        200: {
          description: "Notices sent",
          content: { "application/json": { schema: jsonSuccess } },
        },
        400: { description: "No valid emails or SMTP failures" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/funds/{fundId}/distributions/{distributionId}/allocations/{allocationId}/payouts": {
    post: {
      tags: [TAG],
      summary: "12. Record LP payout for one distribution allocation",
      description:
        AUD +
        "Pays one LP their **`shareAmount`** (full or partial). Appends **`distribution_allocation_payments`**, updates statuses, posts payout GL. " +
        "`amount` ≤ remaining. **`cashChartOfAccountId`** recommended so the bank account is explicit.",
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, distributionIdParam, distAllocationIdParam],
      requestBody: allocationPaymentBody,
      responses: {
        200: {
          description: "Payout recorded — returns updated distribution detail",
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
        400: { description: "Amount invalid or exceeds remaining" },
        401: { description: "Unauthorized" },
      },
    },
  },
};
