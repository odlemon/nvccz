export class WacCalculatorService {
  /** Eq. 1 — weighted average cost on buys; sells reduce qty only. */
  static computeWac(
    currentQty: number,
    currentWac: number,
    buyQty: number,
    buyPrice: number
  ): { quantity: number; wac: number } {
    if (buyQty <= 0) {
      return { quantity: currentQty, wac: currentWac };
    }
    const newQty = currentQty + buyQty;
    if (newQty <= 0) return { quantity: 0, wac: 0 };
    const newWac = (currentQty * currentWac + buyQty * buyPrice) / newQty;
    return { quantity: newQty, wac: newWac };
  }

  /** Eq. 2 — unrealized P&L */
  static unrealizedPnl(quantity: number, currentPrice: number, wac: number): number {
    return quantity * (currentPrice - wac);
  }

  /** Eq. 3 — realized P&L on sell */
  static realizedPnl(sellQty: number, sellPrice: number, wac: number): number {
    return sellQty * (sellPrice - wac);
  }

  /** Apply sell — quantity only */
  static applySell(currentQty: number, sellQty: number, currentWac: number): { quantity: number; wac: number } {
    const quantity = Math.max(0, currentQty - sellQty);
    return { quantity, wac: quantity > 0 ? currentWac : 0 };
  }
}
