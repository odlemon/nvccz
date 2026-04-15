//@ts-nocheck
/** Suite 06 — AI-assisted invoice extraction and 3-way match thresholds (env-tunable). */

export function getSuite06PriceVariancePct(): number {
  const v = Number(process.env.SUITE06_PRICE_VARIANCE_PCT);
  return Number.isFinite(v) && v > 0 ? v : 1;
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
