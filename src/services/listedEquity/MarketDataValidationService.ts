import { DEVIATION_THRESHOLD } from "./listedEquityConstants";
import { WacCalculatorService } from "./WacCalculatorService";

export { DEVIATION_THRESHOLD };

export class MarketDataValidationService {
  static deviationPct(price: number, previousClose: number | null | undefined): number | null {
    if (previousClose == null || previousClose <= 0) return null;
    return Math.abs(price - previousClose) / previousClose;
  }

  static needsReview(price: number, previousClose: number | null | undefined): boolean {
    const dev = this.deviationPct(price, previousClose);
    return dev != null && dev > DEVIATION_THRESHOLD;
  }

  static validationStatus(price: number, previousClose: number | null | undefined): "APPROVED" | "PENDING_REVIEW" {
    return this.needsReview(price, previousClose) ? "PENDING_REVIEW" : "APPROVED";
  }

  /** Exposed for unit tests — alias unrealized helper */
  static unrealized = WacCalculatorService.unrealizedPnl;
}
