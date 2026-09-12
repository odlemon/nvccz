/**
 * UAT — Investments V2 Phase 3 (valuation, reconciliation, accounting, documents).
 * DEV nts only.
 *
 * npm run uat:investments-v2:phase3
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";
import {
  BASE,
  api,
  ensurePrimaryFund,
  idem,
  log,
  login,
  summarizeFail,
} from "./lib/investments-v2-uat-helpers";

const prisma = new PrismaClient();
const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  log(step, ok, detail);
}

async function main() {
  await assertDevDatabase(prisma, "uat:investments-v2:phase3");
  console.log(`Investments V2 Phase 3 UAT — ${BASE}\n`);

  const token = await login();
  const fund = await ensurePrimaryFund(prisma);
  console.log(`fundId=${fund.id}\n`);

  const valList = await api("GET", `/investment-ops/valuation/runs?fundId=${fund.id}`, token);
  record("valuation.list", valList.status < 400, `status=${valList.status}`);

  const valRun = await api(
    "POST",
    "/investment-ops/valuation/runs",
    token,
    {
      fundId: fund.id,
      asOf: new Date().toISOString().slice(0, 10),
      processNow: true,
    },
    { "Idempotency-Key": idem("p3-val-run") }
  );
  const runId = valRun.json?.data?.id || valRun.json?.data?.valuationRunId || valRun.json?.data?.resourceId;
  const jobId =
    valRun.json?.data?.jobId ||
    valRun.json?.data?.job?.id ||
    valRun.json?.meta?.jobId;
  record(
    "valuation.run",
    [200, 201, 202, 409].includes(valRun.status) && Boolean(runId),
    `status=${valRun.status} runId=${runId || "n/a"} jobId=${jobId || "n/a"}`
  );
  if (runId) console.log(`valuationRunId=${runId}`);
  if (jobId) {
    const job = await api("GET", `/investment-ops/jobs/${jobId}`, token);
    record("jobs.poll", job.status < 400, `status=${job.status} jobStatus=${job.json?.data?.status}`);
  }

  const exceptions = await api(
    "GET",
    `/investment-ops/valuation/exceptions?fundId=${fund.id}`,
    token
  );
  record("valuation.exceptions", exceptions.status < 400, `status=${exceptions.status}`);

  const reconBatches = await api(
    "GET",
    `/investment-ops/reconciliation/batches?fundId=${fund.id}`,
    token
  );
  record("recon.batches", reconBatches.status < 400, `status=${reconBatches.status}`);

  const reconSummary = await api(
    "GET",
    `/investment-ops/reconciliation/summary?fundId=${fund.id}`,
    token
  );
  record("recon.summary", reconSummary.status < 400, `status=${reconSummary.status}`);

  const events = await api(
    "GET",
    `/investment-ops/accounting/events?fundId=${fund.id}&page=1&pageSize=20`,
    token
  );
  record("accounting.events", events.status < 400, `status=${events.status}`);

  const journals = await api(
    "GET",
    `/investment-ops/accounting/journals?fundId=${fund.id}`,
    token
  );
  record("accounting.journals", journals.status < 400, `status=${journals.status}`);

  const forbidden = await api(
    "POST",
    "/investment-ops/documents",
    token,
    {
      fundId: fund.id,
      documentType: "OTHER",
      title: "Should Reject Path",
      fileRef: "/etc/passwd",
    },
    { "Idempotency-Key": idem("p3-bad-fileref") }
  );
  record(
    "documents.rejectFileRef",
    forbidden.status >= 400 &&
      (forbidden.json?.code === "FILE_REF_FORBIDDEN" ||
        String(forbidden.json?.message || "").toLowerCase().includes("file")),
    `status=${forbidden.status} code=${forbidden.json?.code || "n/a"}`
  );

  const session = await api(
    "POST",
    "/investment-ops/files/upload-sessions",
    token,
    {
      fundId: fund.id,
      fileName: "custodian-pack.pdf",
      mimeType: "application/pdf",
      byteSize: 1024,
    },
    { "Idempotency-Key": idem("p3-upload-session") }
  );
  record(
    "files.uploadSession",
    [200, 201].includes(session.status) || session.status === 400,
    `status=${session.status} sessionId=${session.json?.data?.id || session.json?.code || "n/a"}`
  );

  const docs = await api("GET", `/investment-ops/documents?fundId=${fund.id}`, token);
  record("documents.list", docs.status < 400, `status=${docs.status}`);

  summarizeFail(results);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
