import { xirr } from "../utils/xirr";

describe("xirr", () => {
  it("computes ~10% annual return for a 1y cashflow", () => {
    const res = xirr([
      { amount: -1000, date: new Date("2025-01-01T12:00:00Z") },
      { amount: 1100, date: new Date("2026-01-01T12:00:00Z") },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rate).toBeGreaterThan(0.099);
    expect(res.rate).toBeLessThan(0.101);
  });

  it("returns NO_SIGN_CHANGE when all cashflows are same sign", () => {
    const res = xirr([
      { amount: -1000, date: new Date("2025-01-01T12:00:00Z") },
      { amount: -100, date: new Date("2026-01-01T12:00:00Z") },
    ]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("NO_SIGN_CHANGE");
  });
});

