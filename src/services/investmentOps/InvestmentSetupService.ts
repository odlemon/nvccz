// @ts-nocheck
import { prisma } from "../../utils/database";
import { paginatedResult } from "./investmentOpsSupport";

function presentStakeholder(row: any) {
  return {
    id: row.id,
    name: row.name,
    profileType: row.profileType,
    status: row.isActive === false ? "INACTIVE" : "ACTIVE",
    isActive: row.isActive !== false,
    contactEmail: row.contactEmail ?? null,
    contactPhone: null,
    deliveryMode: row.deliveryMode ?? null,
    effectiveFrom: row.createdAt ?? null,
    effectiveTo: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function presentCurrency(row: any) {
  return {
    id: row.id ?? row.code,
    code: row.code,
    name: row.name ?? row.code,
    symbol: row.symbol ?? null,
    decimalPlaces: 2,
    status: row.isActive === false ? "INACTIVE" : "ACTIVE",
    isActive: row.isActive !== false,
  };
}

export class InvestmentSetupService {
  static async listBrokers() {
    const rows = await prisma.listedEquityStakeholderProfile.findMany({
      where: { profileType: "BROKER", isActive: true },
      orderBy: { name: "asc" },
    });
    const items = rows.map(presentStakeholder);
    return paginatedResult(items, items.length, 1, items.length || 50);
  }

  static async createBroker(data: { name: string; contactEmail?: string; deliveryMode?: string }) {
    const row = await prisma.listedEquityStakeholderProfile.create({
      data: {
        profileType: "BROKER",
        name: data.name,
        contactEmail: data.contactEmail,
        deliveryMode: data.deliveryMode || "EMAIL",
      },
    });
    return presentStakeholder(row);
  }

  static async listCustodians() {
    const rows = await prisma.listedEquityStakeholderProfile.findMany({
      where: { profileType: "CUSTODIAN", isActive: true },
      orderBy: { name: "asc" },
    });
    const items = rows.map(presentStakeholder);
    return paginatedResult(items, items.length, 1, items.length || 50);
  }

  static async createCustodian(data: { name: string; contactEmail?: string; deliveryMode?: string }) {
    const row = await prisma.listedEquityStakeholderProfile.create({
      data: {
        profileType: "CUSTODIAN",
        name: data.name,
        contactEmail: data.contactEmail,
        deliveryMode: data.deliveryMode || "EMAIL",
      },
    });
    return presentStakeholder(row);
  }

  static async listCommissions(stakeholderProfileId?: string) {
    const rows = await prisma.investmentBrokerCommission.findMany({
      where: {
        isActive: true,
        ...(stakeholderProfileId ? { stakeholderProfileId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    const profileIds = [...new Set(rows.map((r) => r.stakeholderProfileId))];
    const profiles = profileIds.length
      ? await prisma.listedEquityStakeholderProfile.findMany({
          where: { id: { in: profileIds } },
          select: { id: true, name: true, profileType: true, contactEmail: true },
        })
      : [];
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
    const items = rows
      .filter((r) => byId[r.stakeholderProfileId])
      .map((r) => ({
        ...r,
        rateBps: String(r.rateBps),
        flatFee: r.flatFee != null ? String(r.flatFee) : null,
        brokerName: byId[r.stakeholderProfileId]?.name ?? null,
        stakeholder: byId[r.stakeholderProfileId] ?? null,
      }));
    return paginatedResult(items, items.length, 1, items.length || 50);
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
    const items = rows.length
      ? rows
      : [
          { marketCode: "ZSE", marketName: "Zimbabwe Stock Exchange", exchangeCode: "ZSE", countryCode: "ZW", isActive: true },
          { marketCode: "VFEX", marketName: "Victoria Falls Exchange", exchangeCode: "VFEX", countryCode: "ZW", isActive: true },
          { marketCode: "NASDAQ", marketName: "NASDAQ", exchangeCode: "NASDAQ", countryCode: "US", isActive: true },
          { marketCode: "NYSE", marketName: "New York Stock Exchange", exchangeCode: "NYSE", countryCode: "US", isActive: true },
        ];
    return paginatedResult(items, items.length, 1, items.length || 50);
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
    const rows = await prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
    const items = rows.map(presentCurrency);
    return paginatedResult(items, items.length, 1, items.length || 50);
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
    const items = configs.map((c) => {
      const b = batches.find((x) => x.sourceCode === c.sourceCode);
      return {
        id: c.id ?? c.sourceCode,
        sourceCode: c.sourceCode,
        name: c.displayName,
        displayName: c.displayName,
        status: c.isEnabled ? "ACTIVE" : "DISABLED",
        isEnabled: c.isEnabled,
        apiStatus: c.isEnabled ? "OK" : "DISABLED",
        lastSuccessfulRun: b?._max.createdAt ?? null,
        ticksToday,
        failedRequests: 0,
        retryCount: 0,
        message: c.sourceUrl ? "Configured" : "Default adapter",
      };
    });
    return paginatedResult(items, items.length, 1, items.length || 50);
  }

  /** Flat settings map (not a list). FE treat `{ items }` as null — never wrap. */
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
    const items = rows.length
      ? rows
      : [
          { countryCode: "ZW", countryName: "Zimbabwe", region: "Africa", isActive: true },
          { countryCode: "US", countryName: "United States", region: "Americas", isActive: true },
          { countryCode: "GB", countryName: "United Kingdom", region: "Europe", isActive: true },
        ];
    return paginatedResult(items, items.length, 1, items.length || 50);
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
    const rows = await prisma.investmentIssuer.findMany({
      where: {
        isActive: true,
        ...(countryCode ? { countryCode: countryCode.toUpperCase() } : {}),
      },
      orderBy: { legalName: "asc" },
    });
    return paginatedResult(rows, rows.length, 1, rows.length || 50);
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
