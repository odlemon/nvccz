import { FundraisingMetricsEngine } from "../src/services/fundraising/FundraisingMetricsEngine";

describe("FundraisingMetricsEngine", () => {
  test("weighted pipeline value", () => {
    const wpv = FundraisingMetricsEngine.weightedPipelineValue([
      { amount: 1000000, winProbabilityPct: 10 },
      { amount: 500000, winProbabilityPct: 50 },
    ]);
    expect(wpv).toBeCloseTo(350000, 0);
  });

  test("completion percent caps at 100", () => {
    expect(FundraisingMetricsEngine.completionPct(6000000, 5000000)).toBe(100);
    expect(FundraisingMetricsEngine.completionPct(1200000, 5000000)).toBeCloseTo(24, 1);
  });

  test("gap remaining", () => {
    expect(FundraisingMetricsEngine.gapRemaining(5000000, 1200000)).toBe(3800000);
  });

  test("days left", () => {
    const close = new Date("2026-12-31");
    const now = new Date("2026-06-01");
    const d = FundraisingMetricsEngine.daysLeft(close, now);
    expect(d).toBeGreaterThan(200);
  });
});
