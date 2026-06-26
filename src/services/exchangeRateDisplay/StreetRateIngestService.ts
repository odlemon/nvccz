// @ts-nocheck
import { createHash } from "crypto";
import { prisma } from "../../utils/database";
import {
  fetchZimrateRates,
  pickUsdZwgOfficial,
  pickUsdZwgStreet,
  parseZimrateDateLabel,
  type ZimrateUsdZwgRow,
} from "../ZimrateRateService";
import { ExchangeRateQuoteService } from "./ExchangeRateQuoteService";

function toDay(d: Date = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function rowToQuote(sourceCode: string, row: ZimrateUsdZwgRow, fetchedAt: Date) {
  const labelDate = parseZimrateDateLabel(row.date_label) ?? toDay();
  const checksum = createHash("sha256")
    .update(`${sourceCode}:${row.avg}:${labelDate.toISOString()}`)
    .digest("hex");
  return ExchangeRateQuoteService.upsertDailyQuote({
    sourceCode,
    fromCurrencyCode: "USD",
    toCurrencyCode: "ZWG",
    asOfDate: labelDate,
    fetchedAt,
    bid: row.bid,
    ask: row.ask,
    avg: row.avg,
    previousAvg: row.previous_avg ?? null,
    changePct: row.change_pct ?? null,
    sha256Checksum: checksum,
  });
}

export class StreetRateIngestService {
  static async ingestLive() {
    const fetchedAt = new Date();
    const payload = await fetchZimrateRates();
    const official = pickUsdZwgOfficial(payload);
    const street = pickUsdZwgStreet(payload);
    const results: string[] = [];

    if (official) {
      await rowToQuote("ZIMRATE_OFFICIAL", official, fetchedAt);
      results.push("ZIMRATE_OFFICIAL");
    }
    if (street) {
      await rowToQuote("ZIMRATE_STREET", street, fetchedAt);
      results.push("ZIMRATE_STREET");
    }

    const manualCount = await StreetRateIngestService.ingestManualBridge(toDay());
    return { ingested: results, manualBridged: manualCount, fetchedAt: fetchedAt.toISOString() };
  }

  static async ingestManualBridge(asOfDate: Date = toDay()) {
    const dayStart = toDay(asOfDate);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const rates = await prisma.exchangeRate.findMany({
      where: {
        isActive: true,
        date: { gte: dayStart, lt: dayEnd },
      },
      include: {
        fromCurrency: { select: { code: true } },
        toCurrency: { select: { code: true } },
      },
    });

    let count = 0;
    for (const r of rates) {
      const from = (r.fromCurrency?.code || "").toUpperCase();
      const to = (r.toCurrency?.code || "").toUpperCase();
      if (!from || !to) continue;
      const avg = Number(r.rate);
      if (!Number.isFinite(avg) || avg <= 0) continue;
      await ExchangeRateQuoteService.upsertDailyQuote({
        sourceCode: "MANUAL",
        fromCurrencyCode: from,
        toCurrencyCode: to,
        asOfDate: dayStart,
        fetchedAt: new Date(),
        bid: avg,
        ask: avg,
        avg,
      });
      count++;
    }
    return count;
  }

  static async postManualOverride(params: {
    fromCurrencyCode: string;
    toCurrencyCode: string;
    avg: number;
    bid?: number;
    ask?: number;
    asOfDate?: Date;
    actorId: string;
  }) {
    const day = toDay(params.asOfDate ?? new Date());
    const bid = params.bid ?? params.avg;
    const ask = params.ask ?? params.avg;
    return ExchangeRateQuoteService.upsertDailyQuote({
      sourceCode: "INTERNAL",
      fromCurrencyCode: params.fromCurrencyCode,
      toCurrencyCode: params.toCurrencyCode,
      asOfDate: day,
      fetchedAt: new Date(),
      bid,
      ask,
      avg: params.avg,
      sha256Checksum: createHash("sha256")
        .update(`INTERNAL:${params.actorId}:${params.avg}:${day.toISOString()}`)
        .digest("hex"),
    });
  }
}
