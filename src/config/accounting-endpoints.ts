// Accounting endpoints for fallback Swagger spec
export const accountingEndpoints = {
  // Inventory Management
  '/accounting/inventory/items': {
    post: {
      summary: 'Create inventory item',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['itemName', 'skuNumber', 'costOfPurchase', 'inventoryAssetAccountId'],
              properties: {
                itemName: { type: 'string' },
                skuNumber: { type: 'string' },
                description: { type: 'string' },
                costOfPurchase: { type: 'number' },
                quantityOnHand: { type: 'number' },
                reorderLevel: { type: 'number' },
                unitOfMeasure: { type: 'string' },
                supplierId: { type: 'string' },
                inventoryAssetAccountId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Inventory item created successfully' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get inventory items',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of inventory items' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/inventory/items/{id}': {
    get: {
      summary: 'Get inventory item by ID',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' } }
      ],
      responses: {
        200: { description: 'Inventory item details' },
        404: { description: 'Item not found' },
        401: { description: 'Unauthorized' }
      }
    },
    put: {
      summary: 'Update inventory item',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' } }
      ],
      responses: {
        200: { description: 'Inventory item updated successfully' },
        404: { description: 'Item not found' },
        401: { description: 'Unauthorized' }
      }
    },
    delete: {
      summary: 'Delete inventory item',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' } }
      ],
      responses: {
        200: { description: 'Inventory item deleted successfully' },
        404: { description: 'Item not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  
  // Asset Management
  '/accounting/assets': {
    post: {
      summary: 'Create asset',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['assetName', 'assetCode', 'cost', 'usefulLifeYears', 'depreciationMethod', 'assetAccountId', 'accumulatedDepreciationAccountId', 'depreciationExpenseAccountId'],
              properties: {
                assetName: { type: 'string' },
                assetCode: { type: 'string' },
                description: { type: 'string' },
                cost: { type: 'number' },
                usefulLifeYears: { type: 'number' },
                depreciationMethod: { type: 'string', enum: ['STRAIGHT_LINE', 'DECLINING_BALANCE', 'SUM_OF_YEARS'] },
                assetAccountId: { type: 'string' },
                accumulatedDepreciationAccountId: { type: 'string' },
                depreciationExpenseAccountId: { type: 'string' },
                purchaseDate: { type: 'string', format: 'date' },
                location: { type: 'string' },
                vendor: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Asset created successfully' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get assets',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of assets' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  
  // Credit Notes
  '/accounting/credit-notes': {
    post: {
      summary: 'Create credit note',
      tags: ['Credit Notes'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['invoiceId', 'amount', 'reason'],
              properties: {
                invoiceId: { type: 'string' },
                amount: { type: 'number' },
                reason: { type: 'string' },
                description: { type: 'string' },
                creditNoteDate: { type: 'string', format: 'date' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Credit note created successfully' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get credit notes',
      tags: ['Credit Notes'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of credit notes' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  
  // Statement of Accounts
  '/accounting/statements/customer': {
    post: {
      summary: 'Generate customer statements',
      tags: ['Statement of Accounts'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                startDate: { type: 'string', format: 'date' },
                endDate: { type: 'string', format: 'date' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Customer statements generated successfully' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  
  // Multi-Currency
  '/accounting/multi-currency/exchange-rates': {
    post: {
      summary: 'Create exchange rate',
      tags: ['Multi-Currency'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['fromCurrencyId', 'toCurrencyId', 'rate', 'effectiveDate'],
              properties: {
                fromCurrencyId: { type: 'string' },
                toCurrencyId: { type: 'string' },
                rate: { type: 'number' },
                effectiveDate: { type: 'string', format: 'date' },
                notes: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Exchange rate created successfully' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get exchange rates',
      tags: ['Multi-Currency'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of exchange rates' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  
  // Trial Balance
  '/accounting/trial-balance': {
    get: {
      summary: 'Generate trial balance',
      tags: ['Trial Balance'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'date',
          required: false,
          schema: { type: 'string', format: 'date' },
          description: 'Date for trial balance (YYYY-MM-DD). Defaults to current date if not provided.'
        }
      ],
      responses: {
        200: { description: 'Trial balance generated successfully' },
        400: { description: 'Bad request - invalid date format' },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    }
  }
};
