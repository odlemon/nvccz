/**
 * Phase 2 — unified vendor PDF attachments for quotations and invoices.
 */

export const PHASE_TWO_PDF_UPLOADS_TAG = 'Phase two PDF uploads';

const TAG = [PHASE_TWO_PDF_UPLOADS_TAG];

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
          description: '{ success, data: { maxFileSizeBytes, maxAttachmentsPerRecord, allowedFileTypes } }'
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
                  id: 'att_abc123',
                  entityType: 'VENDOR_QUOTATION',
                  entityId: null,
                  mimeType: 'application/pdf',
                  sha256Checksum: 'a3b2c1d4e5f6789012345678901234567890abcd1234567890abcd12345678'
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
        { in: 'path', name: 'attachmentId', required: true, schema: { type: 'string' } },
        { in: 'query', name: 'vendorPortalToken', required: true, schema: { type: 'string' } }
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
      parameters: [{ in: 'path', name: 'quotationId', required: true, schema: { type: 'string' } }],
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
        { in: 'path', name: 'entityId', required: true, schema: { type: 'string' } }
      ],
      responses: {
        200: {
          description: 'Active attachments',
          content: {
            'application/json': {
              example: { success: true, data: [{ id: 'att_abc', mimeType: 'application/pdf', status: 'ACTIVE' }] }
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
      parameters: [{ in: 'path', name: 'attachmentId', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'File stream' } }
    }
  },

  '/procurement/document-attachments/{attachmentId}/replace': {
    put: {
      tags: TAG,
      summary: 'Replace attachment (staff)',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'path', name: 'attachmentId', required: true, schema: { type: 'string' } }],
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
      parameters: [{ in: 'path', name: 'attachmentId', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'status=DELETED' } }
    }
  }
};
