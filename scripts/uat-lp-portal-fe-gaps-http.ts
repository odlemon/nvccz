/**
 * UAT — LP Portal FE gaps (27-item backend closure smoke).
 * DEV nts only.
 *
 * npm run uat:lp-portal:fe-gaps
 */
// @ts-nocheck
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  BASE,
  api,
  assertDevDatabase,
  ensureSeed,
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
  console.log(`LP Portal FE gaps UAT — ${BASE}\n`);
  await ensureSeed(prisma);
  await assertDevDatabase(prisma, "uat:lp-portal:fe-gaps");

  const ids = await loadSeedIds(prisma);
  const token = await resolveSignatoryToken();

  // 1 — Notices category + fundName
  const notices = await api("GET", "/lp-portal/notices?pageSize=5", token);
  const n0 = notices.json?.data?.items?.[0];
  record(
    "notices.category-fundName",
    notices.status === 200 && n0 && (n0.category || n0.kind) && "fundName" in n0,
    `category=${n0?.category || n0?.kind} fundName=${n0?.fundName}`
  );

  // 2–3 — Request attachments upload + list fields
  const attBody = new FormData();
  attBody.append("file", new Blob(["uat attachment"], { type: "text/plain" }), "uat.txt");
  const attRes = await fetch(`${BASE}/lp-portal/requests/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: attBody,
  });
  const attJson = await attRes.json().catch(() => ({}));
  const attId = attJson?.data?.id;
  record("requests.upload-attachment", attRes.status === 201 && !!attId, `id=${attId}`);

  const createReq = await api("POST", "/lp-portal/requests", token, {
    type: "CAPITAL_ACTIVITY",
    fundId: ids.fundPcId,
    subject: "UAT FE gap request",
    description: "Attachment test",
    priority: "HIGH",
    attachmentIds: attId ? [attId] : [],
  }, { "Idempotency-Key": `uat-fe-req-${Date.now()}` });
  record(
    "requests.create-with-priority",
    createReq.status === 201 && createReq.json?.data?.priority === "HIGH",
    `status=${createReq.status} priority=${createReq.json?.data?.priority}`
  );

  const reqList = await api("GET", "/lp-portal/requests?pageSize=5", token);
  const r0 = reqList.json?.data?.items?.[0];
  record(
    "requests.list-fields",
    reqList.status === 200 && r0 && "priority" in r0 && Array.isArray(r0.attachments),
    `priority=${r0?.priority} attachments=${r0?.attachments?.length ?? 0}`
  );

  // 4 — Thread participants (best-effort if threads exist)
  const threads = await api("GET", "/lp-portal/messages?pageSize=1", token);
  const tid = threads.json?.data?.items?.[0]?.id;
  if (tid) {
    const thread = await api("GET", `/lp-portal/messages/${tid}`, token);
    record(
      "messages.participants",
      thread.status === 200 && Array.isArray(thread.json?.data?.participants),
      `participants=${thread.json?.data?.participants?.length ?? 0}`
    );
  } else {
    record("messages.participants", true, "skipped — no threads");
  }

  // 5–6 — Settings in-app + display prefs
  const settings = await api("GET", "/lp-portal/settings", token);
  const notif = settings.json?.data?.notifications;
  record(
    "settings.in-app-prefs",
    settings.status === 200 && notif && "inAppCapitalCalls" in notif && "emailDigest" in notif,
    `inApp=${notif?.inAppCapitalCalls} digest=${notif?.emailDigest}`
  );

  const patchDisp = await api("PATCH", "/lp-portal/settings/display", token, {
    presentationCurrency: "USD",
    defaultAsOfPreference: "LATEST",
  });
  record("settings.display", patchDisp.status === 200, `status=${patchDisp.status}`);

  // 7 — MFA manage URLs
  const mfa = settings.json?.data?.mfa;
  record("settings.mfa-urls", !!mfa?.manageUrls?.enroll, `enroll=${mfa?.manageUrls?.enroll}`);

  // 8 — Colleague MFA + lastActive (manager-only; signatory may 403)
  const org = await api("GET", "/lp-portal/organisation", token);
  const col = org.json?.data?.colleagues?.[0];
  record(
    "organisation.colleague-fields",
    org.status === 200 && (!col || ("mfaEnabled" in col && "lastActiveAt" in col)),
    col ? `mfa=${col.mfaEnabled}` : "no colleagues (ok for signatory)"
  );

  // 9 — Bank instruction changes
  const bankList = await api("GET", "/lp-portal/bank-instructions/changes", token);
  record("bank-instructions.list", bankList.status === 200, `status=${bankList.status}`);

  // 11 — Notification feed
  const feed = await api("GET", "/lp-portal/notifications?limit=5", token);
  record(
    "notifications.feed",
    feed.status === 200 && Array.isArray(feed.json?.data?.items),
    `count=${feed.json?.data?.items?.length ?? 0}`
  );

  // 12–13 — Dashboard history + action fields
  const dash = await api("GET", `/lp-portal/dashboard?fundId=${ids.fundOeId || ids.fundPcId}`, token);
  record(
    "dashboard.openEndedHistory",
    dash.status === 200 && dash.json?.data?.openEndedHistory?.points != null,
    `points=${dash.json?.data?.openEndedHistory?.points?.length ?? 0}`
  );
  const actions = await api("GET", "/lp-portal/dashboard/actions", token);
  const a0 = actions.json?.data?.items?.[0];
  record(
    "dashboard.action-fields",
    actions.status === 200 && (!a0 || ("fundName" in a0 && "label" in a0)),
    `label=${a0?.label} amount=${a0?.amount}`
  );

  // 14 — Capital summary KPIs
  const summary = await api("GET", `/lp-portal/capital-calls/summary?fundId=${ids.fundPcId}`, token);
  record(
    "capital.summary-extended",
    summary.status === 200 &&
      "paidCallCount" in (summary.json?.data || {}) &&
      "upcomingDistributionNotices" in (summary.json?.data || {}),
    `paidCallCount=${summary.json?.data?.paidCallCount}`
  );

  // 15–16 — Performance benchmark + structure
  const perf = await api("GET", `/lp-portal/performance?fundId=${ids.fundPcId}`, token);
  record(
    "performance.openEndedMetrics",
    perf.status === 200,
    `openEndedMetrics=${perf.json?.data?.openEndedMetrics != null}`
  );
  const bench = await api(
    "GET",
    `/lp-portal/performance/benchmarks?metric=NET_IRR&benchmarkId=SP500`,
    token
  );
  record(
    "performance.benchmarkId",
    bench.status === 200 && bench.json?.data?.benchmarkId === "SP500",
    `benchmarkId=${bench.json?.data?.benchmarkId}`
  );
  const byFund = await api("GET", "/lp-portal/performance/by-fund", token);
  const f0 = byFund.json?.data?.funds?.[0];
  record(
    "performance.byFund-structure",
    byFund.status === 200 && f0 && ("operatingModel" in f0 || "structure" in f0),
    `structure=${f0?.structure}`
  );

  // 17–19 — Dealing list + export
  const dealing = await api("GET", "/lp-portal/dealing/requests?pageSize=5", token);
  const d0 = dealing.json?.data?.items?.[0];
  record(
    "dealing.list-fundName-shareClass",
    dealing.status === 200 && (!d0 || ("fundName" in d0 && "shareClass" in d0)),
    `fundName=${d0?.fundName} shareClass=${d0?.shareClass}`
  );
  const dealingExport = await fetch(`${BASE}/lp-portal/dealing/requests/export?format=csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const exportText = await dealingExport.text();
  record(
    "dealing.export",
    dealingExport.status === 200 && exportText.includes("fundName"),
    `status=${dealingExport.status} bytes=${exportText.length}`
  );

  // 20–22 — Account activity structure + from/to
  const activity = await api(
    "GET",
    `/lp-portal/account-activity?from=2020-01-01&to=2030-12-31&pageSize=5`,
    token
  );
  const e0 = activity.json?.data?.items?.[0];
  record(
    "account-activity.structure",
    activity.status === 200 && (!e0 || "operatingModel" in e0 || "structure" in e0),
    `structure=${e0?.structure || e0?.operatingModel}`
  );

  // 23–25 — Document summary + metadata
  const docSummary = await api("GET", "/lp-portal/documents/summary", token);
  record(
    "documents.summary",
    docSummary.status === 200 && Array.isArray(docSummary.json?.data?.byCategory),
    `total=${docSummary.json?.data?.total}`
  );
  const docs = await api("GET", "/lp-portal/documents?pageSize=1", token);
  const doc0 = docs.json?.data?.items?.[0];
  record(
    "documents.metadata",
    docs.status === 200 && doc0 && "mimeType" in doc0 && "fileSizeBytes" in doc0,
    `mime=${doc0?.mimeType}`
  );

  // 27 — Estimate snapshot TTL (create estimate then submit)
  if (ids.fundOeId) {
    const est = await api("POST", "/lp-portal/dealing/subscriptions/estimate", token, {
      fundId: ids.fundOeId,
      amount: "10000",
    });
    const snap = est.json?.data?.estimateSnapshotId;
    const submit = await api(
      "POST",
      "/lp-portal/dealing/subscriptions",
      token,
      {
        fundId: ids.fundOeId,
        amount: "10000",
        estimateSnapshotId: snap,
      },
      { "Idempotency-Key": `uat-fe-sub-${Date.now()}` }
    );
    record(
      "dealing.estimate-snapshot-submit",
      est.status === 200 && !!snap && submit.status === 201,
      `snap=${snap} submit=${submit.status}`
    );

    const stale = await api(
      "POST",
      "/lp-portal/dealing/subscriptions",
      token,
      {
        fundId: ids.fundOeId,
        amount: "99999",
        estimateSnapshotId: snap,
      },
      { "Idempotency-Key": `uat-fe-sub-stale-${Date.now()}` }
    );
    record(
      "dealing.estimate-reuse-mismatch",
      stale.status === 409 || stale.status === 422,
      `status=${stale.status}`
    );
  } else {
    record("dealing.estimate-snapshot-submit", false, "missing open-ended fund");
    record("dealing.estimate-reuse-mismatch", false, "missing open-ended fund");
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- ${passed}/${results.length} PASS ---`);
  if (failed.length) summarizeFail(failed);
  process.exit(failed.length ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
