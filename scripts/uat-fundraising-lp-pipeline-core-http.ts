/**
 * UAT — Fundraising LP Pipeline core workflow (HTTP).
 * Run: npm run uat:fundraising:core
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
    log("resolve fund", false, "none in DB");
    process.exit(1);
  }
  log("resolve fund", true, `${fund.name} (${fund.id})`);

  const campaignRes = await api(
    "POST",
    "/fundraising/campaigns",
    {
      fundId: fund.id,
      name: `UAT Fundraising ${Date.now().toString(36).slice(-4)}`,
      targetCapital: 5000000,
      primaryCurrency: "USD",
      startDate: "2026-01-01",
      closeDate: "2026-12-31",
      regionTags: ["Southern Africa"],
    },
    token
  );
  const campaignId = campaignRes.json?.data?.id;
  log("create campaign", campaignRes.status === 201 && Boolean(campaignId), `status ${campaignRes.status}`);

  const board = await api("GET", `/fundraising/campaigns/${campaignId}/board`, undefined, token);
  const columns = board.json?.data?.columns?.length ?? 0;
  log("get board", board.status === 200 && columns >= 5, `columns ${columns}`);

  const dealRes = await api(
    "POST",
    `/fundraising/campaigns/${campaignId}/deals`,
    {
      prospectName: "UAT LP Prospect",
      prospectEmail: `uat-lp-${Date.now()}@example.com`,
      proposedAmount: 250000,
      currencyCode: "USD",
      priority: "HIGH",
    },
    token
  );
  const dealId = dealRes.json?.data?.id;
  log("create deal", dealRes.status === 201 && Boolean(dealId), `status ${dealRes.status}`);

  const metrics = await api("GET", `/fundraising/campaigns/${campaignId}/metrics?presentationCurrency=USD`, undefined, token);
  log("get metrics", metrics.status === 200 && metrics.json?.data?.weightedPipelineValue != null, `status ${metrics.status}`);

  const interaction = await api(
    "POST",
    `/fundraising/deals/${dealId}/interactions`,
    { interactionType: "CALL", subject: "Intro call", body: "Discussed fund strategy" },
    token
  );
  log("log interaction", interaction.status === 201, `status ${interaction.status}`);

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nUAT fundraising core: ${passed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
