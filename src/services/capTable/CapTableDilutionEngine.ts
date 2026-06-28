// @ts-nocheck
import Decimal from "decimal.js";
import type { DilutionNoteInput, DilutionSimInput } from "./capTableTypes";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export class CapTableDilutionEngine {
  /** Accrued simple interest: I = P * (r * t/365) */
  static accruedInterest(principal: number, annualRate: number, days: number): number {
    if (!principal || !annualRate || !days) return 0;
    return new Decimal(principal).mul(new Decimal(annualRate).mul(days).div(365)).toNumber();
  }

  /** P_note = min(Cap/S_pre, P_round * (1-D)) */
  static conversionPrice(args: {
    valuationCap?: number | null;
    discountRate?: number | null;
    preMoneyFullyDilutedShares: number;
    roundPricePerShare: number;
  }): number {
    const pRound = new Decimal(args.roundPricePerShare);
    const candidates: Decimal[] = [];

    if (args.valuationCap && args.preMoneyFullyDilutedShares > 0) {
      candidates.push(new Decimal(args.valuationCap).div(args.preMoneyFullyDilutedShares));
    }
    const discount = args.discountRate ?? 0;
    candidates.push(pRound.mul(new Decimal(1).minus(discount)));

    return Decimal.min(...candidates).toNumber();
  }

  static sharesFromNote(note: DilutionNoteInput, roundPricePerShare: number, sPre: number): number {
    const days = note.daysAccrued ?? 0;
    const interest = CapTableDilutionEngine.accruedInterest(
      note.principal,
      note.annualInterestRate,
      days
    );
    const pNote = CapTableDilutionEngine.conversionPrice({
      valuationCap: note.valuationCap,
      discountRate: note.discountRate,
      preMoneyFullyDilutedShares: sPre,
      roundPricePerShare,
    });
    if (pNote <= 0) return 0;
    return new Decimal(note.principal).plus(interest).div(pNote).toNumber();
  }

  static run(input: DilutionSimInput) {
    const sPre = new Decimal(input.preMoneyFullyDilutedShares);
    const postMoneyVal = new Decimal(input.preMoneyValuation).plus(input.roundInvestment);
    const roundPrice =
      sPre.gt(0) && input.roundInvestment > 0
        ? new Decimal(input.preMoneyValuation).plus(input.roundInvestment).div(sPre.plus(
            new Decimal(input.roundInvestment).div(
              new Decimal(input.preMoneyValuation).div(sPre)
            )
          ))
        : new Decimal(0);

    // Simpler round price: post-money / (S_pre + new shares from round)
    const priceFromPreMoney =
      sPre.gt(0) ? new Decimal(input.preMoneyValuation).div(sPre) : new Decimal(0);
    const newRoundShares =
      priceFromPreMoney.gt(0)
        ? new Decimal(input.roundInvestment).div(priceFromPreMoney)
        : new Decimal(0);

    let noteShares = new Decimal(0);
    const noteBreakdown: Array<{ principal: number; conversionPrice: number; shares: number }> = [];
    for (const note of input.notes ?? []) {
      const pNote = CapTableDilutionEngine.conversionPrice({
        valuationCap: note.valuationCap,
        discountRate: note.discountRate,
        preMoneyFullyDilutedShares: sPre.toNumber(),
        roundPricePerShare: priceFromPreMoney.toNumber(),
      });
      const shares = CapTableDilutionEngine.sharesFromNote(note, priceFromPreMoney.toNumber(), sPre.toNumber());
      noteShares = noteShares.plus(shares);
      noteBreakdown.push({ principal: note.principal, conversionPrice: pNote, shares });
    }

    const esopPct = input.optionPoolTopUpPct ?? 0;
    const baseForPool = sPre.plus(newRoundShares).plus(noteShares);
    const esopExpansion = baseForPool.mul(esopPct).div(100);

    const postFd = baseForPool.plus(esopExpansion);
    const investorPct = postFd.gt(0) ? newRoundShares.div(postFd).mul(100) : new Decimal(0);

    return {
      preMoneyValuation: input.preMoneyValuation,
      postMoneyValuation: postMoneyVal.toNumber(),
      roundPricePerShare: priceFromPreMoney.toDecimalPlaces(4).toNumber(),
      newRoundShares: newRoundShares.toDecimalPlaces(4).toNumber(),
      noteConversionShares: noteShares.toDecimalPlaces(4).toNumber(),
      noteBreakdown,
      esopExpansionShares: esopExpansion.toDecimalPlaces(4).toNumber(),
      postMoneyFullyDilutedShares: postFd.toDecimalPlaces(4).toNumber(),
      newInvestorOwnershipPct: investorPct.toDecimalPlaces(4).toNumber(),
    };
  }
}
