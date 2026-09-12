import { QuarterlyStatementMetricsEngine } from "../src/services/quarterlyStatements/QuarterlyStatementMetricsEngine";

describe("QuarterlyStatementMetricsEngine", () => {
  test("DPI TVPI RVPI to four decimals", () => {
    const r = QuarterlyStatementMetricsEngine.ratios(1000000, 333333, 1016667);
    expect(r.dpi).toBeCloseTo(0.3333, 4);
    expect(r.rvpi).toBeCloseTo(1.0167, 4);
    expect(r.tvpi).toBeCloseTo(1.35, 4);
  });

  test("net IRR with terminal NAV", () => {
    const irr = QuarterlyStatementMetricsEngine.netIrr(
      [
        { amount: -500000, date: new Date("2024-01-01") },
        { amount: -500000, date: new Date("2025-01-01") },
        { amount: 200000, date: new Date("2025-06-01") },
      ],
      900000,
      new Date("2026-03-31")
    );
    expect(irr).not.toBeNull();
    if (irr != null) expect(irr).toBeGreaterThan(0);
  });

  test("round4", () => {
    expect(QuarterlyStatementMetricsEngine.round4(1.234567)).toBe(1.2346);
  });
});
