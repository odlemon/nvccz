/**
 * Generate all 16 IO DOCX reports on VPS, download each, verify content.
 * npm run uat:investment-ops:all-reports-verify
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import { INVESTMENT_REPORT_TEMPLATES } from "../src/services/investmentOps/reporting/investmentReportTemplates";

const BASE = (process.env.UAT_BASE_URL || process.env.API_BASE_URL || "https://dev-api.arcus.co.zw/api").replace(
  /\/$/,
  ""
);
const EMAIL = process.env.UAT_EMAIL || "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD || "admin123";
const OUT_DIR = path.join(process.cwd(), "tmp-uat-io-all-reports");

const DOCX_TYPES = INVESTMENT_REPORT_TEMPLATES.filter((t) => t.docxTemplate);

const FIRM_ONLY = new Set([
  "AUM_FUM_MOVEMENT_REPORT",
  "AML_CFT_CPF_RETURN_PACK",
  "SECZIM_CAPITAL_ADEQUACY_PACK",
  "SECZIM_PRUDENTIAL_RETURN_PACK",
]);

function stripXml(xml: string): string {
  return xml
    .replace(/<w:tab[^/]*\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`IO All Reports verify — ${BASE}\n`);

  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson.token || loginJson.data?.token;
  if (!token) throw new Error(`Login failed: ${loginJson.message || loginRes.status}`);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const fundsRes = await fetch(`${BASE}/investment-ops/portfolios`, { headers });
  const fundsJson = await fundsRes.json();
  const fundId = Array.isArray(fundsJson.data) ? fundsJson.data[0]?.id : null;
  const fundName = Array.isArray(fundsJson.data) ? fundsJson.data[0]?.name : "";

  let clientId: string | null = null;
  let clientName = "";
  const clientsRes = await fetch(`${BASE}/clients?page=1&pageSize=1`, { headers });
  if (clientsRes.ok) {
    const cj = await clientsRes.json();
    const c = cj.data?.clients?.[0] ?? cj.data?.items?.[0] ?? cj.data?.[0];
    clientId = c?.id ?? null;
    clientName = c?.legalName ?? "";
  }

  const params = {
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    valuationDate: "2026-03-31",
    benchmarkName: "ZSE Industrial Index",
    assetManagerName: "Arcus Asset Management",
  };

  const results: any[] = [];

  for (const def of DOCX_TYPES) {
    const reportType = def.code;
    const scope =
      def.requiresClientId ? "fundId + clientId" : def.requiresFundId ? "fundId" : "none (firm-wide)";
    const body: any = { reportType, format: "DOCX", parameters: params };

    if (!FIRM_ONLY.has(reportType)) {
      if (!fundId) {
        results.push({ reportType, scope, status: "SKIP", reason: "no fund" });
        continue;
      }
      body.fundId = fundId;
    }
    if (def.requiresClientId) {
      if (!clientId) {
        results.push({ reportType, scope, status: "SKIP", reason: "no client" });
        continue;
      }
      body.clientId = clientId;
    }

    const genRes = await fetch(`${BASE}/investment-ops/reports/generate`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const genJson = await genRes.json();
    if (!genRes.ok || genJson.success === false) {
      results.push({ reportType, scope, status: "FAIL", reason: genJson.message || genRes.status });
      continue;
    }

    const runId = genJson.data?.id;
    const dlRes = await fetch(`${BASE}/investment-ops/reports/${runId}/download`, { headers });
    if (!dlRes.ok) {
      results.push({ reportType, scope, status: "FAIL", reason: `download ${dlRes.status}` });
      continue;
    }

    const buf = Buffer.from(await dlRes.arrayBuffer());
    const outFile = path.join(OUT_DIR, `${reportType.toLowerCase()}.docx`);
    fs.writeFileSync(outFile, buf);

    const xml = new PizZip(buf).file("word/document.xml")?.asText() || "";
    const naCount = (xml.match(/>N\/A</g) || []).length;
    const text = stripXml(xml);
    const hasFund = fundName ? text.includes(fundName) : true;
    const hasClient = def.requiresClientId ? text.includes(clientName) : true;
    const preview = text.slice(0, 120);

    const ok = buf.length >= 3000 && naCount === 0;
    results.push({
      reportType,
      scope,
      status: ok ? "PASS" : "FAIL",
      runId,
      bytes: buf.length,
      naCount,
      hasFundName: hasFund,
      hasClientName: hasClient,
      file: outFile,
      preview,
    });
    console.log(
      `[${ok ? "PASS" : "FAIL"}] ${reportType} (${scope}) — ${buf.length} bytes, N/A=${naCount}, run ${runId}`
    );
  }

  const summaryPath = path.join(OUT_DIR, "results.json");
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped — details: ${summaryPath}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[FAIL]", e.message);
  process.exit(1);
});
