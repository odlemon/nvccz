// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityAuditService } from "./ListedEquityAuditService";
import { DEFAULT_COA_MAPPING } from "./listedEquityConstants";

export class CoreBankingBridgeService {
  static async placeHold(tradeId: string, hopId: string) {
    const trade = await prisma.listedEquityTrade.findUnique({
      where: { id: tradeId },
      include: { fund: { include: { listedEquityFundConfig: true } } },
    });
    if (!trade) throw new Error("Trade not found");
    if (trade.side !== "BUY") {
      await prisma.listedEquityTradeRoutingHop.update({
        where: { id: hopId },
        data: { status: "CONFIRMED", confirmedAt: new Date(), dispatchedAt: new Date() },
      });
      return null;
    }

    const bankId = trade.fund.listedEquityFundConfig?.trustBankId;
    if (!bankId) throw new Error("Fund trust bank not configured");

    const amount = Number(trade.quantity) * Number(trade.executionPrice) + Number(trade.fees);
    const hold = await prisma.listedEquityCashHold.create({
      data: {
        tradeId,
        fundId: trade.fundId,
        bankId,
        amount,
        currencyCode: trade.executionCurrencyCode,
        status: "PLACED",
      },
    });

    let cashbookEntryId: string | null = null;
    const createdById = trade.executedById;
    if (createdById) {
      const coaMapping = (trade.fund.listedEquityFundConfig?.coaMappingJson as Record<string, string>) || {};
      const clearingCode = coaMapping.bankClearing || DEFAULT_COA_MAPPING.bankClearing;
      const glAccount = await prisma.chartOfAccounts.findFirst({ where: { accountNo: clearingCode } });
      const cashbookEntry = await prisma.cashbookEntry.create({
        data: {
          bankId,
          transactionDate: new Date(),
          description: `Listed equity buy hold — ${trade.tradeRef}`,
          amount,
          type: "PAYMENT",
          reference: `LE-HOLD-${trade.tradeRef}`,
          status: "PENDING",
          counterpartyType: "GL",
          glAccountId: glAccount?.id,
          createdById,
        },
      });
      cashbookEntryId = cashbookEntry.id;
      await prisma.listedEquityTradeSettlement.upsert({
        where: { tradeId },
        create: { tradeId, cashbookEntryId },
        update: { cashbookEntryId },
      });
    }

    await prisma.listedEquityTradeRoutingHop.update({
      where: { id: hopId },
      data: {
        status: "DISPATCHED",
        dispatchedAt: new Date(),
        attemptCount: { increment: 1 },
        externalRef: hold.id,
        payloadRef: cashbookEntryId ? JSON.stringify({ cashbookEntryId, holdId: hold.id }) : hold.id,
      },
    });

    await ListedEquityAuditService.log("CASH_HOLD_PLACED", "ListedEquityCashHold", hold.id, {
      tradeId,
      amount,
      bankId,
      cashbookEntryId,
    });

    if (process.env.LISTED_EQUITY_AUTO_CONFIRM_STAKEHOLDER === "true") {
      await this.releaseHold(tradeId, hopId);
    }

    return hold;
  }

  static async releaseHold(tradeId: string, hopId: string) {
    const holds = await prisma.listedEquityCashHold.findMany({
      where: { tradeId, status: "PLACED" },
    });
    for (const hold of holds) {
      await prisma.listedEquityCashHold.update({
        where: { id: hold.id },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
      await ListedEquityAuditService.log("CASH_HOLD_RELEASED", "ListedEquityCashHold", hold.id, { tradeId });
    }

    const settlement = await prisma.listedEquityTradeSettlement.findUnique({ where: { tradeId } });
    if (settlement?.cashbookEntryId) {
      await prisma.cashbookEntry.update({
        where: { id: settlement.cashbookEntryId },
        data: { status: "POSTED", postedAt: new Date() },
      });
    }

    await prisma.listedEquityTradeRoutingHop.update({
      where: { id: hopId },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
  }
}
