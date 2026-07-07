/**
 * UAT — Investment Operations v2 gap remediation (read + write paths).
 * npm run uat:investment-ops:full
 */
import "dotenv/config";

const BASE = process.env.UAT_BASE_URL || "http://127.0.0.1:3009/api";
const EMAIL = process.env.UAT_EMAIL || process.env.E2E_ADMIN_EMAIL || "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD || process.env.E2E_ADMIN_PASSWORD || "admin123";

let passed = 0;
let failed = 0;

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

async function pass(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`[PASS] ${label}`);
  } catch (e: any) {
    failed++;
    console.error(`[FAIL] ${label}: ${e.message}`);
  }
}

async function main() {
  console.log(`Investment Ops full UAT — ${BASE}\n`);
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  const token = json.token || json.data?.token;
  if (!token) throw new Error(`Login failed: ${json.message || res.status}`);

  await pass("GET dashboard/summary?period=MTD", async () => {
    const data = await req("GET", "/investment-ops/dashboard/summary?period=MTD", token);
    if (!data.periodStart) throw new Error("period not applied");
  });

  await pass("GET dashboard/allocation", async () => {
    await req("GET", "/investment-ops/dashboard/allocation", token);
  });

  await pass("GET instruments (paginated)", async () => {
    const data = await req("GET", "/investment-ops/instruments?page=1&pageSize=10", token);
    if (!data.items && !Array.isArray(data)) throw new Error("expected paginated items");
  });

  await pass("GET setup/countries", async () => {
    await req("GET", "/investment-ops/setup/countries", token);
  });

  await pass("GET setup/issuers", async () => {
    await req("GET", "/investment-ops/setup/issuers", token);
  });

  const funds = await req("GET", "/investment-ops/portfolios", token);
  const fundId = Array.isArray(funds) && funds[0]?.id ? funds[0].id : null;

  if (fundId) {
    await pass("POST orders/preview", async () => {
      const instruments = await req("GET", "/investment-ops/instruments?pageSize=5", token);
      const items = instruments.items || instruments;
      const inst = Array.isArray(items) ? items.find((i: any) => i.status === "APPROVED") : null;
      if (!inst) {
        console.log("  (skip preview — no approved instrument)");
        return;
      }
      const preview = await req("POST", "/investment-ops/orders/preview", token, {
        fundId,
        instrumentId: inst.id,
        side: "BUY",
        quantity: 10,
        executionPrice: 1.5,
      });
      if (preview.grossConsideration == null) throw new Error("missing grossConsideration");
    });

    await pass("POST valuation/runs (sync)", async () => {
      await req("POST", "/investment-ops/valuation/runs", token, { fundId, costBasisMethod: "WAC" });
    });

    await pass("POST reconciliation/run HOLDINGS", async () => {
      await req("POST", "/investment-ops/reconciliation/run", token, {
        fundId,
        reconType: "HOLDINGS",
      });
    });

    await pass("POST reconciliation/upload", async () => {
      const csv = "ref,quantity\nTEST.ZSE,100";
      await req("POST", "/investment-ops/reconciliation/upload", token, {
        fundId,
        reconType: "CUSTODIAN_POSITION",
        csvText: csv,
        fileName: "custodian.csv",
      });
    });

    await pass("POST reports/generate PDF", async () => {
      const run = await req("POST", "/investment-ops/reports/generate", token, {
        fundId,
        reportType: "PORTFOLIO_VALUATION",
        format: "PDF",
      });
      if (!run.fileRef) throw new Error("no fileRef");
    });

    await pass("GET accounting/events paginated", async () => {
      const data = await req("GET", "/investment-ops/accounting/events?page=1", token);
      if (data.page == null && !data.items) throw new Error("expected pagination");
    });
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
