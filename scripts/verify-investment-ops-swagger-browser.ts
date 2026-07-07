/**
 * Browser-oriented Swagger audit helper for Investment Operations.
 * Complements strict HTTP verify with Authorize UX checks.
 *
 * Run: npm run verify:investment-ops:swagger-browser
 */
import "dotenv/config";
import { writeFileSync } from "fs";

const BASE = (process.env.API_BASE_URL ?? "https://dev-api.arcus.co.zw/api").replace(/\/$/, "");
const SWAGGER = BASE.replace(/\/api$/, "/api-docs");
const EMAIL = process.env.UAT_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? "admin123";

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  const token = json.token || json.data?.token;
  if (!token) throw new Error("Login failed");
  return token as string;
}

async function main() {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  const swaggerHtml = await (await fetch(SWAGGER)).text();
  checks.push({
    name: "Swagger IO tag present",
    ok: swaggerHtml.includes("Investment Operations"),
    detail: "Investment Operations tag in /api-docs HTML",
  });
  checks.push({
    name: "Journals path in spec",
    ok: swaggerHtml.includes("/investment-ops/accounting/journals"),
    detail: "GET journals documented",
  });
  checks.push({
    name: "Journals fundId query param",
    ok: swaggerHtml.includes("accounting/journals") && swaggerHtml.includes("fundId"),
    detail: "fundId filter available in embedded spec",
  });

  const unauth = await fetch(`${BASE}/investment-ops/accounting/journals`);
  const unauthJson = await unauth.json();
  checks.push({
    name: "Journals without Bearer → 401",
    ok: unauth.status === 401,
    detail: `status=${unauth.status} message=${unauthJson.message}`,
  });

  const token = await login();
  const authed = await fetch(`${BASE}/investment-ops/accounting/journals`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const authedJson = await authed.json();
  const count = Array.isArray(authedJson.data) ? authedJson.data.length : 0;
  checks.push({
    name: "Journals with Bearer → 200 + data",
    ok: authed.status === 200 && authedJson.success === true && count > 0,
    detail: `status=${authed.status} count=${count}`,
  });

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`[${c.ok ? "PASS" : "FAIL"}] ${c.name} — ${c.detail}`);
  console.log(`\nBrowser audit helper: ${checks.length - failed.length}/${checks.length} passed`);
  writeFileSync("tmp-investment-ops-swagger-browser-results.json", JSON.stringify({ checks, failed: failed.length }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
