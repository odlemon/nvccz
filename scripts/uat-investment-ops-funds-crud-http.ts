/**
 * UAT — Investment Operations listed-equity fund CRUD + PE fund rejection.
 * npm run uat:investment-ops:funds
 */
import "dotenv/config";

const BASE = (process.env.UAT_BASE_URL || process.env.API_BASE_URL || "https://dev-api.arcus.co.zw/api").replace(
  /\/$/,
  ""
);
const EMAIL = process.env.UAT_EMAIL || "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD || "admin123";

async function main() {
  console.log(`IO Listed-Equity Funds UAT — ${BASE}\n`);

  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson.token || loginJson.data?.token;
  if (!token) throw new Error(`Login failed: ${loginJson.message || loginRes.status}`);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const peFundsRes = await fetch(`${BASE}/funds`, { headers });
  const peFundsJson = await peFundsRes.json();
  const peFundId = Array.isArray(peFundsJson.data) ? peFundsJson.data[0]?.id : peFundsJson.data?.[0]?.id;
  if (!peFundId) console.log("[WARN] No PE fund found via GET /funds");

  const ioListRes = await fetch(`${BASE}/investment-ops/portfolios`, { headers });
  const ioListJson = await ioListRes.json();
  const ioPortfolios = ioListJson.data || [];
  console.log(`[INFO] IO portfolios: ${ioPortfolios.length}`);
  for (const p of ioPortfolios) {
    console.log(`  - ${p.name} (${p.id}) purpose=${p.fundPurpose || "?"}`);
    if (peFundId && p.id === peFundId) {
      throw new Error("PE fund must not appear in IO portfolios list");
    }
  }

  const setupListRes = await fetch(`${BASE}/investment-ops/setup/funds`, { headers });
  const setupListJson = await setupListRes.json();
  if (!setupListRes.ok) throw new Error(`setup/funds list failed: ${setupListJson.message}`);
  const setupFunds = setupListJson.data || [];
  console.log(`[PASS] GET /setup/funds — ${setupFunds.length} listed-equity fund(s)`);

  if (peFundId) {
    const rejectRes = await fetch(`${BASE}/investment-ops/portfolios/${peFundId}/overview`, { headers });
    const rejectJson = await rejectRes.json();
    if (rejectRes.ok && rejectJson.success !== false) {
      throw new Error("PE fund must be rejected on IO overview");
    }
    console.log(`[PASS] PE fund rejected on IO overview — ${rejectJson.message || rejectRes.status}`);
  }

  const testName = `UAT Listed Fund ${Date.now()}`;
  const createRes = await fetch(`${BASE}/investment-ops/setup/funds`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: testName,
      description: "UAT listed-equity mandate",
      baseCurrencyCode: "USD",
    }),
  });
  const createJson = await createRes.json();
  if (!createRes.ok || !createJson.data?.id) {
    throw new Error(`Create fund failed: ${createJson.message || createRes.status}`);
  }
  const newFundId = createJson.data.id;
  console.log(`[PASS] POST /setup/funds — ${newFundId}`);

  const getRes = await fetch(`${BASE}/investment-ops/setup/funds/${newFundId}`, { headers });
  const getJson = await getRes.json();
  if (!getRes.ok || getJson.data?.fundPurpose !== "LISTED_EQUITY") {
    throw new Error(`GET fund failed or wrong purpose: ${getJson.message}`);
  }
  console.log(`[PASS] GET /setup/funds/{id} — LISTED_EQUITY`);

  const previewRes = await fetch(`${BASE}/investment-ops/orders/preview`, {
    method: "POST",
    headers,
    body: JSON.stringify({ fundId: newFundId, side: "BUY", quantity: 100, price: 1.5 }),
  });
  const previewJson = await previewRes.json();
  if (!previewRes.ok) throw new Error(`Order preview on new fund failed: ${previewJson.message}`);
  console.log(`[PASS] Order preview on listed-equity fund`);

  if (peFundId) {
    const pePreviewRes = await fetch(`${BASE}/investment-ops/orders/preview`, {
      method: "POST",
      headers,
      body: JSON.stringify({ fundId: peFundId, side: "BUY", quantity: 100, price: 1.5 }),
    });
    const pePreviewJson = await pePreviewRes.json();
    if (pePreviewRes.ok && pePreviewJson.success !== false) {
      throw new Error("Order preview must reject PE fund");
    }
    console.log(`[PASS] Order preview rejects PE fund — ${pePreviewJson.message}`);
  }

  console.log("\nAll fund separation checks passed.");
}

main().catch((e) => {
  console.error("[FAIL]", e.message);
  process.exit(1);
});
