import { createHash } from "crypto";
import type {
  GoodsReceivedNote,
  GoodsReceivedNoteItem,
  ProcurementInvoice,
  ProcurementInvoiceItem,
  PurchaseOrder,
  PurchaseOrderItem,
  VendorQuotation,
  VendorQuotationItem,
} from "@prisma/client";

function decStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && v !== null && "toString" in v) {
    return (v as { toString: () => string }).toString();
  }
  return String(v);
}

function sortJsonKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = sortJsonKeys(o[k]);
  return out;
}

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

export function computePurchaseOrderRejectionFingerprint(
  po: Pick<
    PurchaseOrder,
    | "poNumber"
    | "status"
    | "priority"
    | "subtotal"
    | "taxAmount"
    | "totalAmount"
    | "currencyId"
    | "expectedDeliveryDate"
    | "shippingAddress"
    | "paymentTerms"
    | "deliveryTerms"
    | "requisitionId"
    | "quotationId"
    | "vendorId"
  > & { items: Pick<PurchaseOrderItem, "id" | "itemName" | "description" | "quantity" | "unitPrice" | "totalPrice" | "unit" | "specifications">[] }
): string {
  const header = {
    poNumber: po.poNumber,
    status: po.status,
    priority: po.priority,
    subtotal: decStr(po.subtotal),
    taxAmount: decStr(po.taxAmount),
    totalAmount: decStr(po.totalAmount),
    currencyId: po.currencyId ?? "",
    expectedDeliveryDate: po.expectedDeliveryDate ? po.expectedDeliveryDate.toISOString() : "",
    shippingAddress: po.shippingAddress ?? "",
    paymentTerms: po.paymentTerms ?? "",
    deliveryTerms: po.deliveryTerms ?? "",
    requisitionId: po.requisitionId ?? "",
    quotationId: po.quotationId ?? "",
    vendorId: po.vendorId,
  };
  const items = [...po.items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((it) => ({
      id: it.id,
      itemName: it.itemName,
      description: it.description ?? "",
      quantity: decStr(it.quantity),
      unitPrice: decStr(it.unitPrice),
      totalPrice: decStr(it.totalPrice),
      unit: it.unit ?? "",
      specifications: sortJsonKeys(it.specifications as unknown),
    }));
  return hashPayload({ header, items });
}

export function computeProcurementInvoiceRejectionFingerprint(
  inv: Pick<
    ProcurementInvoice,
    | "invoiceNumber"
    | "status"
    | "matchingStatus"
    | "subtotal"
    | "taxAmount"
    | "totalAmount"
    | "currencyId"
    | "invoiceDate"
    | "dueDate"
    | "purchaseOrderId"
    | "vendorId"
  > & {
    items: Pick<
      ProcurementInvoiceItem,
      "id" | "itemName" | "description" | "quantity" | "unitPrice" | "totalPrice" | "unit" | "matchedPOItemId" | "matchStatus"
    >[];
  }
): string {
  const header = {
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    matchingStatus: inv.matchingStatus,
    subtotal: decStr(inv.subtotal),
    taxAmount: decStr(inv.taxAmount),
    totalAmount: decStr(inv.totalAmount),
    currencyId: inv.currencyId ?? "",
    invoiceDate: inv.invoiceDate.toISOString(),
    dueDate: inv.dueDate ? inv.dueDate.toISOString() : "",
    purchaseOrderId: inv.purchaseOrderId ?? "",
    vendorId: inv.vendorId,
  };
  const items = [...inv.items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((it) => ({
      id: it.id,
      itemName: it.itemName,
      description: it.description ?? "",
      quantity: decStr(it.quantity),
      unitPrice: decStr(it.unitPrice),
      totalPrice: decStr(it.totalPrice),
      unit: it.unit ?? "",
      matchedPOItemId: it.matchedPOItemId ?? "",
      matchStatus: it.matchStatus,
    }));
  return hashPayload({ header, items });
}

export function computeGoodsReceivedNoteRejectionFingerprint(
  grn: Pick<GoodsReceivedNote, "grnNumber" | "status" | "receivedDate" | "qualityStatus" | "qualityNotes" | "purchaseOrderId"> & {
    items: Pick<
      GoodsReceivedNoteItem,
      | "id"
      | "purchaseOrderItemId"
      | "quantityOrdered"
      | "quantityReceived"
      | "quantityAccepted"
      | "quantityRejected"
      | "qualityStatus"
      | "qualityNotes"
    >[];
  }
): string {
  const header = {
    grnNumber: grn.grnNumber,
    status: grn.status,
    receivedDate: grn.receivedDate.toISOString(),
    qualityStatus: grn.qualityStatus,
    qualityNotes: grn.qualityNotes ?? "",
    purchaseOrderId: grn.purchaseOrderId,
  };
  const items = [...grn.items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((it) => ({
      id: it.id,
      purchaseOrderItemId: it.purchaseOrderItemId,
      quantityOrdered: decStr(it.quantityOrdered),
      quantityReceived: decStr(it.quantityReceived),
      quantityAccepted: decStr(it.quantityAccepted),
      quantityRejected: decStr(it.quantityRejected),
      qualityStatus: it.qualityStatus,
      qualityNotes: it.qualityNotes ?? "",
    }));
  return hashPayload({ header, items });
}

export function computeVendorQuotationRejectionFingerprint(
  q: Pick<
    VendorQuotation,
    | "quotationNumber"
    | "rfqNumber"
    | "vendorName"
    | "vendorEmail"
    | "companyName"
    | "status"
    | "subtotal"
    | "taxAmount"
    | "totalAmount"
    | "currencyCode"
    | "paymentTerms"
    | "deliveryTerms"
    | "deliveryTime"
    | "notes"
  > & { items: Pick<VendorQuotationItem, "id" | "itemName" | "description" | "quantity" | "unitPrice" | "totalPrice" | "unit" | "specifications">[] }
): string {
  const header = {
    quotationNumber: q.quotationNumber,
    rfqNumber: q.rfqNumber ?? "",
    vendorName: q.vendorName,
    vendorEmail: q.vendorEmail,
    companyName: q.companyName ?? "",
    status: q.status,
    subtotal: decStr(q.subtotal),
    taxAmount: decStr(q.taxAmount),
    totalAmount: decStr(q.totalAmount),
    currencyCode: q.currencyCode,
    paymentTerms: q.paymentTerms ?? "",
    deliveryTerms: q.deliveryTerms ?? "",
    deliveryTime: q.deliveryTime ?? "",
    notes: q.notes ?? "",
  };
  const items = [...q.items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((it) => ({
      id: it.id,
      itemName: it.itemName,
      description: it.description ?? "",
      quantity: decStr(it.quantity),
      unitPrice: decStr(it.unitPrice),
      totalPrice: decStr(it.totalPrice),
      unit: it.unit ?? "",
      specifications: sortJsonKeys(it.specifications as unknown),
    }));
  return hashPayload({ header, items });
}
