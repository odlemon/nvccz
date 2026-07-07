// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { PortfolioValuationEngine } from "../listedEquity/PortfolioValuationEngine";
import { InvestmentFifoCostService } from "./InvestmentFifoCostService";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";

export class InvestmentValuationService {
  static async runValuation(
    fundId: string,
    userId: string,
    user: any,
    options?: { async?: boolean; costBasisMethod?: string }
  ) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const run = await prisma.investmentValuationRun.create({
      data: {
        fundId,
        asOf: new Date(),
        status: "RUNNING",
        startedById: userId,
        parametersJson: { costBasisMethod: options?.costBasisMethod || "WAC" },
      },
    });

    const execute = async () => {
      try {
        const method = options?.costBasisMethod || "WAC";
        if (method === "FIFO") {
          const holdings = await prisma.listedEquityHolding.findMany({ where: { fundId } });
          for (const h of holdings) {
            const fifo = await InvestmentFifoCostService.costBasis(
              fundId,
              h.securityId,
              Number(h.quantity)
            );
            if (fifo.wac > 0) {
              await prisma.listedEquityHolding.update({
                where: { id: h.id },
                data: { wac: fifo.wac },
              });
            }
          }
        }
        const snap = await PortfolioValuationEngine.runFundValuation(fundId);
        const exceptions = [];
        const holdings = await prisma.listedEquityHolding.findMany({ where: { fundId } });
        for (const h of holdings) {
          const price = await PortfolioValuationEngine.latestApprovedPrice(h.securityId);
          if (price == null) {
            const ex = await prisma.investmentValuationException.create({
              data: {
                valuationRunId: run.id,
                fundId,
                securityId: h.securityId,
                exceptionType: "FX_MISSING_OR_NO_PRICE",
                message: "No approved price for holding",
              },
            });
            exceptions.push(ex);
          }
        }
        await prisma.investmentValuationRun.update({
          where: { id: run.id },
          data: {
            status: exceptions.length ? "COMPLETED_WITH_EXCEPTIONS" : "COMPLETED",
            navBaseCurrency: snap.navBaseCurrency,
            completedAt: new Date(),
          },
        });
        await InvestmentOpsAuditService.log(
          "VALUATION_RUN_COMPLETED",
          "ValuationRun",
          run.id,
          { fundId, exceptionCount: exceptions.length },
          userId
        );
      } catch (e: any) {
        await prisma.investmentValuationRun.update({
          where: { id: run.id },
          data: { status: "FAILED", errorMessage: e.message, completedAt: new Date() },
        });
        throw e;
      }
    };

    if (options?.async) {
      setImmediate(() => {
        execute().catch(() => undefined);
      });
      return run;
    }

    await execute();
    return prisma.investmentValuationRun.findUnique({
      where: { id: run.id },
      include: { exceptions: true },
    });
  }

  static async getRun(id: string) {
    return prisma.investmentValuationRun.findUnique({
      where: { id },
      include: { exceptions: true },
    });
  }

  static async listExceptions(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    return prisma.investmentValuationException.findMany({
      where: { fundId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  static async resolveException(
    exceptionId: string,
    userId: string,
    resolution: { action: string; reason?: string; overridePrice?: number }
  ) {
    const ex = await prisma.investmentValuationException.findUnique({ where: { id: exceptionId } });
    if (!ex) throw new Error("Exception not found");
    const updated = await prisma.investmentValuationException.update({
      where: { id: exceptionId },
      data: {
        status: "RESOLVED",
        resolvedById: userId,
        resolvedAt: new Date(),
        resolutionAction: resolution.action,
        resolutionNote: resolution.reason,
      },
    });
    await InvestmentOpsAuditService.log(
      "VALUATION_EXCEPTION_RESOLVED",
      "ValuationException",
      exceptionId,
      resolution,
      userId
    );
    return updated;
  }
}
