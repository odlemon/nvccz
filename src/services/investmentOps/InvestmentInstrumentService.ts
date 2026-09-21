// @ts-nocheck
import { prisma } from "../../utils/database";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { assertFourEyeSeparation } from "./investmentOpsFourEye";

import { paginatedResult, parsePagination, userDisplayName } from "./investmentOpsSupport";
import { findLatestDisplayPriceTick } from "../listedEquity/listedEquityLatestTick";

/** Active trading status per SRD. Legacy APPROVED is accepted as equivalent during transition. */
export const INSTRUMENT_TRADEABLE_STATUSES = new Set(["ACTIVE", "APPROVED"]);

const LIFECYCLE: Record<string, string[]> = {
  DRAFT: ["PENDING_APPROVAL", "ARCHIVED"],
  REJECTED: ["PENDING_APPROVAL", "ARCHIVED"],
  PENDING_APPROVAL: ["ACTIVE", "REJECTED"],
  /** Legacy tradeable status — same outgoing edges as ACTIVE during cutover. */
  APPROVED: ["RESTRICTED", "ARCHIVED", "INACTIVE", "SUSPENDED"],
  ACTIVE: ["RESTRICTED", "ARCHIVED", "INACTIVE", "SUSPENDED"],
  RESTRICTED: ["ACTIVE", "ARCHIVED"],
  INACTIVE: ["ACTIVE", "ARCHIVED"],
  SUSPENDED: ["ACTIVE", "ARCHIVED", "RESTRICTED"],
  ARCHIVED: [],
};

export function isInstrumentTradeable(status: string | null | undefined): boolean {
  return INSTRUMENT_TRADEABLE_STATUSES.has(String(status || "").toUpperCase());
}

export function assertInstrumentTransition(from: string, to: string) {
  if (!(LIFECYCLE[from] || []).includes(to)) {
    throw new InvestmentOpsError(
      "INVALID_INSTRUMENT_TRANSITION",
      `Instrument cannot transition from ${from} to ${to}`,
      409,
      { from, to }
    );
  }
}

function decimalString(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

export class InvestmentInstrumentService {
  static async listTypes() {
    return prisma.investmentInstrumentType.findMany({ where: { isActive: true }, orderBy: { typeCode: "asc" } });
  }

  static async list(filters: {
    type?: string;
    exchange?: string;
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortDirection?: "asc" | "desc";
  }) {
    const where: any = {};
    if (filters.type) where.instrumentTypeCode = filters.type;
    if (filters.exchange) where.exchangeCode = filters.exchange;
    if (filters.status) where.status = filters.status;
    const { page, pageSize, skip, take } = parsePagination(filters);
    if (filters.search) {
      where.OR = [
        { ticker: { contains: filters.search } },
        { shortName: { contains: filters.search } },
        { fullName: { contains: filters.search } },
        { isin: { contains: filters.search } },
        { instrumentCode: { contains: filters.search } },
      ];
    }
    const allowedSort = new Set([
      "instrumentCode",
      "ticker",
      "shortName",
      "fullName",
      "status",
      "updatedAt",
      "createdAt",
    ]);
    const sortBy = allowedSort.has(filters.sortBy || "") ? filters.sortBy! : "instrumentCode";
    const [rows, total] = await Promise.all([
      prisma.investmentInstrument.findMany({
        where,
        orderBy: { [sortBy]: filters.sortDirection || "asc" },
        skip,
        take,
      }),
      prisma.investmentInstrument.count({ where }),
    ]);
    const securityIds = rows.map((r) => r.listedEquitySecurityId).filter(Boolean) as string[];
    const secById = new Map<string, { isin: string | null; exchangeCode: string; listingCurrencyCode: string | null; symbol: string }>();
    if (securityIds.length) {
      const securities = await prisma.listedEquitySecurity.findMany({
        where: { id: { in: securityIds } },
        select: { id: true, isin: true, exchangeCode: true, listingCurrencyCode: true, symbol: true },
      });
      for (const sec of securities) {
        secById.set(sec.id, sec);
      }
    }
    const latestBySecurity = new Map<string, { price: string; pricedAt: Date }>();
    if (securityIds.length) {
      // Latest approved tick per security — avoid loading full tick history (remote MySQL timeouts).
      const latestTicks = await Promise.all(
        securityIds.map((securityId) => findLatestDisplayPriceTick(securityId))
      );
      for (let i = 0; i < securityIds.length; i++) {
        const latest = latestTicks[i];
        if (!latest) continue;
        latestBySecurity.set(securityIds[i], {
          price: decimalString(latest.tick.price)!,
          pricedAt: latest.tick.pricedAt,
        });
      }
    }
    const items = rows.map((row) => {
      const sec = row.listedEquitySecurityId ? secById.get(row.listedEquitySecurityId) : null;
      const latest = row.listedEquitySecurityId
        ? latestBySecurity.get(row.listedEquitySecurityId)
        : null;
      return {
        ...row,
        isin: row.isin ?? sec?.isin ?? row.instrumentCode ?? null,
        exchangeCode: row.exchangeCode ?? sec?.exchangeCode ?? null,
        listingCurrencyCode: row.listingCurrencyCode ?? sec?.listingCurrencyCode ?? null,
        latestPrice: latest?.price ?? null,
        pricedAt: latest?.pricedAt ?? null,
        createdByName: null as string | null,
      };
    });
    const creatorIds = [...new Set(items.map((i) => i.createdById).filter(Boolean))] as string[];
    if (creatorIds.length) {
      const users = await prisma.user.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      const nameById = new Map(users.map((u) => [u.id, userDisplayName(u)]));
      for (const item of items) {
        item.createdByName = item.createdById ? nameById.get(item.createdById) ?? null : null;
      }
    }
    return paginatedResult(items, total, page, pageSize);
  }

  static async get(id: string) {
    const row = await prisma.investmentInstrument.findUnique({ where: { id } });
    if (!row) throw new Error("Not found");
    const [market, latestPrice, creator] = await Promise.all([
      row.marketCode
        ? prisma.investmentMarket.findUnique({ where: { marketCode: row.marketCode } })
        : Promise.resolve(null),
      row.listedEquitySecurityId
        ? prisma.listedEquityPriceTick.findFirst({
            where: {
              securityId: row.listedEquitySecurityId,
              validationStatus: { in: ["APPROVED", "API_CONFIRMED"] },
            },
            orderBy: { pricedAt: "desc" },
          })
        : Promise.resolve(null),
      row.createdById
        ? prisma.user.findUnique({
            where: { id: row.createdById },
            select: { firstName: true, lastName: true, email: true },
          })
        : Promise.resolve(null),
    ]);
    return {
      ...row,
      createdByName: userDisplayName(creator),
      marketContext: {
        market,
        latestPrice: latestPrice
          ? { ...latestPrice, price: decimalString(latestPrice.price) }
          : null,
      },
    };
  }

  /**
   * Fund-scoped market context for trading UI: approved price, holding, cash, weight/PnL when available.
   * Unavailable fields are honest nulls (never invented).
   */
  static async marketContext(instrumentId: string, fundId: string, userId: string, user: any) {
    if (!fundId) {
      throw new InvestmentOpsError("VALIDATION_ERROR", "fundId is required", 400, { field: "fundId" });
    }
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const instrument = await prisma.investmentInstrument.findUnique({ where: { id: instrumentId } });
    if (!instrument) throw new InvestmentOpsError("INSTRUMENT_NOT_FOUND", "Instrument not found", 404);

    const securityId = instrument.listedEquitySecurityId;
    const [market, latestPrice, holding, portfolio, snap] = await Promise.all([
      instrument.marketCode
        ? prisma.investmentMarket.findUnique({ where: { marketCode: instrument.marketCode } })
        : Promise.resolve(null),
      securityId
        ? prisma.listedEquityPriceTick.findFirst({
            where: {
              securityId,
              validationStatus: { in: ["APPROVED", "API_CONFIRMED"] },
            },
            orderBy: { pricedAt: "desc" },
          })
        : Promise.resolve(null),
      securityId
        ? prisma.listedEquityHolding.findUnique({
            where: { fundId_securityId: { fundId, securityId } },
          })
        : Promise.resolve(null),
      prisma.investmentPortfolioConfig.findUnique({ where: { fundId } }),
      prisma.listedEquityValuationSnapshot.findFirst({
        where: { fundId },
        orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    let cashBalance: string | null = null;
    if (portfolio) {
      const cashAccount = await (prisma as any).investmentCashAccount.findFirst({
        where: {
          portfolioConfigId: portfolio.id,
          currencyCode: portfolio.baseCurrencyCode,
          status: "ACTIVE",
        },
      });
      if (cashAccount) {
        const ledger = await (prisma as any).investmentCashLedgerEntry.aggregate({
          where: { cashAccountId: cashAccount.id, status: "POSTED" },
          _sum: { amount: true },
        });
        cashBalance = ledger?._sum?.amount != null ? String(ledger._sum.amount) : "0";
      }
    }

    const price = latestPrice?.price != null ? String(latestPrice.price) : null;
    const qty = holding?.quantity != null ? String(holding.quantity) : null;
    const wac = holding?.wac != null ? String(holding.wac) : null;

    let marketValue: string | null = null;
    let unrealizedPnl: string | null = null;
    let portfolioWeightPct: string | null = null;

    if (price != null && qty != null) {
      const mv = Number(qty) * Number(price);
      if (Number.isFinite(mv)) {
        marketValue = String(mv);
        if (wac != null) {
          const cost = Number(qty) * Number(wac);
          if (Number.isFinite(cost)) unrealizedPnl = String(mv - cost);
        }
        const nav = snap?.navBaseCurrency != null ? Number(snap.navBaseCurrency) : NaN;
        if (nav > 0 && Number.isFinite(mv)) {
          portfolioWeightPct = String((mv / nav) * 100);
        }
      }
    }

    return {
      instrumentId: instrument.id,
      fundId,
      status: instrument.status,
      tradeable: isInstrumentTradeable(instrument.status),
      market,
      approvedPrice: price,
      pricedAt: latestPrice?.pricedAt ?? null,
      priceValidationStatus: latestPrice?.validationStatus ?? null,
      holding: holding
        ? {
            quantity: qty,
            wac,
            marketValue,
            unrealizedPnl,
          }
        : null,
      cashBalance,
      portfolioWeightPct,
      navBaseCurrency: snap?.navBaseCurrency != null ? String(snap.navBaseCurrency) : null,
      asOf: snap?.asOf ?? null,
    };
  }

  static async assertApprovedForTrade(instrumentId: string) {
    const inst = await prisma.investmentInstrument.findUnique({ where: { id: instrumentId } });
    if (!inst) throw new Error("Instrument not found");
    if (!isInstrumentTradeable(inst.status)) {
      throw new Error(
        `Instrument ${inst.instrumentCode} must be ACTIVE before trading (current: ${inst.status})`
      );
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

    // Always link a listedEquitySecurity so Draft instruments can receive manual prices.
    // Prefer ticker+exchange; fall back to instrumentCode + OTC so pricing is never blocked.
    const symbol = String(row.ticker || row.instrumentCode.split(".")[0] || row.instrumentCode)
      .trim()
      .toUpperCase();
    const exchangeCode = String(row.exchangeCode || "OTC").trim().toUpperCase();
    const sec = await prisma.listedEquitySecurity.upsert({
      where: {
        symbol_exchangeCode: {
          symbol,
          exchangeCode,
        },
      },
      create: {
        symbol,
        exchangeCode,
        name: row.fullName,
        listingCurrencyCode: row.listingCurrencyCode,
        isin: row.isin,
      },
      update: {
        name: row.fullName,
        isin: row.isin ?? undefined,
        listingCurrencyCode: row.listingCurrencyCode,
      },
    });
    await prisma.investmentInstrument.update({
      where: { id: row.id },
      data: {
        listedEquitySecurityId: sec.id,
        ...(row.ticker ? {} : { ticker: symbol }),
        ...(row.exchangeCode ? {} : { exchangeCode }),
      },
    });
    return prisma.investmentInstrument.findUnique({ where: { id: row.id } });
  }

  static async update(id: string, data: Record<string, unknown>, expectedVersion: string) {
    const current = await prisma.investmentInstrument.findUnique({
      where: { id },
      select: { auditVersion: true },
    });
    if (!current) throw new Error("Instrument not found");
    if (String(current.auditVersion) !== expectedVersion) {
      throw new InvestmentOpsError(
        "VERSION_CONFLICT",
        "Instrument has changed since it was read",
        409,
        { expectedVersion, currentVersion: String(current.auditVersion) }
      );
    }
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

  static async transition(
    id: string,
    status: string,
    userId: string,
    expectedVersion: string,
    reason?: string,
    user?: any
  ) {
    const current = await prisma.investmentInstrument.findUnique({ where: { id } });
    if (!current) throw new InvestmentOpsError("INSTRUMENT_NOT_FOUND", "Instrument not found", 404);
    if (String(current.auditVersion) !== expectedVersion) {
      throw new InvestmentOpsError("VERSION_CONFLICT", "Instrument has changed since it was read", 409, {
        expectedVersion,
        currentVersion: String(current.auditVersion),
      });
    }
    assertInstrumentTransition(current.status, status);

    if (status === "ACTIVE" && current.createdById && current.createdById === userId) {
      assertFourEyeSeparation(
        current.createdById,
        userId,
        user,
        "Instrument creator cannot approve their own instrument"
      );
    }

    const activating = status === "ACTIVE";
    return prisma.investmentInstrument.update({
      where: { id },
      data: {
        status,
        ...(activating ? { approvedById: userId, approvedAt: new Date() } : {}),
        ...(status === "RESTRICTED"
          ? { complianceRestriction: reason || "RESTRICTED" }
          : activating
            ? { complianceRestriction: null }
            : {}),
        auditVersion: { increment: 1 },
      },
    });
  }

  static approve(id: string, userId: string, expectedVersion: string) {
    return this.transition(id, "ACTIVE", userId, expectedVersion);
  }
}
