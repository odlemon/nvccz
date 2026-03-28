import type { ExchangeRate, Invoice } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../utils/database';
import { resolveUsdZwgAvgForSnapshot } from './UsdZwgRateResolver';
import { fetchZimrateRates, extractZwgPerZar } from './ZimrateRateService';
import { amountToZig } from '../utils/manualJournalZigEquivalence';

const ZIG_CODES = new Set(['ZWL', 'ZWG', 'ZIG']);

export type UnrealizedFxLine = {
  itemType: 'OPEN_INVOICE_AR';
  invoiceId: string;
  invoiceNumber: string | null;
  customerId: string;
  customerName: string;
  status: string;
  invoiceCurrencyCode: string;
  outstandingAmount: string;
  /** ZiG (ZWL) equivalent of outstanding at invoice post/sent snapshot (or exchange_rates). */
  originalFunctionalValue: string;
  /** ZiG equivalent at report run using live USD→ZiG / ZAR→ZiG. */
  currentFunctionalValue: string;
  unrealizedGainLoss: string;
  gainLossType: 'GAIN' | 'LOSS' | 'NONE';
  originalRateDescription: string;
  currentRateDescription: string;
};

export type UnrealizedFxExcluded = {
  invoiceId: string;
  invoiceNumber: string | null;
  reason: string;
};

export type UnrealizedFxReportResult = {
  reportType: 'UNREALIZED_FX_OPEN_AR';
  asOfDate: string;
  /** Company default / book currency from `currencies.isDefault` (informational). */
  functionalCurrencyCode: string;
  /** Open-item amounts below are denominated in ZiG (local dollar) using the same USD/ZAR→ZiG logic as invoices. */
  valuationCurrencyCode: 'ZWL';
  currentRates: {
    usdToZig: number | null;
    zwgPerZar: number | null;
    zimrateZarPair: string | null;
  };
  lines: UnrealizedFxLine[];
  excludedOpenItems: UnrealizedFxExcluded[];
  totals: {
    unrealizedGain: string;
    unrealizedLoss: string;
    netUnrealized: string;
  };
};

async function resolveFunctionalCurrency(): Promise<{ id: string; code: string }> {
  const def = await prisma.currency.findFirst({
    where: { isActive: true, isDefault: true },
  });
  if (def) return { id: def.id, code: def.code.toUpperCase() };
  const zwl = await prisma.currency.findFirst({
    where: { isActive: true, code: { in: ['ZWL', 'ZWG', 'ZIG'] } },
  });
  if (zwl) return { id: zwl.id, code: zwl.code.toUpperCase() };
  throw new Error('No default or ZWL/ZWG functional currency found');
}

async function findExchangeRateRow(
  fromCurrencyId: string,
  toCurrencyId: string,
  date: Date
): Promise<ExchangeRate | null> {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  let row = await prisma.exchangeRate.findUnique({
    where: {
      date_fromCurrencyId_toCurrencyId: {
        date: normalizedDate,
        fromCurrencyId,
        toCurrencyId,
      },
    },
  });
  if (row) return row;
  row = await prisma.exchangeRate.findFirst({
    where: {
      fromCurrencyId,
      toCurrencyId,
      date: { lte: normalizedDate },
      isActive: true,
    },
    orderBy: { date: 'desc' },
  });
  return row;
}

async function functionalPerUnitForeign(
  foreignCurrencyId: string,
  functionalId: string,
  asOfDate: Date,
  invoice: Pick<
    Invoice,
    | 'exchangeRateAtSent'
    | 'exchangeRateAtCreation'
    | 'usdZwgRateSnapshotSent'
    | 'usdZwgRateSnapshot'
  >,
  code: string
): Promise<{ rate: number; description: string } | null> {
  const upper = code.toUpperCase();

  if (ZIG_CODES.has(upper)) {
    return { rate: 1, description: '1:1 functional' };
  }

  if (upper === 'USD') {
    const r = Number(
      invoice.exchangeRateAtSent ??
        invoice.exchangeRateAtCreation ??
        invoice.usdZwgRateSnapshotSent ??
        invoice.usdZwgRateSnapshot ??
        0
    );
    if (r > 0) {
      return { rate: r, description: 'Invoice snapshot (sent / creation / usd_zwg)' };
    }
    const row = await findExchangeRateRow(foreignCurrencyId, functionalId, asOfDate);
    if (row && Number(row.rate) > 0) {
      return { rate: Number(row.rate), description: `exchange_rates as of ${row.date.toISOString().slice(0, 10)}` };
    }
    return null;
  }

  if (upper === 'ZAR') {
    const direct = await findExchangeRateRow(foreignCurrencyId, functionalId, asOfDate);
    if (direct && Number(direct.rate) > 0) {
      return { rate: Number(direct.rate), description: `exchange_rates ZAR→functional (${direct.date.toISOString().slice(0, 10)})` };
    }
    const inverse = await findExchangeRateRow(functionalId, foreignCurrencyId, asOfDate);
    if (inverse && Number(inverse.rate) > 0) {
      return {
        rate: 1 / Number(inverse.rate),
        description: `exchange_rates functional→ZAR inverted (${inverse.date.toISOString().slice(0, 10)})`,
      };
    }
    return null;
  }

  const row = await findExchangeRateRow(foreignCurrencyId, functionalId, asOfDate);
  if (row && Number(row.rate) > 0) {
    return { rate: Number(row.rate), description: `exchange_rates (${row.date.toISOString().slice(0, 10)})` };
  }
  const inv = await findExchangeRateRow(functionalId, foreignCurrencyId, asOfDate);
  if (inv && Number(inv.rate) > 0) {
    return {
      rate: 1 / Number(inv.rate),
      description: `exchange_rates inverted (${inv.date.toISOString().slice(0, 10)})`,
    };
  }
  return null;
}

export class UnrealizedFxReportService {
  /**
   * Month-end style report: open AR (unpaid invoice balance) valued at original post/sent rates vs current Zimrate/USD snapshot.
   */
  static async run(asOfDateInput?: Date): Promise<UnrealizedFxReportResult> {
    const asOfDate = asOfDateInput ? new Date(asOfDateInput) : new Date();
    asOfDate.setHours(23, 59, 59, 999);

    const functional = await resolveFunctionalCurrency();

    const [currentUsdZwg, zimFull] = await Promise.all([
      resolveUsdZwgAvgForSnapshot(prisma),
      fetchZimrateRates().catch(() => null),
    ]);
    const zarExtract = zimFull ? extractZwgPerZar(zimFull) : null;

    const openInvoices = await prisma.invoice.findMany({
      where: {
        isActive: true,
        outstandingAmount: { gt: 0 },
        status: { notIn: ['PAID', 'VOID', 'DRAFT', 'CANCELLED'] },
      },
      include: {
        currency: { select: { id: true, code: true } },
        customer: { select: { id: true, name: true } },
      },
      orderBy: { transactionDate: 'asc' },
    });

    const lines: UnrealizedFxLine[] = [];
    const excludedOpenItems: UnrealizedFxExcluded[] = [];

    let sumGain = new Decimal(0);
    let sumLoss = new Decimal(0);

    for (const inv of openInvoices) {
      const code = inv.currency.code.toUpperCase();
      const outstanding = new Decimal(inv.outstandingAmount);

      if (outstanding.lte(0)) continue;

      if (ZIG_CODES.has(code)) {
        excludedOpenItems.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          reason: 'Invoice already in functional currency — no FX remeasurement on open balance',
        });
        continue;
      }

      const hist = await functionalPerUnitForeign(
        inv.currencyId,
        functional.id,
        inv.transactionDate,
        inv,
        code
      );

      if (!hist) {
        excludedOpenItems.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          reason: `No historical rate to functional for ${code} (invoice snapshots and exchange_rates)`,
        });
        continue;
      }

      let currentZig: Decimal;
      try {
        currentZig = await amountToZig(prisma, outstanding, code);
      } catch {
        excludedOpenItems.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          reason: `Current rate unavailable for ${code} (Zimrate / USD resolver)`,
        });
        continue;
      }

      const origZig = outstanding.mul(hist.rate);
      const delta = currentZig.minus(origZig);
      const gainLossType: 'GAIN' | 'LOSS' | 'NONE' = delta.gt(0)
        ? 'GAIN'
        : delta.lt(0)
          ? 'LOSS'
          : 'NONE';

      if (delta.gt(0)) sumGain = sumGain.plus(delta);
      else if (delta.lt(0)) sumLoss = sumLoss.plus(delta.abs());

      let currentRateDesc = '';
      if (code === 'USD' && currentUsdZwg != null) {
        currentRateDesc = `Live USD→ZiG avg ${currentUsdZwg}`;
      } else if (code === 'ZAR' && zarExtract) {
        currentRateDesc = `Live Zimrate ${zarExtract.matchedPair} zwgPerZar=${zarExtract.zwgPerZar}`;
      } else {
        currentRateDesc = 'Live rate via amountToZig';
      }

      lines.push({
        itemType: 'OPEN_INVOICE_AR',
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        customerName: inv.customer.name,
        status: inv.status,
        invoiceCurrencyCode: code,
        outstandingAmount: outstanding.toFixed(2),
        originalFunctionalValue: origZig.toFixed(3),
        currentFunctionalValue: currentZig.toFixed(3),
        unrealizedGainLoss: delta.abs().toFixed(3),
        gainLossType,
        originalRateDescription: `${hist.description} (rate ${hist.rate})`,
        currentRateDescription: currentRateDesc,
      });
    }

    const net = sumGain.minus(sumLoss);

    return {
      reportType: 'UNREALIZED_FX_OPEN_AR',
      asOfDate: asOfDate.toISOString(),
      functionalCurrencyCode: functional.code,
      valuationCurrencyCode: 'ZWL',
      currentRates: {
        usdToZig: currentUsdZwg,
        zwgPerZar: zarExtract?.zwgPerZar ?? null,
        zimrateZarPair: zarExtract?.matchedPair ?? null,
      },
      lines,
      excludedOpenItems,
      totals: {
        unrealizedGain: sumGain.toFixed(3),
        unrealizedLoss: sumLoss.toFixed(3),
        netUnrealized: net.toFixed(3),
      },
    };
  }
}
