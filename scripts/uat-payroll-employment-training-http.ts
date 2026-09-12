/**
 * UAT — Payroll, Employment & Training (HTTP).
 * Run: npm run uat:payroll:employment-training
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";
const CHECKER_EMAIL = process.env.UAT_CHECKER_EMAIL ?? EMAIL;

type StepResult = { step: string; ok: boolean; detail: string };

const results: StepResult[] = [];
let token = "";
let checkerToken = "";

function log(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json()) as { token?: string; data?: { token?: string } };
  return json.token || json.data?.token || "";
}

async function api(method: string, path: string, body?: unknown, auth = token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  token = await login(EMAIL, PASSWORD);
  log("login", Boolean(token), token ? "maker token ok" : "login failed");
  if (!token) process.exit(1);

  if (CHECKER_EMAIL !== EMAIL) {
    checkerToken = await login(CHECKER_EMAIL, PASSWORD);
  } else {
    checkerToken = token;
  }

  const brackets = await api("GET", "/payroll/statutory/brackets?currencyCode=USD");
  log(
    "statutory brackets",
    brackets.status === 200 && Array.isArray(brackets.json?.data),
    `status ${brackets.status}`
  );

  const levies = await api("GET", "/payroll/statutory/levies");
  log("statutory levies", levies.status === 200, `status ${levies.status}`);

  const courses = await api("GET", "/payroll/compliance/courses");
  log("compliance courses", courses.status === 200, `count ${courses.json?.data?.length ?? 0}`);

  const expiring = await api("GET", "/payroll/compliance/dashboard/expiring");
  log("expiring dashboard", expiring.status === 200, `status ${expiring.status}`);

  const employees = await api("GET", "/payroll/employees?limit=5");
  const emp = employees.json?.data?.employees?.[0] || employees.json?.data?.[0];
  log("list employees", employees.status === 200 && emp?.id, emp?.id || "no employee");

  if (emp?.id) {
    const pending = await prisma.employeeChangeRequest.findMany({
      where: { employeeId: emp.id, status: "PENDING" },
    });
    for (const p of pending) {
      await prisma.employeeChangeRequest.update({
        where: { id: p.id },
        data: {
          status: "REJECTED",
          resolvedAt: new Date(),
          rejectionReason: "UAT cleanup",
        },
      });
    }

    const splitReq = await api("POST", `/payroll/employees/${emp.id}/change-requests`, {
      changeType: "SPLIT",
      payload: { salarySplitUsdPct: 0.7, salarySplitZigPct: 0.3 },
    });
    log("submit change request", splitReq.status === 201, splitReq.json?.message || `status ${splitReq.status}`);

    const portal = await api("GET", "/payroll/employee/portal");
    log("employee portal (JWT)", portal.status === 200 || portal.status === 404, `status ${portal.status}`);

    const payslips = await api("GET", "/payroll/employee/payslips");
    log("employee payslips (JWT)", payslips.status === 200 || payslips.status === 404, `status ${payslips.status}`);
  }

  const ts = Date.now();
  await prisma.payrollRun.updateMany({
    where: { payPeriod: { startsWith: "UAT-PET-SHORT-" }, status: { not: "CANCELLED" } },
    data: { status: "CANCELLED" },
  });

  const employeeList = employees.json?.data?.employees || employees.json?.data || [];
  for (const e of employeeList) {
    if (!e?.id) continue;
    await prisma.employeeChangeRequest.updateMany({
      where: { employeeId: e.id, status: "PENDING" },
      data: { status: "REJECTED", resolvedAt: new Date(), rejectionReason: "UAT cleanup" },
    });
  }

  const currencies = await api("GET", "/accounting/currencies");
  const currencyId = currencies.json?.data?.find((c: any) => c.code === "USD")?.id || currencies.json?.data?.[0]?.id;
  const runStart = new Date(2098, 0, 1 + (ts % 20));
  const runEnd = new Date(2098, 0, 7 + (ts % 20));
  const created = await api("POST", "/payroll/payroll-runs", {
    name: `UAT PET Short ${ts}`,
    payPeriod: `UAT-PET-SHORT-${ts}`,
    startDate: runStart.toISOString(),
    endDate: runEnd.toISOString(),
    currencyId,
    dualCurrency: true,
  });
  const runId = created.json?.data?.id;
  log("create payroll run", created.status === 201 && Boolean(runId), created.json?.message || `status ${created.status}`);

  if (runId) {
    const blocked = await api("POST", `/payroll/payroll-runs/${runId}/process`);
    const blockedMsg = blocked.json?.message || blocked.json?.error || "";
    log(
      "process blocked without approval",
      blocked.status === 400 && /approved/i.test(blockedMsg),
      blockedMsg || `status ${blocked.status}`
    );

    const submit = await api("POST", `/payroll/payroll-runs/${runId}/submit-for-approval`);
    log("submit for approval", submit.status === 200, submit.json?.message || `status ${submit.status}`);

    const approve = await api("POST", `/payroll/payroll-runs/${runId}/approve`, {}, checkerToken);
    log("approve run", approve.status === 200, approve.json?.message || `status ${approve.status}`);
  }

  const cron = await fetch(`${BASE}/payroll/compliance/cron/expiry-check`, {
    method: "POST",
    headers: { "x-compliance-cron-secret": process.env.COMPLIANCE_CRON_SECRET || "" },
  });
  log("expiry cron", cron.status === 200 || cron.status === 403, `status ${cron.status}`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUAT summary: ${results.length - failed}/${results.length} passed`);
  if (failed) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
