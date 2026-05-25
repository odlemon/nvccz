import {
  applyValueDisplayHardening,
  resolveTaskValueDisplay
} from "../services/taskValueDisplay";

describe("task valueDisplay", () => {
  test("due diligence task without goal hides values", () => {
    const vd = resolveTaskValueDisplay({
      fromDueDiligence: true,
      kpi: null
    });
    expect(vd).toEqual({ showValue: false, unitSymbol: null });
  });

  test("goal with USD targetUnit shows value and symbol", () => {
    const vd = resolveTaskValueDisplay({
      goalId: "g1",
      goal: {
        targetUnit: "USD",
        targetValue: 50000,
        kpi: { unitSymbol: "$", unitCategory: "Currency", hasUnit: true }
      },
      monetaryValue: 50000
    });
    expect(vd.showValue).toBe(true);
    expect(vd.unitSymbol).toBe("$");
  });

  test("hardening nulls achievement fields when showValue false", () => {
    const out = applyValueDisplayHardening(
      { monetaryValue: 100, monetaryValueAchieved: 0, percentValue: 0, percentValueAchieved: 0 },
      { showValue: false, unitSymbol: null }
    );
    expect(out.monetaryValue).toBeNull();
    expect(out.monetaryValueAchieved).toBeNull();
  });
});
