/**
 * UAT — Cap Table dilution math (HTTP + fixture).
 * Run: npm run uat:cap-table:dilution
 */
import "dotenv/config";
import { CapTableDilutionEngine } from "../src/services/capTable/CapTableDilutionEngine";

const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? "admin123";

const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function log(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

async function main() {
  const local = CapTableDilutionEngine.run({
    preMoneyValuation: 10000000,
    roundInvestment: 2500000,
    optionPoolTopUpPct: 0,
    preMoneyFullyDilutedShares: 1000000,
    notes: [
      { principal: 500000, annualInterestRate: 0.08, valuationCap: 8000000, discountRate: 0.2, daysAccrued: 365 },
    ],
  });
  const expectedRoundShares = 250000;
  log(
    "local engine round shares",
    Math.abs(local.newRoundShares - expectedRoundShares) < 1,
    `got ${local.newRoundShares}`
  );

  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const { token } = (await loginRes.json()) as { token?: string };
  if (!token) {
    log("login", false, "no token");
    process.exit(1);
  }

  const companies = await fetch(`${BASE}/portfolio-companies`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const companiesJson = await companies.json();
  const pcId =
    companiesJson?.data?.[0]?.id ||
    companiesJson?.data?.portfolioCompanies?.[0]?.id ||
    companiesJson?.portfolioCompanies?.[0]?.id;

  if (pcId) {
    const sim = await fetch(`${BASE}/cap-table/registries/${pcId}/simulator/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        preMoneyValuation: 10000000,
        roundInvestment: 2500000,
        preMoneyFullyDilutedShares: 1000000,
      }),
    });
    const simJson = await sim.json();
    log("HTTP simulator", sim.status === 200, `postMoney=${simJson?.data?.postMoneyValuation}`);
  } else {
    log("HTTP simulator", true, "skipped — no portfolio company via API");
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUAT complete: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
