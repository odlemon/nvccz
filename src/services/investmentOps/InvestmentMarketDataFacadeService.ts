// @ts-nocheck
import { prisma } from "../../utils/database";
import { MarketDataScraperService } from "../listedEquity/MarketDataScraperService";
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { paginatedResult, parsePagination } from "./investmentOpsSupport";

const STALE_HOURS_DEFAULT = 24;

export class InvestmentMarketDataFacadeService {
  static async latestPrices(filters: { search?: string; exchangeCode?: string } = {}) {
    const securities = await prisma.listedEquitySecurity.findMany({
      where: {
        isActive: true,
        ...(filters.exchangeCode ? { exchangeCode: filters.exchangeCode } : {}),
        ...(filters.search
          ? {
              OR: [
                { symbol: { contains: filters.search } },
                { name: { contains: filters.search } },
                { isin: { contains: filters.search } },
              ],
            }
          : {}),
      },
      take: 500,
    });
    const out = [];
    for (const s of securities) {
      const tick = await prisma.listedEquityPriceTick.findFirst({
        where: { securityId: s.id, validationStatus: { in: ["APPROVED", "API_CONFIRMED"] } },
        orderBy: { pricedAt: "desc" },
      });
      out.push({
        securityId: s.id,
        symbol: s.symbol,
        exchangeCode: s.exchangeCode,
        price: tick ? String(tick.price) : null,
        pricedAt: tick?.pricedAt ?? null,
        validationStatus: tick?.validationStatus ?? "STALE",
        sourceStatus: tick?.sourceStatus ?? "FALLBACK",
      });
    }
    return out;
  }

  static async stalePrices(hours = STALE_HOURS_DEFAULT) {
    const cutoff = new Date(Date.now() - hours * 3600 * 1000);
    const securities = await prisma.listedEquitySecurity.findMany({ where: { isActive: true } });
    const stale = [];
    for (const s of securities) {
      const tick = await prisma.listedEquityPriceTick.findFirst({
        where: { securityId: s.id, validationStatus: "APPROVED" },
        orderBy: { pricedAt: "desc" },
      });
      if (!tick || tick.pricedAt < cutoff) {
        stale.push({
          securityId: s.id,
          symbol: s.symbol,
          exchangeCode: s.exchangeCode,
          lastPrice: tick ? String(tick.price) : null,
          pricedAt: tick?.pricedAt ?? null,
          status: "STALE",
        });
      }
    }
    return stale;
  }

  static async manualPriceEntry(data: {
    securityId: string;
    price: number;
    priceType?: string;
    userId: string;
    idempotencyKey: string;
  }) {
    const sec = await prisma.listedEquitySecurity.findUnique({ where: { id: data.securityId } });
    if (!sec) throw new Error("Security not found");
    const replay = await prisma.listedEquityPriceTick.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
    });
    if (replay) return replay;
    return prisma.listedEquityPriceTick.create({
      data: {
        securityId: sec.id,
        sourceCode: "MANUAL",
        priceType: data.priceType || "REFERENCE",
        price: new Decimal(String(data.price)),
        validationStatus: "PENDING",
        sourceStatus: "MANUAL",
        sourceObservedAt: new Date(),
        pricedAt: new Date(),
        idempotencyKey: data.idempotencyKey,
      },
      include: { security: true },
    });
  }

  static async uploadPricesCsv(csvText: string, sourceCode: string) {
    const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
    const ticks = [];
    for (let i = 1; i < lines.length; i++) {
      const [symbol, price] = lines[i].split(",");
      const sec = await prisma.listedEquitySecurity.findFirst({
        where: { symbol: symbol.trim().toUpperCase(), exchangeCode: sourceCode },
      });
      if (!sec || !Number.isFinite(Number(price))) continue;
      ticks.push({
        symbol: sec.symbol,
        exchangeCode: sec.exchangeCode,
        priceType: "CLOSE",
        price: Number(price),
        pricedAt: new Date(),
        tickFrequency: "EOD",
      });
    }
    return MarketDataScraperService.scrapeSource(sourceCode, ticks);
  }

  static async runIngest(sourceCode: string) {
    return MarketDataScraperService.scrapeSource(sourceCode);
  }

  static async priceHistory(securityId: string, query: Record<string, unknown>) {
    const page = parsePagination(query);
    const where: any = {
      securityId,
      ...(query.status ? { validationStatus: String(query.status) } : {}),
      ...(page.from || page.to
        ? {
            pricedAt: {
              ...(page.from ? { gte: new Date(page.from) } : {}),
              ...(page.to ? { lte: new Date(page.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.listedEquityPriceTick.findMany({
        where,
        include: { security: true },
        orderBy: { pricedAt: page.sortDirection },
        skip: page.skip,
        take: page.take,
      }),
      prisma.listedEquityPriceTick.count({ where }),
    ]);
    const paged = paginatedResult(items, total, page.page, page.pageSize);
    // Slim series for order-ticket sparklines (decimal-string price)
    const series = items.map((tick) => ({
      pricedAt: tick.pricedAt,
      price: tick.price != null ? String(tick.price) : null,
    }));
    return {
      ...paged,
      series,
      maxRangeDays: 365,
    };
  }

  static async reviewPrice(
    id: string,
    decision: "APPROVED" | "REJECTED",
    userId: string,
    reason: string,
    expectedVersion: string
  ) {
    const current = await prisma.listedEquityPriceTick.findUnique({ where: { id } });
    if (!current) throw new InvestmentOpsError("PRICE_TICK_NOT_FOUND", "Price tick not found", 404);
    if (String(current.version) !== expectedVersion) {
      throw new InvestmentOpsError("VERSION_CONFLICT", "Price tick has changed", 409, {
        expectedVersion,
        currentVersion: String(current.version),
      });
    }
    if (!["PENDING", "VALIDATED"].includes(current.validationStatus)) {
      throw new InvestmentOpsError("PRICE_TICK_ALREADY_REVIEWED", "Price tick is not reviewable", 409);
    }
    return prisma.listedEquityPriceTick.update({
      where: { id },
      data: {
        validationStatus: decision,
        approvalReason: reason || null,
        reviewedById: userId,
        reviewedAt: new Date(),
        version: { increment: 1 },
      },
    });
  }

  static async listFxRates(query: Record<string, unknown>) {
    const page = parsePagination(query);
    const where = {
      ...(query.baseCurrencyCode ? { baseCurrencyCode: String(query.baseCurrencyCode) } : {}),
      ...(query.quoteCurrencyCode ? { quoteCurrencyCode: String(query.quoteCurrencyCode) } : {}),
      ...(query.status ? { approvalStatus: String(query.status) } : {}),
      ...(page.from || page.to
        ? {
            sourceObservedAt: {
              ...(page.from ? { gte: new Date(page.from) } : {}),
              ...(page.to ? { lte: new Date(page.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      (prisma as any).investmentFxRateSnapshot.findMany({
        where,
        orderBy: { sourceObservedAt: page.sortDirection },
        skip: page.skip,
        take: page.take,
      }),
      (prisma as any).investmentFxRateSnapshot.count({ where }),
    ]);
    return paginatedResult(items, total, page.page, page.pageSize);
  }

  static async latestFxRate(baseCurrencyCode: string, quoteCurrencyCode: string) {
    const row = await (prisma as any).investmentFxRateSnapshot.findFirst({
      where: {
        baseCurrencyCode: baseCurrencyCode.toUpperCase(),
        quoteCurrencyCode: quoteCurrencyCode.toUpperCase(),
        approvalStatus: "APPROVED",
      },
      orderBy: { sourceObservedAt: "desc" },
    });
    if (!row) throw new InvestmentOpsError("FX_RATE_NOT_FOUND", "Approved FX rate not found", 404);
    return row;
  }

  static async createFxRate(data: any, idempotencyKey: string) {
    const delegate = (prisma as any).investmentFxRateSnapshot;
    const replay = await delegate.findUnique({ where: { idempotencyKey } });
    if (replay) return replay;
    return delegate.create({
      data: {
        baseCurrencyCode: String(data.baseCurrencyCode).toUpperCase(),
        quoteCurrencyCode: String(data.quoteCurrencyCode).toUpperCase(),
        rate: new Decimal(String(data.rate)),
        rateType: data.rateType || "SPOT",
        sourceCode: data.sourceCode || "MANUAL",
        sourceReference: data.sourceReference,
        sourceObservedAt: data.sourceObservedAt ? new Date(data.sourceObservedAt) : new Date(),
        approvalStatus: "PENDING",
        idempotencyKey,
      },
    });
  }

  static async reviewFxRate(
    id: string,
    decision: "APPROVED" | "REJECTED",
    userId: string,
    reason: string,
    expectedVersion: string
  ) {
    const delegate = (prisma as any).investmentFxRateSnapshot;
    const current = await delegate.findUnique({ where: { id } });
    if (!current) throw new InvestmentOpsError("FX_RATE_NOT_FOUND", "FX rate not found", 404);
    if (String(current.version) !== expectedVersion) {
      throw new InvestmentOpsError("VERSION_CONFLICT", "FX rate has changed", 409, {
        expectedVersion,
        currentVersion: String(current.version),
      });
    }
    if (current.approvalStatus !== "PENDING") {
      throw new InvestmentOpsError("FX_RATE_ALREADY_REVIEWED", "FX rate has already been reviewed", 409);
    }
    return delegate.update({
      where: { id },
      data: {
        approvalStatus: decision,
        approvedById: userId,
        approvedAt: new Date(),
        approvalReason: reason || null,
        version: { increment: 1 },
      },
    });
  }
}
