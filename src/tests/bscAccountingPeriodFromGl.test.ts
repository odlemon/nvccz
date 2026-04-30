// @ts-nocheck
/**
 * Regression tests for SRD §4.1 / Flow 1 (GL period totals).
 * Ensures date-only period windows include the whole end date.
 */

jest.mock("../services/AccountingGlPeriodTotalsService", () => ({
  getPostedPeriodRevenueExpenseNetProfit: jest.fn(async (periodStart: Date, periodEnd: Date) => ({
    revenue: 100,
    totalExpense: 40,
    netProfit: 60,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString()
  }))
}));

const { getPostedPeriodRevenueExpenseNetProfit } = require("../services/AccountingGlPeriodTotalsService");
const { BscDigitalEntryService } = require("../services/BscDigitalEntryService");

describe("BSC GL period totals — accounting-period-from-gl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("date-only periodStart/periodEnd expands to full-day UTC boundaries", async () => {
    const out = await BscDigitalEntryService.submitAccountingPeriodFromGl({
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31"
      // omit goal ids to avoid goal update side effects
    });

    expect(out).toHaveProperty("glTotals");
    expect(out).toHaveProperty("goalUpdates");
    expect(Array.isArray(out.goalUpdates)).toBe(true);
    expect(out.goalUpdates).toHaveLength(0);

    expect(getPostedPeriodRevenueExpenseNetProfit).toHaveBeenCalledTimes(1);
    const [ps, pe] = (getPostedPeriodRevenueExpenseNetProfit as any).mock.calls[0];
    expect(ps.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(pe.toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });

  test("rejects when periodStart is after periodEnd", async () => {
    await expect(
      BscDigitalEntryService.submitAccountingPeriodFromGl({
        periodStart: "2026-02-01",
        periodEnd: "2026-01-31"
      })
    ).rejects.toThrow(/periodStart must be before periodEnd/i);
  });
});

