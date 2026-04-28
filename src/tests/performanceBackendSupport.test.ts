// @ts-nocheck

import {
  HARD_CODED_BSC_PILLARS,
  buildExponentialBackoffSchedule,
  isHighPrecisionPerformanceSync,
  isPayrollTurnoverCompatibleGoal,
  isPortfolioAumCompatibleGoal,
  isPortfolioIrrCompatibleGoal,
  isPortfolioTotalRevenueCompatibleGoal,
  normaliseSyncedDecimal,
  PORTFOLIO_IRR_PE_SYNC_DECIMALS,
  resolveReviewWorkflowStatus,
  syncDecimalPlacesForIntegrationBatch,
  shouldRaiseDataQualityAlert,
  uniqueGoalIdsForTaskBatch,
  validateFixedPillarSet,
  validateManagerRatings,
  validateManagerScaleInteger,
  validateQualitativeFeedbackMinimum,
  validateWeightTotal
} from "../services/performanceBackendSupport";

describe("performanceBackendSupport", () => {
  it("validates the fixed BSC pillar set totals exactly 100%", () => {
    const valid = validateFixedPillarSet({
      [HARD_CODED_BSC_PILLARS[0]]: 25,
      [HARD_CODED_BSC_PILLARS[1]]: 25,
      [HARD_CODED_BSC_PILLARS[2]]: 25,
      [HARD_CODED_BSC_PILLARS[3]]: 25
    });

    expect(valid.valid).toBe(true);
    expect(valid.total).toBe(100);

    const invalid = validateWeightTotal([10, 20, 60]);
    expect(invalid.valid).toBe(false);
    expect(invalid.total).toBe(90);
  });

  it("builds the required exponential backoff retry schedule", () => {
    expect(buildExponentialBackoffSchedule()).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it("preserves decimal sync precision for AUM and IRR values", () => {
    expect(normaliseSyncedDecimal("123.4567891", 6)).toBe("123.456789");
    expect(normaliseSyncedDecimal(0.1234567, 6)).toBe("0.123457");
    expect(normaliseSyncedDecimal(0.18781234, 4)).toBe("0.1878");
  });

  it("resolves 4dp for portfolio IRR batch and 6dp for AUM (not 4)", () => {
    expect(
      syncDecimalPlacesForIntegrationBatch(
        [{ formulaType: null, kpi: { name: "Portfolio IRR" } }],
        "data.metrics.irr"
      )
    ).toBe(PORTFOLIO_IRR_PE_SYNC_DECIMALS);
    expect(
      syncDecimalPlacesForIntegrationBatch(
        [{ formulaType: "AUM_TOTAL", kpi: { name: "Assets Under Management" } }],
        "data.metrics.totalAum"
      )
    ).toBe(6);
  });

  it("detects high-precision sync from KPI name or fieldPath when formulaType is unset", () => {
    expect(isHighPrecisionPerformanceSync({ formulaType: null, kpi: { name: "Total Revenue" } }, null)).toBe(false);
    expect(isHighPrecisionPerformanceSync({ formulaType: null, kpi: { name: "Portfolio IRR" } }, null)).toBe(true);
    expect(isHighPrecisionPerformanceSync({ formulaType: null, kpi: null }, "data.metrics.irr")).toBe(true);
    expect(isHighPrecisionPerformanceSync({ formulaType: "IRR", kpi: null }, null)).toBe(true);
  });

  it("restricts PE portfolio IRR sync to IRR KPIs or formula (ignores arbitrary fieldPath)", () => {
    expect(isPortfolioIrrCompatibleGoal({ formulaType: null, kpi: { name: "Total Revenue" } })).toBe(false);
    expect(isPortfolioIrrCompatibleGoal({ formulaType: null, kpi: { name: "Portfolio IRR" } })).toBe(true);
    expect(isPortfolioIrrCompatibleGoal({ formulaType: "IRR", kpi: { name: "Total Revenue" } })).toBe(true);
    expect(isPortfolioIrrCompatibleGoal({ formulaType: "PORTFOLIO_IRR_PCT", kpi: null })).toBe(true);
    expect(isPortfolioIrrCompatibleGoal({ formulaType: "AUM_TOTAL", kpi: { name: "Portfolio IRR" } })).toBe(false);
  });

  it("restricts PE portfolio AUM sync to AUM KPIs or formula (not IRR)", () => {
    expect(isPortfolioAumCompatibleGoal({ formulaType: null, kpi: { name: "Total Revenue" } })).toBe(false);
    expect(isPortfolioAumCompatibleGoal({ formulaType: null, kpi: { name: "Assets Under Management" } })).toBe(true);
    expect(isPortfolioAumCompatibleGoal({ formulaType: "AUM_TOTAL", kpi: { name: "Revenue" } })).toBe(true);
    expect(isPortfolioAumCompatibleGoal({ formulaType: "IRR", kpi: { name: "Assets Under Management" } })).toBe(false);
    expect(isPortfolioAumCompatibleGoal({ formulaType: null, kpi: { name: "Portfolio IRR" } })).toBe(false);
  });

  it("restricts portfolio total revenue sync to revenue KPIs (not IRR/AUM/turnover)", () => {
    expect(isPortfolioTotalRevenueCompatibleGoal({ formulaType: null, kpi: { name: "Total Revenue" } })).toBe(
      true
    );
    expect(
      isPortfolioTotalRevenueCompatibleGoal({ formulaType: null, kpi: { name: "Individual revenue contribution" } })
    ).toBe(true);
    expect(isPortfolioTotalRevenueCompatibleGoal({ formulaType: null, kpi: { name: "Portfolio IRR" } })).toBe(
      false
    );
    expect(isPortfolioTotalRevenueCompatibleGoal({ formulaType: null, kpi: { name: "Assets Under Management" } })).toBe(
      false
    );
    expect(
      isPortfolioTotalRevenueCompatibleGoal({ formulaType: null, kpi: { name: "Employee Turnover Rate" } })
    ).toBe(false);
  });

  it("restricts payroll turnover sync to turnover KPIs (not IRR/AUM)", () => {
    expect(isPayrollTurnoverCompatibleGoal({ formulaType: null, kpi: { name: "Employee Turnover Rate" } })).toBe(true);
    expect(isPayrollTurnoverCompatibleGoal({ formulaType: "EMPLOYEE_TURNOVER", kpi: null })).toBe(true);
    expect(isPayrollTurnoverCompatibleGoal({ formulaType: null, kpi: { name: "Portfolio IRR" } })).toBe(false);
    expect(isPayrollTurnoverCompatibleGoal({ formulaType: null, kpi: { name: "Assets Under Management" } })).toBe(false);
  });

  it("raises data quality alerts for precision-sensitive KPI drift", () => {
    expect(
      shouldRaiseDataQualityAlert({
        currentValue: 10.5002,
        lastApprovedValue: 10.4,
        formulaType: "AUM_TOTAL"
      })
    ).toBe(true);

    expect(
      shouldRaiseDataQualityAlert({
        currentValue: 10.00001,
        lastApprovedValue: 10,
        formulaType: "NON_FINANCIAL"
      })
    ).toBe(false);
  });

  it("enforces integer-only 1-5 manager ratings and 50-char qualitative feedback", () => {
    expect(
      validateManagerRatings([
        { managerRating: 1 },
        { managerRating: 5 }
      ]).valid
    ).toBe(true);

    expect(
      validateManagerRatings([
        { managerRating: 4.5 }
      ]).valid
    ).toBe(false);

    expect(validateManagerScaleInteger(4).valid).toBe(true);
    expect(validateManagerScaleInteger(4.5).valid).toBe(false);
    expect(validateManagerScaleInteger(6).valid).toBe(false);
    expect(validateManagerScaleInteger(null).valid).toBe(true);

    expect(
      validateQualitativeFeedbackMinimum("This manager comment is comfortably above fifty characters long.").valid
    ).toBe(true);
    expect(validateQualitativeFeedbackMinimum("Too short").valid).toBe(false);
  });

  it("tracks review workflow progression and batch goal recalculation targets", () => {
    expect(resolveReviewWorkflowStatus({ currentStage: "SELF_REVIEW" })).toEqual({
      status: "MANAGER_REVIEW",
      stage: "MANAGER_REVIEW"
    });

    expect(
      resolveReviewWorkflowStatus({ currentStage: "SELF_REVIEW", hasExternalStakeholder: true })
    ).toEqual({
      status: "PEER_REVIEW",
      stage: "PEER_REVIEW"
    });

    expect(
      resolveReviewWorkflowStatus({ currentStage: "PEER_REVIEW", hasExternalStakeholder: true })
    ).toEqual({
      status: "HR_REVIEW",
      stage: "HR_REVIEW"
    });

    expect(
      resolveReviewWorkflowStatus({ currentStage: "HR_REVIEW", hasExternalStakeholder: true })
    ).toEqual({
      status: "MANAGER_REVIEW",
      stage: "MANAGER_REVIEW"
    });

    expect(resolveReviewWorkflowStatus({ currentStage: "PEER_REVIEW" })).toEqual({
      status: "MANAGER_REVIEW",
      stage: "MANAGER_REVIEW"
    });

    expect(resolveReviewWorkflowStatus({ finalize: true })).toEqual({
      status: "FINALIZED",
      stage: "FINALIZED"
    });

    expect(
      uniqueGoalIdsForTaskBatch([
        { goalId: "goal-1" },
        { goalId: "goal-1" },
        { goalId: "goal-2" },
        { goalId: null }
      ])
    ).toEqual(["goal-1", "goal-2"]);
  });
});
