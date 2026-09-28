// @ts-nocheck
import { prisma } from "../../utils/database";

/**
 * SRD §38: how procurement figures in different currencies are brought together.
 *
 * Nothing here ever adds two currencies as if they were one. A total over mixed-currency records is returned in two parts:
 *   - `byCurrency`: each currency's own total, always;
 *   - `converted`: those totals converted into the reporting currency through an explicit rate (the rate, its date, its source
 *     and how it was reached are returned beside the figure, so the page can show them), and
 *   - `unconverted`: the currencies for which no usable rate exists, listed on their own and left out of the converted total.
 *
 * The exchange-rate source is configurable (procurement_settings.fx_source):
 *   TABLE : rates held in exchange_rates (entered by a person, or imported), the default;
 *   URL   : a JSON endpoint (procurement_settings.fx_source_url, with {date}, {from} and {to} placeholders) returning
 *           { "rate": n } or { "rates": { "<TO>": n } }; fetched rates are stored in exchange_rates with their source, so
 *           every figure can still say which rate it used.
 * A rate older than fx_max_age_days is not used: the currency is reported as unconverted rather than converted at a stale rate.
 */
export type RateResult = { rate: number; date: string; source: string; method: "IDENTITY" | "DIRECT" | "INVERSE" | "CROSS"; via?: string; ageDays: number };

const day = (d: Date) => d.toISOString().slice(0, 10);

export class FxService {
  static async settings(client: any = prisma) {
    const s: any = await client.procurementSettings.findUnique({ where: { id: "default" } }).catch(() => null);
    let reporting = s?.reportingCurrencyCode ? String(s.reportingCurrencyCode).toUpperCase() : "";
    if (!reporting) {
      const def = await client.currency.findFirst({ where: { isDefault: true }, select: { code: true } }).catch(() => null);
      reporting = def?.code ?? "USD";
    }
    return {
      reportingCurrency: reporting,
      source: String(s?.fxSource || "TABLE").toUpperCase() === "URL" ? "URL" : "TABLE",
      sourceUrl: s?.fxSourceUrl ?? null,
      maxAgeDays: Number(s?.fxMaxAgeDays ?? 30),
    };
  }

  private static async currencyId(client: any, code: string) {
    const c = await client.currency.findUnique({ where: { code: String(code).toUpperCase() }, select: { id: true } }).catch(() => null);
    return c?.id ?? null;
  }

  /** The latest stored rate `from → to` on or before `at`, within the allowed age. */
  private static async stored(client: any, fromCode: string, toCode: string, at: Date, maxAgeDays: number) {
    const [fromId, toId] = await Promise.all([this.currencyId(client, fromCode), this.currencyId(client, toCode)]);
    if (!fromId || !toId) return null;
    const row: any = await client.exchangeRate.findFirst({ where: { fromCurrencyId: fromId, toCurrencyId: toId, isActive: true, date: { lte: at } }, orderBy: { date: "desc" } });
    if (!row) return null;
    const ageDays = Math.floor((at.getTime() - new Date(row.date).getTime()) / 86400000);
    if (ageDays > maxAgeDays) return null;
    return { rate: Number(row.rate), date: day(new Date(row.date)), source: row.source || "TABLE", ageDays };
  }

  /** The rate to turn `from` into `to` at a date, or null when there is none that may be used. */
  static async rate(from: string, to: string, at: Date = new Date(), client: any = prisma): Promise<RateResult | null> {
    const f = String(from).toUpperCase();
    const t = String(to).toUpperCase();
    if (f === t) return { rate: 1, date: day(at), source: "SAME_CURRENCY", method: "IDENTITY", ageDays: 0 };
    const cfg = await this.settings(client);
    const direct = await this.stored(client, f, t, at, cfg.maxAgeDays);
    if (direct) return { ...direct, method: "DIRECT" };
    const inverse = await this.stored(client, t, f, at, cfg.maxAgeDays);
    if (inverse && inverse.rate) return { rate: 1 / inverse.rate, date: inverse.date, source: inverse.source, method: "INVERSE", ageDays: inverse.ageDays };
    // through the reporting currency (USD → EUR by way of USD → ZWG → EUR is never guessed: only via the one currency the books report in)
    const via = cfg.reportingCurrency;
    if (via !== f && via !== t) {
      const a = (await this.stored(client, f, via, at, cfg.maxAgeDays)) ?? (await this.stored(client, via, f, at, cfg.maxAgeDays).then((x) => (x ? { ...x, rate: 1 / x.rate } : null)));
      const b = (await this.stored(client, via, t, at, cfg.maxAgeDays)) ?? (await this.stored(client, t, via, at, cfg.maxAgeDays).then((x) => (x ? { ...x, rate: 1 / x.rate } : null)));
      if (a && b) return { rate: a.rate * b.rate, date: a.date < b.date ? a.date : b.date, source: a.source === b.source ? a.source : "MIXED", method: "CROSS", via, ageDays: Math.max(a.ageDays, b.ageDays) };
    }
    if (cfg.source === "URL" && cfg.sourceUrl) {
      const fetched = await this.fetchFromUrl(client, cfg.sourceUrl, f, t, at);
      if (fetched) return fetched;
    }
    return null;
  }

  /** Reads one rate from the configured endpoint and stores it (with its source) so it is on record for every figure that uses it. */
  private static async fetchFromUrl(client: any, template: string, from: string, to: string, at: Date): Promise<RateResult | null> {
    try {
      const url = template.replace(/\{date\}/g, day(at)).replace(/\{from\}/g, from).replace(/\{to\}/g, to);
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const body: any = await res.json();
      const rate = Number(body?.rate ?? body?.rates?.[to] ?? body?.conversion_rates?.[to]);
      if (!Number.isFinite(rate) || rate <= 0) return null;
      const [fromId, toId] = await Promise.all([this.currencyId(client, from), this.currencyId(client, to)]);
      const actor = await client.user.findFirst({ where: { role: { name: "admin" } }, select: { id: true } }).catch(() => null);
      if (fromId && toId && actor) {
        const d = new Date(day(at));
        await client.exchangeRate.upsert({
          where: { date_fromCurrencyId_toCurrencyId: { date: d, fromCurrencyId: fromId, toCurrencyId: toId } },
          update: { rate, isActive: true, source: "URL" },
          create: { date: d, fromCurrencyId: fromId, toCurrencyId: toId, rate, createdById: actor.id, source: "URL" },
        }).catch(() => undefined);
      }
      return { rate, date: day(at), source: "URL", method: "DIRECT", ageDays: 0 };
    } catch (_e) {
      return null;
    }
  }

  static async convert(amount: number, from: string, to: string, at: Date = new Date(), client: any = prisma) {
    const r = await this.rate(from, to, at, client);
    if (!r) return { converted: false as const, amount: null, currency: String(to).toUpperCase(), rate: null };
    return { converted: true as const, amount: Math.round(Number(amount) * r.rate * 100) / 100, currency: String(to).toUpperCase(), rate: r };
  }

  /**
   * A total over records in any mix of currencies: each currency on its own, the converted total in the target currency with the
   * rates used, and the currencies that could not be converted. Never a bare sum across currencies.
   */
  static async consolidate(rows: Array<{ amount: any; currency: string | null | undefined }>, opts: { to?: string; at?: Date; client?: any } = {}) {
    const client = opts.client ?? prisma;
    const cfg = await this.settings(client);
    const target = String(opts.to || cfg.reportingCurrency).toUpperCase();
    const at = opts.at ?? new Date();
    const byCurrency: Record<string, { amount: number; count: number }> = {};
    for (const r of rows) {
      const code = String(r.currency || "").toUpperCase() || "UNSPECIFIED";
      const b = (byCurrency[code] ||= { amount: 0, count: 0 });
      b.amount = Math.round((b.amount + Number(r.amount || 0)) * 100) / 100;
      b.count += 1;
    }
    const codes = Object.keys(byCurrency);
    const converted: { total: number; currency: string; rates: Array<{ from: string; to: string; rate: number; date: string; source: string; method: string; via?: string }> } = { total: 0, currency: target, rates: [] };
    const unconverted: Record<string, { amount: number; count: number }> = {};
    for (const code of codes) {
      if (code === "UNSPECIFIED") { unconverted[code] = byCurrency[code]; continue; }
      const r = await this.rate(code, target, at, client);
      if (!r) { unconverted[code] = byCurrency[code]; continue; }
      converted.total = Math.round((converted.total + byCurrency[code].amount * r.rate) * 100) / 100;
      if (code !== target) converted.rates.push({ from: code, to: target, rate: r.rate, date: r.date, source: r.source, method: r.method, via: r.via });
    }
    return { mixed: codes.length > 1, targetCurrency: target, byCurrency, converted, unconverted, hasUnconverted: Object.keys(unconverted).length > 0 };
  }
}
