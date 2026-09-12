import Decimal from "decimal.js";
import { prisma } from "../../utils/database";

export type CurrencyLegCode = "USD" | "ZIG";

export interface StatutoryLegResult {
  currencyCode: CurrencyLegCode;
  grossPay: Decimal;
  payeAmount: Decimal;
  aidsLevyAmount: Decimal;
  nssaAmount: Decimal;
  sdlAmount: Decimal;
  otherDeductions: Decimal;
  totalDeductions: Decimal;
  netPay: Decimal;
}

export interface LevyConfig {
  nssaRate: Decimal;
  nssaCeiling: Decimal;
  aidsRate: Decimal;
  sdlRate: Decimal;
}

function roundMoney(amount: Decimal, currencyCode: string): Decimal {
  const dp = currencyCode === "ZIG" ? 3 : 2;
  return amount.toDecimalPlaces(dp, Decimal.ROUND_HALF_UP);
}

export async function loadLevyConfig(
  currencyCode: CurrencyLegCode,
  effectiveDate: Date
): Promise<LevyConfig> {
  const rows = await prisma.statutoryLevyConfig.findMany({
    where: {
      currencyCode,
      isActive: true,
      effectiveFrom: { lte: effectiveDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
    },
  });
  const byCode = new Map(rows.map((r) => [r.levyCode, r]));
  const nssaRate = new Decimal(byCode.get("NSSA_RATE")?.rate?.toString() || "0.045");
  const nssaCeiling = new Decimal(byCode.get("NSSA_CEILING")?.ceiling?.toString() || "700");
  const aidsRate = new Decimal(byCode.get("AIDS_RATE")?.rate?.toString() || "0.03");
  const sdlRate = new Decimal(byCode.get("SDL_RATE")?.rate?.toString() || "0.005");
  return { nssaRate, nssaCeiling, aidsRate, sdlRate };
}

export async function calculateProgressivePaye(
  gross: Decimal,
  currencyCode: CurrencyLegCode,
  effectiveDate: Date
): Promise<Decimal> {
  const brackets = await prisma.zimraTaxBracket.findMany({
    where: {
      currencyCode,
      isActive: true,
      effectiveFrom: { lte: effectiveDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
    },
    orderBy: { lowerBound: "asc" },
  });
  if (!brackets.length) return new Decimal(0);

  const g = gross.toNumber();
  let bracket = brackets[brackets.length - 1];
  for (const b of brackets) {
    const lo = Number(b.lowerBound);
    const hi = b.upperBound != null ? Number(b.upperBound) : Infinity;
    if (g >= lo && g < hi) {
      bracket = b;
      break;
    }
  }
  const rate = new Decimal(bracket.marginalRate.toString());
  const offset = new Decimal(bracket.deductionOffset.toString());
  const tax = gross.mul(rate).sub(offset);
  return roundMoney(tax.lt(0) ? new Decimal(0) : tax, currencyCode);
}

export async function calculateStatutoryLeg(
  grossPay: Decimal,
  currencyCode: CurrencyLegCode,
  effectiveDate: Date,
  otherDeductions: Decimal = new Decimal(0)
): Promise<StatutoryLegResult> {
  const levy = await loadLevyConfig(currencyCode, effectiveDate);
  const payeAmount = await calculateProgressivePaye(grossPay, currencyCode, effectiveDate);
  const aidsLevyAmount = roundMoney(payeAmount.mul(levy.aidsRate), currencyCode);
  const pensionable = Decimal.min(grossPay, levy.nssaCeiling);
  const nssaAmount = roundMoney(pensionable.mul(levy.nssaRate), currencyCode);
  const sdlAmount = roundMoney(grossPay.mul(levy.sdlRate), currencyCode);
  const totalDeductions = payeAmount
    .add(aidsLevyAmount)
    .add(nssaAmount)
    .add(sdlAmount)
    .add(otherDeductions);
  const netPay = roundMoney(grossPay.sub(totalDeductions), currencyCode);

  return {
    currencyCode,
    grossPay: roundMoney(grossPay, currencyCode),
    payeAmount,
    aidsLevyAmount,
    nssaAmount,
    sdlAmount,
    otherDeductions: roundMoney(otherDeductions, currencyCode),
    totalDeductions: roundMoney(totalDeductions, currencyCode),
    netPay,
  };
}

export function splitGrossByContract(
  basicSalary: Decimal,
  usdPct: Decimal,
  zigPct: Decimal,
  usdZigRate: Decimal
): { usdGross: Decimal; zigGross: Decimal } {
  const usdGross = basicSalary.mul(usdPct);
  const zigGross = basicSalary.mul(zigPct).mul(usdZigRate);
  return { usdGross, zigGross };
}
