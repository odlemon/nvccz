// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";

const ALLOWED_FEE_BASES = new Set(["COMMITTED", "INVESTED", "NAV"]);
const ALLOWED_FREQUENCIES = new Set([
  "MONTHLY",
  "QUARTERLY",
  "SEMI_ANNUAL",
  "ANNUAL",
]);
const ALLOWED_HURDLE_TYPES = new Set(["NONE", "PREFERRED_RETURN"]);
const ALLOWED_WATERFALLS = new Set(["EUROPEAN", "AMERICAN"]);

function asRate(name: string, raw: unknown): Decimal | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new Error(`${name} must be a fraction between 0 and 1 (e.g. 0.02 = 2%)`);
  }
  return new Decimal(n);
}

function asDate(name: string, raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${name}`);
  return d;
}

function asEnum<T extends string>(name: string, raw: unknown, allowed: Set<T>): T | null {
  if (raw == null || raw === "") return null;
  const v = String(raw).trim().toUpperCase();
  if (!allowed.has(v as T)) {
    throw new Error(`${name} must be one of: ${[...allowed].join(", ")}`);
  }
  return v as T;
}

export type FeePolicyInput = {
  managementFeeRate?: number | string | null;
  managementFeeBase?: string | null;
  managementFeeFrequency?: string | null;
  managementFeeStartDate?: string | Date | null;
  carryRate?: number | string | null;
  hurdleRate?: number | string | null;
  hurdleType?: string | null;
  catchUpRate?: number | string | null;
  waterfallType?: string | null;
};

export class FundFeePolicyService {
  static async getByFundId(fundId: string) {
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      select: {
        id: true,
        name: true,
        managementFeeRate: true,
        managementFeeBase: true,
        managementFeeFrequency: true,
        managementFeeStartDate: true,
        carryRate: true,
        hurdleRate: true,
        hurdleType: true,
        catchUpRate: true,
        waterfallType: true,
      },
    });
    if (!fund) throw new Error("Fund not found");
    return fund;
  }

  static async upsert(fundId: string, input: FeePolicyInput) {
    const fund = await prisma.fund.findUnique({ where: { id: fundId }, select: { id: true } });
    if (!fund) throw new Error("Fund not found");

    const managementFeeRate = asRate("managementFeeRate", input.managementFeeRate);
    const managementFeeBase = asEnum("managementFeeBase", input.managementFeeBase, ALLOWED_FEE_BASES);
    const managementFeeFrequency = asEnum(
      "managementFeeFrequency",
      input.managementFeeFrequency,
      ALLOWED_FREQUENCIES
    );
    const managementFeeStartDate = asDate("managementFeeStartDate", input.managementFeeStartDate);
    const carryRate = asRate("carryRate", input.carryRate);
    const hurdleRate = asRate("hurdleRate", input.hurdleRate);
    const hurdleType = asEnum("hurdleType", input.hurdleType, ALLOWED_HURDLE_TYPES);
    const catchUpRate = asRate("catchUpRate", input.catchUpRate);
    const waterfallType = asEnum("waterfallType", input.waterfallType, ALLOWED_WATERFALLS);

    if (managementFeeRate && !managementFeeBase) {
      throw new Error("managementFeeBase is required when managementFeeRate is set");
    }
    if (managementFeeRate && !managementFeeFrequency) {
      throw new Error("managementFeeFrequency is required when managementFeeRate is set");
    }
    if (carryRate && hurdleType === "PREFERRED_RETURN" && !hurdleRate) {
      throw new Error("hurdleRate is required when hurdleType is PREFERRED_RETURN");
    }

    await prisma.fund.update({
      where: { id: fundId },
      data: {
        managementFeeRate,
        managementFeeBase,
        managementFeeFrequency,
        managementFeeStartDate,
        carryRate,
        hurdleRate,
        hurdleType,
        catchUpRate,
        waterfallType,
      },
    });

    return this.getByFundId(fundId);
  }
}
