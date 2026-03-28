/**
 * Shared 5-bucket AR/AP ageing: days from anchor (due or invoice) to as-of date.
 * Positive daysPastDue = overdue; negative = not yet due.
 */
import { Decimal } from "@prisma/client/runtime/library";

export type FiveBucketAgeKey =
  | "current"
  | "days1To30"
  | "days31To60"
  | "days61To90"
  | "over90";

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Days from due/anchor date to as-of (positive = overdue). */
export function daysPastDueAsOf(anchorDate: Date, asOf: Date): number {
  const anchor = startOfUtcDay(anchorDate);
  const ref = startOfUtcDay(asOf);
  return Math.floor((ref.getTime() - anchor.getTime()) / 86400000);
}

export function bucketForDaysPastDue(daysPastDue: number): FiveBucketAgeKey {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "days1To30";
  if (daysPastDue <= 60) return "days31To60";
  if (daysPastDue <= 90) return "days61To90";
  return "over90";
}

export function emptyFiveBuckets(): Record<FiveBucketAgeKey, Decimal> {
  return {
    current: new Decimal(0),
    days1To30: new Decimal(0),
    days31To60: new Decimal(0),
    days61To90: new Decimal(0),
    over90: new Decimal(0)
  };
}

export function decimalFiveBucketsToNumber(r: Record<FiveBucketAgeKey, Decimal>) {
  const o: Record<string, number> = {};
  (Object.keys(r) as FiveBucketAgeKey[]).forEach((k) => {
    o[k] = r[k].toNumber();
  });
  o.total = (Object.keys(r) as FiveBucketAgeKey[]).reduce((s, k) => s + r[k].toNumber(), 0);
  return o as Record<FiveBucketAgeKey | "total", number>;
}

/** Default labels; third monetary column is often titled "60 Days" in print (31–60); fourth is "90 Days" (61–90). */
export const FIVE_BUCKET_LABELS: Record<FiveBucketAgeKey, string> = {
  current: "Current",
  days1To30: "1–30 days",
  days31To60: "31–60 days",
  days61To90: "61–90 days",
  over90: "Over 90 days"
};

/**
 * Optional short column titles matching common "Current | 30 | 60 | 90 | Over 90" layouts.
 * 65 days overdue falls under days61To90 → "90 Days" here (61–90 band).
 */
export const FIVE_BUCKET_SHORT_COLUMN_TITLES: Record<FiveBucketAgeKey, string> = {
  current: "Current",
  days1To30: "30 Days",
  days31To60: "60 Days",
  days61To90: "90 Days",
  over90: "Over 90"
};
