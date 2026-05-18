import {
  addCalendarDaysToIso,
  advancePeriodEndUtc,
  lastDayOfMonthUtc,
  listPeriodEndsFromAnchorUtc,
  toIsoDate,
} from "../utils/reportingScheduleDates";

describe("reportingScheduleDates.advancePeriodEndUtc", () => {
  test("MONTHLY advances to next month end", () => {
    const mar = lastDayOfMonthUtc(2026, 2);
    const apr = advancePeriodEndUtc("MONTHLY", mar);
    expect(toIsoDate(apr)).toBe("2026-04-30");
  });

  test("QUARTERLY advances Mar 31 to Jun 30", () => {
    const mar = lastDayOfMonthUtc(2026, 2);
    const jun = advancePeriodEndUtc("QUARTERLY", mar);
    expect(toIsoDate(jun)).toBe("2026-06-30");
  });

  test("YEARLY advances Dec 31 to next Dec 31", () => {
    const dec = lastDayOfMonthUtc(2025, 11);
    const next = advancePeriodEndUtc("YEARLY", dec);
    expect(toIsoDate(next)).toBe("2026-12-31");
  });

  test("CUSTOM advances within configured months", () => {
    const mar = lastDayOfMonthUtc(2026, 2);
    const jun = advancePeriodEndUtc("CUSTOM", mar, [3, 6, 9, 12]);
    expect(toIsoDate(jun)).toBe("2026-06-30");
  });
});

describe("reportingScheduleDates.listPeriodEndsFromAnchorUtc", () => {
  test("returns count periods from anchor", () => {
    const anchor = lastDayOfMonthUtc(2026, 2);
    const ends = listPeriodEndsFromAnchorUtc("QUARTERLY", anchor, 3);
    expect(ends.map(toIsoDate)).toEqual(["2026-03-31", "2026-06-30", "2026-09-30"]);
  });
});

describe("reportingScheduleDates offset chain (Q1 example)", () => {
  test("open, due, reminder, overdue from period end", () => {
    const periodEnd = "2026-03-31";
    const openAfter = 1;
    const dueOffset = 15;
    const reportingOpensOn = addCalendarDaysToIso(periodEnd, openAfter);
    const submissionDueDate = addCalendarDaysToIso(periodEnd, dueOffset);
    const reminderTMinus3On = addCalendarDaysToIso(submissionDueDate, -3);
    const overdueAlertOn = addCalendarDaysToIso(submissionDueDate, 1);
    expect(reportingOpensOn).toBe("2026-04-01");
    expect(submissionDueDate).toBe("2026-04-15");
    expect(reminderTMinus3On).toBe("2026-04-12");
    expect(overdueAlertOn).toBe("2026-04-16");
  });
});
