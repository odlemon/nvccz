import {
  translateBaseValue,
  currencyDriftComponent,
  varianceAbsolute,
  variancePercent,
  linearRegressionSlopeIntercept,
  linearProjection,
  cagrProjection
} from "../utils/forecastMath";

describe("forecastMath Eq. 4-10", () => {
  test("translateBaseValue (Eq. 4)", () => {
    expect(Number(translateBaseValue(100, 25.5))).toBe(2550);
  });

  test("currencyDriftComponent (Eq. 5)", () => {
    expect(Number(currencyDriftComponent(100, 26, 25))).toBe(100);
  });

  test("varianceAbsolute (Eq. 6)", () => {
    expect(Number(varianceAbsolute(110, 100))).toBe(10);
    expect(Number(varianceAbsolute(90, 100))).toBe(-10);
  });

  test("variancePercent (Eq. 7) — normal case", () => {
    expect(Number(variancePercent(110, 100))).toBe(10);
  });

  test("variancePercent (Eq. 7) — forecast zero, actual positive", () => {
    expect(Number(variancePercent(50, 0))).toBe(100);
  });

  test("variancePercent (Eq. 7) — forecast zero, actual zero", () => {
    expect(Number(variancePercent(0, 0))).toBe(0);
  });

  test("linear regression and projection (Eq. 8-10)", () => {
    const points = [
      { t: 0, y: 10 },
      { t: 1, y: 12 },
      { t: 2, y: 14 }
    ];
    const { m, b } = linearRegressionSlopeIntercept(points);
    expect(m).toBeCloseTo(2, 5);
    expect(b).toBeCloseTo(10, 5);
    expect(linearProjection(m, b, 3)).toBeCloseTo(16, 5);
  });

  test("cagrProjection", () => {
    expect(cagrProjection(1000, 0.05, 2)).toBeCloseTo(1102.5, 2);
  });
});
