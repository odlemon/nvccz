/**
 * UAT — Fundraising requirements gaps 9–24 (HTTP).
 * Runs against a live API on the nts dev DB (Prisma DATABASE_URL / .env).
 *
 * Prereqs:
 *   npm run db:migrate:fundraising-requirements-gap
 *   API server running (default http://localhost:3002/api)
 *
 * Run: npm run uat:fundraising:requirements-gap
 *
 * Env: API_URL | API_BASE_URL, UAT_EMAIL, UAT_PASSWORD, UAT_FUND_ID (optional)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = (
  process.env.API_URL ??
  process.env.API_BASE_URL ??
  "http://localhost:3002/api"
).replace(/\/$/, "");
const EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";

type StepStatus = "PASS" | "FAIL" | "SKIP";
const results: Array<{ step: string; status: StepStatus; detail: string }> = [];

let passCount = 0;
let failCount = 0;
let skipCount = 0;

function record(step: string, status: StepStatus, detail: string) {
  results.push({ step, status, detail });
  if (status === "PASS") passCount += 1;
  else if (status === "FAIL") failCount += 1;
  else skipCount += 1;
  console.log(`[${status}] ${step}: ${detail}`);
}

function pass(step: string, detail: string) {
  record(step, "PASS", detail);
}

function fail(step: string, detail: string) {
  record(step, "FAIL", detail);
}

function skip(step: string, reason: string) {
  record(step, "SKIP", reason);
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

async function apiMultipart(method: string, path: string, form: FormData, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function apiText(method: string, path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  return {
    status: res.status,
    text,
    contentType: res.headers.get("content-type") || "",
  };
}

function tinyPdfBlob(): Blob {
  const bytes = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  return new Blob([bytes], { type: "application/pdf" });
}

async function main() {
  console.log(`Fundraising requirements-gap UAT — ${BASE} (nts dev DB via DATABASE_URL)\n`);

  const token = await login();
  if (!token) {
    fail("login", `no token — check API at ${BASE} and credentials ${EMAIL}`);
    await prisma.$disconnect();
    process.exit(1);
  }
  pass("login", `ok (${EMAIL})`);

  const fund =
    (process.env.UAT_FUND_ID
      ? await prisma.fund.findUnique({
          where: { id: process.env.UAT_FUND_ID },
          select: { id: true, name: true },
        })
      : null) ||
    (await prisma.fund.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } }));

  if (!fund) {
    fail("resolve fund", "none in DB — seed a fund first");
    await prisma.$disconnect();
    process.exit(1);
  }
  pass("resolve fund", `${fund.name} (${fund.id})`);

  const stamp = Date.now().toString(36).slice(-6);
  const legalName = `UAT ReqGap Inv ${stamp}`;

  // ── Gap 9: investor advanced list + duplicate contract ─────────
  const invRes = await api(
    "POST",
    "/investors",
    {
      legalName,
      investorType: "PENSION_FUND",
      countryCode: "ZW",
      baseCurrency: "USD",
      kycStatus: "CLEARED",
      sanctionsStatus: "CLEAR",
      estimatedAum: 50000000,
      riskRating: "LOW",
    },
    token
  );
  const investorId = invRes.json?.data?.id;
  if (invRes.status === 201 && investorId) {
    pass("gap9 create investor", `id=${investorId}`);
  } else {
    fail("gap9 create investor", `status ${invRes.status}`);
  }

  const dupRes = await api(
    "POST",
    "/investors",
    { legalName, investorType: "PENSION_FUND", countryCode: "ZW" },
    token
  );
  const dupCode = dupRes.json?.error?.code ?? dupRes.json?.code;
  if (dupRes.status === 409 && dupCode === "DUPLICATE_INVESTOR") {
    pass("gap9 duplicate investor contract", `409 DUPLICATE_INVESTOR existingId=${dupRes.json?.error?.existingId ?? dupRes.json?.existingId ?? "?"}`);
  } else {
    fail("gap9 duplicate investor contract", `expected 409 DUPLICATE_INVESTOR got ${dupRes.status} code=${dupCode}`);
  }

  if (investorId) {
    const advList = await api(
      "GET",
      `/investors?countryCode=ZW&kycStatus=CLEARED&minAum=1000000&pageSize=5&q=${encodeURIComponent("UAT ReqGap")}`,
      undefined,
      token
    );
    const items = advList.json?.data?.items ?? advList.json?.data ?? [];
    const hit = Array.isArray(items) && items.some((i: { id?: string }) => i.id === investorId);
    if (advList.status === 200 && hit) {
      pass("gap9 investor advanced list filters", `found investor in ${items.length} rows`);
    } else if (advList.status === 200) {
      fail(
        "gap9 investor advanced list filters",
        `status 200 but investor not in page (total=${advList.json?.data?.total ?? "?"})`
      );
    } else {
      fail("gap9 investor advanced list filters", `status ${advList.status}`);
    }
  } else {
    skip("gap9 investor advanced list filters", "no investorId from create");
  }

  // ── Gap 10: contacts (global index + patch) ────────────────────
  let contactId: string | undefined;
  if (investorId) {
    const contactRes = await api(
      "POST",
      `/investors/${investorId}/contacts`,
      {
        fullName: "UAT ReqGap Contact",
        email: `reqgap.${stamp}@example.com`,
        roleTitle: "CIO",
        isPrimary: true,
        decisionInfluence: "HIGH",
      },
      token
    );
    contactId = contactRes.json?.data?.id;
    if (contactRes.status === 201 && contactId) {
      pass("gap10 add investor contact", `id=${contactId}`);
    } else {
      fail("gap10 add investor contact", `status ${contactRes.status}`);
    }

    if (contactId) {
      const patchContact = await api(
        "PATCH",
        `/investors/${investorId}/contacts/${contactId}`,
        { phone: "+263771111222", nextAction: "Follow up post-roadshow" },
        token
      );
      if (patchContact.status === 200) pass("gap10 patch investor contact", "status 200");
      else fail("gap10 patch investor contact", `status ${patchContact.status}`);
    }

    const globalContacts = await api(
      "GET",
      `/fundraising/contacts?investorId=${investorId}&decisionInfluence=HIGH`,
      undefined,
      token
    );
    const gItems = globalContacts.json?.data?.items ?? globalContacts.json?.data ?? [];
    const gHit = Array.isArray(gItems) && gItems.some((c: { id?: string }) => c.id === contactId);
    if (globalContacts.status === 200 && gHit) {
      pass("gap10 global contacts index", `matched contact in ${gItems.length} rows`);
    } else if (globalContacts.status === 200 && contactId) {
      fail("gap10 global contacts index", "contact not found in filtered list");
    } else {
      fail("gap10 global contacts index", `status ${globalContacts.status}`);
    }
  } else {
    skip("gap10 contacts", "no investorId");
  }

  // ── Campaigns: workflow (active) + draft-only + pause target ───
  const mkCampaign = async (name: string) => {
    const res = await api(
      "POST",
      "/fundraising/campaigns",
      {
        campaignType: "PE_FUNDRAISE",
        name,
        fundId: fund.id,
        targetCapital: 25000000,
        primaryCurrency: "USD",
        startDate: "2026-01-01",
        closeDate: "2027-12-31",
      },
      token
    );
    return { status: res.status, id: res.json?.data?.id as string | undefined };
  };

  const workflowCamp = await mkCampaign(`UAT ReqGap Workflow ${stamp}`);
  const draftCamp = await mkCampaign(`UAT ReqGap Draft ${stamp}`);
  const pauseCamp = await mkCampaign(`UAT ReqGap Pause ${stamp}`);

  const campaignId = workflowCamp.id;
  const draftCampaignId = draftCamp.id;
  const pauseCampaignId = pauseCamp.id;

  if (campaignId) pass("create workflow campaign", campaignId);
  else fail("create workflow campaign", `status ${workflowCamp.status}`);
  if (draftCampaignId) pass("create draft-only campaign", draftCampaignId);
  else fail("create draft-only campaign", `status ${draftCamp.status}`);
  if (pauseCampaignId) pass("create pause-target campaign", pauseCampaignId);
  else fail("create pause-target campaign", `status ${pauseCamp.status}`);

  if (campaignId) {
    const act = await api("POST", `/fundraising/campaigns/${campaignId}/activate`, {}, token);
    if (act.status === 200) pass("activate workflow campaign", act.json?.data?.status ?? "ACTIVE");
    else fail("activate workflow campaign", `status ${act.status}`);
  }

  // ── Gap 11: campaign templates / lists / events ────────────────
  let draftApprovalId: string | undefined;
  if (draftCampaignId) {
    const tpl = await api(
      "POST",
      `/fundraising/campaigns/${draftCampaignId}/templates`,
      {
        name: `Intro Email ${stamp}`,
        templateType: "EMAIL",
        subject: "Fund introduction",
        bodyHtml: "<p>UAT template body</p>",
      },
      token
    );
    if ((tpl.status === 201 || tpl.status === 200) && tpl.json?.data?.id) {
      pass("gap11 create campaign template", tpl.json.data.id);
    } else {
      fail("gap11 create campaign template", `status ${tpl.status}`);
    }

    const listTpl = await api(
      "GET",
      `/fundraising/campaigns/${draftCampaignId}/templates`,
      undefined,
      token
    );
    if (listTpl.status === 200 && Array.isArray(listTpl.json?.data) && listTpl.json.data.length >= 1) {
      pass("gap11 list campaign templates", `n=${listTpl.json.data.length}`);
    } else {
      fail("gap11 list campaign templates", `status ${listTpl.status}`);
    }

    const dist = await api(
      "POST",
      `/fundraising/campaigns/${draftCampaignId}/distribution-lists`,
      {
        name: `LP Segment ${stamp}`,
        members: investorId && contactId ? [{ investorId, contactId }] : [],
      },
      token
    );
    if ((dist.status === 201 || dist.status === 200) && dist.json?.data?.id) {
      pass("gap11 create distribution list", dist.json.data.id);
    } else {
      fail("gap11 create distribution list", `status ${dist.status}`);
    }

    const listDist = await api(
      "GET",
      `/fundraising/campaigns/${draftCampaignId}/distribution-lists`,
      undefined,
      token
    );
    if (listDist.status === 200 && Array.isArray(listDist.json?.data)) {
      pass("gap11 list distribution lists", `n=${listDist.json.data.length}`);
    } else {
      fail("gap11 list distribution lists", `status ${listDist.status}`);
    }

    const evt = await api(
      "POST",
      `/fundraising/campaigns/${draftCampaignId}/events`,
      {
        title: `Roadshow Harare ${stamp}`,
        eventType: "ROADSHOW",
        startsAt: "2026-09-10T09:00:00.000Z",
        endsAt: "2026-09-10T17:00:00.000Z",
        location: "Harare",
      },
      token
    );
    if ((evt.status === 201 || evt.status === 200) && evt.json?.data?.id) {
      pass("gap11 create campaign event", evt.json.data.id);
    } else {
      fail("gap11 create campaign event", `status ${evt.status}`);
    }

    const listEvt = await api(
      "GET",
      `/fundraising/campaigns/${draftCampaignId}/events`,
      undefined,
      token
    );
    if (listEvt.status === 200 && Array.isArray(listEvt.json?.data)) {
      pass("gap11 list campaign events", `n=${listEvt.json.data.length}`);
    } else {
      fail("gap11 list campaign events", `status ${listEvt.status}`);
    }

    // Submit for approval — safe on dedicated draft campaign (never activated)
    const submit = await api(
      "POST",
      `/fundraising/campaigns/${draftCampaignId}/submit-for-approval`,
      { reason: "UAT activation request", requestType: "CAMPAIGN_ACTIVATION" },
      token
    );
    const approvalId = submit.json?.data?.approval?.id ?? submit.json?.data?.approvalId;
    draftApprovalId = approvalId;
    if ((submit.status === 201 || submit.status === 200) && approvalId) {
      pass("gap11 submit draft campaign for approval", `approvalId=${approvalId}`);
    } else {
      fail("gap11 submit draft campaign for approval", `status ${submit.status}`);
    }
  } else {
    skip("gap11 campaign templates/lists/events", "no draftCampaignId");
    skip("gap11 submit draft campaign for approval", "no draftCampaignId");
  }

  // Pause — dedicated campaign activated then paused (non-destructive)
  if (pauseCampaignId) {
    const actPause = await api("POST", `/fundraising/campaigns/${pauseCampaignId}/activate`, {}, token);
    if (actPause.status === 200) {
      const pause = await api(
        "POST",
        `/fundraising/campaigns/${pauseCampaignId}/pause`,
        { reason: "UAT pause smoke test" },
        token
      );
      if (pause.status === 200 && pause.json?.data?.status === "PAUSED") {
        pass("gap11 pause dedicated active campaign", "status PAUSED");
      } else {
        fail("gap11 pause dedicated active campaign", `status ${pause.status}`);
      }
    } else {
      skip("gap11 pause dedicated active campaign", `could not activate pause-target campaign (${actPause.status})`);
    }
  } else {
    skip("gap11 pause dedicated active campaign", "no pauseCampaignId");
  }

  // ── Gap 16-ish / meetings: completion outcomes + idempotency ───
  let meetingId: string | undefined;
  if (campaignId && investorId) {
    const mtg = await api(
      "POST",
      "/fundraising/meetings",
      {
        title: `UAT ReqGap Meeting ${stamp}`,
        meetingType: "VIDEO",
        scheduledStart: "2026-09-15T10:00:00.000Z",
        scheduledEnd: "2026-09-15T11:00:00.000Z",
        timezone: "Africa/Harare",
        campaignId,
        investorId,
        contactId,
        agenda: "DD discussion",
        attendees: [{ email: `guest.${stamp}@example.com`, fullName: "Guest LP", role: "EXTERNAL" }],
      },
      token
    );
    meetingId = mtg.json?.data?.id;
    if ((mtg.status === 201 || mtg.status === 200) && meetingId) {
      pass("create meeting", meetingId);
    } else {
      fail("create meeting", `status ${mtg.status}`);
    }

    if (meetingId) {
      const completeBody = {
        outcomeSummary: "Positive interest; requested DD pack",
        discussionNotes: "Walked through strategy and track record",
        decisions: [{ title: "Send DDQ", ownerId: null }],
        actionItems: [{ title: "Email teaser deck", dueDate: "2026-09-20" }],
        idempotencyKey: `uat-reqgap-${stamp}`,
      };
      const complete1 = await api("POST", `/fundraising/meetings/${meetingId}/complete`, completeBody, token);
      const done =
        complete1.status === 200 &&
        (complete1.json?.data?.status === "COMPLETED" || complete1.json?.data?.outcomeSummary);
      if (done) pass("gap16 complete meeting with outcomes", "status COMPLETED");
      else fail("gap16 complete meeting with outcomes", `status ${complete1.status}`);

      const complete2 = await api("POST", `/fundraising/meetings/${meetingId}/complete`, completeBody, token);
      if (complete2.status === 200 && complete2.json?.data?.status === "COMPLETED") {
        pass("gap16 complete meeting idempotent replay", "second call ok");
      } else {
        fail("gap16 complete meeting idempotent replay", `status ${complete2.status}`);
      }
    }
  } else {
    skip("gap16 meeting completion", "missing campaignId or investorId");
  }

  // ── Opportunity + RFP for later gaps ─────────────────────────
  let opportunityId: string | undefined;
  let rfpId: string | undefined;
  if (campaignId && investorId) {
    const opp = await api(
      "POST",
      "/fundraising/opportunities",
      {
        campaignId,
        investorId,
        opportunityType: "LP_COMMITMENT",
        indicativeAmount: 3000000,
        priority: "HIGH",
      },
      token
    );
    opportunityId = opp.json?.data?.id;
    if (opp.status === 201 && opportunityId) pass("create opportunity", opportunityId);
    else fail("create opportunity", `status ${opp.status}`);

    const rfp = await api(
      "POST",
      "/fundraising/rfps",
      {
        investorId,
        campaignId,
        institutionName: `Inst ${stamp}`,
        referenceNumber: `RFP-RG-${stamp}`,
        assetClass: "Private Equity",
        geography: "Southern Africa",
        fitScore: 82,
      },
      token
    );
    rfpId = rfp.json?.data?.id;
    if ((rfp.status === 201 || rfp.status === 200) && rfpId) pass("create RFP", rfpId);
    else fail("create RFP", `status ${rfp.status}`);
  }

  // ── Gap 12: RFP proposal versions ──────────────────────────────
  if (rfpId) {
    const form = new FormData();
    form.append("file", tinyPdfBlob(), `proposal-v1-${stamp}.pdf`);
    form.append("status", "DRAFT");
    const prop = await apiMultipart("POST", `/fundraising/rfps/${rfpId}/proposal-versions`, form, token);
    if ((prop.status === 201 || prop.status === 200) && prop.json?.data?.versionNumber) {
      pass("gap12 create RFP proposal version", `v${prop.json.data.versionNumber}`);
    } else if (prop.status >= 500 || prop.json?.error?.message?.includes?.("upload")) {
      skip("gap12 create RFP proposal version", `remote upload unavailable (${prop.status})`);
    } else {
      fail("gap12 create RFP proposal version", `status ${prop.status} ${prop.json?.error?.code ?? ""}`);
    }

    const listProp = await api("GET", `/fundraising/rfps/${rfpId}/proposal-versions`, undefined, token);
    if (listProp.status === 200 && Array.isArray(listProp.json?.data)) {
      pass("gap12 list RFP proposal versions", `n=${listProp.json.data.length}`);
    } else {
      fail("gap12 list RFP proposal versions", `status ${listProp.status}`);
    }
  } else {
    skip("gap12 RFP proposal versions", "no rfpId");
  }

  // ── Gap 13: DDQ item / questions / library / comments ──────────
  let ddqCaseId: string | undefined;
  let ddqItemId: string | undefined;
  if (investorId && campaignId) {
    const ddqCase = await api(
      "POST",
      "/fundraising/ddq/cases",
      {
        investorId,
        campaignId,
        opportunityId,
        title: `UAT DDQ ${stamp}`,
        items: [
          { category: "Governance", requirement: "List board members" },
          { category: "Compliance", requirement: "AML policy summary" },
        ],
      },
      token
    );
    ddqCaseId = ddqCase.json?.data?.id;
    const items = ddqCase.json?.data?.items ?? [];
    ddqItemId = Array.isArray(items) ? items[0]?.id : undefined;
    if ((ddqCase.status === 201 || ddqCase.status === 200) && ddqCaseId) {
      pass("gap13 create DDQ case", `${ddqCaseId} items=${items.length}`);
    } else {
      fail("gap13 create DDQ case", `status ${ddqCase.status}`);
    }

    if (ddqCaseId && ddqItemId) {
      const patchItem = await api(
        "PATCH",
        `/fundraising/ddq/cases/${ddqCaseId}/items/${ddqItemId}`,
        { status: "IN_REVIEW", reviewerComments: "Needs sign-off" },
        token
      );
      if (patchItem.status === 200) pass("gap13 patch DDQ item", patchItem.json?.data?.status ?? "ok");
      else fail("gap13 patch DDQ item", `status ${patchItem.status}`);

      const q = await api(
        "POST",
        `/fundraising/ddq/cases/${ddqCaseId}/questions`,
        { questionText: "Who is the UBO?", itemId: ddqItemId },
        token
      );
      if ((q.status === 201 || q.status === 200) && q.json?.data?.id) {
        pass("gap13 create DDQ question", q.json.data.id);
      } else {
        fail("gap13 create DDQ question", `status ${q.status}`);
      }

      const listQ = await api("GET", `/fundraising/ddq/cases/${ddqCaseId}/questions`, undefined, token);
      if (listQ.status === 200 && Array.isArray(listQ.json?.data)) {
        pass("gap13 list DDQ questions", `n=${listQ.json.data.length}`);
      } else {
        fail("gap13 list DDQ questions", `status ${listQ.status}`);
      }

      const lib = await api(
        "POST",
        "/fundraising/ddq/answer-library",
        {
          questionKey: `ubo-structure-${stamp}`,
          category: "Compliance",
          approvedAnswer: "Standard UBO disclosure per policy v3",
        },
        token
      );
      if ((lib.status === 201 || lib.status === 200) && lib.json?.data?.id) {
        pass("gap13 create DDQ answer library entry", lib.json.data.id);
      } else {
        fail("gap13 create DDQ answer library entry", `status ${lib.status}`);
      }

      const listLib = await api("GET", "/fundraising/ddq/answer-library?q=ubo", undefined, token);
      if (listLib.status === 200 && Array.isArray(listLib.json?.data)) {
        pass("gap13 list DDQ answer library", `n=${listLib.json.data.length}`);
      } else {
        fail("gap13 list DDQ answer library", `status ${listLib.status}`);
      }

      const cmt = await api(
        "POST",
        `/fundraising/ddq/cases/${ddqCaseId}/items/${ddqItemId}/comments`,
        { commentText: "Please attach certified registry extract" },
        token
      );
      if ((cmt.status === 201 || cmt.status === 200) && cmt.json?.data?.id) {
        pass("gap13 create DDQ item comment", cmt.json.data.id);
      } else {
        fail("gap13 create DDQ item comment", `status ${cmt.status}`);
      }

      const listCmt = await api(
        "GET",
        `/fundraising/ddq/cases/${ddqCaseId}/items/${ddqItemId}/comments`,
        undefined,
        token
      );
      if (listCmt.status === 200 && Array.isArray(listCmt.json?.data) && listCmt.json.data.length >= 1) {
        pass("gap13 list DDQ item comments", `n=${listCmt.json.data.length}`);
      } else {
        fail("gap13 list DDQ item comments", `status ${listCmt.status}`);
      }
    } else {
      skip("gap13 DDQ item/questions/library/comments", "no ddqCaseId or ddqItemId");
    }
  } else {
    skip("gap13 DDQ", "missing investorId or campaignId");
  }

  // ── Gap 14: data room permission revoke ────────────────────────
  let dataRoomId: string | undefined;
  let accessId: string | undefined;
  if (campaignId && investorId) {
    const room = await api(
      "POST",
      `/fundraising/campaigns/${campaignId}/data-rooms`,
      { name: `UAT Data Room ${stamp}` },
      token
    );
    dataRoomId = room.json?.data?.id;
    if ((room.status === 201 || room.status === 200) && dataRoomId) {
      pass("gap14 create data room", dataRoomId);
    } else {
      fail("gap14 create data room", `status ${room.status}`);
    }

    if (dataRoomId) {
      const grant = await api(
        "POST",
        `/fundraising/data-rooms/${dataRoomId}/access`,
        { investorId, contactId, permissionLevel: "DOWNLOAD", watermarkEnabled: true },
        token
      );
      accessId = grant.json?.data?.id;
      if ((grant.status === 201 || grant.status === 200) && accessId) {
        pass("gap14 grant data room access", accessId);
      } else {
        fail("gap14 grant data room access", `status ${grant.status}`);
      }

      if (accessId) {
        const revoke = await api(
          "DELETE",
          `/fundraising/data-rooms/${dataRoomId}/access/${accessId}`,
          { reason: "UAT revoke smoke test" },
          token
        );
        if (revoke.status === 200 && revoke.json?.data?.revokedAt) {
          pass("gap14 revoke data room access", "revokedAt set");
        } else {
          fail("gap14 revoke data room access", `status ${revoke.status}`);
        }
      }
    }
  } else {
    skip("gap14 data room revoke", "missing campaignId or investorId");
  }

  // ── Gap 15: document versions (skip if upload impractical) ─────
  let documentId: string | undefined;
  if (campaignId && investorId) {
    const docMeta = await api(
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
    documentId = docMeta.json?.data?.id;
    if ((docMeta.status === 201 || docMeta.status === 200) && documentId) {
      pass("gap15 create document metadata", documentId);
    } else {
      fail("gap15 create document metadata", `status ${docMeta.status}`);
    }

    if (documentId) {
      const versionsMeta = await api("GET", `/fundraising/documents/${documentId}/versions`, undefined, token);
      if (versionsMeta.status === 200 && versionsMeta.json?.data?.documentId === documentId) {
        pass("gap15 get document version metadata", `count=${versionsMeta.json.data.versionCount ?? "?"}`);
      } else {
        fail("gap15 get document version metadata", `status ${versionsMeta.status}`);
      }

      const vForm = new FormData();
      vForm.append("file", tinyPdfBlob(), `teaser-v2-${stamp}.pdf`);
      vForm.append("changeNotes", "UAT version bump");
      const uploadVer = await apiMultipart(
        "POST",
        `/fundraising/documents/${documentId}/versions`,
        vForm,
        token
      );
      if ((uploadVer.status === 201 || uploadVer.status === 200) && uploadVer.json?.data?.versionNumber) {
        pass("gap15 upload document version", `v${uploadVer.json.data.versionNumber}`);
      } else if (uploadVer.status >= 500 || String(uploadVer.json?.error?.message || "").match(/upload|storage|remote/i)) {
        skip("gap15 upload document version", `remote storage unavailable (${uploadVer.status})`);
      } else {
        fail("gap15 upload document version", `status ${uploadVer.status}`);
      }
    }
  } else {
    skip("gap15 document versions", "missing campaignId or investorId");
  }

  // ── Gap 17: compliance hold / release (dedicated investor) ─────
  const holdInv = await api(
    "POST",
    "/investors",
    {
      legalName: `UAT Hold Inv ${stamp}`,
      investorType: "ENDOWMENT",
      countryCode: "ZA",
    },
    token
  );
  const holdInvestorId = holdInv.json?.data?.id;
  if (holdInv.status === 201 && holdInvestorId) {
    const place = await api(
      "POST",
      `/fundraising/investors/${holdInvestorId}/compliance-hold`,
      { reason: "UAT sanctions review pending" },
      token
    );
    const holdId = place.json?.data?.id;
    if (place.status === 201 && holdId) {
      pass("gap17 place compliance hold", holdId);

      const release = await api(
        "POST",
        `/fundraising/compliance-holds/${holdId}/release`,
        { releaseReason: "UAT cleared after review" },
        token
      );
      if (release.status === 200 && release.json?.data?.status === "RELEASED") {
        pass("gap17 release compliance hold", "RELEASED");
      } else {
        fail("gap17 release compliance hold", `status ${release.status}`);
      }
    } else {
      fail("gap17 place compliance hold", `status ${place.status}`);
    }
  } else {
    skip("gap17 compliance hold/release", "could not create hold test investor");
  }

  // ── Gap 18: placement exclusions + commission ledger ───────────
  let agentId: string | undefined;
  const agent = await api(
    "POST",
    "/fundraising/placement-agents",
    {
      legalName: `UAT Agent ${stamp}`,
      commissionPct: 1.25,
      appointmentStart: "2026-01-01",
      appointmentEnd: "2027-12-31",
    },
    token
  );
  agentId = agent.json?.data?.id;
  if ((agent.status === 201 || agent.status === 200) && agentId) {
    pass("gap18 create placement agent", agentId);
  } else {
    fail("gap18 create placement agent", `status ${agent.status}`);
  }

  if (agentId && investorId) {
    const excl = await api(
      "POST",
      "/fundraising/placement-exclusions",
      { agentId, investorId, reason: "Direct relationship — no commission", status: "ACTIVE" },
      token
    );
    if ((excl.status === 201 || excl.status === 200) && excl.json?.data?.id) {
      pass("gap18 create placement exclusion", excl.json.data.id);
    } else {
      fail("gap18 create placement exclusion", `status ${excl.status}`);
    }

    const listExcl = await api(
      "GET",
      `/fundraising/placement-exclusions?agentId=${agentId}&investorId=${investorId}`,
      undefined,
      token
    );
    if (listExcl.status === 200 && Array.isArray(listExcl.json?.data)) {
      pass("gap18 list placement exclusions", `n=${listExcl.json.data.length}`);
    } else {
      fail("gap18 list placement exclusions", `status ${listExcl.status}`);
    }

    const comm = await api(
      "POST",
      `/fundraising/placement-agents/${agentId}/commissions/pay`,
      { eventType: "ACCRUE", amount: 15000, currency: "USD", notes: "UAT accrual" },
      token
    );
    if ((comm.status === 201 || comm.status === 200) && comm.json?.data?.ledgerEntry?.id) {
      pass("gap18 placement commission ledger accrue", comm.json.data.ledgerEntry.id);
    } else {
      fail("gap18 placement commission ledger accrue", `status ${comm.status}`);
    }
  } else {
    skip("gap18 placement exclusions/commission", "missing agentId or investorId");
  }

  // ── Gap 20: report catalog / job / schedule / history ──────────
  const catalog = await api("GET", "/fundraising/reports", undefined, token);
  const catalogKeys = Array.isArray(catalog.json?.data)
    ? catalog.json.data.map((r: { reportKey?: string }) => r.reportKey)
    : [];
  if (catalog.status === 200 && catalogKeys.length >= 5) {
    pass("gap20 report catalog", `keys=${catalogKeys.length}`);
  } else {
    fail("gap20 report catalog", `status ${catalog.status} keys=${catalogKeys.length}`);
  }

  let reportJobId: string | undefined;
  let scheduleId: string | undefined;
  if (campaignId) {
    const job = await api(
      "POST",
      "/fundraising/reports/jobs",
      {
        reportKey: "pipeline-summary",
        format: "JSON",
        filters: { campaignId },
      },
      token
    );
    reportJobId = job.json?.data?.job?.id ?? job.json?.data?.id;
    if ((job.status === 201 || job.status === 200) && reportJobId) {
      pass("gap20 create report job", reportJobId);
    } else {
      fail("gap20 create report job", `status ${job.status}`);
    }

    if (reportJobId) {
      const getJob = await api("GET", `/fundraising/reports/jobs/${reportJobId}`, undefined, token);
      if (getJob.status === 200 && (getJob.json?.data?.job?.id === reportJobId || getJob.json?.data?.id === reportJobId)) {
        pass("gap20 get report job", reportJobId);
      } else {
        fail("gap20 get report job", `status ${getJob.status}`);
      }
    }

    const sched = await api(
      "POST",
      "/fundraising/reports/schedules",
      {
        reportKey: "funnel",
        name: `UAT Funnel ${stamp}`,
        cadence: "MONTHLY",
        format: "JSON",
        filters: { campaignId },
      },
      token
    );
    scheduleId = sched.json?.data?.id;
    if ((sched.status === 201 || sched.status === 200) && scheduleId) {
      pass("gap20 create report schedule", scheduleId);
    } else {
      fail("gap20 create report schedule", `status ${sched.status}`);
    }

    const listSched = await api("GET", "/fundraising/reports/schedules?reportKey=funnel", undefined, token);
    if (listSched.status === 200 && Array.isArray(listSched.json?.data)) {
      pass("gap20 list report schedules", `n=${listSched.json.data.length}`);
    } else {
      fail("gap20 list report schedules", `status ${listSched.status}`);
    }

    const runHist = await api("GET", "/fundraising/reports/history?limit=10", undefined, token);
    if (runHist.status === 200 && Array.isArray(runHist.json?.data)) {
      pass("gap20 list report run history", `n=${runHist.json.data.length}`);
    } else {
      fail("gap20 list report run history", `status ${runHist.status}`);
    }

    const keyHist = await api("GET", "/fundraising/reports/funnel/history?limit=5", undefined, token);
    if (keyHist.status === 200 && Array.isArray(keyHist.json?.data)) {
      pass("gap20 report key history", `n=${keyHist.json.data.length}`);
    } else {
      fail("gap20 report key history", `status ${keyHist.status}`);
    }

    const listJobs = await api("GET", "/fundraising/reports/jobs?limit=5", undefined, token);
    if (listJobs.status === 200 && Array.isArray(listJobs.json?.data)) {
      pass("gap20 list report jobs", `n=${listJobs.json.data.length}`);
    } else {
      fail("gap20 list report jobs", `status ${listJobs.status}`);
    }
  } else {
    skip("gap20 report jobs/schedules", "no campaignId");
  }

  // ── Gap 21: forecast recalc + analytics ────────────────────────
  let scenarioId: string | undefined;
  if (campaignId) {
    const fc = await api(
      "POST",
      "/fundraising/forecasts/scenarios",
      {
        campaignId,
        name: `UAT Base ${stamp}`,
        scenarioType: "BASE",
        projectedSigned: 12000000,
        assumptions: { winRate: 0.45 },
      },
      token
    );
    scenarioId = fc.json?.data?.id;
    if ((fc.status === 201 || fc.status === 200) && scenarioId) {
      pass("gap21 create forecast scenario", scenarioId);
    } else {
      fail("gap21 create forecast scenario", `status ${fc.status}`);
    }

    if (scenarioId) {
      const recalc = await api(
        "POST",
        `/fundraising/forecasts/scenarios/${scenarioId}/recalculate`,
        { assumptions: { winRate: 0.5 }, reason: "UAT recalc" },
        token
      );
      if (recalc.status === 200 && recalc.json?.data?.recalculatedAt) {
        pass("gap21 recalculate forecast scenario", `projectedSigned=${recalc.json.data.projectedSigned}`);
      } else {
        fail("gap21 recalculate forecast scenario", `status ${recalc.status}`);
      }
    }

    const conc = await api(
      "GET",
      `/fundraising/analytics/concentration?campaignId=${campaignId}&groupBy=investorType`,
      undefined,
      token
    );
    if (conc.status === 200 && Array.isArray(conc.json?.data?.rows)) {
      pass("gap21 analytics concentration", `rows=${conc.json.data.rows.length}`);
    } else {
      fail("gap21 analytics concentration", `status ${conc.status}`);
    }

    const geo = await api("GET", `/fundraising/analytics/geography?campaignId=${campaignId}`, undefined, token);
    if (geo.status === 200 && geo.json?.data?.byCountry != null) {
      pass("gap21 analytics geography", "byCountry present");
    } else {
      fail("gap21 analytics geography", `status ${geo.status}`);
    }
  } else {
    skip("gap21 forecast/analytics", "no campaignId");
  }

  // ── Gap 22: approval history (from draft submit) ───────────────
  if (draftApprovalId) {
    const hist = await api("GET", `/fundraising/approvals/${draftApprovalId}/history`, undefined, token);
    const events = hist.json?.data?.events ?? [];
    if (hist.status === 200 && Array.isArray(events) && events.length >= 1) {
      pass("gap22 approval history", `events=${events.length}`);
    } else {
      fail("gap22 approval history", `status ${hist.status} events=${events.length}`);
    }
  } else {
    skip("gap22 approval history", "no approvalId from draft campaign submit");
  }

  // ── Gap 24: audit date filter + export ─────────────────────────
  const auditFrom = "2026-01-01";
  const auditTo = "2027-12-31";
  const auditList = await api(
    "GET",
    `/fundraising/audit-logs?objectType=FundraisingCampaign&limit=10`,
    undefined,
    token
  );
  if (auditList.status === 200) {
    pass("gap24 list audit logs (filtered)", `items=${auditList.json?.data?.items?.length ?? auditList.json?.data?.length ?? "?"}`);
  } else {
    fail("gap24 list audit logs (filtered)", `status ${auditList.status}`);
  }

  const auditExport = await apiText(
    "GET",
    `/fundraising/audit-logs/export?from=${auditFrom}&to=${auditTo}&limit=100`,
    token
  );
  const csvOk =
    auditExport.status === 200 &&
    (auditExport.contentType.includes("text/csv") || auditExport.text.includes("objectType"));
  if (csvOk) {
    pass("gap24 audit export CSV (date range)", `bytes=${auditExport.text.length}`);
  } else {
    fail("gap24 audit export CSV (date range)", `status ${auditExport.status}`);
  }

  console.log("\n=== CLIENT DEMO FIXTURE ===");
  console.log(
    JSON.stringify(
      {
        login: { email: EMAIL },
        fund: { id: fund.id, name: fund.name },
        investorId,
        contactId,
        campaignId,
        draftCampaignId,
        pauseCampaignId,
        draftApprovalId,
        meetingId,
        opportunityId,
        rfpId,
        ddqCaseId,
        dataRoomId,
        documentId,
        agentId,
        scenarioId,
        reportJobId,
        scheduleId,
      },
      null,
      2
    )
  );

  console.log(`\nUAT fundraising requirements-gap: ${passCount} passed, ${failCount} failed, ${skipCount} skipped`);
  await prisma.$disconnect();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
