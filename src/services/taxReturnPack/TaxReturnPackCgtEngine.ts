// @ts-nocheck
import { TRP_STATUTORY, holdingYearsBetween, roundMoney } from "./taxReturnPackSupport";

export type CgtLineResult = {
  assetRef: string;
  sourceType: string;
  sourceId?: string | null;
  salePrice: number;
  costOriginal: number;
  holdingYears: number;
  costAdjusted: number;
  capitalGain: number;
  cgtRate: number;
  cgtLiability: number;
  currencyCode: string;
  acquiredAt?: Date | null;
  disposedAt?: Date | null;
};

export class TaxReturnPackCgtEngine {
  static adjustedCost(originalCost: number, holdingYears: number): number {
    return roundMoney(originalCost * (1 + TRP_STATUTORY.INDEXATION_PER_YEAR * holdingYears));
  }

  static capitalGain(salePrice: number, adjustedCost: number): number {
    return roundMoney(Math.max(0, salePrice - adjustedCost));
  }

  static cgtLiability(capitalGain: number, rate = TRP_STATUTORY.CGT_RATE): number {
    return roundMoney(capitalGain * rate);
  }

  static computeLine(input: {
    assetRef: string;
    sourceType: string;
    sourceId?: string | null;
    salePrice: number;
    costOriginal: number;
    acquiredAt: Date;
    disposedAt: Date;
    currencyCode?: string;
    cgtRate?: number;
  }): CgtLineResult {
    const holdingYears = holdingYearsBetween(input.acquiredAt, input.disposedAt);
    const costAdjusted = TaxReturnPackCgtEngine.adjustedCost(input.costOriginal, holdingYears);
    const capitalGain = TaxReturnPackCgtEngine.capitalGain(input.salePrice, costAdjusted);
    const rate = input.cgtRate ?? TRP_STATUTORY.CGT_RATE;
    const liability = TaxReturnPackCgtEngine.cgtLiability(capitalGain, rate);

    return {
      assetRef: input.assetRef,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      salePrice: roundMoney(input.salePrice),
      costOriginal: roundMoney(input.costOriginal),
      holdingYears,
      costAdjusted,
      capitalGain,
      cgtRate: rate,
      cgtLiability: liability,
      currencyCode: input.currencyCode || "USD",
      acquiredAt: input.acquiredAt,
      disposedAt: input.disposedAt,
    };
  }

  static totalLiability(lines: CgtLineResult[]): number {
    return roundMoney(lines.reduce((s, l) => s + l.cgtLiability, 0));
  }
}
