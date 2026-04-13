import {
  parseRequiredAnnualPerformancePeriod,
  utcCalendarYearBounds
} from "../services/PerformanceContractSetupService";

describe("parseRequiredAnnualPerformancePeriod", () => {
  it("requires periodYear or both periodStart and periodEnd", () => {
    expect(() => parseRequiredAnnualPerformancePeriod({})).toThrow(/periodYear/);
  });

  it("resolves from periodYear", () => {
    const r = parseRequiredAnnualPerformancePeriod({ periodYear: 2026 });
    expect(r.periodYear).toBe(2026);
    expect(r.periodLabel).toBe("2026");
    const b = utcCalendarYearBounds(2026);
    expect(r.periodStart.getTime()).toBe(b.periodStart.getTime());
    expect(r.periodEnd.getTime()).toBe(b.periodEnd.getTime());
  });

  it("accepts exact UTC calendar bounds without periodYear", () => {
    const b = utcCalendarYearBounds(2025);
    const r = parseRequiredAnnualPerformancePeriod({
      periodStart: b.periodStart,
      periodEnd: b.periodEnd
    });
    expect(r.periodYear).toBe(2025);
  });

  it("rejects non-calendar bounds", () => {
    expect(() =>
      parseRequiredAnnualPerformancePeriod({
        periodStart: new Date("2026-06-01T00:00:00.000Z"),
        periodEnd: utcCalendarYearBounds(2026).periodEnd
      })
    ).toThrow(/exactly/);
  });

  it("rejects mismatched periodYear and dates", () => {
    const b = utcCalendarYearBounds(2025);
    expect(() =>
      parseRequiredAnnualPerformancePeriod({
        periodYear: 2026,
        periodStart: b.periodStart,
        periodEnd: b.periodEnd
      })
    ).toThrow(/periodStart must be .* for periodYear 2026/);
  });
});
