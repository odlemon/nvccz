import { LpFundMetricsService } from "../services/fundReporting/LpFundMetricsService";

describe("LpFundMetricsService.ratios", () => {
  test("TVPI = (distributions + NAV) / paid-in (Eq. 3)", () => {
    const { tvpi, dpi, rvpi } = LpFundMetricsService.ratios(100, 40, 80);
    expect(tvpi).toBeCloseTo(1.2, 6);
    expect(dpi).toBeCloseTo(0.4, 6);
    expect(rvpi).toBeCloseTo(0.8, 6);
  });

  test("zero paid-in yields zero ratios", () => {
    const { tvpi, dpi, rvpi } = LpFundMetricsService.ratios(0, 10, 10);
    expect(tvpi).toBe(0);
    expect(dpi).toBe(0);
    expect(rvpi).toBe(0);
  });

  test("DPI realized cash only (Eq. 4)", () => {
    const { dpi } = LpFundMetricsService.ratios(200, 50, 100);
    expect(dpi).toBeCloseTo(0.25, 6);
  });
});
