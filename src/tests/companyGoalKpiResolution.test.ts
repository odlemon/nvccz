import {
  resolveCompanyGoalKpiCode,
  FORMULA_TYPE_TO_KPI_CODE
} from "../services/companyGoalKpiResolution";

describe("companyGoalKpiResolution", () => {
  test("board revenue row maps to TOTAL_REVENUE", () => {
    expect(
      resolveCompanyGoalKpiCode({
        title: "Revenue (total income)",
        formulaType: "direct"
      })
    ).toBe("TOTAL_REVENUE");
  });

  test("NDS2 formula maps to NDS2_PROGRAMME_ACHIEVEMENT", () => {
    expect(
      resolveCompanyGoalKpiCode({
        title: "NDS2 programme achievement",
        formulaType: "NDS2_PROGRAMME_ACHIEVEMENT"
      })
    ).toBe("NDS2_PROGRAMME_ACHIEVEMENT");
  });

  test("allocation compliance maps to BUDGET_UTILISATION", () => {
    expect(
      resolveCompanyGoalKpiCode({
        title: "Strategic allocation of resources",
        formulaType: "ALLOCATION_COMPLIANCE"
      })
    ).toBe("BUDGET_UTILISATION");
  });

  test("performance levels maps via title", () => {
    expect(
      resolveCompanyGoalKpiCode({
        title: "Performance levels evaluated",
        formulaType: "COUNT_VS_TARGET"
      })
    ).toBe("PERFORMANCE_LEVELS_EVALUATED");
  });

  test("governance index formula maps to CORPORATE_GOVERNANCE_INDEX", () => {
    expect(
      resolveCompanyGoalKpiCode({
        title: "Corporate governance index",
        formulaType: "CORPORATE_GOVERNANCE_INDEX"
      })
    ).toBe("CORPORATE_GOVERNANCE_INDEX");
  });

  test("FORMULA_TYPE_TO_KPI_CODE includes board seed formulas", () => {
    expect(FORMULA_TYPE_TO_KPI_CODE.STRATEGIC_PLANNING_REVIEWS).toBe(
      "STRATEGIC_PLANNING_REVIEWS"
    );
    expect(FORMULA_TYPE_TO_KPI_CODE.NDS2_PROGRAMME_ACHIEVEMENT).toBe(
      "NDS2_PROGRAMME_ACHIEVEMENT"
    );
  });
});
