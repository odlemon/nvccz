// @ts-nocheck
import { prisma } from "../../utils/database";
import { ExchangeRateQuoteService } from "../exchangeRateDisplay/ExchangeRateQuoteService";

const ZIG_ALIASES = new Set(["ZIG", "ZWG", "ZWL"]);

export class QuarterlyStatementFxService {
  static normalize(code?: string): string {
    const c = String(code || "USD").trim().toUpperCase();
    if (ZIG_ALIASES.has(c)) return "ZIG";
    return c;
  }

  static async rateAtDate(from: string, to: string, asOf: Date): Promise<number | null> {
    const f = QuarterlyStatementFxService.normalize(from);
    const t = QuarterlyStatementFxService.normalize(to);
    if (f === t) return 1;

    const quoteFrom = f === "ZIG" ? "USD" : f;
    const quoteTo = t === "ZIG" ? "ZWG" : t;

    const quote = await ExchangeRateQuoteService.getLatestQuote(
      "ZIMRATE_STREET",
      quoteFrom,
      quoteTo,
      asOf
    );
    if (!quote) return null;
    const n = Number(quote.avg);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  static async convert(amount: number, currency: string, target: "USD" | "ZIG", asOf: Date): Promise<number> {
    const c = QuarterlyStatementFxService.normalize(currency);
    const tgt = target;
    if (c === tgt) return amount;
    const rate = await QuarterlyStatementFxService.rateAtDate(c, tgt, asOf);
    if (!rate) return amount;
    return amount * rate;
  }
}
