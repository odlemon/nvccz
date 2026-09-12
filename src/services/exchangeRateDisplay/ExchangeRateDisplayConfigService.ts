// @ts-nocheck
import { prisma } from "../../utils/database";

const DEFAULT_FORMAT = {
  showBidAsk: true,
  showSpread: true,
  showChangePct: true,
  decimals: 2,
  labelTemplate: "ZWG per 1 USD",
};

export class ExchangeRateDisplayConfigService {
  static async listConfigs() {
    return prisma.exchangeRateDisplayConfig.findMany({
      orderBy: [{ sortOrder: "asc" }, { contextCode: "asc" }],
    });
  }

  static async getForContext(contextCode: string, from = "USD", to = "ZWG") {
    const cfg = await prisma.exchangeRateDisplayConfig.findFirst({
      where: {
        contextCode,
        fromCurrencyCode: from.toUpperCase(),
        toCurrencyCode: to.toUpperCase(),
        isActive: true,
      },
    });
    if (cfg) return cfg;

    return prisma.exchangeRateDisplayConfig.findFirst({
      where: {
        contextCode: "GENERIC",
        fromCurrencyCode: from.toUpperCase(),
        toCurrencyCode: to.toUpperCase(),
        isActive: true,
      },
    });
  }

  static async createConfig(data: {
    contextCode: string;
    fromCurrencyCode: string;
    toCurrencyCode: string;
    primarySourceCode: string;
    comparisonSourceCode?: string | null;
    displayFormat?: Record<string, unknown>;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return prisma.exchangeRateDisplayConfig.create({
      data: {
        contextCode: data.contextCode,
        fromCurrencyCode: data.fromCurrencyCode.toUpperCase(),
        toCurrencyCode: data.toCurrencyCode.toUpperCase(),
        primarySourceCode: data.primarySourceCode,
        comparisonSourceCode: data.comparisonSourceCode ?? null,
        displayFormat: data.displayFormat ?? DEFAULT_FORMAT,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  static async updateConfig(
    id: string,
    data: Partial<{
      primarySourceCode: string;
      comparisonSourceCode: string | null;
      displayFormat: Record<string, unknown>;
      sortOrder: number;
      isActive: boolean;
    }>
  ) {
    const existing = await prisma.exchangeRateDisplayConfig.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error("Display config not found"), { statusCode: 404 });
    return prisma.exchangeRateDisplayConfig.update({ where: { id }, data });
  }
}
