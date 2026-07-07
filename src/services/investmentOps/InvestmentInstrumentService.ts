// @ts-nocheck
import { prisma } from "../../utils/database";

import { paginatedResult, parsePagination } from "./investmentOpsSupport";

export class InvestmentInstrumentService {
  static async listTypes() {
    return prisma.investmentInstrumentType.findMany({ where: { isActive: true }, orderBy: { typeCode: "asc" } });
  }

  static async list(filters: { type?: string; exchange?: string; status?: string; page?: number; pageSize?: number }) {
    const where: any = {};
    if (filters.type) where.instrumentTypeCode = filters.type;
    if (filters.exchange) where.exchangeCode = filters.exchange;
    if (filters.status) where.status = filters.status;
    const { page, pageSize, skip, take } = parsePagination(filters);
    const [rows, total] = await Promise.all([
      prisma.investmentInstrument.findMany({
        where,
        orderBy: { instrumentCode: "asc" },
        skip,
        take,
      }),
      prisma.investmentInstrument.count({ where }),
    ]);
    return paginatedResult(rows, total, page, pageSize);
  }

  static async get(id: string) {
    const row = await prisma.investmentInstrument.findUnique({ where: { id } });
    if (!row) throw new Error("Not found");
    return row;
  }

  static async assertApprovedForTrade(instrumentId: string) {
    const inst = await prisma.investmentInstrument.findUnique({ where: { id: instrumentId } });
    if (!inst) throw new Error("Instrument not found");
    if (inst.status !== "APPROVED") {
      throw new Error(`Instrument ${inst.instrumentCode} must be APPROVED before trading (current: ${inst.status})`);
    }
    return inst;
  }

  static async create(data: Record<string, unknown>, userId: string) {
    const instrumentCode =
      (data.instrumentCode as string) ||
      `${data.ticker || data.shortName}.${data.exchangeCode || "XX"}`;
    const row = await prisma.investmentInstrument.create({
      data: {
        instrumentCode: String(instrumentCode).toUpperCase(),
        shortName: String(data.shortName || data.ticker || instrumentCode),
        fullName: String(data.fullName || data.shortName || instrumentCode),
        ticker: data.ticker as string | undefined,
        isin: data.isin as string | undefined,
        bloombergCode: data.bloombergCode as string | undefined,
        reutersCode: data.reutersCode as string | undefined,
        internalRef: data.internalRef as string | undefined,
        exchangeCode: data.exchangeCode as string | undefined,
        marketCode: data.marketCode as string | undefined,
        countryCode: data.countryCode as string | undefined,
        issuerName: data.issuerName as string | undefined,
        instrumentTypeCode: (data.instrumentTypeCode as string) || "EQUITY",
        subCategory: data.subCategory as string | undefined,
        sector: data.sector as string | undefined,
        industry: data.industry as string | undefined,
        listingCurrencyCode: (data.listingCurrencyCode as string) || "USD",
        pricingSource: data.pricingSource as string | undefined,
        valuationMethod: (data.valuationMethod as string) || "MARK_TO_MARKET",
        maturityDate: data.maturityDate ? new Date(data.maturityDate as string) : undefined,
        couponRate: data.couponRate != null ? Number(data.couponRate) : undefined,
        couponFrequency: data.couponFrequency as string | undefined,
        status: "DRAFT",
        createdById: userId,
      },
    });

    if (row.instrumentTypeCode === "EQUITY" && row.exchangeCode && row.ticker) {
      const sec = await prisma.listedEquitySecurity.upsert({
        where: {
          symbol_exchangeCode: {
            symbol: row.ticker,
            exchangeCode: row.exchangeCode,
          },
        },
        create: {
          symbol: row.ticker,
          exchangeCode: row.exchangeCode,
          name: row.fullName,
          listingCurrencyCode: row.listingCurrencyCode,
          isin: row.isin,
        },
        update: { name: row.fullName, isin: row.isin ?? undefined },
      });
      await prisma.investmentInstrument.update({
        where: { id: row.id },
        data: { listedEquitySecurityId: sec.id },
      });
    }
    return prisma.investmentInstrument.findUnique({ where: { id: row.id } });
  }

  static async update(id: string, data: Record<string, unknown>) {
    return prisma.investmentInstrument.update({
      where: { id },
      data: {
        shortName: data.shortName as string | undefined,
        fullName: data.fullName as string | undefined,
        ticker: data.ticker as string | undefined,
        isin: data.isin as string | undefined,
        bloombergCode: data.bloombergCode as string | undefined,
        reutersCode: data.reutersCode as string | undefined,
        sector: data.sector as string | undefined,
        industry: data.industry as string | undefined,
        pricingSource: data.pricingSource as string | undefined,
        valuationMethod: data.valuationMethod as string | undefined,
        stalePriceThresholdHours: data.stalePriceThresholdHours as number | undefined,
        maturityDate: data.maturityDate ? new Date(data.maturityDate as string) : undefined,
        couponRate: data.couponRate != null ? Number(data.couponRate) : undefined,
        couponFrequency: data.couponFrequency as string | undefined,
        complianceRestriction: data.complianceRestriction as string | undefined,
        auditVersion: { increment: 1 },
      },
    });
  }

  static async approve(id: string, userId: string) {
    return prisma.investmentInstrument.update({
      where: { id },
      data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() },
    });
  }
}
