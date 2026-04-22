/**
 * Board review + Investment Memorandum (IM) — OpenAPI 3.
 * Merged last in `swagger.ts` so IM upload (multipart) overrides any stale JSON-only docs.
 * Paths are relative to server `url` in spec (e.g. `http://localhost:3000/api`) — do not prefix with `/api`.
 */
/** IM upload on create / replace — **file only**. Narrative, scores, and decision flags: **PUT** `/board-reviews/{applicationId}`. */
const IM_MULTIPART_DOCUMENT_ONLY = {
  required: true,
  content: {
    'multipart/form-data': {
      schema: {
        type: 'object',
        required: ['document'],
        properties: {
          document: {
            type: 'string',
            format: 'binary',
            description:
              'Final Investment Memorandum. PDF, Word, or Excel; max 50MB. **No other fields** on this request — use PUT to add recommendation, etc.'
          }
        }
      }
    }
  }
} as const;

const IM_MULTIPART_WITH_RESEND = {
  required: true,
  content: {
    'multipart/form-data': {
      schema: {
        type: 'object',
        required: ['document'],
        properties: {
          document: {
            type: 'string',
            format: 'binary',
            description: 'Replace IM file (same rules as create).'
          },
          resendNotifications: {
            type: 'string',
            description: 'Optional. `"true"` to resend IC vote invite emails when re-running call-to-vote.'
          }
        }
      }
    }
  }
} as const;

const TAGS = ['🏢 Portfolio Management', '🗳️ Voting Process', 'Updated investment flow'];

export const boardReviewOpenApiOverridePaths: Record<string, Record<string, unknown>> = {
  '/board-reviews/{applicationId}': {
    post: {
      tags: TAGS,
      summary: 'Create board review — upload final Investment Memorandum (CIO / fund office)',
      description: [
        '**multipart/form-data** — **only** the **`document`** part (IM file).',
        'Application must be **`UNDER_BOARD_REVIEW`**. One board review per application.',
        'After upload: IM stored, `READY_FOR_VOTE`, IC notified. **Recommendation, overall score, decision flags, etc. are not set here** — use **PUT** `/board-reviews/{applicationId}` later in your workflow.'
      ].join(' '),
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'applicationId',
          in: 'path',
          required: true,
          schema: { type: 'string', example: 'cmi78trsi0000jx048i72bb7m' }
        }
      ],
      requestBody: IM_MULTIPART_DOCUMENT_ONLY,
      responses: {
        201: {
          description: 'Board review created, IM uploaded',
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        400: { description: 'Validation, wrong stage, duplicate review, or file type' },
        401: { description: 'Unauthorized' },
        500: { description: 'Server error' }
      }
    },
    get: {
      tags: ['🏢 Portfolio Management', '🗳️ Voting Process'],
      summary: 'Get board review by application ID',
      description: 'Returns board review row and relations (including IM metadata when present).',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }
      ],
      responses: {
        200: { description: 'OK' },
        404: { description: 'Not found' },
        401: { description: 'Unauthorized' }
      }
    },
    put: {
      tags: ['🏢 Portfolio Management', '🗳️ Voting Process'],
      summary: 'Update board review — narrative, scores, decision flags (JSON)',
      description:
        '**Use this** for recommendation text, additional information, decision reason, conditions, next steps, overall score, final comments, and investment decision booleans — **not** on the IM upload POST. IM file changes: **POST** `.../investment-memorandum` or **POST** `...` (create path). **Note:** service may require voting to be complete before updates; see API response if rejected.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }
      ],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                investmentApproved: { type: 'boolean' },
                investmentRejected: { type: 'boolean' },
                conditionalApproval: { type: 'boolean' },
                recommendationReport: { type: 'string' },
                additionalInformation: { type: 'string' },
                decisionReason: { type: 'string' },
                conditions: { type: 'string' },
                nextSteps: { type: 'string' },
                overallScore: { type: 'number' },
                finalComments: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'OK' },
        404: { description: 'Not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/board-reviews/{applicationId}/investment-memorandum': {
    post: {
      tags: TAGS,
      summary: 'Upload / replace Investment Memorandum and run call to vote (CIO)',
      description: [
        '**multipart/form-data** — required **`document`**; optional **`resendNotifications`** (`"true"` / `"false"` as form text) to re-email IC.',
        'Same as create: **no** recommendation or decision fields here — use **PUT** for those.',
        'If no board review row exists, creates it; otherwise replaces IM and runs call to vote.'
      ].join(' '),
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }
      ],
      requestBody: IM_MULTIPART_WITH_RESEND,
      responses: {
        200: { description: 'Existing review — IM replaced, call to vote completed' },
        201: { description: 'New board review created + IM + call to vote' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      tags: ['🏢 Portfolio Management', '🗳️ Voting Process'],
      summary: 'Get Investment Memorandum access (signed URL + audit)',
      description:
        'Returns IM metadata and download access; server records audit **BOARD_IM_VIEWED**. Eligibility per `BoardReviewService` (e.g. IC / Investments roles).',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }
      ],
      responses: {
        200: { description: 'OK' },
        400: { description: 'Not authorized or no IM' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/board-reviews/{applicationId}/call-to-vote': {
    post: {
      tags: ['🏢 Portfolio Management', '🗳️ Voting Process', 'Updated investment flow'],
      summary: 'Call to vote (without new file upload)',
      description:
        'Sets review to ready for vote and emails IC. Idempotent. Optional JSON body: `{ "resendNotifications": true }` to re-send notifications.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                resendNotifications: { type: 'boolean', example: true }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Call to vote completed' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  }
};
