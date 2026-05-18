// @ts-nocheck
import { Decimal } from "decimal.js";
import { prisma } from "../utils/database";
import {
  calculateRoiMultiple,
  calculateXirrAnnualized,
  type CashFlow,
} from "../utils/investmentPerformanceMetrics";

const VALUATION_TYPES = new Set([
  "POST_MONEY",
  "FAIR_MARKET_VALUE",
  "PRE_MONEY",
  "OTHER",
]);

const EXIT_TYPES = new Set([
  "IPO",
  "ACQUISITION",
  "WRITE_OFF",
  "SECONDARY",
  "OTHER",
]);

function money(d: unknown): number {
  if (d == null) return 0;
  return Number(d);
}

export class InvestmentMonitoringService {
  static assertValuationType(v: string) {
    if (!VALUATION_TYPES.has(v)) {
      throw new Error(
        `valuationType must be one of: ${[...VALUATION_TYPES].join(", ")}`
      );
    }
  }

  static assertExitType(v: string) {
    if (!EXIT_TYPES.has(v)) {
      throw new Error(`exitType must be one of: ${[...EXIT_TYPES].join(", ")}`);
    }
  }

  static async resolveActiveCurrencyId(currencyId: string | null | undefined): Promise<string> {
    const id = String(currencyId ?? "").trim();
    if (!id) {
      throw new Error("currencyId is required");
    }
    const currency = await prisma.currency.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
    if (!currency) {
      throw new Error("currencyId must reference an active currency");
    }
    return currency.id;
  }

  /** Same basis as portfolio company invested totals: APPROVED + DISBURSED. */
  static async sumDisbursementInvestedBasis(investmentImplementationId: string) {
    const rows = await prisma.fundDisbursement.findMany({
      where: {
        investmentImplementationId,
        status: { in: ["APPROVED", "DISBURSED"] },
      },
      select: {
        amount: true,
        amountCommitmentCurrency: true,
        disbursementDate: true,
      },
      orderBy: { disbursementDate: "asc" },
    });
    let total = new Decimal(0);
    const flows: CashFlow[] = [];
    for (const r of rows) {
      const amt = money(r.amountCommitmentCurrency ?? r.amount);
      total = total.plus(amt);
      flows.push({
        date: new Date(r.disbursementDate),
        amount: -Math.abs(amt),
      });
    }
    return { totalInvested: total.toNumber(), outflowFlows: flows };
  }

  static async listValuationEvents(investmentImplementationId: string) {
    await this.ensureImplementationExists(investmentImplementationId);
    return prisma.investmentValuationEvent.findMany({
      where: { investmentImplementationId },
      orderBy: [{ valuationDate: "desc" }, { createdAt: "desc" }],
      include: {
        currency: { select: { id: true, code: true, symbol: true } },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  static async createValuationEvent(params: {
    investmentImplementationId: string;
    valuationDate: Date;
    valuationType: string;
    valuationAmount: number;
    currencyId: string;
    notes?: string | null;
    createdById: string;
  }) {
    this.assertValuationType(params.valuationType);
    if (!Number.isFinite(params.valuationAmount)) {
      throw new Error("valuationAmount must be a valid number");
    }
    const currencyId = await this.resolveActiveCurrencyId(params.currencyId);
    await this.ensureImplementationExists(params.investmentImplementationId);
    return prisma.investmentValuationEvent.create({
      data: {
        investmentImplementationId: params.investmentImplementationId,
        valuationDate: params.valuationDate,
        valuationType: params.valuationType,
        valuationAmount: params.valuationAmount,
        currencyId,
        notes: params.notes ?? undefined,
        createdById: params.createdById,
      },
      include: {
        currency: { select: { id: true, code: true, symbol: true } },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  static async updateValuationEvent(
    investmentImplementationId: string,
    valuationEventId: string,
    data: {
      valuationDate?: Date;
      valuationType?: string;
      valuationAmount?: number;
      currencyId?: string | null;
      notes?: string | null;
    }
  ) {
    if (data.valuationType) this.assertValuationType(data.valuationType);
    if (data.valuationAmount != null && !Number.isFinite(data.valuationAmount)) {
      throw new Error("valuationAmount must be a valid number");
    }
    if (data.currencyId !== undefined) {
      await this.resolveActiveCurrencyId(data.currencyId);
    }
    const existing = await prisma.investmentValuationEvent.findFirst({
      where: { id: valuationEventId, investmentImplementationId },
    });
    if (!existing) {
      throw new Error("Valuation event not found for this investment");
    }
    return prisma.investmentValuationEvent.update({
      where: { id: valuationEventId },
      data: {
        ...(data.valuationDate != null ? { valuationDate: data.valuationDate } : {}),
        ...(data.valuationType != null ? { valuationType: data.valuationType } : {}),
        ...(data.valuationAmount != null ? { valuationAmount: data.valuationAmount } : {}),
        ...(data.currencyId !== undefined ? { currencyId: data.currencyId } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      include: {
        currency: { select: { id: true, code: true, symbol: true } },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  static async deleteValuationEvent(
    investmentImplementationId: string,
    valuationEventId: string
  ) {
    const existing = await prisma.investmentValuationEvent.findFirst({
      where: { id: valuationEventId, investmentImplementationId },
    });
    if (!existing) {
      throw new Error("Valuation event not found for this investment");
    }
    await prisma.investmentValuationEvent.delete({ where: { id: valuationEventId } });
    return { ok: true };
  }

  static async getExit(investmentImplementationId: string) {
    await this.ensureImplementationExists(investmentImplementationId);
    return prisma.investmentExitEvent.findUnique({
      where: { investmentImplementationId },
      include: {
        currency: { select: { id: true, code: true, symbol: true } },
        recordedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        investmentImplementation: {
          select: {
            id: true,
            status: true,
            portfolioCompanyId: true,
            portfolioCompany: { select: { id: true, name: true, status: true } },
          },
        },
      },
    });
  }

  static async recordExit(params: {
    investmentImplementationId: string;
    exitDate: Date;
    exitType: string;
    exitProceedsAmount: number;
    currencyId: string;
    notes?: string | null;
    recordedById: string;
  }) {
    if (!Number.isFinite(params.exitProceedsAmount)) {
      throw new Error("exitProceedsAmount must be a valid number");
    }
    const currencyId = await this.resolveActiveCurrencyId(params.currencyId);
    this.assertExitType(params.exitType);
    const impl = await prisma.investmentImplementation.findUnique({
      where: { id: params.investmentImplementationId },
      select: { id: true, portfolioCompanyId: true, status: true },
    });
    if (!impl) throw new Error("Investment implementation not found");

    const { totalInvested, outflowFlows } =
      await this.sumDisbursementInvestedBasis(params.investmentImplementationId);

    const exitFlows: CashFlow[] = [
      ...outflowFlows,
      {
        date: new Date(params.exitDate),
        amount: Math.abs(Number(params.exitProceedsAmount)),
      },
    ];

    const irr = calculateXirrAnnualized(exitFlows);
    const roi = calculateRoiMultiple(totalInvested, Number(params.exitProceedsAmount));

    const irrDec =
      irr != null && Number.isFinite(irr) ? new Decimal(irr).toDecimalPlaces(8) : null;
    const roiDec =
      roi != null && Number.isFinite(roi) ? new Decimal(roi).toDecimalPlaces(8) : null;

    const exitId = await prisma.$transaction(
      async (tx) => {
        const row = await tx.investmentExitEvent.upsert({
          where: { investmentImplementationId: params.investmentImplementationId },
          create: {
            investmentImplementationId: params.investmentImplementationId,
            exitDate: params.exitDate,
            exitType: params.exitType,
            exitProceedsAmount: params.exitProceedsAmount,
            currencyId,
            totalInvestedBasis: totalInvested,
            irrAnnualized: irrDec ?? undefined,
            roiMultiple: roiDec ?? undefined,
            notes: params.notes ?? undefined,
            recordedById: params.recordedById,
          },
          update: {
            exitDate: params.exitDate,
            exitType: params.exitType,
            exitProceedsAmount: params.exitProceedsAmount,
            currencyId,
            totalInvestedBasis: totalInvested,
            irrAnnualized: irrDec ?? undefined,
            roiMultiple: roiDec ?? undefined,
            notes: params.notes ?? undefined,
            recordedById: params.recordedById,
          },
          select: { id: true },
        });

        await tx.investmentImplementation.update({
          where: { id: impl.id },
          data: {
            status: "EXITED",
            updatedAt: new Date(),
          },
        });

        await tx.portfolioCompany.update({
          where: { id: impl.portfolioCompanyId },
          data: {
            status: "EXITED",
            updatedAt: new Date(),
          },
        });

        return row.id;
      },
      { maxWait: 15_000, timeout: 30_000 }
    );

    const exitRow = await prisma.investmentExitEvent.findUnique({
      where: { id: exitId },
      include: {
        currency: { select: { id: true, code: true, symbol: true } },
        recordedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return {
      exit: exitRow,
      performance: {
        totalInvestedBasis: totalInvested,
        exitProceedsAmount: Number(params.exitProceedsAmount),
        irrAnnualized: irrDec != null ? irrDec.toNumber() : null,
        roiMultiple: roiDec != null ? roiDec.toNumber() : null,
        disbursementFlowCount: outflowFlows.length,
      },
    };
  }

  static async deleteExit(investmentImplementationId: string) {
    const row = await prisma.investmentExitEvent.findUnique({
      where: { investmentImplementationId },
    });
    if (!row) throw new Error("No exit event recorded for this investment");

    const impl = await prisma.investmentImplementation.findUnique({
      where: { id: investmentImplementationId },
      select: {
        id: true,
        portfolioCompanyId: true,
        fundsDisbursed: true,
      },
    });
    if (!impl) throw new Error("Investment implementation not found");

    const pending = await prisma.fundDisbursement.count({
      where: {
        investmentImplementationId,
        status: { not: "DISBURSED" },
      },
    });

    const { totalInvested } =
      await InvestmentMonitoringService.sumDisbursementInvestedBasis(
        investmentImplementationId
      );
    const pcStatus = totalInvested > 0.01 ? "DISBURSED" : "NO_INVESTMENT";

    await prisma.$transaction(
      async (tx) => {
        await tx.investmentExitEvent.delete({
          where: { investmentImplementationId },
        });

        const nextImplStatus =
          pending === 0 && impl.fundsDisbursed ? "COMPLETED" : "IN_PROGRESS";

        await tx.investmentImplementation.update({
          where: { id: impl.id },
          data: {
            status: nextImplStatus,
            updatedAt: new Date(),
          },
        });

        await tx.portfolioCompany.update({
          where: { id: impl.portfolioCompanyId },
          data: {
            status: pcStatus,
            updatedAt: new Date(),
          },
        });
      },
      { maxWait: 15_000, timeout: 30_000 }
    );

    return { ok: true };
  }

  private static async ensureImplementationExists(id: string) {
    const impl = await prisma.investmentImplementation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!impl) throw new Error("Investment implementation not found");
  }
}
