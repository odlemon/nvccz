// @ts-nocheck
import { prisma } from "../../utils/database";

/** FIFO cost basis from settled BUY lots (simplified lot queue per security). */
export class InvestmentFifoCostService {
  static async costBasis(
    fundId: string,
    securityId: string,
    quantity: number
  ): Promise<{ wac: number; method: "FIFO" }> {
    const buys = await prisma.listedEquityTrade.findMany({
      where: { fundId, securityId, side: "BUY", status: "SETTLED" },
      orderBy: { createdAt: "asc" },
    });
    let remaining = quantity;
    let totalCost = 0;
    let filled = 0;
    for (const t of buys) {
      if (remaining <= 0) break;
      const lotQty = Number(t.quantity);
      const take = Math.min(remaining, lotQty);
      totalCost += take * Number(t.executionPrice);
      filled += take;
      remaining -= take;
    }
    const wac = filled > 0 ? totalCost / filled : 0;
    return { wac, method: "FIFO" };
  }
}
