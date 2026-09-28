// @ts-nocheck
/**
 * SRD §40: controlled statuses. One place defines, for each record type, the statuses it may hold, what each is called, and which
 * moves are legal. The data-layer guard (src/utils/statusGuard.ts) checks every status write against this map, so an illegal
 * move is refused whichever route, service or script attempts it, and a Cancelled or Closed record is terminal.
 *
 * Stored values are the ones the system already uses; the labels are what people read. Where the SRD names two states that the
 * system reaches in one step (Submitted, Under Review: a submitted requisition is routed for approval at once) the label follows
 * what has happened to it (see requisitionLabel).
 */
export type StatusKind = "REQUISITION" | "RFQ" | "PURCHASE_ORDER";

export const STATUS_LABELS: Record<StatusKind, Record<string, string>> = {
  REQUISITION: {
    DRAFT: "Draft",
    SUBMITTED: "Submitted",
    PENDING_APPROVAL: "Under Review",
    PENDING_VC_EXECUTIVE_REVIEW: "Under Review",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    RETURNED: "Returned",
    RFQ_SENT: "Converted to Sourcing",
    CONVERTED_TO_PO: "Converted to Sourcing",
    CANCELLED: "Cancelled",
    CLOSED: "Closed",
  },
  RFQ: {
    DRAFT: "Draft",
    APPROVED: "Approved",
    PUBLISHED: "Published",
    OPEN: "Open",
    CLOSED: "Closed",
    UNDER_EVALUATION: "Under Evaluation",
    AWAITING_APPROVAL: "Awaiting Approval",
    AWARDED: "Awarded",
    CANCELLED: "Cancelled",
    COMPLETED: "Awarded",
  },
  PURCHASE_ORDER: {
    DRAFT: "Draft",
    PENDING: "Pending Approval",
    APPROVED: "Approved",
    SENT: "Issued",
    REJECTED: "Rejected",
    ACKNOWLEDGED: "Acknowledged",
    PARTIALLY_DELIVERED: "Partially delivered",
    PARTIALLY_RECEIVED: "Partially delivered",
    DELIVERED: "Delivered",
    RECEIVED: "Delivered",
    BILLED: "Billed",
    CANCELLED: "Cancelled",
    CLOSED: "Closed",
  },
};

/**
 * The Purchase Order status list in the SRD is cut off after "Draft, Pending Approval, Approved, Issued …". Those four are
 * implemented as named (stored as DRAFT, PENDING, APPROVED, SENT). The statuses after them (Acknowledged, Partially delivered,
 * Delivered, Billed, Rejected, Cancelled, Closed) are the ones the system already uses, kept as they are and NOT confirmed
 * against the SRD.
 */
export const PO_CONFIRMED_STATUSES = ["DRAFT", "PENDING", "APPROVED", "SENT"];
export const PO_UNCONFIRMED_STATUSES = ["REJECTED", "ACKNOWLEDGED", "PARTIALLY_DELIVERED", "PARTIALLY_RECEIVED", "DELIVERED", "RECEIVED", "BILLED", "CANCELLED", "CLOSED"];

export const TERMINAL: Record<StatusKind, string[]> = {
  REQUISITION: ["CANCELLED", "CLOSED"],
  RFQ: ["CANCELLED"], // an awarded event has no move out either (see TRANSITIONS) but its record still takes the award's follow-on writes
  PURCHASE_ORDER: ["CANCELLED", "CLOSED"],
};

/** from → the statuses it may move to. `null` is a record that does not exist yet (its first status). */
export const TRANSITIONS: Record<StatusKind, Record<string, string[]>> = {
  REQUISITION: {
    DRAFT: ["SUBMITTED", "PENDING_APPROVAL", "PENDING_VC_EXECUTIVE_REVIEW", "APPROVED", "CANCELLED"],
    SUBMITTED: ["PENDING_APPROVAL", "APPROVED", "REJECTED", "RETURNED", "CANCELLED"],
    PENDING_APPROVAL: ["APPROVED", "REJECTED", "RETURNED", "CANCELLED", "DRAFT", "PENDING_VC_EXECUTIVE_REVIEW"],
    PENDING_VC_EXECUTIVE_REVIEW: ["APPROVED", "REJECTED", "RETURNED", "CANCELLED", "PENDING_APPROVAL", "DRAFT"],
    APPROVED: ["RFQ_SENT", "CONVERTED_TO_PO", "CLOSED", "CANCELLED"],
    REJECTED: ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "CANCELLED", "CLOSED"],
    RETURNED: ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "CANCELLED"],
    RFQ_SENT: ["CONVERTED_TO_PO", "APPROVED", "CLOSED", "CANCELLED"],
    CONVERTED_TO_PO: ["CLOSED", "CANCELLED"],
    CANCELLED: [],
    CLOSED: [],
  },
  RFQ: {
    DRAFT: ["APPROVED", "PUBLISHED", "OPEN", "CANCELLED"],
    APPROVED: ["PUBLISHED", "OPEN", "CANCELLED"],
    PUBLISHED: ["OPEN", "CLOSED", "CANCELLED"],
    OPEN: ["CLOSED", "UNDER_EVALUATION", "AWAITING_APPROVAL", "AWARDED", "CANCELLED"],
    CLOSED: ["OPEN", "UNDER_EVALUATION", "AWAITING_APPROVAL", "AWARDED", "CANCELLED"],
    UNDER_EVALUATION: ["AWAITING_APPROVAL", "AWARDED", "CLOSED", "OPEN", "CANCELLED"],
    AWAITING_APPROVAL: ["AWARDED", "UNDER_EVALUATION", "CANCELLED"],
    AWARDED: [],
    COMPLETED: [],
    CANCELLED: [],
  },
  PURCHASE_ORDER: {
    DRAFT: ["PENDING", "APPROVED", "SENT", "REJECTED", "CANCELLED"],
    PENDING: ["APPROVED", "REJECTED", "DRAFT", "SENT", "CANCELLED"],
    APPROVED: ["SENT", "DRAFT", "CANCELLED"],
    REJECTED: ["DRAFT", "PENDING", "CANCELLED"],
    SENT: ["ACKNOWLEDGED", "PARTIALLY_DELIVERED", "PARTIALLY_RECEIVED", "DELIVERED", "RECEIVED", "BILLED", "CANCELLED", "CLOSED"],
    ACKNOWLEDGED: ["PARTIALLY_DELIVERED", "PARTIALLY_RECEIVED", "DELIVERED", "RECEIVED", "BILLED", "CANCELLED", "CLOSED", "SENT"],
    PARTIALLY_DELIVERED: ["PARTIALLY_DELIVERED", "PARTIALLY_RECEIVED", "DELIVERED", "RECEIVED", "BILLED", "SENT", "ACKNOWLEDGED", "CANCELLED", "CLOSED"],
    PARTIALLY_RECEIVED: ["PARTIALLY_DELIVERED", "PARTIALLY_RECEIVED", "DELIVERED", "RECEIVED", "BILLED", "SENT", "ACKNOWLEDGED", "CANCELLED", "CLOSED"],
    DELIVERED: ["BILLED", "CLOSED", "PARTIALLY_DELIVERED", "PARTIALLY_RECEIVED", "ACKNOWLEDGED", "SENT"],
    RECEIVED: ["BILLED", "CLOSED", "PARTIALLY_DELIVERED", "PARTIALLY_RECEIVED", "ACKNOWLEDGED", "SENT"],
    BILLED: ["CLOSED"],
    CANCELLED: [],
    CLOSED: [],
  },
};

/** The statuses a record may be created in. */
export const INITIAL: Record<StatusKind, string[] | null> = {
  REQUISITION: ["DRAFT", "PENDING_APPROVAL", "SUBMITTED"],
  RFQ: ["DRAFT", "OPEN", "PUBLISHED"],
  PURCHASE_ORDER: null, // a PO may be created directly in its first working status
};

export class StatusTransitionError extends Error {
  status = 409;
  code: string;
  from: string | null;
  to: string | null;
  allowed: string[];
  constructor(message: string, code: string, from: string | null, to: string | null, allowed: string[]) {
    super(message);
    this.code = code;
    this.from = from;
    this.to = to;
    this.allowed = allowed;
  }
}

export const isTerminal = (kind: StatusKind, status: string | null | undefined) => !!status && TERMINAL[kind].includes(String(status).toUpperCase());

export function statusLabel(kind: StatusKind, status: string | null | undefined): string {
  const s = String(status ?? "").toUpperCase();
  return STATUS_LABELS[kind]?.[s] ?? (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : "—");
}

/**
 * A requisition in approval reads "Submitted" until a reviewer has done anything with it (commented, delegated, or the route has
 * moved past its first step) and "Under Review" after. `reviewed` says whether that has happened.
 */
export function requisitionLabel(status: string, reviewed: boolean): string {
  if (String(status).toUpperCase() === "PENDING_APPROVAL") return reviewed ? "Under Review" : "Submitted";
  return statusLabel("REQUISITION", status);
}

export function allowedFrom(kind: StatusKind, status: string): string[] {
  return TRANSITIONS[kind][String(status).toUpperCase()] ?? [];
}

/** Throws a StatusTransitionError unless `from` → `to` is a legal move (a move to the same status is not a move). */
export function assertTransition(kind: StatusKind, from: string | null, to: string, ref = "The record") {
  const t = String(to).toUpperCase();
  if (from == null) {
    const initial = INITIAL[kind];
    if (initial && !initial.includes(t)) throw new StatusTransitionError(`${ref} cannot be created as ${statusLabel(kind, t)}. It starts as ${initial.map((s) => statusLabel(kind, s)).join(" or ")}.`, "STATUS_INITIAL", null, t, initial);
    return;
  }
  const f = String(from).toUpperCase();
  if (f === t) return;
  if (isTerminal(kind, f)) throw new StatusTransitionError(`${ref} is ${statusLabel(kind, f)} and cannot be moved to ${statusLabel(kind, t)}: ${statusLabel(kind, f)} is final.`, "STATUS_TERMINAL", f, t, []);
  const allowed = allowedFrom(kind, f);
  if (!allowed.includes(t)) {
    throw new StatusTransitionError(
      `${ref} cannot move from ${statusLabel(kind, f)} to ${statusLabel(kind, t)}.${allowed.length ? ` From ${statusLabel(kind, f)} it can become ${allowed.map((s) => statusLabel(kind, s)).join(", ")}.` : ""}`,
      "STATUS_TRANSITION", f, t, allowed,
    );
  }
}
