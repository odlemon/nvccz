/**
 * UAT — Quarterly Client Statements core (HTTP).
 * Run: npm run uat:quarterly-statements:core
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
  const json = (await res.json()) as { token?: string };
  return json.token || "";
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
  log("admin login", Boolean(token), token ? "token ok" : "failed");
  if (!token) process.exit(1);

  const fund = await prisma.fund.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
  if (!fund) {
    log("resolve fund", false, "none");
    process.exit(1);
  }
  log("resolve fund", true, fund.name);

  const year = new Date().getFullYear();
  const quarters = ["Q1", "Q2", "Q3", "Q4"] as const;

  let runId: string | undefined;
  let createStatus = 0;
  for (const quarter of quarters) {
    const create = await api(
      "POST",
      "/quarterly-statements/runs",
      { fundId: fund.id, financialYear: year, calendarQuarter: quarter },
      token
    );
    createStatus = create.status;
    if (create.json?.data?.id) {
      runId = create.json.data.id;
      break;
    }
    if (create.status === 400) {
      const list = await api("GET", `/quarterly-statements/runs?fundId=${fund.id}`, undefined, token);
      const existing = list.json?.data?.find(
        (r: any) =>
          r.calendarQuarter === quarter &&
          r.financialYear === year &&
          (r.status === "COMPILING" || r.status === "REVIEW" || r.status === "FAILED")
      );
      if (existing?.id) {
        runId = existing.id;
        break;
      }
    }
  }
  log("create run", Boolean(runId), runId ? `status ${createStatus}` : `status ${createStatus}`);

  if (!runId) process.exit(1);

  const compile = await api("POST", `/quarterly-statements/runs/${runId}/compile`, undefined, token);
  log("compile run", compile.status === 200, `status ${compile.status}`);

  const recipients = await api("GET", `/quarterly-statements/runs/${runId}/recipients`, undefined, token);
  const count = recipients.json?.data?.length ?? 0;
  log("list recipients", recipients.status === 200, `count ${count}`);

  const dashboard = await api("GET", `/quarterly-statements/runs/${runId}/dashboard`, undefined, token);
  log("dashboard", dashboard.status === 200, `status ${dashboard.status}`);

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nUAT quarterly statements core: ${passed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
