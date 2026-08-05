// @ts-nocheck
import { prisma } from "../../utils/database";
import { createJournalEntryWithAuditSequence } from "../AuditTrailSequenceService";
import { WacCalculatorService } from "./WacCalculatorService";
import { ListedEquityAuditService } from "./ListedEquityAuditService";
import { InvestmentAccountingFacadeService } from "../investmentOps/InvestmentAccountingFacadeService";
import { DEFAULT_COA_MAPPING, type CoaMapping } from "./listedEquityConstants";
import { resolveJournalCurrency } from "./listedEquityCurrency";

export class ListedEquityGlPostingService {
  static async resolveCoa(fundId: string): Promise<CoaMapping> {
    const cfg = await prisma.listedEquityFundConfig.findUnique({ where: { fundId } });
    const mapping = (cfg?.coaMappingJson as CoaMapping) || {};
    return { ...DEFAULT_COA_MAPPING, ...mapping };
  }

  static async findAccountId(code: string): Promise<string> {
    const acct = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: code },
    });
    if (!acct) throw new Error(`COA account ${code} not found`);
    return acct.id;
  }

  /** Avoid journal_entries_referenceNumber_key on re-settle after reversal. */
  static async resolveSettlementJournalRef(tradeId: string, tradeRef: string): Promise<string> {
    const baseRef = `LE-${tradeRef}`;
    const existing = await prisma.journalEntry.findFirst({ where: { referenceNumber: baseRef } });
    if (!existing) return baseRef;

    const glEvent = await prisma.investmentAccountingEvent.findUnique({
      where: { id: `${tradeId}-gl` },
    });
    if (!glEvent || glEvent.status === "REVERSED") {
      let n = 2;
      while (n < 1000) {
        const candidate = `${baseRef}-${n}`;
        const taken = await prisma.journalEntry.findFirst({ where: { referenceNumber: candidate } });
        if (!taken) return candidate;
        n += 1;
      }
      return `${baseRef}-${Date.now()}`;
    }

    return baseRef;
  }

  static async postSettlement(tradeId: string, hopId: string, userId: string) {
    const trade = await prisma.listedEquityTrade.findUnique({
      where: { id: tradeId },
      include: { security: true, fund: { include: { listedEquityFundConfig: true } }, settlement: true },
    });
    if (!trade) throw new Error("Trade not found");

    if (trade.settlement?.journalEntryId) {
      await this.completeSettlement(
        tradeId,
        hopId,
        trade.settlement.journalEntryId,
        trade.settlement.realizedPnl != null ? Number(trade.settlement.realizedPnl) : null
      );
      return prisma.journalEntry.findUnique({ where: { id: trade.settlement.journalEntryId } });
    }

    const baseRef = `LE-${trade.tradeRef}`;
    const orphanedJe = await prisma.journalEntry.findFirst({ where: { referenceNumber: baseRef } });
    const glEvent = await prisma.investmentAccountingEvent.findUnique({
      where: { id: `${tradeId}-gl` },
    });
    if (orphanedJe && glEvent?.status !== "REVERSED") {
      await this.completeSettlement(
        tradeId,
        hopId,
        orphanedJe.id,
        trade.settlement?.realizedPnl != null ? Number(trade.settlement.realizedPnl) : null
      );
      return orphanedJe;
    }

    const referenceNumber = await this.resolveSettlementJournalRef(tradeId, trade.tradeRef);

    const coa = await this.resolveCoa(trade.fundId);
    const securitiesId = await this.findAccountId(coa.listedSecuritiesAsset);
    const clearingId = await this.findAccountId(coa.bankClearing);

    const qty = Number(trade.quantity);
    const price = Number(trade.executionPrice);
    const fees = Number(trade.fees);

    let holding = await prisma.listedEquityHolding.findUnique({
      where: { fundId_securityId: { fundId: trade.fundId, securityId: trade.securityId } },
    });
    const wac = holding ? Number(holding.wac) : 0;
    let realizedPnl: number | null = null;
    let lines: Array<{
      chartOfAccountId: string;
      debitAmount: number;
      creditAmount: number;
      description: string;
    }>;
    let totalAmount: number;

    if (trade.side === "BUY") {
      const cost = qty * price;
      const total = cost + fees;
      totalAmount = total;
      // Capitalize fees into asset cost so debit=credit without requiring a fee expense COA.
      lines = [
        {
          chartOfAccountId: securitiesId,
          debitAmount: total,
          creditAmount: 0,
          description: fees > 0 ? "Listed securities buy (incl. fees)" : "Listed securities buy",
        },
        {
          chartOfAccountId: clearingId,
          debitAmount: 0,
          creditAmount: total,
          description: "Bank clearing",
        },
      ];
    } else {
      realizedPnl = WacCalculatorService.realizedPnl(qty, price, wac);
      const proceeds = qty * price - fees;
      const costBasis = qty * wac;
      lines = [
        {
          chartOfAccountId: clearingId,
          debitAmount: proceeds,
          creditAmount: 0,
          description: "Bank clearing",
        },
        {
          chartOfAccountId: securitiesId,
          debitAmount: 0,
          creditAmount: costBasis,
          description: "Securities at WAC",
        },
      ];
      if (realizedPnl > 0) {
        const gainId = await this.findAccountId(coa.realizedGain);
        lines.push({
          chartOfAccountId: gainId,
          debitAmount: 0,
          creditAmount: realizedPnl,
          description: "Realized gain",
        });
      } else if (realizedPnl < 0) {
        const lossId = await this.findAccountId(coa.realizedLoss);
        lines.push({
          chartOfAccountId: lossId,
          debitAmount: Math.abs(realizedPnl),
          creditAmount: 0,
          description: "Realized loss",
        });
      }
      const debit = lines.reduce((s, l) => s + l.debitAmount, 0);
      const credit = lines.reduce((s, l) => s + l.creditAmount, 0);
      totalAmount = Math.max(debit, credit);
    }

    const debit = lines.reduce((s, l) => s + l.debitAmount, 0);
    const credit = lines.reduce((s, l) => s + l.creditAmount, 0);
    if (Math.abs(debit - credit) > 0.01) {
      await this.failSettlement(tradeId, hopId, "LISTED_EQUITY_JE_IMBALANCED");
      throw new Error("LISTED_EQUITY_JE_IMBALANCED");
    }

    const currency = await resolveJournalCurrency(
      trade.executionCurrencyCode,
      trade.fund?.baseCurrencyCode ?? trade.fund?.listedEquityFundConfig?.baseCurrencyCode
    );

    try {
      const je = await createJournalEntryWithAuditSequence({
        transactionDate: new Date(),
        referenceNumber,
        description: `Listed equity ${trade.side.toLowerCase()} ${trade.security.symbol}`,
        totalAmount,
        currencyId: currency.id,
        status: "POSTED",
        createdById: userId,
      });

      return await InvestmentAccountingFacadeService.commitSettlementBundle({
        tradeId,
        hopId,
        userId,
        journalEntryId: je.id,
        realizedPnl,
        lines,
      });
    } catch (error: any) {
      await this.failSettlement(tradeId, hopId, error?.code || error?.message || "SETTLEMENT_FAILED");
      throw error;
    }
  }

  static async completeSettlement(
    tradeId: string,
    hopId: string,
    journalEntryId: string,
    realizedPnl: number | null
  ) {
    await prisma.listedEquityTradeSettlement.upsert({
      where: { tradeId },
      create: { tradeId, journalEntryId, realizedPnl },
      update: { journalEntryId, realizedPnl },
    });
    await prisma.listedEquityTradeRoutingHop.update({
      where: { id: hopId },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    await prisma.listedEquityTrade.update({
      where: { id: tradeId },
      data: { status: "SETTLED", settledAt: new Date() },
    });
    await ListedEquityAuditService.log("TRADE_GL_POSTED", "ListedEquityTrade", tradeId, {
      journalEntryId,
    });
    const trade = await prisma.listedEquityTrade.findUnique({ where: { id: tradeId } });
    if (trade) {
      await InvestmentAccountingFacadeService.recordFromTradeSettlement(
        trade.fundId,
        tradeId,
        trade.tradeRef,
        journalEntryId,
        realizedPnl
      );
    }
  }

  static async failSettlement(tradeId: string, hopId: string, error: string) {
    await prisma.listedEquityTradeRoutingHop.update({
      where: { id: hopId },
      data: { status: "FAILED", lastError: error },
    });
    await prisma.listedEquityTrade.update({
      where: { id: tradeId },
      data: { status: "SETTLEMENT_FAILED" },
    });
    await ListedEquityAuditService.log("TRADE_GL_FAILED", "ListedEquityTrade", tradeId, { error });
  }
}
