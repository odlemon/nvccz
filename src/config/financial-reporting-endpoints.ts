export const financialReportingEndpoints = {
  '/applicant/financial-reports': {
    post: {
      summary: 'Upload financial report (draft)',
      description: 'Upload a CSV or XLSX file to create a draft financial report. New report types (INCOME_STATEMENTS, STATEMENT_OF_FINANCIAL_POSITION, CASHFLOW_STATEMENTS, NON_FINANCIAL_KPIS) use XLSX format. Legacy types (BALANCE_SHEET, INCOME_STATEMENT, CASHFLOW_STATEMENT) support CSV. Submit it later to share with the venture team.',
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


