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
      summary: 'Review a financial report',
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
        400: { description: 'Invalid request' },
        401: { description: 'Unauthorized' },
        default: { description: 'Unexpected error' }
      }
    }
  }
};


