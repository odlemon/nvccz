import type { NormalisedTick } from "./MarketDataIngestService";

/** Pluggable market data provider (licensed REST/streaming or manual). */
export interface MarketDataProviderAdapter {
  readonly providerCode: string;
  readonly tickFrequency: "LIVE" | "DELAYED_15M" | "EOD";
  normalisePayload(body: unknown): NormalisedTick[];
}

/** v1 manual / admin JSON ingress — no licensed feed required. */
export class ManualMarketDataAdapter implements MarketDataProviderAdapter {
  readonly providerCode: string;
  readonly tickFrequency = "EOD" as const;

  constructor(providerCode = "MANUAL") {
    this.providerCode = providerCode.toUpperCase();
  }

  normalisePayload(body: unknown): NormalisedTick[] {
    const rows = Array.isArray(body) ? body : (body as { ticks?: unknown[] })?.ticks || [(body as object)];
    const pricedAt = new Date();
    const ticks: NormalisedTick[] = [];
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      const symbol = String(r.symbol || r.ticker || "").toUpperCase();
      const price = Number(r.price ?? r.close ?? r.value);
      if (!symbol || !Number.isFinite(price)) continue;
      ticks.push({
        symbol,
        exchangeCode: String(r.exchangeCode || r.exchange || this.providerCode).toUpperCase(),
        priceType: String(r.priceType || "CLOSE").toUpperCase(),
        price,
        pricedAt: r.pricedAt ? new Date(String(r.pricedAt)) : pricedAt,
        tickFrequency: String(r.tickFrequency || this.tickFrequency),
      });
    }
    return ticks;
  }
}

/** Mansa Markets API — pan-African exchange quotes (ZSE via ZIMBABWE). */
export class MansaMarketDataAdapter implements MarketDataProviderAdapter {
  readonly providerCode: string;
  readonly tickFrequency = "DELAYED_15M" as const;

  constructor(arcusExchangeCode: string) {
    this.providerCode = arcusExchangeCode.toUpperCase();
  }

  normaliseMansaStocks(
    stocks: Array<{
      ticker: string;
      price: number;
      scraped_at?: string;
    }>,
    pricedAt: Date,
    listingExchangeCode: string
  ): NormalisedTick[] {
    const ticks: NormalisedTick[] = [];
    for (const row of stocks) {
      const symbol = String(row.ticker || "").toUpperCase();
      const price = Number(row.price);
      if (!symbol || !Number.isFinite(price)) continue;
      const at = row.scraped_at ? new Date(row.scraped_at) : pricedAt;
      ticks.push({
        symbol,
        exchangeCode: listingExchangeCode,
        priceType: "CLOSE",
        price,
        pricedAt: at,
        tickFrequency: this.tickFrequency,
      });
    }
    return ticks;
  }

  normalisePayload(): NormalisedTick[] {
    return [];
  }
}

/** Webhook provider — maps vendor symbols via DB cross-ref in controller. */
export class WebhookMarketDataAdapter implements MarketDataProviderAdapter {
  readonly providerCode: string;
  readonly tickFrequency: "LIVE" | "DELAYED_15M" | "EOD";

  constructor(providerCode: string, tickFrequency: "LIVE" | "DELAYED_15M" | "EOD" = "LIVE") {
    this.providerCode = providerCode.toUpperCase();
    this.tickFrequency = tickFrequency;
  }

  normalisePayload(body: unknown): NormalisedTick[] {
    const manual = new ManualMarketDataAdapter(this.providerCode);
    return manual.normalisePayload(body).map((t) => ({
      ...t,
      tickFrequency: t.tickFrequency || this.tickFrequency,
    }));
  }
}
