// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { toDec } from "../utils/forecastMath";

export class ForecastingFxService {
  static async resolveProjectedRate(
    baseCurrency: string,
    txCurrency: string,
    periodEnd: Date
  ): Promise<Decimal> {
    if (txCurrency === baseCurrency) return new Decimal(1);
    const from = await prisma.currency.findFirst({ where: { code: txCurrency } });
    const to = await prisma.currency.findFirst({ where: { code: baseCurrency } });
    if (!from || !to) return new Decimal(1);
    const rate = await prisma.exchangeRate.findFirst({
      where: {
        fromCurrencyId: from.id,
        toCurrencyId: to.id,
        date: { lte: periodEnd },
        isActive: true
      },
      orderBy: { date: "desc" }
    });
    if (rate?.rate) return toDec(rate.rate);
    if (txCurrency === "USD" && (baseCurrency === "ZIG" || baseCurrency === "ZWG")) {
      const usdToZig = await prisma.exchangeRate.findFirst({
        where: {
          fromCurrencyId: from.id,
          toCurrencyId: to.id,
          isActive: true
        },
        orderBy: { date: "desc" }
      });
      if (usdToZig?.rate) return toDec(usdToZig.rate);
    }
    return new Decimal(1);
  }

  static async resolveActualRate(
    baseCurrency: string,
    txCurrency: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<Decimal | null> {
    if (txCurrency === baseCurrency) return new Decimal(1);
    const je = await prisma.journalEntry.findFirst({
      where: {
        status: "POSTED",
        transactionDate: { gte: periodStart, lte: periodEnd },
        usdZwgRateSnapshot: { not: null }
      },
      orderBy: { transactionDate: "desc" },
      select: { usdZwgRateSnapshot: true }
    });
    if (je?.usdZwgRateSnapshot != null) {
      return toDec(je.usdZwgRateSnapshot);
    }
    return ForecastingFxService.resolveProjectedRate(baseCurrency, txCurrency, periodEnd);
  }
}
