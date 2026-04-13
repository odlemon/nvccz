import {
  diversitySpreadFromPercents,
  safeGrowthPercent,
  safeRatioPercent
} from "../services/bscDigitalEntryMath";

describe("bscDigitalEntryMath", () => {
  test("safeRatioPercent returns null on zero denominator", () => {
    expect(safeRatioPercent(10, 0)).toBeNull();
    expect(safeRatioPercent(10, null)).toBeNull();
  });

  test("safeRatioPercent computes percent", () => {
    expect(safeRatioPercent(25, 100)).toBe(25);
    expect(safeRatioPercent(1, 4)).toBe(25);
  });

  test("safeGrowthPercent null when previous is zero", () => {
    expect(safeGrowthPercent(110, 0)).toBeNull();
  });

  test("diversitySpreadFromPercents higher when more even", () => {
    const uneven = diversitySpreadFromPercents({ a: 90, b: 10 });
    const even = diversitySpreadFromPercents({ a: 50, b: 50 });
    expect(even).toBeGreaterThan(uneven);
  });
});
