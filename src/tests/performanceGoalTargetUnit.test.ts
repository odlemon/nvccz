import { resolveGoalTargetUnitForApi } from "../services/performanceGoalTargetUnit";

describe("resolveGoalTargetUnitForApi", () => {
  test("uses KPI unitSymbol when goal.targetUnit is null", () => {
    expect(
      resolveGoalTargetUnitForApi({
        targetUnit: null,
        measureName: "%",
        kpi: { unit: null, unitSymbol: "%", unitCategory: "Percentage" }
      })
    ).toBe("%");
  });

  test("prefers stored targetUnit on goal", () => {
    expect(
      resolveGoalTargetUnitForApi({
        targetUnit: "USD",
        kpi: { unitSymbol: "%" }
      })
    ).toBe("USD");
  });

  test("falls back to measureName when KPI has no unit fields", () => {
    expect(
      resolveGoalTargetUnitForApi({
        targetUnit: null,
        measureName: "ZiG m",
        kpi: null
      })
    ).toBe("ZiG m");
  });
});
