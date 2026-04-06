import type { PrismaClient } from '@prisma/client';
import {
  fetchZimrateRates,
  pickUsdZwg,
  type ZimrateRatesPayload,
  type ZimrateUsdZwgRow
} from './ZimrateRateService';

/**
 * Live Zimrate first. When `UAT_ZIMRATE_FALLBACK=1`, on failure builds a minimal payload from the last
 * USD/ZWG snapshot in the DB plus `UAT_STUB_ZWG_PER_ZAR` (ZWG per 1 ZAR) so USD→ZAR invoice UATs can run offline.
 */
export async function fetchZimrateRatesOrUatFallback(client: PrismaClient): Promise<ZimrateRatesPayload> {
  try {
    return await fetchZimrateRates();
  } catch (e) {
    if (process.env.UAT_ZIMRATE_FALLBACK !== "1") {
      throw e;
    }
    const stored = await getLastStoredUsdZwgFromDb(client);
    if (!stored) {
      throw e;
    }
    const usd = stored.rate;
    const zwgPerZar = Number(process.env.UAT_STUB_ZWG_PER_ZAR ?? "1.65");
    if (!Number.isFinite(zwgPerZar) || zwgPerZar <= 0) {
      throw new Error("UAT_STUB_ZWG_PER_ZAR must be a positive number (ZWG per 1 ZAR)");
    }
    console.warn(
      "[fetchZimrateRatesOrUatFallback] live Zimrate failed; using DB USD/ZWG snapshot + synthetic ZAR/ZWG (UAT only)"
    );
    return {
      data: {
        rates: [
          {
            currency_pair: "USD/ZWG",
            bid: usd,
            ask: usd,
            avg: usd,
            date_label: "uat-fallback"
          },
          {
            currency_pair: "ZAR/ZWG",
            bid: zwgPerZar,
            ask: zwgPerZar,
            avg: zwgPerZar,
            date_label: "uat-fallback"
          }
        ]
      },
      meta: {
        last_updated: "",
        count: 2,
        timestamp: new Date().toISOString()
      }
    };
  }
}

export type UsdZwgResolved =
  | { source: 'zimrate'; row: ZimrateUsdZwgRow; meta: ZimrateRatesPayload['meta'] }
  | { source: 'stored'; rate: number; usedAt: Date };

/**
 * Latest non-null USD/ZWG snapshot saved on any accounting row (same columns the middleware fills).
 */
export async function getLastStoredUsdZwgFromDb(
  client: PrismaClient
): Promise<{ rate: number; usedAt: Date } | null> {
  try {
    const rows = await client.$queryRawUnsafe<Array<{ r: unknown; ts: unknown }>>(`
      SELECT r, ts FROM (
        SELECT \`usd_zwg_rate_snapshot\` + 0 AS r, \`createdAt\` AS ts FROM \`journal_entries\`
          WHERE \`usd_zwg_rate_snapshot\` IS NOT NULL
        UNION ALL
        SELECT \`usd_zwg_rate_snapshot\` + 0, \`createdAt\` FROM \`expenses\`
          WHERE \`usd_zwg_rate_snapshot\` IS NOT NULL
        UNION ALL
        SELECT \`usd_zwg_rate_snapshot\` + 0, \`createdAt\` FROM \`revenues\`
          WHERE \`usd_zwg_rate_snapshot\` IS NOT NULL
        UNION ALL
        SELECT \`usd_zwg_rate_snapshot\` + 0, \`createdAt\` FROM \`invoices\`
          WHERE \`usd_zwg_rate_snapshot\` IS NOT NULL
        UNION ALL
        SELECT \`usd_zwg_rate_snapshot\` + 0, \`created_at\` FROM \`purchase_invoices\`
          WHERE \`usd_zwg_rate_snapshot\` IS NOT NULL
        UNION ALL
        SELECT \`usd_zwg_rate_snapshot\` + 0, \`createdAt\` FROM \`procurement_invoices\`
          WHERE \`usd_zwg_rate_snapshot\` IS NOT NULL
        UNION ALL
        SELECT \`usd_zwg_rate_snapshot\` + 0, \`createdAt\` FROM \`credit_notes\`
          WHERE \`usd_zwg_rate_snapshot\` IS NOT NULL
        UNION ALL
        SELECT \`usd_zwg_rate_snapshot\` + 0, \`createdAt\` FROM \`cashbook_entries\`
          WHERE \`usd_zwg_rate_snapshot\` IS NOT NULL
        UNION ALL
        SELECT \`usd_zwg_rate_snapshot\` + 0, \`createdAt\` FROM \`assets\`
          WHERE \`usd_zwg_rate_snapshot\` IS NOT NULL
        UNION ALL
        SELECT \`usd_zwg_rate_snapshot\` + 0, \`createdAt\` FROM \`stock_movements\`
          WHERE \`usd_zwg_rate_snapshot\` IS NOT NULL
        UNION ALL
        SELECT \`usd_zwg_rate_snapshot\` + 0, \`createdAt\` FROM \`inventory_items\`
          WHERE \`usd_zwg_rate_snapshot\` IS NOT NULL
        UNION ALL
        SELECT \`usd_zwg_rate_snapshot\` + 0, \`createdAt\` FROM \`depreciation_records\`
          WHERE \`usd_zwg_rate_snapshot\` IS NOT NULL
        UNION ALL
        SELECT \`usd_zwg_rate_snapshot\` + 0, \`createdAt\` FROM \`asset_disposal_records\`
          WHERE \`usd_zwg_rate_snapshot\` IS NOT NULL
      ) AS x
      WHERE r IS NOT NULL AND r > 0
      ORDER BY ts DESC
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) return null;
    const rate = Number(row.r);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    const usedAt = row.ts instanceof Date ? row.ts : new Date(String(row.ts));
    if (Number.isNaN(usedAt.getTime())) return null;
    return { rate, usedAt };
  } catch (e) {
    console.warn('[UsdZwgRateResolver] last stored rate query failed:', e);
    return null;
  }
}

export async function resolveUsdZwgWithSource(client: PrismaClient): Promise<UsdZwgResolved | null> {
  try {
    const full = await fetchZimrateRates();
    const row = pickUsdZwg(full);
    if (row && typeof row.avg === 'number' && !Number.isNaN(row.avg)) {
      return { source: 'zimrate', row, meta: full.meta };
    }
    console.warn('[UsdZwgRateResolver] Zimrate response missing USD/ZWG; trying stored rate');
  } catch (e) {
    console.warn('[UsdZwgRateResolver] Zimrate unavailable:', e);
  }

  const stored = await getLastStoredUsdZwgFromDb(client);
  if (stored) {
    console.warn(
      `[UsdZwgRateResolver] using last transaction snapshot rate ${stored.rate} from ${stored.usedAt.toISOString()}`
    );
    return { source: 'stored', rate: stored.rate, usedAt: stored.usedAt };
  }
  return null;
}

// Short-lived cache so bulk operations (e.g. backfill) don't hammer Zimrate on every DB write
let _cachedAvg: { value: number; expiresAt: number } | null = null;
const RATE_CACHE_TTL_MS = 60_000;

/**
 * For Prisma middleware: numeric avg or null. Cached for 60 s.
 * Prefer last stored DB snapshot first so journal/cashbook creates stay fast (Zimrate can take 30s+ or hang on slow networks).
 * Fall back to live Zimrate + stored only when nothing exists in DB yet.
 */
export async function resolveUsdZwgAvgForSnapshot(client: PrismaClient): Promise<number | null> {
  if (_cachedAvg && Date.now() < _cachedAvg.expiresAt) {
    return _cachedAvg.value;
  }
  const fromDb = await getLastStoredUsdZwgFromDb(client);
  if (fromDb && Number.isFinite(fromDb.rate) && fromDb.rate > 0) {
    _cachedAvg = { value: fromDb.rate, expiresAt: Date.now() + RATE_CACHE_TTL_MS };
    return fromDb.rate;
  }
  const r = await resolveUsdZwgWithSource(client);
  if (!r) return null;
  const value = r.source === 'zimrate' ? r.row.avg : r.rate;
  _cachedAvg = { value, expiresAt: Date.now() + RATE_CACHE_TTL_MS };
  return value;
}

/** Force-invalidate the rate cache (call after manual rate updates). */
export function invalidateUsdZwgRateCache(): void {
  _cachedAvg = null;
}
