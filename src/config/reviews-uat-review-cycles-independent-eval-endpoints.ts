/**
 * Reviews UAT — Review cycles & independent evaluation.
 *
 * NOTE: Swagger `servers[].url` already ends with `/api`,
 * so paths here MUST NOT include a second `/api` prefix.
 */

const JSON_401 = { description: 'Missing or invalid JWT' };
const JSON_400 = { description: 'Validation or business-rule error' };
const JSON_403 = { description: 'Forbidden' };
const JSON_404 = { description: 'Not found' };

export const reviewsUatReviewCyclesIndependentEvalEndpoints = {
  // ==========================
  // Review Cycles
  // ==========================

  '/performance/review-cycles': {
    post: {
      summary: 'Create performance review cycle',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: [
                'title',
                'reviewPeriodStart',
                'reviewPeriodEnd',
                'selfAssessmentDeadline',
                'peerReviewDeadline',
                'managerReviewDeadline',
                'availableReviewTypes',
                'reviewRatingScale'
              ],
              properties: {
                title: { type: 'string', example: 'Year End 2026 Review Cycle' },
                reviewPeriodStart: { type: 'string', format: 'date-time' },
                reviewPeriodEnd: { type: 'string', format: 'date-time' },
                selfAssessmentDeadline: { type: 'string', format: 'date-time' },
                peerReviewDeadline: { type: 'string', format: 'date-time' },
                managerReviewDeadline: { type: 'string', format: 'date-time' },
                availableReviewTypes: { type: 'array', items: { type: 'string' }, example: ['Self', 'Manager', 'Peer'] },
                reviewRatingScale: { type: 'string', example: '1-5 Scale' },
                isActive: { type: 'boolean', nullable: true }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Created' },
        400: JSON_400,
        401: JSON_401
      }
    },
    get: {
      summary: 'List performance review cycles',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'isActive', schema: { type: 'boolean' } },
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 10 } }
      ],
      responses: { 200: { description: 'OK' }, 401: JSON_401 }
    }
  },

  '/performance/review-cycles/{cycleId}': {
    get: {
      summary: 'Get review cycle by id',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'cycleId', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'OK' }, 401: JSON_401, 404: JSON_404 }
    },
    put: {
      summary: 'Update review cycle',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'cycleId', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', properties: { isActive: { type: 'boolean' } } } } }
      },
      responses: { 200: { description: 'OK' }, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    },
    delete: {
      summary: 'Delete review cycle',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'cycleId', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Deleted' }, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    }
  },

  // ==========================
  // Reviews (independent evaluation)
  // ==========================

  '/performance-reviews': {
    post: {
      summary: 'Create performance review',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
      responses: { 201: { description: 'Created' }, 400: JSON_400, 401: JSON_401 }
    },
    get: {
      summary: 'List performance reviews',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 10 } },
        { in: 'query', name: 'status', schema: { type: 'string' } },
        { in: 'query', name: 'stage', schema: { type: 'string' } }
      ],
      responses: { 200: { description: 'OK' }, 401: JSON_401 }
    }
  },

  '/performance-reviews/{id}': {
    get: {
      summary: 'Get performance review by id',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'OK' }, 401: JSON_401, 403: JSON_403, 404: JSON_404 }
    },
    put: {
      summary: 'Update performance review',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
      responses: { 200: { description: 'OK' }, 400: JSON_400, 401: JSON_401, 403: JSON_403, 404: JSON_404 }
    },
    delete: {
      summary: 'Delete performance review',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Deleted' }, 401: JSON_401, 403: JSON_403, 404: JSON_404 }
    }
  },

  '/performance-reviews/cycles/{cycleId}/initiate': {
    post: {
      summary: 'Trigger review cycle reminders / initiation',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'cycleId', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'OK' }, 401: JSON_401 }
    }
  },

  '/performance-reviews/{id}/autopopulate': {
    post: {
      summary: 'Auto-populate quantitative snapshot',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'OK' }, 401: JSON_401, 403: JSON_403, 404: JSON_404 }
    }
  },

  '/performance-reviews/{id}/complete-stage': {
    post: {
      summary: 'Complete current stage and advance workflow',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'OK' }, 401: JSON_401, 403: JSON_403, 404: JSON_404 }
    }
  },

  '/performance-reviews/{id}/finalize': {
    post: {
      summary: 'Finalize review (lock + generate PDF)',
      description:
        'Locks the review and generates a PDF (server-local storage). After this, use GET /performance-reviews/{id}/document.pdf to download the PDF.',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Finalized' }, 400: JSON_400, 401: JSON_401, 403: JSON_403, 404: JSON_404 }
    }
  },

  '/performance-reviews/{id}/document': {
    get: {
      summary: 'Get document payload/status',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'OK' }, 401: JSON_401, 403: JSON_403, 404: JSON_404 }
    }
  },

  '/performance-reviews/{id}/document.pdf': {
    get: {
      summary: 'Download finalized PDF',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'PDF stream', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
        400: JSON_400,
        401: JSON_401,
        403: JSON_403,
        404: JSON_404
      }
    }
  },

  '/performance-reviews/reports/rating-distribution': {
    get: {
      summary: 'Rating distribution report',
      tags: ['Reviews UAT (Review cycles & independent evaluation)'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'departmentName', required: true, schema: { type: 'string' } },
        { in: 'query', name: 'reviewPeriod', required: false, schema: { type: 'string' } }
      ],
      responses: { 200: { description: 'OK' }, 400: JSON_400, 401: JSON_401 }
    }
  }
};

