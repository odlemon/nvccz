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
                itemName: { type: 'string', example: 'Laptop' },
                skuNumber: { type: 'string', example: 'LAP-001', description: 'Unique SKU number for the item' },
                description: { type: 'string', example: 'Dell Latitude 7490' },
                costOfPurchase: { type: 'number', example: 1000.00 },
                quantityOnHand: { type: 'number', example: 10 },
                reorderLevel: { type: 'number', example: 5 },
                unitOfMeasure: { type: 'string', example: 'pieces', default: 'pieces' },
                vendorId: { type: 'string', example: 'vendor-uuid-here', description: 'Optional - Link to vendor/supplier' }
              }
            }
          }
        }
      },
      responses: {
        201: { 
          description: 'Inventory item created successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Inventory item created successfully',
                data: {
                  id: 'item-id',
                  itemName: 'Laptop',
                  skuNumber: 'LAP-001',
                  costOfPurchase: '1000',
                  quantityOnHand: '10'
                }
              }
            }
          }
        },
        400: { description: 'Bad request - missing required fields' },
        401: { description: 'Unauthorized' },
        409: { 
          description: 'Conflict - SKU number already exists',
          content: {
            'application/json': {
              example: {
                error: 'Duplicate SKU number',
                details: "Inventory item with SKU 'LAP-001' already exists. SKU numbers must be unique."
              }
            }
          }
        }
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
      summary: 'Run monthly depreciation for all in-use assets (anniversary-based eligibility)',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                asOfDate: {
                  type: 'string',
                  format: 'date',
                  example: '2026-03-31',
                  description: 'Run as of this date (default: today). Period is derived from this date unless period is set.',
                },
                period: {
                  type: 'string',
                  example: '2026-03',
                  description: 'Optional YYYY-MM override for which calendar month to accrue',
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Monthly depreciation posted successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' },
      },
    },
  },
  '/cron/depreciation/monthly': {
    post: {
      summary:
        'Cron: monthly depreciation (X-Depreciation-Cron-Secret; no JWT). Same as POST /accounting/assets/depreciation/cron/monthly.',
      tags: ['Asset Management'],
      parameters: [
        {
          in: 'header',
          name: 'X-Depreciation-Cron-Secret',
          required: true,
          schema: { type: 'string' },
        },
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                asOfDate: { type: 'string', format: 'date' },
                period: { type: 'string', example: '2026-03' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Cron run completed' },
        401: { description: 'Unauthorized' },
        503: { description: 'Cron not configured' },
      },
    },
  },
  '/accounting/assets/{assetId}/depreciation/backfill': {
    post: {
      summary: 'Backfill depreciation through a date (calculate + post each due month)',
      tags: ['Asset Management'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'assetId', required: true, schema: { type: 'string' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['throughDate'],
              properties: {
                throughDate: { type: 'string', format: 'date', example: '2026-03-31' },
                autoPost: {
                  type: 'boolean',
                  default: true,
                  description: 'If false, only creates depreciation records; does not post JEs',
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Backfill result' },
        401: { description: 'Unauthorized' },
      },
    },
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
  '/accounting/bank-reconciliation/upload': {
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
  '/accounting/bank-reconciliation': {
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
  '/accounting/bank-reconciliation/summary': {
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
  '/accounting/bank-reconciliation/{id}': {
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
  '/accounting/bank-reconciliation/{reconciliationId}/unmatched': {
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
  '/accounting/bank-reconciliation/transactions/{bankTransactionId}/matches': {
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
  '/accounting/bank-reconciliation/approve-match': {
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
  '/accounting/bank-reconciliation/results/{reconciliationResultId}/reject': {
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
  '/accounting/bank-reconciliation/{reconciliationId}/audit-trail': {
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
      parameters: [
        {
          in: 'query',
          name: 'hideZeroBalances',
          required: false,
          schema: { type: 'string', enum: ['true', 'false', '1', '0'] },
          description:
            'Filter: true or 1 to hide idle zero-balance accounts from display lists; section/grand totals unchanged'
        }
      ],
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
        { in: 'query', name: 'currencyId', required: false, schema: { type: 'string' }, description: 'Currency ID (optional)' },
        {
          in: 'query',
          name: 'hideZeroBalances',
          required: false,
          schema: { type: 'string', enum: ['true', 'false', '1', '0'] },
          description: 'true or 1 to hide idle zero-balance accounts from lists; totals unchanged'
        }
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
      description: 'Supports period filters (month/quarter/year) via URL query parameters OR legacy date range in request body. Period Filter Examples: Month: ?periodType=month&periodValue=2025-01, Quarter: ?periodType=quarter&periodValue=2025-Q1, Year: ?periodType=year&periodValue=2025',
      tags: ['Income Statement'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'periodType',
          schema: { type: 'string', enum: ['month', 'quarter', 'year'] },
          description: 'Period type filter (use with periodValue). Options: month, quarter, year',
          example: 'month'
        },
        {
          in: 'query',
          name: 'periodValue',
          schema: { type: 'string' },
          description: 'Period value matching periodType: month: "2025-01" (YYYY-MM), quarter: "2025-Q1" or "2025-1" (YYYY-QN or YYYY-N), year: "2025" (YYYY)',
          example: '2025-01'
        },
        {
          in: 'query',
          name: 'currencyId',
          schema: { type: 'string' },
          description: 'Currency ID (optional, uses default if not provided)'
        }
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'Legacy date range format (use if period filters not provided)',
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
        400: { description: 'Bad request - Either period filter (periodType + periodValue in URL) or date range (startDate + endDate) is required' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== CASH FLOW STATEMENT ==========
  '/accounting/cash-flow/generate': {
    post: {
      summary: 'Generate Cash Flow Statement (Operating + Investing + Financing Activities)',
      description: 'Supports period filters (month/quarter/year) via URL query parameters OR legacy date range in request body. Period Filter Examples: Month: ?periodType=month&periodValue=2025-01, Quarter: ?periodType=quarter&periodValue=2025-Q1, Year: ?periodType=year&periodValue=2025',
      tags: ['Cash Flow Statement'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'periodType',
          schema: { type: 'string', enum: ['month', 'quarter', 'year'] },
          description: 'Period type filter (use with periodValue). Options: month, quarter, year',
          example: 'month'
        },
        {
          in: 'query',
          name: 'periodValue',
          schema: { type: 'string' },
          description: 'Period value matching periodType: month: "2025-01" (YYYY-MM), quarter: "2025-Q1" or "2025-1" (YYYY-QN or YYYY-N), year: "2025" (YYYY)',
          example: '2025-01'
        },
        {
          in: 'query',
          name: 'currencyId',
          schema: { type: 'string' },
          description: 'Currency ID (optional, uses default if not provided)'
        }
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'Legacy date range format (use if period filters not provided)',
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
        400: { description: 'Bad request - Either period filter (periodType + periodValue in URL) or date range (startDate + endDate) is required' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== TRIAL BALANCE ==========
  '/accounting/trial-balance': {
    get: {
      summary: 'Generate trial balance',
      description:
        'Supports period filters (month/quarter/year) via URL query parameters OR legacy date range. Period Filter Examples: Month: ?periodType=month&periodValue=2025-01, Quarter: ?periodType=quarter&periodValue=2025-Q1, Year: ?periodType=year&periodValue=2025. **Ordering:** accounts by type then account number; each account’s `transactions[]` by **journal `transactionDate` newest first** (then line id), aligned with the journal-entries list — not by row creation time.',
      tags: ['Trial Balance'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'periodType',
          schema: { type: 'string', enum: ['month', 'quarter', 'year'] },
          description: 'Period type filter (use with periodValue). Options: month, quarter, year',
          example: 'month'
        },
        {
          in: 'query',
          name: 'periodValue',
          schema: { type: 'string' },
          description: 'Period value matching periodType: month: "2025-01" (YYYY-MM), quarter: "2025-Q1" or "2025-1" (YYYY-QN or YYYY-N), year: "2025" (YYYY)',
          example: '2025-01'
        },
        {
          in: 'query',
          name: 'date',
          required: false,
          schema: { type: 'string', format: 'date' },
          description: 'Date for trial balance (YYYY-MM-DD) - legacy format. Defaults to current date if not provided.'
        },
        {
          in: 'query',
          name: 'startDate',
          schema: { type: 'string', format: 'date' },
          description: 'Start date for date range (legacy format - use if period filters not provided)'
        },
        {
          in: 'query',
          name: 'endDate',
          schema: { type: 'string', format: 'date' },
          description: 'End date for date range (legacy format - use if period filters not provided)'
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
      description: 'Supports period filters (month/quarter/year) via URL query parameters OR legacy date.',
      tags: ['Trial Balance'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'periodType',
          schema: { type: 'string', enum: ['month', 'quarter', 'year'] },
          description: 'Period type filter (use with periodValue)',
          example: 'month'
        },
        {
          in: 'query',
          name: 'periodValue',
          schema: { type: 'string' },
          description: 'Period value (month: "2025-01", quarter: "2025-Q1", year: "2025")',
          example: '2025-01'
        },
        {
          in: 'query',
          name: 'date',
          required: false,
          schema: { type: 'string', format: 'date' },
          description: 'Date for trial balance (YYYY-MM-DD) - legacy format. Defaults to current date if not provided.'
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
      description: 'Supports period filters (month/quarter/year) via URL query parameters OR legacy date.',
      tags: ['Trial Balance'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'periodType',
          schema: { type: 'string', enum: ['month', 'quarter', 'year'] },
          description: 'Period type filter (use with periodValue)',
          example: 'month'
        },
        {
          in: 'query',
          name: 'periodValue',
          schema: { type: 'string' },
          description: 'Period value (month: "2025-01", quarter: "2025-Q1", year: "2025")',
          example: '2025-01'
        },
        {
          in: 'query',
          name: 'date',
          required: false,
          schema: { type: 'string', format: 'date' },
          description: 'Date for trial balance (YYYY-MM-DD) - legacy format. Defaults to current date if not provided.'
        }
      ],
      responses: {
        200: { description: 'Trial balance by account type retrieved successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== GENERAL LEDGER DETAIL REPORT ==========
  '/accounting/gl-ledger-detail': {
    get: {
      summary: 'Generate General Ledger Detail Report with Running Balance',
      description: 'Generates a detailed General Ledger report for a specific GL account with running balance. The report shows all transactions (Debit or Credit) for the account with a running balance after each transaction, facilitating easy manual review and verification of the closing balance. Key Features: Shows all transactions for the specified GL account, calculates running balance after each transaction, includes opening balance and closing balance, supports filtering by date range (e.g., entire year), and shows transaction details (reference, description, type).',
      tags: ['General Ledger Reports'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'accountNo',
          required: true,
          schema: { type: 'string', example: '1100' },
          description: 'GL Account number (e.g., 1100 for Bank account)'
        },
        {
          in: 'query',
          name: 'startDate',
          required: true,
          schema: { type: 'string', format: 'date', example: '2025-01-01' },
          description: 'Start date of the reporting period (YYYY-MM-DD)'
        },
        {
          in: 'query',
          name: 'endDate',
          required: true,
          schema: { type: 'string', format: 'date', example: '2025-12-31' },
          description: 'End date of the reporting period (YYYY-MM-DD)'
        },
        {
          in: 'query',
          name: 'currencyId',
          required: false,
          schema: { type: 'string' },
          description: 'Optional currency ID to filter by currency'
        }
      ],
      responses: {
        200: {
          description: 'GL Detail report generated successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: { type: 'string', example: 'GL Detail report generated successfully' },
                  data: {
                    type: 'object',
                    properties: {
                      account: {
                        type: 'object',
                        properties: {
                          accountNo: { type: 'string', example: '1100' },
                          accountName: { type: 'string', example: 'Main Bank Account - USD' },
                          accountType: { type: 'string', example: 'Current Asset' },
                          openingBalance: { type: 'number', example: 10000.00, description: 'Balance at the start of the period' },
                          closingBalance: { type: 'number', example: 15000.00, description: 'Balance at the end of the period' }
                        }
                      },
                      period: {
                        type: 'object',
                        properties: {
                          startDate: { type: 'string', format: 'date', example: '2025-01-01' },
                          endDate: { type: 'string', format: 'date', example: '2025-12-31' }
                        }
                      },
                      transactions: {
                        type: 'array',
                        description: 'List of all transactions with running balance after each transaction',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            date: { type: 'string', format: 'date' },
                            reference: { type: 'string', example: 'JE-2025-001' },
                            description: { type: 'string' },
                            debitAmount: { type: 'number', example: 5000.00 },
                            creditAmount: { type: 'number', example: 0.00 },
                            runningBalance: { type: 'number', example: 15000.00, description: 'Running balance after this transaction' },
                            journalEntryId: { type: 'string' },
                            journalEntryStatus: { type: 'string', enum: ['POSTED', 'PENDING'] },
                            transactionType: { type: 'string', enum: ['Receipt', 'Payment', 'Invoice', 'Expense', 'Revenue', 'Manual Entry'] }
                          }
                        }
                      },
                      summary: {
                        type: 'object',
                        properties: {
                          totalDebits: { type: 'number', example: 25000.00 },
                          totalCredits: { type: 'number', example: 20000.00 },
                          netChange: { type: 'number', example: 5000.00, description: 'Net change in balance (Debits - Credits for Asset accounts, Credits - Debits for Liability/Equity accounts)' },
                          transactionCount: { type: 'number', example: 25 }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: 'Bad request - missing or invalid parameters' },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    }
  },

  // ========== ACCOUNTS PAYABLES - PURCHASE INVOICES ==========
  '/accounting/purchase-invoices/banks': {
    get: {
      summary: 'Get bank accounts',
      description: 'Retrieve all active bank accounts. Use these bank IDs when submitting or paying invoices with BANK payment method.',
      tags: ['Accounts Payables'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Banks retrieved successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Banks retrieved successfully',
                data: [
                  {
                    id: 'bank-id-1',
                    name: 'Main Bank Account - USD',
                    accountNumber: '1234567890',
                    bankCode: 'BANK001',
                    branchCode: 'BR001',
                    currency: {
                      id: 'currency-id-1',
                      code: 'USD',
                      symbol: '$',
                      name: 'US Dollar'
                    },
                    glAccount: {
                      id: 'gl-account-id-1',
                      accountNo: '1010',
                      accountName: 'Main Bank Account - USD'
                    },
                    isActive: true
                  },
                  {
                    id: 'bank-id-2',
                    name: 'Savings Account - USD',
                    accountNumber: '9876543210',
                    bankCode: 'BANK002',
                    branchCode: 'BR002',
                    currency: {
                      id: 'currency-id-1',
                      code: 'USD',
                      symbol: '$',
                      name: 'US Dollar'
                    },
                    glAccount: {
                      id: 'gl-account-id-2',
                      accountNo: '1020',
                      accountName: 'Savings Account - USD'
                    },
                    isActive: true
                  }
                ]
              }
            }
          }
        },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/purchase-invoices/expense-accounts': {
    get: {
      summary: 'Get expense accounts',
      description: 'Retrieve all active expense accounts from chart of accounts. Use these account IDs when submitting purchase invoices.',
      tags: ['Accounts Payables'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Expense accounts retrieved successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Expense accounts retrieved successfully',
                data: [
                  {
                    id: 'expense-account-id-1',
                    accountNo: '5000',
                    accountName: 'Rent Expense',
                    accountType: 'Expense',
                    financialStatement: 'Income Statement',
                    notes: 'Office lease',
                    isActive: true
                  },
                  {
                    id: 'expense-account-id-2',
                    accountNo: '5010',
                    accountName: 'Office Supplies Expense',
                    accountType: 'Expense',
                    financialStatement: 'Income Statement',
                    notes: 'Office supplies and materials',
                    isActive: true
                  },
                  {
                    id: 'expense-account-id-3',
                    accountNo: '5020',
                    accountName: 'Bank Charges',
                    accountType: 'Expense',
                    financialStatement: 'Income Statement',
                    notes: 'Transfer fees, account charges',
                    isActive: true
                  },
                  {
                    id: 'expense-account-id-4',
                    accountNo: '5030',
                    accountName: 'Salaries and Wages',
                    accountType: 'Expense',
                    financialStatement: 'Income Statement',
                    notes: 'Staff and executive payroll',
                    isActive: true
                  },
                  {
                    id: 'expense-account-id-5',
                    accountNo: '5040',
                    accountName: 'Utilities Expense',
                    accountType: 'Expense',
                    financialStatement: 'Income Statement',
                    notes: 'Electricity, water, internet',
                    isActive: true
                  },
                  {
                    id: 'expense-account-id-6',
                    accountNo: '5050',
                    accountName: 'Professional Fees',
                    accountType: 'Expense',
                    financialStatement: 'Income Statement',
                    notes: 'Legal, audit, advisory',
                    isActive: true
                  },
                  {
                    id: 'expense-account-id-7',
                    accountNo: '5060',
                    accountName: 'Marketing Expense',
                    accountType: 'Expense',
                    financialStatement: 'Income Statement',
                    notes: 'Branding, advertising, PR',
                    isActive: true
                  },
                  {
                    id: 'expense-account-id-8',
                    accountNo: '5070',
                    accountName: 'Travel Expense',
                    accountType: 'Expense',
                    financialStatement: 'Income Statement',
                    notes: 'Business travel, conferences',
                    isActive: true
                  },
                  {
                    id: 'expense-account-id-9',
                    accountNo: '5080',
                    accountName: 'Insurance Expense',
                    accountType: 'Expense',
                    financialStatement: 'Income Statement',
                    notes: 'Business insurance',
                    isActive: true
                  },
                  {
                    id: 'expense-account-id-10',
                    accountNo: '5090',
                    accountName: 'Other Operating Expenses',
                    accountType: 'Expense',
                    financialStatement: 'Income Statement',
                    notes: 'Miscellaneous operating costs',
                    isActive: true
                  }
                ]
              }
            }
          }
        },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/purchase-invoices': {
    post: {
      summary: 'Create a new purchase invoice',
      description: 'Create a purchase invoice for non-procurement expenses. This creates an Accounts Payable entry.',
      tags: ['Accounts Payables'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['vendorId', 'invoiceDate', 'currencyId', 'items'],
              properties: {
                vendorId: { type: 'string', example: 'vendor-id-here', description: 'Vendor ID' },
                invoiceDate: { type: 'string', format: 'date-time', example: '2025-01-15T00:00:00Z' },
                dueDate: { type: 'string', format: 'date-time', example: '2025-02-15T00:00:00Z' },
                currencyId: { type: 'string', example: 'currency-id-here' },
                description: { type: 'string', example: 'Office Supplies Purchase' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['itemName', 'quantity', 'unitPrice'],
                    properties: {
                      itemName: { type: 'string', example: 'Office Chairs' },
                      description: { type: 'string', example: 'Ergonomic office chairs' },
                      quantity: { type: 'number', example: 5 },
                      unitPrice: { type: 'number', example: 150.00 },
                      unit: { type: 'string', example: 'pcs' },
                      vatRate: { type: 'number', example: 0.155, description: 'VAT rate decimal (0.155 for 15.5%)' }
                    }
                  }
                },
                isTaxable: { type: 'boolean', example: true },
                invoiceNumber: { type: 'string', example: 'INV_20260115_0001' },
                notes: { type: 'string', example: 'Monthly office supplies order' }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Purchase invoice created successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Purchase invoice created successfully',
                data: {
                  id: 'invoice-id',
                  invoiceNumber: 'INV_20260115_0001',
                  vendorId: 'vendor-id',
                  subtotal: '1650.00',
                  vatAmount: '247.50',
                  totalAmount: '1897.50',
                  status: 'DRAFT',
                  paymentStatus: 'PENDING'
                }
              }
            }
          }
        },
        400: { description: 'Bad request - validation errors' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get all purchase invoices',
      description: 'Retrieve all purchase invoices with pagination and filtering',
      tags: ['Accounts Payables'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 10 }, description: 'Items per page' },
        { in: 'query', name: 'status', schema: { type: 'string', enum: ['DRAFT', 'POSTED'] }, description: 'Filter by status' },
        { in: 'query', name: 'paymentStatus', schema: { type: 'string', enum: ['PENDING', 'PAID', 'PARTIALLY_PAID'] }, description: 'Filter by payment status' }
      ],
      responses: {
        200: {
          description: 'Purchase invoices retrieved successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                data: {
                  invoices: [],
                  total: 0,
                  page: 1,
                  totalPages: 1
                }
              }
            }
          }
        },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/purchase-invoices/{id}': {
    get: {
      summary: 'Get purchase invoice by ID',
      tags: ['Accounts Payables'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Purchase invoice ID' }
      ],
      responses: {
        200: {
          description: 'Purchase invoice retrieved successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                data: {
                  id: 'invoice-id',
                  invoiceNumber: 'INV_20260115_0001',
                  vendor: { id: 'vendor-id', name: 'ABC Supplies Ltd' },
                  items: []
                }
              }
            }
          }
        },
        404: { description: 'Purchase invoice not found' },
        401: { description: 'Unauthorized' }
      }
    },
    put: {
      summary: 'Update purchase invoice',
      description: 'Update a purchase invoice. Only DRAFT invoices can be updated. Currency cannot be changed after invoice creation. If isTaxable is true, VAT will be calculated (15.5% default if not specified in items).',
      tags: ['Accounts Payables'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Purchase invoice ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                vendorId: { type: 'string', description: 'Vendor ID (can be changed)' },
                invoiceDate: { type: 'string', format: 'date-time' },
                dueDate: { type: 'string', format: 'date-time' },
                description: { type: 'string' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      itemName: { type: 'string' },
                      description: { type: 'string' },
                      quantity: { type: 'number' },
                      unitPrice: { type: 'number' },
                      unit: { type: 'string' },
                      vatRate: { type: 'number', description: 'VAT rate (0.155 for 15.5%). If not provided and isTaxable is true, defaults to 0.155' }
                    }
                  }
                },
                isTaxable: { type: 'boolean', description: 'If true, VAT will be calculated (15.5% default if not specified in items)' },
                notes: { type: 'string' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Purchase invoice updated successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Purchase invoice updated successfully',
                data: {
                  id: 'invoice-id',
                  invoiceNumber: 'INV_20260115_0001',
                  status: 'DRAFT',
                  vendor: { id: 'vendor-id', name: 'ABC Supplies Ltd' },
                  items: []
                }
              }
            }
          }
        },
        400: { description: 'Bad request - only DRAFT invoices can be updated, or currency cannot be changed' },
        401: { description: 'Unauthorized' }
      }
    },
    delete: {
      summary: 'Delete purchase invoice',
      description: 'Delete a purchase invoice. Only DRAFT invoices can be deleted.',
      tags: ['Accounts Payables'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Purchase invoice ID' }
      ],
      responses: {
        200: {
          description: 'Purchase invoice deleted successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Purchase invoice deleted successfully'
              }
            }
          }
        },
        400: { description: 'Bad request - only DRAFT invoices can be deleted' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/purchase-invoices/{id}/submit': {
    post: {
      summary: 'Submit invoice (creates journal entries based on payment method)',
      description: 'Submits a DRAFT invoice and creates journal entries based on payment method:\n- BANK: Dr Expense Account, Dr VAT Input (if applicable), Cr Bank Account (bankId required)\n- CASH: Dr Expense Account, Dr VAT Input (if applicable), Cr Petty Cash (1030)\n- CREDIT: Dr Expense Account, Dr VAT Input (if applicable), Cr Accounts Payable (2000)',
      tags: ['Accounts Payables'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Purchase invoice ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['paymentMethod', 'expenseAccountId'],
              properties: {
                paymentMethod: { 
                  type: 'string', 
                  enum: ['BANK', 'CASH', 'CREDIT'], 
                  example: 'CREDIT', 
                  description: 'Payment method for the invoice (dropdown selection)',
                  'x-enum-varnames': ['BANK', 'CASH', 'CREDIT']
                },
                expenseAccountId: { 
                  type: 'string', 
                  example: 'expense-account-id', 
                  description: 'The expense account to debit (e.g., Rent Expense, Office Supplies)' 
                },
                bankId: { 
                  type: 'string', 
                  example: 'bank-id-here', 
                  description: 'Bank ID (REQUIRED when paymentMethod is BANK, ignored for CASH/CREDIT)' 
                }
              }
            },
            examples: {
              bankPayment: {
                summary: 'Bank Payment Example',
                description: 'Example for BANK payment method (bankId is required)',
                value: {
                  paymentMethod: 'BANK',
                  expenseAccountId: 'expense-account-id-here',
                  bankId: 'bank-id-here'
                }
              },
              cashPayment: {
                summary: 'Cash Payment Example',
                description: 'Example for CASH payment method (bankId not needed)',
                value: {
                  paymentMethod: 'CASH',
                  expenseAccountId: 'expense-account-id-here'
                }
              },
              creditPayment: {
                summary: 'Credit Payment Example',
                description: 'Example for CREDIT payment method (bankId not needed)',
                value: {
                  paymentMethod: 'CREDIT',
                  expenseAccountId: 'expense-account-id-here'
                }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Invoice submitted successfully. Journal entry created based on payment method.',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Invoice submitted successfully',
                data: {
                  id: 'invoice-id',
                  status: 'POSTED',
                  paymentMethod: 'CREDIT',
                  paymentStatus: 'PENDING',
                  journalEntry: {
                    id: 'journal-entry-id',
                    referenceNumber: 'AP-CREDIT-INV_20260115_0001',
                    status: 'POSTED'
                  }
                }
              }
            }
          }
        },
        400: { description: 'Bad request - invoice must be in DRAFT status' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/accounting/purchase-invoices/{id}/pay': {
    post: {
      summary: 'Pay invoice (creates cashbook payment entry for CREDIT invoices only)',
      description: 'Pays a CREDIT invoice by creating a cashbook payment entry which automatically creates a journal entry:\n- BANK: Dr Accounts Payable, Cr Bank Account (bankId required)\n- CASH: Dr Accounts Payable, Cr Cash Account\nOnly invoices submitted with CREDIT payment method can be paid.',
      tags: ['Accounts Payables'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Purchase invoice ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['paymentMethod', 'paymentDate'],
              properties: {
                paymentMethod: { 
                  type: 'string', 
                  enum: ['BANK', 'CASH'], 
                  example: 'BANK', 
                  description: 'Payment method for paying the invoice (dropdown selection)',
                  'x-enum-varnames': ['BANK', 'CASH']
                },
                bankId: { 
                  type: 'string', 
                  example: 'bank-id-here', 
                  description: 'Bank ID (REQUIRED when paymentMethod is BANK, ignored for CASH)' 
                },
                paymentDate: { 
                  type: 'string', 
                  format: 'date-time', 
                  example: '2025-01-20T00:00:00Z', 
                  description: 'Payment date' 
                },
                paymentReference: { 
                  type: 'string', 
                  example: 'AP-PAY-BANK-INV_20260115_0001', 
                  description: 'Payment reference number' 
                },
                notes: { 
                  type: 'string', 
                  example: 'Payment for office supplies', 
                  description: 'Payment notes' 
                }
              }
            },
            examples: {
              bankPayment: {
                summary: 'Bank Payment Example',
                description: 'Example for BANK payment method (bankId is required)',
                value: {
                  paymentMethod: 'BANK',
                  bankId: 'bank-id-here',
                  paymentDate: '2025-01-20T00:00:00Z',
                  paymentReference: 'AP-PAY-BANK-INV_20260115_0001',
                  notes: 'Payment via bank transfer'
                }
              },
              cashPayment: {
                summary: 'Cash Payment Example',
                description: 'Example for CASH payment method (bankId not needed)',
                value: {
                  paymentMethod: 'CASH',
                  paymentDate: '2025-01-20T00:00:00Z',
                  paymentReference: 'AP-PAY-BANK-INV_20260115_0001',
                  notes: 'Cash payment'
                }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Invoice paid successfully. Cashbook payment entry created which automatically creates journal entry - Dr Accounts Payable, Cr Bank/Cash Account',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Invoice paid successfully',
                data: {
                  id: 'invoice-id',
                  paymentStatus: 'PAID',
                  paidAmount: '3220.00',
                  outstandingAmount: '0.00',
                  cashbookEntryId: 'cashbook-entry-id'
                }
              }
            }
          }
        },
        400: { description: 'Bad request - invoice must be submitted as CREDIT first, or bankId required when paymentMethod is BANK' },
        401: { description: 'Unauthorized' }
      }
    }
  }
};

