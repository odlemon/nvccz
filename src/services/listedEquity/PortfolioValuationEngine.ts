// @ts-nocheck
import { prisma } from "../../utils/database";
import { resolveUsdZwgWithSource } from "../UsdZwgRateResolver";
import { WacCalculatorService } from "./WacCalculatorService";
import { ListedEquityAuditService } from "./ListedEquityAuditService";

export class PortfolioValuationEngine {
  static async latestApprovedPrice(securityId: string): Promise<number | null> {
    const tick = await prisma.listedEquityPriceTick.findFirst({
      where: { securityId, validationStatus: "APPROVED" },
      orderBy: { pricedAt: "desc" },
    });
    return tick ? Number(tick.price) : null;
  }

  static async recalcForSecurities(securityIds: string[]) {
    const holdings = await prisma.listedEquityHolding.findMany({
      where: { securityId: { in: securityIds } },
      include: { security: true },
    });
    const fundIds = [...new Set(holdings.map((h) => h.fundId))];
    for (const fundId of fundIds) {
      await this.runFundValuation(fundId);
    }
  }

  static async runFundValuation(fundId: string) {
    const holdings = await prisma.listedEquityHolding.findMany({
      where: { fundId },
      include: { security: true },
    });
    const fx = await resolveUsdZwgWithSource(prisma);
    const fxRate = fx?.source === "zimrate" ? fx.row?.avg : fx?.rate;
    const fxSource = fx?.source === "zimrate" ? "ZIMRATE" : fx ? "STORED" : null;
    const status = fxRate ? "OK" : "FX_MISSING";

    let nav = 0;
    let unrealizedUsd = 0;
    let unrealizedZig = 0;

    for (const h of holdings) {
      const price = await this.latestApprovedPrice(h.securityId);
      if (price == null) continue;
      const qty = Number(h.quantity);
      const wac = Number(h.wac);
      const marketValue = qty * price;
      nav += marketValue;
      const pnl = WacCalculatorService.unrealizedPnl(qty, price, wac);
      unrealizedUsd += pnl;
      if (fxRate) unrealizedZig += pnl / fxRate;
      await prisma.listedEquityHolding.update({
        where: { id: h.id },
        data: { lastValuationAt: new Date() },
      });
    }

    const snap = await prisma.listedEquityValuationSnapshot.create({
      data: {
        fundId,
        asOf: new Date(),
        navBaseCurrency: nav,
        unrealizedPnlUsd: unrealizedUsd,
        unrealizedPnlZig: unrealizedZig,
        fxRateUsed: fxRate ?? null,
        fxRateSource: fxSource,
        status,
      },
    });

    await ListedEquityAuditService.log(
      "VALUATION_SNAPSHOT_CREATED",
      "ListedEquityValuationSnapshot",
      snap.id,
      { fundId, nav, status }
    );

    return snap;
  }
}
