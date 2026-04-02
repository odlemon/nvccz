import {
  buildEscalationStatus,
  computeGoalProgress,
  computeRawRating,
  computeStatus,
  parseStretchTargetValueFromActivities,
  redistributeWeights,
  resolveGoalEscalationStatus,
  resolveSectionWeights
} from "../services/performanceScorecardSupport";

describe("performanceScorecardSupport", () => {
  test("C.09: target 100 / actual 120 — BSC progress capped at 100% when stretch scoring off", () => {
    expect(
      computeGoalProgress({
        actualValue: 120,
        targetValue: 100,
        isReverseKpi: false,
        stretchScoringEnabled: false
      }).progressPct
    ).toBe(100);
  });

  test("C.09: same scenario reports 120% when contract has stretch scoring enabled", () => {
    expect(
      computeGoalProgress({
        actualValue: 120,
        targetValue: 100,
        isReverseKpi: false,
        stretchScoringEnabled: true
      }).progressPct
    ).toBe(120);
  });

  test("C.09: stretch goal (e.g. 120) defined in activities JSON for scorecard display", () => {
    expect(parseStretchTargetValueFromActivities({ stretchTargetValue: 120 })).toBe(120);
    expect(parseStretchTargetValueFromActivities({ stretchTarget: 120 })).toBe(120);
    expect(parseStretchTargetValueFromActivities(null)).toBeNull();
    expect(parseStretchTargetValueFromActivities({ stretchTargetValue: "invalid" })).toBeNull();
  });

  test("computes reverse KPI progress safely", () => {
    expect(
      computeGoalProgress({
        actualValue: 0,
        targetValue: 100,
        isReverseKpi: true,
        stretchScoringEnabled: false
      }).progressPct
    ).toBe(0);
  });

  test("rates reverse KPI using flipped thresholds", () => {
    expect(
      computeRawRating({
        actualValue: 105,
        targetValue: 100,
        allowableVariance: 0.1,
        isReverseKpi: true
      })
    ).toBe(3);
  });

  test("redistributes active weights when one goal is pending", () => {
    const result = redistributeWeights([
      { id: "a", weight: 60, isPendingApproval: false },
      { id: "b", weight: 40, isPendingApproval: true }
    ]);

    expect(result[0].effectiveWeight).toBe(100);
    expect(result[1].effectiveWeight).toBe(0);
  });

  test("keeps configured section weight overrides", () => {
    expect(resolveSectionWeights({ A1: 35 }, { A1: 30, A2: 20 })).toEqual({
      A1: 35,
      A2: 20
    });
  });

  test("C.05: ~51% progress with ~2 days left escalates RED base to AMBER ZONE (forward KPI)", () => {
    const end = new Date(Date.now() + 2 * 86400000 - 60_000);
    const base = computeStatus({
      actualValue: 51000,
      targetValue: 100000,
      allowableVariance: 0.1,
      isReverseKpi: false
    });
    expect(base).toBe("RED");
    expect(
      buildEscalationStatus(base, end, { progressPct: 51, isReverseKpi: false })
    ).toBe("AMBER ZONE");

    expect(
      resolveGoalEscalationStatus({
        currentValue: 51000,
        targetValue: 100000,
        allowableVariance: 0.1,
        isReverseKpi: false,
        endDate: end
      })
    ).toBe("AMBER ZONE");
  });
});
