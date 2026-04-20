/**
 * Fund CRUD + queries — merged into Swagger so paths appear even when route JSDoc parsing fails.
 * Paths are relative to `servers[].url` (e.g. `https://host/api` → `/funds` = `https://host/api/funds`).
 */

const TAG = 'Fund Management';

const fundIdPath = {
  name: 'fundId',
  in: 'path' as const,
  required: true,
  description: 'Fund primary key (cuid)',
  schema: { type: 'string', example: 'cmfund01example0001nvcczabcd' },
};

export const fundManagementEndpoints: Record<string, Record<string, unknown>> = {
  '/funds': {
    post: {
      tags: [TAG],
      summary: 'Create a new fund',
      description:
        '**Admin only.** `createdById` is taken from the JWT. On create, `remainingAmount` is set equal to `totalAmount`.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateFundRequest' },
            examples: {
              sportsFund: {
                summary: 'Large fund with wide LP ticket range',
                value: {
                  name: 'Sports Growth Fund I',
                  description: 'Early-stage sports and media investments.',
                  totalAmount: 50000000,
                  minInvestment: 10000,
                  maxInvestment: 10000000,
                  focusIndustries: ['Sports', 'Media', 'Technology'],
                  applicationStart: '2025-01-01T00:00:00.000Z',
                  applicationEnd: '2027-12-31T23:59:59.999Z',
                  status: 'OPEN',
                },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Fund created successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { $ref: '#/components/schemas/Fund' },
                  message: { type: 'string', example: 'Fund created successfully' },
                },
              },
            },
          },
        },
        400: { description: 'Validation error' },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden — admin role required' },
      },
    },
    get: {
      tags: [TAG],
      summary: 'List funds (paginated, filters)',
      description: '**Admin** or **fund_manager**.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 10 } },
        {
          in: 'query',
          name: 'status',
          schema: { type: 'string', enum: ['OPEN', 'CLOSED', 'COMING_SOON'] },
        },
        { in: 'query', name: 'industry', schema: { type: 'string' } },
        { in: 'query', name: 'minAvailableBalance', schema: { type: 'number' } },
        { in: 'query', name: 'maxAvailableBalance', schema: { type: 'number' } },
      ],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      funds: { type: 'array', items: { $ref: '#/components/schemas/Fund' } },
                      total: { type: 'integer' },
                      page: { type: 'integer' },
                      totalPages: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  '/funds/statistics': {
    get: {
      tags: [TAG],
      summary: 'Aggregate fund statistics',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      totalFunds: { type: 'integer', example: 5 },
                      openFunds: { type: 'integer', example: 3 },
                      closedFunds: { type: 'integer', example: 1 },
                      comingSoonFunds: { type: 'integer', example: 1 },
                      totalAmount: { type: 'number', example: 120000000 },
                      totalRemainingAmount: { type: 'number', example: 45000000 },
                      totalDisbursedAmount: { type: 'number', example: 75000000 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  '/funds/{fundId}': {
    get: {
      tags: [TAG],
      summary: 'Get fund by ID',
      security: [{ bearerAuth: [] }],
      parameters: [fundIdPath],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { $ref: '#/components/schemas/Fund' },
                },
              },
            },
          },
        },
        404: { description: 'Fund not found' },
      },
    },
    put: {
      tags: [TAG],
      summary: 'Update fund details',
      description:
        '**Admin only.** Partial body. If `totalAmount` changes, `remainingAmount` is scaled proportionally (see implementation). Use this to raise **`maxInvestment`** (LP ticket cap) or fund size.',
      security: [{ bearerAuth: [] }],
      parameters: [fundIdPath],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateFundRequest' },
            examples: {
              raiseMaxAndSize: {
                summary: 'Raise max LP ticket and fund size',
                value: { maxInvestment: 15000000, totalAmount: 75000000 },
              },
              raiseMaxOnly: {
                summary: 'Raise per-LP commitment cap only',
                value: { maxInvestment: 10000000 },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Fund updated successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { $ref: '#/components/schemas/Fund' },
                  message: { type: 'string', example: 'Fund updated successfully' },
                },
              },
            },
          },
        },
        400: { description: 'Validation error' },
      },
    },
  },
  '/funds/{fundId}/close': {
    post: {
      tags: [TAG],
      summary: 'Close a fund',
      security: [{ bearerAuth: [] }],
      parameters: [fundIdPath],
      responses: {
        200: {
          description: 'Fund closed successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { $ref: '#/components/schemas/Fund' },
                  message: { type: 'string', example: 'Fund closed successfully' },
                },
              },
            },
          },
        },
      },
    },
  },
  '/funds/industry/{industry}': {
    get: {
      tags: [TAG],
      summary: 'Get funds by industry focus',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'industry',
          in: 'path',
          required: true,
          schema: { type: 'string', example: 'Technology' },
        },
      ],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { type: 'array', items: { $ref: '#/components/schemas/Fund' } },
                },
              },
            },
          },
        },
      },
    },
  },
  '/funds/status/{status}': {
    get: {
      tags: [TAG],
      summary: 'Get funds by status',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'status',
          in: 'path',
          required: true,
          schema: { type: 'string', enum: ['OPEN', 'CLOSED', 'COMING_SOON'], example: 'OPEN' },
        },
      ],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { type: 'array', items: { $ref: '#/components/schemas/Fund' } },
                },
              },
            },
          },
        },
      },
    },
  },
  '/funds/balance/{minBalance}/{maxBalance}': {
    get: {
      tags: [TAG],
      summary: 'Get funds by remaining balance range',
      description: 'Filters funds whose **`remainingAmount`** falls between `minBalance` and `maxBalance`.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'minBalance',
          in: 'path',
          required: true,
          schema: { type: 'number', example: 1000000 },
        },
        {
          name: 'maxBalance',
          in: 'path',
          required: true,
          schema: { type: 'number', example: 50000000 },
        },
      ],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: { type: 'array', items: { $ref: '#/components/schemas/Fund' } },
                },
              },
            },
          },
        },
      },
    },
  },
};
