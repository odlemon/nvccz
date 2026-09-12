/**
 * Safe ratio / growth helpers for BSC digital entry flows (division by zero, null capital).
 */

export function toPositiveNumber(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return fallback;
  return n;
}

const PERCENT_TARGET_UNITS = new Set(["%", "PERCENT", "PCT", "PERCENTAGE", "PERCENTAGE_POINTS"]);

/** True when the goal target is denominated in currency (not ROI / percent). */
export function isCurrencyPerformanceTarget(args: {
  targetUnit?: unknown;
  unitCategory?: unknown;
}): boolean {
  const unit = String(args.targetUnit || "")
    .trim()
    .toUpperCase();
  if (unit && PERCENT_TARGET_UNITS.has(unit)) {
    return false;
  }
  const category = String(args.unitCategory || "")
    .trim()
    .toLowerCase();
  if (category === "currency") {
    return true;
  }
  if (unit && /^[A-Z]{3}$/.test(unit)) {
    return true;
  }
  return false;
}

/** (numerator / denominator) * 100, or null when denominator is zero / non-finite. */
export function safeRatioPercent(numerator: unknown, denominator: unknown): number | null {
  const n = toPositiveNumber(numerator, NaN);
  const d = toPositiveNumber(denominator, NaN);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return (n / d) * 100;
}

/** Growth ((current - previous) / previous) * 100; null if previous is zero / missing. */
export function safeGrowthPercent(current: unknown, previous: unknown): number | null {
  return safeRatioPercent(
    toPositiveNumber(current, NaN) - toPositiveNumber(previous, NaN),
    previous
  );
}

/** Herfindahl-based spread: 0 = one group only, higher = more even distribution (capped 0–100). */
export function diversitySpreadFromPercents(percentsByGroup: Record<string, number>): number {
  const vals = Object.values(percentsByGroup).filter((x) => Number.isFinite(x) && x >= 0);
  if (vals.length === 0) return 0;
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  const p = vals.map((x) => x / sum);
  const hhi = p.reduce((s, x) => s + x * x, 0);
  return Math.round(Math.min(100, Math.max(0, (1 - hhi) * 100)) * 1000) / 1000;
}
