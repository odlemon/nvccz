// Comprehensive Accounting endpoints for fallback Swagger spec with full schemas
export const accountingEndpoints = {
  // ========== INVENTORY MANAGEMENT ==========
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
              required: ['itemName', 'skuNumber', 'costOfPurchase'],
              properties: {
                itemName: { type: 'string', example: 'Product A' },
                skuNumber: { type: 'string', example: 'SKU-001' },
                description: { type: 'string', example: 'Product description' },
                costOfPurchase: { type: 'number', example: 50.00 },
                quantityOnHand: { type: 'number', example: 100 },
                reorderLevel: { type: 'number', example: 20 },
                unitOfMeasure: { type: 'string', example: 'pieces', default: 'pieces' },
                vendorId: { type: 'string', example: 'vendor-id', description: 'Optional - Link to vendor/supplier' },
                inventoryAssetAccountId: { type: 'string', example: 'account-id', description: 'Optional - Auto-selected if not provided' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Inventory item created successfully' },
        400: { description: 'Bad request - missing required fields' },
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
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Inventory item ID' }
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
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Inventory item ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                itemName: { type: 'string', example: 'Updated Product Name' },
                description: { type: 'string', example: 'Updated description' },
                costOfPurchase: { type: 'number', example: 55.00 },
                quantityOnHand: { type: 'number', example: 120 },
                reorderLevel: { type: 'number', example: 25 },
                unitOfMeasure: { type: 'string', example: 'units' },
                vendorId: { type: 'string', example: 'vendor-id', description: 'Optional - Link to vendor/supplier' }
              }
            }
          }
        }
      },
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
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Inventory item ID' }
      ],
      responses: {
        200: { description: 'Inventory item deleted successfully' },
        404: { description: 'Item not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/inventory/movements': {
    post: {
      summary: 'Record stock movement',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['itemId', 'movementType', 'quantity'],
              properties: {
                itemId: { type: 'string', example: 'item-id' },
                movementType: { type: 'string', enum: ['IN', 'OUT', 'ADJUSTMENT'], example: 'IN' },
                quantity: { type: 'number', example: 50 },
                notes: { type: 'string', example: 'Stock received' },
                referenceNumber: { type: 'string', example: 'PO-001' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Stock movement recorded successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/inventory/items/{itemId}/movements': {
    get: {
      summary: 'Get stock movements for an item',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'itemId', required: true, schema: { type: 'string' }, description: 'Inventory item ID' }
      ],
      responses: {
        200: { description: 'List of stock movements' },
        404: { description: 'Item not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/inventory/valuation': {
    get: {
      summary: 'Get inventory valuation',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Inventory valuation data' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/inventory/reorder-alerts': {
    get: {
      summary: 'Get reorder level alerts',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of items below reorder level' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/inventory/reorder-levels': {
    get: {
      summary: 'Get reorder levels data',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Reorder levels data' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/inventory/dashboard': {
    get: {
      summary: 'Get inventory dashboard',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Inventory dashboard data' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/inventory/sales-invoice': {
    post: {
      summary: 'Process sales invoice',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['invoiceId'],
              properties: {
                invoiceId: { type: 'string', example: 'invoice-id' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Sales invoice processed successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/inventory/update-stock': {
    post: {
      summary: 'Update stock quantity',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['itemId', 'quantity'],
              properties: {
                itemId: { type: 'string', example: 'item-id' },
                quantity: { type: 'number', example: 100 }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Stock quantity updated successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/inventory/calculate-cogs': {
    post: {
      summary: 'Calculate Cost of Goods Sold',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['itemId', 'quantity', 'method'],
              properties: {
                itemId: { type: 'string', example: 'item-id' },
                quantity: { type: 'number', example: 10 },
                method: { type: 'string', enum: ['FIFO', 'LIFO', 'AVERAGE'], example: 'FIFO' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'COGS calculated successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/inventory/report': {
    get: {
      summary: 'Generate inventory report',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Inventory report generated' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/inventory/check-reorder-levels': {
    get: {
      summary: 'Check reorder levels',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Reorder levels check completed' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/inventory/inventory-value': {
    get: {
      summary: 'Get inventory value',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Inventory value data' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/inventory/adjustments': {
    post: {
      summary: 'Create inventory adjustment',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['itemId', 'adjustmentQuantity', 'reason'],
              properties: {
                itemId: { type: 'string', example: 'item-id' },
                adjustmentQuantity: { type: 'number', example: 5 },
                reason: { type: 'string', example: 'Stock count adjustment' },
                notes: { type: 'string', example: 'Annual stock take' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Inventory adjustment created successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== ASSET MANAGEMENT ==========
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
                assetName: { type: 'string', example: 'Office Computer' },
                assetCode: { type: 'string', example: 'ASSET-001' },
                description: { type: 'string', example: 'Dell Laptop' },
                cost: { type: 'number', example: 1000 },
                usefulLifeYears: { type: 'number', example: 5 },
                depreciationMethod: { type: 'string', enum: ['STRAIGHT_LINE', 'DECLINING_BALANCE', 'SUM_OF_YEARS'], example: 'STRAIGHT_LINE' },
                assetAccountId: { type: 'string', example: 'account-id' },
                accumulatedDepreciationAccountId: { type: 'string', example: 'account-id' },
                depreciationExpenseAccountId: { type: 'string', example: 'account-id' },
                purchaseDate: { type: 'string', format: 'date', example: '2024-01-01' },
                location: { type: 'string', example: 'Main Office' },
                vendor: { type: 'string', example: 'Tech Supplier Inc' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Asset created successfully' },
        400: { description: 'Bad request - missing required fields' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get all assets',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of assets' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/assets/{id}': {
    get: {
      summary: 'Get asset by ID',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Asset ID' }
      ],
      responses: {
        200: { description: 'Asset details' },
        404: { description: 'Asset not found' },
        401: { description: 'Unauthorized' }
      }
    },
    put: {
      summary: 'Update asset',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Asset ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                assetName: { type: 'string' },
                description: { type: 'string' },
                location: { type: 'string' },
                vendor: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Asset updated successfully' },
        404: { description: 'Asset not found' },
        401: { description: 'Unauthorized' }
      }
    },
    delete: {
      summary: 'Delete asset',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Asset ID' }
      ],
      responses: {
        200: { description: 'Asset deleted successfully' },
        404: { description: 'Asset not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/assets/{assetId}/depreciation': {
    post: {
      summary: 'Calculate depreciation for an asset',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'assetId', required: true, schema: { type: 'string' }, description: 'Asset ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['depreciationDate'],
              properties: {
                depreciationDate: { type: 'string', format: 'date', example: '2024-12-31' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Depreciation calculated successfully' },
        400: { description: 'Bad request' },
        404: { description: 'Asset not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/assets/{id}/depreciate': {
    post: {
      summary: 'Calculate depreciation for an asset (data)',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Asset ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['depreciationDate'],
              properties: {
                depreciationDate: { type: 'string', format: 'date', example: '2024-12-31' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Depreciation calculated successfully' },
        400: { description: 'Bad request' },
        404: { description: 'Asset not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/assets/depreciation/{depreciationId}/post': {
    post: {
      summary: 'Post depreciation entry',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'depreciationId', required: true, schema: { type: 'string' }, description: 'Depreciation ID' }
      ],
      responses: {
        200: { description: 'Depreciation entry posted successfully' },
        404: { description: 'Depreciation not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/assets/{assetId}/dispose': {
    post: {
      summary: 'Dispose of an asset',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'assetId', required: true, schema: { type: 'string' }, description: 'Asset ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['disposalDate', 'disposalAmount'],
              properties: {
                disposalDate: { type: 'string', format: 'date', example: '2024-12-31' },
                disposalAmount: { type: 'number', example: 100 },
                notes: { type: 'string', example: 'Asset sold' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Asset disposed successfully' },
        400: { description: 'Bad request' },
        404: { description: 'Asset not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/assets/{id}/dispose': {
    post: {
      summary: 'Dispose of an asset (data)',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Asset ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['disposalDate', 'disposalAmount'],
              properties: {
                disposalDate: { type: 'string', format: 'date', example: '2024-12-31' },
                disposalAmount: { type: 'number', example: 100 },
                notes: { type: 'string', example: 'Asset sold' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Asset disposed successfully' },
        400: { description: 'Bad request' },
        404: { description: 'Asset not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/assets/register': {
    get: {
      summary: 'Get asset register',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Asset register data' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/assets/{assetId}/depreciation-schedule': {
    get: {
      summary: 'Get depreciation schedule for an asset',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'assetId', required: true, schema: { type: 'string' }, description: 'Asset ID' }
      ],
      responses: {
        200: { description: 'Depreciation schedule data' },
        404: { description: 'Asset not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/assets/depreciation-schedule': {
    get: {
      summary: 'Get depreciation schedule (data)',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Depreciation schedule data' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/assets/dashboard': {
    get: {
      summary: 'Get asset dashboard',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Asset dashboard data' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/assets/depreciation/monthly': {
    post: {
      summary: 'Post monthly depreciation',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['month', 'year'],
              properties: {
                month: { type: 'number', example: 12 },
                year: { type: 'number', example: 2024 }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Monthly depreciation posted successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/assets/depreciation/annual': {
    post: {
      summary: 'Post annual depreciation',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['year'],
              properties: {
                year: { type: 'number', example: 2024 }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Annual depreciation posted successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/assets/{id}/revalue': {
    post: {
      summary: 'Revalue an asset',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Asset ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['newValue', 'revaluationDate'],
              properties: {
                newValue: { type: 'number', example: 1500 },
                revaluationDate: { type: 'string', format: 'date', example: '2024-12-31' },
                notes: { type: 'string', example: 'Asset revaluation' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Asset revalued successfully' },
        400: { description: 'Bad request' },
        404: { description: 'Asset not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/assets/register/generate': {
    get: {
      summary: 'Generate asset register',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Asset register generated' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/assets/depreciation-schedule/generate': {
    get: {
      summary: 'Generate depreciation schedule',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Depreciation schedule generated' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== BANK RECONCILIATION ==========
  '/api/accounting/bank-reconciliation/upload': {
    post: {
      summary: 'Upload and process bank statement',
      tags: ['Bank Reconciliation'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: { type: 'string', format: 'binary' }
              }
            }
          },
          'application/json': {
            schema: {
              type: 'object',
              required: ['accountId', 'statementDate', 'openingBalance', 'closingBalance', 'transactions'],
              properties: {
                accountId: { type: 'string', example: 'account-id' },
                statementDate: { type: 'string', format: 'date', example: '2024-12-31' },
                openingBalance: { type: 'number', example: 1000 },
                closingBalance: { type: 'number', example: 1500 },
                transactions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      date: { type: 'string', format: 'date' },
                      description: { type: 'string' },
                      amount: { type: 'number' },
                      type: { type: 'string', enum: ['DEBIT', 'CREDIT'] }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Bank statement uploaded and processed successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/accounting/bank-reconciliation': {
    get: {
      summary: 'Get all bank reconciliations',
      tags: ['Bank Reconciliation'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of bank reconciliations' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/accounting/bank-reconciliation/summary': {
    get: {
      summary: 'Get reconciliation summary statistics',
      tags: ['Bank Reconciliation'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Reconciliation summary data' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/accounting/bank-reconciliation/{id}': {
    get: {
      summary: 'Get reconciliation by ID',
      tags: ['Bank Reconciliation'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Reconciliation ID' }
      ],
      responses: {
        200: { description: 'Reconciliation details' },
        404: { description: 'Reconciliation not found' },
        401: { description: 'Unauthorized' }
      }
    },
    delete: {
      summary: 'Delete reconciliation',
      tags: ['Bank Reconciliation'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Reconciliation ID' }
      ],
      responses: {
        200: { description: 'Reconciliation deleted successfully' },
        404: { description: 'Reconciliation not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/accounting/bank-reconciliation/{reconciliationId}/unmatched': {
    get: {
      summary: 'Get unmatched transactions for manual review',
      tags: ['Bank Reconciliation'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'reconciliationId', required: true, schema: { type: 'string' }, description: 'Reconciliation ID' }
      ],
      responses: {
        200: { description: 'List of unmatched transactions' },
        404: { description: 'Reconciliation not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/accounting/bank-reconciliation/transactions/{bankTransactionId}/matches': {
    get: {
      summary: 'Get potential matches for a specific transaction',
      tags: ['Bank Reconciliation'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'bankTransactionId', required: true, schema: { type: 'string' }, description: 'Bank transaction ID' }
      ],
      responses: {
        200: { description: 'List of potential matches' },
        404: { description: 'Transaction not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/accounting/bank-reconciliation/approve-match': {
    post: {
      summary: 'Approve manual match',
      tags: ['Bank Reconciliation'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['bankTransactionId', 'journalEntryId'],
              properties: {
                bankTransactionId: { type: 'string', example: 'transaction-id' },
                journalEntryId: { type: 'string', example: 'journal-entry-id' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Match approved successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/accounting/bank-reconciliation/results/{reconciliationResultId}/reject': {
    post: {
      summary: 'Reject a reconciliation result',
      tags: ['Bank Reconciliation'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'reconciliationResultId', required: true, schema: { type: 'string' }, description: 'Reconciliation result ID' }
      ],
      responses: {
        200: { description: 'Reconciliation result rejected successfully' },
        404: { description: 'Result not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/accounting/bank-reconciliation/{reconciliationId}/audit-trail': {
    get: {
      summary: 'Get audit trail for a reconciliation',
      tags: ['Bank Reconciliation'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'reconciliationId', required: true, schema: { type: 'string' }, description: 'Reconciliation ID' }
      ],
      responses: {
        200: { description: 'Audit trail data' },
        404: { description: 'Reconciliation not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== CREDIT NOTES ==========
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
                invoiceId: { type: 'string', example: 'invoice-id' },
                amount: { type: 'number', example: 100 },
                reason: { type: 'string', example: 'Product return' },
                description: { type: 'string', example: 'Customer returned damaged goods' },
                creditNoteDate: { type: 'string', format: 'date', example: '2024-12-31' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Credit note created successfully' },
        400: { description: 'Bad request - missing required fields' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get all credit notes',
      tags: ['Credit Notes'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of credit notes' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/credit-notes/report': {
    get: {
      summary: 'Generate credit note report',
      tags: ['Credit Notes'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Credit note report generated' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/credit-notes/dashboard': {
    get: {
      summary: 'Get credit note dashboard',
      tags: ['Credit Notes'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Credit note dashboard data' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/credit-notes/customer/{customerId}': {
    get: {
      summary: 'Get credit notes for a customer',
      tags: ['Credit Notes'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'customerId', required: true, schema: { type: 'string' }, description: 'Customer ID' }
      ],
      responses: {
        200: { description: 'List of customer credit notes' },
        404: { description: 'Customer not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/credit-notes/{id}/send': {
    post: {
      summary: 'Send credit note to customer',
      tags: ['Credit Notes'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Credit note ID' }
      ],
      responses: {
        200: { description: 'Credit note sent successfully' },
        404: { description: 'Credit note not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/credit-notes/{id}/apply': {
    post: {
      summary: 'Apply credit note to invoice',
      tags: ['Credit Notes'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Credit note ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['invoiceId'],
              properties: {
                invoiceId: { type: 'string', example: 'invoice-id' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Credit note applied successfully' },
        400: { description: 'Bad request' },
        404: { description: 'Credit note not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/credit-notes/{id}': {
    get: {
      summary: 'Get credit note by ID',
      tags: ['Credit Notes'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Credit note ID' }
      ],
      responses: {
        200: { description: 'Credit note details' },
        404: { description: 'Credit note not found' },
        401: { description: 'Unauthorized' }
      }
    },
    put: {
      summary: 'Update credit note',
      tags: ['Credit Notes'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Credit note ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                amount: { type: 'number' },
                reason: { type: 'string' },
                description: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Credit note updated successfully' },
        404: { description: 'Credit note not found' },
        401: { description: 'Unauthorized' }
      }
    },
    delete: {
      summary: 'Delete credit note',
      tags: ['Credit Notes'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Credit note ID' }
      ],
      responses: {
        200: { description: 'Credit note deleted successfully' },
        404: { description: 'Credit note not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== MULTI-CURRENCY ==========
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
                fromCurrencyId: { type: 'string', example: 'usd-currency-id' },
                toCurrencyId: { type: 'string', example: 'zwl-currency-id' },
                rate: { type: 'number', example: 25.5 },
                effectiveDate: { type: 'string', format: 'date', example: '2024-01-01' },
                notes: { type: 'string', example: 'Official rate' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Exchange rate created successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get all exchange rates',
      tags: ['Multi-Currency'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of exchange rates' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/multi-currency/exchange-rates/{id}': {
    put: {
      summary: 'Update exchange rate',
      tags: ['Multi-Currency'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Exchange rate ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                rate: { type: 'number' },
                effectiveDate: { type: 'string', format: 'date' },
                notes: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Exchange rate updated successfully' },
        404: { description: 'Exchange rate not found' },
        401: { description: 'Unauthorized' }
      }
    },
    delete: {
      summary: 'Delete exchange rate',
      tags: ['Multi-Currency'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Exchange rate ID' }
      ],
      responses: {
        200: { description: 'Exchange rate deleted successfully' },
        404: { description: 'Exchange rate not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/multi-currency/convert': {
    post: {
      summary: 'Convert currency',
      tags: ['Multi-Currency'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['amount', 'fromCurrencyId', 'toCurrencyId', 'conversionDate'],
              properties: {
                amount: { type: 'number', example: 100 },
                fromCurrencyId: { type: 'string', example: 'usd-currency-id' },
                toCurrencyId: { type: 'string', example: 'zwl-currency-id' },
                conversionDate: { type: 'string', format: 'date', example: '2024-01-01' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Currency converted successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/multi-currency/payments': {
    post: {
      summary: 'Process multi-currency payment',
      tags: ['Multi-Currency'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['invoiceId', 'paymentAmount', 'paymentCurrencyId', 'paymentDate'],
              properties: {
                invoiceId: { type: 'string', example: 'invoice-id' },
                paymentAmount: { type: 'number', example: 100 },
                paymentCurrencyId: { type: 'string', example: 'currency-id' },
                paymentDate: { type: 'string', format: 'date', example: '2024-01-01' },
                exchangeRate: { type: 'number', example: 25.5 },
                notes: { type: 'string', example: 'Payment received' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Multi-currency payment processed successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/multi-currency/forex-gain-loss': {
    get: {
      summary: 'Get forex gain/loss',
      tags: ['Multi-Currency'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Forex gain/loss data' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/multi-currency/dashboard': {
    get: {
      summary: 'Get multi-currency dashboard',
      tags: ['Multi-Currency'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Multi-currency dashboard data' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/multi-currency/calculate-forex-gain-loss': {
    post: {
      summary: 'Calculate forex gain/loss',
      tags: ['Multi-Currency'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['startDate', 'endDate'],
              properties: {
                startDate: { type: 'string', format: 'date', example: '2024-01-01' },
                endDate: { type: 'string', format: 'date', example: '2024-12-31' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Forex gain/loss calculated successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/multi-currency/post-forex-gain-loss': {
    post: {
      summary: 'Post forex gain/loss',
      tags: ['Multi-Currency'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['startDate', 'endDate'],
              properties: {
                startDate: { type: 'string', format: 'date', example: '2024-01-01' },
                endDate: { type: 'string', format: 'date', example: '2024-12-31' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Forex gain/loss posted successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/multi-currency/reconcile-invoice/{invoiceId}': {
    get: {
      summary: 'Reconcile multi-currency invoice',
      tags: ['Multi-Currency'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'invoiceId', required: true, schema: { type: 'string' }, description: 'Invoice ID' }
      ],
      responses: {
        200: { description: 'Multi-currency invoice reconciled' },
        404: { description: 'Invoice not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== STATEMENT OF ACCOUNTS ==========
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
                startDate: { type: 'string', format: 'date', example: '2024-01-01' },
                endDate: { type: 'string', format: 'date', example: '2024-12-31' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Customer statements generated successfully' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get all customer statements',
      tags: ['Statement of Accounts'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of customer statements' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/statements/vendor': {
    post: {
      summary: 'Generate statements for all vendors',
      tags: ['Statement of Accounts'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                startDate: { type: 'string', format: 'date', example: '2024-01-01' },
                endDate: { type: 'string', format: 'date', example: '2024-12-31' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Vendor statements generated successfully' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get all vendor statements',
      tags: ['Statement of Accounts'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of vendor statements' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/statements/customer/{customerId}': {
    post: {
      summary: 'Generate statement for a specific customer',
      tags: ['Statement of Accounts'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'customerId', required: true, schema: { type: 'string' }, description: 'Customer ID' }
      ],
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
        200: { description: 'Customer statement generated successfully' },
        404: { description: 'Customer not found' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get statements for a specific customer',
      tags: ['Statement of Accounts'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'customerId', required: true, schema: { type: 'string' }, description: 'Customer ID' }
      ],
      responses: {
        200: { description: 'List of customer statements' },
        404: { description: 'Customer not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/statements/vendor/{vendorId}': {
    post: {
      summary: 'Generate statement for a specific vendor',
      tags: ['Statement of Accounts'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'vendorId', required: true, schema: { type: 'string' }, description: 'Vendor ID' }
      ],
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
        200: { description: 'Vendor statement generated successfully' },
        404: { description: 'Vendor not found' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get statements for a specific vendor',
      tags: ['Statement of Accounts'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'vendorId', required: true, schema: { type: 'string' }, description: 'Vendor ID' }
      ],
      responses: {
        200: { description: 'List of vendor statements' },
        404: { description: 'Vendor not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/statements': {
    get: {
      summary: 'Get all statements',
      tags: ['Statement of Accounts'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of all statements' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/statements/{id}': {
    get: {
      summary: 'Get statement by ID',
      tags: ['Statement of Accounts'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Statement ID' }
      ],
      responses: {
        200: { description: 'Statement details' },
        404: { description: 'Statement not found' },
        401: { description: 'Unauthorized' }
      }
    },
    delete: {
      summary: 'Delete statement',
      tags: ['Statement of Accounts'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Statement ID' }
      ],
      responses: {
        200: { description: 'Statement deleted successfully' },
        404: { description: 'Statement not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/statements/dashboard': {
    get: {
      summary: 'Get statement dashboard',
      tags: ['Statement of Accounts'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Statement dashboard data' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/statements/{statementId}/format': {
    get: {
      summary: 'Format statement',
      tags: ['Statement of Accounts'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'statementId', required: true, schema: { type: 'string' }, description: 'Statement ID' }
      ],
      responses: {
        200: { description: 'Statement formatted' },
        404: { description: 'Statement not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/statements/{statementId}/email': {
    post: {
      summary: 'Email statement',
      tags: ['Statement of Accounts'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'statementId', required: true, schema: { type: 'string' }, description: 'Statement ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string', format: 'email', example: 'customer@example.com' },
                subject: { type: 'string', example: 'Your Statement of Account' },
                message: { type: 'string', example: 'Please find your statement attached' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Statement emailed successfully' },
        400: { description: 'Bad request' },
        404: { description: 'Statement not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== BALANCE SHEET ==========
  '/accounting/balance-sheet/generate': {
    post: {
      summary: 'Generate Balance Sheet (Assets = Liabilities + Equity)',
      tags: ['Balance Sheet'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['asOfDate'],
              properties: {
                asOfDate: { 
                  type: 'string', 
                  format: 'date', 
                  example: '2025-12-31', 
                  description: 'As-of date for balance sheet (point in time)' 
                },
                currencyId: { 
                  type: 'string', 
                  example: 'cmg97k2460000un8w4ejdporz', 
                  description: 'Optional - Currency ID (defaults to USD if not provided)' 
                }
              }
            }
          }
        }
      },
      responses: {
        200: { 
          description: 'Balance sheet generated successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                data: {
                  asOfDate: '2025-12-31',
                  assets: {
                    currentAssets: { accounts: [], total: 0 },
                    fixedAssets: { accounts: [], total: 0 },
                    totalAssets: 0
                  },
                  liabilities: {
                    currentLiabilities: { accounts: [], total: 0 },
                    longTermLiabilities: { accounts: [], total: 0 },
                    totalLiabilities: 0
                  },
                  equity: {
                    accounts: [],
                    retainedEarnings: 0,
                    total: 0
                  },
                  isBalanced: true
                }
              }
            }
          }
        },
        400: { description: 'Bad request - asOfDate required' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/balance-sheet': {
    get: {
      summary: 'Get Balance Sheet by query',
      tags: ['Balance Sheet'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'asOfDate', required: true, schema: { type: 'string', format: 'date' }, description: 'As-of date (YYYY-MM-DD)' },
        { in: 'query', name: 'currencyId', required: false, schema: { type: 'string' }, description: 'Currency ID (optional)' }
      ],
      responses: {
        200: { description: 'Balance sheet retrieved successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== INCOME STATEMENT ==========
  '/accounting/income-statement/generate': {
    post: {
      summary: 'Generate Income Statement (Revenue - Expenses = Net Income)',
      tags: ['Income Statement'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['startDate', 'endDate'],
              properties: {
                startDate: { 
                  type: 'string', 
                  format: 'date', 
                  example: '2025-01-01', 
                  description: 'Start date of reporting period (YYYY-MM-DD)' 
                },
                endDate: { 
                  type: 'string', 
                  format: 'date', 
                  example: '2025-12-31', 
                  description: 'End date of reporting period (YYYY-MM-DD)' 
                },
                currencyId: { 
                  type: 'string', 
                  example: 'cmg97k2460000un8w4ejdporz', 
                  description: 'Optional - Currency ID (defaults to USD)' 
                }
              }
            }
          }
        }
      },
      responses: {
        200: { 
          description: 'Income statement generated successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                data: {
                  period: { startDate: '2025-01-01', endDate: '2025-12-31' },
                  revenue: { accounts: [], total: 0 },
                  expenses: { accounts: [], total: 0 },
                  netIncome: 0,
                  currency: { code: 'USD', name: 'US Dollar' }
                }
              }
            }
          }
        },
        400: { description: 'Bad request - startDate and endDate required' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/income-statement/detailed': {
    post: {
      summary: 'Get detailed Income Statement with transaction breakdown',
      tags: ['Income Statement'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['startDate', 'endDate'],
              properties: {
                startDate: { type: 'string', format: 'date' },
                endDate: { type: 'string', format: 'date' },
                currencyId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Detailed income statement retrieved' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/income-statement/summary': {
    post: {
      summary: 'Get Income Statement summary (high-level totals)',
      tags: ['Income Statement'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['startDate', 'endDate'],
              properties: {
                startDate: { type: 'string', format: 'date' },
                endDate: { type: 'string', format: 'date' },
                currencyId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Income statement summary retrieved' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/income-statement/comprehensive': {
    post: {
      summary: 'Get comprehensive detailed Income Statement',
      tags: ['Income Statement'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['startDate', 'endDate'],
              properties: {
                startDate: { type: 'string', format: 'date' },
                endDate: { type: 'string', format: 'date' },
                currencyId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Comprehensive income statement retrieved' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/income-statement/vertical': {
    post: {
      summary: 'Get vertical Income Statement (traditional format)',
      tags: ['Income Statement'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['startDate', 'endDate'],
              properties: {
                startDate: { type: 'string', format: 'date' },
                endDate: { type: 'string', format: 'date' },
                currencyId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Vertical income statement retrieved' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/income-statement/comparative': {
    post: {
      summary: 'Get comparative Income Statement for multiple periods',
      tags: ['Income Statement'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['periods'],
              properties: {
                periods: {
                  type: 'array',
                  minItems: 2,
                  items: {
                    type: 'object',
                    required: ['startDate', 'endDate'],
                    properties: {
                      startDate: { type: 'string', format: 'date' },
                      endDate: { type: 'string', format: 'date' },
                      currencyId: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Comparative income statement retrieved' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/income-statement': {
    get: {
      summary: 'Get Income Statement by query parameters',
      tags: ['Income Statement'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'startDate', required: true, schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'endDate', required: true, schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'currencyId', required: false, schema: { type: 'string' } },
        { in: 'query', name: 'type', required: false, schema: { type: 'string', enum: ['summary', 'detailed'] }, description: 'Type of statement' }
      ],
      responses: {
        200: { description: 'Income statement retrieved' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== CASH FLOW STATEMENT ==========
  '/accounting/cash-flow': {
    post: {
      summary: 'Generate Cash Flow Statement (Operating + Investing + Financing Activities)',
      tags: ['Cash Flow Statement'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['startDate', 'endDate'],
              properties: {
                startDate: { 
                  type: 'string', 
                  format: 'date', 
                  example: '2025-01-01', 
                  description: 'Start date of cash flow period (YYYY-MM-DD)' 
                },
                endDate: { 
                  type: 'string', 
                  format: 'date', 
                  example: '2025-12-31', 
                  description: 'End date of cash flow period (YYYY-MM-DD)' 
                },
                currencyId: { 
                  type: 'string', 
                  example: 'cmg97k2460000un8w4ejdporz', 
                  description: 'Optional - Currency ID (defaults to USD)' 
                }
              }
            }
          }
        }
      },
      responses: {
        200: { 
          description: 'Cash flow statement generated successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                data: {
                  period: { startDate: '2025-01-01', endDate: '2025-12-31' },
                  operatingActivities: { total: 0 },
                  investingActivities: { total: 0 },
                  financingActivities: { total: 0 },
                  netCashFlow: 0,
                  openingCashBalance: 0,
                  closingCashBalance: 0,
                  currency: { code: 'USD' }
                }
              }
            }
          }
        },
        400: { description: 'Bad request - startDate and endDate required' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get Cash Flow Statement by query parameters',
      tags: ['Cash Flow Statement'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'startDate', required: true, schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'endDate', required: true, schema: { type: 'string', format: 'date' } },
        { in: 'query', name: 'currencyId', required: false, schema: { type: 'string' } }
      ],
      responses: {
        200: { description: 'Cash flow statement retrieved' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/cash-flow/detailed': {
    post: {
      summary: 'Get detailed Cash Flow Statement',
      tags: ['Cash Flow Statement'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['startDate', 'endDate'],
              properties: {
                startDate: { type: 'string', format: 'date' },
                endDate: { type: 'string', format: 'date' },
                currencyId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Detailed cash flow statement retrieved' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/cash-flow/summary': {
    post: {
      summary: 'Get Cash Flow Statement summary',
      tags: ['Cash Flow Statement'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['startDate', 'endDate'],
              properties: {
                startDate: { type: 'string', format: 'date' },
                endDate: { type: 'string', format: 'date' },
                currencyId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Cash flow summary retrieved' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/cash-flow/comprehensive': {
    post: {
      summary: 'Get comprehensive Cash Flow Statement',
      tags: ['Cash Flow Statement'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['startDate', 'endDate'],
              properties: {
                startDate: { type: 'string', format: 'date' },
                endDate: { type: 'string', format: 'date' },
                currencyId: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Comprehensive cash flow statement retrieved' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/cash-flow/comparative': {
    post: {
      summary: 'Get comparative Cash Flow Statement for multiple periods',
      tags: ['Cash Flow Statement'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['periods'],
              properties: {
                periods: {
                  type: 'array',
                  minItems: 2,
                  items: {
                    type: 'object',
                    required: ['startDate', 'endDate'],
                    properties: {
                      startDate: { type: 'string', format: 'date' },
                      endDate: { type: 'string', format: 'date' },
                      currencyId: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Comparative cash flow statement retrieved' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== TRIAL BALANCE ==========
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
  },
  '/accounting/trial-balance/summary': {
    get: {
      summary: 'Get trial balance summary',
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
        200: { description: 'Trial balance summary retrieved successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/trial-balance/by-account-type': {
    get: {
      summary: 'Get trial balance by account type',
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
        200: { description: 'Trial balance by account type retrieved successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  }
};
