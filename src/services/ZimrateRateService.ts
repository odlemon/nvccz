import axios from 'axios';
import { marketDataHttpsAgent } from './listedEquity/listedEquityExternalFetch';

const DEFAULT_ZIMRATE_URL = 'https://zimrate.statotec.com/api/v1/rates';
const ZIMRATE_WEBSITE_URL = 'https://zimrate.com/';

/** Zimrate Bearer token (embedded; API requires `Authorization: Bearer …`). */
const ZIMRATE_API_KEY = 'zr_df58266e02479a52d6581a2a52533527';

function zimrateAxiosOptions() {
  const agent = marketDataHttpsAgent();
  return {
    timeout: 15_000 as const,
    validateStatus: () => true as const,
    ...(agent ? { httpsAgent: agent } : {}),
  };
}

export interface ZimrateUsdZwgRow {
  currency_pair: string;
  bid: number;
  ask: number;
  avg: number;
  date_label: string;
  previous_avg?: number;
  change_pct?: number;
  /** OFFICIAL | STREET when parsed from zimrate.com */
  rate_type?: 'OFFICIAL' | 'STREET';
}

export interface ZimrateRatesPayload {
  data: { rates: ZimrateUsdZwgRow[] };
  meta: {
    last_updated: string;
    count: number;
    timestamp: string;
  };
}

export function parseLabeledRateFromHtml(html: string, labelPattern: RegExp): number | null {
  const m = html.match(labelPattern);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseOfficialAndStreetFromHtml(html: string): {
  official: number | null;
  street: number | null;
} {
  let official: number | null = null;
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const block of ldBlocks) {
    try {
      const parsed = JSON.parse(block[1]);
      const nodes = parsed['@graph'] || [parsed];
      for (const node of nodes) {
        if (node['@type'] === 'ExchangeRateSpecification') {
          const price = Number(node?.currentExchangeRate?.price);
          if (Number.isFinite(price) && price > 0) official = price;
        }
      }
    } catch {
      /* skip */
    }
  }

  if (official == null) {
    official = parseLabeledRateFromHtml(
      html,
      /Official Rate[\s\S]{0,500}?([\d]{1,4}(?:\.[\d]+)?)\s*ZiG/i
    );
  }

  let street =
    parseLabeledRateFromHtml(html, /Street Rate[\s\S]{0,500}?([\d]{1,4}(?:\.[\d]+)?)\s*ZiG/i) ??
    parseLabeledRateFromHtml(html, /Parallel[\s\S]{0,500}?([\d]{1,4}(?:\.[\d]+)?)\s*ZiG/i) ??
    parseLabeledRateFromHtml(html, /Black Market[\s\S]{0,500}?([\d]{1,4}(?:\.[\d]+)?)\s*ZiG/i);

  if (street == null && official != null) {
    const allRates = [...html.matchAll(/([\d]{1,4}\.[\d]+)\s*ZiG/gi)].map((x) => Number(x[1])).filter((n) => n > 0);
    const distinct = [...new Set(allRates)].sort((a, b) => b - a);
    if (distinct.length >= 2 && official > 0) {
      const candidate = distinct.find((n) => Math.abs(n - official) / official > 0.02);
      if (candidate) street = candidate;
    }
  }

  return { official, street };
}

function rowFromAvg(
  avg: number,
  rateType: 'OFFICIAL' | 'STREET',
  dateLabel: string,
  previousAvg?: number,
  changePct?: number
): ZimrateUsdZwgRow {
  return {
    currency_pair: 'USD/ZWG',
    bid: avg,
    ask: avg,
    avg,
    date_label: dateLabel,
    rate_type: rateType,
    previous_avg: previousAvg,
    change_pct: changePct,
  };
}

/**
 * Scrape official + street USD/ZWG from https://zimrate.com/ (JSON-LD + visible rate cards).
 */
export async function fetchZimrateRatesFromWebsite(): Promise<ZimrateRatesPayload> {
  const { data } = await axios.get<string>(ZIMRATE_WEBSITE_URL, {
    ...zimrateAxiosOptions(),
    headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 (compatible; Arcus/1.0)' },
    responseType: 'text',
  });
  const html = typeof data === 'string' ? data : String(data);
  if (!html?.trim()) throw new Error('Empty Zimrate website response');

  const { official, street } = parseOfficialAndStreetFromHtml(html);
  if (official == null || !Number.isFinite(official) || official <= 0) {
    throw new Error('Could not parse official USD/ZWG from zimrate.com');
  }

  const now = new Date();
  const dateLabel = now.toISOString().slice(0, 10);
  const rates: ZimrateUsdZwgRow[] = [rowFromAvg(official, 'OFFICIAL', dateLabel)];
  if (street != null && Number.isFinite(street) && street > 0) {
    rates.push(rowFromAvg(street, 'STREET', dateLabel));
  }

  return {
    data: { rates },
    meta: {
      last_updated: now.toISOString(),
      count: rates.length,
      timestamp: now.toISOString(),
    },
  };
}

/**
 * Full Zimrate response (all pairs). Use pickUsdZwg for USD/ZWG only.
 * Primary: https://zimrate.com/ scrape; fallback: Statotec API.
 */
export async function fetchZimrateRates(): Promise<ZimrateRatesPayload> {
  try {
    return await fetchZimrateRatesFromWebsite();
  } catch (webErr) {
    console.warn('[ZimrateRateService] zimrate.com scrape failed, trying API:', webErr);
  }
  const url = process.env.ZIMRATE_RATES_URL?.trim() || DEFAULT_ZIMRATE_URL;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${ZIMRATE_API_KEY}`,
  };
  const { data, status } = await axios.get<ZimrateRatesPayload>(url, {
    ...zimrateAxiosOptions(),
    headers,
  });
  if (status < 200 || status >= 300) {
    throw new Error(`Zimrate HTTP ${status}`);
  }
  if (!data?.data?.rates || !Array.isArray(data.data.rates)) {
    throw new Error('Invalid Zimrate response shape');
  }
  if (!data.meta) {
    throw new Error('Invalid Zimrate response: missing meta');
  }
  return data;
}

export function pickUsdZwg(payload: ZimrateRatesPayload): ZimrateUsdZwgRow | null {
  const row = payload.data.rates.find(
    (r) =>
      r.currency_pair?.trim().toUpperCase() === 'USD/ZWG' &&
      (!r.rate_type || r.rate_type === 'OFFICIAL')
  );
  if (row) return row;
  return payload.data.rates.find((r) => r.currency_pair?.trim().toUpperCase() === 'USD/ZWG') ?? null;
}

export function pickUsdZwgStreet(payload: ZimrateRatesPayload): ZimrateUsdZwgRow | null {
  return (
    payload.data.rates.find(
      (r) => r.currency_pair?.trim().toUpperCase() === 'USD/ZWG' && r.rate_type === 'STREET'
    ) ?? null
  );
}

export function pickUsdZwgOfficial(payload: ZimrateRatesPayload): ZimrateUsdZwgRow | null {
  return (
    payload.data.rates.find(
      (r) => r.currency_pair?.trim().toUpperCase() === 'USD/ZWG' && r.rate_type === 'OFFICIAL'
    ) ?? pickUsdZwg(payload)
  );
}

/**
 * ZWG (or ZWL) per 1 ZAR — same convention as USD/ZWG (ZWG per 1 USD).
 * Supports ZAR/ZWG, ZAR/ZWL from API, or inverts ZWG/ZAR / ZWL/ZAR when the API only publishes ZAR per ZWG.
 */
export function extractZwgPerZar(
  payload: ZimrateRatesPayload
): { zwgPerZar: number; row: ZimrateUsdZwgRow; matchedPair: string } | null {
  const rates = payload.data.rates;

  const tryZwgPerUnit = (pair: string): ZimrateUsdZwgRow | null => {
    const row = rates.find((r) => r.currency_pair?.trim().toUpperCase() === pair);
    if (!row || typeof row.avg !== 'number' || Number.isNaN(row.avg) || row.avg <= 0) {
      return null;
    }
    return row;
  };

  for (const p of ['ZAR/ZWG', 'ZAR/ZWL'] as const) {
    const row = tryZwgPerUnit(p);
    if (row) {
      return { zwgPerZar: row.avg, row, matchedPair: p };
    }
  }

  for (const p of ['ZWG/ZAR', 'ZWL/ZAR'] as const) {
    const row = tryZwgPerUnit(p);
    if (row) {
      return { zwgPerZar: 1 / row.avg, row, matchedPair: p };
    }
  }

  return null;
}

/** `date_label` from API is DD-MM-YYYY */
export function parseZimrateDateLabel(label: string | undefined): Date | null {
  if (!label?.trim()) return null;
  const parts = label.trim().split('-');
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  let y = parseInt(parts[2], 10);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
  // A malformed upstream label has been seen with a 2-digit year (e.g. "16-02-19"). Date.UTC
  // applies its legacy rule for 0-99 ("1900 + year"), which silently produced 1919 instead of
  // 2019 -- a street rate dated over a century ago, shown as-is on the live dashboard. This
  // system only ever deals with dates from the 2000s onward, so treat any 2-digit year as 2000+y.
  if (y >= 0 && y < 100) y += 2000;
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Same shape as Zimrate JSON: { data: { rates }, meta }, with only USD/ZWG in rates.
 */
export async function getLiveUsdZwgRatesPayload(): Promise<ZimrateRatesPayload> {
  const full = await fetchZimrateRates();
  const row = pickUsdZwg(full);
  if (!row) {
    throw new Error('USD/ZWG rate not returned by Zimrate');
  }
  return {
    data: { rates: [row] },
    meta: full.meta
  };
}

/**
 * Zimrate API only (no DB fallback). For middleware and GET /exchange-rates use UsdZwgRateResolver.
 */
export async function fetchUsdZwgAvgForSnapshot(): Promise<number | null> {
  try {
    const full = await fetchZimrateRates();
    const row = pickUsdZwg(full);
    if (!row || typeof row.avg !== 'number' || Number.isNaN(row.avg)) {
      return null;
    }
    return row.avg;
  } catch (e) {
    console.warn('[ZimrateRateService] snapshot fetch failed:', e);
    return null;
  }
}

/** @deprecated use fetchUsdZwgAvgForSnapshot */
export const fetchUsdZwgAvgForJournalSnapshot = fetchUsdZwgAvgForSnapshot;
