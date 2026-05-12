import { createHash } from "crypto";
import type { PurchaseRequisition, PurchaseRequisitionItem } from "@prisma/client";

function decStr(v: unknown): string {
  if (v == null) {
    return "";
  }
  if (typeof v === "object" && v !== null && "toString" in v) {
    return (v as { toString: () => string }).toString();
  }
  return String(v);
}

function sortJsonKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = sortJsonKeys(o[k]);
  }
  return out;
}

export type RequisitionForFingerprint = Pick<
  PurchaseRequisition,
  | "title"
  | "description"
  | "justification"
  | "priority"
  | "department"
  | "currencyId"
  | "sourcingCategory"
  | "totalAmount"
  | "portfolioCompanyId"
  | "fundId"
  | "useOfFundsDocumentUrl"
  | "drawdownRequestAmount"
> & {
  items: Pick<
    PurchaseRequisitionItem,
    "id" | "itemName" | "description" | "quantity" | "unitPrice" | "totalPrice" | "unit" | "preferredVendorId" | "specifications"
  >[];
};

/**
 * Stable hash of requisition header + line items (for "must change before resubmit" after rejection).
 */
export function computePurchaseRequisitionContentFingerprint(r: RequisitionForFingerprint): string {
  const header = {
    title: r.title ?? "",
    description: r.description ?? "",
    justification: r.justification ?? "",
    priority: r.priority ?? "",
    department: r.department ?? "",
    currencyId: r.currencyId ?? "",
    sourcingCategory: r.sourcingCategory ?? "",
    totalAmount: decStr(r.totalAmount),
    portfolioCompanyId: r.portfolioCompanyId ?? "",
    fundId: r.fundId ?? "",
    useOfFundsDocumentUrl: r.useOfFundsDocumentUrl ?? "",
    drawdownRequestAmount: decStr(r.drawdownRequestAmount),
  };

  const items = [...r.items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((it) => ({
      id: it.id,
      itemName: it.itemName ?? "",
      description: it.description ?? "",
      quantity: decStr(it.quantity),
      unitPrice: decStr(it.unitPrice),
      totalPrice: decStr(it.totalPrice),
      unit: it.unit ?? "",
      preferredVendorId: it.preferredVendorId ?? "",
      specifications: sortJsonKeys(it.specifications as unknown),
    }));

  const payload = JSON.stringify({ header, items });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
