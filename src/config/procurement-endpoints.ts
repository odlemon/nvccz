// Comprehensive Procurement endpoints for fallback Swagger spec
export const procurementEndpoints = {
  // ========== PROCUREMENT - REQUISITIONS ==========
  '/procurement/requisitions': {
    post: {
      summary: 'Create a new purchase requisition',
      description: '**Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM)',
      tags: ['Procurement - Requisitions', 'Investee Portal — Investment Drawdown'],
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
                portfolioCompanyId: { type: 'string', description: 'Suite 02: links PR to portfolio company for drawdown cap' },
                fundId: { type: 'string', description: 'Suite 02: optional fund scope' },
                useOfFundsDocumentUrl: { type: 'string', description: 'Suite 02: use of funds / business case URL' },
                sourcingCategory: { type: 'string', description: 'Aligns with vendor.category for RFQ (e.g. IT_SERVICES)' },
                drawdownRequestAmount: { type: 'number', description: 'Suite 02: required with portfolioCompanyId' },
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
      description: '**Required Role:** Department HEAD, DEPUTY, or PROC_MGR. Returns requisitions for the user\'s department only. Requisitions are filtered by the department they target. **Suite 02:** investee-linked rows are further scoped by fund for FundManagers (CFO/SYSADMIN/PROC_MGR see all).',
      tags: ['Procurement - Requisitions', 'Investee Portal — Investment Drawdown'],
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
  '/procurement/requisitions/my': {
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
  '/procurement/requisitions/pending-approval': {
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
  '/procurement/requisitions/{id}': {
    get: {
      summary: 'Get purchase requisition by ID',
      description: '**Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM). **Suite 02:** investee-linked PRs require portfolio owner, requester, CFO/SYSADMIN/PROC_MGR, or FundManager for that fund.',
      tags: ['Procurement - Requisitions', 'Investee Portal — Investment Drawdown'],
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
  '/procurement/requisitions/{id}/submit': {
    put: {
      summary: 'Submit a purchase requisition for approval',
      description: '**Standard:** status becomes PENDING_APPROVAL. **Suite 02 (investee PR):** portfolio owner only; requires useOfFundsDocumentUrl; status PENDING_VC_EXECUTIVE_REVIEW; notifies procurement desk.',
      tags: ['Procurement - Requisitions', 'Investee Portal — Investment Drawdown'],
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
  '/procurement/requisitions/{id}/approve': {
    put: {
      summary: 'Approve a purchase requisition',
      description: '**Department PR:** HEAD/DEPUTY or configured role. **Suite 02 (PENDING_VC_EXECUTIVE_REVIEW):** only **CFO** or **SYSADMIN**; triggers auto-RFQ to eligible vendors.',
      tags: ['Procurement - Requisitions', 'Investee Portal — Investment Drawdown'],
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
  '/procurement/requisitions/{id}/reject': {
    put: {
      summary: 'Reject a purchase requisition',
      description: '**Department PR:** HEAD/DEPUTY. **Suite 02 (PENDING_VC_EXECUTIVE_REVIEW):** only **CFO** or **SYSADMIN**; body requires rejectionReason.',
      tags: ['Procurement - Requisitions', 'Investee Portal — Investment Drawdown'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Requisition ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['rejectionReason'],
              properties: {
                rejectionReason: {
                  type: 'string',
                  description: 'Reason for rejecting the requisition',
                  example: 'Budget reallocated'
                }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Requisition rejected successfully' },
        400: { description: 'Bad request (missing reason or invalid state)' },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden - only department HEAD or DEPUTY can reject' }
      }
    }
  },

  // ========== PROCUREMENT - RFQ ==========
  '/procurement/rfq': {
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
  '/vendor-quotations/submit': {
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
  '/vendor-quotations': {
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
  '/vendor-quotations/rfq/{rfqNumber}': {
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
  '/vendor-quotations/{id}': {
    get: {
      summary: 'Get quotation by ID',
      description: '**Required Role:** PROC_MGR, PROC_OFF, or BUYER',
      tags: ['Procurement - Vendor Quotations'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Quotation ID' }
      , { in: 'query', name: 'reviewNotes', schema: { type: 'string' }, description: 'Optional internal notes about acceptance', example: 'Best price and delivery time' }
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
  '/vendor-quotations/{id}/accept': {
    post: {
      summary: 'Accept a vendor quotation',
      description: '**Required Role:** PROC_MGR or PROC_OFF. Accepts a quotation and automatically creates a Purchase Order. Once accepted, status becomes ACCEPTED and cannot be modified.',
      tags: ['Procurement - Vendor Quotations'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Quotation ID' }
      ],
      responses: {
        200: { description: 'Quotation accepted successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' },
        404: { description: 'Quotation not found' }
      }
    }
  },
  '/vendor-quotations/{id}/reject': {
    post: {
      summary: 'Reject a vendor quotation',
      description: '**Required Role:** PROC_MGR or PROC_OFF',
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

  // ========== PROCUREMENT - INVOICES ==========
  '/procurement/invoices': {
    post: {
      summary: 'Create a new procurement invoice (PUBLIC)',
      description: '**PUBLIC ENDPOINT** - Vendors submit invoices without authentication.',
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
        400: { description: 'Bad request' }
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
  '/procurement/invoices/{id}/approve': {
    put: {
      summary: 'Approve a procurement invoice',
      description: '**Required Role:** User\'s roleCode must match approval config roleCode (e.g., FIN_MGR, PROC_MGR). ⚠️ Once approved, status becomes APPROVED and cannot be modified. Accounting entries created on payment, not approval. **Use this endpoint to set taxable status and tax rate/amount.**',
      tags: ['Procurement - Invoices'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Invoice ID' }
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                isTaxable: {
                  type: 'boolean',
                  description: 'Whether the invoice is taxable. If true, VAT will be calculated automatically using the standard VAT rate (15.5%). If false, tax amount will be set to 0. If not provided, existing invoice tax amounts will be kept.',
                  example: true
                }
              }
            },
            examples: {
              taxable: {
                summary: 'Taxable invoice (VAT calculated automatically at 15.5%)',
                value: {
                  isTaxable: true
                }
              },
              nonTaxable: {
                summary: 'Non-taxable invoice',
                value: {
                  isTaxable: false
                }
              }
            }
          }
        }
      },
      responses: {
        200: { description: 'Invoice approved successfully' },
        400: { description: 'Bad request (invalid tax rate/amount, missing required fields, etc.)' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== PROCUREMENT - PAYMENTS ==========
  '/procurement/invoices/{id}/payment': {
    post: {
      summary: 'Process payment for an approved procurement invoice',
      description: '**Required Role:** FIN_MGR, PROC_MGR, or ACCOUNTANT. Creates accounting entries: Expense Recognition (Dr. Expense, Dr. VAT if taxable, Cr. AP) and Payment Processing (Dr. AP, Cr. Bank/Cash). Supports full and partial payments. Taxable status is automatically determined from invoice tax amount. **Proof of payment file is required** (PDF or image).',
      tags: ['Procurement - Payments'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Invoice ID' }
      ],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['paymentAmount', 'paymentMethod', 'proofOfPayment'],
              properties: {
                paymentAmount: { type: 'number', description: 'Amount to pay (can be partial or full). For partial payments, remaining balance will be tracked.', example: 5725.00 },
                paymentDate: { type: 'string', format: 'date-time', description: 'Date of payment (defaults to current date)', example: '2025-10-14T10:00:00Z' },
                paymentMethod: { type: 'string', enum: ['CASH', 'BANK'], description: 'Payment method', example: 'BANK' },
                bankAccountId: { type: 'string', description: 'Specific bank account ID (e.g., ZIG account). If not provided, uses default.', example: 'cmg97iy320003ung8aau6zqbv' },
                paymentReference: { type: 'string', description: 'Bank transaction reference number', example: 'TXN-12345-2025' },
                proofOfPayment: { type: 'string', format: 'binary', description: 'Proof of payment document (PDF or image: JPG, PNG, GIF, WEBP). Required. Max size: 10MB.', example: 'Receipt or bank statement file' },
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
  '/procurement/payments': {
    get: {
      summary: 'Get all procurement invoice payments',
      description: '**Required Role:** ANY user in Procurement or Finance department. Returns all paid and partially paid invoices with payment details including journal entries.',
      tags: ['Procurement - Invoices'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'paymentStatus', schema: { type: 'string', enum: ['PAID', 'PARTIALLY_PAID'] }, description: 'Filter by payment status' },
        { in: 'query', name: 'vendorId', schema: { type: 'string' }, description: 'Filter by vendor ID' },
        { in: 'query', name: 'paymentMethod', schema: { type: 'string', enum: ['BANK', 'CASH'] }, description: 'Filter by payment method (BANK or CASH)' },
        { in: 'query', name: 'startDate', schema: { type: 'string', format: 'date' }, description: 'Filter payments from this date (YYYY-MM-DD)' },
        { in: 'query', name: 'endDate', schema: { type: 'string', format: 'date' }, description: 'Filter payments until this date (YYYY-MM-DD)' },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 50 }, description: 'Number of items to return' },
        { in: 'query', name: 'offset', schema: { type: 'integer', default: 0 }, description: 'Number of items to skip' }
      ],
      responses: {
        200: { description: 'Payments retrieved successfully' },
        401: { description: 'Unauthorized' },
        500: { description: 'Internal server error' }
      }
    }
  },
  '/procurement/dashboard': {
    get: {
      summary: 'Get procurement dashboard data with detailed information',
      description: '**Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM). Includes **suite02InvesteeDrawdown** (SLA list) when authenticated. Recent requisitions respect Suite 02 fund visibility for FundManagers.',
      tags: ['Procurement - Dashboard', 'Investee Portal — Investment Drawdown'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Dashboard data retrieved successfully. Returns detailed statistics, recent items, and analytics for requisitions, invoices, RFQs, quotations, payments, and top vendors.' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  '/procurement/requisitions/investee': {
    get: {
      summary: 'List investee (portfolio-linked) purchase requisitions (Suite 02)',
      description:
        '**Scope:** CFO, SYSADMIN, or PROC_MGR see all; active **FundManager** users only see PRs for their fund(s). Others receive 403.',
      tags: ['Investee Portal — Investment Drawdown'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'List of investee PRs' },
        401: { description: 'Unauthorized' },
        403: { description: 'Not authorized for investee drawdown list' }
      }
    }
  },
  '/procurement/requisitions/investee/sla-breached': {
    get: {
      summary: 'Investee PRs pending VC executive review longer than 48 hours (Suite 02 SLA)',
      description: 'Same fund scope as `/procurement/requisitions/investee`.',
      tags: ['Investee Portal — Investment Drawdown'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'SLA breach list' },
        401: { description: 'Unauthorized' },
        403: { description: 'Forbidden' }
      }
    }
  },

  '/applicant/procurement/drawdown': {
    get: {
      summary: 'Investee drawdown summary and PR ledger (Suite 02)',
      description:
        'Committed / reserved / available tranche amounts plus PR rows. **Auth:** applicant with portfolio company.',
      tags: ['Investee Portal — Investment Drawdown', 'Applicant Portal'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Drawdown caps + requisitions + ledger fields' },
        401: { description: 'Unauthorized' },
        403: { description: 'Not an applicant' },
        404: { description: 'No portfolio company' }
      }
    }
  },
  '/applicant/procurement/requisitions': {
    post: {
      summary: 'Create investee purchase requisition (draft) (Suite 02)',
      description:
        'Requires `drawdownRequestAmount`, `useOfFundsDocumentUrl`, and line items. Links to caller’s portfolio company.',
      tags: ['Investee Portal — Investment Drawdown', 'Applicant Portal'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'items', 'drawdownRequestAmount', 'useOfFundsDocumentUrl'],
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
                justification: { type: 'string' },
                sourcingCategory: { type: 'string', example: 'IT_SERVICES' },
                drawdownRequestAmount: { type: 'number', example: 5000 },
                useOfFundsDocumentUrl: { type: 'string', format: 'uri' },
                department: {
                  type: 'string',
                  enum: ['Finance', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT']
                },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['itemName', 'quantity'],
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
        201: { description: 'Draft PR created' },
        400: { description: 'Validation error' },
        401: { description: 'Unauthorized' },
        403: { description: 'Not an applicant' },
        404: { description: 'No portfolio company' }
      }
    }
  },
  '/applicant/procurement/requisitions/{id}/submit': {
    put: {
      summary: 'Submit investee PR for VC executive review (Suite 02)',
      description: 'Investee portal user for the portfolio company only. Sets PENDING_VC_EXECUTIVE_REVIEW.',
      tags: ['Investee Portal — Investment Drawdown', 'Applicant Portal'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Requisition ID' }
      ],
      responses: {
        200: { description: 'Submitted' },
        400: { description: 'Validation / tranche exceeded' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/applicant/procurement/requisitions/{id}/cancel': {
    post: {
      summary: 'Cancel investee PR before RFQ award — returns to DRAFT (Suite 02)',
      description: 'Allowed for DRAFT or PENDING_VC_EXECUTIVE_REVIEW only.',
      tags: ['Investee Portal — Investment Drawdown', 'Applicant Portal'],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Requisition ID' }
      ],
      responses: {
        200: { description: 'Returned to DRAFT' },
        400: { description: 'Invalid state' },
        401: { description: 'Unauthorized' }
      }
    }
  },

  // ========== PROCUREMENT - APPROVAL CONFIGURATION ==========
  '/procurement-approval-configs': {
    get: {
      summary: 'Get the procurement approval configuration',
      description: '**Required Role:** PROC_MGR, PROC_OFF, or ADMIN. Gets the ONE and ONLY approval configuration in the system.',
      tags: ['Procurement - Approval Configuration'],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Procurement approval configuration retrieved successfully' },
        401: { description: 'Unauthorized' }
      }
    },
    post: {
      summary: 'Create the procurement approval configuration',
      description: '**Required Role:** ADMIN. System only allows one config—use this once to seed it. Setting `department` ties the workflow to that department.',
      tags: ['Procurement - Approval Configuration'],
      security: [{ bearerAuth: [] }],
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
                department: { type: 'string', enum: ['Finance', 'Operations', 'Procurement', 'Human Resources', 'Marketing', 'Legal', 'IT'], description: 'Department-specific config (null for shared/default)' },
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
                            roleCode: { type: 'string', description: 'Hardcoded role code (PROC_MGR, FIN_MGR, etc.) when stepType is ROLE' },
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
        201: { description: 'Procurement approval configuration created successfully' },
        400: { description: 'Bad request / config already exists' },
        401: { description: 'Unauthorized' }
      }
    }
  },
  '/procurement-approval-configs/{id}': {
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



