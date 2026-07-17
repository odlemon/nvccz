/**
 * UAT — Fundraising full SRD (non-versioned /api/fundraising + /api/investors).
 * Runs against the API pointed at by API_BASE_URL / PORT (dev `nts` DB).
 * Run: npm run uat:fundraising:srd
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
  // Prefer a quiet token path if available; otherwise login and wait for STI noise to settle
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = (await res.json()) as { token?: string; data?: { token?: string } };
  const token = json.token || json.data?.token || "";
  return token;
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
  log("admin login", Boolean(token), token ? "token ok" : `failed BASE=${BASE}`);
  if (!token) process.exit(1);

  const fund =
    (process.env.UAT_FUND_ID
      ? await prisma.fund.findUnique({ where: { id: process.env.UAT_FUND_ID }, select: { id: true, name: true } })
      : null) ||
    (await prisma.fund.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } }));
  if (!fund) {
    log("resolve fund", false, "none in DB");
    process.exit(1);
  }
  log("resolve fund", true, `${fund.name} (${fund.id})`);

  const stamp = Date.now().toString(36).slice(-6);

  const investorRes = await api(
    "POST",
    "/investors",
    {
      legalName: `UAT SRD Investor ${stamp}`,
      investorType: "PENSION_FUND",
      countryCode: "ZW",
      baseCurrency: "USD",
      kycStatus: "CLEARED",
      sanctionsStatus: "CLEAR",
    },
    token
  );
  const investorId = investorRes.json?.data?.id;
  log("create investor", investorRes.status === 201 && Boolean(investorId), `status ${investorRes.status}`);

  const contactRes = await api(
    "POST",
    `/investors/${investorId}/contacts`,
    { fullName: "Ada Owner", email: `ada.srd.${stamp}@example.com`, isPrimary: true, roleTitle: "CIO" },
    token
  );
  const contactId = contactRes.json?.data?.id;
  log("add contact", contactRes.status === 201 && Boolean(contactId), `status ${contactRes.status}`);

  const patchContact = await api(
    "PATCH",
    `/investors/${investorId}/contacts/${contactId}`,
    { phone: "+263771234567", nextAction: "Schedule DD call" },
    token
  );
  log("patch contact", patchContact.status === 200, `status ${patchContact.status}`);

  const campaignRes = await api(
    "POST",
    "/fundraising/campaigns",
    {
      campaignType: "PE_FUNDRAISE",
      name: `UAT SRD Campaign ${stamp}`,
      fundId: fund.id,
      targetCapital: 75000000,
      primaryCurrency: "USD",
      startDate: "2026-01-01",
      closeDate: "2027-12-31",
    },
    token
  );
  const campaignId = campaignRes.json?.data?.id;
  const stageCount = campaignRes.json?.data?.stages?.length ?? 0;
  log(
    "create campaign (IR stages)",
    campaignRes.status === 201 && Boolean(campaignId) && stageCount >= 10,
    `status ${campaignRes.status} stages ${stageCount}`
  );

  const activateRes = await api("POST", `/fundraising/campaigns/${campaignId}/activate`, {}, token);
  log(
    "activate campaign",
    activateRes.status === 200 && activateRes.json?.data?.status === "ACTIVE",
    `status ${activateRes.status}`
  );

  const oppRes = await api(
    "POST",
    "/fundraising/opportunities",
    {
      campaignId,
      investorId,
      opportunityType: "LP_COMMITMENT",
      indicativeAmount: 5000000,
      priority: "HIGH",
    },
    token
  );
  const opportunityId = oppRes.json?.data?.id;
  log("create opportunity", oppRes.status === 201 && Boolean(opportunityId), `status ${oppRes.status}`);

  const checklistRes = await api("GET", `/fundraising/opportunities/${opportunityId}/checklist`, undefined, token);
  log(
    "opportunity checklist endpoint",
    checklistRes.status === 200 && Array.isArray(checklistRes.json?.data),
    `status ${checklistRes.status} items=${checklistRes.json?.data?.length ?? 0}`
  );

  const boardRes = await api("GET", `/fundraising/campaigns/${campaignId}/board`, undefined, token);
  log(
    "opportunity board",
    boardRes.status === 200 && Array.isArray(boardRes.json?.data?.columns || boardRes.json?.data?.stages),
    `status ${boardRes.status}`
  );

  const commRes = await api(
    "POST",
    "/fundraising/communications",
    {
      campaignId,
      opportunityId,
      investorId,
      interactionType: "PHONE_CALL",
      subject: "Intro call",
      summary: "Positive interest",
      confidentiality: "INTERNAL",
      occurredAt: new Date().toISOString(),
    },
    token
  );
  log("create communication", commRes.status === 201 || commRes.status === 200, `status ${commRes.status}`);

  const taskRes = await api(
    "POST",
    "/fundraising/tasks",
    {
      title: `UAT SRD task ${stamp}`,
      description: "Follow up on soft circle",
      dueDate: "2026-08-01",
      priority: "HIGH",
      campaignId,
      opportunityId,
      investorId,
    },
    token
  );
  log("create fundraising task", taskRes.status === 201 || taskRes.status === 200, `status ${taskRes.status}`);

  const commitRes = await api(
    "POST",
    "/fundraising/commitments",
    {
      opportunityId,
      investorId,
      campaignId,
      fundId: fund.id,
      currency: "USD",
      commitmentAmount: 5000000,
      status: "SIGNED",
      signedAt: new Date().toISOString(),
    },
    token
  );
  const commitmentId = commitRes.json?.data?.id;
  log("create commitment", (commitRes.status === 201 || commitRes.status === 200) && Boolean(commitmentId), `status ${commitRes.status}`);

  const closingRes = await api(
    "POST",
    "/fundraising/closings",
    {
      campaignId,
      fundId: fund.id,
      closeType: "FIRST_CLOSE",
      closingDate: "2026-09-30",
    },
    token
  );
  const closingId = closingRes.json?.data?.id;
  log("create closing", (closingRes.status === 201 || closingRes.status === 200) && Boolean(closingId), `status ${closingRes.status}`);

  const readiness = await api(
    "POST",
    `/fundraising/closings/${closingId}/readiness`,
    { legalReady: true, complianceReady: true, fundReady: true },
    token
  );
  log("closing readiness", readiness.status === 200, `status ${readiness.status}`);

  const admitRes = await api("POST", `/fundraising/commitments/${commitmentId}/admit`, { closingId }, token);
  log(
    "admit commitment (not auto from signed alone path)",
    admitRes.status === 200 || admitRes.status === 201,
    `status ${admitRes.status} code=${admitRes.json?.error?.code || "ok"}`
  );

  const rfpRes = await api(
    "POST",
    "/fundraising/rfps",
    {
      investorId,
      campaignId,
      referenceNumber: `RFP-${stamp}`,
      institutionName: `UAT Institution ${stamp}`,
      deadline: "2026-10-01",
      status: "SUBMITTED",
    },
    token
  );
  const rfpId = rfpRes.json?.data?.id;
  log("create rfp", (rfpRes.status === 201 || rfpRes.status === 200) && Boolean(rfpId), `status ${rfpRes.status}`);

  await api("PATCH", `/fundraising/rfps/${rfpId}`, { outcome: "WON" }, token);
  const mandateFromRfp = await api("POST", `/fundraising/rfps/${rfpId}/convert-to-mandate`, {}, token);
  const mandateId = mandateFromRfp.json?.data?.id;
  log(
    "convert won rfp to mandate",
    (mandateFromRfp.status === 200 || mandateFromRfp.status === 201) && Boolean(mandateId),
    `status ${mandateFromRfp.status}`
  );

  const termsRes = await api(
    "PUT",
    `/fundraising/opportunities/${opportunityId}/commercial-terms`,
    {
      termsType: "PE_VC",
      terms: { managementFee: 2, carriedInterest: 20, hurdle: 8 },
    },
    token
  );
  log("upsert commercial terms", termsRes.status === 200 || termsRes.status === 201, `status ${termsRes.status}`);

  const ddqTpl = await api(
    "POST",
    "/fundraising/ddq/templates",
    { name: `UAT DDQ ${stamp}`, category: "Compliance", questions: [{ q: "UBO list?" }] },
    token
  );
  log("ddq template", ddqTpl.status === 201 || ddqTpl.status === 200, `status ${ddqTpl.status}`);

  const ddqCase = await api(
    "POST",
    "/fundraising/ddq/cases",
    {
      investorId,
      campaignId,
      opportunityId,
      templateId: ddqTpl.json?.data?.id,
      title: `DDQ case ${stamp}`,
    },
    token
  );
  log("ddq case", ddqCase.status === 201 || ddqCase.status === 200, `status ${ddqCase.status}`);

  const kyc = await api(
    "POST",
    "/fundraising/kyc-cases",
    { investorId, status: "UNDER_REVIEW", riskRating: "MEDIUM" },
    token
  );
  log("kyc case", kyc.status === 201 || kyc.status === 200, `status ${kyc.status}`);

  const room = await api(
    "POST",
    `/fundraising/campaigns/${campaignId}/data-rooms`,
    { name: `Data Room ${stamp}` },
    token
  );
  const dataRoomId = room.json?.data?.id;
  log("data room", (room.status === 201 || room.status === 200) && Boolean(dataRoomId), `status ${room.status}`);

  const folder = await api(
    "POST",
    `/fundraising/data-rooms/${dataRoomId}/folders`,
    { name: "Legal" },
    token
  );
  log("data room folder", folder.status === 201 || folder.status === 200, `status ${folder.status}`);

  const agreement = await api(
    "POST",
    "/fundraising/agreements",
    {
      opportunityId,
      investorId,
      campaignId,
      documentType: "SUBSCRIPTION_AGREEMENT",
      title: `Sub Agreement ${stamp}`,
    },
    token
  );
  log("agreement", agreement.status === 201 || agreement.status === 200, `status ${agreement.status}`);

  const agent = await api(
    "POST",
    "/fundraising/placement-agents",
    {
      legalName: `UAT Placement ${stamp}`,
      territory: "SSA",
      commissionPct: 1.5,
      appointmentStart: "2026-01-01",
      appointmentEnd: "2027-12-31",
    },
    token
  );
  const agentId = agent.json?.data?.id;
  log("placement agent", (agent.status === 201 || agent.status === 200) && Boolean(agentId), `status ${agent.status}`);

  if (agentId && opportunityId) {
    const assign = await api(
      "POST",
      `/fundraising/placement-agents/${agentId}/assign-opportunity`,
      { opportunityId },
      token
    );
    log("assign placement opportunity", assign.status === 200 || assign.status === 201, `status ${assign.status}`);
  }

  const forecast = await api(
    "POST",
    "/fundraising/forecasts/scenarios",
    {
      campaignId,
      name: `Base ${stamp}`,
      scenarioType: "BASE",
      assumptions: { winRate: 0.4 },
      projectedSigned: 40000000,
    },
    token
  );
  log("forecast scenario", forecast.status === 201 || forecast.status === 200, `status ${forecast.status}`);

  const funnel = await api("GET", `/fundraising/analytics/funnel?campaignId=${campaignId}`, undefined, token);
  log("analytics funnel", funnel.status === 200, `status ${funnel.status}`);

  const report = await api("GET", `/fundraising/reports/pipeline-summary?campaignId=${campaignId}`, undefined, token);
  log("report pipeline-summary", report.status === 200, `status ${report.status}`);

  const audit = await api("GET", "/fundraising/audit-logs?limit=20", undefined, token);
  log("audit logs", audit.status === 200, `status ${audit.status}`);

  const i360 = await api("GET", `/investors/${investorId}/360`, undefined, token);
  log(
    "investor 360",
    i360.status === 200 && i360.json?.data?.organisation?.id === investorId,
    `status ${i360.status}`
  );

  const dash = await api("GET", `/fundraising/dashboard?campaignId=${campaignId}`, undefined, token);
  log("executive dashboard", dash.status === 200, `status ${dash.status}`);

  // Guardrail: amount patch without reason should fail
  const noReason = await api(
    "PATCH",
    `/fundraising/opportunities/${opportunityId}`,
    { softCircleAmount: 4500000 },
    token
  );
  log(
    "amount patch requires reason",
    noReason.status === 400 && (noReason.json?.error?.code === "VALIDATION_ERROR" || Boolean(noReason.json?.error)),
    `status ${noReason.status} code=${noReason.json?.error?.code}`
  );

  const withReason = await api(
    "PATCH",
    `/fundraising/opportunities/${opportunityId}`,
    { softCircleAmount: 4500000, reason: "UAT soft circle" },
    token
  );
  log("amount patch with reason", withReason.status === 200, `status ${withReason.status}`);

  console.log("\n=== CLIENT DEMO FIXTURE ===");
  console.log(
    JSON.stringify(
      {
        fund: { id: fund.id, name: fund.name },
        investorId,
        contactId,
        campaignId,
        opportunityId,
        commitmentId,
        closingId,
        mandateId,
        dataRoomId,
        agentId,
        login: { email: EMAIL, password: PASSWORD },
        mounts: { fundraising: "/api/fundraising", investors: "/api/investors" },
      },
      null,
      2
    )
  );

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nUAT fundraising SRD: ${passed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
