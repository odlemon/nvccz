// @ts-nocheck
import Decimal from "decimal.js";
import type { WaterfallClassInput } from "./capTableTypes";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type WaterfallPayout = {
  classCode: string;
  preferentialPayout: number;
  participationPayout: number;
  totalPayout: number;
};

export class CapTableWaterfallEngine {
  static evaluate(totalProceeds: number, classes: WaterfallClassInput[]) {
    let vRem = new Decimal(totalProceeds);
    const sorted = [...classes].sort((a, b) => a.seniorityIndex - b.seniorityIndex);
    const payouts: WaterfallPayout[] = [];

    for (const c of sorted) {
      const issued = new Decimal(c.issuedShares);
      const cost = new Decimal(c.originalCostPerShare);
      const threshold = issued.mul(cost).mul(c.liquidationMultiplier);
      const pref = Decimal.min(vRem, threshold);
      vRem = vRem.minus(pref);
      payouts.push({
        classCode: c.classCode,
        preferentialPayout: pref.toDecimalPlaces(2).toNumber(),
        participationPayout: 0,
        totalPayout: pref.toDecimalPlaces(2).toNumber(),
      });
    }

    const participating = sorted.filter((c) => c.isParticipating);
    const commonShares = sorted
      .filter((c) => c.classCode.toUpperCase().includes("COMMON") || c.seniorityIndex >= 90)
      .reduce((s, c) => s + c.issuedShares, 0);
    const participatingShares = participating.reduce((s, c) => s + c.issuedShares, 0);
    const denom = commonShares + participatingShares;

    if (vRem.gt(0) && denom > 0) {
      for (const c of participating) {
        const share = new Decimal(c.issuedShares).div(denom);
        const part = vRem.mul(share);
        const row = payouts.find((p) => p.classCode === c.classCode);
        if (row) {
          row.participationPayout = part.toDecimalPlaces(2).toNumber();
          row.totalPayout = new Decimal(row.preferentialPayout).plus(part).toDecimalPlaces(2).toNumber();
        }
      }
      const commonPart = vRem.mul(new Decimal(commonShares).div(denom));
      const commonRow = payouts.find((p) => p.classCode.toUpperCase().includes("COMMON"));
      if (commonRow) {
        commonRow.participationPayout = commonPart.toDecimalPlaces(2).toNumber();
        commonRow.totalPayout = new Decimal(commonRow.preferentialPayout)
          .plus(commonPart)
          .toDecimalPlaces(2)
          .toNumber();
      }
    }

    const totalDistributed = payouts.reduce((s, p) => s + p.totalPayout, 0);
    return {
      totalProceeds,
      remainingUndistributed: new Decimal(totalProceeds).minus(totalDistributed).toDecimalPlaces(2).toNumber(),
      payouts,
    };
  }
}
