// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";

const AMOUNT_SCALE = 3;
const VARIANCE_PCT_SCALE = 4;

export function toDec(v: unknown): Decimal {
  if (v == null || v === "") return new Decimal(0);
  if (v instanceof Decimal) return v;
  try {
    return new Decimal(typeof v === "object" && v !== null && "toString" in v ? (v as any).toString() : String(v));
  } catch {
    return new Decimal(0);
  }
}

export function roundAmount(v: Decimal | number): Decimal {
  return toDec(v).toDecimalPlaces(AMOUNT_SCALE, Decimal.ROUND_HALF_UP);
}

export function roundVariancePercent(v: Decimal | number): Decimal {
  return toDec(v).toDecimalPlaces(VARIANCE_PCT_SCALE, Decimal.ROUND_HALF_UP);
}

/** Eq. 4: A_base = A_tx × R_f */
export function translateBaseValue(txValue: Decimal | number, projectedRate: Decimal | number): Decimal {
  return roundAmount(toDec(txValue).times(toDec(projectedRate)));
}

/** Eq. 5: A_tx × (R_act − R_f) */
export function currencyDriftComponent(
  txValue: Decimal | number,
  actualRate: Decimal | number,
  projectedRate: Decimal | number
): Decimal {
  return roundAmount(toDec(txValue).times(toDec(actualRate).minus(toDec(projectedRate))));
}

/** Eq. 6: Actual − Forecast */
export function varianceAbsolute(actual: Decimal | number, forecast: Decimal | number): Decimal {
  return roundAmount(toDec(actual).minus(toDec(forecast)));
}

/** Eq. 7: piecewise percentage variance */
export function variancePercent(actual: Decimal | number, forecast: Decimal | number): Decimal {
  const a = toDec(actual);
  const f = toDec(forecast);
  if (!f.isZero()) {
    return roundVariancePercent(a.minus(f).dividedBy(f).times(100));
  }
  if (a.greaterThan(0)) {
    return roundVariancePercent(100);
  }
  return roundVariancePercent(0);
}

export type RegressionPoint = { t: number; y: number };

/** Eq. 8–9: linear regression slope and intercept */
export function linearRegressionSlopeIntercept(points: RegressionPoint[]): { m: number; b: number } {
  const N = points.length;
  if (N === 0) return { m: 0, b: 0 };
  let sumT = 0;
  let sumY = 0;
  let sumTY = 0;
  let sumT2 = 0;
  for (const p of points) {
    sumT += p.t;
    sumY += p.y;
    sumTY += p.t * p.y;
    sumT2 += p.t * p.t;
  }
  const denom = N * sumT2 - sumT * sumT;
  if (Math.abs(denom) < 1e-12) {
    return { m: 0, b: sumY / N };
  }
  const m = (N * sumTY - sumT * sumY) / denom;
  const b = (sumY - m * sumT) / N;
  return { m, b };
}

/** Eq. 10: f(x) = m·x + b */
export function linearProjection(m: number, b: number, x: number): number {
  return m * x + b;
}

/** HISTORICAL_BASE × (1 + cagr)^k */
export function cagrProjection(base: number, rate: number, k: number): number {
  return base * Math.pow(1 + rate, k);
}

export function varianceSentiment(
  accountClass: "Revenue" | "Expense" | "Other",
  varianceAbs: Decimal | number
): "FAVOURABLE" | "UNFAVOURABLE" | "NEUTRAL" {
  const d = toDec(varianceAbs);
  if (accountClass === "Revenue") {
    if (d.greaterThan(0)) return "FAVOURABLE";
    if (d.lessThan(0)) return "UNFAVOURABLE";
    return "NEUTRAL";
  }
  if (accountClass === "Expense") {
    if (d.lessThan(0)) return "FAVOURABLE";
    if (d.greaterThan(0)) return "UNFAVOURABLE";
    return "NEUTRAL";
  }
  return d.isZero() ? "NEUTRAL" : d.greaterThan(0) ? "FAVOURABLE" : "UNFAVOURABLE";
}
