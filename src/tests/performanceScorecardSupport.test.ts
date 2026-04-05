import {
  assertIndividualGoalWeightsSum100,
  buildEscalationStatus,
  computeBudgetUtilisationRating,
  isAdminViewer,
  computeGoalProgress,
  computeRawRating,
  computeStatus,
  departmentMatrixVarianceStatus,
  parseStretchTargetValueFromActivities,
  performanceLabelFromScore,
  performanceLabelFromDepartmentScore,
  performanceLabelFromCEOFinalScore,
  ceoPerformanceLabelForSection,
  ceoPerformanceLabelOverall,
  redistributeWeights,
  resolveGoalEscalationStatus,
  resolveSectionWeights,
  resolveStoredGoalActual,
  isEmployeeGoalStoredActualMissing,
  summariseEmployeeResultsDelivery,
  resolveDepartmentRollupChildWeights,
  round,
  canViewOrgBscDashboard,
  isBoardChair,
  normalisePillarWeightsTo100,
  normalizeOrgBscScorecardPillar
} from "../services/performanceScorecardSupport";

describe("performanceScorecardSupport", () => {
  test("normalizeOrgBscScorecardPillar: API codes and case-insensitive names", () => {
    expect(normalizeOrgBscScorecardPillar("FINANCIAL")).toBe("Financial");
    expect(normalizeOrgBscScorecardPillar("LEARNING_GROWTH")).toBe("Learning, Growth & HR");
    expect(normalizeOrgBscScorecardPillar("financial")).toBe("Financial");
    expect(normalizeOrgBscScorecardPillar(null)).toBe(null);
    expect(normalizeOrgBscScorecardPillar("")).toBe(null);
  });

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

  test("resolveStoredGoalActual prefers current when precise is stale 0 (forward KPI)", () => {
    expect(
      resolveStoredGoalActual({
        preciseCurrentValue: 0,
        currentValue: 800_000,
        isReverseKpi: false
      })
    ).toEqual({ value: 800_000, hasExplicitStored: true });
  });

  test("resolveStoredGoalActual keeps precise 0 for reverse KPI when both columns differ", () => {
    expect(
      resolveStoredGoalActual({
        preciseCurrentValue: 0,
        currentValue: 1_000_000,
        isReverseKpi: true
      })
    ).toEqual({ value: 0, hasExplicitStored: true });
  });

  test("isEmployeeGoalStoredActualMissing is false if either stored field is non-zero", () => {
    expect(isEmployeeGoalStoredActualMissing({ preciseCurrentValue: 0, currentValue: 800_000 })).toBe(
      false
    );
    expect(isEmployeeGoalStoredActualMissing({ preciseCurrentValue: null, currentValue: null })).toBe(
      true
    );
    expect(isEmployeeGoalStoredActualMissing({ preciseCurrentValue: 0, currentValue: 0 })).toBe(true);
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

  test("employee scorecard: budget utilisation bands (90–110 → 4, etc.)", () => {
    expect(computeBudgetUtilisationRating(100)).toBe(4);
    expect(computeBudgetUtilisationRating(90)).toBe(4);
    expect(computeBudgetUtilisationRating(110)).toBe(4);
    expect(computeBudgetUtilisationRating(85)).toBe(3);
    expect(computeBudgetUtilisationRating(50)).toBe(2);
    expect(computeBudgetUtilisationRating(49)).toBe(1);
  });

  test("employee scorecard: performance label from final score", () => {
    expect(performanceLabelFromScore(3.6)).toBe("Outstanding");
    expect(performanceLabelFromScore(3.2)).toBe("Exceeds Expectations");
    expect(performanceLabelFromScore(2.5)).toBe("Meets Expectations");
    expect(performanceLabelFromScore(1.5)).toBe("Requires Improvement");
    expect(performanceLabelFromScore(0.5)).toBe("Unsatisfactory");
  });

  test("redistributes weights when a goal is excluded from scoring", () => {
    const result = redistributeWeights([
      { id: "a", weight: 60, isPendingApproval: false, excludedFromScoring: false },
      { id: "b", weight: 40, isPendingApproval: false, excludedFromScoring: true }
    ]);
    expect(result[0].effectiveWeight).toBe(100);
    expect(result[1].effectiveWeight).toBe(0);
  });

  test("assertIndividualGoalWeightsSum100 accepts equal fallbacks", () => {
    expect(() =>
      assertIndividualGoalWeightsSum100([{ scorecardWeight: null }, { scorecardWeight: null }])
    ).not.toThrow();
  });

  test("assertIndividualGoalWeightsSum100 rejects bad totals", () => {
    expect(() =>
      assertIndividualGoalWeightsSum100([
        { scorecardWeight: 30 },
        { scorecardWeight: 30 }
      ])
    ).toThrow(/Goal weights do not sum/);
  });

  test("isAdminViewer recognises admin and sysadmin role signals", () => {
    expect(isAdminViewer({ role: { name: "Admin" } })).toBe(true);
    expect(isAdminViewer({ roleCode: "admin" })).toBe(true);
    expect(isAdminViewer({ role: { name: "Employee" } })).toBe(false);
  });

  test("summariseEmployeeResultsDelivery matches weighted 0–4 score", () => {
    const rows = [
      {
        isPendingApproval: false,
        excludedFromScoring: false,
        effectiveWeight: 50,
        weightedScore: 2
      },
      {
        isPendingApproval: false,
        excludedFromScoring: false,
        effectiveWeight: 50,
        weightedScore: 1
      }
    ];
    const s = summariseEmployeeResultsDelivery(rows);
    expect(s.resultsDeliveryScore).toBe(3);
    expect(s.pendingApprovalCount).toBe(0);
  });

  test("department v2: performance labels use spec bands (not employee labels)", () => {
    expect(performanceLabelFromDepartmentScore(3.6)).toBe("Excellent");
    expect(performanceLabelFromDepartmentScore(3.1)).toBe("Very Good");
    expect(performanceLabelFromDepartmentScore(2.6)).toBe("Satisfactory");
    expect(performanceLabelFromDepartmentScore(2.1)).toBe("Requires Improvement");
    expect(performanceLabelFromDepartmentScore(1.5)).toBe("Unsatisfactory");
  });

  test("CEO scorecard: performance labels from final score (contract review bands)", () => {
    expect(performanceLabelFromCEOFinalScore(3.6)).toBe("Excellent");
    expect(performanceLabelFromCEOFinalScore(3.1)).toBe("Very Good");
    expect(performanceLabelFromCEOFinalScore(2.6)).toBe("Satisfactory");
    expect(performanceLabelFromCEOFinalScore(2.1)).toBe("Requires Improvement");
    expect(performanceLabelFromCEOFinalScore(1.5)).toBe("Unsatisfactory");
  });

  test("CEO scorecard: No Data when no indicators and score 0 (audit)", () => {
    expect(ceoPerformanceLabelForSection(0, 0)).toBe("No Data");
    expect(ceoPerformanceLabelOverall(0, 0)).toBe("No Data");
    expect(ceoPerformanceLabelForSection(0, 2)).toBe("Unsatisfactory");
    expect(ceoPerformanceLabelForSection(0, 2, 0)).toBe("No Data");
    expect(ceoPerformanceLabelForSection(0, 2, 2)).toBe("Unsatisfactory");
    expect(ceoPerformanceLabelOverall(3.2, 1)).toBe("Very Good");
    expect(ceoPerformanceLabelOverall(0, 3, 0)).toBe("No Data");
  });

  test("department v2: stretch direct progress uses stretch target capped at 150%", () => {
    expect(
      computeGoalProgress({
        actualValue: 200,
        targetValue: 100,
        isReverseKpi: false,
        stretchScoringEnabled: true,
        stretchTargetValue: 100
      }).progressPct
    ).toBe(150);
    expect(
      computeGoalProgress({
        actualValue: 80,
        targetValue: 100,
        isReverseKpi: false,
        stretchScoringEnabled: true,
        stretchTargetValue: 100
      }).progressPct
    ).toBe(80);
  });

  test("department v2: weighted aggregate score = sum(effWeight*rawRating/100)*100/sum(effWeight)", () => {
    const weightedRows = redistributeWeights([
      { weight: 30, rawRating: 4, isPendingApproval: false },
      { weight: 70, rawRating: 2, isPendingApproval: false }
    ]).map((r) => ({
      ...r,
      weightedScore: round((r.effectiveWeight * r.rawRating) / 100, 4)
    }));
    const active = weightedRows.filter((r) => !r.isPendingApproval);
    const activeGoalWeight = active.reduce((s, r) => s + r.effectiveWeight, 0);
    const totalWeightedScore = active.reduce((s, r) => s + r.weightedScore, 0);
    const departmentScore =
      activeGoalWeight > 0 ? round((totalWeightedScore * 100) / activeGoalWeight, 2) : 0;
    expect(departmentScore).toBe(2.6);
  });

  test("department v2 rollup: only assignees present in FINAL scorecard map are eligible children", () => {
    const finalByUser = new Map<string, { status: string }>([
      ["u-final", { status: "FINAL" }]
    ]);
    const subGoals = [
      { assignedToId: "u-final" },
      { assignedToId: "u-draft" },
      { assignedToId: null as string | null }
    ];
    const eligible = subGoals.filter(
      (cg) => cg.assignedToId && finalByUser.has(cg.assignedToId)
    );
    expect(eligible).toHaveLength(1);
    expect(eligible[0].assignedToId).toBe("u-final");
  });

  test("department matrix variance: reverse KPI under target is GREEN (not RED from negative variance)", () => {
    expect(
      departmentMatrixVarianceStatus({
        variance: -100,
        targetValue: 900,
        allowableVariance: 0.1,
        isReverseKpi: true,
        missingValue: false
      })
    ).toBe("GREEN");
  });

  test("department matrix variance: reverse KPI over target beyond band is RED", () => {
    expect(
      departmentMatrixVarianceStatus({
        variance: 200,
        targetValue: 900,
        allowableVariance: 0.1,
        isReverseKpi: true,
        missingValue: false
      })
    ).toBe("RED");
  });

  test("department matrix variance: missingValue forces RED", () => {
    expect(
      departmentMatrixVarianceStatus({
        variance: -900,
        targetValue: 900,
        allowableVariance: 0.1,
        isReverseKpi: true,
        missingValue: true
      })
    ).toBe("RED");
  });

  test("department matrix variance: standard KPI below target is RED when outside band", () => {
    expect(
      departmentMatrixVarianceStatus({
        variance: -200,
        targetValue: 900,
        allowableVariance: 0.1,
        isReverseKpi: false,
        missingValue: false
      })
    ).toBe("RED");
  });

  test("resolveDepartmentRollupChildWeights: equal split when no explicit weights", () => {
    const children = [{ activities: {} }, { activities: {} }, { activities: {} }];
    const { weights, warnings } = resolveDepartmentRollupChildWeights(children, "G1");
    expect(weights).toHaveLength(3);
    expect(round(weights.reduce((a, b) => a + b, 0), 2)).toBe(100);
    expect(warnings).toHaveLength(0);
    weights.forEach((w) => expect(w).toBeCloseTo(100 / 3, 1));
  });

  test("resolveDepartmentRollupChildWeights: explicit + remainder split among unset", () => {
    const children = [
      { activities: { contributionWeightPercent: 30 } },
      { activities: {} },
      { activities: {} }
    ];
    const { weights } = resolveDepartmentRollupChildWeights(children, "G1");
    expect(weights[0]).toBeCloseTo(30, 1);
    expect(weights[1]).toBeCloseTo(35, 1);
    expect(weights[2]).toBeCloseTo(35, 1);
  });

  test("isBoardChair: BOARD_CHAIRPERSON role code", () => {
    expect(isBoardChair({ id: "u1", roleCode: "BOARD_CHAIRPERSON" })).toBe(true);
  });

  test("canViewOrgBscDashboard: board chair denied", () => {
    expect(canViewOrgBscDashboard({ id: "u1", roleCode: "BOARD_CHAIR" })).toBe(false);
  });

  test("canViewOrgBscDashboard: CEO allowed", () => {
    expect(canViewOrgBscDashboard({ id: "u1", roleCode: "CEO" })).toBe(true);
  });

  test("normalisePillarWeightsTo100 scales when sum is not 100", () => {
    const { normalised, didNormalise } = normalisePillarWeightsTo100({
      A: 20,
      B: 20
    });
    expect(didNormalise).toBe(true);
    expect(normalised.A + normalised.B).toBeCloseTo(100, 2);
  });
});
