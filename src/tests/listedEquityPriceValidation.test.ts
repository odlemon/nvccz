import { MarketDataValidationService, DEVIATION_THRESHOLD } from "../services/listedEquity/MarketDataValidationService";

describe("ListedEquity price validation (15% deviation)", () => {
  test("threshold constant is 15%", () => {
    expect(DEVIATION_THRESHOLD).toBe(0.15);
  });

  test("within 15% is approved", () => {
    expect(MarketDataValidationService.needsReview(115, 100)).toBe(false);
    expect(MarketDataValidationService.validationStatus(115, 100)).toBe("APPROVED");
  });

  test("above 15% needs review", () => {
    expect(MarketDataValidationService.needsReview(116, 100)).toBe(true);
    expect(MarketDataValidationService.validationStatus(116, 100)).toBe("PENDING_REVIEW");
  });

  test("null previous close auto-approves", () => {
    expect(MarketDataValidationService.needsReview(50, null)).toBe(false);
  });

  test("deviation pct computed correctly", () => {
    expect(MarketDataValidationService.deviationPct(120, 100)).toBeCloseTo(0.2);
  });
});
