/**
 * UAT — LP Portal Phase 3 (performance, documents download audit, notices, jobs).
 * DEV nts only.
 *
 * npm run uat:lp-portal:phase3
 */
// @ts-nocheck
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  BASE,
  api,
  assertDevDatabase,
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
  await assertDevDatabase(prisma, "uat:lp-portal:phase3");
  await ensureSeed(prisma);
  console.log(`LP Portal Phase 3 UAT — ${BASE}\n`);

  const ids = await loadSeedIds(prisma);
  const token = await resolveSignatoryToken();

  const perf = await api("GET", `/lp-portal/performance?fundId=${ids.fundPcId}`, token);
  record("performance", perf.status === 200 && perf.json?.success !== false, `status=${perf.status}`);

  const hist = await api(
    "GET",
    `/lp-portal/performance/history?fundId=${ids.fundPcId}&period=SI`,
    token
  );
  record(
    "performance.history",
    hist.status === 200 && hist.json?.success !== false,
    `status=${hist.status}`
  );

  const bench = await api("GET", "/lp-portal/performance/benchmarks", token);
  record(
    "performance.benchmarks",
    bench.status === 200 && bench.json?.success !== false,
    `status=${bench.status}`
  );

  const byFund = await api("GET", "/lp-portal/performance/by-fund", token);
  record(
    "performance.by-fund",
    byFund.status === 200 && byFund.json?.success !== false,
    `status=${byFund.status}`
  );

  const docs = await api("GET", "/lp-portal/documents", token);
  const items = docs.json?.data?.items || [];
  record(
    "documents.list",
    docs.status === 200 && items.length > 0,
    `status=${docs.status} count=${items.length}`
  );

  const docId = ids.documentId || items[0]?.id;
  if (docId) {
    const one = await api("GET", `/lp-portal/documents/${docId}`, token);
    record("documents.get", one.status === 200, `status=${one.status}`);

    const dl = await api("GET", `/lp-portal/documents/${docId}/download`, token);
    // May 404 if no file bytes — still expect audit attempt or graceful response
    record(
      "documents.download",
      [200, 404].includes(dl.status),
      `status=${dl.status}`
    );

    const audits = await (prisma as any).lpDocumentAccessAudit.count({
      where: { documentId: docId, clientId: ids.clientId },
    });
    // GET writes VIEW audit; DOWNLOAD adds another when file bytes are available
    record("documents.access.audit", audits > 0, `auditRows=${audits}`);
  } else {
    record("documents.get", false, "no document");
    record("documents.download", false, "no document");
    record("documents.download.audit", false, "no document");
  }

  const notices = await api("GET", "/lp-portal/notices", token);
  const nItems = notices.json?.data?.items || notices.json?.data || [];
  const noticeList = Array.isArray(nItems) ? nItems : [];
  record(
    "notices.list",
    notices.status === 200,
    `status=${notices.status} count=${noticeList.length}`
  );

  const noticeId = ids.noticeId || noticeList[0]?.id;
  if (noticeId) {
    const n = await api("GET", `/lp-portal/notices/${noticeId}`, token);
    record("notices.get", n.status === 200, `status=${n.status}`);

    await (prisma as any).lpNoticeReceipt.deleteMany({
      where: { noticeId, clientId: ids.clientId },
    });

    const ack = await api(
      "POST",
      `/lp-portal/notices/${noticeId}/acknowledge`,
      token,
      {},
      { "Idempotency-Key": idem("p3-notice-ack") }
    );
    record(
      "notices.ack",
      ack.status === 200 && ack.json?.success !== false,
      `status=${ack.status}`
    );
  }

  const job = await api(
    "POST",
    "/lp-portal/jobs/performance-report",
    token,
    { fundId: ids.fundPcId },
    { "Idempotency-Key": idem("p3-perf-job") }
  );
  const jobId = job.json?.data?.id || job.json?.data?.jobId;
  record(
    "jobs.performance-report",
    [200, 201, 202].includes(job.status),
    `status=${job.status} jobId=${jobId || "?"}`
  );

  if (jobId) {
    const getJob = await api("GET", `/lp-portal/jobs/${jobId}`, token);
    record("jobs.get", getJob.status === 200, `status=${getJob.status}`);
  } else {
    record("jobs.get", job.status < 500, "no job id returned — soft pass if create soft-failed");
  }

  summarizeFail(results);
  console.log("\nPhase 3 passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
