/**
 * Investee letterhead CRUD — merged into Swagger when route JSDoc is skipped (fallback spec).
 * Base URL already includes `/api` → paths are `/portfolio-companies/...`.
 */

const TAG = 'Portfolio Letterheads';

const idParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  description: 'Portfolio company ID (cuid)',
  schema: { type: 'string', example: 'cml7udyen0016kt1bmo61s5c5' },
};

const letterheadJsonSchema = {
  type: 'object',
  description: 'Send at least one field on PUT. Omitted keys are left unchanged on upsert.',
  properties: {
    legalName: { type: 'string', nullable: true, example: 'Vexma Tech' },
    registrationNumber: { type: 'string', nullable: true },
    taxNumber: { type: 'string', nullable: true },
    email: { type: 'string', nullable: true, example: 'hello@example.com' },
    phone: { type: 'string', nullable: true },
    website: { type: 'string', nullable: true },
    logoUrl: { type: 'string', nullable: true, description: 'Optional URL if not using logo upload' },
    line1: { type: 'string', nullable: true, example: '4th floor Blue Bridge' },
    line2: { type: 'string', nullable: true, example: 'Eastgate Mall' },
    city: { type: 'string', nullable: true, example: 'Harare' },
    state: { type: 'string', nullable: true },
    postalCode: { type: 'string', nullable: true },
    country: { type: 'string', nullable: true, example: 'Zimbabwe' },
    addressLabel: { type: 'string', nullable: true },
    twitter: { type: 'string', nullable: true },
    facebook: { type: 'string', nullable: true },
    linkedin: { type: 'string', nullable: true },
    instagram: { type: 'string', nullable: true },
  },
};

export const portfolioLetterheadsEndpoints: Record<string, Record<string, unknown>> = {
  '/portfolio-companies/{id}/letterhead': {
    get: {
      tags: [TAG],
      summary: 'Get investee letterhead for a portfolio company',
      description: 'Returns the letterhead row or `data: null` if none saved. **Authenticate** (any logged-in user).',
      security: [{ bearerAuth: [] }],
      parameters: [idParam],
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
                    nullable: true,
                    description: 'Letterhead row or null',
                  },
                },
              },
            },
          },
        },
        404: { description: 'Portfolio company not found' },
      },
    },
    put: {
      tags: [TAG],
      summary: 'Create or update investee letterhead',
      description: 'Upsert partial JSON — at least one letterhead field required. **Authenticate**.',
      security: [{ bearerAuth: [] }],
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: letterheadJsonSchema,
            examples: {
              minimal: {
                summary: 'Address + legal name',
                value: {
                  legalName: 'Vexma Tech',
                  line1: '4th floor Blue Bridge',
                  line2: 'Eastgate Mall',
                  city: 'Harare',
                  country: 'Zimbabwe',
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Saved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Portfolio company letterhead saved' },
                  data: { type: 'object' },
                },
              },
            },
          },
        },
        400: { description: 'No fields supplied or invalid body' },
        404: { description: 'Portfolio company not found' },
      },
    },
    delete: {
      tags: [TAG],
      summary: 'Delete investee letterhead',
      description: 'Removes the letterhead record for this portfolio company. **Authenticate**.',
      security: [{ bearerAuth: [] }],
      parameters: [idParam],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  deleted: { type: 'boolean' },
                },
              },
            },
          },
        },
        404: { description: 'Portfolio company not found' },
      },
    },
  },
  '/portfolio-companies/{id}/letterhead/logo': {
    post: {
      tags: [TAG],
      summary: 'Upload letterhead logo',
      description: '**multipart/form-data** — field name **`logo`** (image file, max ~10MB). **Authenticate**.',
      security: [{ bearerAuth: [] }],
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['logo'],
              properties: {
                logo: {
                  type: 'string',
                  format: 'binary',
                  description: 'Logo image file',
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Uploaded',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'Logo uploaded' },
                  data: {
                    type: 'object',
                    properties: {
                      logoUrl: { type: 'string', format: 'uri' },
                      letterhead: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: 'Missing file or upload failed' },
        404: { description: 'Portfolio company not found' },
      },
    },
  },
};
