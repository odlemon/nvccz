import { TaxReturnPackDualCurrencyService } from "../src/services/taxReturnPack/TaxReturnPackDualCurrencyService";

describe("TaxReturnPackDualCurrencyService ETR", () => {
  test("weighted ETR (Eq. 6)", () => {
    const etr = TaxReturnPackDualCurrencyService.computeWeightedEtr({
      taxableIncomeUsd: 100000,
      taxableIncomeZig: 50000,
      taxPaidUsd: 24000,
      taxPaidZig: 12000,
      closingRate: 30,
    });
    expect(etr).toBeCloseTo(24, 1);
  });

  test("returns null when closing rate missing", () => {
    const etr = TaxReturnPackDualCurrencyService.computeWeightedEtr({
      taxableIncomeUsd: 100000,
      taxableIncomeZig: 50000,
      taxPaidUsd: 24000,
      taxPaidZig: 12000,
      closingRate: null,
    });
    expect(etr).toBeNull();
  });
});
