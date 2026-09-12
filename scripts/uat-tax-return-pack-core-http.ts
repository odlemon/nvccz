/**
 * UAT — Tax Return Pack core (HTTP).
 * Run: npm run uat:tax-return-pack:core
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.UAT_LOCAL_API ?? process.env.API_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3009}/api`;
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
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function main() {
  const token = await login();
  log("admin login", Boolean(token), token ? "token ok" : "failed");
  if (!token) process.exit(1);

  const entity = await prisma.forecastEntity.findFirst({
    where: { isActive: true, type: "INTERNAL_SUBSIDIARY" },
    orderBy: { isDefault: "desc" },
    select: { id: true, name: true },
  });
  if (!entity) {
    log("resolve forecast entity", false, "no INTERNAL_SUBSIDIARY entity");
    process.exit(1);
  }
  log("resolve forecast entity", true, `${entity.name} (${entity.id})`);

  const fund = await prisma.fund.findFirst({ select: { id: true, name: true }, orderBy: { createdAt: "desc" } });

  const taxYear = 2096;
  const createBody: Record<string, unknown> = {
    forecastEntityId: entity.id,
    taxYear,
    taxPeriod: "ANNUAL",
    taxRegime: "ZIMRA_CIT",
    baseCurrency: "USD",
  };
  if (fund?.id) createBody.fundId = fund.id;

  const create = await api("POST", "/tax-return-packs", createBody, token);
  const packId = create.json?.data?.id;
  log(
    "provision pack",
    (create.status === 201 || create.status === 200) && Boolean(packId),
    `status ${create.status} ${create.json?.message || JSON.stringify(create.json).slice(0, 120)}`
  );

  if (!packId) process.exit(1);

  const compile = await api("POST", `/tax-return-packs/${packId}/compile`, {}, token);
  const compiledStatus = compile.json?.data?.status;
  log(
    "compile pack",
    compile.status === 200 && compiledStatus === "DRAFT_REVIEW",
    `status ${compile.status} pack=${compiledStatus} ${compile.json?.message || ""}`
  );

  const recon = await api("GET", `/tax-return-packs/${packId}/reconciliation`, undefined, token);
  const lineCount = recon.json?.data?.length ?? 0;
  log("reconciliation lines", recon.status === 200, `lines ${lineCount}`);

  const dash = await api("GET", `/tax-return-packs/${packId}/dashboard`, undefined, token);
  log("dashboard", dash.status === 200 && dash.json?.data?.packId === packId, `glSync=${dash.json?.data?.glSyncBadge}`);

  const audit = await api("GET", `/tax-return-packs/${packId}/audit`, undefined, token);
  log("audit trail", audit.status === 200 && Array.isArray(audit.json?.data), `events ${audit.json?.data?.length ?? 0}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\nUAT core: ${results.length - failed.length}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
