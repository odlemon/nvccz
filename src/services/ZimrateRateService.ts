import axios from 'axios';

const DEFAULT_ZIMRATE_URL = 'https://zimrate.statotec.com/api/v1/rates';

export interface ZimrateUsdZwgRow {
  currency_pair: string;
  bid: number;
  ask: number;
  avg: number;
  date_label: string;
  previous_avg?: number;
  change_pct?: number;
}

export interface ZimrateRatesPayload {
  data: { rates: ZimrateUsdZwgRow[] };
  meta: {
    last_updated: string;
    count: number;
    timestamp: string;
  };
}

/**
 * Full Zimrate response (all pairs). Use pickUsdZwg for USD/ZWG only.
 */
export async function fetchZimrateRates(): Promise<ZimrateRatesPayload> {
  const url = process.env.ZIMRATE_RATES_URL?.trim() || DEFAULT_ZIMRATE_URL;
  const headers: Record<string, string> = { Accept: 'application/json' };
  const authHeader = process.env.ZIMRATE_AUTHORIZATION?.trim();
  if (authHeader) {
    headers.Authorization = authHeader;
  } else {
    const apiKey = process.env.ZIMRATE_API_KEY?.trim();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
  }
  const { data, status } = await axios.get<ZimrateRatesPayload>(url, {
    timeout: 15_000,
    headers,
    validateStatus: () => true
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
    (r) => r.currency_pair?.trim().toUpperCase() === 'USD/ZWG'
  );
  return row ?? null;
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
  const y = parseInt(parts[2], 10);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
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
