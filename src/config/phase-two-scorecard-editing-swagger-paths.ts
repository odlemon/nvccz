/**
 * Phase 2 scorecard manual editing — dedicated OpenAPI paths.
 * Merged into the main spec under tag **Phase two Scorecard Editing** only.
 */

import {
  EMPLOYEE_PERSONAL_ATTRIBUTES,
  EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS
} from '../services/performanceScorecardSupport';

export const PHASE_TWO_SCORECARD_EDITING_TAG = 'Phase two Scorecard Editing';

const TAG = [PHASE_TWO_SCORECARD_EDITING_TAG];

const JSON_200 = {
  description:
    '`{ success: true, data: { scorecardId, savedRecord, document, qualitativeSections, scores (read-only), ... } }`'
};
const JSON_400 = { description: 'Validation error — e.g. missing `editReason` or forbidden numeric patches' };
const JSON_401 = { description: 'Missing or invalid JWT' };
const JSON_404 = { description: 'Persisted scorecard not found for the given lookup' };

const NOT_EDITABLE_NOTE =
  '**Not editable via this API:** goal actuals, target values, raw ratings, weights, matrix rows, or computed scores — those come from progress tracking. ' +
  '**Editable:** `qualitativeEvaluation.personalAttributes` (and optional `trainingAndDevelopment`) only.';

function buildPersonalAttributesGridExample(highlightAttribute = 'Teamwork', selectedColumnIndex = 2) {
  return EMPLOYEE_PERSONAL_ATTRIBUTES.map((attribute) => ({
    attribute,
    columns: EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS.map((label, index) => ({
      label,
      selected: attribute === highlightAttribute ? index === selectedColumnIndex : false
    }))
  }));
}

const QUALITATIVE_EVALUATION_SCHEMA = {
  type: 'object',
  required: ['personalAttributes'],
  description:
    'Qualitative personal-attributes grid (10 rows × 5 rating columns). Exactly one `selected: true` per row.',
  properties: {
    personalAttributes: {
      type: 'array',
      minItems: 10,
      items: {
        type: 'object',
        required: ['attribute', 'columns'],
        properties: {
          attribute: { type: 'string', enum: [...EMPLOYEE_PERSONAL_ATTRIBUTES] },
          columns: {
            type: 'array',
            minItems: 5,
            maxItems: 5,
            items: {
              type: 'object',
              required: ['label', 'selected'],
              properties: {
                label: { type: 'string', enum: [...EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS] },
                selected: { type: 'boolean', nullable: true, description: 'At most one true per row' }
              }
            }
          }
        }
      }
    },
    trainingAndDevelopment: {
      type: 'object',
      description: 'Optional training notes (beginning/end of cycle, interventions)',
      properties: {
        beginningOfCycle: { type: 'array', items: { type: 'object' } },
        endOfCycle: { type: 'array', items: { type: 'object' } },
        interventions: { type: 'array', items: { type: 'object' } }
      }
    }
  }
};

const QUALITATIVE_EXAMPLE = {
  personalAttributes: buildPersonalAttributesGridExample('Teamwork', 2),
  trainingAndDevelopment: {
    beginningOfCycle: [{ note: 'Completed leadership workshop Q1' }],
    endOfCycle: [],
    interventions: [{ type: 'Coaching', note: 'Monthly 1:1 feedback sessions' }]
  }
};

function editRequestBody(scopeNote: string, extraProperties: Record<string, unknown> = {}) {
  return {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['editReason', 'qualitativeEvaluation'],
          description: scopeNote + ' ' + NOT_EDITABLE_NOTE,
          properties: {
            editReason: {
              type: 'string',
              description: 'Mandatory correction reason (audit + documentPayload.manualCorrection.reason)',
              example: 'Corrected Teamwork rating after calibration meeting'
            },
            periodLabel: { type: 'string', example: '2026' },
            periodStart: { type: 'string', format: 'date-time' },
            periodEnd: { type: 'string', format: 'date-time' },
            qualitativeEvaluation: QUALITATIVE_EVALUATION_SCHEMA,
            ...extraProperties
          }
        },
        examples: {
          qualitativeOnly: {
            summary: 'Qualitative correction (typical)',
            value: {
              editReason: 'Corrected Teamwork rating after calibration meeting',
              periodLabel: '2026',
              qualitativeEvaluation: QUALITATIVE_EXAMPLE
            }
          }
        }
      }
    }
  };
}

export const phaseTwoScorecardEditingSwaggerPaths = {
  '/performance/scorecards/{scorecardId}': {
    get: {
      tags: TAG,
      summary: 'Load persisted scorecard by id (any type)',
      description:
        'Phase two — Scorecard editing: load any persisted scorecard by `scorecardId`. ' +
        'Use response `qualitativeSections` / `document.qualitativeSections` to populate the edit form. ' +
        'Matrix rows and scores are read-only on save.',
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
      summary: 'Save qualitative edits by scorecard id',
      description: 'Phase two — Scorecard editing: qualitative-only correction by scorecard id (any type).',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'scorecardId', required: true, schema: { type: 'string' } }
      ],
      requestBody: editRequestBody('Universal edit by persisted scorecard id.'),
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/employee/{employeeId}/persisted': {
    get: {
      tags: TAG,
      summary: 'Load persisted employee scorecard',
      description:
        'Phase two — Scorecard editing: load saved **employee** scorecard for `employeeId` + period.',
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
      summary: 'Save employee scorecard qualitative edits',
      description: 'Phase two — Scorecard editing: **employee** qualitative-only correction.',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'employeeId', required: true, schema: { type: 'string' } }],
      requestBody: editRequestBody(
        'Employee scope: resolves latest DRAFT or FINAL scorecard for the employee + period.'
      ),
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/department/{department}/persisted': {
    get: {
      tags: TAG,
      summary: 'Load persisted department scorecard',
      description: 'Phase two — Scorecard editing: load saved **department** scorecard by name + period.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'department', required: true, schema: { type: 'string', example: 'Finance' } },
        { in: 'query', name: 'periodLabel', schema: { type: 'string', example: '2026' } }
      ],
      responses: { 200: JSON_200, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/department/{department}/edit': {
    put: {
      tags: TAG,
      summary: 'Save department scorecard qualitative edits',
      description: 'Phase two — Scorecard editing: **department** Head qualitative grid only.',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'department', required: true, schema: { type: 'string' } }],
      requestBody: editRequestBody(
        'Department scope: department name in path + period in body/query.'
      ),
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/department/by-id/{departmentId}/persisted': {
    get: {
      tags: TAG,
      summary: 'Load persisted department scorecard by id',
      description: 'Phase two — Scorecard editing: department scorecard by org `departmentId` + period.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'departmentId', required: true, schema: { type: 'string' } },
        { in: 'query', name: 'periodLabel', schema: { type: 'string', example: '2026' } }
      ],
      responses: { 200: JSON_200, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/department/by-id/{departmentId}/edit': {
    put: {
      tags: TAG,
      summary: 'Save department scorecard qualitative edits by id',
      description: 'Phase two — Scorecard editing: **department** qualitative-only by `departmentId`.',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'departmentId', required: true, schema: { type: 'string' } }],
      requestBody: editRequestBody('Department scope: `departmentId` in path.'),
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/ceo/persisted': {
    get: {
      tags: TAG,
      summary: 'Load persisted CEO scorecard',
      description: 'Phase two — Scorecard editing: single saved **CEO** scorecard for the period.',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'query', name: 'periodLabel', schema: { type: 'string', example: '2026' } }],
      responses: { 200: JSON_200, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/ceo/edit': {
    put: {
      tags: TAG,
      summary: 'Save CEO scorecard qualitative edits',
      description: 'Phase two — Scorecard editing: **CEO** contract qualitative grid only (one per period).',
      security: [{ bearerAuth: [] }],
      requestBody: editRequestBody(
        'CEO scope: one scorecard per period; period via `periodLabel` or `periodStart`/`periodEnd`.'
      ),
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/board/persisted': {
    get: {
      tags: TAG,
      summary: 'Load persisted Board scorecard',
      description: 'Phase two — Scorecard editing: single saved **Board** scorecard for the period.',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'query', name: 'periodLabel', schema: { type: 'string', example: '2026' } }],
      responses: { 200: JSON_200, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/board/edit': {
    put: {
      tags: TAG,
      summary: 'Save Board scorecard qualitative edits',
      description: 'Phase two — Scorecard editing: **Board** qualitative grid only.',
      security: [{ bearerAuth: [] }],
      requestBody: editRequestBody('Board scope: one scorecard per period.'),
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    }
  }
};
