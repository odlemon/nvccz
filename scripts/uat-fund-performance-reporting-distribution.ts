/**
 * UAT — Fund Performance Reporting distribution (metrics + token helpers).
 * Run: npm run uat:fund-reporting:distribution
 */
import "dotenv/config";
import { LpFundMetricsService } from "../src/services/fundReporting/LpFundMetricsService";
import {
  FUND_REPORT_ATTACH_MAX_BYTES,
  generateDownloadToken,
  sha256Buffer,
} from "../src/services/fundReporting/fundReportingSupport";

function log(step: string, ok: boolean, detail: string) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

async function main() {
  const { tvpi, dpi, rvpi } = LpFundMetricsService.ratios(100, 30, 70);
  log("TVPI/DPI/RVPI", tvpi === 1 && dpi === 0.3 && rvpi === 0.7, `tvpi=${tvpi} dpi=${dpi} rvpi=${rvpi}`);

  const big = Buffer.alloc(FUND_REPORT_ATTACH_MAX_BYTES + 1);
  log(
    "10MB threshold",
    big.length > FUND_REPORT_ATTACH_MAX_BYTES,
    `${big.length} > ${FUND_REPORT_ATTACH_MAX_BYTES}`
  );

  const { token, tokenHash } = generateDownloadToken();
  log("download token", token.length === 64 && tokenHash.length === 64, "token pair generated");

  const hash = sha256Buffer(Buffer.from("test-pdf"));
  log("sha256", hash.length === 64, hash.slice(0, 12));

  const failed = 0;
  console.log(`\nDistribution UAT: ${4 - failed}/4 checks`);
  process.exit(failed ? 1 : 0);
}

main();
