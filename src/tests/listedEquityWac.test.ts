import { WacCalculatorService } from "../services/listedEquity/WacCalculatorService";

describe("ListedEquity WAC (Eq. 1–3)", () => {
  test("first buy sets WAC to execution price", () => {
    const r = WacCalculatorService.computeWac(0, 0, 100, 10);
    expect(r.quantity).toBe(100);
    expect(r.wac).toBe(10);
  });

  test("second buy blends WAC", () => {
    const r = WacCalculatorService.computeWac(100, 10, 50, 16);
    expect(r.quantity).toBe(150);
    expect(r.wac).toBeCloseTo((100 * 10 + 50 * 16) / 150);
  });

  test("sell reduces quantity only", () => {
    const r = WacCalculatorService.applySell(150, 50, 12);
    expect(r.quantity).toBe(100);
    expect(r.wac).toBe(12);
  });

  test("unrealized P&L (Eq. 2)", () => {
    expect(WacCalculatorService.unrealizedPnl(100, 12, 10)).toBe(200);
  });

  test("realized P&L on sell (Eq. 3)", () => {
    expect(WacCalculatorService.realizedPnl(50, 14, 10)).toBe(200);
  });

  test("zero quantity sell clears WAC", () => {
    const r = WacCalculatorService.applySell(50, 50, 9);
    expect(r.quantity).toBe(0);
    expect(r.wac).toBe(0);
  });
});
