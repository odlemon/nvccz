/**
 * Purchase order lifecycle statuses (stored on `purchase_orders.status`).
 *
 * Flow: DRAFT → SENT → ACKNOWLEDGED (vendor procurement invoice) →
 *       PARTIALLY_DELIVERED | DELIVERED (GRN) → BILLED (optional vendor bill).
 *
 * Legacy rows may still use RECEIVED / PARTIALLY_RECEIVED — treat as delivered equivalents.
 */
export const PO_STATUS = {
  DRAFT: "DRAFT",
  PENDING: "PENDING",
  SENT: "SENT",
  APPROVED: "APPROVED",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  PARTIALLY_DELIVERED: "PARTIALLY_DELIVERED",
  DELIVERED: "DELIVERED",
  BILLED: "BILLED",
} as const;

/** @deprecated Use DELIVERED — kept for existing rows */
export const PO_STATUS_LEGACY_RECEIVED = "RECEIVED";
/** @deprecated Use PARTIALLY_DELIVERED */
export const PO_STATUS_LEGACY_PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED";

export type PurchaseOrderStatus = (typeof PO_STATUS)[keyof typeof PO_STATUS];

const DELIVERED_EQUIV = new Set([
  PO_STATUS.DELIVERED,
  PO_STATUS_LEGACY_RECEIVED,
]);

const PARTIAL_DELIVERED_EQUIV = new Set([
  PO_STATUS.PARTIALLY_DELIVERED,
  PO_STATUS_LEGACY_PARTIALLY_RECEIVED,
]);

export function isPoFullyDelivered(status: string | null | undefined): boolean {
  return DELIVERED_EQUIV.has(String(status || ""));
}

export function isPoPartiallyDelivered(status: string | null | undefined): boolean {
  return PARTIAL_DELIVERED_EQUIV.has(String(status || ""));
}

/**
 * Vendor may submit a procurement invoice against this PO.
 * Delivered POs stay open: suppliers usually invoice after the goods arrive, and the GRN moves the
 * PO to PARTIALLY_DELIVERED / DELIVERED before that happens. Only BILLED (and DRAFT) close it.
 */
export function canVendorSubmitProcurementInvoice(status: string | null | undefined): boolean {
  const s = String(status || "");
  return (
    s === PO_STATUS.SENT ||
    s === PO_STATUS.APPROVED ||
    s === PO_STATUS.PENDING ||
    s === PO_STATUS.ACKNOWLEDGED ||
    isPoPartiallyDelivered(s) ||
    isPoFullyDelivered(s)
  );
}

/** Staff/vendor bill conversion and similar flows. */
export function canConvertPoToVendorBill(status: string | null | undefined): boolean {
  const s = String(status || "");
  if (s === PO_STATUS.BILLED) return false;
  return (
    s === PO_STATUS.SENT ||
    s === PO_STATUS.APPROVED ||
    s === PO_STATUS.ACKNOWLEDGED ||
    isPoPartiallyDelivered(s) ||
    isPoFullyDelivered(s)
  );
}

/** PO still counts toward committed spend (not yet fully closed out). */
export const OPEN_PO_COMMITMENT_STATUSES: string[] = [
  PO_STATUS.DRAFT,
  PO_STATUS.PENDING,
  PO_STATUS.SENT,
  PO_STATUS.APPROVED,
  PO_STATUS.ACKNOWLEDGED,
  PO_STATUS.PARTIALLY_DELIVERED,
  PO_STATUS_LEGACY_PARTIALLY_RECEIVED,
];

/** Statuses that may transition to ACKNOWLEDGED when a vendor invoice is created. */
export const PO_STATUSES_BEFORE_ACKNOWLEDGED: string[] = [
  PO_STATUS.SENT,
  PO_STATUS.APPROVED,
  PO_STATUS.PENDING,
];

type PoLineForDeliveryStatus = {
  lineStatus?: string | null;
  quantityPending?: unknown;
  quantityReceived?: unknown;
};

function activePoLine(line: PoLineForDeliveryStatus): boolean {
  return String(line.lineStatus || "ACTIVE") !== "CANCELLED";
}

/**
 * After GRN receipt quantities are applied to PO lines, derive the PO header status.
 * - All active lines fully received → DELIVERED
 * - Some qty received, still pending → PARTIALLY_DELIVERED
 * - Otherwise → null (leave current status unchanged)
 */
export function purchaseOrderStatusAfterGrnReceipt(
  lines: PoLineForDeliveryStatus[]
): typeof PO_STATUS.DELIVERED | typeof PO_STATUS.PARTIALLY_DELIVERED | null {
  const active = lines.filter(activePoLine);
  if (active.length === 0) return null;

  const pending = active.filter((l) => Number(l.quantityPending ?? 0) > 0);
  const receivedAny = active.some((l) => Number(l.quantityReceived ?? 0) > 0);

  if (pending.length === 0 && receivedAny) {
    return PO_STATUS.DELIVERED;
  }
  if (receivedAny) {
    return PO_STATUS.PARTIALLY_DELIVERED;
  }
  return null;
}
