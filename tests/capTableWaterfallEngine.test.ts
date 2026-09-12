import { CapTableWaterfallEngine } from "../src/services/capTable/CapTableWaterfallEngine";

describe("CapTableWaterfallEngine", () => {
  test("pays preferential returns by seniority", () => {
    const r = CapTableWaterfallEngine.evaluate(1000000, [
      {
        classCode: "SERIES_A",
        seniorityIndex: 1,
        liquidationMultiplier: 1,
        isParticipating: false,
        issuedShares: 100000,
        originalCostPerShare: 2,
      },
      {
        classCode: "COMMON",
        seniorityIndex: 99,
        liquidationMultiplier: 1,
        isParticipating: false,
        issuedShares: 500000,
        originalCostPerShare: 0.5,
      },
    ]);
    expect(r.payouts[0].preferentialPayout).toBe(200000);
    expect(r.totalProceeds).toBe(1000000);
  });
});
