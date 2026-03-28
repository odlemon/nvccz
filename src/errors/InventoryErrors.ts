export type StockShortageDetail = {
  itemId: string;
  itemName: string;
  skuNumber: string;
  quantityOnHand: number;
  quantityRequested: number;
  shortfall: number;
  projectedQuantityAfterSale: number;
};

/**
 * Thrown when perpetual inventory would go negative and "Allow negative stock" is on
 * but the client has not yet sent acknowledgeNegativeStock: true.
 */
export class NegativeStockConfirmationRequiredError extends Error {
  readonly code = "NEGATIVE_STOCK_CONFIRMATION_REQUIRED" as const;

  constructor(
    public readonly shortages: StockShortageDetail[],
    message?: string
  ) {
    super(
      message ??
        "Selling these quantities would result in negative stock. Set acknowledgeNegativeStock: true to proceed, or reduce quantities."
    );
    this.name = "NegativeStockConfirmationRequiredError";
  }
}

export function isNegativeStockConfirmationRequiredError(
  e: unknown
): e is NegativeStockConfirmationRequiredError {
  return (
    e instanceof NegativeStockConfirmationRequiredError ||
    (typeof e === "object" &&
      e !== null &&
      (e as { code?: string }).code === "NEGATIVE_STOCK_CONFIRMATION_REQUIRED")
  );
}
