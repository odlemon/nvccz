// @ts-nocheck
import VATReportService from "../VATReportService";
import { TRP_TAX_CATEGORIES, roundMoney } from "./taxReturnPackSupport";

/**
 * VAT return pack compile path.
 *
 * Reuses VATReportService.generateVATReport() — the exact same GL aggregation query that powers
 * GET /api/vat/report — instead of re-deriving VAT totals. VATReportService aggregates every posted
 * (and pending) journal line hitting the VAT Output / VAT Input control accounts for a period; this
 * service just reshapes that result into the TaxReturnPack reconciliation-line/liability shape so the
 * pack can flow through the same provision -> compile -> reconciliation -> submit-review -> sign-off
 * scaffold as a CIT pack.
 */
export class TaxReturnPackVatCompileService {
  static async compileForPack(pack: { periodStart: Date; periodEnd: Date; baseCurrency: string }) {
    // Match TaxReturnPackLedgerIngestService's convention: periodEnd on the pack is stored at
    // midnight UTC, so it must be bumped to end-of-day or the last day's journals are silently excluded.
    const start = new Date(pack.periodStart);
    const end = new Date(pack.periodEnd);
    end.setHours(23, 59, 59, 999);

    const report = await VATReportService.generateVATReport({ startDate: start, endDate: end });

    const [outputAccount, inputAccount] = await Promise.all([
      VATReportService.getVATOutputAccount(),
      VATReportService.getVATInputAccount(),
    ]);

    const outputTax = roundMoney(report.summary.totalOutputTax);
    const inputTax = roundMoney(report.summary.totalInputTax);
    const netPayable = roundMoney(report.summary.netLiability);

    const reconciliationLines = [
      {
        lineCode: "VAT_OUTPUT",
        lineLabel: `${outputAccount.accountName} (${outputAccount.accountNo})`,
        accountNo: outputAccount.accountNo,
        glBalance: outputTax,
        taxAdjustment: 0,
        taxCategory: TRP_TAX_CATEGORIES.OUTPUT_TAX,
        currencyCode: pack.baseCurrency,
        journalLineRefs: report.outputTax.transactions.map((t) => t.journalEntryLineId).filter(Boolean),
        displayOrder: 1,
      },
      {
        lineCode: "VAT_INPUT",
        lineLabel: `${inputAccount.accountName} (${inputAccount.accountNo})`,
        accountNo: inputAccount.accountNo,
        glBalance: inputTax,
        taxAdjustment: 0,
        taxCategory: TRP_TAX_CATEGORIES.INPUT_TAX,
        currencyCode: pack.baseCurrency,
        journalLineRefs: report.inputTax.transactions.map((t) => t.journalEntryLineId).filter(Boolean),
        displayOrder: 2,
      },
    ];

    return {
      reconciliationLines,
      cgtLines: [],
      packUpdateData: {
        vatOutputTax: outputTax,
        vatInputTax: inputTax,
        vatNetPayable: netPayable,
        // Reused generic "bottom line" field so the dashboard/PDF/GL-post amount-gate logic that
        // already reads totalTaxLiability keeps working unchanged for VAT packs.
        totalTaxLiability: netPayable,
        liabilitySnapshot: {
          vat: {
            outputTax,
            inputTax,
            netPayable,
            outputTransactionCount: report.outputTax.transactionCount,
            inputTransactionCount: report.inputTax.transactionCount,
            breakdown: report.breakdown,
            sourceReportPeriod: report.period,
          },
        },
      },
      auditDetails: {
        vatOutputTax: outputTax,
        vatInputTax: inputTax,
        vatNetPayable: netPayable,
        reconciliationLineCount: reconciliationLines.length,
      },
    };
  }
}
