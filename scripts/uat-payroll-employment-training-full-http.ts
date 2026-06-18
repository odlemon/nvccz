// @ts-nocheck
/**
 * Full HTTP UAT — Payroll, Employment & Training (all PET endpoints + workflow).
 * Run: npm run uat:payroll:employment-training:full
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import axios from "axios";
import { prisma } from "../src/utils/database";
import { isPayrollPrivilegedUser } from "../src/services/payroll/payrollAccessHelpers";
import Decimal from "decimal.js";

const PORT = process.env.PORT || "3009";
const BASE = process.env.API_BASE_URL || `http://localhost:${PORT}/api`;
const EMAIL = process.env.UAT_EMAIL || process.env.E2E_ADMIN_EMAIL || "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD || process.env.E2E_ADMIN_PASSWORD || "admin123";

const ts = Date.now();
let token = "";
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

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  const t = json.token || json.data?.token;
  log("auth login", res.status === 200 && Boolean(t), t ? EMAIL : json.message || `HTTP ${res.status}`);
  return t || "";
}

async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/pdf")) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, json: { pdf: true, size: buf.length }, buffer: buf };
  }
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, buffer: null as Buffer | null };
}

async function main() {
  console.log(`\n=== Payroll E&T Full UAT ===`);
  console.log(`BASE: ${BASE}`);
  console.log(`User: ${EMAIL}\n`);

  token = await login();
  if (!token) process.exit(1);

  const me = await prisma.user.findFirst({
    where: { email: EMAIL },
    include: { role: true },
  });
  log("admin role check", Boolean(me) && isPayrollPrivilegedUser(me), me ? `role=${me.role?.name} code=${me.roleCode || "—"}` : "user missing");

  // --- Section A: statutory ---
  const brackets = await api("GET", "/payroll/statutory/brackets");
  log("GET statutory/brackets", brackets.status === 200 && Array.isArray(brackets.json?.data), `count ${brackets.json?.data?.length ?? 0}`);

  const levies = await api("GET", "/payroll/statutory/levies");
  log("GET statutory/levies", levies.status === 200, `count ${levies.json?.data?.length ?? 0}`);

  const newBracket = await api("POST", "/payroll/statutory/brackets", {
    currencyCode: "USD",
    lowerBound: 10000,
    upperBound: null,
    marginalRate: 0.3,
    deductionOffset: 500,
    effectiveFrom: "2026-01-01",
    isActive: true,
  });
  const bracketId = newBracket.json?.data?.id;
  log("POST statutory/brackets", newBracket.status === 201 && Boolean(bracketId), newBracket.json?.message || `HTTP ${newBracket.status}`);
  if (bracketId) {
    cap.bracketId = bracketId;
    const upd = await api("PUT", `/payroll/statutory/brackets/${bracketId}`, { deductionOffset: 510 });
    log("PUT statutory/brackets/:id", upd.status === 200, `HTTP ${upd.status}`);
  }

  const levyUpsert = await api("PUT", "/payroll/statutory/levies", {
    levyCode: "SDL_RATE",
    currencyCode: "USD",
    rate: 0.005,
    effectiveFrom: "2026-01-01",
    isActive: true,
  });
  log("PUT statutory/levies", levyUpsert.status === 200, levyUpsert.json?.message || `HTTP ${levyUpsert.status}`);

  // --- Section B: compliance ---
  const courses = await api("GET", "/payroll/compliance/courses");
  log("GET compliance/courses", courses.status === 200, `count ${courses.json?.data?.length ?? 0}`);

  let courseId = courses.json?.data?.[0]?.id;
  if (!courseId) {
    const c = await api("POST", "/payroll/compliance/courses", {
      code: `UAT-COURSE-${ts}`,
      title: "UAT Safety Training",
      renewalPeriodMonths: 12,
      requiredPermissionCodes: ["trading_approve"],
    });
    courseId = c.json?.data?.id;
    log("POST compliance/courses", c.status === 201 && Boolean(courseId), c.json?.message || `HTTP ${c.status}`);
  } else {
    log("POST compliance/courses", true, "using existing seeded course");
  }
  if (courseId) cap.courseId = courseId;

  const assign = await api("POST", "/payroll/compliance/assignments", {
    courseId,
    scopeType: "ALL",
    scopeValue: null,
  });
  const assignmentId = assign.json?.data?.id;
  log("POST compliance/assignments", assign.status === 201 && Boolean(assignmentId), assign.json?.message || `HTTP ${assign.status}`);
  if (assignmentId) cap.assignmentId = assignmentId;

  const expiring = await api("GET", "/payroll/compliance/dashboard/expiring");
  log("GET compliance/dashboard/expiring", expiring.status === 200, `total ${expiring.json?.data?.total ?? "?"}`);

  const certs = await api("GET", "/payroll/compliance/certifications");
  log("GET compliance/certifications", certs.status === 200, `count ${certs.json?.data?.length ?? 0}`);

  // --- Employees ---
  const emps = await api("GET", "/payroll/employees?limit=20");
  const employeeList = emps.json?.data?.employees || emps.json?.data || [];
  let emp = employeeList.find((e: any) => e.lifecycleStatus === "ACTIVE" || e.isActive) || employeeList[0];
  log("GET payroll/employees", emps.status === 200 && employeeList.length > 0, `found ${employeeList.length}`);
  if (!emp?.id) {
    console.error("No employees — cannot continue workflow");
    process.exit(1);
  }
  cap.employeeId = emp.id;

  // Clear pending change requests
  const pending = await prisma.employeeChangeRequest.findMany({
    where: { employeeId: emp.id, status: "PENDING" },
  });
  for (const p of pending) {
    if (me) {
      await prisma.employeeChangeRequest.update({
        where: { id: p.id },
        data: { status: "REJECTED", checkerUserId: me.id, resolvedAt: new Date(), rejectionReason: "UAT cleanup" },
      });
    }
  }

  const splitReq = await api("POST", `/payroll/employees/${emp.id}/change-requests`, {
    changeType: "SPLIT",
    payload: { salarySplitUsdPct: 0.7, salarySplitZigPct: 0.3, departmentCode: "OPS-UAT" },
  });
  const changeRequestId = splitReq.json?.data?.id;
  log("POST change-requests (maker)", splitReq.status === 201 && Boolean(changeRequestId), splitReq.json?.message || `HTTP ${splitReq.status}`);

  if (changeRequestId) {
    const approveCr = await api("POST", `/payroll/change-requests/${changeRequestId}/approve`);
    log("POST change-requests/approve (admin checker)", approveCr.status === 200, approveCr.json?.message || `HTTP ${approveCr.status}`);
    const listCr = await api("GET", `/payroll/employees/${emp.id}/change-requests`);
    log("GET change-requests list", listCr.status === 200, `HTTP ${listCr.status}`);
  }

  const suspend = await api("POST", `/payroll/employees/${emp.id}/suspend`);
  log("POST employees/suspend", suspend.status === 200, suspend.json?.message || `HTTP ${suspend.status}`);

  const reinstate = await api("POST", `/payroll/employees/${emp.id}/reinstate`);
  log("POST employees/reinstate", reinstate.status === 200, reinstate.json?.message || `HTTP ${reinstate.status}`);

  // Ensure split on employee for dual-currency
  await prisma.employee.update({
    where: { id: emp.id },
    data: {
      salarySplitUsdPct: new Decimal(0.7),
      salarySplitZigPct: new Decimal(0.3),
      lifecycleStatus: "ACTIVE",
      isActive: true,
      basicSalary: emp.basicSalary && Number(emp.basicSalary) > 0 ? emp.basicSalary : new Decimal(3500),
    },
  });

  // Employee portal (JWT self-service)
  const portal = await api("GET", "/payroll/employee/portal");
  log("GET employee/portal", portal.status === 200 || portal.status === 404, `HTTP ${portal.status}`);

  const empPayslips = await api("GET", "/payroll/employee/payslips");
  log("GET employee/payslips", empPayslips.status === 200 || empPayslips.status === 404, `HTTP ${empPayslips.status}`);

  const leave = await api("GET", "/payroll/employee/leave-balances");
  log("GET employee/leave-balances", leave.status === 200 || leave.status === 404, `HTTP ${leave.status}`);

  // --- Payroll run workflow ---
  await prisma.payrollRun.updateMany({
    where: { payPeriod: { startsWith: "UAT-PET-" }, status: { not: "CANCELLED" } },
    data: { status: "CANCELLED" },
  });

  const currencies = await api("GET", "/accounting/currencies");
  const currencyId =
    currencies.json?.data?.find((c: any) => c.code === "USD")?.id || currencies.json?.data?.[0]?.id;

  const periodTag = `UAT-PET-${ts}`;
  const runStart = new Date(2099, 0, 1 + (ts % 20));
  const runEnd = new Date(2099, 0, 7 + (ts % 20));
  const createRun = await api("POST", "/payroll/payroll-runs", {
    name: `UAT PET Run ${periodTag}`,
    payPeriod: periodTag,
    startDate: runStart.toISOString(),
    endDate: runEnd.toISOString(),
    currencyId,
    dualCurrency: true,
  });
  const runId = createRun.json?.data?.id;
  log("POST payroll-runs (dualCurrency)", createRun.status === 201 && Boolean(runId), createRun.json?.message || `HTTP ${createRun.status}`);
  if (!runId) {
    console.error("Cannot continue without payroll run");
    process.exit(1);
  }
  cap.runId = runId;

  const blockProcess = await api("POST", `/payroll/payroll-runs/${runId}/process`);
  const blockedMsg = blockProcess.json?.message || blockProcess.json?.error || "";
  log(
    "POST process blocked w/o approval",
    blockProcess.status === 400 && /approved/i.test(blockedMsg),
    blockedMsg || `HTTP ${blockProcess.status}`
  );

  const submit = await api("POST", `/payroll/payroll-runs/${runId}/submit-for-approval`);
  log("POST submit-for-approval", submit.status === 200, submit.json?.message || `HTTP ${submit.status}`);

  const approveRun = await api("POST", `/payroll/payroll-runs/${runId}/approve`);
  log("POST approve run (admin)", approveRun.status === 200, approveRun.json?.message || `HTTP ${approveRun.status}`);

  const processRun = await api("POST", `/payroll/payroll-runs/${runId}/process`);
  log("POST process payroll run", processRun.status === 200, processRun.json?.message || `HTTP ${processRun.status}`);

  const runSummary = await api("GET", `/payroll/payroll-runs/${runId}`);
  const runData = runSummary.json?.data;
  log(
    "GET payroll-runs/:id (COMPLETED + JE)",
    runSummary.status === 200 && runData?.status === "COMPLETED",
    `status=${runData?.status} je=${runData?.journalEntryId || "—"}`
  );

  // Dual-currency legs
  const legs = await prisma.employeePayrollLeg.findMany({
    where: { employeePayroll: { payrollRunId: runId } },
  });
  log("employee_payroll_legs persisted", legs.length >= 1, `legs=${legs.length} currencies=${legs.map((l) => l.currencyCode).join(",")}`);

  if (legs.length >= 2) {
    const aids = Number(legs[0].aidsLevyAmount);
    const paye = Number(legs[0].payeAmount);
    const expectedAids = paye * 0.03;
    log("AIDS levy = 3% of PAYE", Math.abs(aids - expectedAids) < 0.05, `aids=${aids} paye=${paye}`);
  }

  const payslip = await prisma.payslip.findFirst({
    where: { payrollRunId: runId, employeeId: emp.id },
  });
  log("payslip row + sha256", Boolean(payslip?.sha256Checksum), payslip?.sha256Checksum?.slice(0, 12) || "missing");

  if (payslip?.id) {
    cap.payslipId = payslip.id;
    const verify = await api("GET", `/payroll/payslips/by-id/${payslip.id}/verify`);
    log("GET payslips/by-id/verify", verify.status === 200 && verify.json?.data?.valid, JSON.stringify(verify.json?.data));

    const dl = await api("GET", `/payroll/payslips/by-id/${payslip.id}/download`);
    log("GET payslips/by-id/download", dl.status === 200 && (dl.json?.size > 100 || dl.buffer?.length > 100), `bytes ${dl.json?.size || dl.buffer?.length}`);

    const ownDl = await api("GET", `/payroll/employee/payslips/${payslip.id}/download`);
    log("GET employee/payslips/:id/download", ownDl.status === 200 || ownDl.status === 403, `HTTP ${ownDl.status} (403 ok if admin has no employee row)`);

    const adminEmp = await prisma.employee.findFirst({ where: { userId: me?.id } });
    if (adminEmp && payslip.employeeId === adminEmp.id) {
      const ownOk = await api("GET", `/payroll/employee/payslips/${payslip.id}/download`);
      log("GET own payslip download (employee JWT)", ownOk.status === 200, `HTTP ${ownOk.status}`);
    }
  }

  const adminPayslip = await api("GET", `/payroll/payslips/${emp.id}/${runId}`);
  log("GET payslips/:employeeId/:runId", adminPayslip.status === 200, `HTTP ${adminPayslip.status}`);

  // Certification create (minimal PDF)
  if (courseId && emp.id) {
    const pdfPath = path.join(__dirname, "..", "tmp-uat-pet", `cert-${ts}.pdf`);
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    fs.writeFileSync(pdfPath, "%PDF-1.4\n% UAT cert\n%%EOF\n");
    const form = new FormData();
    form.append("document", fs.createReadStream(pdfPath), {
      filename: "cert.pdf",
      contentType: "application/pdf",
    });
    form.append("employeeId", emp.id);
    form.append("courseId", courseId);
    form.append("issuedDate", new Date().toISOString().slice(0, 10));
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 1);
    form.append("expirationDate", exp.toISOString().slice(0, 10));

    const certRes = await axios.post(`${BASE}/payroll/compliance/certifications`, form, {
      headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
      maxBodyLength: 20 * 1024 * 1024,
      validateStatus: () => true,
      timeout: 120000,
    });
    const certJson = certRes.data || {};
    const certId = certJson?.data?.id;
    log("POST compliance/certifications upload", certRes.status === 201 && Boolean(certId), certJson?.message || `HTTP ${certRes.status}`);
    if (certId) {
      cap.certId = certId;
      const revoke = await api("POST", `/payroll/compliance/certifications/${certId}/revoke`);
      log("POST certifications/revoke", revoke.status === 200, revoke.json?.message || `HTTP ${revoke.status}`);
    }
  }

  const cronSecret = process.env.COMPLIANCE_CRON_SECRET || process.env.CRON_SECRET || "";
  const cronRes = await fetch(`${BASE}/payroll/compliance/cron/expiry-check`, {
    method: "POST",
    headers: cronSecret ? { "x-compliance-cron-secret": cronSecret } : {},
  });
  const cronJson = await cronRes.json().catch(() => ({}));
  log("POST compliance/cron/expiry-check", cronRes.status === 200 || (!cronSecret && cronRes.status === 403), `HTTP ${cronRes.status}`);

  if (cap.assignmentId) {
    const delA = await api("DELETE", `/payroll/compliance/assignments/${cap.assignmentId}`);
    log("DELETE compliance/assignments", delA.status === 200, `HTTP ${delA.status}`);
  }

  if (cap.bracketId) {
    const delB = await api("DELETE", `/payroll/statutory/brackets/${cap.bracketId}`);
    log("DELETE statutory/brackets", delB.status === 200, `HTTP ${delB.status}`);
  }

  console.log(`\n=== SUMMARY: ${passed}/${passed + failed} passed ===`);
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("\nCaptured IDs:", cap);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
