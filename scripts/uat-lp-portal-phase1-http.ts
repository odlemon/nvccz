/**
 * UAT — LP Portal Phase 1 (session, dashboard, capital calls, distributions, activity).
 * DEV nts only. Seeds via npm run db:seed:lp-portal-srd when needed.
 *
 * npm run uat:lp-portal:phase1
 */
// @ts-nocheck
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  BASE,
  api,
  ensureSeed,
  idem,
  loadSeedIds,
  log,
  resolveSignatoryToken,
  summarizeFail,
} from "./lib/lp-portal-uat-helpers";

const prisma = new PrismaClient();
const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  log(step, ok, detail);
}

async function main() {
  console.log(`LP Portal Phase 1 UAT — ${BASE}\n`);
  await ensureSeed(prisma);

  const ids = await loadSeedIds(prisma);
  console.log(`clientId=${ids.clientId}`);
  console.log(`fundPcId=${ids.fundPcId}`);
  console.log(`ccAllocId=${ids.capitalCallAllocationId}\n`);

  const token = await resolveSignatoryToken();
  record("login.signatory", Boolean(token), "token ok");

  const session = await api("GET", "/lp-portal/session", token);
  record(
    "session",
    session.status === 200 && session.json?.success !== false,
    `status=${session.status} funds=${session.json?.data?.funds?.length ?? 0}`
  );

  const dash = await api("GET", "/lp-portal/dashboard", token);
  record("dashboard", dash.status === 200 && dash.json?.success !== false, `status=${dash.status}`);

  const actions = await api("GET", "/lp-portal/dashboard/actions", token);
  record(
    "dashboard.actions",
    actions.status === 200 && actions.json?.success !== false,
    `status=${actions.status}`
  );

  const recent = await api("GET", "/lp-portal/dashboard/activity/recent?limit=5", token);
  record(
    "dashboard.recent",
    recent.status === 200 && recent.json?.success !== false,
    `status=${recent.status}`
  );

  const ccSummary = await api("GET", "/lp-portal/capital-calls/summary", token);
  record(
    "capital-calls.summary",
    ccSummary.status === 200 && ccSummary.json?.success !== false,
    `status=${ccSummary.status}`
  );

  const calls = await api("GET", "/lp-portal/capital-calls", token);
  const callItems = calls.json?.data?.items || [];
  record(
    "capital-calls.list",
    calls.status === 200 && callItems.length > 0,
    `status=${calls.status} count=${callItems.length}`
  );

  const callId = ids.capitalCallAllocationId || callItems[0]?.id;
  if (callId) {
    const one = await api("GET", `/lp-portal/capital-calls/${callId}`, token);
    record("capital-calls.get", one.status === 200, `status=${one.status}`);

    // Reset ack state so re-runs succeed
    await (prisma as any).lpCapitalCallPortalState.deleteMany({
      where: { capitalCallAllocationId: callId },
    });

    const ack = await api(
      "POST",
      `/lp-portal/capital-calls/${callId}/acknowledge`,
      token,
      {},
      { "Idempotency-Key": idem("p1-cc-ack") }
    );
    record(
      "capital-calls.ack",
      ack.status === 200 && ack.json?.success !== false,
      `status=${ack.status} code=${ack.json?.error?.code || "ok"}`
    );

    const docs = await api("GET", `/lp-portal/capital-calls/${callId}/documents`, token);
    record("capital-calls.documents", docs.status < 500, `status=${docs.status}`);
  } else {
    record("capital-calls.get", false, "no allocation id");
    record("capital-calls.ack", false, "no allocation id");
  }

  const dists = await api("GET", "/lp-portal/distributions", token);
  const distItems = dists.json?.data?.items || [];
  record(
    "distributions.list",
    dists.status === 200 && distItems.length > 0,
    `status=${dists.status} count=${distItems.length}`
  );

  const distId = ids.distributionAllocationId || distItems[0]?.id;
  if (distId) {
    const d = await api("GET", `/lp-portal/distributions/${distId}`, token);
    record("distributions.get", d.status === 200, `status=${d.status}`);
  }

  const activity = await api("GET", "/lp-portal/account-activity", token);
  record(
    "account-activity",
    activity.status === 200 && activity.json?.success !== false,
    `status=${activity.status}`
  );

  const ledger = await api("GET", "/lp-portal/ledger", token);
  record("ledger", ledger.status === 200 && ledger.json?.success !== false, `status=${ledger.status}`);

  summarizeFail(results);
  console.log("\nPhase 1 passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
