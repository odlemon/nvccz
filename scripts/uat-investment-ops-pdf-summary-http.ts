/**
 * Verify summary PDF reports are structured (not JSON dumps).
 * npm run uat:investment-ops:pdf-summary (via ts-node)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";

const BASE = (process.env.UAT_BASE_URL || "https://dev-api.arcus.co.zw/api").replace(/\/$/, "");
const EMAIL = process.env.UAT_EMAIL || "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD || "admin123";
const OUT = path.join(process.cwd(), "tmp-uat-io-pdf-check");

const TYPES = [
  "COMPLIANCE_SUMMARY",
  "PORTFOLIO_VALUATION",
  "TRADE_BLOTTER",
  "HOLDINGS_SUMMARY",
  "RECONCILIATION_SUMMARY",
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const login = await (await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json();
  const token = login.token || login.data?.token;
  if (!token) throw new Error("login failed");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const funds = await (await fetch(`${BASE}/investment-ops/portfolios`, { headers })).json();
  const fundId = funds.data?.[0]?.id;
  const fundName = funds.data?.[0]?.name;
  if (!fundId) throw new Error("no fund");
  console.log(`Fund: ${fundName} (${fundId})\n`);

  let failed = 0;
  for (const reportType of TYPES) {
    const gen = await (
      await fetch(`${BASE}/investment-ops/reports/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ fundId, reportType, format: "PDF" }),
      })
    ).json();
    if (!gen.data?.id) {
      console.log(`[FAIL] ${reportType} generate — ${gen.message}`);
      failed++;
      continue;
    }
    const dl = await fetch(`${BASE}/investment-ops/reports/${gen.data.id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const buf = Buffer.from(await dl.arrayBuffer());
    const file = path.join(OUT, `${reportType}.pdf`);
    fs.writeFileSync(file, buf);
    const head = buf.slice(0, 8).toString("latin1");
    const textProbe = buf.toString("latin1");
    const isPdf = head.startsWith("%PDF");
    const hasJsonDump =
      textProbe.includes('"rules":') ||
      textProbe.includes('"holdings":') ||
      /"id"\s*:\s*"cm/.test(textProbe);
    const hasTitle =
      textProbe.includes("Compliance") ||
      textProbe.includes("Portfolio") ||
      textProbe.includes("Trade") ||
      textProbe.includes("Holdings") ||
      textProbe.includes("Reconciliation") ||
      textProbe.includes("Summary");

    if (!isPdf || hasJsonDump) {
      console.log(`[FAIL] ${reportType} — pdf=${isPdf} jsonDump=${hasJsonDump} bytes=${buf.length}`);
      failed++;
    } else {
      console.log(`[PASS] ${reportType} — ${buf.length} bytes, structured PDF (no JSON dump)`);
    }
  }
  if (failed) process.exit(1);
  console.log(`\n${TYPES.length - failed}/${TYPES.length} PDF summary reports OK`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
