// @ts-nocheck
import { prisma } from "../../utils/database";

const STALE_MS = Number(process.env.EXCHANGE_RATE_DISPLAY_STALE_MS ?? 6 * 60 * 60 * 1000);

export class ExchangeRateQuoteService {
  static formatQuote(q: any) {
    if (!q) return null;
    return {
      source: q.sourceCode,
      from: q.fromCurrencyCode,
      to: q.toCurrencyCode,
      asOfDate: q.asOfDate instanceof Date ? q.asOfDate.toISOString().slice(0, 10) : String(q.asOfDate).slice(0, 10),
      fetchedAt: q.fetchedAt,
      bid: String(q.bid),
      ask: String(q.ask),
      avg: String(q.avg),
      previousAvg: q.previousAvg != null ? String(q.previousAvg) : null,
      changePct: q.changePct != null ? Number(q.changePct) : null,
    };
  }

  static isStale(fetchedAt: Date | string | null | undefined): boolean {
    if (!fetchedAt) return true;
    const t = fetchedAt instanceof Date ? fetchedAt.getTime() : new Date(fetchedAt).getTime();
    return Date.now() - t > STALE_MS;
  }

  static async getLatestQuote(
    sourceCode: string,
    fromCurrencyCode: string,
    toCurrencyCode: string,
    asOfDate?: Date
  ) {
    const from = fromCurrencyCode.toUpperCase();
    const to = toCurrencyCode.toUpperCase();
    if (asOfDate) {
      const day = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate()));
      return prisma.exchangeRateQuote.findUnique({
        where: {
          sourceCode_fromCurrencyCode_toCurrencyCode_asOfDate: {
            sourceCode,
            fromCurrencyCode: from,
            toCurrencyCode: to,
            asOfDate: day,
          },
        },
      });
    }
    return prisma.exchangeRateQuote.findFirst({
      where: { sourceCode, fromCurrencyCode: from, toCurrencyCode: to },
      orderBy: [{ asOfDate: "desc" }, { fetchedAt: "desc" }],
    });
  }

  static async listHistory(params: {
    sourceCode: string;
    fromCurrencyCode: string;
    toCurrencyCode: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
  }) {
    const from = params.fromCurrencyCode.toUpperCase();
    const to = params.toCurrencyCode.toUpperCase();
    const where: any = { sourceCode: params.sourceCode, fromCurrencyCode: from, toCurrencyCode: to };
    if (params.dateFrom || params.dateTo) {
      where.asOfDate = {};
      if (params.dateFrom) where.asOfDate.gte = params.dateFrom;
      if (params.dateTo) where.asOfDate.lte = params.dateTo;
    }
    return prisma.exchangeRateQuote.findMany({
      where,
      orderBy: { asOfDate: "asc" },
      take: params.limit ?? 365,
    });
  }

  static async upsertDailyQuote(data: {
    sourceCode: string;
    fromCurrencyCode: string;
    toCurrencyCode: string;
    asOfDate: Date;
    fetchedAt: Date;
    bid: number;
    ask: number;
    avg: number;
    previousAvg?: number | null;
    changePct?: number | null;
    sha256Checksum?: string | null;
  }) {
    const day = new Date(
      Date.UTC(data.asOfDate.getUTCFullYear(), data.asOfDate.getUTCMonth(), data.asOfDate.getUTCDate())
    );
    return prisma.exchangeRateQuote.upsert({
      where: {
        sourceCode_fromCurrencyCode_toCurrencyCode_asOfDate: {
          sourceCode: data.sourceCode,
          fromCurrencyCode: data.fromCurrencyCode.toUpperCase(),
          toCurrencyCode: data.toCurrencyCode.toUpperCase(),
          asOfDate: day,
        },
      },
      create: {
        sourceCode: data.sourceCode,
        fromCurrencyCode: data.fromCurrencyCode.toUpperCase(),
        toCurrencyCode: data.toCurrencyCode.toUpperCase(),
        asOfDate: day,
        fetchedAt: data.fetchedAt,
        bid: data.bid,
        ask: data.ask,
        avg: data.avg,
        previousAvg: data.previousAvg ?? null,
        changePct: data.changePct ?? null,
        sha256Checksum: data.sha256Checksum ?? null,
      },
      update: {
        fetchedAt: data.fetchedAt,
        bid: data.bid,
        ask: data.ask,
        avg: data.avg,
        previousAvg: data.previousAvg ?? null,
        changePct: data.changePct ?? null,
        sha256Checksum: data.sha256Checksum ?? null,
      },
    });
  }
}
