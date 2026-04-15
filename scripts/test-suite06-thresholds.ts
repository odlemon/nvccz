// @ts-nocheck
/**
 * Unit-style checks for Suite 06 thresholds (no Jest — avoids full project transform OOM).
 * Run: npm run test:uat:suite06
 */
import {
  getSuite06PriceVariancePct,
  getSuite06MatchConfidenceThreshold,
  getSuite06RequireMatchWhenPoGrnLinked,
} from "../src/config/suite06Config";

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

const prev = { ...process.env };

function main() {
  delete process.env.SUITE06_PRICE_VARIANCE_PCT;
  delete process.env.SUITE06_MATCH_CONFIDENCE_THRESHOLD;
  assert(getSuite06PriceVariancePct() === 1, "default price pct");
  assert(getSuite06MatchConfidenceThreshold() === 0.85, "default confidence");

  process.env.SUITE06_PRICE_VARIANCE_PCT = "2.5";
  assert(getSuite06PriceVariancePct() === 2.5, "custom price pct");

  delete process.env.SUITE06_REQUIRE_MATCH_WHEN_PO_GRN_LINKED;
  assert(getSuite06RequireMatchWhenPoGrnLinked() === true, "default require match");
  process.env.SUITE06_REQUIRE_MATCH_WHEN_PO_GRN_LINKED = "false";
  assert(getSuite06RequireMatchWhenPoGrnLinked() === false, "require match off");

  process.env = { ...prev };
  console.log("Suite 06 threshold checks OK");
}

main();
