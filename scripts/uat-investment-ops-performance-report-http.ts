/**
 * UAT — Investment Operations Performance Report (DOCX template).
 * npm run uat:investment-ops:performance-report
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const BASE = (process.env.UAT_BASE_URL || process.env.API_BASE_URL || "https://dev-api.arcus.co.zw/api").replace(
  /\/$/,
  ""
);
const EMAIL = process.env.UAT_EMAIL || "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD || "admin123";
const OUT_DIR = process.env.UAT_OUT_DIR || "tmp-uat-io-performance-report";

async function main() {
  console.log(`IO Performance Report DOCX UAT — ${BASE}\n`);

  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson.token || loginJson.data?.token;
  if (!token) throw new Error(`Login failed: ${loginJson.message || loginRes.status}`);

  const templatesRes = await fetch(`${BASE}/investment-ops/reports/templates`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const templatesJson = await templatesRes.json();
  if (!templatesRes.ok || templatesJson.success === false) {
    throw new Error(`List templates failed: ${templatesJson.message}`);
  }
  const perf = (templatesJson.data || []).find((t: any) => t.code === "PERFORMANCE_REPORT");
  if (!perf?.hasDocxTemplate) throw new Error("PERFORMANCE_REPORT template not registered");

  const fundsRes = await fetch(`${BASE}/investment-ops/portfolios`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const fundsJson = await fundsRes.json();
  const fundId = Array.isArray(fundsJson.data) ? fundsJson.data[0]?.id : null;
  if (!fundId) throw new Error("No fund available for report");

  const genRes = await fetch(`${BASE}/investment-ops/reports/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fundId,
      reportType: "PERFORMANCE_REPORT",
      format: "DOCX",
      parameters: {
        periodStart: "2026-01-01",
        periodEnd: "2026-03-31",
        valuationDate: "2026-03-31",
        benchmarkName: "ZSE Industrial Index",
        assetManagerName: "Arcus Asset Management",
      },
    }),
  });
  const genJson = await genRes.json();
  if (!genRes.ok || genJson.success === false) {
    throw new Error(`Generate failed: ${genJson.message || genRes.status}`);
  }
  const runId = genJson.data?.id;
  if (!runId) throw new Error("No report run id returned");
  console.log(`[PASS] Generated run ${runId} status=${genJson.data?.status}`);

  const dlRes = await fetch(`${BASE}/investment-ops/reports/${runId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);
  const buf = Buffer.from(await dlRes.arrayBuffer());
  if (buf.length < 5000) throw new Error(`DOCX too small (${buf.length} bytes) — likely empty or error`);
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error("Download is not a ZIP/DOCX file");

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `performance-report-${runId}.docx`);
  writeFileSync(outPath, buf);
  console.log(`[PASS] Downloaded ${buf.length} bytes → ${outPath}`);
  console.log("\nCompare this file with Arcus_Performance_Report_Template (1).docx — placeholders should be filled.");
}

main().catch((e) => {
  console.error("[FAIL]", e.message);
  process.exit(1);
});
