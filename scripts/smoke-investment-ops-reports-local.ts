/**
 * Local smoke: generate + download every DOCX investment report against localhost:3009.
 * npx ts-node --transpile-only scripts/smoke-investment-ops-reports-local.ts
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import { INVESTMENT_REPORT_TEMPLATES } from "../src/services/investmentOps/reporting/investmentReportTemplates";

const BASE = (process.env.API_BASE_URL || "http://localhost:3009/api").replace(/\/$/, "");
const EMAIL = process.env.UAT_EMAIL || process.env.SMOKE_EMAIL || "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD || process.env.SMOKE_PASSWORD || "admin123";
const OUT_DIR = path.join(process.cwd(), "tmp-smoke-io-reports");

const DOCX_TYPES = INVESTMENT_REPORT_TEMPLATES.filter((t) => t.docxTemplate);
const FLAT_TYPES = INVESTMENT_REPORT_TEMPLATES.filter((t) => !t.docxTemplate);

function leftoverPlaceholders(xml: string): string[] {
  const found = new Set<string>();
  for (const m of xml.matchAll(/\{([a-z0-9_]+)\}/gi)) found.add(m[1]);
  return [...found];
}

function hasYellowHighlight(xml: string): boolean {
  return /w:val="yellow"/i.test(xml) || /w:fill="FFF2CC"/i.test(xml);
}

function hasInstructionBox(xml: string): boolean {
  return /INSTRUCTION\s*:/i.test(xml) || /Delete all blue instruction boxes/i.test(xml);
}

async function login(): Promise<Record<string, string>> {
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson.token || loginJson.data?.token;
  if (!token) throw new Error(`Login failed: ${loginJson.message || loginRes.status}`);
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Smoke IO reports — ${BASE}\n`);
  const headers = await login();

  const fundsRes = await fetch(`${BASE}/investment-ops/portfolios`, { headers });
  const fundsJson = await fundsRes.json();
  const fundId = Array.isArray(fundsJson.data) ? fundsJson.data[0]?.id : fundsJson.data?.items?.[0]?.id;
  if (!fundId) throw new Error("No portfolio available for fund-scoped reports");

  let clientId: string | null = null;
  const clientsRes = await fetch(`${BASE}/clients?page=1&pageSize=1`, { headers });
  if (clientsRes.ok) {
    const cj = await clientsRes.json();
    const c = cj.data?.clients?.[0] ?? cj.data?.items?.[0] ?? cj.data?.[0];
    clientId = c?.id ?? null;
  }

  const params = {
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    valuationDate: "2026-03-31",
    asOf: "2026-03-31",
    benchmarkName: "ZSE Industrial Index",
    assetManagerName: "Arcus Asset Management",
  };

  const results: any[] = [];

  for (const def of DOCX_TYPES) {
    const body: any = { reportType: def.code, format: "DOCX", parameters: params };
    if (def.requiresFundId) body.fundId = fundId;
    if (def.requiresClientId) {
      if (!clientId) {
        results.push({ reportType: def.code, status: "SKIP", reason: "no client" });
        console.log(`[SKIP] ${def.code} — no client`);
        continue;
      }
      body.clientId = clientId;
    }

    const genRes = await fetch(`${BASE}/investment-ops/reports/generate`, {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": `smoke-${def.code}-${Date.now()}` },
      body: JSON.stringify(body),
    });
    const genJson = await genRes.json();
    if (!genRes.ok || genJson.success === false) {
      results.push({ reportType: def.code, status: "FAIL", reason: genJson.message || genRes.status });
      console.log(`[FAIL] ${def.code} generate — ${genJson.message || genRes.status}`);
      continue;
    }

    const runId = genJson.data?.id;
    // processNow may complete synchronously; poll briefly if still queued
    let status = String(genJson.data?.status || "");
    for (let i = 0; i < 20 && !["COMPLETED", "FAILED"].includes(status.toUpperCase()); i++) {
      await new Promise((r) => setTimeout(r, 500));
      const st = await fetch(`${BASE}/investment-ops/reports/${runId}`, { headers });
      const sj = await st.json();
      status = String(sj.data?.status || "");
      if (status.toUpperCase() === "FAILED") break;
    }

    const dlRes = await fetch(`${BASE}/investment-ops/reports/${runId}/download`, { headers });
    if (!dlRes.ok) {
      results.push({ reportType: def.code, status: "FAIL", reason: `download ${dlRes.status}`, runStatus: status });
      console.log(`[FAIL] ${def.code} download ${dlRes.status} (run ${status})`);
      continue;
    }

    const buf = Buffer.from(await dlRes.arrayBuffer());
    const outFile = path.join(OUT_DIR, `${def.code.toLowerCase()}.docx`);
    fs.writeFileSync(outFile, buf);
    const xml = new PizZip(buf).file("word/document.xml")?.asText() || "";
    const leftovers = leftoverPlaceholders(xml);
    const yellow = hasYellowHighlight(xml);
    const instructions = hasInstructionBox(xml);
    const ok = buf.length >= 3000 && leftovers.length === 0 && !yellow && !instructions;
    results.push({
      reportType: def.code,
      status: ok ? "PASS" : "FAIL",
      runId,
      bytes: buf.length,
      leftoverPlaceholders: leftovers.slice(0, 20),
      leftoverCount: leftovers.length,
      yellow,
      instructions,
      file: outFile,
    });
    console.log(
      `[${ok ? "PASS" : "FAIL"}] ${def.code} — ${buf.length}b leftovers=${leftovers.length} yellow=${yellow} instr=${instructions}`
    );
  }

  // One flat PDF smoke
  const flat = FLAT_TYPES[0];
  if (flat) {
    const genRes = await fetch(`${BASE}/investment-ops/reports/generate`, {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": `smoke-flat-${Date.now()}` },
      body: JSON.stringify({
        reportType: flat.code,
        format: flat.supportedFormats[0],
        fundId,
        parameters: params,
      }),
    });
    const genJson = await genRes.json();
    const runId = genJson.data?.id;
    const dlRes = runId
      ? await fetch(`${BASE}/investment-ops/reports/${runId}/download`, { headers })
      : null;
    const ok = genRes.ok && !!dlRes?.ok;
    results.push({
      reportType: flat.code,
      format: flat.supportedFormats[0],
      status: ok ? "PASS" : "FAIL",
      reason: ok ? undefined : genJson.message || dlRes?.status,
    });
    console.log(`[${ok ? "PASS" : "FAIL"}] flat ${flat.code} ${flat.supportedFormats[0]}`);
  }

  const summaryPath = path.join(OUT_DIR, "results.json");
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  const failed = results.filter((r) => r.status === "FAIL").length;
  const passed = results.filter((r) => r.status === "PASS").length;
  console.log(`\n${passed} passed, ${failed} failed — ${summaryPath}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("[FAIL]", e.message);
  process.exit(1);
});
