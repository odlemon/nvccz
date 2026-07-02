// @ts-nocheck
import { prisma } from "../../utils/database";
import { ExchangeRateDisplayResolverService } from "../exchangeRateDisplay/ExchangeRateDisplayResolverService";

const ZIG_ALIASES = new Set(["ZIG", "ZWG", "ZWL"]);

export class FundraisingFxService {
  static normalizeCurrency(code?: string): string {
    const c = String(code || "USD").trim().toUpperCase();
    if (ZIG_ALIASES.has(c)) return "ZIG";
    return c;
  }

  static async resolveRate(from: string, to: string): Promise<number | null> {
    const f = FundraisingFxService.normalizeCurrency(from);
    const t = FundraisingFxService.normalizeCurrency(to);
    if (f === t) return 1;

    const widget = await ExchangeRateDisplayResolverService.resolveWidget({
      context: "GENERIC",
      from: f === "ZIG" ? "USD" : f,
      to: t === "ZIG" ? "ZWG" : t,
    });
    const avg = widget?.primary?.avg ?? widget?.comparison?.avg;
    if (avg == null) return null;
    const n = Number(avg);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  static async convertAmount(amount: number, from: string, to: string, storedRate?: number | null): Promise<number> {
    const f = FundraisingFxService.normalizeCurrency(from);
    const t = FundraisingFxService.normalizeCurrency(to);
    if (f === t) return amount;
    const rate = storedRate ?? (await FundraisingFxService.resolveRate(f, t));
    if (!rate) return amount;
    return amount * rate;
  }
}
