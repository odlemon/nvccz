// @ts-nocheck
import { xirr, type XirrCashflow } from "../../utils/xirr";

export class QuarterlyStatementMetricsEngine {
  static round4(n: number): number {
    return Math.round(n * 10000) / 10000;
  }

  static ratios(paidIn: number, distributions: number, nav: number) {
    const dpi = paidIn > 0 ? distributions / paidIn : 0;
    const rvpi = paidIn > 0 ? nav / paidIn : 0;
    const tvpi = paidIn > 0 ? (distributions + nav) / paidIn : 0;
    return {
      dpi: QuarterlyStatementMetricsEngine.round4(dpi),
      tvpi: QuarterlyStatementMetricsEngine.round4(tvpi),
      rvpi: QuarterlyStatementMetricsEngine.round4(rvpi),
    };
  }

  static netIrr(cashflows: XirrCashflow[], terminalNav: number, periodEnd: Date): number | null {
    const flows: XirrCashflow[] = [...cashflows];
    if (terminalNav > 0) {
      flows.push({ amount: terminalNav, date: periodEnd });
    }
    const result = xirr(flows);
    if (!result.ok) return null;
    return QuarterlyStatementMetricsEngine.round4(result.rate);
  }
}
