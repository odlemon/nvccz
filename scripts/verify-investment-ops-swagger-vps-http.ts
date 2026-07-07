/**
 * Endpoint-by-endpoint smoke for Investment Operations on VPS (Swagger parity).
 * Run: npm run verify:investment-ops:swagger-vps
 */
import "dotenv/config";
import { writeFileSync } from "fs";

const BASE = (process.env.API_BASE_URL ?? "https://dev-api.arcus.co.zw/api").replace(/\/$/, "");
const EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";

type Row = { op: string; method: string; path: string; status: number; ok: boolean; note: string };
const rows: Row[] = [];

function log(row: Row) {
  rows.push(row);
  console.log(`[${row.ok ? "PASS" : "FAIL"}] ${row.method} ${row.path} — ${row.status} — ${row.note}`);
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = (await res.json()) as { token?: string; data?: { token?: string } };
  const token = json.token || json.data?.token || "";
  if (!token) throw new Error(`Login failed: ${JSON.stringify(json)}`);
  return token;
}

async function api(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 120) };
  }
  return { status: res.status, json };
}

function okStatus(status: number, allow: number[] = [200, 201]) {
  return allow.includes(status) && (rows.length === 0 || true);
}

async function main() {
  console.log(`VPS Swagger smoke — Investment Operations — ${BASE}\n`);
  const token = await login();
  log({ op: "Auth", method: "POST", path: "/auth/login", status: 200, ok: true, note: "token" });

  const ctx: Record<string, string> = {};

  async function hit(
    op: string,
    method: string,
    path: string,
    body?: unknown,
    allow: number[] = [200, 201]
  ) {
    const r = await api(method, path, token, body);
    const success = allow.includes(r.status) && r.json?.success !== false;
    log({
      op,
      method,
      path,
      status: r.status,
      ok: success,
      note: r.json?.message?.slice?.(0, 60) || (r.json?.data ? "ok" : JSON.stringify(r.json).slice(0, 60)),
    });
    return r;
  }

  // Dashboard
  await hit("Dashboard summary MTD", "GET", "/investment-ops/dashboard/summary?period=MTD");
  await hit("Dashboard allocation", "GET", "/investment-ops/dashboard/allocation");
  await hit("Currency exposure", "GET", "/investment-ops/dashboard/currency-exposure");
  await hit("Dashboard funds", "GET", "/investment-ops/dashboard/funds");

  // Portfolios
  const portfolios = await hit("List portfolios", "GET", "/investment-ops/portfolios");
  const fundList = portfolios.json?.data;
  const fundId = Array.isArray(fundList) ? fundList[0]?.id : undefined;
  if (fundId) ctx.fundId = fundId;

  if (fundId) {
    await hit("Portfolio overview", "GET", `/investment-ops/portfolios/${fundId}/overview`);
    await hit("Portfolio holdings", "GET", `/investment-ops/portfolios/${fundId}/holdings`);
    await hit("Portfolio transactions", "GET", `/investment-ops/portfolios/${fundId}/transactions`);
    await hit("Portfolio exposure", "GET", `/investment-ops/portfolios/${fundId}/exposure`);
  }

  // Instruments
  await hit("Instrument types", "GET", "/investment-ops/instruments/types");
  const instList = await hit("List instruments", "GET", "/investment-ops/instruments?pageSize=5");
  const items = instList.json?.data?.items ?? instList.json?.data;
  const inst = Array.isArray(items) ? items.find((i: any) => i.status === "APPROVED") ?? items[0] : null;
  if (inst?.id) {
    ctx.instrumentId = inst.id;
    await hit("Get instrument", "GET", `/investment-ops/instruments/${inst.id}`);
  }

  // Market data
  await hit("Latest prices", "GET", "/investment-ops/market-data/prices/latest");
  await hit("Stale prices", "GET", "/investment-ops/market-data/prices/stale");
  await hit("Validation queue", "GET", "/investment-ops/market-data/validation-queue");
  await hit("Ingest batches", "GET", "/investment-ops/market-data/ingest/batches");

  // Orders
  await hit("Orderbook", "GET", "/investment-ops/orders?page=1");
  if (fundId && inst) {
    const preview = await hit("Order preview", "POST", "/investment-ops/orders/preview", {
      fundId,
      instrumentId: inst.id,
      side: "BUY",
      quantity: 1,
      executionPrice: 1,
    });
    if (preview.json?.data?.blocked) {
      log({
        op: "Order preview blocked",
        method: "POST",
        path: "/investment-ops/orders/preview",
        status: preview.status,
        ok: true,
        note: preview.json.data.blockReason,
      });
    }
  }

  // Trades
  await hit("Trade blotter", "GET", "/investment-ops/trades");

  // Compliance / simulation / models
  await hit("Compliance rules", "GET", "/investment-ops/compliance/rules");
  await hit("Model portfolios", "GET", "/investment-ops/model-portfolios");

  // Valuation / recon / accounting
  if (fundId) {
    const val = await hit(
      "Valuation run",
      "POST",
      "/investment-ops/valuation/runs",
      { fundId, costBasisMethod: "WAC" },
      [200, 201]
    );
    if (val.json?.data?.id) ctx.valuationRunId = val.json.data.id;

    await hit("Valuation exceptions", "GET", `/investment-ops/valuation/exceptions?fundId=${fundId}`);

    const recon = await hit(
      "Reconciliation run",
      "POST",
      "/investment-ops/reconciliation/run",
      { fundId, reconType: "HOLDINGS" },
      [200, 201]
    );
    if (recon.json?.data?.id) ctx.reconBatchId = recon.json.data.id;

    await hit("Reconciliation upload", "POST", "/investment-ops/reconciliation/upload", {
      fundId,
      reconType: "CUSTODIAN_POSITION",
      csvText: "ref,quantity\nTEST.ZSE,1",
      fileName: "vps-smoke.csv",
    });

    await hit("Reconciliation batches", "GET", `/investment-ops/reconciliation/batches?fundId=${fundId}`);
    if (ctx.reconBatchId) {
      await hit("Recon batch detail", "GET", `/investment-ops/reconciliation/batches/${ctx.reconBatchId}`);
    }
  }

  await hit("Accounting events", "GET", "/investment-ops/accounting/events?page=1");
  await hit("Accounting journals", "GET", "/investment-ops/accounting/journals");

  // Documents / reports
  await hit("Documents list", "GET", "/investment-ops/documents");
  if (fundId) {
    const report = await hit(
      "Generate PDF report",
      "POST",
      "/investment-ops/reports/generate",
      { fundId, reportType: "PORTFOLIO_VALUATION", format: "PDF" },
      [200, 201]
    );
    if (report.json?.data?.id) ctx.reportId = report.json.data.id;
  }

  // Setup
  await hit("Brokers", "GET", "/investment-ops/setup/brokers");
  await hit("Custodians", "GET", "/investment-ops/setup/custodians");
  await hit("Commissions", "GET", "/investment-ops/setup/commissions");
  await hit("Markets", "GET", "/investment-ops/setup/markets");
  await hit("Currencies", "GET", "/investment-ops/setup/currencies");
  await hit("Countries", "GET", "/investment-ops/setup/countries");
  await hit("Issuers", "GET", "/investment-ops/setup/issuers");
  await hit("Price sources", "GET", "/investment-ops/setup/price-sources");
  await hit("Settings", "GET", "/investment-ops/setup/settings");

  // Swagger doc check
  const swaggerRes = await fetch(`${BASE.replace(/\/api$/, "")}/api-docs.json`);
  let swaggerOk = false;
  let pathCount = 0;
  if (swaggerRes.ok) {
    const spec = (await swaggerRes.json()) as { paths?: Record<string, unknown> };
    const paths = Object.keys(spec.paths || {}).filter((p) => p.includes("/investment-ops/"));
    pathCount = paths.length;
    swaggerOk = pathCount >= 30;
    log({
      op: "Swagger investment-ops paths",
      method: "GET",
      path: "/api-docs.json",
      status: swaggerRes.status,
      ok: swaggerOk,
      note: `${pathCount} investment-ops paths in spec`,
    });
  } else {
    log({
      op: "Swagger spec",
      method: "GET",
      path: "/api-docs.json",
      status: swaggerRes.status,
      ok: false,
      note: "could not load",
    });
  }

  const failed = rows.filter((x) => !x.ok);
  console.log(`\n=== VPS Investment Ops: ${rows.length - failed.length}/${rows.length} passed ===`);
  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  - ${f.method} ${f.path}: ${f.note}`);
  }

  writeFileSync(
    "tmp-investment-ops-swagger-vps-results.json",
    JSON.stringify({ server: BASE, ctx, rows, failedCount: failed.length }, null, 2)
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
