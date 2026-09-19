/**
 * Server-side line-item validation shared by requisitions, purchase orders and vendor quotations.
 *
 * SRD §41 "Data Validation" lists "positive quantity" and "numeric value restrictions" as required
 * examples and states "Server-side validation is mandatory even where frontend validation exists."
 * (PROC-FINDING: negative/zero quantity and negative unit price were previously accepted end-to-end,
 * including a negative `totalAmount` on the requisition itself — see design-refs/procurement-v23/TEST_FINDINGS.md.)
 *
 * Kept deliberately dependency-free (no Prisma/Decimal imports) so it can be called before any of the
 * heavier per-entity resolution logic in ProcurementService / VendorQuotationService.
 */

export interface LineItemForQuantityPriceValidation {
  itemName?: string | null;
  quantity: unknown;
  unitPrice?: unknown;
}

export interface ValidateLineItemsOptions {
  /**
   * When true, a missing/blank unit price is itself rejected (e.g. a vendor quotation or a purchase
   * order line must state a real price). When false (the default — used for requisitions, where the
   * unit price is only the requester's optional internal estimate), a missing price is left alone and
   * only an explicitly negative one is rejected.
   */
  requireUnitPrice?: boolean;
}

function lineLabel(item: LineItemForQuantityPriceValidation, lineNo: number): string {
  const name = item?.itemName == null ? "" : String(item.itemName).trim();
  return name || `line ${lineNo}`;
}

/**
 * Throws a plain `Error` (caught by controllers and surfaced as an HTTP 400 with the message as-is —
 * see `publicErrorMessage`) naming the first offending line, 1-indexed to match how lines are shown
 * in the UI. Quantity must be a finite number greater than zero. Unit price, when present, must be a
 * finite number that is not negative; zero is a legitimate price (e.g. a free sample/warranty line).
 */
export function assertValidProcurementLineItems(
  items: readonly LineItemForQuantityPriceValidation[] | null | undefined,
  opts: ValidateLineItemsOptions = {}
): void {
  if (!Array.isArray(items)) return;

  items.forEach((item, idx) => {
    const lineNo = idx + 1;
    const label = lineLabel(item, lineNo);

    const quantity = Number(item?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Line ${lineNo} (${label}): quantity must be greater than zero`);
    }

    const rawPrice = item?.unitPrice;
    const priceProvided = rawPrice != null && String(rawPrice).trim() !== "";
    if (!priceProvided) {
      if (opts.requireUnitPrice) {
        throw new Error(`Line ${lineNo} (${label}): unit price is required`);
      }
      return;
    }

    const unitPrice = Number(rawPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error(`Line ${lineNo} (${label}): unit price cannot be negative`);
    }
  });
}
