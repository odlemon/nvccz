/**
 * Swagger Try-it-out smoke — exercises representative endpoints per investment module.
 * Run: npm run verify:investment-swagger-http
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";

const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function log(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = (await res.json()) as { token?: string; data?: { token?: string } };
  return json.token || json.data?.token || "";
}

async function api(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const token = await login();
  log("login", Boolean(token), token ? "ok" : "failed");
  if (!token) process.exit(1);

  const fund = await prisma.fund.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  const client = await prisma.client.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  log("resolve fund", Boolean(fund?.id), fund?.id || "none");

  // Fund Performance Reporting
  const tpl = await api(
    "POST",
    "/fund-reporting/templates",
    { name: `Swagger Smoke Template ${Date.now().toString(36).slice(-4)}`, reportLevel: "INVESTOR" },
    token
  );
  log("fund-reporting create template", tpl.status === 201, `status ${tpl.status}`);

  const tplList = await api("GET", "/fund-reporting/templates", undefined, token);
  log("fund-reporting list templates", tplList.status === 200, `status ${tplList.status}`);

  // Quarterly Statements
  if (fund?.id) {
    const qs = await api(
      "POST",
      "/quarterly-statements/runs",
      { fundId: fund.id, financialYear: 2026, calendarQuarter: "Q4" },
      token
    );
    log("quarterly-statements init run", qs.status === 201 || qs.status === 200, `status ${qs.status}`);
  }

  const qsList = await api("GET", "/quarterly-statements/runs", undefined, token);
  log("quarterly-statements list runs", qsList.status === 200, `status ${qsList.status}`);

  // Fundraising
  const frList = await api("GET", "/fundraising/campaigns", undefined, token);
  log("fundraising list campaigns", frList.status === 200, `status ${frList.status}`);

  // Cap table
  const ctList = await api("GET", "/cap-table/registries", undefined, token);
  log("cap-table list registries", ctList.status === 200, `status ${ctList.status}`);

  // LP Portal
  if (client?.id) {
    const lp = await api("GET", `/lp-portal/dashboard?clientId=${client.id}`, undefined, token);
    log("lp-portal dashboard", lp.status === 200, `status ${lp.status}`);
  } else {
    log("lp-portal dashboard", true, "skipped — no client");
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSwagger HTTP smoke: ${results.length - failed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
