/**
 * Ensure a test LP client exists on dev for CLIENT_PORTFOLIO_VALUATION UAT.
 * npm run uat:ensure-io-client
 */
import "dotenv/config";

const BASE = (process.env.UAT_BASE_URL || process.env.API_BASE_URL || "https://dev-api.arcus.co.zw/api").replace(
  /\/$/,
  ""
);
const EMAIL = process.env.UAT_EMAIL || "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD || "admin123";

async function main() {
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson.token || loginJson.data?.token;
  if (!token) throw new Error(`Login failed: ${loginJson.message || loginRes.status}`);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const clientsRes = await fetch(`${BASE}/clients?page=1&pageSize=5`, { headers });
  const clientsJson = await clientsRes.json();
  const existing = clientsJson.data?.clients?.[0] ?? clientsJson.data?.items?.[0] ?? clientsJson.data?.[0];
  if (existing?.id) {
    console.log(`Client already exists: ${existing.id} (${existing.legalName || existing.legal_name})`);
    return;
  }

  const fundsRes = await fetch(`${BASE}/investment-ops/portfolios`, { headers });
  const fundsJson = await fundsRes.json();
  const fundId = Array.isArray(fundsJson.data) ? fundsJson.data[0]?.id : null;
  if (!fundId) throw new Error("No fund found for client commitment");

  const testEmail = `io-report-uat-${Date.now()}@example.com`;
  const createRes = await fetch(`${BASE}/clients`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "individual",
      legal_name: "IO Report UAT Client",
      email: testEmail,
      country: "ZW",
      fund_id: fundId,
      amount: 100000,
      currency: "USD",
      effective_date: "2026-01-01",
    }),
  });
  const createJson = await createRes.json();
  if (!createRes.ok || createJson.success === false) {
    throw new Error(`Create client failed: ${createJson.message || createRes.status}`);
  }
  console.log(`Created client ${createJson.data?.id} with commitment on fund ${fundId}`);
}

main().catch((e) => {
  console.error("[FAIL]", e.message);
  process.exit(1);
});
