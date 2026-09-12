/**
 * Payroll V6 — realistic run history, produced through the real API lifecycle.
 *
 * Two jobs:
 *
 *  1. Remove the "E2E Lifecycle *" runs the lifecycle test leaves behind. Those
 *     are parked in 2030-2036 and they pollute the dashboard: they inflate the
 *     month/average metrics and one of them still carries a pre-fix gross of
 *     158,036.97 from when mixed-currency legs were summed as one scalar.
 *
 *  2. Create the last three completed months of payroll by driving the actual
 *     endpoints — create, submit for approval, approve as a different user,
 *     process — so the history on screen was produced the same way a real run
 *     would be, not written straight into the tables.
 *
 * Idempotent: a period that already has a run is left alone.
 *
 * Run: npm run db:seed:payroll-v6-history
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const BASE = process.env.PAYROLL_E2E_BASE || "http://127.0.0.1:3009/api"
const PASSWORD = process.env.PAYROLL_E2E_PASSWORD || "admin123"
const MAKER = "perf.sysadmin@nts.local"
const CHECKER = "perf.exec@nts.local"

const tokens: Record<string, string> = {}

async function login(email: string): Promise<string> {
  if (tokens[email]) return tokens[email]
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const j: any = await r.json()
  if (!j?.token) throw new Error(`login failed for ${email}`)
  tokens[email] = j.token
  return j.token
}

async function call(email: string, method: string, path: string, body?: unknown) {
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
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    /* bank files and PDFs are not JSON */
  }
  return { status: r.status, json, text }
}

/** Delete a payroll run and everything hanging off it. */
async function purgeRun(runId: string) {
  await prisma.payslip.deleteMany({ where: { payrollRunId: runId } })
  const eps = await prisma.employeePayroll.findMany({
    where: { payrollRunId: runId },
    select: { id: true },
  })
  const epIds = eps.map((e) => e.id)
  if (epIds.length) {
    await prisma.employeePayrollLeg.deleteMany({ where: { employeePayrollId: { in: epIds } } })
    await prisma.payrollAllowance.deleteMany({ where: { employeePayrollId: { in: epIds } } })
    await prisma.payrollDeduction.deleteMany({ where: { employeePayrollId: { in: epIds } } })
  }
  await prisma.employeePayroll.deleteMany({ where: { payrollRunId: runId } })
  // Detach any journal entry first so the FK does not block the delete.
  await prisma.payrollRun.update({ where: { id: runId }, data: { journalEntryId: null } })
  await prisma.payrollRun.delete({ where: { id: runId } })
}

async function main() {
  console.log("Payroll V6 run history\n")

  // --- 1. clear test artefacts ---------------------------------------------
  const junk = await prisma.payrollRun.findMany({
    where: { name: { startsWith: "E2E Lifecycle" } },
    select: { id: true, name: true, payPeriod: true },
  })
  for (const r of junk) {
    await purgeRun(r.id)
    console.log(`  purged  ${r.payPeriod}  ${r.name}`)
  }
  console.log(`E2E artefacts removed: ${junk.length}\n`)

  // --- 2. build the last three completed months ----------------------------
  const now = new Date()
  const periods: Array<{ year: number; month: number }> = []
  for (let back = 3; back >= 1; back -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    periods.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 })
  }

  const employees = (await call(MAKER, "GET", "/payroll/employees")).json?.data ?? []
  const currencyId = employees.find((e: any) => e.currencyId)?.currencyId ?? null

  const existing = (await call(MAKER, "GET", "/payroll/payroll-runs?limit=200")).json?.data ?? []
  const taken = new Set(existing.map((r: any) => String(r.payPeriod)))

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ]

  for (const p of periods) {
    const mm = String(p.month).padStart(2, "0")
    const payPeriod = `${p.year}-${mm}`
    if (taken.has(payPeriod)) {
      console.log(`  skip    ${payPeriod} — a run already exists`)
      continue
    }

    const lastDay = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate()
    const created = await call(MAKER, "POST", "/payroll/payroll-runs", {
      name: `${MONTHS[p.month - 1]} ${p.year} Monthly Staff`,
      payPeriod,
      startDate: `${p.year}-${mm}-01`,
      endDate: `${p.year}-${mm}-${lastDay}`,
      currencyId,
      dualCurrency: false,
    })
    const runId = created.json?.data?.id
    if (!runId) {
      console.log(`  FAIL    ${payPeriod} create -> ${created.status} ${created.text.slice(0, 160)}`)
      continue
    }

    const submitted = await call(MAKER, "POST", `/payroll/payroll-runs/${runId}/submit-for-approval`)
    const approved = await call(CHECKER, "POST", `/payroll/payroll-runs/${runId}/approve`)
    const processed = await call(MAKER, "POST", `/payroll/payroll-runs/${runId}/process`)

    const summary = await call(MAKER, "GET", `/payroll/payroll-runs/${runId}`)
    const d = summary.json?.data ?? {}
    const ok =
      submitted.status === 200 && approved.status === 200 && processed.status === 200
    console.log(
      `  ${ok ? "built  " : "PARTIAL"} ${payPeriod}  submit=${submitted.status} approve=${approved.status} process=${processed.status}  gross=${Number(d.totalGrossPay ?? 0).toFixed(2)} net=${Number(d.totalNetPay ?? 0).toFixed(2)}`,
    )
    if (!ok) console.log(`          ${processed.text.slice(0, 200)}`)
  }

  const finalRuns = await prisma.payrollRun.findMany({
    select: { payPeriod: true, status: true, totalGrossPay: true },
    orderBy: { startDate: "asc" },
  })
  console.log("\nRuns now in the database:")
  for (const r of finalRuns) {
    console.log(`  ${r.payPeriod}  ${r.status.padEnd(16)} gross=${Number(r.totalGrossPay).toFixed(2)}`)
  }
}

main()
  .catch((e) => {
    console.error("History seed failed:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
