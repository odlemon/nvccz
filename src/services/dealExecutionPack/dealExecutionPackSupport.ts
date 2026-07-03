// @ts-nocheck
export const DEP_PACK_STATUSES = {
  DRAFT: "DRAFT",
  IN_PROGRESS: "IN_PROGRESS",
  READY_FOR_SIGNOFF: "READY_FOR_SIGNOFF",
  EXECUTED: "EXECUTED",
  FAILED: "FAILED",
} as const;

export const DEP_DOC_STATUSES = {
  ACTIVE: "ACTIVE",
  SUPERSEDED: "SUPERSEDED",
} as const;

export const DEP_CP_STATUSES = {
  PENDING: "PENDING",
  SATISFIED: "SATISFIED",
} as const;

export const DEP_SIG_STATUSES = {
  PENDING: "PENDING",
  SIGNED: "SIGNED",
} as const;

export const DEP_SLOT_CODES = {
  SPA: "SPA",
  SHA: "SHA",
  SUBSCRIPTION: "SUBSCRIPTION",
  BOARD_RESOLUTION: "BOARD_RESOLUTION",
  CLOSING_CHECKLIST: "CLOSING_CHECKLIST",
} as const;

export const DEP_SIGNATURE_ROLES = {
  LEGAL_COORDINATOR: "LEGAL_COORDINATOR",
  CCO: "CCO",
  IC_MEMBER: "IC_MEMBER",
} as const;

export const DEP_AUDIT_EVENTS = {
  PACK_CREATED: "PACK_CREATED",
  DOCUMENT_UPLOADED: "DOCUMENT_UPLOADED",
  DOCUMENT_SUPERSEDED: "DOCUMENT_SUPERSEDED",
  CHECKSUM_MISMATCH: "CHECKSUM_MISMATCH",
  CP_SATISFIED: "CP_SATISFIED",
  SIGNATURE_RECORDED: "SIGNATURE_RECORDED",
  EXECUTE_ATTEMPT_BLOCKED: "EXECUTE_ATTEMPT_BLOCKED",
  PACK_EXECUTED: "PACK_EXECUTED",
} as const;

export const DEP_TRANSACTION_TYPES = {
  EQUITY_ROUND: "EQUITY_ROUND",
} as const;

export const PDF_MIME = "application/pdf";

export const SLOT_TEMPLATES: Record<
  string,
  Array<{ slotCode: string; displayName: string; isMandatory: boolean; displayOrder: number }>
> = {
  EQUITY_ROUND: [
    { slotCode: DEP_SLOT_CODES.SPA, displayName: "Share Purchase Agreement", isMandatory: true, displayOrder: 1 },
    { slotCode: DEP_SLOT_CODES.SHA, displayName: "Shareholders Agreement", isMandatory: true, displayOrder: 2 },
    {
      slotCode: DEP_SLOT_CODES.SUBSCRIPTION,
      displayName: "Subscription Agreement",
      isMandatory: true,
      displayOrder: 3,
    },
    {
      slotCode: DEP_SLOT_CODES.BOARD_RESOLUTION,
      displayName: "Board Resolution",
      isMandatory: true,
      displayOrder: 4,
    },
    {
      slotCode: DEP_SLOT_CODES.CLOSING_CHECKLIST,
      displayName: "Closing Checklist",
      isMandatory: false,
      displayOrder: 5,
    },
  ],
};

export const DEFAULT_SIGNATURE_TEMPLATE = [
  { roleCode: DEP_SIGNATURE_ROLES.LEGAL_COORDINATOR, displayOrder: 1 },
  { roleCode: DEP_SIGNATURE_ROLES.CCO, displayOrder: 2 },
  { roleCode: DEP_SIGNATURE_ROLES.IC_MEMBER, displayOrder: 3 },
];

export function assertPdfMagicBytes(buffer: Buffer) {
  const head = buffer.subarray(0, 5).toString("ascii");
  if (!head.startsWith("%PDF-")) {
    throw new Error("PDF integrity check failed: file does not start with %PDF-");
  }
}
