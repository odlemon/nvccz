/**
 * Payroll V6 — end-to-end lifecycle against the running API.
 *
 * Proves the full maker-checker round trip with real records and real HTTP,
 * including the negative cases (roles that must be refused actually are):
 *
 *   create run            maker    (payroll.runs.manage)
 *   submit for approval   maker    (payroll.runs.manage)
 *   approve               checker  (payroll.runs.approve, different user)
 *   process               maker    -> calculates pay and generates payslips
 *   bank file             releaser (payroll.runs.release)
 *   employee sees payslip employee (self-service, no payroll grant at all)
 *
 * Note the ordering: PayrollRunApprovalService.assertCanProcess requires the
 * run to be APPROVED before it can be processed, so approval gates calculation
 * rather than following it.
 *
 * Run: npm run e2e:payroll-v6-lifecycle
 * Requires the API on http://127.0.0.1:3009 and the baseline seed applied.
 */

const BASE = process.env.PAYROLL_E2E_BASE || "http://127.0.0.1:3009/api"
const PASSWORD = process.env.PAYROLL_E2E_PASSWORD || "admin123"

const USERS = {
  maker: "perf.sysadmin@nts.local",
  checker: "perf.exec@nts.local",
  hr: "perf.hr@nts.local",
  employee: "perf.employee@nts.local",
}

type Json = any
const tokens: Record<string, string> = {}
let failures = 0
let checks = 0

function log(ok: boolean, label: string, detail = "") {
  checks += 1
  if (!ok) failures += 1
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
}

async function login(email: string): Promise<string> {
  if (tokens[email]) return tokens[email]
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const j = (await r.json()) as Json
  if (!j?.token) throw new Error(`login failed for ${email}: ${JSON.stringify(j).slice(0, 200)}`)
  tokens[email] = j.token
  return j.token
}

async function call(
  email: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Json; text: string }> {
  const token = await login(email)
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await r.text()
  let json: Json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* non-JSON (e.g. a bank file or PDF) is expected on some routes */
  }
  return { status: r.status, json, text }
}

function stamp() {
  // A distinct period per run keeps the overlap check in createPayrollRun happy.
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)
}

async function main() {
  console.log(`Payroll V6 lifecycle E2E against ${BASE}\n`)

  // --- preconditions --------------------------------------------------------
  console.log("Preconditions")
  const emps = await call(USERS.maker, "GET", "/payroll/employees")
  const employees: Json[] = emps.json?.data ?? []
  log(emps.status === 200 && employees.length > 0, "maker can list employees", `${employees.length} employees`)
  const currencyId = employees.find((e) => e.currencyId)?.currencyId ?? null
  log(!!currencyId, "a currency is resolvable from employee records", String(currencyId))

  // --- 1. create ------------------------------------------------------------
  console.log("\n1. Create run (maker)")
  // createPayrollRun rejects any period that overlaps an existing run, so scan
  // forward from 2030-01 for the first month no run occupies. Parking the E2E
  // far in the future keeps it clear of real payroll data.
  const existingRuns: Json[] = (await call(USERS.maker, "GET", "/payroll/payroll-runs?limit=500")).json?.data ?? []
  const occupied = new Set(
    existingRuns
      .map((r) => {
        const d = r.startDate ? new Date(r.startDate) : null
        return d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` : ""
      })
      .filter(Boolean),
  )
  let year = 2030
  let month = 1
  for (let i = 0; i < 240; i += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`
    if (!occupied.has(key)) break
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  const mm = String(month).padStart(2, "0")
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  console.log(`     using free period ${year}-${mm} (${occupied.size} period(s) already occupied)`)
  const runPayload = {
    name: `E2E Lifecycle ${year}-${mm}`,
    payPeriod: `${year}-${mm}`,
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${lastDay}`,
    currencyId,
    dualCurrency: false,
  }
  const created = await call(USERS.maker, "POST", "/payroll/payroll-runs", runPayload)
  const runId = created.json?.data?.id
  log(created.status === 200 || created.status === 201, "run created", `status ${created.status} id ${runId ?? "-"}`)
  if (!runId) {
    console.log("\nCannot continue without a run id. Response:", created.text.slice(0, 500))
    process.exitCode = 1
    return
  }

  // --- negative: employee and HR may not create -----------------------------
  console.log("\n2. Refusals (negative cases)")
  const empCreate = await call(USERS.employee, "POST", "/payroll/payroll-runs", runPayload)
  log(empCreate.status === 403, "plain employee refused run create", `status ${empCreate.status}`)
  const hrCreate = await call(USERS.hr, "POST", "/payroll/payroll-runs", runPayload)
  log(hrCreate.status === 403, "HR manager refused run create (not the maker role)", `status ${hrCreate.status}`)

  // --- 3. process before approval must be refused ---------------------------
  console.log("\n3. Approval gates processing")
  const earlyProcess = await call(USERS.maker, "POST", `/payroll/payroll-runs/${runId}/process`)
  log(
    earlyProcess.status === 400,
    "processing an unapproved run is refused",
    `status ${earlyProcess.status}: ${String(earlyProcess.json?.message ?? "").slice(0, 80)}`,
  )

  // --- 4. submit for approval ----------------------------------------------
  console.log("\n4. Submit for approval (maker)")
  const submitted = await call(USERS.maker, "POST", `/payroll/payroll-runs/${runId}/submit-for-approval`)
  log(submitted.status === 200, "run submitted for approval", `status ${submitted.status}`)

  const hrApprove = await call(USERS.hr, "POST", `/payroll/payroll-runs/${runId}/approve`)
  log(hrApprove.status === 403, "HR manager refused approval (no runs.approve)", `status ${hrApprove.status}`)
  const empApprove = await call(USERS.employee, "POST", `/payroll/payroll-runs/${runId}/approve`)
  log(empApprove.status === 403, "plain employee refused approval", `status ${empApprove.status}`)

  // --- 5. approve as a different user --------------------------------------
  console.log("\n5. Approve (checker, different user from submitter)")
  const approved = await call(USERS.checker, "POST", `/payroll/payroll-runs/${runId}/approve`)
  log(approved.status === 200, "checker approved the run", `status ${approved.status}`)
  const afterApprove = await call(USERS.maker, "GET", `/payroll/payroll-runs/${runId}`)
  const st = afterApprove.json?.data?.status
  log(st === "APPROVED", "run status is APPROVED", String(st))

  // --- 6. process -----------------------------------------------------------
  console.log("\n6. Process (calculates pay, generates payslips)")
  const processed = await call(USERS.maker, "POST", `/payroll/payroll-runs/${runId}/process`)
  log(processed.status === 200, "run processed", `status ${processed.status}`)
  if (processed.status !== 200) {
    console.log("     process response:", processed.text.slice(0, 400))
  }
  const summary = await call(USERS.maker, "GET", `/payroll/payroll-runs/${runId}`)
  const data = summary.json?.data ?? {}
  const gross = Number(data.totalGrossPay ?? 0)
  const ded = Number(data.totalDeductions ?? 0)
  const net = Number(data.totalNetPay ?? 0)
  console.log(`     totals: gross=${gross} deductions=${ded} net=${net}`)
  log(gross > 0, "run has a non-zero gross", String(gross))
  log(
    Math.abs(gross - ded - net) < 0.01,
    "gross - deductions = net (arithmetic holds)",
    `${gross} - ${ded} = ${(gross - ded).toFixed(2)} vs net ${net}`,
  )

  // --- 7. payslips ----------------------------------------------------------
  console.log("\n7. Payslips")
  const employeeRow = employees.find((e) => e.user?.email === USERS.employee)
  log(!!employeeRow, "the test employee has an employee record", employeeRow?.employeeNumber ?? "-")
  if (employeeRow) {
    const slip = await call(USERS.maker, "GET", `/payroll/payslips/${employeeRow.id}/${runId}`)
    log(slip.status === 200, "admin can read that employee's payslip", `status ${slip.status}`)
    const s = slip.json?.data ?? {}
    const sg = Number(s.grossPay ?? 0)
    const sd = Number(s.totalDeductions ?? 0)
    const sn = Number(s.netPay ?? 0)
    console.log(`     payslip: gross=${sg} deductions=${sd} net=${sn}`)
    log(Math.abs(sg - sd - sn) < 0.01, "payslip arithmetic holds", `${sg} - ${sd} = ${sn}`)
  }

  // --- 8. employee self-service --------------------------------------------
  console.log("\n8. Employee self-service (My Pay)")
  const mine = await call(USERS.employee, "GET", "/payroll/employee/payslips")
  const mineRows: Json[] = mine.json?.data ?? []
  log(mine.status === 200, "employee can read own payslips", `status ${mine.status}`)
  const thisRun = mineRows.find((p) => p.payrollRunId === runId)
  log(!!thisRun, "employee sees the payslip from this run", `${mineRows.length} payslip(s) total`)
  const portal = await call(USERS.employee, "GET", "/payroll/employee/portal")
  log(portal.status === 200, "employee portal resolves", `status ${portal.status}`)

  // Cross-tenant check: the employee must not be able to read the admin payslip list.
  const crossRead = await call(USERS.employee, "GET", `/payroll/payslips/${employeeRow?.id}/${runId}`)
  log(crossRead.status === 403, "employee refused the administrative payslip route", `status ${crossRead.status}`)

  // --- 9. bank file ---------------------------------------------------------
  console.log("\n9. Bank file (releaser)")
  const templates = await call(USERS.maker, "GET", "/payroll/bank-templates")
  const bankTemplateId = (templates.json?.data ?? [])[0]?.id
  log(!!bankTemplateId, "a bank file template exists", String(bankTemplateId ?? "none"))

  const bankEmp = await call(USERS.employee, "POST", `/payroll/payroll-runs/${runId}/bank-file`, { bankTemplateId })
  log(bankEmp.status === 403, "plain employee refused bank file generation", `status ${bankEmp.status}`)
  const bank = await call(USERS.maker, "POST", `/payroll/payroll-runs/${runId}/bank-file`, { bankTemplateId })
  log(bank.status === 200, "bank file generated", `status ${bank.status}`)
  if (bank.status === 200) {
    console.log(`     bank file payload: ${bank.text.slice(0, 200).replace(/\n/g, " ")}`)
  } else {
    console.log("     bank file response:", bank.text.slice(0, 300))
  }

  // --- 10. dashboard reflects the run --------------------------------------
  console.log("\n10. Dashboard reflects the processed run")
  const dash = await call(USERS.maker, "GET", "/payroll/dashboard")
  log(dash.status === 200, "dashboard resolves", `status ${dash.status}`)

  console.log(`\n--- ${checks - failures}/${checks} checks passed, run id ${runId} ---`)
  if (failures) process.exitCode = 1
}

main().catch((e) => {
  console.error("E2E failed:", e)
  process.exitCode = 1
})
