// @ts-nocheck
import { prisma } from "../../utils/database";
import { WacCalculatorService } from "./WacCalculatorService";

export class ListedEquityHoldingsService {
  /** Apply buy lot + WAC when custodian confirms (before GL). */
  static async recordBuy(tradeId: string) {
    const trade = await prisma.listedEquityTrade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.side !== "BUY") return null;

    const existingLot = await prisma.listedEquityHoldingLot.findFirst({
      where: { tradeId },
    });
    if (existingLot) return existingLot;

    const qty = Number(trade.quantity);
    const price = Number(trade.executionPrice);
    let holding = await prisma.listedEquityHolding.findUnique({
      where: { fundId_securityId: { fundId: trade.fundId, securityId: trade.securityId } },
    });
    const newWac = WacCalculatorService.computeWac(
      holding ? Number(holding.quantity) : 0,
      holding ? Number(holding.wac) : 0,
      qty,
      price
    );

    holding = await prisma.listedEquityHolding.upsert({
      where: { fundId_securityId: { fundId: trade.fundId, securityId: trade.securityId } },
      create: {
        fundId: trade.fundId,
        securityId: trade.securityId,
        quantity: newWac.quantity,
        wac: newWac.wac,
        wacCurrencyCode: trade.executionCurrencyCode,
      },
      update: {
        quantity: newWac.quantity,
        wac: newWac.wac,
      },
    });

    await prisma.listedEquityHoldingLot.create({
      data: {
        fundId: trade.fundId,
        securityId: trade.securityId,
        tradeId,
        quantity: qty,
        executionPrice: price,
        currencyCode: trade.executionCurrencyCode,
        purchasedAt: trade.executedAt || new Date(),
      },
    });

    return holding;
  }

  /** Reduce quantity on sell when custodian confirms (WAC unchanged). */
  static async recordSell(tradeId: string) {
    const trade = await prisma.listedEquityTrade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.side !== "SELL") return null;

    const holding = await prisma.listedEquityHolding.findUnique({
      where: { fundId_securityId: { fundId: trade.fundId, securityId: trade.securityId } },
    });
    if (!holding) return null;

    const afterSell = WacCalculatorService.applySell(
      Number(holding.quantity),
      Number(trade.quantity),
      Number(holding.wac)
    );
    return prisma.listedEquityHolding.update({
      where: { id: holding.id },
      data: { quantity: afterSell.quantity, wac: afterSell.wac },
    });
  }
}
