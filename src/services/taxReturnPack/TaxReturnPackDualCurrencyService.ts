// @ts-nocheck
import { QuarterlyStatementFxService } from "../quarterlyStatements/QuarterlyStatementFxService";
import { roundMoney } from "./taxReturnPackSupport";

export class TaxReturnPackDualCurrencyService {
  static async closingUsdZigRate(asOf: Date): Promise<number | null> {
    return QuarterlyStatementFxService.rateAtDate("USD", "ZIG", asOf);
  }

  static computeWeightedEtr(input: {
    taxableIncomeUsd: number;
    taxableIncomeZig: number;
    taxPaidUsd: number;
    taxPaidZig: number;
    closingRate: number | null;
  }): number | null {
    const r = input.closingRate;
    if (!r || r <= 0) return null;

    const denom = input.taxableIncomeUsd * r + input.taxableIncomeZig;
    if (!denom || denom <= 0) return null;

    const numer = input.taxPaidUsd * r + input.taxPaidZig;
    return roundMoney((numer / denom) * 100);
  }

  static async convertAtDate(amount: number, currency: string, target: "USD" | "ZIG", asOf: Date): Promise<number> {
    return QuarterlyStatementFxService.convert(amount, currency, target, asOf);
  }

  static normalizeCurrency(code?: string): string {
    return QuarterlyStatementFxService.normalize(code);
  }
}
