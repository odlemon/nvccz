/**
 * DB check: verify payroll run postings and goal sync.
 *
 * Usage:
 *   npm run dev  (optional)
 *   npx ts-node --transpile-only -r dotenv/config scripts/check-payroll-run-july-gl-and-goals.ts
 *   npx ts-node --transpile-only -r dotenv/config scripts/check-payroll-run-july-gl-and-goals.ts --run-id=<payrollRunId>
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { Decimal } from "@prisma/client/runtime/library";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === name || a.startsWith(`${name}=`));
  if (!hit) return undefined;
  if (hit.includes("=")) return hit.split("=").slice(1).join("=");
  const i = process.argv.indexOf(hit);
  return process.argv[i + 1];
}

function n(d: any): number {
  if (d == null) return 0;
  if (typeof d === "number") return d;
  try {
    return Number(new Decimal(d).toString());
  } catch {
    return Number(d) || 0;
  }
}

async function main() {
  const runId = arg("--run-id");

  const run =
    (runId
      ? await prisma.payrollRun.findUnique({ where: { id: runId } })
      : await prisma.payrollRun.findFirst({
          where: {
            status: "COMPLETED",
            OR: [
              { payPeriod: { contains: "July" } },
              { payPeriod: { contains: "JULY" } },
              { payPeriod: { contains: "july" } },
            ],
          },
          orderBy: { endDate: "desc" },
        })) || null;

  if (!run) {
    console.log("No COMPLETED payroll run found for July (or id not found).");
    const recent = await prisma.payrollRun.findMany({
      orderBy: { endDate: "desc" },
      take: 12,
      select: { id: true, name: true, payPeriod: true, status: true, endDate: true, totalGrossPay: true },
    });
    console.log("\nRecent payroll runs (latest 12):");
    for (const r of recent) {
      console.log({
        id: r.id,
        status: r.status,
        endDate: r.endDate.toISOString().slice(0, 10),
        payPeriod: r.payPeriod,
        name: r.name,
        totalGrossPay: r.totalGrossPay?.toString?.() ?? String(r.totalGrossPay),
      });
    }
    return;
  }

  console.log("\n=== Payroll run ===");
  console.log({
    id: run.id,
    name: run.name,
    payPeriod: run.payPeriod,
    status: run.status,
    startDate: run.startDate.toISOString(),
    endDate: run.endDate.toISOString(),
    currencyId: run.currencyId,
    totalGrossPay: run.totalGrossPay?.toString?.() ?? String(run.totalGrossPay),
    totalDeductions: run.totalDeductions?.toString?.() ?? String(run.totalDeductions),
    totalNetPay: run.totalNetPay?.toString?.() ?? String(run.totalNetPay),
    createdById: run.createdById,
  });

  const employeePayrolls = await prisma.employeePayroll.findMany({
    where: { payrollRunId: run.id },
    select: { id: true, employeeId: true },
  });

  const epIds = employeePayrolls.map((e) => e.id);

  const deductions = await prisma.payrollDeduction.findMany({
    where: { employeePayrollId: { in: epIds } },
    include: { deductionType: true },
  });

  const allow = await prisma.payrollAllowance.findMany({
    where: { employeePayrollId: { in: epIds } },
    include: { allowanceType: true },
  });

  console.log("\n=== Persisted payroll lines ===");
  console.log({
    employeePayrolls: employeePayrolls.length,
    payrollAllowances: allow.length,
    payrollDeductions: deductions.length,
  });

  // Tax rules / deduction catalog sanity for this run's currency + effective date
  const effectiveDate = run.endDate;
  const taxRules = await prisma.taxRules.findMany({
    where: {
      isActive: true,
      currencyId: run.currencyId || undefined,
      effectiveDate: { lte: effectiveDate },
      OR: [{ endDate: null }, { endDate: { gte: effectiveDate } }],
    },
    orderBy: { effectiveDate: "desc" },
    select: { id: true, name: true, type: true, rate: true, threshold: true, ceiling: true, effectiveDate: true, endDate: true },
  });
  console.log("\n=== Active tax rules for this run (effective at run endDate) ===");
  console.log(
    taxRules.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      rate: r.rate?.toString?.() ?? String(r.rate),
      threshold: r.threshold?.toString?.() ?? String(r.threshold),
      ceiling: r.ceiling?.toString?.() ?? String(r.ceiling),
      effectiveDate: r.effectiveDate.toISOString().slice(0, 10),
      endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
    }))
  );

  const deductionTypes = await prisma.deductionTypes.findMany({
    where: {
      isActive: true,
      effectiveDate: { lte: effectiveDate },
      OR: [{ endDate: null }, { endDate: { gte: effectiveDate } }],
      OR: [{ code: { in: ["PAYE", "NSSA", "AIDS_LEVY", "PENSION"] } }, { name: { contains: "PAYE" } }, { name: { contains: "NSSA" } }],
    },
    orderBy: { effectiveDate: "desc" },
    select: { id: true, code: true, name: true, isStatutory: true, rate: true, threshold: true, ceiling: true, effectiveDate: true, endDate: true },
  });
  console.log("\n=== DeductionTypes (PAYE/NSSA/etc) effective at run endDate ===");
  console.log(
    deductionTypes.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      isStatutory: d.isStatutory,
      rate: d.rate?.toString?.() ?? String(d.rate),
      threshold: d.threshold?.toString?.() ?? String(d.threshold),
      ceiling: d.ceiling?.toString?.() ?? String(d.ceiling),
      effectiveDate: d.effectiveDate.toISOString().slice(0, 10),
      endDate: d.endDate ? d.endDate.toISOString().slice(0, 10) : null,
    }))
  );

  const sumByCode: Record<string, number> = {};
  const sumByName: Record<string, number> = {};
  for (const d of deductions) {
    const code = String(d.deductionType?.code || "NO_CODE").toUpperCase();
    const name = String(d.deductionType?.name || "NO_NAME");
    sumByCode[code] = (sumByCode[code] || 0) + n(d.amount);
    sumByName[name] = (sumByName[name] || 0) + n(d.amount);
  }

  const interestingCodes = ["PAYE", "NSSA", "PENSION", "AIDS_LEVY"];
  console.log("\n=== Deduction totals by code (interesting) ===");
  for (const c of interestingCodes) {
    if (sumByCode[c] != null) console.log(`${c}:`, sumByCode[c]);
  }

  // Find gross-pay accrual journal entry created by PayrollService (referenceNumber starts PAYROLL- and description pattern)
  const exactDesc = `Payroll Journal - Gross Pay: ${run.name} (${run.payPeriod})`;
  const accrualJEs = await prisma.journalEntry.findMany({
    where: {
      OR: [
        { description: exactDesc },
        {
          AND: [
            { description: { startsWith: "Payroll Journal - Gross Pay:" } },
            { description: { contains: run.payPeriod } },
            { description: { contains: run.name } },
          ],
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  console.log("\n=== Accrual journal entries (latest first) ===");
  console.log(
    accrualJEs.map((j) => ({
      id: j.id,
      referenceNumber: j.referenceNumber,
      transactionDate: j.transactionDate.toISOString().slice(0, 10),
      totalAmount: j.totalAmount?.toString?.() ?? String(j.totalAmount),
      status: j.status,
      description: j.description,
      createdAt: j.createdAt.toISOString(),
    }))
  );

  const accrualJe = accrualJEs[0] || null;
  if (!accrualJe) {
    console.log("\n[WARN] No accrual journal entry found for this run.");
  } else {
    const lines = await prisma.journalEntryLine.findMany({
      where: { journalEntryId: accrualJe.id },
      include: { chartOfAccount: true },
      orderBy: { createdAt: "asc" },
    });

    console.log("\n=== Accrual JE lines (by accountNo) ===");
    for (const l of lines) {
      const acct = l.chartOfAccount?.accountNo || "NO_ACCT";
      const name = l.chartOfAccount?.accountName || "";
      const dr = n(l.debitAmount);
      const cr = n(l.creditAmount);
      console.log(`${acct} ${name} | DR ${dr} | CR ${cr} | ${l.description}`);
    }

    const has2150 = lines.some((l) => String(l.chartOfAccount?.accountNo) === "2150" && n(l.creditAmount) > 0);
    const has2160 = lines.some((l) => String(l.chartOfAccount?.accountNo) === "2160" && n(l.creditAmount) > 0);
    const has2250 = lines.some((l) => String(l.chartOfAccount?.accountNo) === "2250" && n(l.creditAmount) > 0);
    console.log("\n=== Expected liability lines present? ===");
    console.log({ CR_2150_PAYE: has2150, CR_2160_NSSA_PENSION: has2160, CR_2250_NET_WAGES: has2250 });
  }

  // Goals sync check
  const payrollKpi =
    (await prisma.kPI.findFirst({ where: { code: "PAYROLL_EXPENSE" } })) ||
    (await prisma.kPI.findFirst({
      where: {
        OR: [
          { name: { contains: "Payroll" } },
          { name: { contains: "PAYROLL" } },
          { name: { contains: "payroll" } },
        ],
      },
    })) ||
    null;

  if (!payrollKpi) {
    console.log("\n[WARN] No payroll KPI found (code PAYROLL_EXPENSE / name contains Payroll).");
    return;
  }

  const goals = await prisma.performanceGoal.findMany({
    where: {
      OR: [{ kpiId: payrollKpi.id }, { formulaType: "PAYROLL_EXPENSE" }],
      status: { in: ["active", "completed", "in_progress"] },
    },
    select: {
      id: true,
      title: true,
      currentValue: true,
      targetValue: true,
      progressPercentage: true,
      startDate: true,
      endDate: true,
      status: true,
      stage: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  console.log("\n=== Payroll KPI goals (latest updated first, up to 20) ===");
  for (const g of goals) {
    console.log({
      id: g.id,
      title: g.title,
      currentValue: g.currentValue?.toString?.() ?? String(g.currentValue),
      targetValue: g.targetValue?.toString?.() ?? String(g.targetValue),
      progressPercentage: g.progressPercentage,
      status: g.status,
      stage: g.stage,
      window: `${g.startDate.toISOString().slice(0, 10)}..${g.endDate.toISOString().slice(0, 10)}`,
      updatedAt: g.updatedAt.toISOString(),
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

