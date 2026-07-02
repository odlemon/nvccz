// @ts-nocheck
export type CalendarQuarter = "Q1" | "Q2" | "Q3" | "Q4";

export function quarterPeriodBounds(financialYear: number, quarter: CalendarQuarter): {
  periodStart: Date;
  periodEnd: Date;
} {
  const q = quarter.toUpperCase() as CalendarQuarter;
  const map: Record<CalendarQuarter, { startMonth: number; endMonth: number; endDay: number }> = {
    Q1: { startMonth: 0, endMonth: 2, endDay: 31 },
    Q2: { startMonth: 3, endMonth: 5, endDay: 30 },
    Q3: { startMonth: 6, endMonth: 8, endDay: 30 },
    Q4: { startMonth: 9, endMonth: 11, endDay: 31 },
  };
  const m = map[q];
  if (!m) throw new Error(`Invalid quarter: ${quarter}`);
  const periodStart = new Date(Date.UTC(financialYear, m.startMonth, 1));
  const periodEnd = new Date(Date.UTC(financialYear, m.endMonth, m.endDay));
  return { periodStart, periodEnd };
}
