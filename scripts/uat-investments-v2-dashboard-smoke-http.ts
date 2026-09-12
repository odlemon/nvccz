/**
 * Smoke UAT — Investments V2 dashboard + instruments + reports (lean demo data on nts).
 * Usage: npm run uat:investments-v2:dashboard
 */
import "dotenv/config";
import { randomUUID } from "crypto";
import { assertDevDatabase } from "./lib/assert-dev-database";
import { PrismaClient } from "@prisma/client";
import { api, login, BASE } from "./lib/investments-v2-uat-helpers";

const prisma = new PrismaClient();

async function main() {
  await assertDevDatabase(prisma, "uat:investments-v2-dashboard");
  console.log(`Dashboard smoke UAT — ${BASE}\n`);
  const token = await login();
  const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

  const summary = await api("GET", "/investment-ops/dashboard/summary?period=YTD", token);
  const portfolios = summary.json?.data?.portfolios || summary.json?.portfolios || [];
  const first = portfolios[0];
  const nav = Number(first?.nav ?? 0);
  results.push({
    name: "GET dashboard/summary NAV > 0",
    ok: summary.status < 400 && nav > 0,
    detail: `status=${summary.status} nav=${first?.nav} name=${first?.name} statusFlag=${first?.status}`,
  });

  const alloc = await api("GET", "/investment-ops/dashboard/allocation", token);
  const equities = Number(alloc.json?.data?.equities?.value ?? alloc.json?.equities?.value ?? 0);
  results.push({
    name: "GET dashboard/allocation equities > 0",
    ok: alloc.status < 400 && equities > 0,
    detail: `status=${alloc.status} equities=${equities}`,
  });

  const ccy = await api("GET", "/investment-ops/dashboard/currency-exposure", token);
  const ccyRows = ccy.json?.data || ccy.json || [];
  const ccyList = Array.isArray(ccyRows) ? ccyRows : [];
  results.push({
    name: "GET dashboard/currency-exposure nonempty",
    ok: ccy.status < 400 && ccyList.length > 0,
    detail: `status=${ccy.status} rows=${ccyList.length}`,
  });

  const recalcNoKey = await api("POST", "/investment-ops/dashboard/recalculate", token, {});
  results.push({
    name: "POST dashboard/recalculate without Idempotency-Key (auto-mint)",
    ok: recalcNoKey.status < 400 || recalcNoKey.status === 202,
    detail: `status=${recalcNoKey.status} code=${recalcNoKey.json?.code || recalcNoKey.json?.error?.code}`,
  });

  const recalc = await api(
    "POST",
    "/investment-ops/dashboard/recalculate",
    token,
    {},
    { "Idempotency-Key": `uat-dash-${randomUUID()}` }
  );
  results.push({
    name: "POST dashboard/recalculate with Idempotency-Key",
    ok: recalc.status < 400 || recalc.status === 202,
    detail: `status=${recalc.status}`,
  });

  const instruments = await api("GET", "/investment-ops/instruments?page=1&pageSize=50", token);
  const items = instruments.json?.data?.items || instruments.json?.items || [];
  results.push({
    name: "GET instruments (no tick timeout)",
    ok: instruments.status < 400 && items.length >= 4,
    detail: `status=${instruments.status} count=${items.length}`,
  });

  const reports = await api(
    "POST",
    "/investment-ops/reports/generate",
    token,
    {
      reportType: "HOLDINGS_REPORT",
      format: "PDF",
      fundId: first?.fundId,
      parameters: { periodStart: "2026-01-01", periodEnd: "2026-07-20" },
      processNow: true,
    },
    { "Idempotency-Key": `uat-report-${randomUUID()}` }
  );
  results.push({
    name: "POST reports/generate HOLDINGS_REPORT PDF",
    ok: reports.status < 400 || reports.status === 202,
    detail: `status=${reports.status} code=${reports.json?.code || reports.json?.error?.code}`,
  });

  console.log("\nResults:");
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  ${r.detail || ""}`);
    if (!r.ok) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
