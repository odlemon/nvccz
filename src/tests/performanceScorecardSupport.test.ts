import {
  assertIndividualGoalWeightsSum100,
  normalizeEmployeeGoalWeightsForScorecard,
  periodLabelMatches,
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
  getContributionWeight,
  resolveGoalEscalationStatus,
  resolveSectionWeights,
  formatScorecardSectionDocumentLabel,
  CEO_SECTION_LABELS,
  CEO_SECTION_WEIGHTS,
  resolveStoredGoalActual,
  isEmployeeGoalStoredActualMissing,
  summariseEmployeeResultsDelivery,
  resolveDepartmentRollupChildWeights,
  round,
  canViewOrgBscDashboard,
  isBoardChair,
  normalisePillarWeightsTo100,
  normalizeOrgBscScorecardPillar,
  rawRatingBandLabel,
  resolveScorecardLifecycleBanner,
  validatePersonalAttributesGrid,
  parsePersonalAttributesGridToRatings,
  mergeQualitativeTemplate,
  buildPersonalAttributesRatingGrid,
  EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS,
  canSaveDepartmentQualitativeEvaluation,
  resolveDepartmentHeadUser,
  buildHeadOfDepartmentPayload,
  isDepartmentHead,
  NO_DEPARTMENT_HEAD_MESSAGE
} from "../services/performanceScorecardSupport";

describe("performanceScorecardSupport", () => {
  test("periodLabelMatches: same year across FY vs plain label", () => {
    expect(periodLabelMatches("FY 2026", "2026")).toBe(true);
    expect(periodLabelMatches("2026 Annual", "2026")).toBe(true);
    expect(periodLabelMatches("2025", "2026")).toBe(false);
  });

  test("normalizeEmployeeGoalWeightsForScorecard: scales to 100% and satisfies assert", () => {
    const goals = [
      { scorecardWeight: 30 },
      { scorecardWeight: 30 },
      { scorecardWeight: 30 }
    ];
    const w: string[] = [];
    normalizeEmployeeGoalWeightsForScorecard(goals, w);
    expect(w.length).toBe(1);
    expect(() => assertIndividualGoalWeightsSum100(goals)).not.toThrow();
    expect(goals[0].scorecardWeight).toBeCloseTo(33.3333, 2);
  });

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

  test("Operating Expenses (reverse): $10k cap — actual $20k => 50% (target/actual), at/below $10k => 100%", () => {
    const t = 10_000;
    expect(
      computeGoalProgress({
        actualValue: 20_000,
        targetValue: t,
        isReverseKpi: true,
        stretchScoringEnabled: false
      }).progressPct
    ).toBe(50);
    expect(
      computeGoalProgress({
        actualValue: t,
        targetValue: t,
        isReverseKpi: true,
        stretchScoringEnabled: false
      }).progressPct
    ).toBe(100);
    expect(
      computeGoalProgress({
        actualValue: 8_000,
        targetValue: t,
        isReverseKpi: true,
        stretchScoringEnabled: false
      }).progressPct
    ).toBe(100);
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

  test("1–6 scale: standard KPI (target 10000, variance 10%)", () => {
    const v = 0.1;
    const t = 10_000;
    expect(computeRawRating({ actualValue: 8000, targetValue: t, allowableVariance: v, isReverseKpi: false })).toBe(2);
    expect(computeRawRating({ actualValue: 9500, targetValue: t, allowableVariance: v, isReverseKpi: false })).toBe(3);
    expect(computeRawRating({ actualValue: 10000, targetValue: t, allowableVariance: v, isReverseKpi: false })).toBe(4);
    expect(computeRawRating({ actualValue: 10800, targetValue: t, allowableVariance: v, isReverseKpi: false })).toBe(5);
    expect(computeRawRating({ actualValue: 20000, targetValue: t, allowableVariance: v, isReverseKpi: false })).toBe(6);
  });

  test("1–6 scale: reverse KPI budget-style (target 10000, variance 10%)", () => {
    const v = 0.1;
    const t = 10_000;
    expect(computeRawRating({ actualValue: 5000, targetValue: t, allowableVariance: v, isReverseKpi: true })).toBe(6);
    expect(computeRawRating({ actualValue: 9500, targetValue: t, allowableVariance: v, isReverseKpi: true })).toBe(5);
    expect(computeRawRating({ actualValue: 10000, targetValue: t, allowableVariance: v, isReverseKpi: true })).toBe(4);
    expect(computeRawRating({ actualValue: 10500, targetValue: t, allowableVariance: v, isReverseKpi: true })).toBe(3);
    expect(computeRawRating({ actualValue: 11500, targetValue: t, allowableVariance: v, isReverseKpi: true })).toBe(2);
    expect(computeRawRating({ actualValue: 20000, targetValue: t, allowableVariance: v, isReverseKpi: true })).toBe(1);
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

  test("employee scorecard: budget utilisation % mapped via reverse 1–6 (target 100%)", () => {
    expect(computeBudgetUtilisationRating(100)).toBe(4);
    expect(computeBudgetUtilisationRating(95)).toBe(5);
    expect(computeBudgetUtilisationRating(105)).toBe(3);
    expect(computeBudgetUtilisationRating(110)).toBe(3);
    expect(computeBudgetUtilisationRating(85)).toBe(6);
    expect(computeBudgetUtilisationRating(50)).toBe(6);
    expect(computeBudgetUtilisationRating(160)).toBe(1);
  });

  test("employee scorecard: performance label from final score (1–6 bands)", () => {
    expect(performanceLabelFromScore(5.7)).toBe("Exceptional");
    expect(performanceLabelFromScore(4.8)).toBe("Exceeds Expectations");
    expect(performanceLabelFromScore(3.8)).toBe("Meets Expectations");
    expect(performanceLabelFromScore(2.8)).toBe("Satisfactory");
    expect(performanceLabelFromScore(2.2)).toBe("Requires Improvement");
    expect(performanceLabelFromScore(1.2)).toBe("Unsatisfactory");
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

  test("summariseEmployeeResultsDelivery matches weighted mean of raw ratings", () => {
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

  test("department v2: performance labels align with unified 1–6 bands", () => {
    expect(performanceLabelFromDepartmentScore(5.7)).toBe("Exceptional");
    expect(performanceLabelFromDepartmentScore(4.8)).toBe("Exceeds Expectations");
    expect(performanceLabelFromDepartmentScore(3.8)).toBe("Meets Expectations");
    expect(performanceLabelFromDepartmentScore(2.8)).toBe("Satisfactory");
    expect(performanceLabelFromDepartmentScore(2.2)).toBe("Requires Improvement");
    expect(performanceLabelFromDepartmentScore(1.2)).toBe("Unsatisfactory");
  });

  test("CEO scorecard: performance labels match unified 1–6 bands", () => {
    expect(performanceLabelFromCEOFinalScore(5.7)).toBe("Exceptional");
    expect(performanceLabelFromCEOFinalScore(4.8)).toBe("Exceeds Expectations");
    expect(performanceLabelFromCEOFinalScore(3.8)).toBe("Meets Expectations");
    expect(performanceLabelFromCEOFinalScore(2.8)).toBe("Satisfactory");
    expect(performanceLabelFromCEOFinalScore(2.2)).toBe("Requires Improvement");
    expect(performanceLabelFromCEOFinalScore(1.2)).toBe("Unsatisfactory");
  });

  test("CEO scorecard: No Data when no indicators and score 0 (audit)", () => {
    expect(ceoPerformanceLabelForSection(0, 0)).toBe("No Data");
    expect(ceoPerformanceLabelOverall(0, 0)).toBe("No Data");
    expect(ceoPerformanceLabelForSection(0, 2)).toBe("Unsatisfactory");
    expect(ceoPerformanceLabelForSection(0, 2, 0)).toBe("No Data");
    expect(ceoPerformanceLabelForSection(0, 2, 2)).toBe("Unsatisfactory");
    expect(ceoPerformanceLabelOverall(3.2, 1)).toBe("Satisfactory");
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

  test("UAT: Org BSC pillar — two company goal lines, 50% weight each, 100% and 0% progress → pillar 50%", () => {
    const rows = redistributeWeights([
      { id: "fin", weight: 50, progressPct: 100, isPendingApproval: false, excludedFromScoring: false },
      { id: "hr", weight: 50, progressPct: 0, isPendingApproval: false, excludedFromScoring: false }
    ]);
    const activeRows = rows.filter((r) => !r.isPendingApproval && !r.excludedFromScoring);
    const pillarScore = activeRows.reduce(
      (sum, row) => sum + (row.effectiveWeight * (row as { progressPct: number }).progressPct) / 100,
      0
    );
    expect(round(pillarScore, 2)).toBe(50);
  });

  test("UAT: Org BSC — weighted dept sub-goal rollup (same formula as getOrgBSCDashboard children)", () => {
    const finProg = 100;
    const hrProg = 0;
    const finW = getContributionWeight({ activities: { contributionWeightPercent: 50 } }, 0);
    const hrW = getContributionWeight({ activities: { contributionWeightPercent: 50 } }, 0);
    const totalW = finW + hrW;
    const weightedSum = finProg * finW + hrProg * hrW;
    const rollupProgressPct = totalW > 0 ? round(weightedSum / totalW, 2) : 0;
    expect(rollupProgressPct).toBe(50);
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

  test("rawRatingBandLabel: Part 1 table labels for 1–6", () => {
    expect(rawRatingBandLabel(1)).toBe("Unsatisfactory");
    expect(rawRatingBandLabel(4)).toBe("Meets Target");
    expect(rawRatingBandLabel(6)).toBe("Exceeds — Beyond Variance");
    expect(rawRatingBandLabel(null)).toBeNull();
  });

  test("resolveScorecardLifecycleBanner: LIVE vs period ended vs locked", () => {
    const future = new Date(Date.now() + 86400000 * 30);
    expect(resolveScorecardLifecycleBanner(future, null).phase).toBe("LIVE");
    const past = new Date(Date.now() - 86400000);
    expect(resolveScorecardLifecycleBanner(past, null).phase).toBe("AWAITING_SIGNOFF");
    expect(
      resolveScorecardLifecycleBanner(past, { status: "FINAL", isLocked: true, archivedAt: null }).phase
    ).toBe("FINAL_LOCKED");
    expect(
      resolveScorecardLifecycleBanner(past, {
        status: "DRAFT",
        isLocked: false,
        archivedAt: new Date()
      }).phase
    ).toBe("ARCHIVED");
  });
});

describe("department qualitative evaluation helpers", () => {
  const sampleRow = (attribute: string, selectedLabel: string) => ({
    attribute,
    columns: EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS.map((label) => ({
      label,
      selected: label === selectedLabel
    }))
  });

  test("parsePersonalAttributesGridToRatings: one selected per row", () => {
    const ratings = parsePersonalAttributesGridToRatings([
      sampleRow("Leadership and Management", "Satisfactory")
    ]);
    expect(ratings["Leadership and Management"].Satisfactory).toBe(true);
    expect(ratings["Leadership and Management"].Excellent).toBe(false);
  });

  test("validatePersonalAttributesGrid: rejects two selections", () => {
    expect(() =>
      validatePersonalAttributesGrid([
        {
          attribute: "Ethics",
          columns: [
            { label: "Excellent", selected: true },
            { label: "Very Good", selected: true },
            { label: "Satisfactory", selected: false },
            { label: "Requires Improvement", selected: false },
            { label: "Unsatisfactory", selected: false }
          ]
        }
      ])
    ).toThrow(/more than one column selected/i);
  });

  test("mergeQualitativeTemplate: preserves unrelated keys", () => {
    const merged = mergeQualitativeTemplate(
      { customNote: "hod-review", beginningOfCycle: [{ text: "plan A" }] },
      {
        personalAttributeRatings: parsePersonalAttributesGridToRatings([
          sampleRow("Teamwork", "Very Good")
        ])
      }
    );
    expect(merged.customNote).toBe("hod-review");
    expect(merged.beginningOfCycle).toEqual([{ text: "plan A" }]);
    const grid = buildPersonalAttributesRatingGrid(merged);
    const teamwork = grid.find((r: { attribute: string }) => r.attribute === "Teamwork");
    expect(
      teamwork?.columns.find((c: { label: string; selected: boolean | null }) => c.label === "Very Good")
        ?.selected
    ).toBe(true);
  });

  test("resolveDepartmentHeadUser: HEAD role in department (not generic manager code)", () => {
    const users = [
      {
        id: "hod-1",
        firstName: "Blessing",
        lastName: "Finance",
        userDepartment: "Finance",
        departmentRole: "HEAD"
      },
      {
        id: "staff-1",
        firstName: "Ashley",
        lastName: "Staff",
        userDepartment: "Finance",
        departmentRole: "MEMBER"
      }
    ];
    const { head, headCount } = resolveDepartmentHeadUser(users, "Finance");
    expect(head?.id).toBe("hod-1");
    expect(headCount).toBe(1);
    expect(isDepartmentHead(users[0], "Finance")).toBe(true);
    expect(isDepartmentHead(users[1], "Finance")).toBe(false);
  });

  test("resolveDepartmentHeadUser: first head when multiple; no-head message", () => {
    const users = [
      {
        id: "h1",
        firstName: "A",
        lastName: "One",
        userDepartment: "Finance",
        departmentRole: "HEAD"
      },
      {
        id: "h2",
        firstName: "B",
        lastName: "Two",
        userDepartment: "Finance",
        departmentRole: "HEAD"
      }
    ];
    const { head, headCount } = resolveDepartmentHeadUser(users, "Finance");
    expect(head?.id).toBe("h1");
    expect(headCount).toBe(2);
    const payload = buildHeadOfDepartmentPayload(head, headCount);
    expect(payload.hasHead).toBe(true);
    expect(payload.multipleHeadsDetected).toBe(true);

    const none = buildHeadOfDepartmentPayload(null, 0);
    expect(none.name).toBe(NO_DEPARTMENT_HEAD_MESSAGE);
    expect(none.hasHead).toBe(false);
  });

  test("canSaveDepartmentQualitativeEvaluation: admin or CEO only", () => {
    expect(canSaveDepartmentQualitativeEvaluation({ id: "1", role: { name: "Admin" } })).toBe(
      true
    );
    expect(
      canSaveDepartmentQualitativeEvaluation({
        id: "2",
        role: { name: "Chief Executive" },
        roleCode: "CEO"
      })
    ).toBe(true);
    expect(
      canSaveDepartmentQualitativeEvaluation({
        id: "3",
        userDepartment: "Finance",
        departmentRole: "HEAD"
      })
    ).toBe(false);
  });
});

describe("formatScorecardSectionDocumentLabel", () => {
  test("uses contract weight percent in document heading, not defaults", () => {
    const label = formatScorecardSectionDocumentLabel(
      "A1",
      CEO_SECTION_LABELS,
      35,
      CEO_SECTION_WEIGHTS
    );
    expect(label).toContain("(35%)");
    expect(label).not.toContain("(30%)");
    expect(label).toContain("A1 — Outcomes");
  });

  test("falls back to default weight when contract weight missing", () => {
    const label = formatScorecardSectionDocumentLabel(
      "D",
      CEO_SECTION_LABELS,
      undefined,
      CEO_SECTION_WEIGHTS
    );
    expect(label).toContain("(5%)");
  });
});
