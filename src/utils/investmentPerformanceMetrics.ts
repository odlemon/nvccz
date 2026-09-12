/**
 * IRR / ROI helpers for portfolio exit analytics (XIRR-style, actual/365 day basis).
 */

export type CashFlow = { date: Date; amount: number };

function daysBetween(base: Date, d: Date): number {
  return (d.getTime() - base.getTime()) / (1000 * 60 * 60 * 24);
}

function npvAndDerivative(rate: number, flows: CashFlow[], base: Date): { npv: number; dnpv: number } {
  let npv = 0;
  let dnpv = 0;
  for (const f of flows) {
    const years = daysBetween(base, f.date) / 365;
    const disc = Math.pow(1 + rate, years);
    npv += f.amount / disc;
    // d/dr [ amount * (1+r)^(-y) ] = -y * amount * (1+r)^(-y-1)
    dnpv -= (years * f.amount) / (disc * (1 + rate));
  }
  return { npv, dnpv };
}

/**
 * Annualized IRR from irregular cash flows (fund perspective: outflows negative, exit inflow positive).
 * Returns null if not solvable or insufficient data.
 */
export function calculateXirrAnnualized(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const base = sorted[0].date;
  const hasPos = sorted.some((f) => f.amount > 0);
  const hasNeg = sorted.some((f) => f.amount < 0);
  if (!hasPos || !hasNeg) return null;

  let rate = 0.1;
  for (let iter = 0; iter < 100; iter++) {
    const { npv, dnpv } = npvAndDerivative(rate, sorted, base);
    if (Math.abs(npv) < 1e-9) return rate;
    if (!Number.isFinite(dnpv) || Math.abs(dnpv) < 1e-14) break;
    const next = rate - npv / dnpv;
    if (!Number.isFinite(next)) break;
    rate = next;
    if (Math.abs(rate) > 10) rate = rate > 0 ? 10 : -0.9999;
  }
  return Number.isFinite(rate) ? rate : null;
}

export function calculateRoiMultiple(totalInvested: number, exitProceeds: number): number | null {
  if (!(totalInvested > 0) || !Number.isFinite(totalInvested)) return null;
  return exitProceeds / totalInvested;
}
