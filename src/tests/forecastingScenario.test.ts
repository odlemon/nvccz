import {
  buildPeriodKeys,
  validateHorizonMonths,
  classifyPeriodKeys,
  isFuturePeriod
} from "../utils/forecastPeriodUtils";

describe("forecastPeriodUtils", () => {
  const start = new Date(Date.UTC(2026, 6, 1));
  const end = new Date(Date.UTC(2027, 5, 1));

  test("buildPeriodKeys monthly 12-month horizon", () => {
    const keys = buildPeriodKeys(start, end, "MONTHLY");
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe("2026-07");
    expect(keys[11]).toBe("2027-06");
  });

  test("validateHorizonMonths accepts 12/24/60", () => {
    expect(validateHorizonMonths(12)).toBe(true);
    expect(validateHorizonMonths(24)).toBe(true);
    expect(validateHorizonMonths(60)).toBe(true);
    expect(validateHorizonMonths(18)).toBe(false);
  });

  test("classifyPeriodKeys splits elapsed vs future", () => {
    const keys = buildPeriodKeys(start, end, "MONTHLY");
    const asOf = new Date(Date.UTC(2026, 8, 15));
    const { elapsed, future } = classifyPeriodKeys(keys, asOf);
    expect(elapsed.length).toBeGreaterThan(0);
    expect(future.length).toBeGreaterThan(0);
    expect(elapsed.every((k) => !isFuturePeriod(k, asOf))).toBe(true);
  });
});
