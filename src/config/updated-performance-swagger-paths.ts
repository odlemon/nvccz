/**
 * Paths merged into the main OpenAPI spec so **Updated performance** lists BSC data entry,
 * BSC workflow, performance **contract setup**, and **scorecard generate** (persist draft) APIs when swagger-jsdoc omits them.
 * Server `url` in swagger ends with `/api` — paths here are **without** a second `/api` prefix.
 *
 * Descriptions are written for **frontend** form design: fields, optional aliases, and responses.
 */

const AUDIT =
  'Optional **responsibleUserId** (string): if set, attributes the entry to that user for audit; otherwise the JWT user is used.';

const PERIOD_FIELDS =
  '**Period / reporting:** optional **frequency**, **periodLabel**, **periodStart**, **periodEnd** (ISO dates where applicable) to label the submission for scorecards and history.';

const JSON_200 = {
  description:
    '`{ success: true, ... }` — payload includes service-specific fields (e.g. updated KPI snapshot). `{ success: false, message }` on validation errors.'
};
const JSON_400 = { description: 'Validation or business rule error — `{ success: false, message: string }`' };
const JSON_401 = { description: 'Missing or invalid JWT' };
const JSON_201 = {
  description:
    '`{ success: true, data: ... }` or `{ success: true, ... }` per handler. `{ success: false, message }` on error.'
};

const JSON_403 = { description: 'Forbidden or unauthenticated — viewer cannot perform this action (service layer).' };

/** JSON body for `POST /performance/scorecards/.../generate` (persist draft). Usually `{}`. */
const SCORECARD_GENERATE_REQUEST_SCHEMA = {
  type: 'object',
  description:
    'Optional period window; omit `{}` or send `{}` to infer from the active performance contract. **sectionBlendMode** applies to **Board** and **CEO** generate only.',
  properties: {
    periodStart: { type: 'string', format: 'date-time' },
    periodEnd: { type: 'string', format: 'date-time' },
    periodLabel: { type: 'string', example: '2026' },
    sectionBlendMode: {
      type: 'string',
      enum: ['redistribute', 'penalise'],
      description:
        '**Board & CEO:** `redistribute` (default) — omit non-scoreable sections from blend and re-normalise; `penalise` — legacy behaviour where zero-weight sections still drag the final score.'
    },
    departmentId: {
      type: 'string',
      description:
        '**Department generate only:** when set, resolves the department by id instead of the `{department}` path segment (same as standalone dept-by-id generate route).'
    }
  }
};

/** Shared partial-update body for KPI catalog (PATCH/PUT). */
const KPI_CATALOG_UPDATE_SCHEMA = {
  type: 'object',
  description:
    'Partial update — send only fields to change. **catalogDepartmentName** (non-empty) resolves **departmentId** from `departments.name`; null/empty clears department link.',
  properties: {
    name: { type: 'string' },
    type: { type: 'string', enum: ['Metric', 'Percentage'] },
    departmentId: {
      type: 'string',
      nullable: true,
      description: 'Optional when not updating via catalogDepartmentName; must match resolved id if both sent'
    },
    isReverseKpi: { type: 'boolean' },
    weightValue: { type: 'number' },
    hasUnit: { type: 'boolean' },
    unitCategory: { type: 'string' },
    unit: { type: 'string' },
    unitSymbol: { type: 'string' },
    unitPosition: { type: 'string', enum: ['prefix', 'suffix'] },
    isActive: { type: 'boolean' },
    code: { type: 'string' },
    description: { type: 'string', description: 'Maps to catalog_description' },
    catalogDepartmentName: {
      type: 'string',
      nullable: true,
      description: 'Exact departments.name; sets departmentId when non-empty; null/empty clears'
    },
    accountType: {
      type: 'string',
      enum: ['Revenue', 'Expense', 'Asset', 'Liability', 'Equity']
    },
    accountNumber: { type: 'string', nullable: true },
    journalEntryType: { type: 'string', enum: ['Debit', 'Credit'] },
    isFinancial: { type: 'boolean' }
  }
};

/** OpenAPI path item for POST create — path **`/kpis`** (relative to server URL ending in `/api`). */
const KPI_CATALOG_POST_PATH_ITEM: Record<string, unknown> = {
  post: {
    tags: ['performance-kpis'],
    summary: 'Create a KPI (database catalog)',
    description:
      'Persists **`kpis`** including catalog metadata aligned with **`hardcodedKPIs.ts`**. **`catalogDepartmentName`** must equal **`departments.name`** exactly; the server sets **`departmentId`** from that row (omit conflicting `departmentId`). When **isFinancial** is true, **accountNumber** is required for GL posting. **GET** list/detail for the DB catalog is on this **`/kpis`** path; hardcoded reference **GET**s are under **`/performance/kpis`** (see **📊 Hardcoded KPIs**).',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: [
              'name',
              'type',
              'isReverseKpi',
              'weightValue',
              'hasUnit',
              'unitCategory',
              'unit',
              'unitSymbol',
              'unitPosition',
              'code',
              'description',
              'catalogDepartmentName',
              'accountType',
              'journalEntryType',
              'isFinancial'
            ],
            properties: {
              name: { type: 'string' },
              type: { type: 'string', enum: ['Metric', 'Percentage'] },
              isReverseKpi: {
                type: 'boolean',
                description: 'Lower actual is better — goals linked by kpiName default to reverse scoring'
              },
              weightValue: { type: 'number' },
              hasUnit: { type: 'boolean' },
              unitCategory: { type: 'string' },
              unit: { type: 'string' },
              unitSymbol: { type: 'string' },
              unitPosition: { type: 'string', enum: ['prefix', 'suffix'] },
              code: { type: 'string', example: 'TRAINING_EXPENSE' },
              description: { type: 'string', description: 'Long description (stored as catalog_description)' },
              catalogDepartmentName: {
                type: 'string',
                example: 'Human Resources',
                description: 'Exact `departments.name`; server sets `departmentId`'
              },
              accountType: {
                type: 'string',
                enum: ['Revenue', 'Expense', 'Asset', 'Liability', 'Equity']
              },
              accountNumber: {
                type: 'string',
                nullable: true,
                description: 'Chart / GL identifier for journal lines; required when isFinancial is true'
              },
              journalEntryType: { type: 'string', enum: ['Debit', 'Credit'] },
              isFinancial: { type: 'boolean' }
            },
            example: {
              name: 'Training Expense',
              type: 'Metric',
              isReverseKpi: true,
              weightValue: 1,
              hasUnit: true,
              unitCategory: 'Currency',
              unit: 'USD',
              unitSymbol: '$',
              unitPosition: 'prefix',
              code: 'TRAINING_EXPENSE',
              description: 'Employee training and development costs',
              catalogDepartmentName: 'Human Resources',
              accountType: 'Expense',
              accountNumber: '5090',
              journalEntryType: 'Debit',
              isFinancial: true
            }
          }
        }
      }
    },
    responses: { 201: JSON_201, 400: JSON_400, 401: JSON_401 }
  }
};

/** OpenAPI path item for PATCH/PUT/DELETE by id — path **`/kpis/{id}`**. */
const KPI_CATALOG_BY_ID_PATH_ITEM: Record<string, unknown> = {
  patch: {
    tags: ['performance-kpis'],
    summary: 'Update a KPI (database catalog)',
    description:
      '**Edit** catalog KPIs. Same behavior as **PUT** `/kpis/{id}`. If **catalogDepartmentName** is sent (non-empty), **`departmentId`** is set from `departments.name`. Send **catalogDepartmentName** empty or null to clear department.',
    security: [{ bearerAuth: [] }],
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    requestBody: {
      content: {
        'application/json': {
          schema: KPI_CATALOG_UPDATE_SCHEMA,
          examples: {
            renameAndDept: {
              summary: 'Rename + move department',
              value: {
                name: 'Training Expense (revised)',
                catalogDepartmentName: 'Human Resources',
                isActive: true
              }
            },
            full: {
              summary: 'Touch all catalog fields',
              value: {
                name: 'Training Expense',
                type: 'Metric',
                isReverseKpi: true,
                weightValue: 1,
                hasUnit: true,
                unitCategory: 'Currency',
                unit: 'USD',
                unitSymbol: '$',
                unitPosition: 'prefix',
                code: 'TRAINING_EXPENSE',
                description: 'Employee training and development costs',
                catalogDepartmentName: 'Human Resources',
                accountType: 'Expense',
                accountNumber: '5090',
                journalEntryType: 'Debit',
                isFinancial: true,
                isActive: true
              }
            }
          }
        }
      }
    },
    responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
  },
  put: {
    tags: ['performance-kpis'],
    summary: 'Update a KPI (database catalog) — PUT alias',
    description:
      'Same handler and body as **PATCH**. Use when your HTTP client prefers **PUT**.',
    security: [{ bearerAuth: [] }],
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    requestBody: {
      content: {
        'application/json': {
          schema: KPI_CATALOG_UPDATE_SCHEMA,
          examples: {
            partial: {
              summary: 'Partial update',
              value: { name: 'Renamed KPI', isActive: false }
            }
          }
        }
      }
    },
    responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
  },
  delete: {
    tags: ['performance-kpis'],
    summary: 'Delete a KPI (database catalog)',
    description:
      'Deletes the **`kpis`** row. Same handler as **`DELETE /api/kpis/{id}`** and **`DELETE /api/performance/kpis/{id}`** in the app. Fails if linked data prevents delete (per service).',
    security: [{ bearerAuth: [] }],
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: {
      200: JSON_200,
      400: JSON_400,
      401: JSON_401,
      404: { description: 'KPI not found' }
    }
  }
};

export const updatedPerformanceSwaggerPaths: Record<string, Record<string, unknown>> = {
  '/performance/bsc-entry/financial-outcome-roi': {
    post: {
      tags: ['Updated performance'],
      summary: 'Record financial outcome ROI for a goal',
      description: `**Purpose:** Submit **return on investment** inputs for a BSC financial goal — net profit vs capital invested for the period, used to drive the ROI KPI.\n\n**UI:** Form tied to a selected **performance goal** (financial / ROI measure). Collect period range and currency.\n\n**Body (JSON):** **goalId** (required). **netProfit**, **totalCapitalInvested** (numbers). ${PERIOD_FIELDS} **currencyCode** (e.g. USD). **skipCeoBoardMirror** (boolean, optional): when true, skips mirroring to CEO/board goal copies if your process requires it.\n\n${AUDIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string', description: 'Performance goal ID (BSC goal being updated)' },
                netProfit: { type: 'number' },
                totalCapitalInvested: { type: 'number' },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' },
                periodStart: { type: 'string', format: 'date' },
                periodEnd: { type: 'string', format: 'date' },
                currencyCode: { type: 'string' },
                skipCeoBoardMirror: { type: 'boolean' },
                responsibleUserId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-entry/internal-process-funding-rate': {
    post: {
      tags: ['Updated performance'],
      summary: 'Record internal process funding rate (projects funded vs approved)',
      description: `**Purpose:** Capture how many projects were **funded** vs **approved** in the period, plus optional fund scope — feeds the internal-process / funding-efficiency KPI.\n\n**UI:** Numeric inputs for counts; optional **fundId** filter when the goal is fund-scoped.\n\n**Body (JSON):** **goalId** (required). **projectsFunded**, **projectsApproved** (numbers). Optional **fundId**. Optional **targetPercent**. ${PERIOD_FIELDS}\n\n${AUDIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string' },
                projectsFunded: { type: 'number' },
                projectsApproved: { type: 'number' },
                fundId: { type: 'string' },
                targetPercent: { type: 'number' },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' },
                periodStart: { type: 'string', format: 'date' },
                periodEnd: { type: 'string', format: 'date' },
                responsibleUserId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-entry/stakeholder-survey': {
    post: {
      tags: ['Updated performance'],
      summary: 'Record stakeholder survey average vs scale (and optional prior period)',
      description: `**Purpose:** Store **average survey score** and the **max scale** (e.g. 5-point scale) so the backend can compute ratios and trends; optional **previous** average for period-over-period UI.\n\n**Body (JSON):** **goalId** (required). Score fields — server accepts aliases: **averageScore** or **surveyAverageScore** or **meanScore**. Total scale: **scoreTotal** or **scaleMaximum** or **totalScalePoints** or **maxScore**. Previous period: **previousAverageScore** or **previousSurveyAverageScore** or **previousMeanScore**. ${PERIOD_FIELDS}\n\n${AUDIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string' },
                averageScore: { type: 'number', description: 'Alias: surveyAverageScore, meanScore' },
                scoreTotal: { type: 'number', description: 'Max scale; aliases: scaleMaximum, totalScalePoints, maxScore' },
                previousAverageScore: { type: 'number' },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' },
                periodStart: { type: 'string', format: 'date' },
                periodEnd: { type: 'string', format: 'date' },
                responsibleUserId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-entry/partnerships-signed': {
    post: {
      tags: ['Updated performance'],
      summary: 'Record partnerships / MoUs signed (file upload or URL)',
      description: `**Purpose:** Increment or record **signed partnership (MoU)** progress for a goal; attach proof document.\n\n**UI:** Either upload a PDF/document **or** paste an existing storage URL. Do not require both.\n\n**multipart/form-data:** **goalId** (required, text field). **mouFile** (optional file) — uploaded to Firebase and stored as MOU evidence. Alternatively pass **signedMouDocumentUrl** or **mouDocumentUrl** (text) if the file is already hosted. Optional **incrementBy** (number). ${PERIOD_FIELDS}\n\n${AUDIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string' },
                mouFile: { type: 'string', format: 'binary', description: 'Single file; optional if URL provided' },
                signedMouDocumentUrl: { type: 'string' },
                mouDocumentUrl: { type: 'string' },
                incrementBy: { type: 'number' },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' },
                responsibleUserId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-entry/service-delivery-customer-charter': {
    post: {
      tags: ['Updated performance'],
      summary: 'Service delivery — customer charter progress + evidence uploads',
      description: `**Purpose:** Record **charter availability** (e.g. local languages) and **progress percent**, with supporting documents.\n\n**UI:** Toggle for charter in local languages; number for **addPercent**; file dropzone (multiple) and/or paste URLs.\n\n**multipart/form-data:** **goalId** (required). **addPercent** (number). **charterAvailableLocalLanguages** (boolean). **supportingDocuments** — up to **10** files (array field name as used by multer). Alternatively send **supportingDocumentUrls** as JSON array or single string in form fields. Files upload to Firebase and URLs are merged server-side.\n\n${AUDIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string' },
                addPercent: { type: 'number' },
                charterAvailableLocalLanguages: { type: 'boolean' },
                supportingDocuments: {
                  type: 'array',
                  items: { type: 'string', format: 'binary' },
                  description: 'Up to 10 files'
                },
                supportingDocumentUrls: {
                  oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }]
                },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' },
                responsibleUserId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-entry/jobs-created-aggregate': {
    post: {
      tags: ['Updated performance'],
      summary: 'Jobs created — aggregate count (optional fund / status filters)',
      description: `**Purpose:** Submit **total full-time jobs created** linked to the goal, optionally scoped to a **fund** and excluding certain deal statuses.\n\n**Body (JSON):** **goalId** (required). **totalFullTimeJobs** (number). Optional **fundId**. Optional **excludeStatuses** (string array) — e.g. exclude cancelled deals from the aggregate. ${PERIOD_FIELDS}\n\n${AUDIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string' },
                totalFullTimeJobs: { type: 'number' },
                fundId: { type: 'string' },
                excludeStatuses: { type: 'array', items: { type: 'string' } },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' },
                responsibleUserId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-entry/resource-budget-alignment': {
    post: {
      tags: ['Updated performance'],
      summary: 'Resource budget alignment — spend vs strategic allocation',
      description: `**Purpose:** Compare **actual spend** to **strategic allocation** and optional **critical overspend** threshold for the BSC financial discipline KPI.\n\n**Body (JSON):** **goalId** (required). **actualSpend**, **strategicAllocation**, **criticalOverspendPercent** (numbers). **currencyCode**. ${PERIOD_FIELDS}\n\n${AUDIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string' },
                actualSpend: { type: 'number' },
                strategicAllocation: { type: 'number' },
                criticalOverspendPercent: { type: 'number' },
                currencyCode: { type: 'string' },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' },
                periodStart: { type: 'string', format: 'date' },
                periodEnd: { type: 'string', format: 'date' },
                responsibleUserId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-entry/inclusion-diversity-reporting': {
    post: {
      tags: ['Updated performance'],
      summary: 'Inclusion and diversity — group count breakdown',
      description: `**Purpose:** Submit a **groupCounts** object (e.g. by gender, role, or other dimensions your UI collects) for diversity reporting KPIs.\n\n**Body (JSON):** **goalId** (required). **groupCounts** (object, optional empty) — keys are dimension labels, values are counts. ${PERIOD_FIELDS}\n\n${AUDIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string' },
                groupCounts: { type: 'object', additionalProperties: { type: 'number' } },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' },
                responsibleUserId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-entry/accounting-period-from-gl': {
    post: {
      tags: ['Updated performance'],
      summary: 'Pull accounting period totals from GL into revenue / net-profit goals',
      description: `**Purpose:** **SRD / Flow 1** — post **period boundaries** and optional **revenueGoalId** / **netProfitGoalId** so the service can pull GL-derived totals and push values into those goals (no **goalId** on the root — goals are explicit links).\n\n**Body (JSON):** **periodStart**, **periodEnd** (required for the GL window). Optional **revenueGoalId**, **netProfitGoalId**. **currencyCode**. ${PERIOD_FIELDS}\n\n${AUDIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                periodStart: { type: 'string', format: 'date' },
                periodEnd: { type: 'string', format: 'date' },
                revenueGoalId: { type: 'string' },
                netProfitGoalId: { type: 'string' },
                currencyCode: { type: 'string' },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' },
                responsibleUserId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-entry/statutory-reports-output': {
    post: {
      tags: ['Updated performance'],
      summary: 'Statutory reports filed — evidence file or URL',
      description: `**Purpose:** Record progress on **statutory reporting** output for a goal (count/ increment) with mandatory evidence link or upload.\n\n**UI:** File upload **or** evidence URL field.\n\n**multipart/form-data:** **goalId** (required). **evidenceFile** (optional binary) OR **evidenceDocumentUrl** / **documentUrl**. Optional **incrementBy**. ${PERIOD_FIELDS}\n\n${AUDIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string' },
                evidenceFile: { type: 'string', format: 'binary' },
                evidenceDocumentUrl: { type: 'string' },
                documentUrl: { type: 'string' },
                incrementBy: { type: 'number' },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' },
                responsibleUserId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-entry/governance-checklist-score': {
    post: {
      tags: ['Updated performance'],
      summary: 'Governance checklist — items met vs total requirements',
      description: `**Purpose:** Capture **compliance score** as count of items met vs total governance requirements for the period.\n\n**Body (JSON):** **goalId** (required). **complianceItemsMet** or alias **itemsMet**. **totalGovernanceRequirements** or aliases **totalItems**, **requirementsTotal**. ${PERIOD_FIELDS}\n\n${AUDIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string' },
                complianceItemsMet: { type: 'number' },
                totalGovernanceRequirements: { type: 'number' },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' },
                responsibleUserId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-entry/procurement-plan-compliance': {
    post: {
      tags: ['Updated performance'],
      summary: 'Procurement plan compliance — actual vs annual plan value',
      description: `**Purpose:** Compare **actual procurement** closed in the period to **annual planned** approved value (compliance ratio KPI).\n\n**Body (JSON):** **goalId** (required). **actualProcured** or alias **closedPurchaseOrdersValue**. **annualPlanned** or alias **approvedAnnualPlanValue**. **currencyCode**. ${PERIOD_FIELDS}\n\n${AUDIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string' },
                actualProcured: { type: 'number' },
                annualPlanned: { type: 'number' },
                currencyCode: { type: 'string' },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' },
                responsibleUserId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-entry/ease-of-doing-business-progress': {
    post: {
      tags: ['Updated performance'],
      summary: 'Ease of doing business — innovations completed vs target',
      description: `**Purpose:** Track **innovations or reforms completed** against an annual/quarterly **target** for the EoDB KPI.\n\n**Body (JSON):** **goalId** (required). **innovationsCompleted** or alias **completedCount**. **targetInnovations** or alias **targetCount**. ${PERIOD_FIELDS}\n\n${AUDIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string' },
                innovationsCompleted: { type: 'number' },
                targetInnovations: { type: 'number' },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' },
                responsibleUserId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-entry/skills-development-progress': {
    post: {
      tags: ['Updated performance'],
      summary: 'Skills development — certificates completed vs plan target',
      description: `**Purpose:** Manual entry path for **training/skills KPI** — completed count vs plan target (HR systems may also call the workflow **training-certificate-recorded** endpoint).\n\n**Body (JSON):** **goalId** (required). **completedCount** or aliases **certificatesApproved**. **targetCount** or aliases **planTargetCount**. ${PERIOD_FIELDS}\n\n${AUDIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string' },
                completedCount: { type: 'number' },
                targetCount: { type: 'number' },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' },
                responsibleUserId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-entry/csr-participation-rate': {
    post: {
      tags: ['Updated performance'],
      summary: 'CSR participation — attended vs eligible participants',
      description: `**Purpose:** Capture **CSR event participation** as counts of people who completed vs eligible for the period (rate = completed/eligible).\n\n**Body (JSON):** **goalId** (required). **participantsCompleted** or alias **attendedCount**. **participantsEligible** or alias **eligibleCount**. ${PERIOD_FIELDS}\n\n${AUDIT}`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string' },
                participantsCompleted: { type: 'number' },
                participantsEligible: { type: 'number' },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' },
                responsibleUserId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-workflow/budget-variance-reports': {
    post: {
      tags: ['Updated performance'],
      summary: 'Create a budget variance report (narrative + optional financials)',
      description: `**Purpose:** User submits a **variance narrative** for a performance goal (explaining spend vs plan). Creates a persisted row for managers to review.\n\n**UI:** Rich text or textarea for **narrative**; optional numeric **actualSpend** / **strategicAllocation** and period fields. Goal picker sends **performanceGoalId** or **goalId**.\n\n**Body (JSON):** **performanceGoalId** or **goalId** (required). **narrative** or alias **varianceAnalysis** (long text). Optional **periodLabel**, **periodStart**, **periodEnd**, **actualSpend**, **strategicAllocation**. Submitter is the JWT user (**submittedById** server-side).\n\n**Response:** **201** \`{ success: true, data }\` — the created report row.`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                performanceGoalId: { type: 'string' },
                goalId: { type: 'string' },
                narrative: { type: 'string' },
                varianceAnalysis: { type: 'string' },
                periodLabel: { type: 'string' },
                periodStart: { type: 'string', format: 'date' },
                periodEnd: { type: 'string', format: 'date' },
                actualSpend: { type: 'number' },
                strategicAllocation: { type: 'number' }
              }
            }
          }
        }
      },
      responses: { 201: JSON_201, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-workflow/budget-variance-reports/by-goal/{goalId}': {
    get: {
      tags: ['Updated performance'],
      summary: 'List budget variance reports for a goal',
      description:
        '**Purpose:** Load all **budget variance reports** submitted for the given **performance goal** (newest-first is typical for display — confirm with API payload order). Use on a goal detail / variance history screen.\n\n**Response:** **200** `{ success: true, data: array }` — each item is a stored variance row (narrative, period, submitter, etc.).',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'goalId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Performance goal ID'
        }
      ],
      responses: {
        200: {
          description: '`{ success: true, data: BudgetVarianceReport[] }`'
        },
        400: JSON_400,
        401: JSON_401,
        500: { description: 'Server error' }
      }
    }
  },

  '/performance/bsc-workflow/statutory-submissions': {
    post: {
      tags: ['Updated performance'],
      summary: 'Submit statutory submission bundle (evidence + counters)',
      description: `**Purpose:** Workflow path for **statutory compliance submissions** — creates/updates submission state with **evidence** document (file or URL) and optional increment for filings completed.\n\n**UI:** **goalId** selector; file upload OR URL; optional reporting labels.\n\n**multipart/form-data:** **goalId** (required). **evidenceFile** (optional file) OR **evidenceDocumentUrl** / **documentUrl**. Optional **incrementBy**, **frequency**, **periodLabel**. Uploader is JWT user.\n\n**Response:** **201** \`{ success: true, ... }\` (includes submission payload from service).`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string' },
                evidenceFile: { type: 'string', format: 'binary' },
                evidenceDocumentUrl: { type: 'string' },
                documentUrl: { type: 'string' },
                incrementBy: { type: 'number' },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 201: JSON_201, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-workflow/statutory-submissions/{id}/manager-sign-off': {
    post: {
      tags: ['Updated performance'],
      summary: 'Manager sign-off on a statutory submission',
      description:
        '**Purpose:** **Manager approval step** — records sign-off on a specific statutory submission row (from list-by-goal). **id** is the submission record ID.\n\n**Body (JSON):** optional **note** or **managerSignOffNote** (string) for audit trail.\n\n**Response:** **200** `{ success: true, data }` — updated submission including sign-off fields.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Statutory submission row ID' }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                note: { type: 'string', description: 'Alias: managerSignOffNote' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/bsc-workflow/statutory-submissions/by-goal/{goalId}': {
    get: {
      tags: ['Updated performance'],
      summary: 'List statutory submissions for a goal',
      description:
        '**Purpose:** Populate a **table or timeline** of statutory submissions for one goal — includes evidence links, sign-off status, timestamps (for manager review and employee status views).\n\n**Response:** **200** `{ success: true, data: array }`.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'goalId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: '`{ success: true, data: StatutorySubmission[] }`' },
        400: JSON_400,
        401: JSON_401,
        500: { description: 'Server error' }
      }
    }
  },

  '/performance/bsc-workflow/training-certificate-recorded': {
    post: {
      tags: ['Updated performance'],
      summary: 'HR hook — increment skills KPI when a certificate is approved',
      description: `**Purpose:** **Integration / HR** — when a training certificate is approved, call this to **increment** the skills-development counter on a goal (single atomic bump per approval).\n\n**Body (JSON):** **goalId** (required). Optional **incrementBy** (default 1). ${PERIOD_FIELDS} Actor is JWT user (**responsibleUserId** server-side).\n\n**UI:** Usually not a human form — trigger from HR workflow; if building a manual button, confirm **goalId** and optional increment.`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['goalId'],
              properties: {
                goalId: { type: 'string' },
                incrementBy: { type: 'number', description: 'Default 1' },
                frequency: { type: 'string' },
                periodLabel: { type: 'string' }
              }
            }
          }
        }
      },
      responses: { 200: JSON_200, 400: JSON_400, 401: JSON_401 }
    }
  },

  '/performance/contracts/board': {
    post: {
      tags: ['Updated performance'],
      summary: 'Create Board performance contract (one per calendar year)',
      description: `**Purpose:** **Step 1** — exactly **one** ACTIVE Board PC per **UTC calendar year** for the org. A duplicate POST for the same year returns **409** (not success).\n\n**Period (required):** Send **periodYear** (2000–2100), **or** both **periodStart** and **periodEnd** as **exact** UTC year bounds (Jan 1 00:00:00.000Z – Dec 31 23:59:59.999Z). If both **periodYear** and dates are sent, they must match. Optional **periodLabel** (defaults to the year string).\n\n**UI:** Year picker → **periodYear** is simplest. Optional **title**; optional **subjectUserId**, **reviewerUserId**, **approverUserId**.\n\n**Audit:** Optional **createdById**.`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                subjectUserId: { type: 'string', description: 'Optional board subject user' },
                reviewerUserId: { type: 'string' },
                approverUserId: { type: 'string' },
                periodYear: { type: 'integer', example: 2026, description: 'Preferred: calendar year' },
                periodLabel: { type: 'string', example: '2026' },
                periodStart: { type: 'string', format: 'date-time', description: 'Must pair with periodEnd; exact UTC year start' },
                periodEnd: { type: 'string', format: 'date-time', description: 'Must pair with periodStart; exact UTC year end' },
                createdById: { type: 'string', description: 'Override creator for audit' }
              }
            },
            examples: {
              periodYearOnly: {
                summary: 'Minimal — calendar year 2026',
                value: { periodYear: 2026, periodLabel: '2026' }
              },
              explicitUtcBounds: {
                summary: 'Explicit UTC year bounds (2026)',
                value: {
                  periodStart: '2026-01-01T00:00:00.000Z',
                  periodEnd: '2026-12-31T23:59:59.999Z'
                }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: '`{ success: true, contract, created: true }` — new Board PC created'
        },
        400: JSON_400,
        401: JSON_401,
        409: {
          description:
            '`{ success: false, code: "PERFORMANCE_CONTRACT_DUPLICATE", message, existingContractId, periodYear }` — Board contract already exists for that calendar year'
        }
      }
    }
  },

  '/performance/contracts/ceo': {
    post: {
      tags: ['Updated performance'],
      summary: 'Create CEO performance contract (one per CEO user per calendar year)',
      description: `**Purpose:** **Step 2** — exactly **one** ACTIVE CEO PC per **CEO** per **calendar year**. Duplicate POST → **409**.\n\n**Period:** Same rules as Board — **periodYear** or exact **periodStart**/**periodEnd** (see Board).\n\n**CEO identity:** Omit **subjectUserId** — the server finds the single user whose **role** matches CEO / Chief Executive (same rules as \`isCEO\`). Pass **subjectUserId** only to override (e.g. staging). **400** if none or more than one CEO user matches.\n\n**Optional:** **title**, **reviewerUserId**, **approverUserId**. **Audit:** optional **createdById**.`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                subjectUserId: {
                  type: 'string',
                  description: 'Optional override; if omitted, the org’s CEO user is resolved from roles'
                },
                title: { type: 'string' },
                reviewerUserId: { type: 'string' },
                approverUserId: { type: 'string' },
                periodYear: { type: 'integer', example: 2026 },
                periodLabel: { type: 'string' },
                periodStart: { type: 'string', format: 'date-time' },
                periodEnd: { type: 'string', format: 'date-time' },
                createdById: { type: 'string' }
              }
            },
            examples: {
              autoResolveCeoFromRoles: {
                summary: 'Resolve CEO from roles (recommended)',
                description: 'Single org CEO — omit subjectUserId',
                value: { periodYear: 2026 }
              },
              explicitCeoUserUat: {
                summary: 'Explicit CEO user id (UAT sample)',
                value: {
                  periodYear: 2026,
                  subjectUserId: 'cmhlnqd460001unnslmw98ry8'
                }
              }
            }
          }
        }
      },
      responses: {
        201: { description: '`{ success: true, contract, created: true }`' },
        400: JSON_400,
        401: JSON_401,
        409: {
          description:
            '`{ success: false, code: "PERFORMANCE_CONTRACT_DUPLICATE", message, existingContractId, periodYear }` — CEO contract already exists for that user and year'
        }
      }
    }
  },

  '/performance/contracts/department': {
    post: {
      tags: ['Updated performance'],
      summary: 'Create department performance contract (one per department per calendar year)',
      description: `**Purpose:** **Step 3** — exactly **one** ACTIVE department PC per **departmentName** per **calendar year**. Duplicate POST → **409**.\n\n**Period:** Same as Board (**periodYear** or exact UTC year **periodStart**/**periodEnd**).\n\n**Body:** **departmentName** required. Optional **title**. **Audit:** optional **createdById**.`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['departmentName'],
              properties: {
                departmentName: { type: 'string', example: 'Investments' },
                title: { type: 'string' },
                periodYear: { type: 'integer', example: 2026 },
                periodLabel: { type: 'string' },
                periodStart: { type: 'string', format: 'date-time' },
                periodEnd: { type: 'string', format: 'date-time' },
                createdById: { type: 'string' }
              }
            },
            examples: {
              investmentsDepartment: {
                summary: 'Investments department (org hardcoded list)',
                value: { departmentName: 'Investments', periodYear: 2026 }
              },
              financeDepartment: {
                summary: 'Finance department',
                value: { departmentName: 'Finance', periodYear: 2026 }
              }
            }
          }
        }
      },
      responses: {
        201: { description: '`{ success: true, contract, created: true }`' },
        400: JSON_400,
        401: JSON_401,
        409: {
          description:
            '`{ success: false, code: "PERFORMANCE_CONTRACT_DUPLICATE", message, existingContractId, periodYear }` — department contract already exists for that name and year'
        }
      }
    }
  },

  '/performance/contracts/employee': {
    post: {
      tags: ['Updated performance'],
      summary: 'Create employee performance contract (one per employee per calendar year)',
      description: `**Purpose:** **Step 4** — exactly **one** ACTIVE employee PC per **subjectUserId** per **calendar year**. **404** if user missing. **departmentName** optional (defaults to profile). **firstName** / **lastName** optional for title.\n\n**Period:** Same as Board (**periodYear** or exact UTC year bounds).\n\nDuplicate POST for the same employee + year → **409**.`,
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['subjectUserId'],
              properties: {
                subjectUserId: { type: 'string', example: 'cml7sq9fo000ekt1b5ln2enub' },
                departmentName: { type: 'string', description: 'Override; else user profile department', example: 'Investments' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                periodYear: { type: 'integer', example: 2026 },
                periodLabel: { type: 'string' },
                periodStart: { type: 'string', format: 'date-time' },
                periodEnd: { type: 'string', format: 'date-time' },
                createdById: { type: 'string' }
              }
            },
            examples: {
              nyashaAnalystUat: {
                summary: 'Employee — Nyasha Analyst (Investments) UAT',
                value: {
                  subjectUserId: 'cml7sq9fo000ekt1b5ln2enub',
                  periodYear: 2026
                }
              },
              withDepartmentOverride: {
                summary: 'With explicit department and period label',
                value: {
                  subjectUserId: 'cml7sq9fo000ekt1b5ln2enub',
                  departmentName: 'Investments',
                  periodYear: 2026,
                  periodLabel: '2026'
                }
              }
            }
          }
        }
      },
      responses: {
        201: { description: '`{ success: true, contract, created: true }`' },
        400: JSON_400,
        401: JSON_401,
        404: { description: '`{ success: false, message }` — user not found' },
        409: {
          description:
            '`{ success: false, code: "PERFORMANCE_CONTRACT_DUPLICATE", message, existingContractId, periodYear }` — employee contract already exists for that user and year'
        }
      }
    }
  },

  '/performance/scorecards/employees-for-generation': {
    get: {
      tags: ['Updated performance'],
      summary: 'List employees eligible for employee scorecard generation',
      description:
        'Returns **`users`** who have an **ACTIVE** **EMPLOYEE** performance contract overlapping the requested period (same resolution as other scorecards). **CEO** users are **excluded**. Use the returned **`id`** values as **`{employeeId}`** on **`POST /performance/scorecards/employee/{employeeId}/generate`**. ' +
        PERIOD_FIELDS,
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'periodStart', schema: { type: 'string', format: 'date-time' } },
        { in: 'query', name: 'periodEnd', schema: { type: 'string', format: 'date-time' } },
        { in: 'query', name: 'periodLabel', schema: { type: 'string', example: '2026' } }
      ],
      responses: {
        200: {
          description:
            '`{ success: true, message, data: { period: { periodStart, periodEnd, periodLabel }, employees: [{ id, firstName, lastName, email, userDepartment, departmentRole, roleCode, roleName }] } }`'
        },
        401: JSON_401
      }
    }
  },

  '/performance/scorecards/board/generate': {
    post: {
      tags: ['Updated performance'],
      summary: 'Generate Board performance scorecard (persist draft)',
      description:
        'Upserts a **DRAFT** Board scorecard for the period. Requires an ACTIVE **BOARD** performance contract covering the window (**`POST /performance/contracts/board`**). **201** returns envelope with **`savedRecord`**. Finalise with **`POST /performance/scorecards/{scorecardId}/finalize`**.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: SCORECARD_GENERATE_REQUEST_SCHEMA,
            examples: {
              empty: { summary: 'Infer period from contract', value: {} },
              explicit2026: {
                summary: 'Pin full calendar year (UTC)',
                value: {
                  periodLabel: '2026',
                  periodStart: '2026-01-01T00:00:00.000Z',
                  periodEnd: '2026-12-31T23:59:59.999Z',
                  sectionBlendMode: 'redistribute'
                }
              }
            }
          }
        }
      },
      responses: {
        201: JSON_201,
        400: JSON_400,
        401: JSON_401,
        403: JSON_403,
        404: { description: 'No BOARD contract — e.g. **BOARD_CONTRACT_NOT_FOUND**' }
      }
    }
  },

  '/performance/scorecards/ceo/generate': {
    post: {
      tags: ['Updated performance'],
      summary: 'Generate CEO performance scorecard (persist draft)',
      description:
        'Upserts a **DRAFT** CEO scorecard. Requires an ACTIVE **CEO** contract for the period with indicators linked. Response shape matches CEO envelope (**sections A1–D**, scores, **`savedRecord`**).',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: SCORECARD_GENERATE_REQUEST_SCHEMA,
            examples: {
              empty: { summary: 'Infer period from CEO contract', value: {} },
              withBlend: {
                summary: 'Explicit period + blend mode',
                value: {
                  periodStart: '2026-01-01T00:00:00.000Z',
                  periodEnd: '2026-12-31T23:59:59.999Z',
                  sectionBlendMode: 'redistribute'
                }
              }
            }
          }
        }
      },
      responses: {
        201: JSON_201,
        400: JSON_400,
        401: JSON_401,
        403: JSON_403,
        404: { description: 'No CEO contract / **CEO_CONTRACT_NOT_FOUND**' }
      }
    }
  },

  '/performance/scorecards/department/{department}/generate': {
    post: {
      tags: ['Updated performance'],
      summary: 'Generate department performance scorecard (persist draft)',
      description:
        'Upserts a **DRAFT** department scorecard for **`{department}`** (name from org list, e.g. **Investments**, **Finance**). Caller must be allowed to **generate** (department manager of that dept, HR, CEO, or admin). Optional **`departmentId`** in body resolves by id instead of the path segment.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'department',
          required: true,
          schema: { type: 'string', example: 'Investments' },
          description: 'Department display name (must match contract / org naming)'
        }
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: SCORECARD_GENERATE_REQUEST_SCHEMA,
            examples: {
              empty: { summary: 'Default period', value: {} },
              byName: {
                summary: 'Finance + explicit period',
                value: { periodLabel: '2026', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-12-31T23:59:59.999Z' }
              },
              byIdInBody: {
                summary: 'Resolve department by id (path segment ignored when id sent)',
                value: {
                  departmentId: 'clxreplaceWithRealDeptId',
                  periodLabel: '2026',
                  periodStart: '2026-01-01T00:00:00.000Z',
                  periodEnd: '2026-12-31T23:59:59.999Z'
                }
              }
            }
          }
        }
      },
      responses: {
        201: JSON_201,
        400: JSON_400,
        401: JSON_401,
        403: JSON_403,
        404: { description: 'Contract / department context not found' }
      }
    }
  },

  '/performance/scorecards/employee/{employeeId}/generate': {
    post: {
      tags: ['Updated performance'],
      summary: 'Generate employee performance scorecard (persist draft)',
      description:
        'Upserts a **DRAFT** employee scorecard for **`{employeeId}`**. **Not** self-service: only **direct line manager** (`lineManagerUserId`), **HR**, **CEO**, or **administrator** may generate. Employee may **preview** via **GET** …/employee/{id} but cannot generate their own draft.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'employeeId',
          required: true,
          schema: { type: 'string' },
          description: 'Subject user id (reviewee)'
        }
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'Optional period; same shape as Board/CEO without **sectionBlendMode** / **departmentId**.',
              properties: {
                periodStart: { type: 'string', format: 'date-time' },
                periodEnd: { type: 'string', format: 'date-time' },
                periodLabel: { type: 'string', example: '2026' }
              }
            },
            examples: {
              empty: { summary: 'Default period from employee contract', value: {} }
            }
          }
        }
      },
      responses: {
        201: JSON_201,
        400: JSON_400,
        401: JSON_401,
        403: JSON_403,
        404: { description: 'Employee or contract not found' }
      }
    }
  },

  '/kpis': KPI_CATALOG_POST_PATH_ITEM,
  '/kpis/{id}': KPI_CATALOG_BY_ID_PATH_ITEM
};
