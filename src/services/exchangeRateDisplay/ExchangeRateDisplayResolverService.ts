// @ts-nocheck
import { ExchangeRateDisplayConfigService } from "./ExchangeRateDisplayConfigService";
import { ExchangeRateQuoteService } from "./ExchangeRateQuoteService";

function parseDateInput(raw?: string): Date | undefined {
  if (!raw?.trim()) return undefined;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function fmt(n: number | string | null | undefined, decimals = 2): string | null {
  if (n == null || n === "") return null;
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return v.toFixed(decimals);
}

function spread(primaryAvg: number, comparisonAvg: number) {
  const spreadAbsolute = primaryAvg - comparisonAvg;
  const spreadPct = comparisonAvg !== 0 ? (spreadAbsolute / comparisonAvg) * 100 : null;
  return { spreadAbsolute, spreadPct };
}

export class ExchangeRateDisplayResolverService {
  static async resolveWidget(params: {
    context?: string;
    from?: string;
    to?: string;
    asOfDate?: string;
  }) {
    const context = (params.context || "GENERIC").toUpperCase();
    const from = (params.from || "USD").toUpperCase();
    const to = (params.to || "ZWG").toUpperCase();
    const asOf = parseDateInput(params.asOfDate);

    const cfg =
      (await ExchangeRateDisplayConfigService.getForContext(context, from, to)) ||
      (await ExchangeRateDisplayConfigService.getForContext("GENERIC", from, to));

    const primarySource = cfg?.primarySourceCode || "ZIMRATE_STREET";
    const comparisonSource = cfg?.comparisonSourceCode || "ZIMRATE_OFFICIAL";
    const displayFormat = (cfg?.displayFormat as Record<string, unknown>) || {};
    const decimals = Number(displayFormat.decimals ?? 2);

    const primaryQuote = await ExchangeRateQuoteService.getLatestQuote(primarySource, from, to, asOf);
    const comparisonQuote = comparisonSource
      ? await ExchangeRateQuoteService.getLatestQuote(comparisonSource, from, to, asOf)
      : null;

    const primaryAvg = primaryQuote ? Number(primaryQuote.avg) : null;
    const comparisonAvg = comparisonQuote ? Number(comparisonQuote.avg) : null;

    const spreadInfo =
      primaryAvg != null && comparisonAvg != null ? spread(primaryAvg, comparisonAvg) : null;

    const label =
      primarySource === "ZIMRATE_STREET"
        ? "Street rate"
        : primarySource === "ZIMRATE_OFFICIAL"
          ? "Official rate"
          : primarySource;

    return {
      pair: `${from}/${to}`,
      asOfDate: primaryQuote
        ? ExchangeRateQuoteService.formatQuote(primaryQuote)?.asOfDate
        : asOf?.toISOString().slice(0, 10) ?? null,
      context,
      primary: primaryQuote
        ? {
            source: primarySource,
            label,
            avg: fmt(primaryQuote.avg, decimals),
            bid: fmt(primaryQuote.bid, decimals),
            ask: fmt(primaryQuote.ask, decimals),
            changePct: primaryQuote.changePct != null ? Number(primaryQuote.changePct) : null,
            format: String(displayFormat.labelTemplate || `${to} per 1 ${from}`),
          }
        : null,
      comparison: comparisonQuote
        ? {
            source: comparisonSource,
            avg: fmt(comparisonQuote.avg, decimals),
            spreadAbsolute: spreadInfo ? fmt(spreadInfo.spreadAbsolute, decimals) : null,
            spreadPct: spreadInfo?.spreadPct != null ? Number(spreadInfo.spreadPct.toFixed(2)) : null,
          }
        : null,
      meta: {
        fetchedAt: primaryQuote?.fetchedAt ?? null,
        stale: ExchangeRateQuoteService.isStale(primaryQuote?.fetchedAt),
        configId: cfg?.id ?? null,
      },
    };
  }

  static async compare(params: {
    from?: string;
    to?: string;
    asOfDate?: string;
    streetSource?: string;
    officialSource?: string;
  }) {
    const from = (params.from || "USD").toUpperCase();
    const to = (params.to || "ZWG").toUpperCase();
    const asOf = parseDateInput(params.asOfDate);
    const streetSource = params.streetSource || "ZIMRATE_STREET";
    const officialSource = params.officialSource || "ZIMRATE_OFFICIAL";

    const street = await ExchangeRateQuoteService.getLatestQuote(streetSource, from, to, asOf);
    const official = await ExchangeRateQuoteService.getLatestQuote(officialSource, from, to, asOf);

    const streetAvg = street ? Number(street.avg) : null;
    const officialAvg = official ? Number(official.avg) : null;
    const spreadInfo =
      streetAvg != null && officialAvg != null ? spread(streetAvg, officialAvg) : null;

    return {
      pair: `${from}/${to}`,
      asOfDate: street?.asOfDate ?? official?.asOfDate ?? null,
      street: ExchangeRateQuoteService.formatQuote(street),
      official: ExchangeRateQuoteService.formatQuote(official),
      spread: spreadInfo
        ? {
            absolute: spreadInfo.spreadAbsolute,
            pct: spreadInfo.spreadPct != null ? Number(spreadInfo.spreadPct.toFixed(2)) : null,
          }
        : null,
      meta: {
        streetStale: ExchangeRateQuoteService.isStale(street?.fetchedAt),
        officialStale: ExchangeRateQuoteService.isStale(official?.fetchedAt),
      },
    };
  }
}
