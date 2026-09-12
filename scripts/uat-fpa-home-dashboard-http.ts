/**
 * UAT — enriched home dashboard (nts only).
 * Run: npm run uat:fpa:home-dashboard
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? "admin123";

const results: Array<{ step: string; ok: boolean; detail: string }> = [];
function log(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json: any = await res.json();
  return json.token || json.data?.token || "";
}

async function main() {
  await assertDevDatabase(prisma, "uat:fpa:home-dashboard");
  const token = await login();
  log("login", Boolean(token), token ? "ok" : "fail");
  if (!token) process.exit(1);

  const model = await prisma.planningModel.findFirst({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
  });
  log("fixture model", Boolean(model), model ? `${model.name} (${model.id})` : "none");
  if (!model) process.exit(1);

  const res = await fetch(
    `${BASE}/v1/fpa/home/dashboard?modelId=${encodeURIComponent(model.id)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const json: any = await res.json();
  const d = json.data || {};
  log("status 200", res.status === 200, `status=${res.status}`);
  log("has kpis", Boolean(d.kpis), `revenue=${d.kpis?.revenue}`);
  log("has revenueExpenseTrend", Array.isArray(d.revenueExpenseTrend), `n=${d.revenueExpenseTrend?.length}`);
  log(
    "scenarioCompare.metrics",
    Array.isArray(d.scenarioCompare?.metrics),
    `n=${d.scenarioCompare?.metrics?.length}`
  );
  log("workflowStatusSlices", Array.isArray(d.workflowStatusSlices), `n=${d.workflowStatusSlices?.length}`);
  log("cashRunway", Boolean(d.cashRunway), `runway=${d.cashRunway?.runwayMonths}`);
  log("recentActivity", Array.isArray(d.recentActivity), `n=${d.recentActivity?.length}`);
  // Guard: no absurd demo FX (e.g. hard-coded 125.8M)
  const rev = Number(d.kpis?.revenue || 0);
  log("no demo FX spike", rev < 1e11, `revenue=${rev}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\npassed=${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
