import { CapTableDilutionEngine } from "../src/services/capTable/CapTableDilutionEngine";

describe("CapTableDilutionEngine", () => {
  test("accrued interest formula", () => {
    const i = CapTableDilutionEngine.accruedInterest(100000, 0.08, 180);
    expect(i).toBeCloseTo(3945.2055, 2);
  });

  test("conversion price uses min of cap and discount", () => {
    const p = CapTableDilutionEngine.conversionPrice({
      valuationCap: 5000000,
      discountRate: 0.2,
      preMoneyFullyDilutedShares: 1000000,
      roundPricePerShare: 10,
    });
    expect(p).toBeCloseTo(5, 4);
  });

  test("run simulator returns post-money metrics", () => {
    const r = CapTableDilutionEngine.run({
      preMoneyValuation: 10000000,
      roundInvestment: 2500000,
      optionPoolTopUpPct: 0,
      preMoneyFullyDilutedShares: 1000000,
      notes: [],
    });
    expect(r.postMoneyValuation).toBe(12500000);
    expect(r.newRoundShares).toBeGreaterThan(0);
    expect(r.roundPricePerShare).toBeCloseTo(10, 1);
  });
});
