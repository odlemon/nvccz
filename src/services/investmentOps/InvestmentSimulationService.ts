// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { InvestmentComplianceService } from "./InvestmentComplianceService";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";

const db = prisma as any;

function requiredDecimal(value: unknown, field: string): Decimal {
  try {
    const decimal = new Decimal(String(value ?? "").trim());
    if (!decimal.isPositive()) {
      throw new InvestmentOpsError("INVALID_DECIMAL", `${field} must be greater than zero`, 400, { field });
    }
    return decimal;
  } catch (error) {
    if (error instanceof InvestmentOpsError) throw error;
    throw new InvestmentOpsError("INVALID_DECIMAL", `${field} must be a decimal string`, 400, { field });
  }
}

export class InvestmentSimulationService {
  static async run(
    fundId: string,
    userId: string,
    user: any,
    idempotencyKey: string,
    scenario: {
      side: string;
      securityId?: string;
      instrumentId?: string;
      quantity: number | string;
      price: number | string;
    }
  ) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const command = await prisma.investmentJob.findUnique({ where: { idempotencyKey } });
    const replayId = (command?.payloadJson as any)?.simulationRunId;
    if (replayId) return this.get(replayId, userId, user);

    const side = String(scenario?.side || "").toUpperCase();
    if (!["BUY", "SELL"].includes(side)) {
      throw new InvestmentOpsError("INVALID_ORDER_SIDE", "scenario.side must be BUY or SELL", 400);
    }
    const quantity = requiredDecimal(scenario.quantity, "scenario.quantity");
    const price = requiredDecimal(scenario.price, "scenario.price");
    const orderValue = quantity.mul(price);

    const snap = await prisma.listedEquityValuationSnapshot.findFirst({
      where: { fundId },
      orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
    });
    if (!snap) {
      throw new InvestmentOpsError(
        "VALUATION_SNAPSHOT_REQUIRED",
        "Simulation requires a persisted valuation snapshot",
        422,
        { fundId }
      );
    }
    const navBefore = new Decimal(snap.navBaseCurrency);
    const navAfter = side === "BUY" ? navBefore.plus(orderValue) : navBefore.minus(orderValue);

    const instrument = scenario.instrumentId
      ? await prisma.investmentInstrument.findUnique({ where: { id: scenario.instrumentId } })
      : null;
    if (scenario.instrumentId && !instrument) {
      throw new InvestmentOpsError("INSTRUMENT_NOT_FOUND", "Instrument not found", 404);
    }

    const compliance = await InvestmentComplianceService.previewCheck({
      fundId,
      side,
      orderValue: Number(orderValue),
      instrument,
    });

    const result = {
      navBefore: navBefore.toString(),
      navAfter: navAfter.toString(),
      navImpact: navAfter.minus(navBefore).toString(),
      cashImpact: (side === "BUY" ? orderValue.neg() : orderValue).toString(),
      exposureImpactPct: navBefore.isZero()
        ? null
        : orderValue.div(navBefore).mul(100).toString(),
      compliance,
      valuationSnapshotId: snap.id,
      estimatedFees: null,
      feeEstimateStatus: "NOT_CALCULATED_WITHOUT_BROKER_COMMISSION_INPUT",
      mutatesPortfolio: false,
    };

    return prisma.$transaction(async (tx) => {
      const run = await tx.investmentSimulationRun.create({
        data: {
          fundId,
          scenarioJson: {
            ...scenario,
            side,
            quantity: quantity.toString(),
            price: price.toString(),
          },
          resultJson: result,
          status: "COMPLETED",
          createdById: userId,
        },
      });
      await tx.investmentJob.create({
        data: {
          jobType: "INVESTMENT_SIMULATION_COMMAND",
          aggregateType: "SIMULATION_RUN",
          aggregateId: run.id,
          payloadJson: { simulationRunId: run.id },
          status: "COMPLETED",
          idempotencyKey,
          completedAt: new Date(),
        },
      });
      return run;
    });
  }

  static async get(id: string, userId: string, user: any) {
    await ListedEquityAccessService.assertObjectFundAccess(
      userId,
      user,
      "Simulation run",
      id,
      async () =>
        (await prisma.investmentSimulationRun.findUnique({
          where: { id },
          select: { fundId: true },
        }))?.fundId
    );
    return prisma.investmentSimulationRun.findUnique({ where: { id } });
  }

  static async list(query: any, userId: string, user: any) {
    const scope = await ListedEquityAccessService.getAccessibleFundIds(userId, user);
    if (query.fundId) {
      await ListedEquityAccessService.assertFundAccess(userId, query.fundId, user);
    }
    return prisma.investmentSimulationRun.findMany({
      where: {
        ...(query.fundId ? { fundId: query.fundId } : scope === "ALL" ? {} : { fundId: { in: scope } }),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
}
