import { getKpiJournalSkipReason } from "../services/KpiAccountingIntegrationService";

describe("getKpiJournalSkipReason", () => {
  const base = {
    parentGoalId: null,
    kpiCode: "MARKETING_SPEND",
    formulaType: null,
    isFinancial: true,
    accountNumber: "6010",
    achievedValue: 1000,
    hasPostedJournalForGoal: false,
  };

  it("skips when a journal was already posted for the goal", () => {
    expect(
      getKpiJournalSkipReason({ ...base, hasPostedJournalForGoal: true })
    ).toMatch(/already posted/);
  });

  it("skips sub-goals", () => {
    expect(getKpiJournalSkipReason({ ...base, parentGoalId: "parent-1" })).toMatch(/sub-goal/);
  });

  it("skips payroll KPI by code", () => {
    expect(getKpiJournalSkipReason({ ...base, kpiCode: "PAYROLL_EXPENSE" })).toMatch(/PayrollService/);
  });

  it("skips payroll KPI by formulaType", () => {
    expect(
      getKpiJournalSkipReason({ ...base, kpiCode: null, formulaType: "PAYROLL_EXPENSE" })
    ).toMatch(/PayrollService/);
  });

  it("skips non-financial or unmapped KPIs", () => {
    expect(getKpiJournalSkipReason({ ...base, isFinancial: false })).toMatch(/not financial/);
    expect(getKpiJournalSkipReason({ ...base, accountNumber: null })).toMatch(/not financial/);
  });

  it("skips non-positive amounts", () => {
    expect(getKpiJournalSkipReason({ ...base, achievedValue: 0 })).toMatch(/non-positive/);
  });

  it("allows a root financial KPI with a positive amount", () => {
    expect(getKpiJournalSkipReason(base)).toBeNull();
  });
});
