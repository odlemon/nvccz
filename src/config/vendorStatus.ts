// @ts-nocheck
/**
 * SRD §8 Vendor Management: the vendor status model (pure rules, no database access).
 *
 * Vendor Status (`vendors.lifecycle_status`) is the ONE status that gates procurement. Approval Status,
 * Compliance Status and the older flags (`registration_status`, `is_active`, `is_blacklisted`) are kept in step
 * with it by VendorLifecycleService, never edited independently.
 */

export const VENDOR_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "PENDING_APPROVAL",
  "APPROVED",
  "SUSPENDED",
  "BLOCKED",
  "EXPIRED",
  "INACTIVE",
] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending Review",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  SUSPENDED: "Suspended",
  BLOCKED: "Blocked",
  EXPIRED: "Expired",
  INACTIVE: "Inactive",
};

export const APPROVAL_STATUSES = ["NOT_SUBMITTED", "PENDING_APPROVAL", "APPROVED", "REJECTED"] as const;
export const COMPLIANCE_STATUSES = ["COMPLIANT", "EXPIRING_SOON", "NON_COMPLIANT", "PENDING"] as const;
export const RISK_CLASSIFICATIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

/** Old spelling still found on rows and in callers. */
export function normalizeVendorStatus(v: unknown): VendorStatus | null {
  const s = String(v ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (s === "ACTIVE") return "APPROVED";
  return (VENDOR_STATUSES as readonly string[]).includes(s) ? (s as VendorStatus) : null;
}

/** Who may make each move. `manage` = procurement.vendors.manage, `approve` = procurement.vendors.approve. */
export type TransitionRule = { to: VendorStatus; needs: "manage" | "approve"; reason?: boolean };

export const TRANSITIONS: Record<VendorStatus, TransitionRule[]> = {
  DRAFT: [
    { to: "PENDING_REVIEW", needs: "manage" },
    { to: "INACTIVE", needs: "manage", reason: true },
  ],
  PENDING_REVIEW: [
    { to: "PENDING_APPROVAL", needs: "manage" },
    { to: "DRAFT", needs: "manage", reason: true },
    { to: "INACTIVE", needs: "approve", reason: true },
  ],
  PENDING_APPROVAL: [
    { to: "APPROVED", needs: "approve" },
    { to: "DRAFT", needs: "approve", reason: true },
    { to: "INACTIVE", needs: "approve", reason: true },
  ],
  APPROVED: [
    { to: "SUSPENDED", needs: "approve", reason: true },
    { to: "BLOCKED", needs: "approve", reason: true },
    { to: "INACTIVE", needs: "approve", reason: true },
    { to: "EXPIRED", needs: "approve", reason: true },
  ],
  SUSPENDED: [
    { to: "APPROVED", needs: "approve" },
    { to: "BLOCKED", needs: "approve", reason: true },
    { to: "INACTIVE", needs: "approve", reason: true },
  ],
  BLOCKED: [
    { to: "APPROVED", needs: "approve", reason: true },
    { to: "INACTIVE", needs: "approve", reason: true },
  ],
  EXPIRED: [
    { to: "APPROVED", needs: "approve" },
    { to: "INACTIVE", needs: "approve", reason: true },
  ],
  INACTIVE: [{ to: "DRAFT", needs: "manage", reason: true }],
};

/** What a vendor has to be, for each thing procurement does with it. */
export type VendorAction = "INVITE" | "QUOTE" | "AWARD" | "PO" | "PO_SEND" | "INVOICE" | "PAY";

export const ACTION_LABELS: Record<VendorAction, string> = {
  INVITE: "be invited to an RFQ",
  QUOTE: "submit a quotation",
  AWARD: "be awarded",
  PO: "be issued a purchase order",
  PO_SEND: "have a purchase order sent",
  INVOICE: "have an invoice recorded",
  PAY: "be paid",
};

/** Statuses in which an invoice for goods already delivered may still be recorded (never paid until Approved). */
export const INVOICE_CAPTURE_STATUSES: VendorStatus[] = ["APPROVED", "SUSPENDED", "EXPIRED"];

export const VENDOR_DOCUMENT_TYPES = [
  "CERTIFICATE_OF_INCORPORATION",
  "TAX_CLEARANCE",
  "VAT_REGISTRATION",
  "ACCOUNT_CONFIRMATION",
  "COMPANY_PROFILE",
  "LICENCE",
  "INSURANCE",
  "COMPLIANCE",
  "QUOTATION",
  "TECHNICAL_SUBMISSION",
  "CONTRACT",
  "OTHER",
  // legacy types written by the self-registration portal
  "CR14",
  "BANK_LETTER",
  "ITF263",
] as const;

export const VENDOR_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  CERTIFICATE_OF_INCORPORATION: "Certificate of incorporation",
  TAX_CLEARANCE: "Tax clearance certificate",
  VAT_REGISTRATION: "VAT registration",
  ACCOUNT_CONFIRMATION: "Account confirmation",
  COMPANY_PROFILE: "Company profile",
  LICENCE: "Licence",
  INSURANCE: "Insurance document",
  COMPLIANCE: "Compliance documentation",
  QUOTATION: "Quotation",
  TECHNICAL_SUBMISSION: "Technical submission",
  CONTRACT: "Contract",
  OTHER: "Other supporting document",
  CR14: "CR14",
  BANK_LETTER: "Bank letter",
  ITF263: "ITF263 tax clearance",
};

export function documentExpiryState(expiryDate: Date | string | null | undefined, noticeDays: number, now = new Date()) {
  if (!expiryDate) return "NO_EXPIRY" as const;
  const exp = new Date(expiryDate);
  exp.setUTCHours(23, 59, 59, 999);
  if (exp.getTime() < now.getTime()) return "EXPIRED" as const;
  if (exp.getTime() - now.getTime() <= noticeDays * 86400000) return "EXPIRING" as const;
  return "VALID" as const;
}

export class VendorPolicyError extends Error {
  statusCode: number;
  code: string;
  constructor(code: string, message: string, statusCode = 409) {
    super(message);
    this.name = "VendorPolicyError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
