import {
  OPERATIONAL_KPI_FIELD_KEYS,
  OPERATIONAL_KPI_FULL_EXAMPLE,
  OPERATIONAL_KPI_OPENAPI_PROPERTIES,
} from './operationalKpiFieldSchema';

const operationalKpiKeysAllZeros = Object.fromEntries(
  OPERATIONAL_KPI_FIELD_KEYS.map((k) => [k, 0])
) as Record<string, number>;

export const financialReportingEndpoints = {
  '/applicant/financial-reports': {
    post: {
      summary: 'Upload financial report (draft)',
      description:
        'Multipart upload with file. **Core statements** (`INCOME_STATEMENTS`, `STATEMENT_OF_FINANCIAL_POSITION`, `CASHFLOW_STATEMENTS`, and legacy `BALANCE_SHEET` / `INCOME_STATEMENT` / `CASHFLOW_STATEMENT`) require **.xlsx** only. Other categories (e.g. bank statements, business plan) may use **.xlsx** or **.pdf** where allowed. Prefer dedicated `.../draft` JSON routes plus `.../file` attach for core statements.',
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
                  description: 'Financial report file. Accepts .xlsx (for new report types) or .csv (for legacy types).'
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
                  description: 'INCOME_STATEMENTS, STATEMENT_OF_FINANCIAL_POSITION, CASHFLOW_STATEMENTS, and NON_FINANCIAL_KPIS use XLSX format. Legacy types use CSV.'
                },
                periodType: {
                  type: 'string',
                  enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'],
                  description: 'WEEKLY for cashflow, MONTHLY for income statements, QUARTERLY aggregates last 3 months, ANNUAL sums all periods for year revenue'
                },
                periodStart: {
                  type: 'string',
                  format: 'date'
                },
                periodEnd: {
                  type: 'string',
                  format: 'date'
                },
                title: {
                  type: 'string'
                },
                description: {
                  type: 'string'
                },
                templateVersion: {
                  type: 'string'
                }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Report uploaded as draft' },
        400: { description: 'Invalid request' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'List submitted financial reports',
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
      summary: 'Download financial report template',
      description: 'Download a template for a specific financial report type. New report types (INCOME_STATEMENTS, STATEMENT_OF_FINANCIAL_POSITION, CASHFLOW_STATEMENTS, NON_FINANCIAL_KPIS) return XLSX format. Legacy types return CSV format.',
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
      summary: 'Submit multiple financial reports',
      description: 'Submit one or more draft financial reports for venture review.',
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
                  items: { type: 'string' }
                }
              },
              required: ['reportIds']
            }
          }
        }
      },
      responses: {
        200: { description: 'Reports submitted successfully' },
        400: { description: 'Invalid request' },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden' }
      }
    }
  },
  '/applicant/financial-reports/draft': {
    post: {
      deprecated: true,
      summary: '[Deprecated] Create draft with reportType in body',
      description:
        'Deprecated: use `POST /applicant/financial-reports/income-statement/draft`, `/balance-sheet/draft`, or `/cash-flow/draft` instead (no `reportType` in body). This route may be removed in a future release.',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reportType', 'reportingPeriod', 'periodType', 'periodStart', 'periodEnd', 'title'],
              properties: {
                reportType: { type: 'string' },
                reportingPeriod: { type: 'string', format: 'date' },
                periodType: { type: 'string', enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'] },
                periodStart: { type: 'string', format: 'date' },
                periodEnd: { type: 'string', format: 'date' },
                title: { type: 'string' },
                description: { type: 'string' },
                templateVersion: { type: 'string' },
                data: { type: 'object' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Draft created (legacy)' },
        400: { description: 'Invalid request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/applicant/financial-reports/income-statement/draft': {
    post: {
      summary: 'Create income statement draft (data only)',
      description:
        'Creates a DRAFT financial report with reportType INCOME_STATEMENTS. Body is like /financial-reports/draft but without reportType. Response includes id and reportType.',
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
                reportingPeriod: { type: 'string', format: 'date' },
                periodType: { type: 'string', enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'] },
                periodStart: { type: 'string', format: 'date' },
                periodEnd: { type: 'string', format: 'date' },
                title: { type: 'string' },
                description: { type: 'string' },
                templateVersion: { type: 'string' },
                data: { type: 'object', description: 'Canonical income statement line-item fields (see template).' }
              }
            }
          }
        }
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
      summary: 'Create balance sheet draft (data only)',
      description:
        'Creates a DRAFT with reportType STATEMENT_OF_FINANCIAL_POSITION. `data` uses currentPeriod / priorPeriod objects with canonical keys (template line items only).',
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
                reportingPeriod: { type: 'string', format: 'date' },
                periodType: { type: 'string', enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'] },
                periodStart: { type: 'string', format: 'date' },
                periodEnd: { type: 'string', format: 'date' },
                title: { type: 'string' },
                description: { type: 'string' },
                templateVersion: { type: 'string' },
                data: {
                  type: 'object',
                  description: 'currentPeriod and priorPeriod line items (no Excel total rows).'
                }
              }
            }
          }
        }
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
      summary: 'Create cash flow statement draft (data only)',
      description: 'Creates a DRAFT with reportType CASHFLOW_STATEMENTS.',
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
                reportingPeriod: { type: 'string', format: 'date' },
                periodType: { type: 'string', enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'] },
                periodStart: { type: 'string', format: 'date' },
                periodEnd: { type: 'string', format: 'date' },
                title: { type: 'string' },
                description: { type: 'string' },
                templateVersion: { type: 'string' },
                data: { type: 'object', description: 'Canonical cash flow line-item fields.' }
              }
            }
          }
        }
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
      summary: 'Create operational KPIs draft (JSON only, no file)',
      description:
        'Creates **DRAFT** `OPERATIONAL_KPIS` in `financial_reports`. Fast (single insert). **`data.operational`** must include every KPI key (use `0` if N/A). Update with **PATCH** `.../financial-reports/{reportId}/data` if needed. **Submit** with **POST** `/applicant/financial-reports/submit` (body `reportId`): then `reporting_period_operational_kpis` is updated and derived KPIs recomputed. No file attach required.',
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
                reportingPeriod: { type: 'string', format: 'date' },
                periodType: { type: 'string', enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'] },
                periodStart: { type: 'string', format: 'date' },
                periodEnd: { type: 'string', format: 'date' },
                title: { type: 'string' },
                description: { type: 'string' },
                templateVersion: { type: 'string' },
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
      summary: 'Upload file for a draft report (reportId query)',
      description:
        'Multipart file upload. Pass reportId as a query parameter. Same validation as /financial-reports/{reportId}/file.',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'reportId',
          in: 'query',
          required: true,
          schema: { type: 'string' }
        }
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
        400: { description: 'Invalid file or reportId' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/applicant/financial-reports/period-kpis/income-statement': {
    post: {
      summary: 'Save income statement line items for a period (KPI workbook tab)',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['periodStart', 'periodEnd', 'data'],
              properties: {
                periodStart: { type: 'string', format: 'date' },
                periodEnd: { type: 'string', format: 'date' },
                data: { type: 'object' },
                totalRevenue: { type: 'number', nullable: true },
                netProfit: { type: 'number', nullable: true },
                cashFlowNet: { type: 'number', nullable: true }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Saved' },
        400: { description: 'Invalid request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/applicant/financial-reports/period-kpis/balance-sheet': {
    post: {
      summary: 'Save balance sheet line items for a period',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['periodStart', 'periodEnd', 'data'],
              properties: {
                periodStart: { type: 'string', format: 'date' },
                periodEnd: { type: 'string', format: 'date' },
                data: { type: 'object' },
                totalRevenue: { type: 'number', nullable: true },
                netProfit: { type: 'number', nullable: true },
                cashFlowNet: { type: 'number', nullable: true }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Saved' },
        400: { description: 'Invalid request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/applicant/financial-reports/period-kpis/cash-flow': {
    post: {
      summary: 'Save cash flow line items for a period',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['periodStart', 'periodEnd', 'data'],
              properties: {
                periodStart: { type: 'string', format: 'date' },
                periodEnd: { type: 'string', format: 'date' },
                data: { type: 'object' },
                totalRevenue: { type: 'number', nullable: true },
                netProfit: { type: 'number', nullable: true },
                cashFlowNet: { type: 'number', nullable: true }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Saved' },
        400: { description: 'Invalid request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/applicant/financial-reports/period-operational-kpis': {
    post: {
      summary: 'Create operational KPIs draft (alias — flat body)',
      description:
        '**Deprecated alias** for clients that prefer a flat body (`periodStart` / `periodEnd` / `operational`) without `reportingPeriod` / `title`. Creates **only** a **DRAFT** `OPERATIONAL_KPIS` row (fast). Does **not** sync `reporting_period_operational_kpis` or derived KPIs until **POST** `/applicant/financial-reports/submit` with the returned **`id`**. Prefer **`POST .../operational-kpis/draft`** for the canonical shape. Each `operational` key must be sent; use **`0`** when N/A.',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['periodStart', 'periodEnd', 'operational'],
              properties: {
                periodStart: {
                  type: 'string',
                  format: 'date',
                  description: 'First day of the reporting window (ISO date).',
                  example: '2025-01-01',
                },
                periodEnd: {
                  type: 'string',
                  format: 'date',
                  description: 'Reporting period end; must match an open calendar request (YYYY-MM-DD).',
                  example: '2025-03-31',
                },
                operational: {
                  type: 'object',
                  description:
                    'Full operational KPI set (14 numeric fields). Required in the contract below; use 0 for N/A. Backend normalizes `churnRate` (>1 treated as percent).',
                  required: [...OPERATIONAL_KPI_FIELD_KEYS],
                  properties: { ...OPERATIONAL_KPI_OPENAPI_PROPERTIES },
                },
              },
              example: {
                periodStart: '2025-01-01',
                periodEnd: '2025-03-31',
                operational: { ...OPERATIONAL_KPI_FULL_EXAMPLE },
              },
            },
            examples: {
              completeOperationalKpis: {
                summary: 'Full example — all KPI keys with sample values',
                description:
                  'Use this shape in production; substitute real figures. Every key in `operational` must appear (Swagger schema lists all with descriptions).',
                value: {
                  periodStart: '2025-01-01',
                  periodEnd: '2025-03-31',
                  operational: { ...OPERATIONAL_KPI_FULL_EXAMPLE },
                },
              },
              allZerosTemplate: {
                summary: 'All operational keys explicit (zeros)',
                description:
                  'Valid request when no operational metrics apply; derived hybrid KPIs (LTV, CAC, etc.) will typically stay empty until non-zero inputs and statements exist.',
                value: {
                  periodStart: '2025-01-01',
                  periodEnd: '2025-03-31',
                  operational: operationalKpiKeysAllZeros,
                },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Draft created; submit with POST /applicant/financial-reports/submit',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string' },
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      reportType: { type: 'string', example: 'OPERATIONAL_KPIS' },
                      reportUrl: { type: 'string', nullable: true },
                      fileUrl: { type: 'string', nullable: true },
                      storagePath: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: 'Invalid request' },
        401: { description: 'Unauthorized' },
      },
    },
  },
  '/applicant/financial-reports/period-kpis/summary': {
    get: {
      summary: 'Get operational + derived KPI block for a period',
      description:
        'Returns the persisted operational payload from `reporting_period_operational_kpis` and the last computed `derived` object from `financialKpis.kpiValues[periodEnd]` (financial + operationalDerived + missingInputs).',
      tags: ['Financial Reporting'],
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
        'Paginated audit events for one company: submissions, file attachments, reviews (accept/reject/needs revision), period KPI saves. Each row includes action, timestamps, actor, and JSON old/new values.',
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
      summary: 'List financial reports for a portfolio company',
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
      summary: 'Download a financial report',
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
      summary: 'Review a financial report (ACCEPT branches by reportType)',
      description:
        'ACCEPT for operational/document types completes without valuation/dividend automation; statement types require automation payload.',
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
                action: { type: 'string', enum: ['ACCEPT', 'REJECT'] },
                comment: { type: 'string' },
                mapping: { type: 'object' }
              },
              required: ['action']
            }
          }
        }
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


