/**
 * RFQ line items from API body or JSON snapshots. Used for validation, PR fallback, and emails.
 */

export type NormalizedRfqLine = {
  itemName: string;
  description?: string;
  quantity: number;
  unit?: string;
  specifications?: unknown;
  /** PR reference or null when vendor must quote (explicit null avoids JSON `undefined` → UI NaN). */
  unitPrice?: number | null;
  /** Optional reference line total from PR (display only). */
  lineTotal?: number | null;
};

const INVALID_NAMES = new Set(["undefined", "null", ""]);

function trimStr(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s;
}

function coercePositiveQuantity(raw: unknown): number {
  if (raw == null) return 1;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

function coerceOptionalMoney(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

function pickItemName(r: Record<string, unknown>): string {
  const fromNameKeys = trimStr(r.itemName ?? r.name ?? r.title ?? r.item);
  if (fromNameKeys && !INVALID_NAMES.has(fromNameKeys.toLowerCase())) return fromNameKeys;
  const fromDesc = trimStr(r.description);
  if (fromDesc && !INVALID_NAMES.has(fromDesc.toLowerCase())) return fromDesc;
  return "";
}

/**
 * Returns only lines with a real label and a sane quantity (defaults to 1).
 * Accepts common aliases (`name`, `qty`, etc.) so client payloads still map to PR-style lines.
 */
export function normalizeRfqItemLinesFromBody(items: unknown): NormalizedRfqLine[] {
  if (!Array.isArray(items)) return [];
  const out: NormalizedRfqLine[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const itemName = pickItemName(r);
    if (!itemName) continue;
    const qtyRaw = r.quantity ?? r.qty ?? r.quantityRequested ?? r.qtyRequested;
    const quantity = coercePositiveQuantity(qtyRaw);
    const desc = trimStr(r.description);
    const unitRaw = trimStr(r.unit);
    const unit = unitRaw || undefined;
    const description = desc && desc !== itemName ? desc : undefined;
    const unitPrice =
      coerceOptionalMoney(r.unitPrice ?? r.unit_price) ??
      coerceOptionalMoney(r.unitPriceEstimated) ??
      null;
    const lineTotal =
      coerceOptionalMoney(r.lineTotal ?? r.totalPrice ?? r.total_price ?? r.total) ?? null;
    out.push({
      itemName,
      description,
      quantity,
      unit,
      specifications: r.specifications ?? undefined,
      unitPrice,
      lineTotal,
    });
  }
  return out;
}

/** Map DB purchase requisition lines to the same shape used for RFQ emails and snapshots. */
export function prItemsToNormalizedRfqLines(
  prItems: Array<{
    itemName: string;
    description?: string | null;
    quantity: unknown;
    unit?: string | null;
    specifications?: unknown;
    unitPrice?: unknown;
    totalPrice?: unknown;
  }>
): NormalizedRfqLine[] {
  return prItems.map((it) => {
    const itemName = trimStr(it.itemName) || "Purchase requisition line";
    const unitPrice = coerceOptionalMoney(it.unitPrice);
    const lineTotal = coerceOptionalMoney(it.totalPrice);
    return {
      itemName,
      description: it.description ? trimStr(it.description) : undefined,
      quantity: coercePositiveQuantity(it.quantity),
      unit: it.unit ? trimStr(it.unit) : undefined,
      specifications: it.specifications ?? undefined,
      unitPrice: unitPrice ?? null,
      lineTotal: lineTotal ?? null,
    };
  });
}

/**
 * Normalizes `procurement_rfqs.items_snapshot` for API consumers: every line gets numeric or null
 * `unitPrice` / `lineTotal` keys so clients do not read `undefined` and format `USD NaN`.
 */
export function enrichRfqItemsSnapshotForApi(snapshot: unknown): unknown {
  if (snapshot == null || typeof snapshot !== "object") return snapshot;
  const o = snapshot as Record<string, unknown>;
  const items = o.items;
  if (!Array.isArray(items)) return snapshot;
  return {
    ...o,
    items: items.map((raw: unknown) => {
      if (!raw || typeof raw !== "object") return raw;
      const it = raw as Record<string, unknown>;
      const unitPrice =
        coerceOptionalMoney(it.unitPrice ?? it.unit_price) ??
        coerceOptionalMoney(it.unitPriceEstimated) ??
        null;
      const lineTotal =
        coerceOptionalMoney(it.lineTotal ?? it.totalPrice ?? it.total_price ?? it.total) ?? null;
      return { ...it, unitPrice, lineTotal };
    }),
  };
}

/**
 * True when the client supplied at least one RFQ/PR line with a usable label and quantity.
 * Treats junk rows (`{}`, placeholders, `"undefined"`) as empty so PR line items can be used.
 */
export function hasUsableRfqItemLines(items: unknown): boolean {
  return normalizeRfqItemLinesFromBody(items).length > 0;
}

export type PurchaseOrderLineFromAccept = {
  itemName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
  specifications?: unknown;
};

function lineMatchKey(name: unknown): string {
  return trimStr(name).toLowerCase();
}

/**
 * PO lines: RFQ (or PR) defines what was requested; accepted quotation supplies vendor unit prices.
 * Falls back to quotation-only lines when no RFQ snapshot exists.
 */
export function buildPoLinesFromRfqAndQuotation(
  rfqLines: NormalizedRfqLine[],
  quotationItems: Array<{
    itemName: string;
    description?: string | null;
    quantity?: unknown;
    unitPrice: unknown;
    unit?: string | null;
    specifications?: unknown;
  }>
): PurchaseOrderLineFromAccept[] {
  if (!quotationItems?.length) {
    throw new Error("Accepted quotation has no line items; cannot create purchase order.");
  }

  const quoteByKey = new Map<string, (typeof quotationItems)[number]>();
  for (const q of quotationItems) {
    const key = lineMatchKey(q.itemName);
    if (key && !quoteByKey.has(key)) quoteByKey.set(key, q);
  }

  const toPoLine = (
    rfq: NormalizedRfqLine,
    q: (typeof quotationItems)[number]
  ): PurchaseOrderLineFromAccept => {
    const unitPrice = Number(q.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error(`Invalid unit price on quotation line "${q.itemName}".`);
    }
    return {
      itemName: rfq.itemName,
      description: rfq.description || (q.description ? trimStr(q.description) : undefined) || undefined,
      quantity: rfq.quantity,
      unitPrice,
      unit: rfq.unit || (q.unit ? trimStr(q.unit) : undefined) || undefined,
      specifications: rfq.specifications ?? q.specifications ?? undefined,
    };
  };

  if (!rfqLines.length) {
    return quotationItems.map((q) => {
      const unitPrice = Number(q.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error(`Invalid unit price on quotation line "${q.itemName}".`);
      }
      return {
        itemName: trimStr(q.itemName) || "Line item",
        description: q.description ? trimStr(q.description) : undefined,
        quantity: coercePositiveQuantity(q.quantity),
        unitPrice,
        unit: q.unit ? trimStr(q.unit) : undefined,
        specifications: q.specifications ?? undefined,
      };
    });
  }

  const lines: PurchaseOrderLineFromAccept[] = [];
  const usedQuoteKeys = new Set<string>();

  for (const rfq of rfqLines) {
    const key = lineMatchKey(rfq.itemName);
    const q = quoteByKey.get(key);
    if (!q) {
      throw new Error(
        `RFQ line "${rfq.itemName}" has no matching priced line on the accepted quotation.`
      );
    }
    usedQuoteKeys.add(key);
    lines.push(toPoLine(rfq, q));
  }

  for (const q of quotationItems) {
    const key = lineMatchKey(q.itemName);
    if (!key || usedQuoteKeys.has(key)) continue;
    usedQuoteKeys.add(key);
    lines.push({
      itemName: trimStr(q.itemName) || "Line item",
      description: q.description ? trimStr(q.description) : undefined,
      quantity: coercePositiveQuantity(q.quantity),
      unitPrice: Number(q.unitPrice),
      unit: q.unit ? trimStr(q.unit) : undefined,
      specifications: q.specifications ?? undefined,
    });
  }

  return lines;
}
