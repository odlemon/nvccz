import Decimal from "decimal.js";
import { prisma } from "../../utils/database";
import { resolveUsdZwgAvgForSnapshot } from "../UsdZwgRateResolver";

const FALLBACK_USD_ZIG = new Decimal(40);

/** USD per 1 ZIG is 1/rate when rate is ZIG per USD */
export async function resolvePayrollUsdZigRate(asOf?: Date): Promise<Decimal> {
  const rate = await resolveUsdZwgAvgForSnapshot(prisma);
  if (rate && rate > 0) {
    return new Decimal(rate);
  }
  return FALLBACK_USD_ZIG;
}

export function convertAmountBetweenCurrencies(
  amount: Decimal,
  fromCode: string,
  toCode: string,
  usdZigRate: Decimal
): Decimal {
  const from = String(fromCode || "USD").toUpperCase();
  const to = String(toCode || "USD").toUpperCase();
  if (from === to) return amount;
  if (from === "USD" && (to === "ZIG" || to === "ZWG")) {
    return amount.mul(usdZigRate);
  }
  if ((from === "ZIG" || from === "ZWG") && to === "USD") {
    return amount.div(usdZigRate);
  }
  return amount;
}
