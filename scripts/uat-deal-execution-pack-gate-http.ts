/**
 * UAT — Deal Execution Pack R_legal gate (HTTP).
 * Run: npm run uat:deal-execution-pack:gate
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";

function log(step: string, ok: boolean, detail: string) {
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
  if (!token) {
    log("admin login", false, "no token");
    process.exit(1);
  }
  log("admin login", true, "token ok");

  const company = await prisma.portfolioCompany.findFirst({
    where: { fundId: { not: null } },
    select: { id: true, fundId: true },
  });
  if (!company?.fundId) {
    log("resolve company", false, "none");
    process.exit(1);
  }

  const create = await api(
    "POST",
    "/deal-execution-packs",
    { fundId: company.fundId, portfolioCompanyId: company.id, investmentAmount: 100000 },
    token
  );
  const packId = create.json?.data?.id;
  if (!packId) {
    log("create pack", false, `status ${create.status}`);
    process.exit(1);
  }
  log("create pack", true, packId);

  const dash = await api("GET", `/deal-execution-packs/${packId}/dashboard`, undefined, token);
  log("dashboard rLegal false", dash.status === 200 && dash.json?.data?.rLegal === false, "blocked as expected");

  const execute = await api("POST", `/deal-execution-packs/${packId}/execute`, {}, token);
  log("execute blocked", execute.status === 400, `status ${execute.status}`);

  await prisma.$disconnect();
  process.exit(execute.status === 400 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
