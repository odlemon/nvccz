/**
 * Paths merged into the main OpenAPI spec so **Updated investment flow** lists every step
 * even when swagger-jsdoc fails (production uses fallbackSpec + merges).
 */
export const updatedInvestmentFlowExtraPaths: Record<string, Record<string, unknown>> = {
  '/applications/{id}/assigned-analyst': {
    patch: {
      tags: ['Updated investment flow'],
      summary: 'Assign lead investment analyst',
      description: 'Body `{ "analystUserId": "<cuid>" }`. Stages: SCREENING_PENDING or SCREENING.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'cmi78trsi0000jx048i72bb7m' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['analystUserId'],
              properties: { analystUserId: { type: 'string', example: 'cml7udye80014kt1b65oncfdl' } }
            },
            examples: {
              assign: { value: { analystUserId: 'cml7udye80014kt1b65oncfdl' } }
            }
          }
        }
      },
      responses: { 200: { description: 'OK' }, 400: { description: 'Bad request' }, 401: { description: 'Unauthorized' } }
    }
  },
  '/applications/{id}/analyst-screening': {
    post: {
      tags: ['Updated investment flow'],
      summary: 'Record analyst screening score (0–100)',
      description: 'Stage SCREENING only. Caller must be assigned analyst. Score below 50 rejects.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'cmi78trsi0000jx048i72bb7m' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['score'],
              properties: { score: { type: 'integer', minimum: 0, maximum: 100, example: 72 } }
            },
            examples: { pass: { value: { score: 72 } }, fail: { value: { score: 42 } } }
          }
        }
      },
      responses: { 200: { description: 'OK' }, 400: { description: 'Bad request' }, 401: { description: 'Unauthorized' } }
    }
  },
  '/applications/{id}/trigger-shortlisting': {
    post: {
      tags: ['Updated investment flow'],
      summary: 'Trigger AI shortlisting (async)',
      description: 'When currentStage is SCREENING_PENDING.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Accepted' }, 400: { description: 'Bad request' }, 401: { description: 'Unauthorized' } }
    }
  },
  '/applications/{id}/rbz-exchange-control-document': {
    post: {
      tags: ['Updated investment flow'],
      summary: 'Upload RBZ Exchange Control document',
      description: 'multipart/form-data — required field **file** (single PDF).',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'cmi78trsi0000jx048i72bb7m' } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file'],
              properties: { file: { type: 'string', format: 'binary', description: 'RBZ approval PDF' } }
            }
          }
        }
      },
      responses: { 201: { description: 'Stored' }, 400: { description: 'Bad request' }, 401: { description: 'Unauthorized' } }
    }
  },
  '/applications/{id}/statutory-compliance': {
    patch: {
      tags: ['Updated investment flow'],
      summary: 'Set KYC verified (statutory compliance)',
      description: 'Requires RBZ document when kycVerified true. Sets complianceCleared when rules pass.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'cmi78trsi0000jx048i72bb7m' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['kycVerified'],
              properties: { kycVerified: { type: 'boolean', example: true } }
            },
            examples: { verify: { value: { kycVerified: true } } }
          }
        }
      },
      responses: { 200: { description: 'OK' }, 400: { description: 'Bad request' }, 401: { description: 'Unauthorized' } }
    }
  },
  '/applications/{id}/collaboration/messages': {
    get: {
      tags: ['Updated investment flow'],
      summary: 'List deal collaboration messages',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'cmi78trsi0000jx048i72bb7m' } }],
      responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } }
    },
    post: {
      tags: ['Updated investment flow'],
      summary: 'Post deal collaboration message',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'cmi78trsi0000jx048i72bb7m' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['content'],
              properties: {
                content: { type: 'string', example: 'Please upload Q3 accounts.' },
                mentionUserIds: { type: 'array', items: { type: 'string' }, example: ['cml7udye80014kt1b65oncfdl'] }
              }
            }
          }
        }
      },
      responses: { 201: { description: 'Created' }, 400: { description: 'Bad request' }, 401: { description: 'Unauthorized' } }
    }
  },
  '/applications/{id}/collaboration/comments': {
    post: {
      tags: ['Updated investment flow'],
      summary: 'Post deal collaboration comment (optional attachments)',
      description: 'multipart/form-data: **content** (string), repeat **attachments** for files.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', example: 'cmi78trsi0000jx048i72bb7m' } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['content'],
              properties: {
                content: { type: 'string', example: 'See attached.' },
                attachments: { type: 'array', items: { type: 'string', format: 'binary' } }
              }
            }
          }
        }
      },
      responses: { 201: { description: 'Created' }, 400: { description: 'Bad request' }, 401: { description: 'Unauthorized' } }
    }
  }
};
