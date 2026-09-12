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

const QUARTER_END_MONTH_INDEX0 = [2, 5, 8, 11];

/** Next period end strictly after `periodEnd` for the given frequency. */
export function advancePeriodEndUtc(
  frequency: string,
  periodEnd: Date,
  customMonthEnds1to12?: number[] | null
): Date {
  const f = String(frequency || "").toUpperCase();
  if (f === "MONTHLY") {
    const y = periodEnd.getUTCFullYear();
    const m0 = periodEnd.getUTCMonth();
    return lastDayOfMonthUtc(y, m0 + 1);
  }
  if (f === "QUARTERLY") {
    const y = periodEnd.getUTCFullYear();
    const pe = periodEnd.getTime();
    for (const idx of QUARTER_END_MONTH_INDEX0) {
      const end = lastDayOfMonthUtc(y, idx);
      if (end.getTime() > pe) return end;
    }
    return lastDayOfMonthUtc(y + 1, 2);
  }
  if (f === "YEARLY") {
    return lastDayOfMonthUtc(periodEnd.getUTCFullYear() + 1, 11);
  }
  if (f === "CUSTOM") {
    const months = (customMonthEnds1to12 || [])
      .filter((m) => Number.isFinite(m) && m >= 1 && m <= 12)
      .sort((a, b) => a - b);
    if (!months.length) {
      throw new Error("CUSTOM frequency requires customMonthEnds");
    }
    const pe = periodEnd.getTime();
    const y0 = periodEnd.getUTCFullYear();
    for (let yr = y0; yr <= y0 + 3; yr++) {
      for (const m1 of months) {
        const end = lastDayOfMonthUtc(yr, m1 - 1);
        if (end.getTime() > pe) return end;
      }
    }
    return lastDayOfMonthUtc(y0 + 4, months[0] - 1);
  }
  throw new Error(`Unsupported frequency: ${frequency}`);
}

/** `count` period ends starting at `anchor` (inclusive), advancing by frequency. */
export function listPeriodEndsFromAnchorUtc(
  frequency: string,
  anchor: Date,
  count: number,
  customMonthEnds1to12?: number[] | null
): Date[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const out: Date[] = [anchor];
  let cur = anchor;
  for (let i = 1; i < n; i++) {
    cur = advancePeriodEndUtc(frequency, cur, customMonthEnds1to12);
    out.push(cur);
  }
  return out;
}

export function compareIsoDates(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
