/**
 * UAT — Investments V2 Phase 4 (reports, jobs, outbox, audit, capabilities).
 * DEV nts only.
 *
 * npm run uat:investments-v2:phase4
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
  await assertDevDatabase(prisma, "uat:investments-v2:phase4");
  console.log(`Investments V2 Phase 4 UAT — ${BASE}\n`);

  const token = await login();
  const fund = await ensurePrimaryFund(prisma);
  console.log(`fundId=${fund.id}\n`);

  const caps = await api("GET", `/investment-ops/capabilities?fundId=${fund.id}`, token);
  record(
    "capabilities",
    caps.status < 400 && Array.isArray(caps.json?.data?.permittedActions),
    `status=${caps.status} actions=${(caps.json?.data?.permittedActions || []).join(",")}`
  );

  const templates = await api("GET", "/investment-ops/reports/templates", token);
  record(
    "reports.templates",
    templates.status < 400 &&
      (Array.isArray(templates.json?.data) || Array.isArray(templates.json?.data?.items)),
    `status=${templates.status}`
  );

  const generate = await api(
    "POST",
    "/investment-ops/reports/generate",
    token,
    {
      fundId: fund.id,
      reportType: "HOLDINGS_REPORT",
      format: "PDF",
      parameters: { periodStart: "2026-01-01", periodEnd: "2026-06-30" },
    },
    { "Idempotency-Key": idem("p4-report") }
  );
  const reportId = generate.json?.data?.id;
  const jobId = generate.json?.data?.jobId;
  record(
    "reports.generate",
    [200, 201, 400, 409].includes(generate.status),
    `status=${generate.status} reportId=${reportId || "n/a"} jobId=${jobId || "n/a"} code=${generate.json?.code || "ok"}`
  );
  if (reportId) console.log(`reportRunId=${reportId}`);
  if (jobId) {
    console.log(`jobId=${jobId}`);
    const job = await api("GET", `/investment-ops/jobs/${jobId}`, token);
    record(
      "jobs.get",
      job.status < 400,
      `status=${job.status} jobStatus=${job.json?.data?.status}`
    );
  }

  const reports = await api(
    "GET",
    `/investment-ops/reports?fundId=${fund.id}&page=1&pageSize=20`,
    token
  );
  record("reports.list", reports.status < 400, `status=${reports.status}`);

  const outbox = await api("GET", "/investment-ops/outbox-events?page=1&pageSize=20", token);
  record("outbox.list", outbox.status < 400, `status=${outbox.status}`);

  const audit = await api("GET", "/investment-ops/audit-events?page=1&pageSize=20", token);
  record("audit.list", audit.status < 400, `status=${audit.status}`);

  summarizeFail(results);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
