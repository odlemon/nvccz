import Decimal from "decimal.js";
import {
  actual365DenominatorForYear,
  denominatorForDayCount,
  ShortTermInvestmentAccrualCalculator,
  isLastDayOfMonthFromIso,
} from "../../services/ShortTermInvestmentAccrualCalculator";

describe("ShortTermInvestmentAccrualCalculator", () => {
  test("ACTUAL_365: non-leap uses 365; leap year uses 366", () => {
    expect(actual365DenominatorForYear(2023)).toBe(365);
    expect(actual365DenominatorForYear(2024)).toBe(366);
  });

  test("ACTUAL_360 and THIRTY_360: denominator is always 360", () => {
    expect(denominatorForDayCount("ACTUAL_360", 2023)).toBe(360);
    expect(denominatorForDayCount("ACTUAL_360", 2024)).toBe(360);
    expect(denominatorForDayCount("THIRTY_360", 2023)).toBe(360);
    expect(denominatorForDayCount("THIRTY_360", 2024)).toBe(360);
  });

  test("SIMPLE: ACTUAL_360 yields slightly higher daily than ACTUAL_365", () => {
    const d365 = ShortTermInvestmentAccrualCalculator.computeOneDay({
      compoundingMethod: "SIMPLE",
      dayCount: "ACTUAL_365",
      apy: "0.05",
      principal: "100000",
      accruedInterestBefore: "0",
      accrualDateIso: "2023-06-15",
    });
    const d360 = ShortTermInvestmentAccrualCalculator.computeOneDay({
      compoundingMethod: "SIMPLE",
      dayCount: "ACTUAL_360",
      apy: "0.05",
      principal: "100000",
      accruedInterestBefore: "0",
      accrualDateIso: "2023-06-15",
    });
    expect(d360.dailyAmount.gt(d365.dailyAmount)).toBe(true);
  });

  test("SIMPLE: 5% APY on 100000 gives daily ~ 13.6986 in non-leap", () => {
    const { dailyAmount, denominator } = ShortTermInvestmentAccrualCalculator.computeOneDay({
      compoundingMethod: "SIMPLE",
      dayCount: "ACTUAL_365",
      apy: "0.05",
      principal: "100000",
      accruedInterestBefore: "0",
      accrualDateIso: "2023-06-15",
    });
    expect(denominator).toBe(365);
    expect(dailyAmount.toDecimalPlaces(8).toString()).toBe("13.69863014");
  });

  test("SIMPLE: same nominal rate in leap year uses 366 denominator (smaller daily)", () => {
    const nonLeap = ShortTermInvestmentAccrualCalculator.computeOneDay({
      compoundingMethod: "SIMPLE",
      dayCount: "ACTUAL_365",
      apy: "0.05",
      principal: "100000",
      accruedInterestBefore: "0",
      accrualDateIso: "2023-03-01",
    });
    const leap = ShortTermInvestmentAccrualCalculator.computeOneDay({
      compoundingMethod: "SIMPLE",
      dayCount: "ACTUAL_365",
      apy: 0.05,
      principal: 100000,
      accruedInterestBefore: 0,
      accrualDateIso: "2024-03-01",
    });
    expect(leap.denominator).toBe(366);
    expect(leap.dailyAmount.lt(nonLeap.dailyAmount)).toBe(true);
  });

  test("COMPOUND_DAILY: accrues on principal + accrued", () => {
    const d1 = ShortTermInvestmentAccrualCalculator.computeOneDay({
      compoundingMethod: "COMPOUND_DAILY",
      dayCount: "ACTUAL_365",
      apy: "0.10",
      principal: "10000",
      accruedInterestBefore: "500",
      accrualDateIso: "2025-07-01",
    });
    const d0 = ShortTermInvestmentAccrualCalculator.computeOneDay({
      compoundingMethod: "COMPOUND_DAILY",
      dayCount: "ACTUAL_365",
      apy: "0.10",
      principal: "10000",
      accruedInterestBefore: "0",
      accrualDateIso: "2025-07-01",
    });
    expect(d1.dailyAmount.gt(d0.dailyAmount)).toBe(true);
  });

  test("negative APY yields negative accrual (capital erosion path)", () => {
    const { dailyAmount } = ShortTermInvestmentAccrualCalculator.computeOneDay({
      compoundingMethod: "SIMPLE",
      dayCount: "ACTUAL_365",
      apy: "-0.02",
      principal: "100000",
      accruedInterestBefore: "0",
      accrualDateIso: "2023-01-10",
    });
    expect(dailyAmount.isNegative()).toBe(true);
    expect(dailyAmount.toDecimalPlaces(10).toString()).toEqual(
      new Decimal("-2000").div(365).toDecimalPlaces(10).toString()
    );
  });

  test("high APY (100%) simple still finite", () => {
    const { dailyAmount } = ShortTermInvestmentAccrualCalculator.computeOneDay({
      compoundingMethod: "SIMPLE",
      dayCount: "ACTUAL_365",
      apy: "1",
      principal: "1.e10",
      accruedInterestBefore: "0",
      accrualDateIso: "2023-01-10",
    });
    expect(dailyAmount.gt(0)).toBe(true);
    expect(dailyAmount.lt("1e10")).toBe(true);
  });

  test("COMPOUND_MONTHLY: zero on non-month-end; positive on month-end", () => {
    const mid = ShortTermInvestmentAccrualCalculator.computeOneDay({
      compoundingMethod: "COMPOUND_MONTHLY",
      dayCount: "ACTUAL_365",
      apy: "0.12",
      principal: "1200",
      accruedInterestBefore: "0",
      accrualDateIso: "2026-01-15",
    });
    expect(mid.dailyAmount.isZero()).toBe(true);
    const end = ShortTermInvestmentAccrualCalculator.computeOneDay({
      compoundingMethod: "COMPOUND_MONTHLY",
      dayCount: "ACTUAL_365",
      apy: "0.12",
      principal: "1200",
      accruedInterestBefore: "0",
      accrualDateIso: "2026-01-31",
    });
    expect(isLastDayOfMonthFromIso("2026-01-31")).toBe(true);
    expect(end.dailyAmount.gt(0)).toBe(true);
    // ~ monthly rate on 1200 from 12% APY: 1200 * ((1.12)^(1/12)-1)
    const expected = new Decimal(1200).mul(new Decimal(1.12).pow(new Decimal(1).div(12)).minus(1));
    expect(end.dailyAmount.minus(expected).abs().lt("0.0001")).toBe(true);
  });

  test("mid-cycle rate change: calculator uses provided APY (caller picks rate per day)", () => {
    const low = ShortTermInvestmentAccrualCalculator.computeOneDay({
      compoundingMethod: "SIMPLE",
      dayCount: "ACTUAL_365",
      apy: "0.05",
      principal: "100000",
      accruedInterestBefore: "0",
      accrualDateIso: "2026-04-30",
    });
    const high = ShortTermInvestmentAccrualCalculator.computeOneDay({
      compoundingMethod: "SIMPLE",
      dayCount: "ACTUAL_365",
      apy: "0.08",
      principal: "100000",
      accruedInterestBefore: "0",
      accrualDateIso: "2026-05-01",
    });
    expect(high.dailyAmount.div(low.dailyAmount).toDecimalPlaces(6).toNumber()).toBe(1.6);
  });
});
