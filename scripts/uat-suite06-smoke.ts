// @ts-nocheck
/**
 * Smoke: Suite 06 modules load (no DB required).
 * Run: npx ts-node scripts/uat-suite06-smoke.ts
 */
import { getSuite06PriceVariancePct } from "../src/config/suite06Config";
import { ThreeWayMatchService } from "../src/services/ThreeWayMatchService";

async function main() {
  console.log("Suite 06 smoke: thresholds ok:", getSuite06PriceVariancePct());
  if (typeof ThreeWayMatchService.runMatch !== "function") {
    throw new Error("ThreeWayMatchService.runMatch missing");
  }
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
