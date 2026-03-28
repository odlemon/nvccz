/** OpenAPI paths for GET/POST/PATCH/DELETE /users/me/saved-filter-favorites (mounted under /api). */
export const userSavedFilterFavoriteEndpoints = {
  '/users/me/saved-filter-favorites': {
    get: {
      summary: 'List my saved filter favorites',
      description:
        'Returns named filter presets for the authenticated user. Optional `routeKey` limits results to one client screen/module.',
      tags: ['Saved filter favorites'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'routeKey',
          required: false,
          schema: { type: 'string' },
          example: 'sales-invoices',
          description: 'When set, only favorites for this route/module key are returned',
        },
      ],
      responses: {
        200: {
          description: 'List of presets',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/SavedFilterFavorite' },
                  },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        401: { description: 'Unauthorized' },
      },
    },
    post: {
      summary: 'Create a saved filter favorite',
      description:
        'Stores a named preset with arbitrary JSON `filters` (max 200 per user). Name must be unique per user.',
      tags: ['Saved filter favorites'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SavedFilterFavoriteCreate' },
          },
        },
      },
      responses: {
        201: {
          description: 'Created',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/SavedFilterFavorite' },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        400: { description: 'Validation or duplicate name / max presets' },
        401: { description: 'Unauthorized' },
        500: { description: 'Server error' },
      },
    },
  },
  '/users/me/saved-filter-favorites/{presetId}': {
    get: {
      summary: 'Get one saved filter favorite',
      tags: ['Saved filter favorites'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'presetId',
          required: true,
          schema: { type: 'string' },
          description: 'Preset ID (cuid)',
        },
      ],
      responses: {
        200: {
          description: 'Preset found',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/SavedFilterFavorite' },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        401: { description: 'Unauthorized' },
        404: { description: 'Not found' },
      },
    },
    patch: {
      summary: 'Update a saved filter favorite',
      description: 'Send any of name, routeKey, filters, sortOrder. At least one field required.',
      tags: ['Saved filter favorites'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'presetId',
          required: true,
          schema: { type: 'string' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SavedFilterFavoriteUpdate' },
          },
        },
      },
      responses: {
        200: {
          description: 'Updated',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: { $ref: '#/components/schemas/SavedFilterFavorite' },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' },
        404: { description: 'Not found' },
      },
    },
    delete: {
      summary: 'Delete a saved filter favorite',
      tags: ['Saved filter favorites'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'presetId',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {
        200: {
          description: 'Deleted',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: {
                    type: 'object',
                    properties: { deleted: { type: 'boolean', example: true } },
                  },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        401: { description: 'Unauthorized' },
        404: { description: 'Not found' },
      },
    },
  },
} as const;
