// @ts-nocheck
import { TRP_STATUTORY, TRP_TAX_CATEGORIES, roundMoney } from "./taxReturnPackSupport";

export type ReconciliationLineInput = {
  lineCode: string;
  lineLabel: string;
  accountNo?: string | null;
  glBalance: number;
  taxCategory: string;
  currencyCode?: string;
  journalLineRefs?: string[];
  displayOrder?: number;
};

export type CitComputeResult = {
  accountingProfit: number;
  taxableIncome: number;
  citLiability: number;
  addBacks: number;
  deductions: number;
  taxableIncomeUsd: number;
  taxableIncomeZig: number;
  citLiabilityUsd: number;
  citLiabilityZig: number;
  lines: Array<{
    lineCode: string;
    lineLabel: string;
    accountNo: string | null;
    glBalance: number;
    taxAdjustment: number;
    taxCategory: string;
    currencyCode: string;
    journalLineRefs?: string[];
    displayOrder: number;
  }>;
};

export class TaxReturnPackCitEngine {
  static computeTaxAdjustment(glBalance: number, taxCategory: string): number {
    const cat = String(taxCategory || TRP_TAX_CATEGORIES.BOOK).toUpperCase();
    if (cat === TRP_TAX_CATEGORIES.ADD_BACK) return roundMoney(Math.abs(glBalance));
    if (cat === TRP_TAX_CATEGORIES.DEDUCT) return roundMoney(-Math.abs(glBalance));
    if (cat === TRP_TAX_CATEGORIES.EXEMPT) return roundMoney(-Math.abs(glBalance));
    return 0;
  }

  static compute(input: {
    accountingProfit: number;
    expenseLines: ReconciliationLineInput[];
    bookCurrency?: string;
  }): CitComputeResult {
    const bookCurrency = input.bookCurrency || "USD";
    let addBacks = 0;
    let deductions = 0;

    const lines: CitComputeResult["lines"] = [
      {
        lineCode: "NET_INCOME_BOOK",
        lineLabel: "Net Income (Book)",
        accountNo: null,
        glBalance: roundMoney(input.accountingProfit),
        taxAdjustment: 0,
        taxCategory: TRP_TAX_CATEGORIES.BOOK,
        currencyCode: bookCurrency,
        displayOrder: 0,
      },
    ];

    let order = 1;
    for (const row of input.expenseLines) {
      const adj = TaxReturnPackCitEngine.computeTaxAdjustment(row.glBalance, row.taxCategory);
      if (row.taxCategory === TRP_TAX_CATEGORIES.ADD_BACK) addBacks += adj;
      if (row.taxCategory === TRP_TAX_CATEGORIES.DEDUCT || row.taxCategory === TRP_TAX_CATEGORIES.EXEMPT) {
        deductions += Math.abs(adj);
      }
      lines.push({
        lineCode: row.lineCode,
        lineLabel: row.lineLabel,
        accountNo: row.accountNo ?? null,
        glBalance: roundMoney(row.glBalance),
        taxAdjustment: adj,
        taxCategory: row.taxCategory,
        currencyCode: row.currencyCode || bookCurrency,
        journalLineRefs: row.journalLineRefs,
        displayOrder: row.displayOrder ?? order++,
      });
    }

    const taxableIncome = roundMoney(input.accountingProfit + addBacks - deductions);
    const citLiability = roundMoney(taxableIncome * TRP_STATUTORY.CIT_RATE);

    const usdLines = lines.filter((l) => l.currencyCode === "USD" || l.currencyCode === "US$");
    const zigLines = lines.filter((l) => l.currencyCode === "ZIG" || l.currencyCode === "ZWG" || l.currencyCode === "ZWL");

    const sumTaxable = (subset: typeof lines) => {
      let base = subset.some((l) => l.lineCode === "NET_INCOME_BOOK") ? input.accountingProfit : 0;
      for (const l of subset) {
        if (l.lineCode === "NET_INCOME_BOOK") continue;
        base += l.taxAdjustment;
      }
      return roundMoney(base);
    };

    const taxableIncomeUsd = usdLines.length ? sumTaxable(usdLines) : taxableIncome;
    const taxableIncomeZig = zigLines.length ? sumTaxable(zigLines) : 0;
    const citLiabilityUsd = roundMoney(taxableIncomeUsd * TRP_STATUTORY.CIT_RATE);
    const citLiabilityZig = roundMoney(taxableIncomeZig * TRP_STATUTORY.CIT_RATE);

    return {
      accountingProfit: roundMoney(input.accountingProfit),
      taxableIncome,
      citLiability,
      addBacks: roundMoney(addBacks),
      deductions: roundMoney(deductions),
      taxableIncomeUsd,
      taxableIncomeZig,
      citLiabilityUsd,
      citLiabilityZig,
      lines,
    };
  }
}
