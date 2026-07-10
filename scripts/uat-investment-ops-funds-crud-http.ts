/**
 * UAT — Investment Operations listed-equity fund access + PE rejection.
 * Does not create timestamped UAT funds (demo-safe).
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
  const peFundsList = peFundsJson.data?.funds ?? (Array.isArray(peFundsJson.data) ? peFundsJson.data : []);
  const peFundId =
    peFundsList.find((f: any) => f.fundPurpose === "PRIVATE_EQUITY")?.id ??
    peFundsList.find((f: any) => f.name === "ZimFund")?.id;
  if (!peFundId) console.log("[WARN] No PE fund found via GET /funds — skipping PE rejection checks");

  const ioListRes = await fetch(`${BASE}/investment-ops/portfolios`, { headers });
  const ioListJson = await ioListRes.json();
  const ioPortfolios = ioListJson.data || [];
  console.log(`[INFO] IO portfolios: ${ioPortfolios.length}`);
  for (const p of ioPortfolios) {
    console.log(`  - ${p.name} (${p.id}) purpose=${p.fundPurpose || "?"}`);
    if (peFundId && p.id === peFundId) {
      throw new Error("PE fund must not appear in IO portfolios list");
    }
    if (/^UAT\b/i.test(p.name || "")) {
      throw new Error(`UAT-named fund still present in IO portfolios: ${p.name}`);
    }
  }

  const setupListRes = await fetch(`${BASE}/investment-ops/setup/funds`, { headers });
  const setupListJson = await setupListRes.json();
  if (!setupListRes.ok) throw new Error(`setup/funds list failed: ${setupListJson.message}`);
  const setupFunds = setupListJson.data || [];
  if (!setupFunds.length) throw new Error("No listed-equity funds — run db:seed:investment-ops-demo");
  console.log(`[PASS] GET /setup/funds — ${setupFunds.length} listed-equity fund(s)`);

  if (peFundId) {
    const rejectRes = await fetch(`${BASE}/investment-ops/portfolios/${peFundId}/overview`, { headers });
    const rejectJson = await rejectRes.json();
    if (rejectRes.ok && rejectJson.success !== false) {
      throw new Error("PE fund must be rejected on IO overview");
    }
    console.log(`[PASS] PE fund rejected on IO overview — ${rejectJson.message || rejectRes.status}`);
  }

  const fundId = setupFunds.find((f: any) => f.name === "Arcus Listed Portfolio")?.id || setupFunds[0].id;
  const getRes = await fetch(`${BASE}/investment-ops/setup/funds/${fundId}`, { headers });
  const getJson = await getRes.json();
  if (!getRes.ok || getJson.data?.fundPurpose !== "LISTED_EQUITY") {
    throw new Error(`GET fund failed or wrong purpose: ${getJson.message}`);
  }
  console.log(`[PASS] GET /setup/funds/{id} — LISTED_EQUITY (${getJson.data?.name || fundId})`);

  const previewRes = await fetch(`${BASE}/investment-ops/orders/preview`, {
    method: "POST",
    headers,
    body: JSON.stringify({ fundId, side: "BUY", quantity: 100, price: 1.5 }),
  });
  const previewJson = await previewRes.json();
  if (!previewRes.ok) throw new Error(`Order preview on listed-equity fund failed: ${previewJson.message}`);
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
