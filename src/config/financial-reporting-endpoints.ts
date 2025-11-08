export const financialReportingEndpoints = {
  '/applicant/financial-reports': {
    post: {
      summary: 'Submit a financial report',
      description: 'Upload a financial report document for review.',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: { type: 'string', format: 'binary' },
                reportType: {
                  type: 'string',
                  enum: ['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASHFLOW_STATEMENT']
                },
                periodType: {
                  type: 'string',
                  enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']
                },
                periodStart: { type: 'string', format: 'date' },
                periodEnd: { type: 'string', format: 'date' },
                title: { type: 'string' },
                description: { type: 'string' },
                templateVersion: { type: 'string' }
              },
              required: ['file', 'reportType', 'periodType', 'periodStart', 'periodEnd', 'title']
            }
          }
        }
      },
      responses: {
        201: { description: 'Report submitted successfully' },
        400: { description: 'Invalid request' },
        401: { description: 'Unauthorized' },
        403: { description: 'Access denied' },
        default: { description: 'Unexpected error' }
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
      description: 'Download a CSV template for a specific financial report type.',
      tags: ['Financial Reporting'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'reportType',
          required: true,
          schema: {
            type: 'string',
            enum: ['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASHFLOW_STATEMENT']
          },
          description: 'Type of financial report template to download.'
        }
      ],
      responses: {
        200: {
          description: 'CSV template download'
        }
      }
    }
  },
  'applicant/financial-reports/submit': {
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
        200: { description: 'CSV download' },
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
