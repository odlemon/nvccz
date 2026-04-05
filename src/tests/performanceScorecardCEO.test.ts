import { PerformanceScorecardService } from "../services/PerformanceScorecardService";
import { CEO_SECTION_WEIGHTS, round } from "../services/performanceScorecardSupport";

const Svc = PerformanceScorecardService as any;

function baseGoal(overrides: Record<string, unknown>) {
  return {
    id: "g1",
    scorecardSection: "A1",
    title: "Indicator",
    formulaType: "direct",
    activities: {},
    preciseTargetValue: 100,
    preciseCurrentValue: 100,
    scorecardWeight: 50,
    allowableVariance: 0.1,
    isReverseKpi: false,
    isPendingApproval: false,
    targetUnit: null,
    measureName: null,
    targetValue: 100,
    currentValue: null,
    ...overrides
  };
}

describe("PerformanceScorecardService CEO helpers", () => {
  test("extractCEOFormulaActual: revenue growth percent", () => {
    const r = Svc.extractCEOFormulaActual({
      formulaType: "REVENUE_GROWTH",
      activities: { currentRevenue: 110, previousRevenue: 100 },
      preciseCurrentValue: null,
      currentValue: null
    });
    expect(r.missingValue).toBe(false);
    expect(r.value).toBeCloseTo(10, 4);
  });

  test("extractCEOFormulaActual: revenue growth missing when previous revenue is zero", () => {
    const r = Svc.extractCEOFormulaActual({
      formulaType: "revenue_growth",
      activities: { currentRevenue: 110, previousRevenue: 0 },
      preciseCurrentValue: null,
      currentValue: null
    });
    expect(r.missingValue).toBe(true);
    expect(r.value).toBe(0);
  });

  test("extractCEOFormulaActual: debt–equity ratio and missing when equity is zero", () => {
    expect(
      Svc.extractCEOFormulaActual({
        formulaType: "RATIO",
        activities: { total_liabilities: 200, total_shareholders_equity: 100 },
        preciseCurrentValue: null,
        currentValue: null
      }).value
    ).toBeCloseTo(2, 4);

    const miss = Svc.extractCEOFormulaActual({
      formulaType: "DEBT_EQUITY_RATIO",
      activities: { totalLiabilities: 50, totalShareholdersEquity: 0 },
      preciseCurrentValue: null,
      currentValue: null
    });
    expect(miss.missingValue).toBe(true);
  });

  test("extractCEOFormulaActual: COUNT_VS_TARGET uses alternate keys", () => {
    const r = Svc.extractCEOFormulaActual({
      formulaType: "COUNT_VS_TARGET",
      activities: { reportsSubmitted: 5, reportsPlanned: 10 },
      preciseCurrentValue: null,
      currentValue: null
    });
    expect(r.missingValue).toBe(false);
    expect(r.value).toBeCloseTo(50, 4);
  });

  test("buildCEOSectionRows: redistributes weights when one indicator is pending", () => {
    const warnings: string[] = [];
    const rows = Svc.buildCEOSectionRows(
      [
        baseGoal({ id: "a", scorecardWeight: 60, isPendingApproval: false }),
        baseGoal({ id: "b", scorecardWeight: 40, isPendingApproval: true })
      ],
      { stretchScoringEnabled: false },
      warnings
    );
    const active = rows.find((x: any) => x.id === "a");
    const pending = rows.find((x: any) => x.id === "b");
    expect(pending.excludedFromScoring).toBe(true);
    expect(pending.effectiveWeight).toBe(0);
    expect(active.effectiveWeight).toBe(100);
    expect(active.rawRating).toBe(4);
  });

  test("summariseCEOSectionScores: redistribute blend re-normalises when other sections are empty", () => {
    const warnings: string[] = [];
    const flat = Svc.buildCEOSectionRows(
      [baseGoal({ id: "only", scorecardSection: "A1", scorecardWeight: 100 })],
      { stretchScoringEnabled: false },
      warnings
    );
    const summary = Svc.summariseCEOSectionScores(flat, CEO_SECTION_WEIGHTS, {
      sectionBlendMode: "redistribute",
      warningsOut: warnings
    });
    const a1 = summary.sections.find((s: any) => s.key === "A1");
    expect(a1.sectionScore).toBe(4);
    expect(summary.finalScore).toBe(4);
  });

  test("summariseCEOSectionScores: penalise blend uses full contract section weights (legacy)", () => {
    const warnings: string[] = [];
    const flat = Svc.buildCEOSectionRows(
      [baseGoal({ id: "only", scorecardSection: "A1", scorecardWeight: 100 })],
      { stretchScoringEnabled: false },
      warnings
    );
    const summary = Svc.summariseCEOSectionScores(flat, CEO_SECTION_WEIGHTS, {
      sectionBlendMode: "penalise"
    });
    const expected = round((30 * 4) / 100, 2);
    expect(summary.finalScore).toBe(expected);
  });

  test("summariseCEOSectionScores: section with no indicators gets No Data label", () => {
    const flat = Svc.buildCEOSectionRows(
      [baseGoal({ id: "only", scorecardSection: "A1", scorecardWeight: 100 })],
      { stretchScoringEnabled: false },
      []
    );
    const summary = Svc.summariseCEOSectionScores(flat, CEO_SECTION_WEIGHTS);
    const a2 = summary.sections.find((s: any) => s.key === "A2");
    expect(a2.sectionScore).toBe(0);
    expect(a2.performanceLabel).toBe("No Data");
  });

  test("extractCEOFormulaActual: board governance_index snake_case inputs", () => {
    const r = Svc.extractCEOFormulaActual({
      formulaType: "governance_index",
      activities: { compliance_items_met: 8, total_governance_requirements: 10 },
      preciseCurrentValue: null,
      currentValue: null
    });
    expect(r.missingValue).toBe(false);
    expect(r.value).toBeCloseTo(80, 4);
  });

  test("extractCEOFormulaActual: board count_vs_target evaluated_levels / total_levels", () => {
    const r = Svc.extractCEOFormulaActual({
      formulaType: "COUNT_VS_TARGET",
      activities: { evaluated_levels: 4, total_levels: 5 },
      preciseCurrentValue: null,
      currentValue: null
    });
    expect(r.missingValue).toBe(false);
    expect(r.value).toBeCloseTo(80, 4);
  });
});
