// Comprehensive Cashbook endpoints for fallback Swagger spec with full schemas
export const cashbookEndpoints = {
  // ========== CASHBOOK MANAGEMENT ==========
  '/api/cashbook/banks': {
    get: {
      summary: 'Get all banks for cashbook operations',
      description: 'Retrieve all available banks that can be used for cashbook transactions',
      tags: ['Cashbook'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Banks retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        accountNumber: { type: 'string' },
                        currency: { type: 'string' },
                        glAccount: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    }
  },

  '/api/cashbook/receipts': {
    post: {
      summary: 'Create cash receipt',
      description: 'Record money received into a bank account (Sage Pastel Receipts Journal)',
      tags: ['Cashbook'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['bankId', 'amount', 'description', 'counterpartyType'],
              properties: {
                bankId: { 
                  type: 'string', 
                  example: 'cmh09d2i7000runyglxhf9s77',
                  description: 'Bank account ID' 
                },
                amount: { 
                  type: 'number', 
                  example: 5000.00,
                  description: 'Amount received' 
                },
                description: { 
                  type: 'string', 
                  example: 'Payment from ABC Company',
                  description: 'Transaction description' 
                },
                reference: { 
                  type: 'string', 
                  example: 'EFT123456',
                  description: 'Reference number (cheque, EFT, etc.)' 
                },
                counterpartyType: { 
                  type: 'string', 
                  enum: ['GL', 'CUSTOMER', 'VENDOR'],
                  example: 'CUSTOMER',
                  description: 'Type of counterparty' 
                },
                customerId: { 
                  type: 'string', 
                  example: 'cmgj4ckz40001unq4vdo5hs4m',
                  description: 'Customer ID (if counterpartyType is CUSTOMER)' 
                },
                vendorId: { 
                  type: 'string', 
                  example: 'vendor-id-here',
                  description: 'Vendor ID (if counterpartyType is VENDOR)' 
                },
                glAccountId: { 
                  type: 'string', 
                  example: 'gl-account-id-here',
                  description: 'GL Account ID (if counterpartyType is GL)' 
                },
                transactionDate: { 
                  type: 'string', 
                  format: 'date',
                  example: '2025-01-20',
                  description: 'Transaction date (defaults to today)' 
                }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Cash receipt created successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      bankId: { type: 'string' },
                      amount: { type: 'number' },
                      description: { type: 'string' },
                      type: { type: 'string', enum: ['RECEIPT'] },
                      status: { type: 'string', enum: ['PENDING', 'POSTED', 'VOIDED'] },
                      journalEntryId: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: 'Bad request - missing required fields' },
        401: { description: 'Unauthorized' },
        404: { description: 'Bank account not found' },
        500: { description: 'Internal server error' }
      }
    }
  },

  '/api/cashbook/payments': {
    post: {
      summary: 'Create cash payment',
      description: 'Record money paid out from a bank account (Sage Pastel Payments Journal)',
      tags: ['Cashbook'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['bankId', 'amount', 'description', 'counterpartyType'],
              properties: {
                bankId: { 
                  type: 'string', 
                  example: 'cmh09d2i7000runyglxhf9s77',
                  description: 'Bank account ID' 
                },
                amount: { 
                  type: 'number', 
                  example: 1500.00,
                  description: 'Amount paid' 
                },
                description: { 
                  type: 'string', 
                  example: 'Office supplies purchase',
                  description: 'Transaction description' 
                },
                reference: { 
                  type: 'string', 
                  example: 'PO123456',
                  description: 'Reference number (PO, invoice, etc.)' 
                },
                counterpartyType: { 
                  type: 'string', 
                  enum: ['GL', 'CUSTOMER', 'VENDOR'],
                  example: 'VENDOR',
                  description: 'Type of counterparty' 
                },
                customerId: { 
                  type: 'string', 
                  example: 'customer-id-here',
                  description: 'Customer ID (if counterpartyType is CUSTOMER)' 
                },
                vendorId: { 
                  type: 'string', 
                  example: 'vendor-id-here',
                  description: 'Vendor ID (if counterpartyType is VENDOR)' 
                },
                glAccountId: { 
                  type: 'string', 
                  example: 'gl-account-id-here',
                  description: 'GL Account ID (if counterpartyType is GL)' 
                },
                transactionDate: { 
                  type: 'string', 
                  format: 'date',
                  example: '2025-01-20',
                  description: 'Transaction date (defaults to today)' 
                }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Cash payment created successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      bankId: { type: 'string' },
                      amount: { type: 'number' },
                      description: { type: 'string' },
                      type: { type: 'string', enum: ['PAYMENT'] },
                      status: { type: 'string', enum: ['PENDING', 'POSTED', 'VOIDED'] },
                      journalEntryId: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: 'Bad request - missing required fields' },
        401: { description: 'Unauthorized' },
        404: { description: 'Bank account not found' },
        500: { description: 'Internal server error' }
      }
    }
  },

  '/api/cashbook/{bankId}/entries': {
    get: {
      summary: 'Get cashbook entries for a bank',
      description: 'Retrieve all cashbook entries for a specific bank account',
      tags: ['Cashbook'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'bankId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Bank account ID'
        },
        {
          name: 'type',
          in: 'query',
          schema: { type: 'string', enum: ['RECEIPT', 'PAYMENT'] },
          description: 'Filter by transaction type'
        },
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['PENDING', 'POSTED', 'VOIDED'] },
          description: 'Filter by transaction status'
        },
        {
          name: 'startDate',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'Start date filter'
        },
        {
          name: 'endDate',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'End date filter'
        }
      ],
      responses: {
        200: {
          description: 'Cashbook entries retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        bankId: { type: 'string' },
                        amount: { type: 'number' },
                        description: { type: 'string' },
                        type: { type: 'string' },
                        status: { type: 'string' },
                        transactionDate: { type: 'string', format: 'date' },
                        customer: { type: 'object' },
                        vendor: { type: 'object' },
                        glAccount: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' },
        404: { description: 'Bank account not found' },
        500: { description: 'Internal server error' }
      }
    }
  },

  '/api/cashbook/{bankId}/position': {
    get: {
      summary: 'Get cash position for a bank',
      description: 'Get current cash position including opening balance, receipts, payments, and current balance',
      tags: ['Cashbook'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'bankId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Bank account ID'
        }
      ],
      responses: {
        200: {
          description: 'Cash position retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'object',
                    properties: {
                      bankName: { type: 'string' },
                      openingBalance: { type: 'number' },
                      totalReceipts: { type: 'number' },
                      totalPayments: { type: 'number' },
                      currentBalance: { type: 'number' },
                      unreconciledCount: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' },
        404: { description: 'Bank account not found' },
        500: { description: 'Internal server error' }
      }
    }
  },

  '/api/cashbook/reports/cashflow': {
    get: {
      summary: 'Get cash flow report',
      description: 'Generate comprehensive cash flow report with detailed transaction breakdowns',
      tags: ['Cashbook'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'bankId',
          in: 'query',
          required: true,
          schema: { type: 'string' },
          description: 'Bank account ID'
        },
        {
          name: 'startDate',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'Start date (defaults to 30 days ago)'
        },
        {
          name: 'endDate',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'End date (defaults to today)'
        }
      ],
      responses: {
        200: {
          description: 'Cash flow report generated successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'object',
                    properties: {
                      bank: { type: 'object' },
                      period: { type: 'object' },
                      summary: { type: 'object' },
                      transactions: { type: 'array' }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    }
  },

  '/api/cashbook/balance-check': {
    get: {
      summary: 'Get comprehensive balance check between cashbook and bank reconciliation',
      description: 'Single endpoint to check balance between cashbook entries and bank reconciliation',
      tags: ['Cashbook'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'bankId',
          in: 'query',
          required: true,
          schema: { type: 'string' },
          description: 'Bank account ID'
        },
        {
          name: 'startDate',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'Start date (defaults to 30 days ago)'
        },
        {
          name: 'endDate',
          in: 'query',
          schema: { type: 'string', format: 'date' },
          description: 'End date (defaults to today)'
        }
      ],
      responses: {
        200: {
          description: 'Balance check completed successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'object',
                    properties: {
                      bank: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          accountNumber: { type: 'string' },
                          currency: { type: 'string' }
                        }
                      },
                      period: {
                        type: 'object',
                        properties: {
                          startDate: { type: 'string', format: 'date' },
                          endDate: { type: 'string', format: 'date' }
                        }
                      },
                      cashbook: {
                        type: 'object',
                        properties: {
                          totalReceipts: { type: 'number' },
                          totalPayments: { type: 'number' },
                          netBalance: { type: 'number' },
                          entryCount: { type: 'number' },
                          reconciledCount: { type: 'number' },
                          unreconciledCount: { type: 'number' }
                        }
                      },
                      bankReconciliation: {
                        type: 'object',
                        properties: {
                          totalReceipts: { type: 'number' },
                          totalPayments: { type: 'number' },
                          netBalance: { type: 'number' },
                          reconciliationCount: { type: 'number' },
                          matchedTransactions: { type: 'number' },
                          unmatchedTransactions: { type: 'number' }
                        }
                      },
                      differences: {
                        type: 'object',
                        properties: {
                          receiptDifference: { type: 'number' },
                          paymentDifference: { type: 'number' },
                          netDifference: { type: 'number' },
                          isBalanced: { type: 'boolean' }
                        }
                      },
                      status: {
                        type: 'object',
                        properties: {
                          isBalanced: { type: 'boolean' },
                          hasUnreconciledEntries: { type: 'boolean' },
                          hasUnmatchedTransactions: { type: 'boolean' },
                          needsAttention: { type: 'boolean' }
                        }
                      },
                      summary: {
                        type: 'object',
                        properties: {
                          message: { type: 'string' },
                          recommendations: { type: 'array', items: { type: 'string' } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: 'Bad request - missing required parameters' },
        404: { description: 'Bank account not found' },
        500: { description: 'Internal server error' }
      }
    }
  }
};
