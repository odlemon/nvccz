/**
 * Payroll — adversarial self-service isolation probe (roadmap X.4).
 *
 * The employee self-service routes carry `authenticate` and nothing else:
 *
 *   GET  /payroll/employee/portal
 *   GET  /payroll/employee/payslips
 *   GET  /payroll/employee/payslips/:payslipId/download
 *   POST /payroll/employees/:id/change-requests
 *
 * That is the same shape that let an investee read the staff directory
 * (FINDING-003): a valid token is not a statement about whose data it may
 * touch. Scoping has to be inside the controller, and this checks that it is,
 * by asking one employee for another employee's payslip.
 *
 * Run:  node scripts/_uat/payroll-isolation-probe.mjs [--verbose]
 * Exit: 0 = no leak, 1 = at least one leak
 */
import { PrismaClient } from "@prisma/client";

const API = process.env.API_BASE || "http://127.0.0.1:3009/api";
const VERBOSE = process.argv.includes("--verbose");
const PASSWORD = "admin123";
const prisma = new PrismaClient();

const leaks = [];
const notes = [];

async function login(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, portal: "staff" }),
  });
  const j = await r.json().catch(() => ({}));
  return j.token || null;
}

async function call(token, path, method = "GET", body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = r.headers.get("content-type") || "";
  let payload = null;
  try {
    payload = ct.includes("json") ? await r.json() : (await r.arrayBuffer()).byteLength;
  } catch { /* classification only needs the status */ }
  return { status: r.status, payload };
}

(async () => {
  console.log("Payroll self-service isolation probe");
  console.log(`API: ${API}\n`);

  // Ground truth straight from the database, so the probe is not limited to
  // what the API is willing to admit exists.
  const employees = await prisma.$queryRawUnsafe(
    `SELECT e.id, e.employeeNumber, u.email
       FROM employees e JOIN users u ON u.id = e.userId
      ORDER BY e.employeeNumber`,
  );
  const payslips = await prisma.$queryRawUnsafe(
    `SELECT p.id, p.employeeId, e.employeeNumber, u.email
       FROM payslips p
       JOIN employees e ON e.id = p.employeeId
       JOIN users u ON u.id = e.userId
      ORDER BY e.employeeNumber`,
  );
  console.log(`  ground truth: ${employees.length} employees, ${payslips.length} payslips`);

  // The self-service persona: a plain staff account with no payroll grant.
  const SELF = "perf.employee@nts.local";
  const token = await login(SELF);
  if (!token) {
    console.error(`  CANNOT RUN — login failed for ${SELF}`);
    process.exit(1);
  }
  const me = employees.find((e) => e.email === SELF);
  if (!me) {
    console.error(`  CANNOT RUN — ${SELF} has no employee record`);
    process.exit(1);
  }
  console.log(`  signed in as ${SELF} (${me.employeeNumber})\n`);

  // ---- 1. what self-service returns ---------------------------------------
  console.log("--- 1. own self-service view ---");
  const own = await call(token, "/payroll/employee/payslips");
  const ownList = own.payload?.data ?? own.payload ?? [];
  const ownIds = new Set((Array.isArray(ownList) ? ownList : []).map((p) => p.id).filter(Boolean));
  console.log(`  GET /employee/payslips -> ${own.status}, ${ownIds.size} payslip(s)`);

  const minePerDb = payslips.filter((p) => p.employeeId === me.id).map((p) => p.id);
  const foreign = payslips.filter((p) => p.employeeId !== me.id);
  console.log(`  database says this employee has ${minePerDb.length} payslip(s); ${foreign.length} belong to others`);

  for (const id of ownIds) {
    if (!minePerDb.includes(id)) {
      leaks.push({ what: `own list contained payslip ${id} belonging to another employee`, status: own.status });
      console.log(`  LEAK  list returned a payslip that is not this employee's: ${id}`);
    }
  }
  if (ownIds.size === 0 && minePerDb.length > 0) {
    notes.push("Self-service returned no payslips although the employee has some — check the scoping query, not just the isolation.");
  }
  if (foreign.length === 0) {
    notes.push("No other employee has a payslip, so cross-employee download cannot be proven. Seed a second payslip.");
  }

  // ---- 2. another employee's payslip --------------------------------------
  console.log("\n--- 2. asking for another employee's payslip ---");
  let attempts = 0;
  for (const p of foreign.slice(0, 12)) {
    attempts += 1;
    const r = await call(token, `/payroll/employee/payslips/${p.id}/download`);
    if (r.status === 200) {
      leaks.push({ what: `downloaded ${p.employeeNumber}'s payslip ${p.id}`, status: 200 });
      console.log(`  LEAK  200  ${p.employeeNumber} (${p.email}) payslip ${p.id}`);
    } else if (VERBOSE) {
      console.log(`   ok   ${r.status}  ${p.employeeNumber} payslip ${p.id}`);
    }
  }
  console.log(`  ${attempts} foreign payslip download(s) attempted, ${leaks.length} returned 200`);

  // ---- 3. change requests against someone else's employee record ----------
  console.log("\n--- 3. change request against another employee's record ---");
  const others = employees.filter((e) => e.id !== me.id).slice(0, 3);
  const before = leaks.length;
  for (const e of others) {
    const r = await call(token, `/payroll/employees/${e.id}/change-requests`, "POST", {
      field: "bankName",
      requestedValue: "ISOLATION PROBE — should be refused",
      reason: "isolation probe",
    });
    if (r.status >= 200 && r.status < 300) {
      leaks.push({ what: `filed a change request against ${e.employeeNumber} (${e.email})`, status: r.status });
      console.log(`  LEAK  ${r.status}  change request accepted against ${e.employeeNumber}`);
    } else {
      console.log(`  refused ${r.status}  ${e.employeeNumber}`);
    }
  }
  if (leaks.length > before) {
    notes.push("Change requests were created by this probe and must be removed — see scripts/_uat/clean-payroll-probes.js.");
  }

  // ---- 4. the staff payroll surface, as a plain employee ------------------
  console.log("\n--- 4. staff payroll endpoints, as a plain employee ---");
  for (const path of ["/payroll/employees", "/payroll/payroll-runs", "/payroll/payslips", "/payroll/audit"]) {
    const r = await call(token, path);
    const refused = r.status === 401 || r.status === 403;
    // 404 is neither a refusal nor an admission -- the route does not exist.
    const label = refused ? "refused " : r.status >= 400 ? "no route" : "ADMITTED";
    console.log(`  ${label} ${String(r.status).padEnd(4)} ${path}`);
    if (!refused && r.status < 400) {
      leaks.push({ what: `plain employee reached ${path}`, status: r.status });
    }
  }

  // ---- report -------------------------------------------------------------
  console.log("\n=== RESULT ===");
  notes.forEach((n) => console.log(`  note: ${n}`));
  if (leaks.length === 0) {
    console.log("PASS — no cross-employee payroll access.");
    await prisma.$disconnect();
    process.exit(0);
  }
  console.log(`FAIL — ${leaks.length} leak(s):`);
  leaks.forEach((l) => console.log(`  ${l.status}  ${l.what}`));
  await prisma.$disconnect();
  process.exit(1);
})().catch(async (e) => {
  console.error("probe failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
