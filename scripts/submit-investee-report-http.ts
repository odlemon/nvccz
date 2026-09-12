// @ts-nocheck
/**
 * Investee-only: open period (if needed), create + submit Operational KPIs for Test Company.
 * Run: npm run submit:investee:report
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const PORT = process.env.PORT || "3009";
const BASE = process.env.API_BASE_URL || `http://localhost:${PORT}/api`;
const ADMIN_EMAIL = process.env.UAT_EMAIL || "admin@nts.com";
const ADMIN_PASSWORD = process.env.UAT_PASSWORD || "admin123";
const INVESTEE_EMAIL = process.env.UAT_INVESTEE_EMAIL || "karatakundai@gmail.com";
const INVESTEE_PASSWORD = process.env.UAT_INVESTEE_PASSWORD || "password123";
const REPORTING_PERIOD = process.env.UAT_REPORTING_PERIOD || "2026-12-31";

const ts = Date.now();

async function login(email: string, password: string) {
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
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

async function main() {
  console.log("\n=== Submit investee report (Test Company) ===\n");
  console.log(`Period: ${REPORTING_PERIOD}`);

  const pc = await prisma.portfolioCompany.findFirst({
    where: { user: { email: INVESTEE_EMAIL } },
    include: { fund: true },
  });
  if (!pc) throw new Error(`No portfolio company for ${INVESTEE_EMAIL}`);
  console.log(`Company: ${pc.name} (${pc.fund?.name || "no fund"})`);

  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  if (!adminToken) throw new Error("Admin login failed — is the API running?");

  const openCount = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM reporting_notification_logs WHERE event_type = 'REQUEST' AND reporting_period = ?`,
    REPORTING_PERIOD
  );
  if (Number(openCount[0]?.c || 0) === 0) {
    const opts = await api(adminToken, "GET", "/portfolio-companies/reporting/mandatory-attachment-options");
    const optionList = opts.json?.data?.options ?? opts.json?.data ?? [];
    const optionIds = (Array.isArray(optionList) ? optionList : []).map((o: any) => o.id).filter(Boolean);
    const body: Record<string, unknown> = {
      reportingPeriod: REPORTING_PERIOD,
      dueDate: "2027-01-15",
      phase: "REQUEST",
    };
    if (optionIds.length) body.attachmentOptionIds = optionIds.slice(0, 2);
    else body.mandatoryAttachments = [{ name: "Operational KPIs", formats: ["xlsx", "pdf"] }];
    const open = await api(adminToken, "POST", "/portfolio-companies/reporting/requests", body);
    if (open.status !== 200 && open.status !== 409) {
      throw new Error(`Open calendar failed: HTTP ${open.status} ${open.json?.message || ""}`);
    }
    console.log(`Calendar: ${open.status === 409 ? "already open" : "opened"} for ${REPORTING_PERIOD}`);
  } else {
    console.log(`Calendar: already open for ${REPORTING_PERIOD}`);
  }

  const investeeToken = await login(INVESTEE_EMAIL, INVESTEE_PASSWORD);
  if (!investeeToken) throw new Error("Investee login failed — run npm run reset:investee-password");

  const { periodStart, periodEnd } = periodBounds(REPORTING_PERIOD);
  const draft = await api(investeeToken, "POST", "/applicant/financial-reports/operational-kpis/draft", {
    reportingPeriod: REPORTING_PERIOD,
    periodType: "MONTHLY",
    periodStart,
    periodEnd,
    title: `December 2026 Operational KPIs`,
    description: "Client demo submission",
    data: {
      operational: {
        monthlyRecurringRevenue: 20833.33,
        customerCountAtPeriodEnd: 120,
        churnRate: 0.02,
      },
    },
  });
  const reportId = draft.json?.data?.id;
  if (draft.status !== 201 || !reportId) {
    throw new Error(`Create draft failed: HTTP ${draft.status} ${JSON.stringify(draft.json)}`);
  }
  console.log(`Draft created: ${reportId}`);

  const submit = await api(investeeToken, "POST", "/applicant/financial-reports/submit", {
    reportIds: [reportId],
  });
  if (submit.status !== 200) {
    throw new Error(`Submit failed: HTTP ${submit.status} ${JSON.stringify(submit.json)}`);
  }

  const row = await prisma.$queryRawUnsafe<Array<{ status: string; title: string }>>(
    `SELECT status, title FROM financial_reports WHERE id = ?`,
    reportId
  );
  console.log("\nDone — ready for investor ACCEPT:");
  console.log(`  Company:     ${pc.name}`);
  console.log(`  Report ID:   ${reportId}`);
  console.log(`  Period:      ${REPORTING_PERIOD}`);
  console.log(`  Title:       ${row[0]?.title}`);
  console.log(`  Status:      ${row[0]?.status}`);
  console.log(`\nAccept with: totalRevenue 250000, netProfit 42000`);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
