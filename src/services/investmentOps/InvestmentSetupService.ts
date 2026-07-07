// @ts-nocheck
import { prisma } from "../../utils/database";

export class InvestmentSetupService {
  static async listBrokers() {
    return prisma.listedEquityStakeholderProfile.findMany({
      where: { profileType: "BROKER", isActive: true },
      orderBy: { name: "asc" },
    });
  }

  static async createBroker(data: { name: string; contactEmail?: string; deliveryMode?: string }) {
    return prisma.listedEquityStakeholderProfile.create({
      data: {
        profileType: "BROKER",
        name: data.name,
        contactEmail: data.contactEmail,
        deliveryMode: data.deliveryMode || "EMAIL",
      },
    });
  }

  static async listCustodians() {
    return prisma.listedEquityStakeholderProfile.findMany({
      where: { profileType: "CUSTODIAN", isActive: true },
      orderBy: { name: "asc" },
    });
  }

  static async createCustodian(data: { name: string; contactEmail?: string; deliveryMode?: string }) {
    return prisma.listedEquityStakeholderProfile.create({
      data: {
        profileType: "CUSTODIAN",
        name: data.name,
        contactEmail: data.contactEmail,
        deliveryMode: data.deliveryMode || "EMAIL",
      },
    });
  }

  static async listCommissions(stakeholderProfileId?: string) {
    return prisma.investmentBrokerCommission.findMany({
      where: {
        isActive: true,
        ...(stakeholderProfileId ? { stakeholderProfileId } : {}),
      },
    });
  }

  static async createCommission(data: Record<string, unknown>) {
    return prisma.investmentBrokerCommission.create({
      data: {
        stakeholderProfileId: data.stakeholderProfileId as string,
        instrumentTypeCode: data.instrumentTypeCode as string | undefined,
        rateBps: Number(data.rateBps),
        flatFee: data.flatFee != null ? Number(data.flatFee) : undefined,
        currencyCode: (data.currencyCode as string) || "USD",
      },
    });
  }

  static async listMarkets() {
    const rows = await prisma.investmentMarket.findMany({ where: { isActive: true } });
    if (rows.length) return rows;
    return [
      { marketCode: "ZSE", marketName: "Zimbabwe Stock Exchange", exchangeCode: "ZSE", countryCode: "ZW" },
      { marketCode: "VFEX", marketName: "Victoria Falls Exchange", exchangeCode: "VFEX", countryCode: "ZW" },
      { marketCode: "NASDAQ", marketName: "NASDAQ", exchangeCode: "NASDAQ", countryCode: "US" },
      { marketCode: "NYSE", marketName: "New York Stock Exchange", exchangeCode: "NYSE", countryCode: "US" },
    ];
  }

  static async createMarket(data: Record<string, unknown>) {
    return prisma.investmentMarket.create({
      data: {
        marketCode: data.marketCode as string,
        marketName: data.marketName as string,
        countryCode: data.countryCode as string | undefined,
        exchangeCode: data.exchangeCode as string | undefined,
      },
    });
  }

  static async listCurrencies() {
    return prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
  }

  static async priceSources() {
    const configs = await prisma.listedEquityMarketDataSourceConfig.findMany({
      orderBy: { sourceCode: "asc" },
    });
    const batches = await prisma.listedEquityMarketDataIngestBatch.groupBy({
      by: ["sourceCode"],
      _max: { createdAt: true },
      _count: { id: true },
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ticksToday = await prisma.listedEquityPriceTick.count({
      where: { createdAt: { gte: today } },
    });
    return configs.map((c) => {
      const b = batches.find((x) => x.sourceCode === c.sourceCode);
      return {
        sourceCode: c.sourceCode,
        displayName: c.displayName,
        isEnabled: c.isEnabled,
        apiStatus: c.isEnabled ? "OK" : "DISABLED",
        lastSuccessfulRun: b?._max.createdAt ?? null,
        ticksToday,
        failedRequests: 0,
        retryCount: 0,
        message: c.sourceUrl ? "Configured" : "Default adapter",
      };
    });
  }

  static async getSettings() {
    const rows = await prisma.investmentOpsSetting.findMany();
    const out: Record<string, unknown> = {};
    for (const r of rows) out[r.settingKey] = r.settingValue;
    return out;
  }

  static async updateSettings(updates: Record<string, unknown>, userId: string) {
    for (const [key, value] of Object.entries(updates)) {
      await prisma.investmentOpsSetting.upsert({
        where: { settingKey: key },
        create: { settingKey: key, settingValue: value as object, updatedById: userId },
        update: { settingValue: value as object, updatedById: userId },
      });
    }
    return this.getSettings();
  }

  static async listCountries() {
    const rows = await prisma.investmentCountry.findMany({
      where: { isActive: true },
      orderBy: { countryName: "asc" },
    });
    if (rows.length) return rows;
    return [
      { countryCode: "ZW", countryName: "Zimbabwe", region: "Africa" },
      { countryCode: "US", countryName: "United States", region: "Americas" },
      { countryCode: "GB", countryName: "United Kingdom", region: "Europe" },
    ];
  }

  static async createCountry(data: { countryCode: string; countryName: string; region?: string }) {
    return prisma.investmentCountry.upsert({
      where: { countryCode: data.countryCode.toUpperCase() },
      create: {
        countryCode: data.countryCode.toUpperCase(),
        countryName: data.countryName,
        region: data.region,
      },
      update: { countryName: data.countryName, region: data.region, isActive: true },
    });
  }

  static async listIssuers(countryCode?: string) {
    return prisma.investmentIssuer.findMany({
      where: {
        isActive: true,
        ...(countryCode ? { countryCode: countryCode.toUpperCase() } : {}),
      },
      orderBy: { legalName: "asc" },
    });
  }

  static async createIssuer(data: {
    issuerCode: string;
    legalName: string;
    countryCode?: string;
    sector?: string;
  }) {
    return prisma.investmentIssuer.create({
      data: {
        issuerCode: data.issuerCode.toUpperCase(),
        legalName: data.legalName,
        countryCode: data.countryCode?.toUpperCase(),
        sector: data.sector,
      },
    });
  }
}
