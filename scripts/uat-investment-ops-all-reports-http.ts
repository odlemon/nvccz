/**
 * UAT — generate all Investment Operations DOCX report templates on VPS.
 * npm run uat:investment-ops:all-reports
 */
import "dotenv/config";
import PizZip from "pizzip";
import { INVESTMENT_REPORT_TEMPLATES } from "../src/services/investmentOps/reporting/investmentReportTemplates";

const BASE = (process.env.UAT_BASE_URL || process.env.API_BASE_URL || "https://dev-api.arcus.co.zw/api").replace(
  /\/$/,
  ""
);
const EMAIL = process.env.UAT_EMAIL || "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD || "admin123";

const DOCX_TYPES = INVESTMENT_REPORT_TEMPLATES.filter((t) => t.docxTemplate).map((t) => t.code);

const FIRM_ONLY = new Set([
  "AUM_FUM_MOVEMENT_REPORT",
  "AML_CFT_CPF_RETURN_PACK",
  "SECZIM_CAPITAL_ADEQUACY_PACK",
  "SECZIM_PRUDENTIAL_RETURN_PACK",
]);

const NEEDS_CLIENT = new Set(["CLIENT_PORTFOLIO_VALUATION"]);

async function main() {
  console.log(`IO All Reports DOCX UAT — ${BASE}\n`);

  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson.token || loginJson.data?.token;
  if (!token) throw new Error(`Login failed: ${loginJson.message || loginRes.status}`);

  const fundsRes = await fetch(`${BASE}/investment-ops/portfolios`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const fundsJson = await fundsRes.json();
  const fundId = Array.isArray(fundsJson.data) ? fundsJson.data[0]?.id : null;

  let clientId: string | null = null;
  try {
    const clientsRes = await fetch(`${BASE}/fundraising/clients?page=1&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (clientsRes.ok) {
      const cj = await clientsRes.json();
      clientId = cj.data?.items?.[0]?.id ?? cj.data?.[0]?.id ?? null;
    }
  } catch {
    /* optional */
  }

  const params = {
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    valuationDate: "2026-03-31",
    benchmarkName: "ZSE Industrial Index",
    assetManagerName: "Arcus Asset Management",
  };

  let passed = 0;
  let failed = 0;

  for (const reportType of DOCX_TYPES) {
    const body: any = { reportType, format: "DOCX", parameters: params };
    if (!FIRM_ONLY.has(reportType)) {
      if (!fundId) {
        console.log(`[SKIP] ${reportType} — no fund`);
        continue;
      }
      body.fundId = fundId;
    }
    if (NEEDS_CLIENT.has(reportType)) {
      if (!clientId) {
        console.log(`[SKIP] ${reportType} — no client`);
        continue;
      }
      body.clientId = clientId;
    }

    const genRes = await fetch(`${BASE}/investment-ops/reports/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const genJson = await genRes.json();
    if (!genRes.ok || genJson.success === false) {
      console.log(`[FAIL] ${reportType} generate — ${genJson.message || genRes.status}`);
      failed++;
      continue;
    }

    const runId = genJson.data?.id;
    const dlRes = await fetch(`${BASE}/investment-ops/reports/${runId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!dlRes.ok) {
      console.log(`[FAIL] ${reportType} download — ${dlRes.status}`);
      failed++;
      continue;
    }
    const buf = Buffer.from(await dlRes.arrayBuffer());
    if (buf.length < 3000) {
      console.log(`[FAIL] ${reportType} — docx too small (${buf.length})`);
      failed++;
      continue;
    }
    const xml = new PizZip(buf).file("word/document.xml")?.asText() || "";
    const na = (xml.match(/>N\/A</g) || []).length;
    if (na > 0) {
      console.log(`[FAIL] ${reportType} — ${na} N/A in document`);
      failed++;
      continue;
    }
    console.log(`[PASS] ${reportType} — ${buf.length} bytes, run ${runId}`);
    passed++;
  }

  console.log(`\n${passed} passed, ${failed} failed, ${DOCX_TYPES.length} total`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[FAIL]", e.message);
  process.exit(1);
});
