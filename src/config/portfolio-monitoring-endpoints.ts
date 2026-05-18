/**
 * Portfolio Monitoring & Exit Management (§2.4) — Swagger fallback paths.
 * Mounted at `/api/investments` (server base URL already includes `/api`).
 *
 * **Prerequisites:** `investmentImplementationId` = `InvestmentImplementation.id`
 * from `GET /investment-implementations/{portfolioCompanyId}` → `data.id`.
 *
 * **Roles:** admin | fund_manager | ceo | cfo
 *
 * **DB:** `npm run db:migrate:investment-valuation-exit`
 * **Doc:** `docs/portfolio-monitoring-valuation-and-exit.md`
 */

export const PORTFOLIO_MONITORING_TAG = 'Portfolio Monitoring & Exit Management';

const implIdParam = {
  name: 'investmentImplementationId',
  in: 'path' as const,
  required: true,
  description:
    'Investment implementation ID (NOT the portfolio company id). Resolve via GET /investment-implementations/{portfolioCompanyId}.',
  schema: { type: 'string', example: 'cmnvjrhm70003unzgngai080x' },
};

const valuationEventIdParam = {
  name: 'valuationEventId',
  in: 'path' as const,
  required: true,
  description: 'Valuation event row id (from POST or GET valuations response `data[].id`).',
  schema: { type: 'string' },
};

const bearer = [{ bearerAuth: [] }];

const valuationEventSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    investmentImplementationId: { type: 'string' },
    valuationDate: { type: 'string', format: 'date-time' },
    valuationType: {
      type: 'string',
      enum: ['POST_MONEY', 'FAIR_MARKET_VALUE', 'PRE_MONEY', 'OTHER'],
    },
    valuationAmount: { type: 'string', description: 'Decimal serialized as string from Prisma' },
    currencyId: { type: 'string', nullable: true },
    notes: { type: 'string', nullable: true },
    currency: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        code: { type: 'string', example: 'USD' },
        symbol: { type: 'string', example: '$' },
      },
    },
    createdBy: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const createValuationBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['valuationDate', 'valuationType', 'valuationAmount', 'currencyId'],
        properties: {
          valuationDate: {
            type: 'string',
            format: 'date',
            description: 'Official valuation date (YYYY-MM-DD).',
            example: '2026-03-31',
          },
          valuationType: {
            type: 'string',
            description: 'Valuation methodology / label for this event.',
            enum: ['POST_MONEY', 'FAIR_MARKET_VALUE', 'PRE_MONEY', 'OTHER'],
            example: 'FAIR_MARKET_VALUE',
          },
          valuationAmount: {
            type: 'number',
            description: 'Company or investment valuation amount in the given currency.',
            example: 12500000,
          },
          currencyId: {
            type: 'string',
            description: 'Active currency id (required).',
            example: 'cmh3bymy70000una4yk8leusu',
          },
          notes: {
            type: 'string',
            nullable: true,
            description: 'Optional narrative (board memo, round label, etc.).',
            example: 'Q1 board valuation',
          },
        },
      },
      example: {
        valuationDate: '2026-03-31',
        valuationType: 'FAIR_MARKET_VALUE',
        valuationAmount: 12500000,
        currencyId: 'cmh3bymy70000una4yk8leusu',
        notes: 'Q1 board valuation',
      },
    },
  },
};

const patchValuationBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        description: 'Send only fields to change.',
        properties: {
          valuationDate: { type: 'string', format: 'date', example: '2026-06-30' },
          valuationType: {
            type: 'string',
            enum: ['POST_MONEY', 'FAIR_MARKET_VALUE', 'PRE_MONEY', 'OTHER'],
          },
          valuationAmount: { type: 'number', example: 13200000 },
          currencyId: { type: 'string', example: 'cmh3bymy70000una4yk8leusu' },
          notes: { type: 'string', nullable: true, example: 'Updated after board review' },
        },
      },
      example: {
        valuationAmount: 13200000,
        notes: 'Updated after board review',
      },
    },
  },
};

const recordExitBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['exitDate', 'exitType', 'exitProceedsAmount', 'currencyId'],
        properties: {
          exitDate: {
            type: 'string',
            format: 'date',
            description: 'Date of the exit event (YYYY-MM-DD).',
            example: '2026-06-01',
          },
          exitType: {
            type: 'string',
            description: 'How the investment was exited.',
            enum: ['IPO', 'ACQUISITION', 'WRITE_OFF', 'SECONDARY', 'OTHER'],
            example: 'ACQUISITION',
          },
          exitProceedsAmount: {
            type: 'number',
            description:
              'Cash (or fair value) received on exit. Use 0 for write-offs. Used with disbursement history to compute IRR and ROI multiple.',
            example: 50000,
          },
          currencyId: {
            type: 'string',
            description: 'Active currency id for proceeds (required).',
            example: 'cmh3bymy70000una4yk8leusu',
          },
          notes: {
            type: 'string',
            nullable: true,
            example: 'Strategic acquisition — test',
          },
        },
      },
      example: {
        exitDate: '2026-06-01',
        exitType: 'ACQUISITION',
        exitProceedsAmount: 50000,
        currencyId: 'cmh3bymy70000una4yk8leusu',
        notes: 'Strategic acquisition — test',
      },
    },
  },
};

const exitRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    investmentImplementationId: { type: 'string' },
    exitDate: { type: 'string', format: 'date-time' },
    exitType: { type: 'string' },
    exitProceedsAmount: { type: 'string' },
    totalInvestedBasis: { type: 'string', nullable: true },
    irrAnnualized: { type: 'string', nullable: true, description: 'Annualized IRR (decimal, e.g. 0.18 = 18%)' },
    roiMultiple: { type: 'string', nullable: true, description: 'exitProceeds / totalInvested' },
    currencyId: { type: 'string', nullable: true },
    notes: { type: 'string', nullable: true },
    currency: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        code: { type: 'string' },
        symbol: { type: 'string' },
      },
    },
    recordedBy: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
      },
    },
  },
};

const performanceBlockSchema = {
  type: 'object',
  description: 'Computed at record time from fund disbursements (APPROVED + DISBURSED).',
  properties: {
    totalInvestedBasis: { type: 'number', example: 20000 },
    exitProceedsAmount: { type: 'number', example: 50000 },
    irrAnnualized: { type: 'number', nullable: true, example: 0.42 },
    roiMultiple: { type: 'number', nullable: true, example: 2.5 },
    disbursementFlowCount: { type: 'integer', example: 1 },
  },
};

export const portfolioMonitoringEndpoints: Record<string, Record<string, unknown>> = {
  '/investments/{investmentImplementationId}/valuations': {
    get: {
      tags: [PORTFOLIO_MONITORING_TAG],
      summary: 'List valuation events',
      description:
        'Returns all periodic valuation events for one investment, newest **valuationDate** first. Use for valuation history charts on the portfolio company dashboard. Empty array if none recorded yet.',
      security: bearer,
      parameters: [implIdParam],
      responses: {
        200: {
          description: 'Valuation events',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { type: 'array', items: valuationEventSchema },
                },
              },
            },
          },
        },
        401: { description: 'Missing or invalid JWT' },
        403: { description: 'Role not allowed' },
        404: { description: 'Investment implementation not found' },
      },
    },
    post: {
      tags: [PORTFOLIO_MONITORING_TAG],
      summary: 'Create valuation event',
      description:
        'Records a new valuation snapshot tied to an official **valuationDate** (post-money, fair market value, etc.). **currencyId** is required and must be an active currency. Does not change investment implementation status.',
      security: bearer,
      parameters: [implIdParam],
      requestBody: createValuationBody,
      responses: {
        201: {
          description: 'Created',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: valuationEventSchema,
                },
              },
            },
          },
        },
        400: { description: 'Validation error (missing fields, invalid type, bad currency)' },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden' },
        404: { description: 'Investment implementation not found' },
      },
    },
  },
  '/investments/{investmentImplementationId}/valuations/{valuationEventId}': {
    patch: {
      tags: [PORTFOLIO_MONITORING_TAG],
      summary: 'Update valuation event',
      description:
        'Partial update of one valuation row. Only include fields you want to change. If **currencyId** is sent, it must reference an active currency.',
      security: bearer,
      parameters: [implIdParam, valuationEventIdParam],
      requestBody: patchValuationBody,
      responses: {
        200: {
          description: 'Updated row',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: valuationEventSchema,
                },
              },
            },
          },
        },
        400: { description: 'Validation error' },
        404: { description: 'Valuation event not found for this investment' },
      },
    },
    delete: {
      tags: [PORTFOLIO_MONITORING_TAG],
      summary: 'Delete valuation event',
      description: 'Permanently removes one valuation event from the investment history.',
      security: bearer,
      parameters: [implIdParam, valuationEventIdParam],
      responses: {
        200: {
          description: 'Deleted',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Valuation event deleted' },
                },
              },
            },
          },
        },
        404: { description: 'Valuation event not found' },
      },
    },
  },
  '/investments/{investmentImplementationId}/exit': {
    get: {
      tags: [PORTFOLIO_MONITORING_TAG],
      summary: 'Get exit record(s)',
      description:
        'Returns exit data for the investment. **data** is always an array: empty `[]` when no exit, or one element when an exit exists. The stored row includes computed **irrAnnualized** and **roiMultiple** from disbursement cash flows.',
      security: bearer,
      parameters: [implIdParam],
      responses: {
        200: {
          description: 'Exit list (0 or 1 item)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { type: 'array', items: exitRecordSchema },
                },
              },
              examples: {
                none: {
                  summary: 'No exit yet',
                  value: { success: true, data: [] },
                },
                one: {
                  summary: 'Exit recorded',
                  value: {
                    success: true,
                    data: [
                      {
                        exitType: 'ACQUISITION',
                        exitProceedsAmount: '50000',
                        totalInvestedBasis: '20000',
                        irrAnnualized: '0.421',
                        roiMultiple: '2.5',
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        401: { description: 'Unauthorized' },
        404: { description: 'Investment implementation not found' },
      },
    },
    post: {
      tags: [PORTFOLIO_MONITORING_TAG],
      summary: 'Record or update exit (IRR / ROI)',
      description:
        'Records the final exit for an investment (IPO, acquisition, write-off, etc.). **Upsert:** calling again updates the same exit row.\n\n' +
        '**Accounting link:** loads all fund disbursements with status APPROVED or DISBURSED, sums invested basis, builds cash flows (negative on disbursement dates, positive on exit date), and computes **irrAnnualized** (XIRR-style) and **roiMultiple** (proceeds ÷ invested).\n\n' +
        '**Status:** sets `investment_implementations.status` and `portfolio_companies.status` to **EXITED**.',
      security: bearer,
      parameters: [implIdParam],
      requestBody: recordExitBody,
      responses: {
        200: {
          description: 'Exit saved with performance summary',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      exit: exitRecordSchema,
                      performance: performanceBlockSchema,
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: 'Validation error' },
        404: { description: 'Investment implementation not found' },
      },
    },
    delete: {
      tags: [PORTFOLIO_MONITORING_TAG],
      summary: 'Remove exit and revert statuses',
      description:
        'Deletes the exit row. Restores **portfolio company** status to DISBURSED (if invested) or NO_INVESTMENT, and **implementation** status to COMPLETED or IN_PROGRESS based on disbursement state.',
      security: bearer,
      parameters: [implIdParam],
      responses: {
        200: {
          description: 'Exit removed',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Exit removed; statuses reverted' },
                },
              },
            },
          },
        },
        404: { description: 'No exit recorded for this investment' },
      },
    },
  },
};
