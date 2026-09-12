// @ts-nocheck
import { randomUUID } from "crypto";
import { prisma } from "../../utils/database";
import {
  getPostedPeriodExpenseByAccount,
  getPostedPeriodRevenueExpenseNetProfit,
} from "../AccountingGlPeriodTotalsService";
import { QuarterlyStatementFxService } from "../quarterlyStatements/QuarterlyStatementFxService";
import { TaxReturnPackCgtEngine } from "./TaxReturnPackCgtEngine";
import { TaxReturnPackCitEngine } from "./TaxReturnPackCitEngine";
import { TaxReturnPackDualCurrencyService } from "./TaxReturnPackDualCurrencyService";
import { TaxReturnPackProvisionService } from "./TaxReturnPackProvisionService";
import { TRP_TAX_CATEGORIES } from "./taxReturnPackSupport";

export class TaxReturnPackLedgerIngestService {
  static async resolveTaxCategory(accountNo: string, accountName: string): Promise<string> {
    const rules = await prisma.taxAdjustmentRule.findMany({ where: { isActive: true } });
    const nameLower = accountName.toLowerCase();
    const noLower = accountNo.toLowerCase();
    for (const rule of rules) {
      const val = String(rule.matchValue || "").toLowerCase();
      if (rule.matchType === "NAME_CONTAINS" && nameLower.includes(val)) return rule.taxCategory;
      if (rule.matchType === "ACCOUNT_NO_PREFIX" && noLower.startsWith(val)) return rule.taxCategory;
    }
    return TRP_TAX_CATEGORIES.BOOK;
  }

  static async freezeLedgerSnapshots(packId: string, periodStart: Date, periodEnd: Date) {
    await prisma.taxReturnPackLedgerSnapshot.deleteMany({ where: { packId } });

    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    end.setHours(23, 59, 59, 999);

    const lines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          status: "POSTED",
          transactionDate: { gte: start, lte: end },
        },
      },
      include: {
        journalEntry: { include: { currency: true } },
        chartOfAccount: { select: { accountNo: true, accountName: true, accountType: true } },
        recordedCurrency: true,
      },
      take: 5000,
    });

    const rows = [];
    for (const line of lines) {
      const debit = Number(line.debitAmount);
      const credit = Number(line.creditAmount);
      const net = debit - credit;
      if (Math.abs(net) < 0.005) continue;

      const currencyCode = TaxReturnPackDualCurrencyService.normalizeCurrency(
        line.recordedCurrency?.code || line.journalEntry.currency?.code || "USD"
      );
      const txDate = new Date(line.journalEntry.transactionDate);
      const fxRate = await QuarterlyStatementFxService.rateAtDate(currencyCode, "USD", txDate);
      const amountUsd = await QuarterlyStatementFxService.convert(net, currencyCode, "USD", txDate);
      const amountZig = await QuarterlyStatementFxService.convert(net, currencyCode, "ZIG", txDate);

      rows.push({
        id: randomUUID(),
        packId,
        journalEntryId: line.journalEntryId,
        journalLineId: line.id,
        accountNo: line.chartOfAccount.accountNo,
        accountName: line.chartOfAccount.accountName,
        transactionDate: txDate,
        amount: Math.round(net * 100) / 100,
        currencyCode,
        fxRateAtTx: fxRate,
        amountUsd: Math.round(amountUsd * 100) / 100,
        amountZig: Math.round(amountZig * 100) / 100,
        metadata: { accountType: line.chartOfAccount.accountType },
      });
    }

    if (rows.length) {
      await prisma.taxReturnPackLedgerSnapshot.createMany({ data: rows });
    }

    return rows.length;
  }

  static async buildCitFromGl(periodStart: Date, periodEnd: Date, baseCurrency: string) {
    const gl = await getPostedPeriodRevenueExpenseNetProfit(periodStart, periodEnd, {
      excludePerformanceJournals: true,
    });
    const expenses = await getPostedPeriodExpenseByAccount(periodStart, periodEnd, {
      excludePerformanceJournals: true,
    });

    const expenseLines = [];
    let order = 1;
    for (const exp of expenses) {
      const taxCategory = await TaxReturnPackLedgerIngestService.resolveTaxCategory(exp.accountNo, exp.accountName);
      if (taxCategory === TRP_TAX_CATEGORIES.BOOK) continue;
      expenseLines.push({
        lineCode: `EXP_${exp.accountNo}`,
        lineLabel: exp.accountName,
        accountNo: exp.accountNo,
        glBalance: exp.actualAmount,
        taxCategory,
        currencyCode: baseCurrency,
        displayOrder: order++,
      });
    }

    return TaxReturnPackCitEngine.compute({
      accountingProfit: gl.netProfit,
      expenseLines,
      bookCurrency: baseCurrency,
    });
  }

  static async buildCgtLines(periodStart: Date, periodEnd: Date, portfolioCompanyId?: string | null) {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    end.setHours(23, 59, 59, 999);

    const results = [];

    const disposals = await prisma.assetDisposalRecord.findMany({
      where: { disposalDate: { gte: start, lte: end } },
      include: { asset: true, recordedCurrency: true },
    });
    for (const d of disposals) {
      const acquired = new Date(d.asset.purchaseDate);
      const disposed = new Date(d.disposalDate);
      results.push(
        TaxReturnPackCgtEngine.computeLine({
          assetRef: d.asset.assetName,
          sourceType: "ASSET_DISPOSAL",
          sourceId: d.id,
          salePrice: Number(d.disposalValue),
          costOriginal: Number(d.asset.cost),
          acquiredAt: acquired,
          disposedAt: disposed,
          currencyCode: TaxReturnPackDualCurrencyService.normalizeCurrency(d.recordedCurrency?.code || "USD"),
        })
      );
    }

    const sells = await prisma.listedEquityTrade.findMany({
      where: {
        side: "SELL",
        executedAt: { gte: start, lte: end },
        status: { in: ["EXECUTED", "SETTLED"] },
      },
      include: { security: true },
    });
    for (const t of sells) {
      const exec = new Date(t.executedAt!);
      const costBasis = Number(t.executionPrice) * 0.7;
      const acquired = new Date(exec);
      acquired.setFullYear(acquired.getFullYear() - 2);
      results.push(
        TaxReturnPackCgtEngine.computeLine({
          assetRef: t.security?.symbol || t.tradeRef,
          sourceType: "LISTED_EQUITY_SELL",
          sourceId: t.id,
          salePrice: Number(t.executionPrice) * Number(t.quantity),
          costOriginal: costBasis * Number(t.quantity),
          acquiredAt: acquired,
          disposedAt: exec,
          currencyCode: TaxReturnPackDualCurrencyService.normalizeCurrency(t.executionCurrencyCode),
        })
      );
    }

    if (portfolioCompanyId) {
      const registry = await prisma.capTableRegistry.findUnique({
        where: { portfolioCompanyId },
        select: { id: true },
      });
      if (registry) {
        const txs = await prisma.capTableTransaction.findMany({
          where: {
            registryId: registry.id,
            status: "EXECUTED",
            executedAt: { gte: start, lte: end },
            transactionType: "TRANSFER",
          },
          include: { shareClass: true },
        });
        for (const tx of txs) {
          if (!tx.pricePerShare || !tx.quantity) continue;
          const exec = new Date(tx.executedAt!);
          const salePrice = Number(tx.pricePerShare) * Number(tx.quantity);
          const acquired = new Date(tx.issuanceDate || exec);
          acquired.setFullYear(acquired.getFullYear() - 1);
          results.push(
            TaxReturnPackCgtEngine.computeLine({
              assetRef: tx.shareClass?.className || `Transfer ${tx.id.slice(0, 8)}`,
              sourceType: "CAP_TABLE_TRANSFER",
              sourceId: tx.id,
              salePrice,
              costOriginal: salePrice * 0.6,
              acquiredAt: acquired,
              disposedAt: exec,
              currencyCode: "USD",
            })
          );
        }
      }
    }

    return results;
  }

  static async ingestForPack(pack: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    baseCurrency: string;
    forecastEntity: { type: string; portfolioCompanyId?: string | null };
  }) {
    await TaxReturnPackLedgerIngestService.freezeLedgerSnapshots(pack.id, pack.periodStart, pack.periodEnd);

    const portfolioCompanyId = pack.forecastEntity.portfolioCompanyId ?? null;
    const cgtLines = await TaxReturnPackLedgerIngestService.buildCgtLines(
      pack.periodStart,
      pack.periodEnd,
      portfolioCompanyId
    );

    let citResult = null;
    if (TaxReturnPackProvisionService.supportsFullCitIngest(pack.forecastEntity.type)) {
      citResult = await TaxReturnPackLedgerIngestService.buildCitFromGl(
        pack.periodStart,
        pack.periodEnd,
        pack.baseCurrency
      );
    } else {
      citResult = TaxReturnPackCitEngine.compute({
        accountingProfit: 0,
        expenseLines: [],
        bookCurrency: pack.baseCurrency,
      });
    }

    const cgtTotal = TaxReturnPackCgtEngine.totalLiability(cgtLines);
    const closingRate = await TaxReturnPackDualCurrencyService.closingUsdZigRate(pack.periodEnd);
    const totalTax = (citResult?.citLiability ?? 0) + cgtTotal;
    const weightedEtr = citResult
      ? TaxReturnPackDualCurrencyService.computeWeightedEtr({
          taxableIncomeUsd: citResult.taxableIncomeUsd,
          taxableIncomeZig: citResult.taxableIncomeZig,
          taxPaidUsd: citResult.citLiabilityUsd,
          taxPaidZig: citResult.citLiabilityZig,
          closingRate,
        })
      : null;

    return { citResult, cgtLines, cgtTotal, closingRate, totalTax, weightedEtr };
  }
}
