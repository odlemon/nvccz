/**
 * UAT — Fundraising FE gaps (settings, meetings, documents, engagement, etc.)
 * Against running API + nts DB. Run: npm run uat:fundraising:fe-gaps
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? "admin123";

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
  const json = (await res.json()) as any;
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
  log("login", Boolean(token), token ? "ok" : `BASE=${BASE}`);
  if (!token) process.exit(1);

  const settings = await api("GET", "/fundraising/settings", undefined, token);
  const peStages = settings.json?.data?.pipelines?.PE_VC?.stages?.length ?? 0;
  const amStages = settings.json?.data?.pipelines?.AM?.stages?.length ?? 0;
  log(
    "GET settings",
    settings.status === 200 && peStages >= 10 && amStages >= 10,
    `status ${settings.status} PE=${peStages} AM=${amStages}`
  );

  const stageId = settings.json?.data?.pipelines?.PE_VC?.stages?.[1]?.id;
  if (stageId) {
    const patchStage = await api(
      "PATCH",
      `/fundraising/settings/pipelines/PE_VC/stages/${stageId}`,
      { winProbabilityPct: 16 },
      token
    );
    log("PATCH pipeline stage", patchStage.status === 200, `status ${patchStage.status}`);
  } else {
    log("PATCH pipeline stage", false, "no stage id");
  }

  const gates = await api(
    "PATCH",
    "/fundraising/settings/stage-gates",
    {
      gates: [{ stageCode: "QUALIFIED", requiresIndicativeAmount: true, requiresPreviousStageChecklist: true }],
    },
    token
  );
  log("PATCH stage-gates", gates.status === 200, `status ${gates.status}`);

  const fund =
    (await prisma.fund.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } })) ||
    null;
  log("resolve fund", Boolean(fund), fund ? fund.name : "none");

  const stamp = Date.now().toString(36).slice(-5);
  const inv = await api(
    "POST",
    "/investors",
    { legalName: `FE Gaps Inv ${stamp}`, investorType: "PENSION_FUND", countryCode: "ZW" },
    token
  );
  const investorId = inv.json?.data?.id;
  log("create investor", inv.status === 201 && Boolean(investorId), `status ${inv.status}`);

  let campaignId: string | undefined;
  if (fund) {
    const camp = await api(
      "POST",
      "/fundraising/campaigns",
      {
        campaignType: "PE_FUNDRAISE",
        name: `FE Gaps Camp ${stamp}`,
        fundId: fund.id,
        targetCapital: 10000000,
        primaryCurrency: "USD",
        startDate: "2026-01-01",
        closeDate: "2027-12-31",
      },
      token
    );
    campaignId = camp.json?.data?.id;
    log("create campaign", camp.status === 201 && Boolean(campaignId), `status ${camp.status}`);
    if (campaignId) {
      const act = await api("POST", `/fundraising/campaigns/${campaignId}/activate`, {}, token);
      log("activate campaign", act.status === 200, `status ${act.status}`);
    }
  }

  const mtg = await api(
    "POST",
    "/fundraising/meetings",
    {
      title: `UAT Meeting ${stamp}`,
      meetingType: "VIDEO",
      scheduledStart: "2026-08-05T14:00:00.000Z",
      scheduledEnd: "2026-08-05T15:00:00.000Z",
      timezone: "Africa/Harare",
      campaignId,
      investorId,
      agenda: "UAT",
      attendees: [{ email: `uat-${stamp}@example.com`, fullName: "UAT Guest", role: "EXTERNAL" }],
    },
    token
  );
  const meetingId = mtg.json?.data?.id;
  log("create meeting", (mtg.status === 201 || mtg.status === 200) && Boolean(meetingId), `status ${mtg.status}`);

  const listMtg = await api(
    "GET",
    `/fundraising/meetings?from=2026-08-01&to=2026-08-31${campaignId ? `&campaignId=${campaignId}` : ""}`,
    undefined,
    token
  );
  log(
    "list meetings",
    listMtg.status === 200 && Array.isArray(listMtg.json?.data?.items || listMtg.json?.data),
    `status ${listMtg.status}`
  );

  const doc = await api(
    "POST",
    "/fundraising/documents",
    {
      name: `Teaser ${stamp}`,
      category: "Marketing",
      campaignId,
      investorId,
      confidential: true,
      sourceType: "UPLOAD",
    },
    token
  );
  const documentId = doc.json?.data?.id;
  log("create document meta", (doc.status === 201 || doc.status === 200) && Boolean(documentId), `status ${doc.status}`);

  const docs = await api(
    "GET",
    `/fundraising/documents${campaignId ? `?campaignId=${campaignId}` : ""}`,
    undefined,
    token
  );
  log("list documents", docs.status === 200, `status ${docs.status}`);

  if (campaignId) {
    const eng = await api("GET", `/fundraising/campaigns/${campaignId}/engagement`, undefined, token);
    log(
      "campaign engagement",
      eng.status === 200 && eng.json?.data?.campaignId === campaignId,
      `status ${eng.status}`
    );

    const forecast = await api(
      "POST",
      "/fundraising/forecasts/scenarios",
      {
        campaignId,
        name: `Base ${stamp}`,
        scenarioType: "BASE",
        projectedSigned: 8000000,
        assumptions: { winRate: 0.5 },
      },
      token
    );
    const scenarioId = forecast.json?.data?.id;
    log("create forecast", (forecast.status === 201 || forecast.status === 200) && Boolean(scenarioId), `status ${forecast.status}`);
    if (scenarioId) {
      const curve = await api("GET", `/fundraising/forecasts/scenarios/${scenarioId}/curve`, undefined, token);
      const pts = curve.json?.data?.monthlyProjection?.length ?? curve.json?.data?.length ?? 0;
      log("forecast curve", curve.status === 200 && pts >= 1, `status ${curve.status} pts=${pts}`);
    }
  }

  const mandate = await api(
    "POST",
    "/fundraising/mandates",
    {
      investorId,
      campaignId,
      name: `Mandate ${stamp}`,
      assetClass: "Private Equity",
      geography: "Sub-Saharan Africa",
      expectedAum: 25000000,
    },
    token
  );
  log(
    "mandate with assetClass",
    (mandate.status === 201 || mandate.status === 200) &&
      (mandate.json?.data?.assetClass === "Private Equity" || Boolean(mandate.json?.data?.id)),
    `status ${mandate.status} assetClass=${mandate.json?.data?.assetClass}`
  );

  const rfp = await api(
    "POST",
    "/fundraising/rfps",
    {
      investorId,
      campaignId,
      institutionName: `Inst ${stamp}`,
      referenceNumber: `RFP-${stamp}`,
      assetClass: "Fixed Income",
      geography: "Southern Africa",
      fitScore: 78,
    },
    token
  );
  log(
    "rfp with fitScore",
    (rfp.status === 201 || rfp.status === 200) && Boolean(rfp.json?.data?.id),
    `status ${rfp.status} fitScore=${rfp.json?.data?.fitScore}`
  );

  const agent = await api(
    "POST",
    "/fundraising/placement-agents",
    {
      legalName: `Agent ${stamp}`,
      commissionPct: 1.5,
      appointmentStart: "2026-01-01",
      appointmentEnd: "2027-12-31",
    },
    token
  );
  const agentId = agent.json?.data?.id;
  log("placement agent", Boolean(agentId), `status ${agent.status}`);
  if (agentId) {
    const comm = await api("GET", `/fundraising/placement-agents/${agentId}/commissions`, undefined, token);
    log("agent commissions", comm.status === 200, `status ${comm.status}`);
  }

  // Commitment checklist needs opportunity + commitment
  if (campaignId && investorId) {
    const opp = await api(
      "POST",
      "/fundraising/opportunities",
      {
        campaignId,
        investorId,
        opportunityType: "LP_COMMITMENT",
        indicativeAmount: 1000000,
      },
      token
    );
    const opportunityId = opp.json?.data?.id;
    log("opportunity", Boolean(opportunityId), `status ${opp.status}`);
    if (opportunityId) {
      const cmt = await api(
        "POST",
        "/fundraising/commitments",
        {
          opportunityId,
          investorId,
          campaignId,
          fundId: fund?.id,
          commitmentAmount: 1000000,
          status: "SIGNED",
        },
        token
      );
      const commitmentId = cmt.json?.data?.id;
      log("commitment", Boolean(commitmentId), `status ${cmt.status}`);
      if (commitmentId) {
        const cl = await api("GET", `/fundraising/commitments/${commitmentId}/checklist`, undefined, token);
        const items = cl.json?.data?.items || cl.json?.data || [];
        const itemId = Array.isArray(items) ? items[0]?.id : undefined;
        log("commitment checklist", cl.status === 200 && Array.isArray(items) && items.length >= 1, `status ${cl.status} n=${items.length}`);
        if (itemId) {
          const patch = await api(
            "PATCH",
            `/fundraising/commitments/${commitmentId}/checklist/${itemId}`,
            { isComplete: true },
            token
          );
          log("patch checklist item", patch.status === 200, `status ${patch.status}`);
        }
      }
    }
  }

  console.log("\n=== CLIENT DEMO FIXTURE ===");
  console.log(JSON.stringify({ investorId, campaignId, meetingId, documentId, agentId, login: { email: EMAIL } }, null, 2));

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nUAT fundraising FE gaps: ${passed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
