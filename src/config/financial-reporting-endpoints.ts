import {
  OPERATIONAL_KPI_FIELD_KEYS,
  OPERATIONAL_KPI_FULL_EXAMPLE,
  OPERATIONAL_KPI_NUMERIC_INVALID,
  OPERATIONAL_KPI_OPENAPI_PROPERTIES,
} from './operationalKpiFieldSchema';
import {
  OPENAPI_BALANCE_SHEET_DATA_EXAMPLE,
  OPENAPI_BALANCE_SHEET_DRAFT_BODY_EXAMPLE,
  OPENAPI_CASHFLOW_DATA_EXAMPLE,
  OPENAPI_CASHFLOW_DRAFT_BODY_EXAMPLE,
  OPENAPI_INCOME_STATEMENT_DATA_EXAMPLE,
  OPENAPI_INCOME_STATEMENT_DRAFT_BODY_EXAMPLE,
} from './financialReportOpenApiExamples';

/** Doc-only: who may call the route (JWT + role). */
const AUD_APPLICANT_INVESTEE =
  '**Audience:** **Applicant (investee)** — user linked to a portfolio company (`APPLICANT` / portal JWT). ';
const AUD_INVESTOR_FUND =
  '**Audience:** **Investor (fund staff)** — e.g. admin, fund_manager, investments_manager, finance_manager. ';

const PERIOD_KPI_VARIANCE_NOTE_PROP = {
  varianceExplanationNote: {
    type: 'string',
    nullable: true,
    description:
      '**Submit gate (UAT):** When revenue for this period is **>50% below** the prior saved period, **`POST .../submit`** is rejected unless this note has **≥20 characters** (or you attach a variance PDF / `VARIANCE_EXPLANATION` report in the same bundle). Save via this route **before** submit.',
    example:
      'Q2 saw delayed enterprise renewals and one large contract pushed to Q3; pipeline rebuilt in July. CFO review attached separately.',
  },
} as const;

export const financialReportingEndpoints = {
  '/applicant/financial-reports': {
    post: {
      summary: 'Upload financial report (draft) — investee',
      description:
        AUD_APPLICANT_INVESTEE +
        'Multipart upload with file. **Core statements** (`INCOME_STATEMENTS`, `STATEMENT_OF_FINANCIAL_POSITION`, `CASHFLOW_STATEMENTS`, and legacy `BALANCE_SHEET` / `INCOME_STATEMENT` / `CASHFLOW_STATEMENT`) require **.xlsx** or **.xls** (not PDF). Other categories (e.g. bank statements, business plan) may use **.pdf** where allowed. Prefer typed **`.../income-statement/draft`** (etc.) JSON routes plus **`.../file`** attach for core statements.',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file', 'reportType', 'periodType', 'periodStart', 'periodEnd', 'title'],
              properties: {
                file: {
                  type: 'string',
                  format: 'binary',
                  description:
                    'Financial report file. Core statement types: **.xlsx** or **.xls** only. Other types may be .csv (legacy) or .pdf where allowed.',
                },
                reportType: {
                  type: 'string',
                  enum: [
                    'INCOME_STATEMENTS', 
                    'STATEMENT_OF_FINANCIAL_POSITION', 
                    'CASHFLOW_STATEMENTS', 
                    'NON_FINANCIAL_KPIS',
                    // Legacy types (backward compatibility)
                    'BALANCE_SHEET', 
                    'INCOME_STATEMENT', 
                    'CASHFLOW_STATEMENT'
                  ],
                  description:
                    'INCOME_STATEMENTS, STATEMENT_OF_FINANCIAL_POSITION, and CASHFLOW_STATEMENTS require Excel **.xlsx** or **.xls** for uploads. Legacy types may use CSV. NON_FINANCIAL_KPIS templates are XLSX; uploads follow non-core file rules.',
                },
                periodType: {
                  type: 'string',
                  enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'],
                  description: 'WEEKLY for cashflow, MONTHLY for income statements, QUARTERLY aggregates last 3 months, ANNUAL sums all periods for year revenue'
                },
                periodStart: {
                  type: 'string',
                  format: 'date',
                  example: '2025-01-01',
                },
                periodEnd: {
                  type: 'string',
                  format: 'date',
                  example: '2025-03-31',
                },
                title: {
                  type: 'string',
                  example: 'Q1 2025 management pack — income statement',
                },
                description: {
                  type: 'string',
                  example: 'Uploaded XLSX; figures reconciled to trial balance.',
                },
                templateVersion: {
                  type: 'string',
                  example: '2025.1',
                },
              },
            },
            examples: {
              coreStatementUpload: {
                summary: 'Income statement XLSX + period metadata',
                value: {
                  reportType: 'INCOME_STATEMENTS',
                  periodType: 'QUARTERLY',
                  periodStart: '2025-01-01',
                  periodEnd: '2025-03-31',
                  title: 'Income statement — Q1 2025',
                  description: 'Signed off by CFO on 2025-04-05',
                  templateVersion: '2025.1',
                },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Report uploaded as draft' },
        400: { description: 'Invalid request' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'List submitted financial reports — investee',
      description: AUD_APPLICANT_INVESTEE + 'Paginated list of reports for the authenticated investee.',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Reports retrieved successfully' },
        401: { description: 'Unauthorized' },
        403: { description: 'Access denied' },
        default: { description: 'Unexpected error' }
      }
    }
  },
  '/applicant/financial-reports/template/{reportType}': {
    get: {
      summary: 'Download financial report template — investee',
      description:
        AUD_APPLICANT_INVESTEE +
        'Download a template for a specific financial report type. New report types (INCOME_STATEMENTS, STATEMENT_OF_FINANCIAL_POSITION, CASHFLOW_STATEMENTS, NON_FINANCIAL_KPIS) return XLSX format. Legacy types return CSV format.',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'reportType',
          required: true,
          schema: {
            type: 'string',
            enum: [
              'INCOME_STATEMENTS', 
              'STATEMENT_OF_FINANCIAL_POSITION', 
              'CASHFLOW_STATEMENTS', 
              'NON_FINANCIAL_KPIS',
              // Legacy types (backward compatibility)
              'BALANCE_SHEET', 
              'INCOME_STATEMENT', 
              'CASHFLOW_STATEMENT'
            ]
          },
          description: 'Type of financial report template to download. New types return XLSX, legacy types return CSV.'
        }
      ],
      responses: {
        200: {
          description: 'Template file download (XLSX for new types, CSV for legacy types)',
          content: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
              schema: { type: 'string', format: 'binary' }
            },
            'text/csv': {
              schema: { type: 'string', format: 'binary' }
            }
          }
        }
      }
    }
  },
  '/applicant/financial-reports/submit': {
    post: {
      summary: 'Submit multiple financial reports — investee',
      description:
        AUD_APPLICANT_INVESTEE +
        'Submit one or more draft financial reports for fund review (**`PENDING`**). **Validation:** If revenue for the period is **>50% below** the prior period stored in `financialKpis`, you must have saved **`varianceExplanationNote`** (≥20 chars) via **POST** `.../period-kpis` (or include a variance PDF / `VARIANCE_EXPLANATION` report in the bundle); otherwise **400**.',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                reportIds: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['cmg9k2x8a0001nvcczfreport01'],
                },
              },
              required: ['reportIds'],
              example: { reportIds: ['cmg9k2x8a0001nvcczfreport01', 'cmg9k2x8a0002nvcczfreport02'] },
            },
          },
        },
      },
      responses: {
        200: { description: 'Reports submitted successfully' },
        400: {
          description:
            'Invalid request, not in submittable status, or **variance validation** failed (large revenue drop vs prior period without explanation).',
        },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden' }
      }
    }
  },
  '/applicant/financial-reports/income-statement/draft': {
    post: {
      summary: 'Create income statement draft (data only) — investee',
      description:
        AUD_APPLICANT_INVESTEE +
        `Creates a **DRAFT** \`financial_reports\` row with \`reportType\` **INCOME_STATEMENTS**. Response includes \`id\`; attach **.xlsx** or **.xls** via **POST** \`/applicant/financial-reports/file?reportId=\`. \`data\` must use canonical template keys; **non-numeric text** in numeric fields returns **400** (\`${OPERATIONAL_KPI_NUMERIC_INVALID}\`).`,
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reportingPeriod', 'periodType', 'periodStart', 'periodEnd', 'title'],
              properties: {
                reportingPeriod: { type: 'string', format: 'date', example: '2025-03-31' },
                periodType: { type: 'string', enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'], example: 'QUARTERLY' },
                periodStart: { type: 'string', format: 'date', example: '2025-01-01' },
                periodEnd: { type: 'string', format: 'date', example: '2025-03-31' },
                title: { type: 'string', example: 'Income statement — Q1 2025' },
                description: { type: 'string', example: 'Draft line items before file attach' },
                templateVersion: { type: 'string', example: '2025.1' },
                data: {
                  type: 'object',
                  description:
                    'Optional manual line items before XLSX attach. Canonical keys (`grossSales`, `salariesBenefitsAndWages`, …).',
                  additionalProperties: { type: 'number' },
                  example: OPENAPI_INCOME_STATEMENT_DATA_EXAMPLE,
                },
              },
              example: OPENAPI_INCOME_STATEMENT_DRAFT_BODY_EXAMPLE,
            },
          },
        },
      },
      responses: {
        201: { description: 'Draft created; attach file via /financial-reports/file?reportId=' },
        400: { description: 'Invalid request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/applicant/financial-reports/balance-sheet/draft': {
    post: {
      summary: 'Create balance sheet draft (data only) — investee',
      description:
        AUD_APPLICANT_INVESTEE +
        'Creates a **DRAFT** with `reportType` **STATEMENT_OF_FINANCIAL_POSITION**. `data` wraps **`currentPeriod`** and **`priorPeriod`** objects (canonical BS keys only). **Server validates** each populated period: **total assets = total liabilities + equity** (small float tolerance); mismatch → **400** `Accounting Error: Balance Sheet is out of balance by $…`.',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reportingPeriod', 'periodType', 'periodStart', 'periodEnd', 'title'],
              properties: {
                reportingPeriod: { type: 'string', format: 'date', example: '2025-03-31' },
                periodType: { type: 'string', enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'], example: 'QUARTERLY' },
                periodStart: { type: 'string', format: 'date', example: '2025-01-01' },
                periodEnd: { type: 'string', format: 'date', example: '2025-03-31' },
                title: { type: 'string', example: 'Statement of financial position — Q1 2025' },
                description: { type: 'string', example: 'Comparative column B = prior period' },
                templateVersion: { type: 'string', example: '2025.1' },
                data: {
                  type: 'object',
                  description:
                    'Optional. `{ currentPeriod: { … }, priorPeriod: { … } }` with canonical BS keys when not using file-only flow.',
                  required: ['currentPeriod', 'priorPeriod'],
                  properties: {
                    currentPeriod: {
                      type: 'object',
                      additionalProperties: { type: 'number' },
                      example: OPENAPI_BALANCE_SHEET_DATA_EXAMPLE.currentPeriod,
                    },
                    priorPeriod: {
                      type: 'object',
                      additionalProperties: { type: 'number' },
                      example: OPENAPI_BALANCE_SHEET_DATA_EXAMPLE.priorPeriod,
                    },
                  },
                  example: OPENAPI_BALANCE_SHEET_DATA_EXAMPLE,
                },
              },
              example: OPENAPI_BALANCE_SHEET_DRAFT_BODY_EXAMPLE,
            },
          },
        },
      },
      responses: {
        201: { description: 'Draft created' },
        400: { description: 'Invalid request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/applicant/financial-reports/cash-flow/draft': {
    post: {
      summary: 'Create cash flow statement draft (data only) — investee',
      description:
        AUD_APPLICANT_INVESTEE +
        'Creates a **DRAFT** with `reportType` **CASHFLOW_STATEMENTS**. `data` uses template line-items (operations / investing / financing).',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reportingPeriod', 'periodType', 'periodStart', 'periodEnd', 'title'],
              properties: {
                reportingPeriod: { type: 'string', format: 'date', example: '2025-03-31' },
                periodType: { type: 'string', enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'], example: 'QUARTERLY' },
                periodStart: { type: 'string', format: 'date', example: '2025-01-01' },
                periodEnd: { type: 'string', format: 'date', example: '2025-03-31' },
                title: { type: 'string', example: 'Cash flow statement — Q1 2025' },
                description: { type: 'string', example: 'Direct cash flows for the quarter' },
                templateVersion: { type: 'string', example: '2025.1' },
                data: {
                  type: 'object',
                  description: 'Optional. Canonical cash-flow keys (`cashReceiptsCustomers`, …).',
                  additionalProperties: { type: 'number' },
                  example: OPENAPI_CASHFLOW_DATA_EXAMPLE,
                },
              },
              example: OPENAPI_CASHFLOW_DRAFT_BODY_EXAMPLE,
            },
          },
        },
      },
      responses: {
        201: { description: 'Draft created' },
        400: { description: 'Invalid request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/applicant/financial-reports/operational-kpis/draft': {
    post: {
      summary: 'Create operational KPIs draft (JSON only, no file) — investee',
      description:
        AUD_APPLICANT_INVESTEE +
        `Creates **DRAFT** \`OPERATIONAL_KPIS\` in \`financial_reports\`. Fast (single insert). **\`data.operational\`** must include every KPI key (use \`0\` if N/A). **Reject:** present keys with non-numeric text (e.g. \`"Ten"\`) return **400** (\`${OPERATIONAL_KPI_NUMERIC_INVALID}\`). Update with **PATCH** \`.../financial-reports/{reportId}/data\` if needed. **Submit** with **POST** \`/applicant/financial-reports/submit\` (body \`reportId\`): then \`reporting_period_operational_kpis\` is updated and derived KPIs recomputed. No file attach required.`,
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reportingPeriod', 'periodType', 'periodStart', 'periodEnd', 'title', 'data'],
              properties: {
                reportingPeriod: { type: 'string', format: 'date', example: '2025-03-31' },
                periodType: {
                  type: 'string',
                  enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'],
                  example: 'QUARTERLY',
                },
                periodStart: { type: 'string', format: 'date', example: '2025-01-01' },
                periodEnd: { type: 'string', format: 'date', example: '2025-03-31' },
                title: { type: 'string', example: 'Operational KPIs — Q1 2025' },
                description: { type: 'string', example: 'Unit economics for ILPA-style monitoring' },
                templateVersion: { type: 'string', example: '2025.1' },
                data: {
                  type: 'object',
                  required: ['operational'],
                  properties: {
                    operational: {
                      type: 'object',
                      required: [...OPERATIONAL_KPI_FIELD_KEYS],
                      properties: { ...OPERATIONAL_KPI_OPENAPI_PROPERTIES },
                    },
                  },
                },
              },
              example: {
                reportingPeriod: '2025-03-31',
                periodType: 'QUARTERLY',
                periodStart: '2025-01-01',
                periodEnd: '2025-03-31',
                title: 'Operational KPIs — Q1 2025',
                description: 'Draft only until submit',
                templateVersion: '2025.1',
                data: { operational: { ...OPERATIONAL_KPI_FULL_EXAMPLE } },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Draft created; submit via /financial-reports/submit with reportId' },
        400: { description: 'Invalid request' },
        401: { description: 'Unauthorized' },
      },
    },
  },
  '/applicant/financial-reports/file': {
    post: {
      summary: 'Attach file to draft report — investee (query reportId)',
      description:
        AUD_APPLICANT_INVESTEE +
        'Multipart file upload. Pass **reportId** as a query parameter. **Core** report types require **.xlsx** or **.xls**; PDF rejected. Same rules as path variant **`POST .../{reportId}/file`**.',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'reportId',
          in: 'query',
          required: true,
          schema: { type: 'string', example: 'cmg9k2x8a0001nvcczfreport01' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file'],
              properties: {
                file: { type: 'string', format: 'binary' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'File attached' },
        400: {
          description:
            'Invalid file extension (e.g. PDF for core statement), wrong reportId, or report not in DRAFT/NEEDS_REVISION/REJECTED.',
        },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/applicant/financial-reports/period-kpis': {
    post: {
      summary: 'Save period KPIs and manual statement sections — investee (combined)',
      description:
        AUD_APPLICANT_INVESTEE +
        'Persists **`portfolio_companies.financialKpis.kpiValues[periodEnd]`** — optional **`incomeStatement`**, **`statementOfFinancialPosition`**, **`cashflowStatement`**, **`nonFinancialKpis`** (numeric leaves validated; non-numeric text → **400**), summary **`totalRevenue` / `netProfit` / `cashFlowNet`**, and **`varianceExplanationNote`** for submit-time revenue-drop checks. Derives **`CURRENT_RATIO`** and other metrics via **`recomputeAndPersist`**.',
      tags: ['Financial Reporting', 'Investee Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['periodStart', 'periodEnd'],
              properties: {
                periodStart: { type: 'string', format: 'date', example: '2025-01-01' },
                periodEnd: { type: 'string', format: 'date', example: '2025-03-31' },
                totalRevenue: { type: 'number', nullable: true },
                netProfit: { type: 'number', nullable: true },
                cashFlowNet: { type: 'number', nullable: true },
                incomeStatement: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                  description: 'Canonical income-statement line items (strict numeric values).',
                  example: OPENAPI_INCOME_STATEMENT_DATA_EXAMPLE,
                },
                statementOfFinancialPosition: {
                  type: 'object',
                  description:
                    'Flat or **`{ currentPeriod, priorPeriod }`** SOFP line items; each period must **balance** (assets = liabilities + equity).',
                  example: OPENAPI_BALANCE_SHEET_DATA_EXAMPLE,
                },
                cashflowStatement: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                  example: OPENAPI_CASHFLOW_DATA_EXAMPLE,
                },
                nonFinancialKpis: {
                  type: 'object',
                  description: 'Nested object with numeric leaves only (non-numeric strings → **400**).',
                  additionalProperties: true,
                },
                ...PERIOD_KPI_VARIANCE_NOTE_PROP,
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Saved; audit log may include **fieldChanges** when manual entries differ from prior' },
        400: {
          description:
            'Invalid body, balance sheet out of balance, or non-numeric KPI / line-item value (see error message).',
        },
        401: { description: 'Unauthorized' },
      },
    },
  },
  '/applicant/financial-reports/period-kpis/income-statement': {
    post: {
      summary: 'Save income statement line items for a period — investee',
      description:
        AUD_APPLICANT_INVESTEE +
        'Persists **`manualEntries.incomeStatement`** for **`periodEnd`**. **Strict numerics:** invalid strings → **400**. Optional **`varianceExplanationNote`** (see **POST** `.../period-kpis`).',
      tags: ['Financial Reporting', 'Investee Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['periodStart', 'periodEnd', 'data'],
              properties: {
                periodStart: { type: 'string', format: 'date', example: '2025-01-01' },
                periodEnd: { type: 'string', format: 'date', example: '2025-03-31' },
                data: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                  example: OPENAPI_INCOME_STATEMENT_DATA_EXAMPLE,
                },
                totalRevenue: { type: 'number', nullable: true, example: 1245800 },
                netProfit: { type: 'number', nullable: true, example: 189400 },
                cashFlowNet: { type: 'number', nullable: true, example: 142000 },
                ...PERIOD_KPI_VARIANCE_NOTE_PROP,
              },
              example: {
                periodStart: '2025-01-01',
                periodEnd: '2025-03-31',
                data: OPENAPI_INCOME_STATEMENT_DATA_EXAMPLE,
                totalRevenue: 1245800,
                netProfit: 189400,
                cashFlowNet: 142000,
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Saved' },
        400: { description: 'Invalid data or non-numeric line value' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/applicant/financial-reports/period-kpis/balance-sheet': {
    post: {
      summary: 'Save balance sheet line items for a period — investee',
      description:
        AUD_APPLICANT_INVESTEE +
        'Same shape as BS draft **`data`**. **Balanced:** assets must equal liabilities + equity per period (**400** with `Accounting Error: Balance Sheet is out of balance…` if not). Optional **`varianceExplanationNote`**.',
      tags: ['Financial Reporting', 'Investee Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['periodStart', 'periodEnd', 'data'],
              properties: {
                periodStart: { type: 'string', format: 'date', example: '2025-01-01' },
                periodEnd: { type: 'string', format: 'date', example: '2025-03-31' },
                data: {
                  type: 'object',
                  example: OPENAPI_BALANCE_SHEET_DATA_EXAMPLE,
                },
                totalRevenue: { type: 'number', nullable: true, example: 0 },
                netProfit: { type: 'number', nullable: true, example: 0 },
                cashFlowNet: { type: 'number', nullable: true, example: 0 },
                ...PERIOD_KPI_VARIANCE_NOTE_PROP,
              },
              example: {
                periodStart: '2025-01-01',
                periodEnd: '2025-03-31',
                data: OPENAPI_BALANCE_SHEET_DATA_EXAMPLE,
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Saved' },
        400: { description: 'Invalid request, imbalanced sheet, or bad numeric' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/applicant/financial-reports/period-kpis/cash-flow': {
    post: {
      summary: 'Save cash flow line items for a period — investee',
      description:
        AUD_APPLICANT_INVESTEE +
        'Stores **`manualEntries.cashflowStatement`** (strict numerics). Optional **`varianceExplanationNote`**.',
      tags: ['Financial Reporting', 'Investee Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['periodStart', 'periodEnd', 'data'],
              properties: {
                periodStart: { type: 'string', format: 'date', example: '2025-01-01' },
                periodEnd: { type: 'string', format: 'date', example: '2025-03-31' },
                data: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                  example: OPENAPI_CASHFLOW_DATA_EXAMPLE,
                },
                totalRevenue: { type: 'number', nullable: true, example: 0 },
                netProfit: { type: 'number', nullable: true, example: 0 },
                cashFlowNet: { type: 'number', nullable: true, example: 142000 },
                ...PERIOD_KPI_VARIANCE_NOTE_PROP,
              },
              example: {
                periodStart: '2025-01-01',
                periodEnd: '2025-03-31',
                data: OPENAPI_CASHFLOW_DATA_EXAMPLE,
                cashFlowNet: 142000,
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Saved' },
        400: { description: 'Invalid request or non-numeric line value' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/applicant/financial-reports/period-kpis/summary': {
    get: {
      summary: 'Get operational + derived KPI block for a period — investee',
      description:
        AUD_APPLICANT_INVESTEE +
        'Returns the persisted operational payload from `reporting_period_operational_kpis` and the last computed `derived` object from `financialKpis.kpiValues[periodEnd]` (financial + operationalDerived + missingInputs).',
      tags: ['Financial Reporting', 'Investee Reporting'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'periodEnd',
          in: 'query',
          required: true,
          schema: { type: 'string', format: 'date' },
          description: 'Reporting period end (YYYY-MM-DD), same as calendar key.',
        },
      ],
      responses: {
        200: {
          description: 'periodEnd, operational (all stored keys), derived (if computed)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      periodEnd: { type: 'string', example: '2025-03-31' },
                      operational: {
                        type: 'object',
                        description: 'All 14 operational fields as last saved',
                        additionalProperties: { type: 'number' },
                      },
                      derived: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          financial: { type: 'object', additionalProperties: true },
                          operationalDerived: { type: 'object', additionalProperties: true },
                          missingInputs: { type: 'array', items: { type: 'string' } },
                          computedAt: { type: 'string', format: 'date-time' },
                          formulasVersion: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: 'Missing periodEnd' },
        401: { description: 'Unauthorized' },
      },
    },
  },
  '/portfolio-companies/{id}/reporting-audit': {
    get: {
      summary: 'Financial reporting audit trail (investor)',
      description:
        AUD_INVESTOR_FUND +
        'Paginated audit events for one company: submissions, file attachments, reviews (accept/reject/needs revision), period KPI saves. **FINANCIAL_REPORTING_PERIOD_DATA** / **FINANCIAL_REPORT_DATA_UPDATED** may include **newValues.fieldChanges**: map of leaf paths to `{ from, to }` (capped) for field-level audit.',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 } },
      ],
      responses: {
        200: { description: 'Events list' },
        404: { description: 'Portfolio company not found' },
        default: { description: 'Unexpected error' },
      },
    },
  },
  '/portfolio-companies/{id}/document-organisation': {
    get: {
      summary: 'Document organisation (investor, per company)',
      description:
        AUD_INVESTOR_FUND +
        'Financial / Operational / Investment folders with fixed subfolders (income statement, balance sheet, HR, business plans, etc.). Subfolders always listed; empty ones have files: [].',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        {
          name: 'status',
          in: 'query',
          required: false,
          schema: { type: 'string', example: 'PENDING,ACCEPTED' },
          description: 'Comma-separated status filter. Default excludes DRAFT.',
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', default: 2000 },
          description: 'Max reports before grouping (cap 5000).',
        },
      ],
      responses: {
        200: { description: 'documentOrganisation array (3 root folders)' },
        401: { description: 'Unauthorized' },
        404: { description: 'Portfolio company not found' },
        default: { description: 'Unexpected error' },
      },
    },
  },
  '/portfolio-companies/{id}/financial-reports': {
    get: {
      summary: 'List financial reports for a portfolio company (investor)',
      description:
        AUD_INVESTOR_FUND +
        'List investee submissions for this portfolio company (paginate/filter in service as implemented).',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
      ],
      responses: {
        200: { description: 'Reports retrieved successfully' },
        400: { description: 'Missing company ID' },
        401: { description: 'Unauthorized' },
        default: { description: 'Unexpected error' }
      }
    }
  },
  '/portfolio-companies/{id}/financial-reports/{reportId}/download': {
    get: {
      summary: 'Download a financial report (investor)',
      description: AUD_INVESTOR_FUND + 'Download the original uploaded file (XLSX/CSV/PDF).',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'reportId', in: 'path', required: true, schema: { type: 'string' } }
      ],
      responses: {
        200: { 
          description: 'Report file download (XLSX or CSV depending on original upload format)',
          content: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
              schema: { type: 'string', format: 'binary' }
            },
            'text/csv': {
              schema: { type: 'string', format: 'binary' }
            }
          }
        },
        400: { description: 'Missing identifiers' },
        401: { description: 'Unauthorized' },
        404: { description: 'Report not found' },
        default: { description: 'Unexpected error' }
      }
    }
  },
  '/portfolio-companies/{id}/financial-reports/{reportId}/review': {
    post: {
      summary: 'Review a financial report — investor',
      description:
        AUD_INVESTOR_FUND +
        '**ACCEPT** for operational/document types completes without valuation/dividend automation; **statement** types require accounting automation payload in `mapping` where applicable.',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'reportId', in: 'path', required: true, schema: { type: 'string' } }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['ACCEPT', 'REJECT'], example: 'ACCEPT' },
                comment: {
                  type: 'string',
                  example: 'Figures accepted — tie-out to management accounts confirmed.',
                },
                mapping: {
                  type: 'object',
                  description: 'Accounting automation / valuation payload when required for statement types.',
                  example: {
                    fairValueAdjustmentUsd: 15000,
                    notes: 'FMV from board-approved valuation memo',
                  },
                },
              },
              required: ['action'],
              example: {
                action: 'ACCEPT',
                comment: 'Accepted for Q1 2025 monitoring.',
                mapping: { fairValueAdjustmentUsd: 15000 },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Review recorded successfully' },
        400: {
          description: 'Invalid request (e.g. ACCEPT on statements without accounting automation payload)',
        },
        401: { description: 'Unauthorized' },
        default: { description: 'Unexpected error' }
      }
    }
  }
};


