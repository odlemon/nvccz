// @ts-nocheck
import type { ForecastGranularity } from "../constants/forecastingEngine";
import { FORECAST_HORIZON_PRESETS_MONTHS } from "../constants/forecastingEngine";

export type PeriodBounds = { start: Date; end: Date };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function quarterKey(d: Date): string {
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

function yearKey(d: Date): string {
  return String(d.getUTCFullYear());
}

export function buildPeriodKeys(
  horizonStart: Date,
  horizonEnd: Date,
  granularity: ForecastGranularity
): string[] {
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(horizonStart.getUTCFullYear(), horizonStart.getUTCMonth(), 1));
  const end = new Date(Date.UTC(horizonEnd.getUTCFullYear(), horizonEnd.getUTCMonth(), 1));

  if (granularity === "MONTHLY") {
    while (cursor <= end) {
      keys.push(monthKey(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return keys;
  }

  if (granularity === "QUARTERLY") {
    while (cursor <= end) {
      keys.push(quarterKey(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 3);
    }
    return keys;
  }

  const startYear = cursor.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  for (let y = startYear; y <= endYear; y++) {
    keys.push(String(y));
  }
  return keys;
}

export function validateHorizonMonths(months: number): boolean {
  return (FORECAST_HORIZON_PRESETS_MONTHS as readonly number[]).includes(months);
}

export function monthsBetweenInclusive(start: Date, end: Date): number {
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1
  );
}

export function classifyPeriodKeys(periodKeys: string[], asOf: Date = new Date()): {
  elapsed: string[];
  future: string[];
} {
  const elapsed: string[] = [];
  const future: string[] = [];
  for (const key of periodKeys) {
    const bounds = periodKeyToBounds(key);
    if (bounds.end < asOf) {
      elapsed.push(key);
    } else {
      future.push(key);
    }
  }
  return { elapsed, future };
}

export function isFuturePeriod(periodKey: string, asOf: Date = new Date()): boolean {
  const bounds = periodKeyToBounds(periodKey);
  return bounds.start >= new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
}

export function periodKeyToBounds(periodKey: string): PeriodBounds {
  if (/^\d{4}-\d{2}$/.test(periodKey)) {
    const [y, m] = periodKey.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    return { start, end };
  }
  const qMatch = periodKey.match(/^(\d{4})-Q([1-4])$/);
  if (qMatch) {
    const y = Number(qMatch[1]);
    const q = Number(qMatch[2]);
    const startMonth = (q - 1) * 3;
    const start = new Date(Date.UTC(y, startMonth, 1));
    const end = new Date(Date.UTC(y, startMonth + 3, 0, 23, 59, 59, 999));
    return { start, end };
  }
  if (/^\d{4}$/.test(periodKey)) {
    const y = Number(periodKey);
    return {
      start: new Date(Date.UTC(y, 0, 1)),
      end: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999))
    };
  }
  throw new Error(`Invalid period key: ${periodKey}`);
}

export function periodIndex(periodKeys: string[], periodKey: string): number {
  const idx = periodKeys.indexOf(periodKey);
  return idx >= 0 ? idx : 0;
}
