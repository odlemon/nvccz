// @ts-nocheck
import { prisma } from "../../utils/database";
import { TradeOrchestratorService } from "./TradeOrchestratorService";

export class TradeRoutingRetryCronService {
  static async retryFailedRouting() {
    // Only auto-retry true failures — DISPATCHED hops are awaiting manual stakeholder confirm.
    const due = await prisma.listedEquityTradeRoutingHop.findMany({
      where: {
        status: { in: ["RETRYING", "FAILED"] },
        confirmedAt: null,
        trade: { status: { notIn: ["SETTLED", "CANCELLED"] } },
        OR: [{ nextRetryAt: { lte: new Date() } }, { nextRetryAt: null }],
      },
      take: 25,
      include: { trade: true },
    });

    const results = [];
    for (const hop of due) {
      if (hop.status === "FAILED" && hop.attemptCount >= 5) {
        results.push({ hopId: hop.id, skipped: true, reason: "max attempts" });
        continue;
      }
      try {
        await prisma.listedEquityTradeRoutingHop.update({
          where: { id: hop.id },
          data: { status: "STAGED" },
        });
        await TradeOrchestratorService.processRouting(
          hop.tradeId,
          hop.trade.executedById || ""
        );
        results.push({ hopId: hop.id, ok: true, tradeId: hop.tradeId });
      } catch (e: any) {
        results.push({ hopId: hop.id, ok: false, error: e.message });
      }
    }
    return { processed: results.length, results };
  }
}
