import Decimal from "decimal.js";

/** Stored on instruments / rates; keep in sync with DB varchar values. */
export type StiCompoundingMethod = "SIMPLE" | "COMPOUND_DAILY" | "COMPOUND_MONTHLY";

/**
 * Day count conventions:
 * - ACTUAL_365: 365 days, or 366 in leap years
 * - ACTUAL_360: fixed 360-day denominator
 * - THIRTY_360: fixed 360-day denominator (banker's 30/360 style for daily accrual granularity)
 */
export type StiDayCountConvention = "ACTUAL_365" | "ACTUAL_360" | "THIRTY_360";

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Denominator \\(N\\) for daily accrual: 366 in leap years, else 365. */
export function actual365DenominatorForYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

export function denominatorForDayCount(dayCount: StiDayCountConvention, year: number): number {
  switch (dayCount) {
    case "ACTUAL_365":
      return actual365DenominatorForYear(year);
    case "ACTUAL_360":
    case "THIRTY_360":
      return 360;
    default: {
      const _: never = dayCount;
      throw new Error(`Unsupported day count: ${_}`);
    }
  }
}

export function parseYyyyMmDd(isoDate: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) {
    throw new Error(`Invalid date (expected YYYY-MM-DD): ${isoDate}`);
  }
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/**
 * COMPOUND_MONTHLY: accrual posts only on the last calendar day of the month (UTC calendar
 * matching the YYYY-MM-DD string). Other days return zero — the month’s interest is compounded
 * in one step at month-end using \\((1+\\text{apy})^{1/12}-1\\) on the balance.
 */
export function isLastDayOfMonthFromIso(isoDate: string): boolean {
  const { y, m, d } = parseYyyyMmDd(isoDate);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d === last;
}

export interface AccrualCalcInput {
  compoundingMethod: StiCompoundingMethod;
  dayCount: StiDayCountConvention;
  /** Annual yield as decimal (0.05 = 5%). May be negative (capital erosion). */
  apy: Decimal | string | number;
  /** Currency units; original principal (unchanged on book for SIMPLE interest base). */
  principal: Decimal | string | number;
  /** Accrued interest balance before this accrual day (excludes principal). */
  accruedInterestBefore: Decimal | string | number;
  /** Calendar accrual date YYYY-MM-DD (used for leap-year denominator and month-end). */
  accrualDateIso: string;
}

export interface AccrualCalcResult {
  /** Signed daily (or month-end) accrual amount in instrument currency. */
  dailyAmount: Decimal;
  /** accrualDateIso year’s ACTUAL_365 denominator (365 or 366). */
  denominator: number;
}

function D(x: Decimal | string | number): Decimal {
  return new Decimal(x);
}

/**
 * Pure accrual math for one instrument for one fiscal day. No I/O.
 */
export class ShortTermInvestmentAccrualCalculator {
  static computeOneDay(input: AccrualCalcInput): AccrualCalcResult {
    const { y } = parseYyyyMmDd(input.accrualDateIso);
    const denom = denominatorForDayCount(input.dayCount, y);
    const apy = D(input.apy);
    const principal = D(input.principal);
    const accruedBefore = D(input.accruedInterestBefore);

    let dailyAmount: Decimal;

    switch (input.compoundingMethod) {
      case "SIMPLE": {
        // Interest on original principal only.
        dailyAmount = principal.mul(apy).div(denom);
        break;
      }
      case "COMPOUND_DAILY": {
        const base = principal.plus(accruedBefore);
        const factor = D(1).plus(apy).pow(D(1).div(denom)).minus(1);
        dailyAmount = base.mul(factor);
        break;
      }
      case "COMPOUND_MONTHLY": {
        if (!isLastDayOfMonthFromIso(input.accrualDateIso)) {
          dailyAmount = new Decimal(0);
        } else {
          const base = principal.plus(accruedBefore);
          const factor = D(1).plus(apy).pow(D(1).div(12)).minus(1);
          dailyAmount = base.mul(factor);
        }
        break;
      }
      default: {
        const _: never = input.compoundingMethod;
        throw new Error(`Unsupported compounding: ${_}`);
      }
    }

    return { dailyAmount, denominator: denom };
  }
}
