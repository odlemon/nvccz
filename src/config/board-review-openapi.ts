/**
 * Board review + Investment Memorandum (IM) — OpenAPI 3.
 * Merged last in `swagger.ts` so IM upload (multipart) overrides any stale JSON-only docs.
 * Paths are relative to server `url` in spec (e.g. `http://localhost:3000/api`) — do not prefix with `/api`.
 */
const IM_MULTIPART = {
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
              'Final Investment Memorandum. Allowed: PDF, Word (.doc/.docx), Excel (.xls/.xlsx). Max 50MB per multer config.'
          },
          recommendationReport: { type: 'string', example: 'Recommend approval subject to conditions below.' },
          additionalInformation: { type: 'string' },
          decisionReason: { type: 'string' },
          conditions: { type: 'string' },
          nextSteps: { type: 'string' },
          overallScore: { type: 'string', description: 'Numeric score sent as form text (e.g. 82.5)' },
          finalComments: { type: 'string' },
          investmentApproved: { type: 'string', description: 'String "true" or "false" (booleans as text)' },
          investmentRejected: { type: 'string' },
          conditionalApproval: { type: 'string' }
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
        '**Content-Type: multipart/form-data** only. Required part **`document`** = IM file (Firebase path `board-review-im/...`).',
        'Application must be in **`UNDER_BOARD_REVIEW`**. If no `board_reviews` row exists, one is created; only one per application.',
        'After upload: IM stored, `READY_FOR_VOTE`, call-to-vote + IC member notifications (no separate call required unless re-running upload flow).',
        'Booleans in form are sent as strings `true` / `false` (see `parseMultipartBool` in controller).'
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
      requestBody: IM_MULTIPART,
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
      summary: 'Update board review (JSON)',
      description: 'Application JSON — not for IM file; use IM upload route for a new file.',
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
        '**Preferred** IM upload for an application already in board review flow.',
        'Same **multipart** body as `POST /board-reviews/{applicationId}`: required **`document`**, same optional text fields.',
        'If no board review exists yet, creates it (same rules as create); otherwise updates IM and triggers call to vote.',
        'Optional form field **`resendNotifications`**: `true` to re-email IC if already in `READY_FOR_VOTE`.'
      ].join(' '),
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'applicationId', in: 'path', required: true, schema: { type: 'string' } }
      ],
      requestBody: {
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
                  description: 'Final IM file (PDF / Word / Excel, max 50MB)'
                },
                recommendationReport: { type: 'string' },
                additionalInformation: { type: 'string' },
                decisionReason: { type: 'string' },
                conditions: { type: 'string' },
                nextSteps: { type: 'string' },
                overallScore: { type: 'string' },
                finalComments: { type: 'string' },
                investmentApproved: { type: 'string' },
                investmentRejected: { type: 'string' },
                conditionalApproval: { type: 'string' },
                resendNotifications: {
                  type: 'string',
                  description: 'Optional. "true" to resend vote invite emails.'
                }
              }
            }
          }
        }
      },
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
