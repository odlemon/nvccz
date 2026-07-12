/**
 * UAT — Fundraising & IR foundation (HTTP).
 * Run: npm run uat:fundraising:ir-foundation
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

  const fundIdEnv = process.env.UAT_FUND_ID;
  const fund = fundIdEnv
    ? await prisma.fund.findUnique({ where: { id: fundIdEnv }, select: { id: true, name: true } })
    : await prisma.fund.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
  if (!fund) {
    log("resolve fund", false, "none in DB");
    process.exit(1);
  }
  log("resolve fund", true, `${fund.name} (${fund.id})`);

  const stamp = Date.now().toString(36).slice(-5);

  const investorRes = await api(
    "POST",
    "/v1/investors",
    {
      legalName: `UAT IR Investor ${stamp}`,
      investorType: "PENSION_FUND",
      countryCode: "ZW",
      baseCurrency: "USD",
    },
    token
  );
  const investorId = investorRes.json?.data?.id;
  log("create investor", investorRes.status === 201 && Boolean(investorId), `status ${investorRes.status}`);

  const contactRes = await api(
    "POST",
    `/v1/investors/${investorId}/contacts`,
    {
      fullName: "UAT Contact",
      email: `uat-ir-${stamp}@example.com`,
      roleTitle: "CIO",
      isPrimary: true,
    },
    token
  );
  log("add contact", contactRes.status === 201 && Boolean(contactRes.json?.data?.id), `status ${contactRes.status}`);

  const campaignRes = await api(
    "POST",
    "/v1/fundraising/campaigns",
    {
      campaignType: "PE_FUNDRAISE",
      name: `UAT IR Campaign ${stamp}`,
      fundId: fund.id,
      targetCapital: 50000000,
      primaryCurrency: "USD",
      startDate: "2026-01-01",
      closeDate: "2027-12-31",
    },
    token
  );
  const campaignId = campaignRes.json?.data?.id;
  const stageCount = campaignRes.json?.data?.stages?.length ?? 0;
  log(
    "create campaign",
    campaignRes.status === 201 && Boolean(campaignId) && stageCount >= 10,
    `status ${campaignRes.status} stages ${stageCount}`
  );

  const activateRes = await api("POST", `/v1/fundraising/campaigns/${campaignId}/activate`, {}, token);
  log(
    "activate campaign",
    activateRes.status === 200 && activateRes.json?.data?.status === "ACTIVE",
    `status ${activateRes.status} campaign=${activateRes.json?.data?.status}`
  );

  const oppRes = await api(
    "POST",
    "/v1/fundraising/opportunities",
    {
      campaignId,
      investorId,
      opportunityType: "LP_COMMITMENT",
      indicativeAmount: 2500000,
      priority: "HIGH",
    },
    token
  );
  const opportunityId = oppRes.json?.data?.id;
  log("create opportunity", oppRes.status === 201 && Boolean(opportunityId), `status ${oppRes.status}`);

  const patchRes = await api(
    "PATCH",
    `/v1/fundraising/opportunities/${opportunityId}`,
    { softCircleAmount: 2000000, reason: "UAT soft circle" },
    token
  );
  log(
    "patch amount",
    patchRes.status === 200 && Number(patchRes.json?.data?.softCircleAmount) === 2000000,
    `status ${patchRes.status}`
  );

  const stages = campaignRes.json?.data?.stages || [];
  const nextStage = stages.find((s: any) => s.stageCode === "CONTACTED") || stages[1];
  const transitionRes = await api(
    "POST",
    `/v1/fundraising/opportunities/${opportunityId}/transition`,
    { toStageCode: nextStage?.stageCode || "CONTACTED", reason: "UAT stage move" },
    token
  );
  log(
    "transition stage",
    transitionRes.status === 200 &&
      transitionRes.json?.data?.currentStage?.stageCode === (nextStage?.stageCode || "CONTACTED"),
    `status ${transitionRes.status}`
  );

  const timelineRes = await api("GET", `/v1/fundraising/opportunities/${opportunityId}/timeline`, undefined, token);
  const events = timelineRes.json?.data?.events?.length ?? 0;
  log("timeline", timelineRes.status === 200 && events >= 2, `status ${timelineRes.status} events ${events}`);

  const dashRes = await api("GET", `/v1/fundraising/dashboard?campaignId=${campaignId}`, undefined, token);
  log(
    "executive dashboard",
    dashRes.status === 200 && dashRes.json?.data?.targetTotal != null,
    `status ${dashRes.status}`
  );

  const campDash = await api("GET", `/v1/fundraising/campaigns/${campaignId}/dashboard`, undefined, token);
  log(
    "campaign dashboard",
    campDash.status === 200 && Array.isArray(campDash.json?.data?.stages),
    `status ${campDash.status}`
  );

  const summaryRes = await api("GET", `/v1/investors/${investorId}/relationship-summary`, undefined, token);
  log(
    "relationship summary",
    summaryRes.status === 200 && summaryRes.json?.data?.opportunityCount >= 1,
    `status ${summaryRes.status}`
  );

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nUAT fundraising IR foundation: ${passed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
