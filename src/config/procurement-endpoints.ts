// Comprehensive Procurement endpoints for fallback Swagger spec
export const procurementEndpoints = {
  // ========== PROCUREMENT - REQUISITIONS ==========
  '/api/procurement/requisitions': {
    post: {
      summary: 'Create a new purchase requisition',
      description: '**Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM)',
      tags: ['Procurement - Requisitions'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'items'],
              properties: {
                title: { type: 'string', example: 'Office Supplies Requisition' },
                description: { type: 'string', example: 'Monthly office supplies' },
                department: { type: 'string', enum: ['Finance', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT'] },
                priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], example: 'MEDIUM' },
                justification: { type: 'string', example: 'Essential operational expenses' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['itemName', 'quantity'],
                    properties: {
                      itemName: { type: 'string', example: 'Office Supplies Bundle' },
                      description: { type: 'string', example: 'Complete office supplies package' },
                      quantity: { type: 'number', example: 100 },
                      unit: { type: 'string', example: 'units' },
                      specifications: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        201: { 
          description: 'Purchase requisition created successfully',
          content: {
            'application/json': {
              example: {
                success: true,
                message: 'Purchase requisition created successfully',
                data: {
                  id: 'req-id',
                  requisitionNumber: 'REQ-2025-001',
                  status: 'DRAFT',
                  totalAmount: '0.00'
                }
              }
            }
          }
        },
        400: { description: 'Bad request - missing required fields' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get all purchase requisitions (filtered by user\'s department)',
      description: '**Required Role:** Department HEAD, DEPUTY, or PROC_MGR. Returns requisitions for the user\'s department only. Requisitions are filtered by the department they target.',
      tags: ['Procurement - Requisitions'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'status', schema: { type: 'string', enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CONVERTED_TO_PO'] }, description: 'Filter by status' },
        { in: 'query', name: 'requestedById', schema: { type: 'string' }, description: 'Filter by requester' },
        { in: 'query', name: 'priority', schema: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] }, description: 'Filter by priority' },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 50 }, description: 'Number of items to return' },
        { in: 'query', name: 'offset', schema: { type: 'integer', default: 0 }, description: 'Number of items to skip' }
      ],
      responses: {
        200: { description: 'List of purchase requisitions for the user\'s department' },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden - Only department HEAD, DEPUTY, or PROC_MGR can view requisitions' }
      }
    }
  },
  '/api/procurement/requisitions/my': {
    get: {
      summary: 'Get my purchase requisitions (created by logged-in user)',
      description: '**Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM)',
      tags: ['Procurement - Requisitions'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of purchase requisitions created by the logged-in user' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/procurement/requisitions/pending-approval': {
    get: {
      summary: 'Get pending requisitions for department head approval (their department only)',
      description: '**Required Role:** Department HEAD or DEPUTY (departmentRole: HEAD or DEPUTY) - Can view pending requisitions from their department only',
      tags: ['Procurement - Requisitions'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of pending requisitions for the department head\'s department' },
        401: { description: 'Unauthorized or user is not a department head' }
      }
    }
  },
  '/api/procurement/requisitions/{id}': {
    get: {
      summary: 'Get purchase requisition by ID',
      description: '**Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM)',
      tags: ['Procurement - Requisitions'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Requisition ID' }
      ],
      responses: {
        200: { description: 'Purchase requisition details' },
        404: { description: 'Requisition not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/procurement/requisitions/{id}/submit': {
    put: {
      summary: 'Submit a purchase requisition for approval',
      description: '**Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM). ⚠️ Once submitted, status becomes PENDING_APPROVAL and cannot be modified',
      tags: ['Procurement - Requisitions'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Requisition ID' }
      ],
      responses: {
        200: { description: 'Requisition submitted for approval' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/procurement/requisitions/{id}/approve': {
    put: {
      summary: 'Approve a purchase requisition',
      description: '**Required Role:** User\'s roleCode must match approval config roleCode (e.g., PROC_MGR, FIN_MGR) OR user must be department HEAD/DEPUTY for their department\'s requisitions. ⚠️ Once approved, status becomes APPROVED and cannot be modified',
      tags: ['Procurement - Requisitions'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Requisition ID' }
      ],
      responses: {
        200: { description: 'Requisition approved successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== PROCUREMENT - RFQ ==========
  '/api/procurement/rfq': {
    get: {
      summary: 'Get all RFQs',
      description: '**Required Role:** PROC_MGR, PROC_OFF, or BUYER. Retrieve all RFQs from the system',
      tags: ['Procurement - RFQ'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'rfqNumber', schema: { type: 'string' }, description: 'Filter by RFQ number' },
        { in: 'query', name: 'requisitionId', schema: { type: 'string' }, description: 'Filter by requisition ID' },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 50 }, description: 'Number of items to return' },
        { in: 'query', name: 'offset', schema: { type: 'integer', default: 0 }, description: 'Number of items to skip' }
      ],
      responses: {
        200: { description: 'RFQs retrieved successfully' },
        401: { description: 'Unauthorized' }
      }
    },
    post: {
      summary: 'Create and send RFQ to multiple vendors',
      description: '**Required Role:** PROC_MGR, PROC_OFF, or BUYER. Sends RFQ emails to all specified vendors with public quotation submission link',
      tags: ['Procurement - RFQ'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'vendorIds', 'items'],
              properties: {
                requisitionId: { type: 'string', description: 'Link to approved requisition' },
                title: { type: 'string', example: 'Office Supplies RFQ' },
                description: { type: 'string', description: 'Detailed description' },
                vendorIds: { type: 'array', items: { type: 'string' }, description: 'Array of vendor IDs to send RFQ to' },
                priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
                expectedDeliveryDate: { type: 'string', format: 'date' },
                deliveryAddress: { type: 'string' },
                rfqDeadline: { type: 'string', format: 'date', description: 'Deadline for vendors to respond' },
                specialRequirements: { type: 'string' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      itemName: { type: 'string' },
                      description: { type: 'string' },
                      quantity: { type: 'number' },
                      unit: { type: 'string' },
                      specifications: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'RFQ created and sent successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== PROCUREMENT - VENDOR QUOTATIONS ==========
  '/api/vendor-quotations/submit': {
    post: {
      summary: 'Submit a vendor quotation (PUBLIC - no authentication required)',
      description: '**Required Role:** PUBLIC (Vendors) - No authentication needed. Vendors use this endpoint to submit their quotes in response to an RFQ.',
      tags: ['Procurement - Vendor Quotations'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['vendorName', 'vendorEmail', 'items'],
              properties: {
                rfqNumber: { type: 'string', example: 'RFQ-1729012345-123' },
                requisitionId: { type: 'string' },
                vendorName: { type: 'string', example: 'John Doe' },
                vendorEmail: { type: 'string', format: 'email', example: 'john@vendor.com' },
                companyName: { type: 'string', example: 'ABC Supplies Ltd' },
                taxEIN: { type: 'string', example: '12-3456789' },
                contactPerson: { type: 'string' },
                phoneNumber: { type: 'string', example: '+263771234567' },
                address: { type: 'string' },
                validUntil: { type: 'string', format: 'date-time' },
                currencyCode: { type: 'string', default: 'USD', example: 'USD' },
                paymentTerms: { type: 'string', example: 'NET 30' },
                deliveryTerms: { type: 'string', example: 'FOB' },
                deliveryTime: { type: 'string', example: '3-5 business days' },
                notes: { type: 'string' },
                attachments: { type: 'object' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['itemName', 'quantity', 'unitPrice'],
                    properties: {
                      itemName: { type: 'string', example: 'Office Desk' },
                      description: { type: 'string', example: 'Executive wooden desk, 1.6m x 0.8m' },
                      quantity: { type: 'number', example: 10 },
                      unit: { type: 'string', example: 'pieces' },
                      unitPrice: { type: 'number', example: 250.00 },
                      specifications: { type: 'object' },
                      brand: { type: 'string', example: 'IKEA' },
                      model: { type: 'string', example: 'BEKANT' },
                      warranty: { type: 'string', example: '2 years' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Quotation submitted successfully' },
        400: { description: 'Bad request (validation error)' }
      }
    }
  },
  '/api/vendor-quotations': {
    get: {
      summary: 'Get all vendor quotations',
      description: '**Required Role:** PROC_MGR, PROC_OFF, or BUYER',
      tags: ['Procurement - Vendor Quotations'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'status', schema: { type: 'string', enum: ['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED'] } },
        { in: 'query', name: 'rfqNumber', schema: { type: 'string' } },
        { in: 'query', name: 'vendorEmail', schema: { type: 'string' } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 50 } },
        { in: 'query', name: 'offset', schema: { type: 'integer', default: 0 } }
      ],
      responses: {
        200: { description: 'List of vendor quotations' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/vendor-quotations/rfq/{rfqNumber}': {
    get: {
      summary: 'Get all quotations for a specific RFQ',
      description: '**Required Role:** PROC_MGR, PROC_OFF, or BUYER',
      tags: ['Procurement - Vendor Quotations'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'rfqNumber', required: true, schema: { type: 'string' }, description: 'RFQ number', example: 'RFQ-1729012345-123' }
      ],
      responses: {
        200: { description: 'List of quotations for the RFQ' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/vendor-quotations/{id}': {
    get: {
      summary: 'Get quotation by ID',
      description: '**Required Role:** PROC_MGR, PROC_OFF, or BUYER',
      tags: ['Procurement - Vendor Quotations'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Quotation ID' }
      ],
      responses: {
        200: { description: 'Quotation details' },
        404: { description: 'Quotation not found' },
        401: { description: 'Unauthorized' }
      }
    },
    delete: {
      summary: 'Delete a quotation',
      description: '**Required Role:** PROC_MGR or PROC_OFF. Delete a quotation (only if status is SUBMITTED - cannot delete if ACCEPTED or REJECTED)',
      tags: ['Procurement - Vendor Quotations'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Quotation ID' }
      ],
      responses: {
        200: { description: 'Quotation deleted successfully' },
        400: { description: 'Cannot delete reviewed quotation' },
        401: { description: 'Unauthorized' },
        404: { description: 'Quotation not found' }
      }
    }
  },
  '/api/vendor-quotations/{id}/accept': {
    post: {
      summary: 'Accept a vendor quotation',
      description: '**Required Role:** PROC_MGR or PROC_OFF. Accepts a quotation and automatically creates a Purchase Order. Once accepted, status becomes ACCEPTED and cannot be modified.',
      tags: ['Procurement - Vendor Quotations'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Quotation ID' }
      ],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                reviewNotes: { type: 'string', example: 'Best price and delivery time' },
                createPO: { type: 'boolean', default: true, description: 'Whether to automatically create a Purchase Order' },
                createInvoice: { type: 'boolean', default: false, description: 'Whether to automatically create an invoice' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Quotation accepted successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' },
        404: { description: 'Quotation not found' }
      }
    }
  },
  '/api/vendor-quotations/{id}/reject': {
    post: {
      summary: 'Reject a vendor quotation',
      description: '**Required Role:** PROC_MGR or PROC_OFF. ⚠️ Once rejected, status becomes REJECTED and cannot be modified',
      tags: ['Procurement - Vendor Quotations'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Quotation ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['rejectionReason'],
              properties: {
                rejectionReason: { type: 'string', example: 'Price too high' },
                reviewNotes: { type: 'string', example: 'Thank you for your submission' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Quotation rejected successfully' },
        400: { description: 'Bad request (missing rejection reason)' },
        401: { description: 'Unauthorized' },
        404: { description: 'Quotation not found' }
      }
    }
  },

  // ========== PROCUREMENT - PURCHASE ORDERS ==========
  '/api/procurement/purchase-orders': {
    post: {
      summary: 'Create a new purchase order',
      description: '**Required Role:** PROC_MGR or PROC_OFF. Creates a PO from a quotation or requisition. Automatically created when quotation is accepted.',
      tags: ['Procurement - Purchase Orders'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['vendorId', 'items'],
              properties: {
                requisitionId: { type: 'string', description: 'Source requisition ID' },
                quotationId: { type: 'string', description: 'Source quotation ID' },
                vendorId: { type: 'string', description: 'Vendor ID' },
                priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
                currencyId: { type: 'string', description: 'Currency ID' },
                expectedDeliveryDate: { type: 'string', format: 'date-time' },
                shippingAddress: { type: 'string' },
                paymentTerms: { type: 'string' },
                deliveryTerms: { type: 'string' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['itemName', 'quantity', 'unitPrice'],
                    properties: {
                      itemName: { type: 'string' },
                      description: { type: 'string' },
                      quantity: { type: 'number' },
                      unitPrice: { type: 'number' },
                      unit: { type: 'string' },
                      specifications: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Purchase order created successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get all purchase orders',
      description: '**Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM)',
      tags: ['Procurement - Purchase Orders'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'status', schema: { type: 'string', enum: ['DRAFT', 'SENT', 'ACKNOWLEDGED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] } },
        { in: 'query', name: 'vendorId', schema: { type: 'string' } },
        { in: 'query', name: 'priority', schema: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 50 } },
        { in: 'query', name: 'offset', schema: { type: 'integer', default: 0 } }
      ],
      responses: {
        200: { description: 'List of purchase orders' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/procurement/purchase-orders/{id}': {
    get: {
      summary: 'Get purchase order by ID',
      description: '**Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM)',
      tags: ['Procurement - Purchase Orders'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Purchase Order ID' }
      ],
      responses: {
        200: { description: 'Purchase order details' },
        404: { description: 'Purchase order not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/procurement/purchase-orders/{id}/send': {
    post: {
      summary: 'Send purchase order to vendor via email',
      description: '**Required Role:** PROC_MGR or PROC_OFF. ⚠️ Once sent, status becomes SENT and cannot be modified',
      tags: ['Procurement - Purchase Orders'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Purchase Order ID' }
      ],
      responses: {
        200: { description: 'Purchase order sent successfully' },
        400: { description: 'Bad request (PO already sent, vendor email missing, etc.)' },
        401: { description: 'Unauthorized' },
        404: { description: 'Purchase order not found' }
      }
    }
  },
  '/api/procurement/purchase-orders/{id}/convert-to-bill': {
    post: {
      summary: 'Convert a Purchase Order to a Creditor Bill (Invoice) in the Accounting module',
      description: '**Required Role:** PROC_MGR, PROC_OFF, or ACCOUNTANT',
      tags: ['Procurement - Purchase Orders'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Purchase Order ID' }
      ],
      responses: {
        200: { description: 'Purchase Order converted to Creditor Bill successfully' },
        400: { description: 'Bad request (PO not found, conversion failed, etc.)' },
        401: { description: 'Unauthorized' },
        404: { description: 'Purchase order not found' }
      }
    }
  },

  // ========== PROCUREMENT - GRN ==========
  '/api/procurement/goods-received-notes': {
    post: {
      summary: 'Create a goods received note',
      description: '**Required Role:** PROC_MGR, PROC_OFF, BUYER, or WAREHOUSE_MANAGER. Records received quantities, accepted quantities, and rejected quantities. Updates PO item quantities.',
      tags: ['Procurement - GRN'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['purchaseOrderId', 'items'],
              properties: {
                purchaseOrderId: { type: 'string', description: 'Purchase order ID' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['purchaseOrderItemId', 'quantityReceived', 'quantityAccepted', 'quantityRejected', 'qualityStatus'],
                    properties: {
                      purchaseOrderItemId: { type: 'string' },
                      quantityReceived: { type: 'number' },
                      quantityAccepted: { type: 'number' },
                      quantityRejected: { type: 'number' },
                      qualityStatus: { type: 'string', enum: ['PENDING', 'PASSED', 'FAILED', 'CONDITIONAL'] },
                      qualityNotes: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Goods received note created successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/procurement/goods-received-notes/{id}': {
    get: {
      summary: 'Get goods received note by ID',
      description: '**Required Role:** PROC_MGR, PROC_OFF, BUYER, or WAREHOUSE_MANAGER',
      tags: ['Procurement - GRN'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'GRN ID' }
      ],
      responses: {
        200: { description: 'GRN details' },
        404: { description: 'GRN not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== PROCUREMENT - INVOICES ==========
  '/api/procurement/invoices': {
    post: {
      summary: 'Create a new procurement invoice (PUBLIC - vendors submit invoices)',
      description: '**PUBLIC ENDPOINT** - Vendors submit invoices without authentication. This is the vendor\'s way to submit invoices.',
      tags: ['Procurement - Invoices'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['vendorId', 'invoiceDate', 'items'],
              properties: {
                purchaseOrderId: { type: 'string', description: 'Related purchase order ID' },
                vendorId: { type: 'string', description: 'Vendor ID' },
                invoiceDate: { type: 'string', format: 'date-time', description: 'Invoice date' },
                dueDate: { type: 'string', format: 'date-time', description: 'Due date' },
                currencyId: { type: 'string', description: 'Currency ID' },
                documentPath: { type: 'string', description: 'Path to uploaded document' },
                documentType: { type: 'string', description: 'Document type (PDF, IMAGE, etc.)' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['itemName', 'quantity', 'unitPrice'],
                    properties: {
                      itemName: { type: 'string' },
                      description: { type: 'string' },
                      quantity: { type: 'number' },
                      unitPrice: { type: 'number' },
                      unit: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Procurement invoice created successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    },
    get: {
      summary: 'Get all procurement invoices',
      description: '**Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM)',
      tags: ['Procurement - Invoices'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'status', schema: { type: 'string', enum: ['RECEIVED', 'PROCESSING', 'MATCHED', 'DISCREPANCY', 'APPROVED', 'PAID', 'REJECTED'] } },
        { in: 'query', name: 'vendorId', schema: { type: 'string' } },
        { in: 'query', name: 'matchingStatus', schema: { type: 'string', enum: ['PENDING', 'MATCHED', 'DISCREPANCY', 'MANUAL_REVIEW'] } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 50 } },
        { in: 'query', name: 'offset', schema: { type: 'integer', default: 0 } }
      ],
      responses: {
        200: { description: 'List of procurement invoices' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/procurement/invoices/{id}': {
    get: {
      summary: 'Get procurement invoice by ID',
      description: '**Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM)',
      tags: ['Procurement - Invoices'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Invoice ID' }
      ],
      responses: {
        200: { description: 'Invoice details' },
        404: { description: 'Invoice not found' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/procurement/invoices/{id}/approve': {
    put: {
      summary: 'Approve a procurement invoice',
      description: '**Required Role:** User\'s roleCode must match approval config roleCode (e.g., FIN_MGR, PROC_MGR). ⚠️ Once approved, status becomes APPROVED and cannot be modified. Accounting entries created on payment, not approval.',
      tags: ['Procurement - Invoices'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Invoice ID' }
      ],
      responses: {
        200: { description: 'Invoice approved successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== PROCUREMENT - PAYMENTS ==========
  '/api/procurement/invoices/{id}/payment': {
    post: {
      summary: 'Process payment for an approved procurement invoice',
      description: '**Required Role:** FIN_MGR, PROC_MGR, or ACCOUNTANT. Creates accounting entries: Expense Recognition (Dr. Expense, Dr. VAT, Cr. AP) and Payment Processing (Dr. AP, Cr. Bank/Cash)',
      tags: ['Procurement - Payments'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Invoice ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['paymentAmount', 'paymentMethod'],
              properties: {
                paymentAmount: { type: 'number', description: 'Amount to pay (can be partial or full)', example: 5725.00 },
                paymentDate: { type: 'string', format: 'date-time', description: 'Date of payment (defaults to current date)', example: '2025-10-14T10:00:00Z' },
                paymentMethod: { type: 'string', enum: ['CASH', 'BANK'], description: 'Payment method', example: 'BANK' },
                bankAccountId: { type: 'string', description: 'Specific bank account ID (e.g., ZIG account). If not provided, uses default.', example: 'cmg97iy320003ung8aau6zqbv' },
                paymentReference: { type: 'string', description: 'Bank transaction reference number', example: 'TXN-12345-2025' },
                notes: { type: 'string', description: 'Additional payment notes', example: 'Paid via CBZ Bank' }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Payment processed successfully' },
        400: { description: 'Bad request (invalid amount, already paid, etc.)' },
        401: { description: 'Unauthorized' },
        404: { description: 'Invoice not found' }
      }
    }
  },

  // ========== PROCUREMENT - DASHBOARD ==========
  '/api/procurement/dashboard': {
    get: {
      summary: 'Get procurement dashboard data',
      description: '**Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM)',
      tags: ['Procurement - Dashboard'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Dashboard data retrieved successfully' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== PROCUREMENT - APPROVAL CONFIGURATION ==========
  '/api/procurement-approval-configs': {
    get: {
      summary: 'Get the procurement approval configuration',
      description: '**Required Role:** PROC_MGR, PROC_OFF, or ADMIN. Gets the ONE and ONLY approval configuration in the system.',
      tags: ['Procurement - Approval Configuration'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Procurement approval configuration retrieved successfully' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/api/procurement-approval-configs/{id}': {
    put: {
      summary: 'Update the procurement approval configuration',
      description: '**Required Role:** ADMIN or PROC_MGR. Update the ONE and ONLY approval configuration. System enforces only ONE config exists.',
      tags: ['Procurement - Approval Configuration'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Configuration ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'stages'],
              properties: {
                name: { type: 'string', description: 'Configuration name' },
                description: { type: 'string', description: 'Configuration description' },
                department: { type: 'string', enum: ['Finance', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT'], description: 'Department-specific config (null for general/default config)' },
                stages: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['stageType', 'steps'],
                    properties: {
                      stageType: { type: 'string', enum: ['PURCHASE_REQUISITION', 'PURCHASE_ORDER', 'INVOICE', 'GRN'] },
                      steps: {
                        type: 'array',
                        items: {
                          type: 'object',
                          required: ['stepNumber', 'stepName', 'stepType'],
                          properties: {
                            stepNumber: { type: 'integer', description: 'Step number (must be sequential)' },
                            stepName: { type: 'string', description: 'Step name' },
                            stepType: { type: 'string', enum: ['USER', 'ROLE', 'DEPARTMENT', 'AMOUNT_THRESHOLD'] },
                            roleCode: { type: 'string', description: 'Hardcoded role code (FIN_MGR, PROC_OFF, etc.) - Use this for stepType ROLE' },
                            isRequired: { type: 'boolean', default: true },
                            approvalOrder: { type: 'string', enum: ['SEQUENTIAL', 'PARALLEL'], default: 'SEQUENTIAL' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Procurement approval configuration updated successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' },
        404: { description: 'Configuration not found' }
      }
    }
  }
};

