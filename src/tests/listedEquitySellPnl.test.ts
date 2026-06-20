import { WacCalculatorService } from "../services/listedEquity/WacCalculatorService";

describe("ListedEquity sell realized P&L (Eq. 3)", () => {
  test("500 ARIS @ 7 vs WAC 6.4936", () => {
    const pnl = WacCalculatorService.realizedPnl(500, 7, 6.4936);
    expect(pnl).toBeCloseTo(253.2, 4);
  });
});
