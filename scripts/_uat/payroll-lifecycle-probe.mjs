/**
 * Payroll run lifecycle — maker-checker and money math end to end.
 *
 * Roadmap P.1, P.2, P.3 and P.5. Runs a complete period as the real personas:
 *
 *   Payroll Manager creates -> submits
 *   Payroll Manager attempts to APPROVE ITS OWN RUN   <- must be refused
 *   CFO rejects -> Manager resubmits -> CFO approves
 *   Manager processes -> payslips, then the GL posting
 *
 * Then reconciles by hand rather than trusting the screen:
 *   gross - deductions = net, at run level and summed across payslips
 *   run header totals == sum of payslips
 *   the journal balances, carries a net-wages line, and credits sum to gross
 *
 * Creates a real payroll run. Pass --period to choose one that is free.
 *
 * Run:  node scripts/_uat/payroll-lifecycle-probe.mjs [--period=2026-11] [--keep]
 * Exit: 0 = every assertion held, 1 = at least one failed
 */
import { PrismaClient } from "@prisma/client";

const API = process.env.API_BASE || "http://127.0.0.1:3009/api";
const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const PERIOD = arg("period", "2026-11");
const KEEP = process.argv.includes("--keep");
const prisma = new PrismaClient();

const MAKER = "payroll.manager@nts.local";
const CHECKER = "payroll.cfo@nts.local";
const PASSWORD = "admin123";

const failures = [];
const ok = (label, detail = "") => console.log(`  PASS  ${label}${detail ? "  " + detail : ""}`);
const bad = (label, detail = "") => {
  failures.push(`${label}${detail ? " — " + detail : ""}`);
  console.log(`  FAIL  ${label}${detail ? "  " + detail : ""}`);
};

async function login(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, portal: "staff" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error(`login failed for ${email}: ${j.message || r.status}`);
  return j.token;
}

async function call(token, path, method = "GET", body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try {
    payload = await r.json();
  } catch { /* status is enough to classify */ }
  return { status: r.status, payload };
}

const money = (v) => Number(v ?? 0);
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

(async () => {
  console.log(`Payroll lifecycle probe — period ${PERIOD}\n`);

  const existing = await prisma.payrollRun.findFirst({ where: { payPeriod: PERIOD } });
  if (existing) {
    console.error(`  CANNOT RUN — ${PERIOD} already has a run (${existing.status}). Pass --period= a free one.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const maker = await login(MAKER);
  const checker = await login(CHECKER);
  console.log(`  maker   ${MAKER}`);
  console.log(`  checker ${CHECKER}\n`);

  const [y, m] = PERIOD.split("-").map(Number);
  const startDate = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  // ---- 1. create ----------------------------------------------------------
  console.log("--- 1. maker creates the run ---");
  const created = await call(maker, "/payroll/payroll-runs", "POST", {
    name: `UAT ${PERIOD}`,
    payPeriod: PERIOD,
    startDate,
    endDate,
  });
  if (created.status !== 201 && created.status !== 200) {
    bad("maker can create a run", `${created.status} ${JSON.stringify(created.payload).slice(0, 160)}`);
    await prisma.$disconnect();
    process.exit(1);
  }
  const runId = created.payload?.data?.id || created.payload?.id;
  ok("maker created the run", runId);

  // ---- 2. submit ----------------------------------------------------------
  console.log("\n--- 2. maker submits for approval ---");
  const submitted = await call(maker, `/payroll/payroll-runs/${runId}/submit-for-approval`, "POST", {});
  submitted.status === 200
    ? ok("maker can submit for approval")
    : bad("maker can submit for approval", `${submitted.status}`);

  // ---- 3. THE segregation test -------------------------------------------
  console.log("\n--- 3. maker attempts to approve its own run (must be refused) ---");
  const selfApprove = await call(maker, `/payroll/payroll-runs/${runId}/approve`, "POST", {});
  selfApprove.status === 403
    ? ok("maker is REFUSED approval of its own run", "403")
    : bad("maker must not approve its own run", `got ${selfApprove.status}`);

  // ---- 4. reject and return ----------------------------------------------
  console.log("\n--- 4. checker rejects, maker resubmits, checker approves ---");
  const rejected = await call(checker, `/payroll/payroll-runs/${runId}/reject`, "POST", {
    reason: "UAT reject-and-return path",
  });
  rejected.status === 200 ? ok("checker can reject") : bad("checker can reject", `${rejected.status}`);

  const resubmit = await call(maker, `/payroll/payroll-runs/${runId}/submit-for-approval`, "POST", {});
  resubmit.status === 200 ? ok("maker can resubmit after rejection") : bad("maker can resubmit", `${resubmit.status}`);

  const approved = await call(checker, `/payroll/payroll-runs/${runId}/approve`, "POST", {});
  approved.status === 200 ? ok("checker can approve") : bad("checker can approve", `${approved.status}`);

  // ---- 5. process ---------------------------------------------------------
  console.log("\n--- 5. maker processes the run ---");
  const processed = await call(maker, `/payroll/payroll-runs/${runId}/process`, "POST", {});
  if (processed.status !== 200) {
    bad("run processes", `${processed.status} ${JSON.stringify(processed.payload).slice(0, 220)}`);
  } else {
    ok("run processed");
  }

  // ---- 6. money math ------------------------------------------------------
  console.log("\n--- 6. money math, checked by hand ---");
  const run = await prisma.payrollRun.findUnique({ where: { id: runId } });
  const slips = await prisma.payslip.findMany({
    where: { payrollRunId: runId },
    select: { grossPay: true, totalDeductions: true, netPay: true },
  });
  console.log(`  status ${run.status} · ${slips.length} payslip(s)`);

  const sum = (f) => slips.reduce((a, s) => a + money(s[f]), 0);
  const sg = sum("grossPay"), sd = sum("totalDeductions"), sn = sum("netPay");
  const hg = money(run.totalGrossPay), hd = money(run.totalDeductions), hn = money(run.totalNetPay);

  near(hg - hd, hn) ? ok("run header: gross - deductions = net", `${hg.toFixed(2)} - ${hd.toFixed(2)} = ${hn.toFixed(2)}`)
                    : bad("run header: gross - deductions = net", `${(hg - hd).toFixed(4)} vs ${hn.toFixed(4)}`);
  near(sg - sd, sn) ? ok("payslips: gross - deductions = net")
                    : bad("payslips: gross - deductions = net", `${(sg - sd).toFixed(4)} vs ${sn.toFixed(4)}`);
  near(sg, hg) ? ok("payslip gross sums to the run header", hg.toFixed(2))
               : bad("payslip gross sums to the run header", `${sg.toFixed(4)} vs ${hg.toFixed(4)}`);
  near(sn, hn) ? ok("payslip net sums to the run header", hn.toFixed(2))
               : bad("payslip net sums to the run header", `${sn.toFixed(4)} vs ${hn.toFixed(4)}`);

  // ---- 7. the GL posting (FINDING-004) ------------------------------------
  console.log("\n--- 7. the GL posting ---");
  if (!run.journalEntryId) {
    bad("run posted a journal entry", `journalEntryId is null; processError=${run.processError || "(none)"}`);
  } else {
    const jl = await prisma.$queryRawUnsafe(
      "SELECT description, debitAmount, creditAmount FROM journal_entry_lines WHERE journalEntryId = ?",
      run.journalEntryId,
    );
    let dr = 0, cr = 0;
    for (const l of jl) {
      dr += money(l.debitAmount);
      cr += money(l.creditAmount);
      console.log(`     ${String(l.description).padEnd(38)} dr ${money(l.debitAmount).toFixed(2).padStart(12)}  cr ${money(l.creditAmount).toFixed(2).padStart(12)}`);
    }
    near(dr, cr) ? ok("journal balances", `dr ${dr.toFixed(2)} = cr ${cr.toFixed(2)}`)
                 : bad("journal balances", `dr ${dr.toFixed(2)} vs cr ${cr.toFixed(2)} (out by ${(cr - dr).toFixed(2)})`);

    const hasNet = jl.some((l) => String(l.description).includes("Net Wages"));
    hasNet ? ok("journal carries a Net Wages Payable line") : bad("journal carries a Net Wages Payable line", "missing");

    near(dr, hg) ? ok("journal debit equals the run's gross", hg.toFixed(2))
                 : bad("journal debit equals the run's gross", `${dr.toFixed(2)} vs ${hg.toFixed(2)}`);
  }

  // ---- cleanup ------------------------------------------------------------
  if (!KEEP) {
    console.log("\n--- cleanup ---");
    const je = run.journalEntryId;
    await prisma.$executeRawUnsafe("DELETE FROM payslips WHERE payrollRunId = ?", runId);
    await prisma.$executeRawUnsafe(
      "DELETE FROM employee_payroll_legs WHERE employee_payroll_id IN (SELECT id FROM employee_payrolls WHERE payrollRunId = ?)",
      runId,
    );
    await prisma.$executeRawUnsafe("DELETE FROM payroll_deductions WHERE employeePayrollId IN (SELECT id FROM employee_payrolls WHERE payrollRunId = ?)", runId).catch(() => {});
    await prisma.$executeRawUnsafe("DELETE FROM payroll_allowances WHERE employeePayrollId IN (SELECT id FROM employee_payrolls WHERE payrollRunId = ?)", runId).catch(() => {});
    await prisma.$executeRawUnsafe("DELETE FROM employee_payrolls WHERE payrollRunId = ?", runId);
    await prisma.$executeRawUnsafe("DELETE FROM payroll_runs WHERE id = ?", runId);
    if (je) {
      await prisma.$executeRawUnsafe("DELETE FROM journal_entry_lines WHERE journalEntryId = ?", je);
      await prisma.$executeRawUnsafe("DELETE FROM journal_entries WHERE id = ?", je).catch(() => {});
    }
    console.log(`  removed run ${PERIOD} and its journal — the probe leaves no payroll behind`);
  } else {
    console.log(`\n  --keep: run ${PERIOD} (${runId}) left in place`);
  }

  console.log("\n=== RESULT ===");
  if (failures.length === 0) {
    console.log("PASS — maker-checker held and every figure reconciled.");
    await prisma.$disconnect();
    process.exit(0);
  }
  console.log(`FAIL — ${failures.length}:`);
  failures.forEach((f) => console.log(`  - ${f}`));
  await prisma.$disconnect();
  process.exit(1);
})().catch(async (e) => {
  console.error("probe failed:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
