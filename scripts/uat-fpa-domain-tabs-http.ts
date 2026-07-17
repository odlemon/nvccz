/**
 * UAT — domain tab packs (nts only).
 * Run: npm run uat:fpa:domain-tabs
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
  await assertDevDatabase(prisma, "uat:fpa:domain-tabs");
  const token = await login();
  log("login", Boolean(token), token ? "ok" : "fail");
  if (!token) process.exit(1);

  const model = await prisma.planningModel.findFirst({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
  });
  if (!model) {
    log("fixture", false, "no model");
    process.exit(1);
  }
  log("fixture", true, model.name);

  const checks: Record<string, string[]> = {
    workforce: ["kpis", "hirePlan", "attritionTrend", "departments"],
    revenue: ["kpis", "waterfall", "monthly", "streams"],
    expense: ["kpis", "alerts", "byCategory", "monthlyBurn", "bridge", "departments"],
    cash: ["kpis", "periods", "rows"],
  };

  for (const [cat, keys] of Object.entries(checks)) {
    const res = await fetch(
      `${BASE}/v1/fpa/domain/${cat}?modelId=${encodeURIComponent(model.id)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const json: any = await res.json();
    const d = json.data || {};
    const ok = res.status === 200 && keys.every((k) => k in d);
    log(`${cat} pack`, ok, `status=${res.status} keys=${keys.filter((k) => k in d).join(",")}`);
    if (cat === "cash" && Array.isArray(d.rows) && d.rows.length) {
      log(
        "cash rowTypes",
        d.rows.every((r: any) => ["INFLOW", "OUTFLOW", "TOTAL"].includes(r.rowType)),
        `sample=${d.rows[0]?.rowType}`
      );
    }
  }

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
