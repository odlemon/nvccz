import { TaxReturnPackCitEngine } from "../src/services/taxReturnPack/TaxReturnPackCitEngine";
import { TRP_TAX_CATEGORIES } from "../src/services/taxReturnPack/taxReturnPackSupport";

describe("TaxReturnPackCitEngine", () => {
  test("taxable income with add-backs and deductions (Eq. 1)", () => {
    const result = TaxReturnPackCitEngine.compute({
      accountingProfit: 100000,
      expenseLines: [
        {
          lineCode: "ENT",
          lineLabel: "Entertainment",
          glBalance: 5000,
          taxCategory: TRP_TAX_CATEGORIES.ADD_BACK,
        },
        {
          lineCode: "WT",
          lineLabel: "Wear and tear",
          glBalance: 10000,
          taxCategory: TRP_TAX_CATEGORIES.DEDUCT,
        },
      ],
    });
    expect(result.accountingProfit).toBe(100000);
    expect(result.taxableIncome).toBe(95000);
    expect(result.citLiability).toBe(22800);
  });

  test("CIT rate 24% (Eq. 2)", () => {
    const result = TaxReturnPackCitEngine.compute({
      accountingProfit: 50000,
      expenseLines: [],
    });
    expect(result.citLiability).toBe(12000);
  });
});
