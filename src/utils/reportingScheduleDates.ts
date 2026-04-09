/** Pure date helpers for automated reporting schedules (UTC calendar days). */

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** `monthIndex0` 0 = January. Returns last day of that month in `year`. */
export function lastDayOfMonthUtc(year: number, monthIndex0: number): Date {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0));
}

export function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function addCalendarDaysToIso(iso: string, days: number): string {
  const [y, m, day] = iso.split("-").map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  const t = Date.UTC(y, m - 1, day) + days * 86400000;
  return new Date(t).toISOString().split("T")[0];
}

export function lastCompletedMonthEndUtc(asOf: Date): Date {
  const y = asOf.getUTCFullYear();
  const m0 = asOf.getUTCMonth();
  return lastDayOfMonthUtc(y, m0 - 1);
}

export function lastCompletedQuarterEndUtc(asOf: Date): Date {
  const today = startOfUtcDay(asOf);
  const quarterEndMonthIndices = [2, 5, 8, 11];
  const y = asOf.getUTCFullYear();
  for (let yi = y; yi >= y - 1; yi--) {
    for (let i = quarterEndMonthIndices.length - 1; i >= 0; i--) {
      const end = lastDayOfMonthUtc(yi, quarterEndMonthIndices[i]);
      if (end.getTime() < today.getTime()) return end;
    }
  }
  return lastDayOfMonthUtc(y - 1, 11);
}

export function lastCompletedYearEndUtc(asOf: Date): Date {
  const today = startOfUtcDay(asOf);
  const y = asOf.getUTCFullYear();
  const dec = lastDayOfMonthUtc(y, 11);
  if (dec.getTime() < today.getTime()) return dec;
  return lastDayOfMonthUtc(y - 1, 11);
}

export function lastCompletedCustomMonthEndsUtc(asOf: Date, months1to12: number[]): Date | null {
  if (!months1to12.length) return null;
  const today = startOfUtcDay(asOf);
  let best: Date | null = null;
  const y = asOf.getUTCFullYear();
  for (const yr of [y, y - 1]) {
    for (const m1 of months1to12) {
      if (!Number.isFinite(m1) || m1 < 1 || m1 > 12) continue;
      const end = lastDayOfMonthUtc(yr, m1 - 1);
      if (end.getTime() < today.getTime() && (!best || end.getTime() > best.getTime())) best = end;
    }
  }
  return best;
}

export function shouldRunOpenCalendarAfterPeriodEnd(
  periodEnd: Date,
  asOf: Date,
  openCalendarAfterPeriodEndDays: number
): boolean {
  const thresholdIso = addCalendarDaysToIso(toIsoDate(periodEnd), openCalendarAfterPeriodEndDays);
  const asIso = toIsoDate(startOfUtcDay(asOf));
  return asIso >= thresholdIso;
}
