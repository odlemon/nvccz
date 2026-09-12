// @ts-nocheck

export const VENDOR_DOCUMENT_ENTITY_TYPES = {
  VENDOR_QUOTATION: "VENDOR_QUOTATION",
  PROCUREMENT_INVOICE: "PROCUREMENT_INVOICE",
  PURCHASE_INVOICE: "PURCHASE_INVOICE"
} as const;

export type VendorDocumentEntityType =
  (typeof VENDOR_DOCUMENT_ENTITY_TYPES)[keyof typeof VENDOR_DOCUMENT_ENTITY_TYPES];

export const VENDOR_DOCUMENT_UPLOAD_SOURCES = {
  VENDOR_PORTAL: "VENDOR_PORTAL",
  STAFF: "STAFF"
} as const;

export const VENDOR_DOCUMENT_STATUSES = {
  ACTIVE: "ACTIVE",
  SUPERSEDED: "SUPERSEDED",
  DELETED: "DELETED"
} as const;

export const PDF_MIME = "application/pdf";

export const DEFAULT_ALLOWED_FILE_TYPES = [
  {
    mimeType: PDF_MIME,
    extensions: ["pdf"],
    label: "PDF Document",
    enabled: true
  }
];

export const MIN_FILE_SIZE_BYTES = 1024;
export const MAX_FILE_SIZE_CEILING_BYTES = 50 * 1024 * 1024;
export const DEFAULT_MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
export const DEFAULT_MAX_ATTACHMENTS_PER_RECORD = 5;

export function isVendorDocumentEntityType(value: string): value is VendorDocumentEntityType {
  return Object.values(VENDOR_DOCUMENT_ENTITY_TYPES).includes(value as VendorDocumentEntityType);
}
