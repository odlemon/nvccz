/**
 * SRD §33: the eighteen event classes the audit trail must capture, and the one place that decides which class a
 * written audit row belongs to. Rows keep the free-form `action` the writer chose (so nothing existing changes);
 * `event_type` is the class the audit page filters on and the tests assert against.
 */
export const AUDIT_EVENT_TYPES = [
  "LOGIN",
  "LOGOUT",
  "CREATE",
  "EDIT",
  "SUBMIT",
  "APPROVE",
  "REJECT",
  "RETURN",
  "ASSIGN",
  "FILE_UPLOAD",
  "FILE_DOWNLOAD",
  "PERMISSION_CHANGE",
  "USER_CHANGE",
  "VENDOR_CHANGE",
  "WORKFLOW_CHANGE",
  "INTEGRATION",
  "AI_PROCESSING",
  "CLOSE",
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const AUDIT_EVENT_LABEL: Record<AuditEventType, string> = {
  LOGIN: "Login",
  LOGOUT: "Logout",
  CREATE: "Record creation",
  EDIT: "Record edit",
  SUBMIT: "Submission",
  APPROVE: "Approval",
  REJECT: "Rejection",
  RETURN: "Return",
  ASSIGN: "Assignment",
  FILE_UPLOAD: "File upload",
  FILE_DOWNLOAD: "File download",
  PERMISSION_CHANGE: "Permission change",
  USER_CHANGE: "User change",
  VENDOR_CHANGE: "Vendor change",
  WORKFLOW_CHANGE: "Workflow change",
  INTEGRATION: "Integration transaction",
  AI_PROCESSING: "AI processing event",
  CLOSE: "Record closure",
};

const VENDOR_ENTITIES = new Set(["Vendor", "VendorBank", "VendorDocument", "VendorContact", "VendorCategory"]);
const PERMISSION_ENTITIES = new Set(["Role", "RolePermission", "Permission", "UserPermission", "AccessProfile"]);
const WORKFLOW_ENTITIES = new Set(["ApprovalMatrix", "ApprovalConfig", "ApprovalStage", "ApprovalRoute", "ProcurementSettings", "WorkflowConfig"]);

/** The class of an audit row from what the writer called it and the record it concerns. */
export function classifyAuditEvent(action: string, entityType?: string | null): AuditEventType | "OTHER" {
  const a = String(action || "").toUpperCase();
  const e = String(entityType || "");

  if (a === "LOGIN" || a === "LOGIN_FAILED" || a === "AUTH_FAILED" || a === "MFA_FAILED") return "LOGIN";
  if (a === "LOGOUT") return "LOGOUT";

  // Files: an open, preview or download of a stored file is one class; storing one (or a new version) is the other.
  if (/^(FILE_DOWNLOAD|FILE_PREVIEW|DOCUMENT_DOWNLOAD|DOCUMENT_PREVIEW|DOWNLOAD|EXPORT|REPORT_EXPORT)/.test(a)) return "FILE_DOWNLOAD";
  if (/^(FILE_UPLOAD|DOCUMENT_UPLOAD|DOCUMENT_VERSION|UPLOAD|VERSION_UPLOAD)|_UPLOAD(ED)?$/.test(a)) return "FILE_UPLOAD";

  if (/^AI_|_AI_|^OCR_|AI_PROCESS/.test(a)) return "AI_PROCESSING";
  if (/^(INTEGRATION|ERP_|POST_TO_LEDGER|LEDGER_POST|JOURNAL_POST|RPA_|WEBHOOK|SYNC_)/.test(a) || a === "POST" || a === "JOURNAL_POSTED" || a === "PAYMENT" || a === "CONVERT_PO_TO_BILL") return "INTEGRATION";

  if (PERMISSION_ENTITIES.has(e) || /PERMISSION|ROLE_PERMISSION|USER_ROLE|ROLE_UPDATE|ROLE_ASSIGN|GRANT|REVOKE/.test(a)) return "PERMISSION_CHANGE";
  if (WORKFLOW_ENTITIES.has(e) || /^(WORKFLOW|APPROVAL_MATRIX|MATRIX_|ROUTE_|SETTINGS_UPDATE|SETTINGS_CHANGE|CONFIG_UPDATE)|WORKFLOW_CHANGE|MATRIX_UPDATE|SETTINGS_UPDATE/.test(a)) return "WORKFLOW_CHANGE";
  if (VENDOR_ENTITIES.has(e) || /^VENDOR_/.test(a)) return "VENDOR_CHANGE";
  if (/^USER_|PASSWORD_(CHANGE|RESET)|^STAFF_/.test(a) || (e === "User" && /^(CREATE|UPDATE|DELETE|DEACTIVATE|ACTIVATE)$/.test(a))) return "USER_CHANGE";

  // The finance handoff writes one action per state it moves to, so each lands in its own class.
  if (/^FINANCE_HANDOFF_(CLOSED)/.test(a)) return "CLOSE";
  if (/^FINANCE_HANDOFF_(ACCEPTED)/.test(a)) return "APPROVE";
  if (/^FINANCE_HANDOFF_(REJECTED|RETURNED)/.test(a)) return "RETURN";
  if (/^FINANCE_HANDOFF_PAID/.test(a)) return "INTEGRATION";
  if (/^(RETURN|RETURNED|RETURN_)/.test(a)) return "RETURN";
  if (/^(REJECT|REJECTED|REJECTION|DECLINE)/.test(a)) return "REJECT";
  if (/^(APPROVE|APPROVED|APPROVAL|AUTO_APPROVE|ACCEPT|ACCEPTED|AWARD_FINALISE|MATCH_OVERRIDE|SIGN_OFF)/.test(a)) return "APPROVE";
  if (/^(SUBMIT|SUBMITTED|SEND|SENT|PREPARE_RECOMMENDATION|FINANCE_HANDOFF|SEND_FOR_APPROVAL)/.test(a)) return "SUBMIT";
  if (/^(ASSIGN|ASSIGNED|DELEGATE|DELEGATED|REASSIGN|REASSIGNED)/.test(a)) return "ASSIGN";
  if (/^(CLOSE|CLOSED|CLOSURE|ARCHIVE|ARCHIVED|TERMINATE|TERMINATED|COMPLETE|CANCEL|CANCELLED|RFQ_CLOSE|EXPIRE)/.test(a) || /_CLOSED?$|_CLOSURE$/.test(a)) return "CLOSE";

  if (/^(CREATE|CREATED|ADD|ADDED|REGISTER|RAISE|CAPTURE_)|_CREATE(D)?$/.test(a)) return "CREATE";
  if (/^(UPDATE|UPDATED|EDIT|EDITED|SET_|CHANGE|MODIFY|REOPEN|RFQ_REOPEN|SCORE|COMMENT|COMMENTED|FLAG_|DECLARE|OPEN_BIDS|RECUSE|VOID)|_UPDATE(D)?$|_CHANGE$/.test(a)) return "EDIT";
  return "OTHER";
}
