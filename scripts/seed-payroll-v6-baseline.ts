/**
 * Payroll V6 — baseline reference data.
 *
 * The payroll tables were completely empty (0 employees, 0 runs, 0 payslips,
 * 0 salary structures), so every payroll-v6 screen had nothing real to render.
 * This seeds the standing data a payroll department needs before a run can be
 * created; it deliberately does NOT create payroll runs or payslips, because
 * those must be produced by exercising the real API lifecycle end to end.
 *
 * Idempotent: every write is an upsert keyed on a natural unique column, so
 * re-running changes nothing. Safe to run repeatedly.
 *
 * Run: npm run db:seed:payroll-v6-baseline
 */
import { PrismaClient, Prisma } from "@prisma/client"

const prisma = new PrismaClient()

/** Zimbabwe payroll runs dual-currency USD / ZiG. */
const CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$", decimalPlaces: 2, isDefault: true },
  { code: "ZIG", name: "Zimbabwe Gold", symbol: "ZiG", decimalPlaces: 2, isDefault: false },
]

const ALLOWANCE_TYPES = [
  { code: "BASIC", name: "Basic Salary", description: "Contractual basic pay", isTaxable: true },
  { code: "HOUSING", name: "Housing Allowance", description: "Monthly housing allowance", isTaxable: true },
  { code: "TRANSPORT", name: "Transport Allowance", description: "Monthly transport allowance", isTaxable: true },
  { code: "MEDICAL", name: "Medical Aid Contribution", description: "Employer medical aid contribution", isTaxable: false },
  { code: "AIRTIME", name: "Communication Allowance", description: "Airtime and data allowance", isTaxable: false },
]

/**
 * Rates are stored as fractions (0.03 = 3%). PAYE is band-driven and resolved
 * from statutory_brackets at calculation time, so its flat rate is 0 here.
 */
const DEDUCTION_TYPES = [
  { code: "PAYE", name: "PAYE", description: "Pay As You Earn, resolved from statutory brackets", isStatutory: true, rate: "0", threshold: null as string | null, ceiling: null as string | null },
  { code: "NSSA", name: "NSSA Pension", description: "National Social Security Authority contribution", isStatutory: true, rate: "0.045", threshold: null, ceiling: "700" },
  { code: "AIDSLEVY", name: "AIDS Levy", description: "3% levy on PAYE payable", isStatutory: true, rate: "0.03", threshold: null, ceiling: null },
  { code: "NEC", name: "NEC Union Dues", description: "National Employment Council dues", isStatutory: false, rate: "0.01", threshold: null, ceiling: null },
  { code: "STAFFLOAN", name: "Staff Loan Repayment", description: "Recovery of staff loan advances", isStatutory: false, rate: "0", threshold: null, ceiling: null },
]

const TAX_RULES = [
  { name: "PAYE (USD) — band driven", type: "PAYE", rate: "0", threshold: "100", ceiling: null as string | null },
  { name: "AIDS Levy on PAYE", type: "LEVY", rate: "0.03", threshold: null, ceiling: null },
  { name: "NSSA employee contribution", type: "PENSION", rate: "0.045", threshold: null, ceiling: "700" },
]

/**
 * Staff roll. `email` must already exist as a User — payroll employees are
 * backed by user accounts (Employee.userId is unique and required).
 * Split percentages model the USD/ZiG salary split used locally.
 */
const STAFF = [
  { email: "perf.sysadmin@nts.local", num: "EMP-0001", dept: "IT", title: "System Administrator", basic: "3200", usd: 1.0, zig: 0.0, bank: "Stanbic Bank", branch: "STANZWHX", acct: "9140028461", bp: "10-284726-K-19", id: "63-1284726K19" },
  { email: "perf.exec@nts.local", num: "EMP-0002", dept: "Operations", title: "Chief Executive Officer", basic: "6500", usd: 1.0, zig: 0.0, bank: "CBZ Bank", branch: "COBZZWHA", acct: "0221007733", bp: "10-183623-J-10", id: "63-1183623J10" },
  { email: "perf.hr@nts.local", num: "EMP-0003", dept: "Human Resources", title: "HR Manager", basic: "2975", usd: 0.7, zig: 0.3, bank: "Stanbic Bank", branch: "STANZWHX", acct: "9140093011", bp: "10-112970-S-07", id: "63-1112970S07" },
  { email: "perf.deptmgr@nts.local", num: "EMP-0004", dept: "Operations", title: "Operations Manager", basic: "2450", usd: 0.7, zig: 0.3, bank: "FBC Bank", branch: "FBCPZWHA", acct: "6100224071", bp: "10-337821-P-14", id: "63-1337821P14" },
  { email: "perf.employee@nts.local", num: "EMP-0005", dept: "Operations", title: "Operations Officer", basic: "1350", usd: 1.0, zig: 0.0, bank: "Ecobank", branch: "ECOCZWHX", acct: "0040006412", bp: "10-445720-B-16", id: "63-1445720B16" },
  { email: "test.finance@nts.local", num: "EMP-0006", dept: "Finance", title: "Finance Officer", basic: "2250", usd: 0.7, zig: 0.3, bank: "Stanbic Bank", branch: "STANZWHX", acct: "9140045218", bp: "10-294120-F-12", id: "63-1294120F12" },
  { email: "test.hr@nts.local", num: "EMP-0007", dept: "Human Resources", title: "HR Officer", basic: "1780", usd: 1.0, zig: 0.0, bank: "Nedbank", branch: "MBCAZWHX", acct: "1100073904", bp: "10-227014-M-09", id: "63-1227014M09" },
  { email: "test.it@nts.local", num: "EMP-0008", dept: "IT", title: "IT Support Specialist", basic: "2200", usd: 0.7, zig: 0.3, bank: "BancABC", branch: "FMBZZWHX", acct: "2300041182", bp: "10-441182-T-11", id: "63-1441182T11" },
  { email: "investments.analyst@nts.com", num: "EMP-0009", dept: "Investments", title: "Investment Analyst", basic: "2600", usd: 1.0, zig: 0.0, bank: "CBZ Bank", branch: "COBZZWHA", acct: "0221018840", bp: "10-188400-I-13", id: "63-1188400I13" },
  { email: "board.chair@nts.com", num: "EMP-0010", dept: "Investments", title: "Investment Committee Chair", basic: "3100", usd: 1.0, zig: 0.0, bank: "Stanbic Bank", branch: "STANZWHX", acct: "9140061204", bp: "10-112970-C-21", id: "63-1112970C21" },
  { email: "board.member1@nts.com", num: "EMP-0011", dept: "Investments", title: "Investment Committee Member", basic: "2850", usd: 0.7, zig: 0.3, bank: "FBC Bank", branch: "FBCPZWHA", acct: "6100238812", bp: "10-238812-B-18", id: "63-1238812B18" },
  { email: "board.member2@nts.com", num: "EMP-0012", dept: "Investments", title: "Investment Committee Member", basic: "2850", usd: 0.7, zig: 0.3, bank: "POSB", branch: "POSBZWHX", acct: "0080030288", bp: "10-330288-G-15", id: "63-1330288G15" },
  { email: "test.finance@nts.local", num: "EMP-0006", dept: "Finance", title: "Finance Officer", basic: "2250", usd: 0.7, zig: 0.3, bank: "Stanbic Bank", branch: "STANZWHX", acct: "9140045218", bp: "10-294120-F-12", id: "63-1294120F12" },
]

/** Monthly allowance amounts by employee number, in the employee's own currency. */
const STRUCTURE_BY_EMPLOYEE: Record<string, Array<{ code: string; amount: string }>> = {
  "EMP-0001": [{ code: "HOUSING", amount: "480" }, { code: "TRANSPORT", amount: "180" }, { code: "MEDICAL", amount: "120" }],
  "EMP-0002": [{ code: "HOUSING", amount: "975" }, { code: "TRANSPORT", amount: "320" }, { code: "MEDICAL", amount: "220" }, { code: "AIRTIME", amount: "80" }],
  "EMP-0003": [{ code: "HOUSING", amount: "446" }, { code: "TRANSPORT", amount: "165" }, { code: "MEDICAL", amount: "120" }],
  "EMP-0004": [{ code: "HOUSING", amount: "367" }, { code: "TRANSPORT", amount: "150" }, { code: "MEDICAL", amount: "110" }],
  "EMP-0005": [{ code: "TRANSPORT", amount: "95" }, { code: "MEDICAL", amount: "70" }],
  "EMP-0006": [{ code: "HOUSING", amount: "337" }, { code: "TRANSPORT", amount: "140" }, { code: "MEDICAL", amount: "100" }],
  "EMP-0007": [{ code: "TRANSPORT", amount: "120" }, { code: "MEDICAL", amount: "90" }],
  "EMP-0008": [{ code: "HOUSING", amount: "330" }, { code: "TRANSPORT", amount: "135" }, { code: "MEDICAL", amount: "100" }],
  "EMP-0009": [{ code: "HOUSING", amount: "390" }, { code: "TRANSPORT", amount: "160" }, { code: "MEDICAL", amount: "110" }],
  "EMP-0010": [{ code: "HOUSING", amount: "465" }, { code: "TRANSPORT", amount: "175" }, { code: "MEDICAL", amount: "130" }],
  "EMP-0011": [{ code: "HOUSING", amount: "427" }, { code: "TRANSPORT", amount: "165" }, { code: "MEDICAL", amount: "120" }],
  "EMP-0012": [{ code: "HOUSING", amount: "427" }, { code: "TRANSPORT", amount: "165" }, { code: "MEDICAL", amount: "120" }],
}

const LEAVE_TYPES = [
  { type: "ANNUAL", base: 22 },
  { type: "SICK", base: 10 },
  { type: "COMPASSIONATE", base: 5 },
]

async function main() {
  console.log("Payroll V6 baseline seed\n")

  // --- currencies -----------------------------------------------------------
  const currencyByCode: Record<string, string> = {}
  for (const c of CURRENCIES) {
    const row = await prisma.currency.upsert({
      where: { code: c.code },
      update: { name: c.name, symbol: c.symbol, isActive: true },
      create: { ...c, isActive: true },
    })
    currencyByCode[c.code] = row.id
  }
  console.log(`currencies: ${Object.keys(currencyByCode).join(", ")}`)
  const usdId = currencyByCode.USD

  // An operator user is needed for the createdById audit columns.
  const operator =
    (await prisma.user.findUnique({ where: { email: "perf.sysadmin@nts.local" } })) ??
    (await prisma.user.findFirst({ where: { role: { name: "admin" } } }))
  if (!operator) throw new Error("No operator user found to own seeded records")

  // --- allowance types ------------------------------------------------------
  const allowanceByCode: Record<string, string> = {}
  for (const a of ALLOWANCE_TYPES) {
    const row = await prisma.allowanceTypes.upsert({
      where: { code: a.code },
      update: { name: a.name, description: a.description, isTaxable: a.isTaxable, isActive: true },
      create: { ...a, isActive: true, createdById: operator.id },
    })
    allowanceByCode[a.code] = row.id
  }
  console.log(`allowance types: ${Object.keys(allowanceByCode).length}`)

  // --- deduction types ------------------------------------------------------
  const effectiveDate = new Date("2026-01-01T00:00:00.000Z")
  for (const d of DEDUCTION_TYPES) {
    await prisma.deductionTypes.upsert({
      where: { code: d.code },
      update: {
        name: d.name,
        description: d.description,
        isStatutory: d.isStatutory,
        isActive: true,
        rate: new Prisma.Decimal(d.rate),
        threshold: d.threshold ? new Prisma.Decimal(d.threshold) : null,
        ceiling: d.ceiling ? new Prisma.Decimal(d.ceiling) : null,
      },
      create: {
        code: d.code,
        name: d.name,
        description: d.description,
        isStatutory: d.isStatutory,
        isActive: true,
        rate: new Prisma.Decimal(d.rate),
        threshold: d.threshold ? new Prisma.Decimal(d.threshold) : null,
        ceiling: d.ceiling ? new Prisma.Decimal(d.ceiling) : null,
        effectiveDate,
        currencyId: usdId,
        createdById: operator.id,
      },
    })
  }
  console.log(`deduction types: ${DEDUCTION_TYPES.length}`)

  // --- tax rules ------------------------------------------------------------
  // TaxRules has no unique business key, so match on name before inserting.
  for (const t of TAX_RULES) {
    const existing = await prisma.taxRules.findFirst({ where: { name: t.name } })
    const data = {
      name: t.name,
      type: t.type,
      rate: new Prisma.Decimal(t.rate),
      threshold: t.threshold ? new Prisma.Decimal(t.threshold) : null,
      ceiling: t.ceiling ? new Prisma.Decimal(t.ceiling) : null,
      isActive: true,
      effectiveDate,
      currencyId: usdId,
    }
    if (existing) await prisma.taxRules.update({ where: { id: existing.id }, data })
    else await prisma.taxRules.create({ data: { ...data, createdById: operator.id } })
  }
  console.log(`tax rules: ${TAX_RULES.length}`)

  // --- employees ------------------------------------------------------------
  // Dedupe the staff list by employee number so a repeated row is harmless.
  const staff = Array.from(new Map(STAFF.map((s) => [s.num, s])).values())

  const managerUser = await prisma.user.findUnique({
    where: { email: "perf.deptmgr@nts.local" },
    select: { id: true },
  })

  const employeeByNumber: Record<string, string> = {}
  let created = 0
  let skipped = 0
  for (const s of staff) {
    const user = await prisma.user.findUnique({ where: { email: s.email }, select: { id: true } })
    if (!user) {
      console.log(`  SKIP ${s.num} — no user account for ${s.email}`)
      skipped += 1
      continue
    }
    const row = await prisma.employee.upsert({
      where: { employeeNumber: s.num },
      update: {
        basicSalary: new Prisma.Decimal(s.basic),
        currencyId: usdId,
        bankName: s.bank,
        branchCode: s.branch,
        accountNumber: s.acct,
        idNumber: s.id,
        zimraBpNumber: s.bp,
        departmentCode: s.dept,
        salarySplitUsdPct: new Prisma.Decimal(String(s.usd)),
        salarySplitZigPct: new Prisma.Decimal(String(s.zig)),
        isActive: true,
        terminated: false,
        lifecycleStatus: "ACTIVE",
      },
      create: {
        userId: user.id,
        employeeNumber: s.num,
        basicSalary: new Prisma.Decimal(s.basic),
        currencyId: usdId,
        bankName: s.bank,
        branchCode: s.branch,
        accountNumber: s.acct,
        idNumber: s.id,
        zimraBpNumber: s.bp,
        departmentCode: s.dept,
        salarySplitUsdPct: new Prisma.Decimal(String(s.usd)),
        salarySplitZigPct: new Prisma.Decimal(String(s.zig)),
        contractEffectiveDate: new Date("2026-01-01"),
        lineManagerUserId: managerUser && managerUser.id !== user.id ? managerUser.id : null,
        isActive: true,
        lifecycleStatus: "ACTIVE",
      },
    })
    employeeByNumber[s.num] = row.id
    created += 1
  }
  console.log(`employees: ${created} upserted, ${skipped} skipped`)

  // --- salary structures ----------------------------------------------------
  let structures = 0
  for (const [num, comps] of Object.entries(STRUCTURE_BY_EMPLOYEE)) {
    const employeeId = employeeByNumber[num]
    if (!employeeId) continue
    for (const c of comps) {
      const allowanceTypeId = allowanceByCode[c.code]
      if (!allowanceTypeId) continue
      const existing = await prisma.salaryStructure.findFirst({
        where: { employeeId, allowanceTypeId, effectiveDate },
      })
      if (existing) {
        await prisma.salaryStructure.update({
          where: { id: existing.id },
          data: { amount: new Prisma.Decimal(c.amount), isActive: true, currencyId: usdId },
        })
      } else {
        await prisma.salaryStructure.create({
          data: {
            employeeId,
            allowanceTypeId,
            amount: new Prisma.Decimal(c.amount),
            currencyId: usdId,
            isActive: true,
            effectiveDate,
          },
        })
      }
      structures += 1
    }
  }
  console.log(`salary structure lines: ${structures}`)

  // --- leave balances -------------------------------------------------------
  let balances = 0
  for (const [num, employeeId] of Object.entries(employeeByNumber)) {
    // Vary the annual balance deterministically so the screen shows a spread
    // rather than one repeated number, without inventing randomness.
    const seq = Number(num.replace(/\D/g, "")) || 1
    for (const l of LEAVE_TYPES) {
      const balance = l.type === "ANNUAL" ? l.base - (seq % 7) : l.base - (seq % 3)
      await prisma.leaveBalance.upsert({
        where: { employeeId_leaveType: { employeeId, leaveType: l.type } },
        update: { balance: new Prisma.Decimal(String(balance)) },
        create: {
          employeeId,
          leaveType: l.type,
          balance: new Prisma.Decimal(String(balance)),
          currencyId: usdId,
        },
      })
      balances += 1
    }
  }
  console.log(`leave balances: ${balances}`)

  console.log("\nBaseline seed complete.")
}

main()
  .catch((e) => {
    console.error("Seed failed:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
