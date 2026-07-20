// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { paginatedResult } from "./investmentOpsSupport";

const DEFAULT_COA_MAPPING = {
  listedSecuritiesAsset: "1501",
  bankClearing: "1100",
  realizedGain: "4010",
  realizedLoss: "5200",
};

export class InvestmentFundService {
  static async list(userId: string, user: any) {
    const scope = await ListedEquityAccessService.getAccessibleListedEquityFundIds(userId, user);
    const funds = await prisma.fund.findMany({
      where: {
        ...ListedEquityAccessService.listedEquityFundWhere(),
        ...(scope === "ALL" ? {} : { id: { in: scope } }),
      },
      include: {
        listedEquityFundConfig: {
          include: {
            trustBank: { select: { id: true, name: true } },
            brokerProfile: { select: { id: true, name: true } },
            custodianProfile: { select: { id: true, name: true } },
          },
        },
        fundManagers: {
          where: { isActive: true },
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
      orderBy: { name: "asc" },
    });
    return paginatedResult(
      funds.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        status: f.status,
        fundPurpose: f.fundPurpose,
        baseCurrency: f.listedEquityFundConfig?.baseCurrencyCode ?? null,
        brokerProfileId: f.listedEquityFundConfig?.brokerProfileId ?? null,
        brokerName: f.listedEquityFundConfig?.brokerProfile?.name ?? null,
        custodianProfileId: f.listedEquityFundConfig?.custodianProfileId ?? null,
        custodianName: f.listedEquityFundConfig?.custodianProfile?.name ?? null,
        config: f.listedEquityFundConfig,
        managers: f.fundManagers,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      })),
      funds.length,
      1,
      funds.length || 50
    );
  }

  static async getById(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertListedEquityFundAccess(userId, fundId, user);
    const fund = await prisma.fund.findFirst({
      where: { id: fundId, ...ListedEquityAccessService.listedEquityFundWhere() },
      include: {
        listedEquityFundConfig: {
          include: {
            trustBank: { select: { id: true, name: true } },
            brokerProfile: { select: { id: true, name: true } },
            custodianProfile: { select: { id: true, name: true } },
          },
        },
        fundManagers: {
          where: { isActive: true },
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });
    if (!fund) throw new Error("FUND_NOT_FOUND");
    const config = fund.listedEquityFundConfig
      ? {
          ...fund.listedEquityFundConfig,
          cutoff: fund.listedEquityFundConfig.cutoffTime ?? null,
        }
      : null;
    return { ...fund, listedEquityFundConfig: config, config };
  }

  static async create(
    data: {
      name: string;
      description?: string;
      status?: string;
      baseCurrencyCode?: string;
      trustBankId?: string;
      brokerProfileId?: string;
      custodianProfileId?: string;
      coaMappingJson?: Record<string, string>;
    },
    userId: string
  ) {
    const now = new Date();
    const farFuture = new Date("2099-12-31");

    const fund = await prisma.fund.create({
      data: {
        name: data.name,
        description: data.description || "Listed equity investment mandate",
        totalAmount: new Decimal(0),
        remainingAmount: new Decimal(0),
        minInvestment: new Decimal(0),
        maxInvestment: new Decimal(0),
        focusIndustries: [],
        applicationStart: now,
        applicationEnd: farFuture,
        status: data.status || "OPEN",
        fundPurpose: "LISTED_EQUITY",
        createdById: userId,
        listedEquityFundConfig: {
          create: {
            baseCurrencyCode: data.baseCurrencyCode || "USD",
            trustBankId: data.trustBankId || null,
            brokerProfileId: data.brokerProfileId || null,
            custodianProfileId: data.custodianProfileId || null,
            coaMappingJson: data.coaMappingJson || DEFAULT_COA_MAPPING,
          },
        },
        fundManagers: {
          create: { userId, role: "fund_manager", isActive: true },
        },
      },
      include: { listedEquityFundConfig: true },
    });
    // Parity with POST /portfolios — order/folder config for listed-equity books
    await prisma.investmentPortfolioConfig.upsert({
      where: { fundId: fund.id },
      create: {
        fundId: fund.id,
        baseCurrencyCode: data.baseCurrencyCode || "USD",
        createdById: userId,
        updatedById: userId,
      },
      update: { updatedById: userId },
    });
    return fund;
  }

  static async update(
    fundId: string,
    data: { name?: string; description?: string; status?: string },
    userId: string,
    user: any
  ) {
    await ListedEquityAccessService.assertListedEquityFundAccess(userId, fundId, user);
    return prisma.fund.update({
      where: { id: fundId },
      data: {
        ...(data.name != null ? { name: data.name } : {}),
        ...(data.description != null ? { description: data.description } : {}),
        ...(data.status != null ? { status: data.status } : {}),
      },
    });
  }

  static async updateConfig(
    fundId: string,
    data: {
      baseCurrencyCode?: string;
      trustBankId?: string | null;
      brokerProfileId?: string | null;
      custodianProfileId?: string | null;
      coaMappingJson?: Record<string, string>;
      costBasisMethod?: string | null;
      pricingSource?: string | null;
      settlementCycle?: string | null;
      cutoffTime?: string | null;
      cutoff?: string | null;
    },
    userId: string,
    user: any
  ) {
    await ListedEquityAccessService.assertListedEquityFundAccess(userId, fundId, user);
    await ListedEquityAccessService.assertListedEquityFund(fundId);

    const cfg = await prisma.listedEquityFundConfig.findUnique({ where: { fundId } });
    if (!cfg) throw new Error("LISTED_EQUITY_CONFIG_NOT_FOUND");

    const cutoffTime = data.cutoffTime !== undefined ? data.cutoffTime : data.cutoff;

    return prisma.listedEquityFundConfig.update({
      where: { fundId },
      data: {
        ...(data.baseCurrencyCode != null ? { baseCurrencyCode: data.baseCurrencyCode } : {}),
        ...(data.trustBankId !== undefined ? { trustBankId: data.trustBankId } : {}),
        ...(data.brokerProfileId !== undefined ? { brokerProfileId: data.brokerProfileId } : {}),
        ...(data.custodianProfileId !== undefined ? { custodianProfileId: data.custodianProfileId } : {}),
        ...(data.coaMappingJson != null ? { coaMappingJson: data.coaMappingJson } : {}),
        ...(data.costBasisMethod !== undefined ? { costBasisMethod: data.costBasisMethod } : {}),
        ...(data.pricingSource !== undefined ? { pricingSource: data.pricingSource } : {}),
        ...(data.settlementCycle !== undefined ? { settlementCycle: data.settlementCycle } : {}),
        ...(cutoffTime !== undefined ? { cutoffTime } : {}),
      },
    });
  }

  static async addManager(
    fundId: string,
    targetUserId: string,
    role: string,
    userId: string,
    user: any
  ) {
    await ListedEquityAccessService.assertListedEquityFundAccess(userId, fundId, user);
    return prisma.fundManager.upsert({
      where: { fundId_userId: { fundId, userId: targetUserId } },
      create: { fundId, userId: targetUserId, role: role || "fund_manager", isActive: true },
      update: { role: role || "fund_manager", isActive: true },
    });
  }
}
