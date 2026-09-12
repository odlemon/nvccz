/**
 * Phase 2 scorecard manual editing — dedicated OpenAPI paths.
 * Merged into the main spec under tag **Phase two Scorecard Editing** only.
 *
 * Swagger scope (by product request): employee, department-by-name, CEO, board only.
 * Universal scorecardId and department-by-id lookups are live API routes but omitted here.
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

const TRAINING_ENTRY_SCHEMA = {
  type: 'object',
  required: ['courseOrProgram'],
  properties: {
    courseOrProgram: {
      type: 'string',
      description: 'Training course, workshop, or development programme name',
      example: 'Leadership Excellence Programme'
    },
    provider: {
      type: 'string',
      description: 'Training provider or internal department',
      example: 'NVCCZ Academy'
    },
    plannedStartDate: { type: 'string', format: 'date', example: '2026-01-15' },
    plannedEndDate: { type: 'string', format: 'date', example: '2026-03-30' },
    status: {
      type: 'string',
      enum: ['Planned', 'In Progress', 'Completed'],
      example: 'Completed'
    },
    notes: {
      type: 'string',
      example: 'Completed Q1 workshop; applied learnings in team stand-ups.'
    }
  }
};

const INTERVENTION_ENTRY_SCHEMA = {
  type: 'object',
  required: ['type', 'description'],
  properties: {
    type: {
      type: 'string',
      enum: ['Coaching', 'Mentoring', 'Performance Improvement Plan', 'Training', 'Other'],
      example: 'Coaching'
    },
    description: {
      type: 'string',
      example: 'Monthly 1:1 coaching sessions with line manager on teamwork and communication'
    },
    startDate: { type: 'string', format: 'date', example: '2026-02-01' },
    endDate: { type: 'string', format: 'date', example: '2026-11-30' },
    outcome: {
      type: 'string',
      example: 'Target: lift Teamwork rating from Satisfactory to Very Good by year end'
    }
  }
};

const TRAINING_AND_DEVELOPMENT_EXAMPLE = {
  beginningOfCycle: [
    {
      courseOrProgram: 'Leadership Excellence Programme',
      provider: 'NVCCZ Academy',
      plannedStartDate: '2026-01-15',
      plannedEndDate: '2026-03-30',
      status: 'Completed',
      notes: 'Completed Q1 workshop; focus on delegation and team coaching.'
    },
    {
      courseOrProgram: 'IFRS Update Seminar',
      provider: 'CIGFARO',
      plannedStartDate: '2026-04-10',
      plannedEndDate: '2026-04-10',
      status: 'Completed',
      notes: 'One-day seminar on latest reporting standards.'
    }
  ],
  endOfCycle: [
    {
      courseOrProgram: 'Advanced Financial Modelling',
      provider: 'External Training Partner',
      plannedStartDate: '2026-09-01',
      plannedEndDate: '2026-11-15',
      status: 'Planned',
      notes: 'Scheduled for Q4; prerequisite for senior analyst promotion track.'
    },
    {
      courseOrProgram: 'Project Management Professional (PMP) Prep',
      provider: 'NVCCZ Academy',
      plannedStartDate: '2026-10-01',
      plannedEndDate: '2026-12-15',
      status: 'Planned',
      notes: 'End-of-cycle certification target aligned with development plan.'
    }
  ],
  interventions: [
    {
      type: 'Coaching',
      description: 'Monthly 1:1 coaching sessions with line manager on teamwork and communication',
      startDate: '2026-02-01',
      endDate: '2026-11-30',
      outcome: 'Improved Teamwork rating after Q3 calibration'
    },
    {
      type: 'Mentoring',
      description: 'Shadow Head of Department on budget review and variance analysis cycles',
      startDate: '2026-06-01',
      endDate: '2026-08-31',
      outcome: 'Strengthened judgement in decision making for year-end close'
    }
  ]
};

/** One selected rating per row — full 10×5 grid for frontend copy/paste. */
function buildPersonalAttributesGridExample() {
  return EMPLOYEE_PERSONAL_ATTRIBUTES.map((attribute, rowIndex) => ({
    attribute,
    columns: EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS.map((label, colIndex) => ({
      label,
      selected: colIndex === rowIndex % EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS.length
    }))
  }));
}

const QUALITATIVE_EVALUATION_EXAMPLE = {
  personalAttributes: buildPersonalAttributesGridExample(),
  trainingAndDevelopment: TRAINING_AND_DEVELOPMENT_EXAMPLE
};

const QUALITATIVE_EVALUATION_SCHEMA = {
  type: 'object',
  required: ['personalAttributes'],
  description:
    'Qualitative personal-attributes grid (10 rows × 5 rating columns). Exactly one `selected: true` per row when a rating is set.',
  example: QUALITATIVE_EVALUATION_EXAMPLE,
  properties: {
    personalAttributes: {
      type: 'array',
      minItems: 10,
      description: 'All 10 standard personal-attribute rows; send the full grid when saving.',
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
                selected: {
                  type: 'boolean',
                  nullable: true,
                  description: 'Exactly one `true` per row when rated'
                }
              }
            }
          }
        }
      }
    },
    trainingAndDevelopment: {
      type: 'object',
      description: 'Training & development plan sections stored on the contract qualitative template.',
      example: TRAINING_AND_DEVELOPMENT_EXAMPLE,
      properties: {
        beginningOfCycle: {
          type: 'array',
          description: 'Training planned or completed at the start of the performance cycle',
          items: TRAINING_ENTRY_SCHEMA,
          example: TRAINING_AND_DEVELOPMENT_EXAMPLE.beginningOfCycle
        },
        endOfCycle: {
          type: 'array',
          description: 'Training planned or completed toward the end of the performance cycle',
          items: TRAINING_ENTRY_SCHEMA,
          example: TRAINING_AND_DEVELOPMENT_EXAMPLE.endOfCycle
        },
        interventions: {
          type: 'array',
          description: 'Coaching, mentoring, PIP, or other development interventions during the cycle',
          items: INTERVENTION_ENTRY_SCHEMA,
          example: TRAINING_AND_DEVELOPMENT_EXAMPLE.interventions
        }
      }
    }
  }
};

function buildEditPayloadExample(overrides: {
  editReason: string;
  periodLabel?: string;
  department?: string;
}) {
  return {
    editReason: overrides.editReason,
    periodLabel: overrides.periodLabel ?? '2026',
    ...(overrides.department ? { department: overrides.department } : {}),
    qualitativeEvaluation: QUALITATIVE_EVALUATION_EXAMPLE
  };
}

function editRequestBody(
  scopeNote: string,
  payloadExample: Record<string, unknown>
) {
  return {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['editReason', 'qualitativeEvaluation'],
          description: scopeNote + ' ' + NOT_EDITABLE_NOTE,
          example: payloadExample,
          properties: {
            editReason: {
              type: 'string',
              description: 'Mandatory correction reason (audit + documentPayload.manualCorrection.reason)',
              example: payloadExample.editReason
            },
            periodLabel: { type: 'string', example: payloadExample.periodLabel ?? '2026' },
            periodStart: { type: 'string', format: 'date-time', example: '2026-01-01T00:00:00.000Z' },
            periodEnd: { type: 'string', format: 'date-time', example: '2026-12-31T23:59:59.999Z' },
            department: {
              type: 'string',
              description: 'Optional when department name is already in the path',
              example: 'Finance'
            },
            qualitativeEvaluation: QUALITATIVE_EVALUATION_SCHEMA
          }
        },
        example: payloadExample,
        examples: {
          fullQualitativePayload: {
            summary: 'Complete qualitative edit (grid + training sections)',
            description:
              'Copy this structure: 10 personal-attribute rows (one tick per row) plus populated beginningOfCycle, endOfCycle, and interventions arrays.',
            value: payloadExample
          }
        }
      }
    }
  };
}

export const phaseTwoScorecardEditingSwaggerPaths = {
  '/performance/scorecards/employee/{employeeId}/persisted': {
    get: {
      tags: TAG,
      summary: 'Load persisted employee scorecard',
      description:
        'Phase two — Scorecard editing: load saved **employee** scorecard for `employeeId` + period. ' +
        'Use `data.qualitativeSections` or `data.document.qualitativeSections` to populate the edit form.',
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
        'Employee scope: resolves latest DRAFT or FINAL scorecard for the employee + period.',
        buildEditPayloadExample({
          editReason: 'Corrected Teamwork and Communication Skills ratings after manager calibration',
          periodLabel: '2026'
        })
      ),
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    }
  },

  '/performance/scorecards/department/{department}/persisted': {
    get: {
      tags: TAG,
      summary: 'Load persisted department scorecard',
      description:
        'Phase two — Scorecard editing: load saved **department** scorecard by department **name** + period.',
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
      description:
        'Phase two — Scorecard editing: **department** Head qualitative grid only (lookup by department **name**).',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'department', required: true, schema: { type: 'string', example: 'Finance' } }],
      requestBody: editRequestBody(
        'Department scope: department name in path + period in body/query.',
        buildEditPayloadExample({
          editReason: 'Corrected HOD Leadership and Management rating after board review',
          periodLabel: '2026',
          department: 'Finance'
        })
      ),
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
        'CEO scope: one scorecard per period; period via `periodLabel` or `periodStart`/`periodEnd`.',
        buildEditPayloadExample({
          editReason: 'Corrected CEO Ethics and Judgement ratings after board chair review',
          periodLabel: '2026'
        })
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
      requestBody: editRequestBody(
        'Board scope: one scorecard per period.',
        buildEditPayloadExample({
          editReason: 'Corrected Board collective governance qualitative ratings',
          periodLabel: '2026'
        })
      ),
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401, 404: JSON_404 }
    }
  }
};
