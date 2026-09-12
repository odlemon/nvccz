import { TaxReturnPackCgtEngine } from "../src/services/taxReturnPack/TaxReturnPackCgtEngine";

describe("TaxReturnPackCgtEngine", () => {
  test("indexation adjusted cost (Eq. 3)", () => {
    const adjusted = TaxReturnPackCgtEngine.adjustedCost(100000, 4);
    expect(adjusted).toBe(110000);
  });

  test("capital gain floor at zero (Eq. 4)", () => {
    const gain = TaxReturnPackCgtEngine.capitalGain(90000, 100000);
    expect(gain).toBe(0);
  });

  test("CGT liability 20% (Eq. 5)", () => {
    const line = TaxReturnPackCgtEngine.computeLine({
      assetRef: "SharesA",
      sourceType: "TEST",
      salePrice: 500000,
      costOriginal: 350000,
      acquiredAt: new Date("2020-01-01"),
      disposedAt: new Date("2025-06-01"),
    });
    expect(line.capitalGain).toBeGreaterThan(0);
    expect(line.cgtLiability).toBe(Math.round(line.capitalGain * 0.2 * 100) / 100);
  });
});
