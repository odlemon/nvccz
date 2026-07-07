/**
 * UAT — Investment Operations v2 core facades.
 * npm run uat:investment-ops:core
 */
import "dotenv/config";

const BASE = process.env.UAT_BASE_URL || "http://127.0.0.1:3009/api";
const EMAIL = process.env.UAT_EMAIL || process.env.E2E_ADMIN_EMAIL || "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD || process.env.E2E_ADMIN_PASSWORD || "admin123";

async function req(method: string, path: string, token?: string, body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} → ${res.status} non-JSON: ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${path} → ${res.status}: ${json.message || text}`);
  }
  return json.data;
}

async function main() {
  console.log(`Investment Ops UAT — ${BASE}\n`);
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  const token = json.token || json.data?.token;
  if (!token) throw new Error(`Login failed: ${json.message || res.status}`);
  await runWithToken(token);
}

async function runWithToken(token: string) {

  await req("GET", "/investment-ops/dashboard/summary", token);
  console.log("[PASS] GET /investment-ops/dashboard/summary");

  await req("GET", "/investment-ops/dashboard/funds", token);
  console.log("[PASS] GET /investment-ops/dashboard/funds");

  const funds = await req("GET", "/investment-ops/portfolios", token);
  console.log("[PASS] GET /investment-ops/portfolios");

  await req("GET", "/investment-ops/instruments/types", token);
  console.log("[PASS] GET /investment-ops/instruments/types");

  await req("GET", "/investment-ops/market-data/prices/latest", token);
  console.log("[PASS] GET /investment-ops/market-data/prices/latest");

  await req("GET", "/investment-ops/compliance/rules", token);
  console.log("[PASS] GET /investment-ops/compliance/rules");

  await req("GET", "/investment-ops/setup/price-sources", token);
  console.log("[PASS] GET /investment-ops/setup/price-sources");

  await req("GET", "/investment-ops/accounting/events", token);
  console.log("[PASS] GET /investment-ops/accounting/events");

  if (Array.isArray(funds) && funds[0]?.id) {
    const fundId = funds[0].id;
    await req("GET", `/investment-ops/portfolios/${fundId}/overview`, token);
    console.log("[PASS] GET /investment-ops/portfolios/:fundId/overview");
  }

  console.log("\n=== Investment Ops core UAT passed ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
