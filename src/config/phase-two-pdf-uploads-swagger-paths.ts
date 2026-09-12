/**
 * Phase 2 — unified vendor PDF attachments for quotations and invoices.
 */

export const PHASE_TWO_PDF_UPLOADS_TAG = 'Phase two PDF uploads';

const TAG = [PHASE_TWO_PDF_UPLOADS_TAG];

/**
 * Live examples from `npm run uat:procurement:pdf-full` (2026-06-14).
 * Refresh by re-running UAT and updating these ids.
 */
const EX = {
  vendor_id: 'cmqdusfc80034un7gy5yrjz7c',
  rfq_number: 'RFQ_20260614_0008',
  procurement_rfq_id: 'cmqduter1003iun7g41unyukc',
  staged_attachment_id: 'cmqdutq31003oun7ggezsqcz5',
  quotation_id: 'cmqdutv7h003sun7gq1x8k3pj',
  purchase_order_id: 'cmqduv0300047un7gep2qw4p0',
  procurement_invoice_id: 'cmqduvyks004iun7guwmrqi4z',
  staff_attachment_id: 'cmqduuu2v0043un7gjhulm09b',
  sha256_example: '3db5b7164985c196539156ee979081715b994c47c3e8e5b1756500dc5a410e1b'
};

const ALLOWED_FILE_TYPES_EXAMPLE = [
  {
    mimeType: 'application/pdf',
    extensions: ['pdf'],
    label: 'PDF Document',
    enabled: true
  }
];

const ATTACHMENT_RESPONSE = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    entityType: {
      type: 'string',
      enum: ['VENDOR_QUOTATION', 'PROCUREMENT_INVOICE', 'PURCHASE_INVOICE']
    },
    entityId: { type: 'string', nullable: true },
    vendorId: { type: 'string', nullable: true },
    fileName: { type: 'string' },
    originalFileName: { type: 'string' },
    mimeType: { type: 'string', example: 'application/pdf' },
    fileSizeBytes: { type: 'integer', example: 245760 },
    sha256Checksum: { type: 'string', example: 'a3b2c1d4e5f6789012345678901234567890abcd1234567890abcd12345678' },
    status: { type: 'string', enum: ['ACTIVE', 'SUPERSEDED', 'DELETED'] },
    version: { type: 'integer', example: 1 },
    uploadSource: { type: 'string', enum: ['VENDOR_PORTAL', 'STAFF'] },
    createdAt: { type: 'string', format: 'date-time' }
  }
};

export const phaseTwoPdfUploadsSwaggerPaths = {
  '/procurement/document-attachments/settings/public': {
    get: {
      tags: TAG,
      summary: 'Public upload constraints (vendor portal)',
      description:
        'Returns max file size and enabled MIME types for vendor portal UI. Attachments are **optional** on submit; PDF must remain an allowed type when configured.',
      responses: {
        200: {
          description: '{ success, data: { maxFileSizeBytes, maxAttachmentsPerRecord, allowedFileTypes } }',
          content: {
            'application/json': {
              example: {
                success: true,
                data: {
                  maxFileSizeBytes: 15728640,
                  maxAttachmentsPerRecord: 5,
                  allowedFileTypes: ALLOWED_FILE_TYPES_EXAMPLE
                }
              }
            }
          }
        }
      }
    }
  },

  '/procurement/document-attachments/settings': {
    get: {
      tags: TAG,
      summary: 'Get document upload settings (staff)',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Full settings including admin fields',
          content: {
            'application/json': {
              example: {
                success: true,
                data: {
                  id: 'default',
                  maxFileSizeBytes: 15728640,
                  maxAttachmentsPerRecord: 5,
                  allowedFileTypes: ALLOWED_FILE_TYPES_EXAMPLE
                }
              }
            }
          }
        }
      }
    },
    put: {
      tags: TAG,
      summary: 'Update document upload settings (staff)',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                maxFileSizeBytes: { type: 'integer', example: 15728640 },
                maxAttachmentsPerRecord: { type: 'integer', example: 5 },
                allowedFileTypes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      mimeType: { type: 'string' },
                      extensions: { type: 'array', items: { type: 'string' } },
                      label: { type: 'string' },
                      enabled: { type: 'boolean' }
                    }
                  }
                }
              }
            },
            example: {
              maxFileSizeBytes: 15728640,
              maxAttachmentsPerRecord: 5,
              allowedFileTypes: ALLOWED_FILE_TYPES_EXAMPLE
            }
          }
        }
      },
      responses: { 200: { description: 'Settings updated' }, 400: { description: 'PDF must stay enabled' } }
    }
  },

  '/procurement/document-attachments/portal/upload': {
    post: {
      tags: TAG,
      summary: 'Portal upload (token-bound)',
      description:
        'Multipart **`document`** + **`vendorPortalToken`** + **`entityType`** (`VENDOR_QUOTATION` or `PROCUREMENT_INVOICE`). ' +
        'Returns **`attachmentId`** to pass as **`attachmentIds`** on quotation submit or procurement invoice create. ' +
        'Validates size, MIME, PDF magic bytes, SHA-256 checksum.',
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['document', 'vendorPortalToken', 'entityType'],
              properties: {
                document: { type: 'string', format: 'binary' },
                vendorPortalToken: { type: 'string' },
                entityType: {
                  type: 'string',
                  enum: ['VENDOR_QUOTATION', 'PROCUREMENT_INVOICE']
                },
                entityId: { type: 'string', description: 'Optional — link immediately to existing record' }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: 'Upload succeeded',
          content: {
            'application/json': {
              example: {
                success: true,
                data: {
                  id: EX.staged_attachment_id,
                  entityType: 'VENDOR_QUOTATION',
                  entityId: null,
                  vendorId: EX.vendor_id,
                  fileName: 'quote-uat.pdf',
                  originalFileName: 'quote-uat.pdf',
                  mimeType: 'application/pdf',
                  fileSizeBytes: 61,
                  sha256Checksum: EX.sha256_example,
                  status: 'ACTIVE',
                  version: 1,
                  uploadSource: 'VENDOR_PORTAL',
                  portalTokenKind: 'RFQ_SUBMIT'
                }
              }
            }
          }
        }
      }
    }
  },

  '/procurement/document-attachments/portal/{attachmentId}/download': {
    get: {
      tags: TAG,
      summary: 'Portal secure download',
      parameters: [
        { in: 'path', name: 'attachmentId', required: true, schema: { type: 'string', example: EX.staff_attachment_id } },
        { in: 'query', name: 'vendorPortalToken', required: true, schema: { type: 'string', description: 'Signed RFQ_SUBMIT or PO_VENDOR_INVOICE token' } }
      ],
      responses: {
        200: { description: 'File bytes (checksum verified)' },
        403: { description: 'Token/vendor mismatch' }
      }
    }
  },

  '/procurement/document-attachments/quotations/{quotationId}/attachments': {
    post: {
      tags: TAG,
      summary: 'Staff upload to quotation',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'quotationId', required: true, schema: { type: 'string', example: EX.quotation_id } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['document'],
              properties: { document: { type: 'string', format: 'binary' } }
            }
          }
        }
      },
      responses: { 201: { description: 'Attachment linked', content: { 'application/json': { schema: ATTACHMENT_RESPONSE } } } }
    }
  },

  '/procurement/document-attachments/procurement-invoices/{invoiceId}/attachments': {
    post: {
      tags: TAG,
      summary: 'Staff upload to procurement invoice',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'invoiceId', required: true, schema: { type: 'string', example: EX.procurement_invoice_id } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['document'],
              properties: { document: { type: 'string', format: 'binary' } }
            }
          }
        }
      },
      responses: { 201: { description: 'Attachment linked; syncs documentPath on invoice' } }
    }
  },

  '/procurement/document-attachments/purchase-invoices/{invoiceId}/attachments': {
    post: {
      tags: TAG,
      summary: 'Staff upload to accounting purchase invoice (AP bill)',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'invoiceId', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['document'],
              properties: { document: { type: 'string', format: 'binary' } }
            }
          }
        }
      },
      responses: { 201: { description: 'Attachment linked to PurchaseInvoice' } }
    }
  },

  '/procurement/document-attachments/by-entity/{entityType}/{entityId}': {
    get: {
      tags: TAG,
      summary: 'List attachments for a record',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'entityType',
          required: true,
          schema: { type: 'string', enum: ['VENDOR_QUOTATION', 'PROCUREMENT_INVOICE', 'PURCHASE_INVOICE'] }
        },
        { in: 'path', name: 'entityId', required: true, schema: { type: 'string', example: EX.quotation_id } }
      ],
      responses: {
        200: {
          description: 'Active attachments',
          content: {
            'application/json': {
              example: {
                success: true,
                data: [
                  {
                    id: EX.staff_attachment_id,
                    entityType: 'VENDOR_QUOTATION',
                    entityId: EX.quotation_id,
                    vendorId: EX.vendor_id,
                    fileName: 'staff-quote-uat.pdf',
                    originalFileName: 'staff-quote-uat.pdf',
                    mimeType: 'application/pdf',
                    fileSizeBytes: 48,
                    sha256Checksum: EX.sha256_example,
                    status: 'ACTIVE',
                    version: 1,
                    uploadSource: 'STAFF'
                  }
                ]
              }
            }
          }
        }
      }
    }
  },

  '/procurement/document-attachments/{attachmentId}/download': {
    get: {
      tags: TAG,
      summary: 'Staff secure download',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'attachmentId', required: true, schema: { type: 'string', example: EX.staff_attachment_id } }],
      responses: { 200: { description: 'File stream (application/pdf)' } }
    }
  },

  '/procurement/document-attachments/{attachmentId}/replace': {
    put: {
      tags: TAG,
      summary: 'Replace attachment (staff)',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'attachmentId', required: true, schema: { type: 'string', example: EX.staff_attachment_id } }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['document'],
              properties: { document: { type: 'string', format: 'binary' } }
            }
          }
        }
      },
      responses: { 200: { description: 'New version created; old row SUPERSEDED' } }
    }
  },

  '/procurement/document-attachments/{attachmentId}': {
    delete: {
      tags: TAG,
      summary: 'Soft-delete attachment (staff)',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'attachmentId', required: true, schema: { type: 'string', example: EX.staff_attachment_id } }],
      responses: { 200: { description: 'status=DELETED' } }
    }
  }
};
