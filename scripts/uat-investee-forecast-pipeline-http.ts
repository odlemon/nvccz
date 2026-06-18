// @ts-nocheck
/**
 * E2E UAT — Investee reporting → investor ACCEPT → forecasting engine dispatch.
 * Run: npm run uat:investee:forecast-pipeline
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const PORT = process.env.PORT || "3009";
const BASE = process.env.API_BASE_URL || `http://localhost:${PORT}/api`;
const ADMIN_EMAIL = process.env.UAT_EMAIL || process.env.E2E_ADMIN_EMAIL || "admin@nts.com";
const ADMIN_PASSWORD = process.env.UAT_PASSWORD || process.env.E2E_ADMIN_PASSWORD || "admin123";
const INVESTEE_EMAIL = process.env.UAT_INVESTEE_EMAIL || "karatakundai@gmail.com";
const INVESTEE_PASSWORD = process.env.UAT_INVESTEE_PASSWORD || "password123";

const ts = Date.now();
const REPORTING_PERIOD = process.env.UAT_REPORTING_PERIOD || "2026-10-31";
const TOTAL_REVENUE = Number(process.env.UAT_TOTAL_REVENUE || 250000);
const NET_PROFIT = Number(process.env.UAT_NET_PROFIT || 42000);

let adminToken = "";
let investeeToken = "";
let passed = 0;
let failed = 0;
const failures: string[] = [];
const cap: Record<string, string> = {};

function log(name: string, ok: boolean, detail = "") {
  const tag = ok ? "PASS" : "FAIL";
  console.log(`[${tag}] ${name}${detail ? `: ${detail}` : ""}`);
  if (ok) passed++;
  else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  return json.token || json.data?.token || "";
}

async function api(token: string, method: string, url: string, body?: unknown) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function periodBounds(iso: string) {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  return {
    periodKey: `${y}-${String(m + 1).padStart(2, "0")}`,
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

async function ensureReportingCalendarOpen() {
  const existing = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM reporting_notification_logs
      WHERE event_type = 'REQUEST' AND reporting_period = ?`,
    REPORTING_PERIOD
  );
  if (Number(existing[0]?.c || 0) > 0) {
    log("open reporting calendar", true, `period ${REPORTING_PERIOD} already open`);
    return;
  }

  const opts = await api(adminToken, "GET", "/portfolio-companies/reporting/mandatory-attachment-options");
  const rawOpts = opts.json?.data;
  const optionList = Array.isArray(rawOpts)
    ? rawOpts
    : Array.isArray(rawOpts?.options)
      ? rawOpts.options
      : Array.isArray(opts.json?.options)
        ? opts.json.options
        : [];
  const optionIds = optionList.map((o: any) => o.id).filter(Boolean);

  const body: Record<string, unknown> = {
    reportingPeriod: REPORTING_PERIOD,
    dueDate: "2026-10-15",
    phase: "REQUEST",
  };
  if (optionIds.length) body.attachmentOptionIds = optionIds.slice(0, 2);
  else {
    body.mandatoryAttachments = [{ name: "Operational KPIs", formats: ["xlsx", "pdf"] }];
  }

  const open = await api(adminToken, "POST", "/portfolio-companies/reporting/requests", body);
  const ok = open.status === 200 || open.status === 409;
  log(
    "open reporting calendar",
    ok,
    open.status === 409 ? `already open — ${open.json?.message}` : open.json?.message || `HTTP ${open.status}`
  );
}

async function ensureActiveScenario(fundId: string | null, entityId: string) {
  const existing = await prisma.forecastScenario.findFirst({
    where: {
      status: "ACTIVE",
      entityId,
      name: { startsWith: "UAT Investee Pipeline" },
      ...(fundId ? { fundId } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) {
    cap.scenarioId = existing.id;
    log("ACTIVE forecast scenario", true, `reuse ${existing.name} (${existing.id})`);
    return;
  }

  const bounds = periodBounds(REPORTING_PERIOD);
  const horizonStart = `${bounds.periodKey.split("-")[0]}-01-01`;
  const horizonEnd = `${bounds.periodKey.split("-")[0]}-12-31`;

  const create = await api(adminToken, "POST", "/forecasting/scenarios", {
    name: `UAT Investee Pipeline ${ts}`,
    entity_id: entityId,
    fund_id: fundId || undefined,
    base_currency: "USD",
    horizon_start_date: horizonStart,
    horizon_end_date: horizonEnd,
    granularity: "MONTHLY",
    dimensions: [{ type: "ACCOUNT", value_id: "COA_RANGE_REVENUE" }],
  });

  const scenarioId = create.json?.data?.id;
  log("create forecast scenario", create.status === 201 && Boolean(scenarioId), create.json?.message || `HTTP ${create.status}`);
  if (!scenarioId) return;

  const promote = await api(adminToken, "PATCH", `/forecasting/scenarios/${scenarioId}`, { status: "ACTIVE" });
  log("promote scenario to ACTIVE", promote.status === 200, promote.json?.message || `HTTP ${promote.status}`);
  cap.scenarioId = scenarioId;
}

async function main() {
  console.log("\n=== Investee → Forecasting Pipeline UAT ===");
  console.log(`BASE: ${BASE}`);
  console.log(`Investee: ${INVESTEE_EMAIL}`);
  console.log(`Reporting period: ${REPORTING_PERIOD}\n`);

  const pc = await prisma.portfolioCompany.findFirst({
    where: { user: { email: INVESTEE_EMAIL } },
    include: { user: true, fund: true },
  });
  if (!pc) {
    console.error(`No portfolio company for ${INVESTEE_EMAIL}`);
    process.exit(1);
  }
  cap.portfolioCompanyId = pc.id;
  cap.fundId = pc.fundId || "";
  log("resolve portfolio company", true, `${pc.name} fund=${pc.fund?.name || pc.fundId || "—"}`);

  const defaultEntity = await prisma.forecastEntity.findFirst({ where: { isDefault: true } });
  if (!defaultEntity) {
    log("default forecast entity", false, "missing — run db:migrate:forecasting-multi-entity");
    process.exit(1);
  }
  cap.entityId = defaultEntity.id;

  adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  log("admin login", Boolean(adminToken), adminToken ? ADMIN_EMAIL : "failed");
  if (!adminToken) process.exit(1);

  await ensureReportingCalendarOpen();
  await ensureActiveScenario(pc.fundId, defaultEntity.id);

  investeeToken = await login(INVESTEE_EMAIL, INVESTEE_PASSWORD);
  log("investee login", Boolean(investeeToken), investeeToken ? INVESTEE_EMAIL : "failed — run npm run reset:investee-password");
  if (!investeeToken) process.exit(1);

  const { periodStart, periodEnd } = periodBounds(REPORTING_PERIOD);
  const draft = await api(investeeToken, "POST", "/applicant/financial-reports/operational-kpis/draft", {
    reportingPeriod: REPORTING_PERIOD,
    periodType: "MONTHLY",
    periodStart,
    periodEnd,
    title: `UAT Operational KPIs ${ts}`,
    description: "Investee forecast pipeline UAT",
    data: {
      operational: {
        monthlyRecurringRevenue: TOTAL_REVENUE / 12,
        customerCountAtPeriodEnd: 120,
        churnRate: 0.02,
      },
    },
  });
  const reportId = draft.json?.data?.id;
  cap.reportId = reportId;
  log("investee create OPERATIONAL_KPIS draft", draft.status === 201 && Boolean(reportId), draft.json?.message || `HTTP ${draft.status}`);
  if (!reportId) process.exit(1);

  const submit = await api(investeeToken, "POST", "/applicant/financial-reports/submit", { reportIds: [reportId] });
  log("investee submit report", submit.status === 200, submit.json?.message || `HTTP ${submit.status}`);

  const pending = await prisma.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT status FROM financial_reports WHERE id = ?`,
    reportId
  );
  log("report status PENDING", pending[0]?.status === "PENDING", `status=${pending[0]?.status}`);

  const review = await api(
    adminToken,
    "POST",
    `/portfolio-companies/${pc.id}/financial-reports/${reportId}/review`,
    {
      action: "ACCEPT",
      comment: "UAT accept — forecast pipeline test",
      totalRevenue: TOTAL_REVENUE,
      netProfit: NET_PROFIT,
      cashFlowNet: NET_PROFIT * 0.8,
    }
  );
  log("investor ACCEPT report", review.status === 200, review.json?.message || `HTTP ${review.status}`);

  const accepted = await prisma.$queryRawUnsafe<
    Array<{ status: string; totalRevenue: unknown; netProfit: unknown }>
  >(`SELECT status, totalRevenue, netProfit FROM financial_reports WHERE id = ?`, reportId);
  const row = accepted[0];
  log(
    "report status ACCEPTED + KPIs",
    row?.status === "ACCEPTED" && Number(row?.totalRevenue) === TOTAL_REVENUE,
    `status=${row?.status} revenue=${row?.totalRevenue} profit=${row?.netProfit}`
  );

  const scenarioId = cap.scenarioId;
  if (!scenarioId) {
    log("forecast dispatch verification", false, "no scenario id");
    process.exit(1);
  }

  const audits = await prisma.forecastAuditLog.findMany({
    where: { actionType: "PORTFOLIO_DISPATCH" },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const audit = audits.find((a) => (a.deltaPayload as any)?.report_id === reportId);
  if (audit) cap.scenarioId = audit.scenarioId;
  const auditPayload = audit?.deltaPayload as any;
  const auditOk = Boolean(audit) && auditPayload?.report_id === reportId;
  log(
    "forecast audit PORTFOLIO_DISPATCH",
    auditOk,
    audit ? `report_id=${auditPayload?.report_id}` : "no audit row"
  );

  const periodKey = periodBounds(REPORTING_PERIOD).periodKey;
  const cells = await prisma.forecastCell.findMany({
    where: {
      portfolioCompanyId: pc.id,
      analyticalTag: "PORTFOLIO_DISPATCH",
      periodKey,
    },
  });
  if (cells[0]?.scenarioId) cap.scenarioId = cells[0].scenarioId;
  log(
    "forecast cells PORTFOLIO_DISPATCH",
    cells.length >= 1,
    `count=${cells.length} period=${periodKey} tags=${cells.map((c) => c.accountId.slice(0, 8)).join(",")}`
  );

  if (cells.length) {
    const revCell = cells.find((c) => Number(c.txCurrencyValue) > 0);
    log(
      "forecast cell revenue value",
      Boolean(revCell) && Number(revCell?.txCurrencyValue) > 0,
      revCell ? `tx=${revCell.txCurrencyValue}` : "missing"
    );
  }

  const computeScenarioId = cap.scenarioId || scenarioId;
  const computeJob = await prisma.forecastComputeJob.findFirst({
    where: { scenarioId: computeScenarioId, triggerType: "SCENARIO_RECALC" },
    orderBy: { createdAt: "desc" },
  });
  log("forecast compute job after dispatch", Boolean(computeJob), computeJob ? `status=${computeJob.status}` : "none");

  const gridScenarioId = cap.scenarioId || scenarioId;
  const grid = await api(adminToken, "GET", `/forecasting/scenarios/${gridScenarioId}/grid?portfolio_company_id=${pc.id}`);
  log("investor grid includes portfolio slice", grid.status === 200, `HTTP ${grid.status}`);

  console.log(`\n=== SUMMARY: ${passed}/${passed + failed} passed ===`);
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("\nCaptured:", cap);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
