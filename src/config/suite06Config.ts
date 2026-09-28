//@ts-nocheck
/** Suite 06 — AI-assisted invoice extraction and 3-way match thresholds (settings + env). */
import { prisma } from "../utils/database";

let cachedMatchPct: { at: number; value: number } | null = null;

/** Prefer ProcurementSettings.matchPriceVariancePct; fall back to env then 2%. */
export async function resolveMatchPriceVariancePct(): Promise<number> {
  const now = Date.now();
  if (cachedMatchPct && now - cachedMatchPct.at < 30_000) return cachedMatchPct.value;
  try {
    const row = await prisma.procurementSettings.findUnique({ where: { id: "default" } });
    const fromDb = row?.matchPriceVariancePct != null ? Number(row.matchPriceVariancePct) : NaN;
    if (Number.isFinite(fromDb) && fromDb >= 0) {
      cachedMatchPct = { at: now, value: fromDb };
      return fromDb;
    }
  } catch {
    /* settings table may not be migrated yet */
  }
  const fromEnv = Number(process.env.SUITE06_PRICE_VARIANCE_PCT);
  const value = Number.isFinite(fromEnv) && fromEnv >= 0 ? fromEnv : 2;
  cachedMatchPct = { at: now, value };
  return value;
}

export function getSuite06PriceVariancePct(): number {
  if (cachedMatchPct) return cachedMatchPct.value;
  const v = Number(process.env.SUITE06_PRICE_VARIANCE_PCT);
  return Number.isFinite(v) && v >= 0 ? v : 2;
}

export function invalidateMatchVarianceCache() {
  cachedMatchPct = null;
}

/** Overall extraction confidence below this routes intake to human verification (default 0.85). */
export function getSuite06MatchConfidenceThreshold(): number {
  const v = Number(process.env.SUITE06_MATCH_CONFIDENCE_THRESHOLD);
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.85;
}

/**
 * When true (default): if a vendor bill has both `sourcePurchaseOrderId` and
 * `sourceGoodsReceivedNoteId`, submit/pay/batch-pay require `suite06MatchStatus === "MATCHED"`.
 * Set `SUITE06_REQUIRE_MATCH_WHEN_PO_GRN_LINKED=false` only for legacy data or local experiments.
 */
export function getSuite06RequireMatchWhenPoGrnLinked(): boolean {
  const v = process.env.SUITE06_REQUIRE_MATCH_WHEN_PO_GRN_LINKED;
  if (v === undefined || v === "") return true;
  const lower = String(v).trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(lower);
}
