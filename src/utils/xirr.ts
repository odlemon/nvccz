export type XirrCashflow = {
  /** Cashflow amount: contributions negative, distributions/terminal value positive. */
  amount: number;
  /** JS Date (time part ignored; UTC noon recommended for stability). */
  date: Date;
};

export type XirrResult =
  | { ok: true; rate: number; iterations: number; method: "newton" | "bisection" }
  | { ok: false; reason: "INSUFFICIENT_CASHFLOWS" | "NO_SIGN_CHANGE" | "DID_NOT_CONVERGE" };

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (24 * 3600 * 1000);
}

function npv(rate: number, t0: Date, cashflows: XirrCashflow[]): number {
  // NPV(rate) = sum( amount_i / (1+rate)^(days/365) )
  // rate is decimal (0.12 = 12%).
  const onePlus = 1 + rate;
  if (onePlus <= 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (const cf of cashflows) {
    const dt = daysBetween(t0, cf.date) / 365;
    sum += cf.amount / Math.pow(onePlus, dt);
  }
  return sum;
}

function dNpv(rate: number, t0: Date, cashflows: XirrCashflow[]): number {
  // derivative w.r.t rate
  const onePlus = 1 + rate;
  if (onePlus <= 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (const cf of cashflows) {
    const dt = daysBetween(t0, cf.date) / 365;
    if (dt === 0) continue;
    sum += (-dt * cf.amount) / (Math.pow(onePlus, dt + 1));
  }
  return sum;
}

function normalizeCashflows(cashflows: XirrCashflow[]): XirrCashflow[] {
  const cleaned = cashflows
    .map((c) => ({
      amount: typeof c.amount === "number" ? c.amount : Number(c.amount),
      date: c.date instanceof Date ? c.date : new Date(c.date as any),
    }))
    .filter((c) => Number.isFinite(c.amount) && c.amount !== 0 && c.date instanceof Date && !Number.isNaN(c.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return cleaned;
}

function hasSignChange(cashflows: XirrCashflow[]): boolean {
  let hasNeg = false;
  let hasPos = false;
  for (const c of cashflows) {
    if (c.amount < 0) hasNeg = true;
    if (c.amount > 0) hasPos = true;
  }
  return hasNeg && hasPos;
}

/**
 * XIRR (IRR with irregular dates).
 *
 * - Returns `rate` as a **decimal** (0.12 = 12%).
 * - Uses Newton-Raphson with a bisection fallback.
 */
export function xirr(
  cashflowsInput: XirrCashflow[],
  opts?: {
    guess?: number;
    maxIterations?: number;
    tolerance?: number;
  }
): XirrResult {
  const cashflows = normalizeCashflows(cashflowsInput);
  if (cashflows.length < 2) return { ok: false, reason: "INSUFFICIENT_CASHFLOWS" };
  if (!hasSignChange(cashflows)) return { ok: false, reason: "NO_SIGN_CHANGE" };
  const t0 = cashflows[0].date;
  // Must have at least 2 distinct dates.
  const distinctDates = new Set(cashflows.map((c) => c.date.toISOString().slice(0, 10)));
  if (distinctDates.size < 2) return { ok: false, reason: "INSUFFICIENT_CASHFLOWS" };

  const maxIterations = Math.max(10, opts?.maxIterations ?? 60);
  const tolerance = Math.max(1e-12, opts?.tolerance ?? 1e-8);
  let r = Number.isFinite(opts?.guess as number) ? (opts!.guess as number) : 0.15;

  // Newton-Raphson
  for (let i = 0; i < maxIterations; i++) {
    const f = npv(r, t0, cashflows);
    if (!Number.isFinite(f)) break;
    if (Math.abs(f) < tolerance) return { ok: true, rate: r, iterations: i + 1, method: "newton" };
    const df = dNpv(r, t0, cashflows);
    if (!Number.isFinite(df) || Math.abs(df) < 1e-16) break;
    const step = f / df;
    const next = r - step;
    if (!Number.isFinite(next)) break;
    // Keep within sane bounds (avoid 1+rate <= 0).
    r = Math.min(10, Math.max(-0.9999, next));
  }

  // Bisection fallback: find a bracket where NPV changes sign.
  let lo = -0.9;
  let hi = 5;
  let fLo = npv(lo, t0, cashflows);
  let fHi = npv(hi, t0, cashflows);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi)) {
    return { ok: false, reason: "DID_NOT_CONVERGE" };
  }
  let expand = 0;
  while (fLo * fHi > 0 && expand < 24) {
    // Expand upper bound progressively.
    hi *= 1.6;
    if (hi > 1e6) break;
    fHi = npv(hi, t0, cashflows);
    expand++;
  }
  if (fLo * fHi > 0) return { ok: false, reason: "NO_SIGN_CHANGE" };

  for (let i = 0; i < maxIterations * 3; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, t0, cashflows);
    if (!Number.isFinite(fMid)) return { ok: false, reason: "DID_NOT_CONVERGE" };
    if (Math.abs(fMid) < tolerance) return { ok: true, rate: mid, iterations: i + 1, method: "bisection" };
    if (fLo * fMid <= 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  return { ok: false, reason: "DID_NOT_CONVERGE" };
}

