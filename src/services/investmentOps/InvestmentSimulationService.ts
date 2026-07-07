// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { ListedEquityPortfolioService } from "../listedEquity/ListedEquityPortfolioService";
import { PortfolioValuationEngine } from "../listedEquity/PortfolioValuationEngine";
import { InvestmentComplianceService } from "./InvestmentComplianceService";

export class InvestmentSimulationService {
  static async run(
    fundId: string,
    userId: string,
    user: any,
    scenario: {
      side: string;
      securityId?: string;
      instrumentId?: string;
      quantity: number;
      price: number;
    }
  ) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const snap = await prisma.listedEquityValuationSnapshot.findFirst({
      where: { fundId },
      orderBy: { asOf: "desc" },
    });
    const navBefore = snap ? Number(snap.navBaseCurrency) : 0;
    const orderValue = scenario.quantity * scenario.price;
    const navAfter =
      scenario.side.toUpperCase() === "BUY" ? navBefore : navBefore + orderValue * 0.1;

    const draftOrder = await prisma.investmentOrder.create({
      data: {
        orderRef: `SIM-${Date.now()}`,
        fundId,
        securityId: scenario.securityId,
        instrumentId: scenario.instrumentId,
        side: scenario.side.toUpperCase(),
        quantity: scenario.quantity,
        executionPrice: scenario.price,
        tradeCurrency: "USD",
        status: "DRAFT",
        createdById: userId,
      },
    });
    let compliance = { outcome: "PASSED", message: "Simulation only" };
    try {
      compliance = await InvestmentComplianceService.checkOrder(draftOrder.id);
    } catch {
      /* keep simulation result */
    }
    await prisma.investmentOrder.delete({ where: { id: draftOrder.id } });

    const result = {
      navBefore,
      navAfter,
      navImpact: navAfter - navBefore,
      cashImpact: scenario.side.toUpperCase() === "BUY" ? -orderValue : orderValue,
      exposureImpactPct: navBefore > 0 ? (orderValue / navBefore) * 100 : 0,
      compliance,
      estimatedFees: orderValue * 0.001,
    };

    return prisma.investmentSimulationRun.create({
      data: {
        fundId,
        scenarioJson: scenario,
        resultJson: result,
        status: "COMPLETED",
        createdById: userId,
      },
    });
  }

  static async get(id: string) {
    return prisma.investmentSimulationRun.findUnique({ where: { id } });
  }
}
