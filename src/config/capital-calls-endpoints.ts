/**
 * Swagger paths for LP capital calls. Order matches recommended integration flow and `docs/capital-calls-lp-drawdowns.md`.
 * **Prerequisite** `POST /api/clients` and `PUT /api/clients/{id}` are documented on `clientRoutes.ts` with tag **Capital Calls (LP drawdowns)** first (summaries **0a** / **0b**).
 * Mirrors `/api/funds/...` in `fundRoutes.ts` (paths here are without `/api` where noted in `swagger.ts` servers).
 */

const AUD =
  '**Auth:** `Authorization: Bearer <token>`. Role checks were removed on these routes; any authenticated user may call them. ';

/** Sample IDs from a typical dev DB — replace with values from `POST /capital-calls` and `npm run db:print:capital-call-postman`. */
const EX = {
  fundId: 'cmjfpk2g0000lktwmt25ni8p8',
  capitalCallId: 'cmnsk6f9s000bunuklx0mlss6',
  allocationId: 'cmnsk6fyt000cunuktbtt3moa',
};

const fundIdParam = {
  name: 'fundId',
  in: 'path' as const,
  required: true,
  description: 'Fund primary key (cuid)',
  schema: { type: 'string', example: EX.fundId },
};

const capitalCallIdParam = {
  name: 'capitalCallId',
  in: 'path' as const,
  required: true,
  description: 'Capital call primary key — returned as `data.id` from initiate',
  schema: { type: 'string', example: EX.capitalCallId },
};

const allocationIdParam = {
  name: 'allocationId',
  in: 'path' as const,
  required: true,
  description: 'Allocation primary key — returned as `data.allocations[].id` from initiate',
  schema: { type: 'string', example: EX.allocationId },
};

export const capitalCallsEndpoints = {
  // --- 1–2: list + initiate -------------------------------------------------
  '/funds/{fundId}/capital-calls': {
    get: {
      tags: ['Capital Calls (LP drawdowns)'],
      summary: '1b. List capital calls for a fund',
      description:
        AUD +
        'Returns all **`capital_calls`** for the fund (newest-first style listing from service), with status, dates, allocation counts, etc.',
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam],
      responses: {
        200: { description: 'Array of capital call summary rows' },
        401: { description: 'Unauthorized' },
        400: { description: 'Fund not found' },
      },
    },
    post: {
      tags: ['Capital Calls (LP drawdowns)'],
      summary: '1a. Initiate a capital call (JE Dr 1210 / Cr 3010)',
      description:
        AUD +
        'Creates **`capital_calls`** + **`capital_call_allocations`**, posts **POSTED** journal **Dr 1210** / **Cr 3010** (requires active COA). Eligible commitments: **ACTIVE** or **PENDING**, **one currency** per fund. Line amount = **min**(uncalled, commitment × `callPercent`/100).',
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['callPercent', 'paymentDueDate', 'bankInstructions', 'transactionDate'],
              properties: {
                callPercent: {
                  type: 'number',
                  description: 'Percent of each LP total commitment (10 = 10%)',
                  example: 10,
                },
                paymentDueDate: {
                  type: 'string',
                  format: 'date',
                  description: 'Due date on notice, email, and PDF',
                  example: '2026-05-30',
                },
                transactionDate: {
                  type: 'string',
                  format: 'date',
                  description: 'Journal entry transaction date at initiation',
                  example: '2026-04-10',
                },
                bankInstructions: {
                  type: 'string',
                  description: 'Wire / account instructions (non-empty). Shown on notice JSON, HTML email, and PDF.',
                  example:
                    'Pay to Example Bank, ACC 1234567890, REF: ZIMFUND-CC-001. SWIFT: EXAMPLEZWHX. Beneficiary: ZimFund LP Collections.',
                },
              },
            },
            examples: {
              tenPercentDrawdown: {
                summary: '10% drawdown — ZimFund-style',
                description: 'Fund with USD commitments; 10% of each LP commitment capped by uncalled balance',
                value: {
                  callPercent: 10,
                  paymentDueDate: '2026-05-30',
                  transactionDate: '2026-04-10',
                  bankInstructions:
                    'Pay to Example Bank, ACC 1234567890, REF: ZIMFUND-CC-001. SWIFT: EXAMPLEZWHX. Beneficiary: ZimFund LP Collections.',
                },
              },
              fivePercent: {
                summary: '5% drawdown',
                value: {
                  callPercent: 5,
                  paymentDueDate: '2026-06-15',
                  transactionDate: '2026-04-15',
                  bankInstructions:
                    'Remit to NVCCZ Trust Account, Sort Code 12-34-56, Account 87654321. Reference: CAPITAL CALL {LP_NAME}.',
                },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Created — `data` includes allocations, `journalEntry`, `statusLabel`' },
        400: { description: 'Validation, mixed currencies, or missing/inactive 1210–3010' },
        401: { description: 'Unauthorized' },
      },
    },
  },

  // --- 3: LP summary --------------------------------------------------------
  '/funds/{fundId}/capital-calls/lp-summary': {
    get: {
      tags: ['Capital Calls (LP drawdowns)'],
      summary: '3. LP dashboard — uncalled, receipts, outstanding call',
      description:
        AUD +
        'Per **ACTIVE/PENDING** commitment: **`totalCommitment`**, **`cumulativeCalled`**, **`uncalledCommitmentBalance`**, **`amountReceivedTowardCalls`**, **`outstandingCallBalance`**, **`uncalledCapitalNetOfReceipts`**.',
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam],
      responses: {
        200: { description: '`{ fundId, byLp: [...] }`' },
        400: { description: 'Fund not found' },
        401: { description: 'Unauthorized' },
      },
    },
  },

  // --- 4: notice JSON (before generic :capitalCallId-only GET in tooling) --
  '/funds/{fundId}/capital-calls/{capitalCallId}/allocations/{allocationId}/notice': {
    get: {
      tags: ['Capital Calls (LP drawdowns)'],
      summary: '5. Notice JSON (same facts as email + PDF)',
      description:
        AUD +
        '**JSON** for apps / print: **`fundName`**, **`lpLegalName`**, **`callPercent`**, **`totalCommitment`**, **`uncalledCapitalBeforeThisCall`**, **`currentCallAmount`**, **`paymentDueDate`**, **`bankInstructions`**, **`currencyCode`**, **`emailSubjectHint`**, etc.',
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, capitalCallIdParam, allocationIdParam],
      responses: {
        200: { description: '`{ success, data }` notice payload' },
        404: { description: 'Allocation not found' },
        401: { description: 'Unauthorized' },
      },
    },
  },

  // --- 5: payments GET + POST ----------------------------------------------
  '/funds/{fundId}/capital-calls/{capitalCallId}/allocations/{allocationId}/payments': {
    get: {
      tags: ['Capital Calls (LP drawdowns)'],
      summary: '7b. Payment ledger + context (`{ context, payments }`)',
      description:
        AUD +
        '**`payments`**: newest first. Each row: **`cumulativePaidThroughThisPayment`**, **`remainingOnCallAfterThisPayment`**. **`context`**: fund, call, currency, journal header, LP / allocation snapshot (`amountPaidToDate`, `remainingOnCall`).',
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, capitalCallIdParam, allocationIdParam],
      responses: {
        200: { description: '{ success, data: { context, payments } }' },
        404: { description: 'Allocation not found' },
        401: { description: 'Unauthorized' },
      },
    },
    post: {
      tags: ['Capital Calls (LP drawdowns)'],
      summary: '7a. Record payment (partial or full) on allocation',
      description:
        AUD +
        'Inserts **`capital_call_allocation_payments`**, updates **`amount_paid`**, allocation **`PARTIALLY_PAID`** / **`PAID`**, header **`PARTIALLY_PAID`** / **`FULLY_PAID`**.',
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, capitalCallIdParam, allocationIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['amount'],
              properties: {
                amount: {
                  type: 'number',
                  format: 'double',
                  description: 'Receipt amount in call currency; must be ≤ remaining (currentCallAmount − amountPaid)',
                  example: 2500,
                },
              },
            },
            examples: {
              partial2500: {
                summary: 'Partial — USD 2,500 on a 5,000 call line',
                value: { amount: 2500 },
              },
              fullRemaining2500: {
                summary: 'Second receipt — clear 5,000 line after 2,500 paid',
                value: { amount: 2500 },
              },
              full5000: {
                summary: 'Single receipt — full call line in one go',
                value: { amount: 5000 },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Full capital call detail after update' },
        400: { description: 'Overpay, already paid, or invalid amount' },
        401: { description: 'Unauthorized' },
      },
    },
  },

  // --- 6: send notices ------------------------------------------------------
  '/funds/{fundId}/capital-calls/{capitalCallId}/send-notices': {
    post: {
      tags: ['Capital Calls (LP drawdowns)'],
      summary: '6. Email all LPs (HTML + PDF attachment)',
      description:
        AUD +
        'No body. Sends **HTML** + **PDF** notice per allocation with **`client.email`**; subject **`Capital Call Notice , {fundName} , {paymentDueDate}`**. Sets **`noticesSentAt`**; **`INITIATED` → `NOTICES_SENT`**.',
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, capitalCallIdParam],
      responses: {
        200: { description: 'Updated capital call; check `noticesSentAt`, `statusLabel`' },
        400: { description: 'No LP emails or SMTP error' },
        401: { description: 'Unauthorized' },
      },
    },
  },

  // --- 7: get one capital call ---------------------------------------------
  '/funds/{fundId}/capital-calls/{capitalCallId}': {
    get: {
      tags: ['Capital Calls (LP drawdowns)'],
      summary: '4. Get one capital call (allocations, nested payments, journal)',
      description:
        AUD +
        'Full **`capital_calls`** row with **`allocations`** (client, amounts, **`payments`** array per allocation), **`journalEntry`**, **`statusLabel`**.',
      security: [{ bearerAuth: [] }],
      parameters: [fundIdParam, capitalCallIdParam],
      responses: {
        200: { description: '{ success, data }' },
        404: { description: 'Not found' },
        401: { description: 'Unauthorized' },
      },
    },
  },
};
