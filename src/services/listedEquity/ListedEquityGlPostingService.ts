// @ts-nocheck
import { prisma } from "../../utils/database";
import { createJournalEntryWithAuditSequence } from "../AuditTrailSequenceService";
import { WacCalculatorService } from "./WacCalculatorService";
import { ListedEquityAuditService } from "./ListedEquityAuditService";
import { DEFAULT_COA_MAPPING, type CoaMapping } from "./listedEquityConstants";

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

  static async postSettlement(tradeId: string, hopId: string, userId: string) {
    const trade = await prisma.listedEquityTrade.findUnique({
      where: { id: tradeId },
      include: { security: true, fund: true, settlement: true },
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

    if (trade.side === "BUY") {
      const cost = qty * price;
      const total = cost + fees;
      const lines = [
        { chartOfAccountId: securitiesId, debitAmount: cost, creditAmount: 0, description: "Listed securities buy" },
        { chartOfAccountId: clearingId, debitAmount: 0, creditAmount: total, description: "Bank clearing" },
      ];
      if (fees > 0) {
        // fees included in clearing credit for simplicity
      }
      const debit = lines.reduce((s, l) => s + l.debitAmount, 0);
      const credit = lines.reduce((s, l) => s + l.creditAmount, 0);
      if (Math.abs(debit - credit) > 0.01) {
        await this.failSettlement(tradeId, hopId, "LISTED_EQUITY_JE_IMBALANCED");
        throw new Error("LISTED_EQUITY_JE_IMBALANCED");
      }

      const currency = await prisma.currency.findFirst({ where: { code: trade.executionCurrencyCode } });
      if (!currency) throw new Error("Currency not found");

      const je = await createJournalEntryWithAuditSequence({
        transactionDate: new Date(),
        referenceNumber: `LE-${trade.tradeRef}`,
        description: `Listed equity buy ${trade.security.symbol}`,
        totalAmount: total,
        currencyId: currency.id,
        status: "POSTED",
        createdById: userId,
      });

      for (const l of lines) {
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: je.id,
            chartOfAccountId: l.chartOfAccountId,
            debitAmount: l.debitAmount,
            creditAmount: l.creditAmount,
            description: l.description,
          },
        });
      }

      await this.completeSettlement(tradeId, hopId, je.id, null);
      return je;
    }

    // SELL
    realizedPnl = WacCalculatorService.realizedPnl(qty, price, wac);
    const proceeds = qty * price - fees;
    const costBasis = qty * wac;
    const lines = [
      { chartOfAccountId: clearingId, debitAmount: proceeds, creditAmount: 0, description: "Bank clearing" },
      { chartOfAccountId: securitiesId, debitAmount: 0, creditAmount: costBasis, description: "Securities at WAC" },
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
    if (Math.abs(debit - credit) > 0.01) {
      await this.failSettlement(tradeId, hopId, "LISTED_EQUITY_JE_IMBALANCED");
      throw new Error("LISTED_EQUITY_JE_IMBALANCED");
    }

    const currency = await prisma.currency.findFirst({ where: { code: trade.executionCurrencyCode } });
    if (!currency) throw new Error("Currency not found");

    const je = await createJournalEntryWithAuditSequence({
      transactionDate: new Date(),
      referenceNumber: `LE-${trade.tradeRef}`,
      description: `Listed equity sell ${trade.security.symbol}`,
      totalAmount: Math.max(debit, credit),
      currencyId: currency.id,
      status: "POSTED",
      createdById: userId,
    });

    for (const l of lines) {
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: je.id,
          chartOfAccountId: l.chartOfAccountId,
          debitAmount: l.debitAmount,
          creditAmount: l.creditAmount,
          description: l.description,
        },
      });
    }

    await this.completeSettlement(tradeId, hopId, je.id, realizedPnl);
    return je;
  }

  static async completeSettlement(tradeId: string, hopId: string, journalEntryId: string, realizedPnl: number | null) {
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
    await ListedEquityAuditService.log("TRADE_GL_POSTED", "ListedEquityTrade", tradeId, { journalEntryId });
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
