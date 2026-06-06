/**
 * Phase 2 scorecard manual editing — dedicated OpenAPI paths.
 * Merged into the main spec under tag **Phase two Scorecard Editing** only.
 * Server `url` ends with `/api` — paths here are without a second `/api` prefix.
 */

export const PHASE_TWO_SCORECARD_EDITING_TAG = 'Phase two Scorecard Editing';

const TAG = [PHASE_TWO_SCORECARD_EDITING_TAG];

const JSON_200 = {
  description:
    '`{ success: true, data: { scorecardId, savedRecord, document, matrixRows, scores, ... } }`'
};
const JSON_400 = { description: 'Validation error — e.g. missing `editReason`' };
const JSON_401 = { description: 'Missing or invalid JWT' };
const JSON_404 = { description: 'Persisted scorecard not found for the given lookup' };

const EDIT_REQUEST_SCHEMA = {
  type: 'object',
  required: ['editReason'],
  properties: {
    editReason: {
      type: 'string',
      description: 'Mandatory correction reason (audit + documentPayload.manualCorrection.reason)'
    },
    periodLabel: { type: 'string', example: '2026' },
    periodStart: { type: 'string', format: 'date-time' },
    periodEnd: { type: 'string', format: 'date-time' },
    sectionBlendMode: {
      type: 'string',
      enum: ['redistribute', 'penalise'],
      description: 'CEO/Board only — section blend when recalculating scores'
    },
    matrixRowPatches: {
      type: 'array',
      description: 'Patch rows by goalId (matches matrixRows[].id)',
      items: {
        type: 'object',
        required: ['goalId'],
        properties: {
          goalId: { type: 'string' },
          actualValue: { type: 'number' },
          targetValue: { type: 'number' },
          rawRating: { type: 'number' },
          weight: { type: 'number' }
        }
      }
    },
    scores: {
      type: 'object',
      description: 'Optional explicit scores; omitted fields are recalculated from patched rows'
    },
    qualitativeEvaluation: {
      type: 'object',
      properties: {
        personalAttributes: { type: 'array', items: { type: 'object' } },
        trainingAndDevelopment: { type: 'object' }
      }
    }
  }
};

export const phaseTwoScorecardEditingSwaggerPaths = {
  '/performance/scorecards/{scorecardId}': {
    get: {
      tags: TAG,
      summary: 'Load persisted scorecard by id (any type)',
      description:
        'Phase two — Scorecard editing: load any persisted scorecard (EMPLOYEE, DEPARTMENT, CEO, or BOARD) by `scorecardId`.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'scorecardId', required: true, schema: { type: 'string' } }
      ],
      responses: { 200: JSON_200, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/{scorecardId}/edit': {
    put: {
      tags: TAG,
      summary: 'Manual correction of scorecard by id (any type)',
      description:
        'Phase two — Scorecard editing: manual correction by scorecard id (DRAFT or FINAL). Requires **editReason**; writes **SCORECARD_MANUAL_EDIT** audit.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'scorecardId', required: true, schema: { type: 'string' } }
      ],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: EDIT_REQUEST_SCHEMA } }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/employee/{employeeId}/persisted': {
    get: {
      tags: TAG,
      summary: 'Load persisted employee scorecard for a period',
      description:
        'Phase two — Scorecard editing: load saved employee scorecard for `employeeId` + period (latest DRAFT or FINAL).',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'employeeId', required: true, schema: { type: 'string' } },
        { in: 'query', name: 'periodLabel', schema: { type: 'string', example: '2026' } },
        { in: 'query', name: 'periodStart', schema: { type: 'string', format: 'date-time' } },
        { in: 'query', name: 'periodEnd', schema: { type: 'string', format: 'date-time' } }
      ],
      responses: { 200: JSON_200, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/employee/{employeeId}/edit': {
    put: {
      tags: TAG,
      summary: 'Manual correction of employee scorecard for a period',
      description: 'Phase two — Scorecard editing: correct employee scorecard for `employeeId` + period.',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'employeeId', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: EDIT_REQUEST_SCHEMA } }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/department/{department}/persisted': {
    get: {
      tags: TAG,
      summary: 'Load persisted department scorecard',
      description: 'Phase two — Scorecard editing: load saved department scorecard by department name + period.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'department', required: true, schema: { type: 'string' } },
        { in: 'query', name: 'periodLabel', schema: { type: 'string' } }
      ],
      responses: { 200: JSON_200, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/department/{department}/edit': {
    put: {
      tags: TAG,
      summary: 'Manual correction of department scorecard',
      description: 'Phase two — Scorecard editing: correct department scorecard by name + period.',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'department', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: EDIT_REQUEST_SCHEMA } }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/department/by-id/{departmentId}/persisted': {
    get: {
      tags: TAG,
      summary: 'Load persisted department scorecard by department id',
      description: 'Phase two — Scorecard editing: same as department name route; uses org `departmentId`.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'departmentId', required: true, schema: { type: 'string' } },
        { in: 'query', name: 'periodLabel', schema: { type: 'string' } }
      ],
      responses: { 200: JSON_200, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/department/by-id/{departmentId}/edit': {
    put: {
      tags: TAG,
      summary: 'Manual correction of department scorecard by id',
      description: 'Phase two — Scorecard editing: correct department scorecard by `departmentId` + period.',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'departmentId', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: EDIT_REQUEST_SCHEMA } }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/ceo/persisted': {
    get: {
      tags: TAG,
      summary: 'Load persisted CEO scorecard for a period',
      description: 'Phase two — Scorecard editing: load the single saved CEO scorecard for the period.',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'query', name: 'periodLabel', schema: { type: 'string', example: '2026' } }],
      responses: { 200: JSON_200, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/ceo/edit': {
    put: {
      tags: TAG,
      summary: 'Manual correction of CEO scorecard',
      description:
        'Phase two — Scorecard editing: correct CEO scorecard for the period. Optional **sectionBlendMode** for section blend.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: EDIT_REQUEST_SCHEMA } }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/board/persisted': {
    get: {
      tags: TAG,
      summary: 'Load persisted Board scorecard for a period',
      description: 'Phase two — Scorecard editing: load the single saved Board scorecard for the period.',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'query', name: 'periodLabel', schema: { type: 'string', example: '2026' } }],
      responses: { 200: JSON_200, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/board/edit': {
    put: {
      tags: TAG,
      summary: 'Manual correction of Board scorecard',
      description: 'Phase two — Scorecard editing: correct Board scorecard for the period.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: EDIT_REQUEST_SCHEMA } }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    }
  }
};
