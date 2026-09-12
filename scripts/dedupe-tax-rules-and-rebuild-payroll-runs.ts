/**
 * Fix duplicate USD TaxRules and rebuild affected COMPLETED payroll runs.
 *
 * Background:
 *   `fix-tax-rules-missing-currency-to-usd` re-pointed orphan-currency rules to USD,
 *   but USD already had matching rules. Result: every payroll calc now applies each
 *   PAYE bracket and NSSA twice, so persisted PayrollDeduction rows are doubled and
 *   the gross-pay accrual JE has inflated 2150/2160 credits.
 *
 * What this script does (idempotent):
 *   1. Finds active TaxRules grouped by (currencyId, name, type, rate, threshold,
 *      ceiling, effectiveDate, endDate). For any group with >1 active row, keeps the
 *      OLDEST and deactivates the rest.
 *   2. For each requested COMPLETED payroll run id (or the most recent COMPLETED run
 *      if none supplied), recomputes every employee's payroll via
 *      PayrollService.calculateEmployeePayroll, replaces PayrollDeduction rows,
 *      updates EmployeePayroll & PayrollRun totals, deletes any existing gross-pay
 *      accrual journal entries, and posts a fresh balanced JE.
 *
 * Usage:
 *   npm run db:fix:dedupe-tax-rules-and-rebuild-payroll-runs                    # most recent COMPLETED run
 *   ts-node ... dedupe-tax-rules-and-rebuild-payroll-runs.ts <runId> [<runId>]  # specific runs
 */
import "dotenv/config";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../src/utils/database";
import { PayrollService } from "../src/services/PayrollService";

interface DedupeStats {
  groupsInspected: number;
  groupsWithDuplicates: number;
  rulesDeactivated: number;
  deactivatedRuleIds: string[];
}

async function dedupeActiveTaxRules(): Promise<DedupeStats> {
  const rules = await prisma.taxRules.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      type: true,
      rate: true,
      threshold: true,
      ceiling: true,
      effectiveDate: true,
      endDate: true,
      currencyId: true,
      createdAt: true,
    },
  });

  // Group by bracket structure (currency + type + rate + threshold + ceiling)
  // and ignore name/effectiveDate/endDate — minor date drift (e.g. 1-day apart) is the
  // signature of the orphan-currency repair that re-pointed a duplicate set to USD.
  const groups = new Map<string, typeof rules>();
  for (const r of rules) {
    const key = [
      r.currencyId || "",
      String(r.type || "").trim().toUpperCase(),
      r.rate?.toString() || "",
      r.threshold?.toString() ?? "",
      r.ceiling?.toString() ?? "",
    ].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const deactivatedRuleIds: string[] = [];
  let groupsWithDuplicates = 0;

  for (const [, members] of groups) {
    if (members.length <= 1) continue;
    groupsWithDuplicates += 1;
    const sorted = [...members].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    const survivor = sorted[0];
    const losers = sorted.slice(1);
    for (const loser of losers) {
      await prisma.taxRules.update({
        where: { id: loser.id },
        data: { isActive: false },
      });
      deactivatedRuleIds.push(loser.id);
    }
    console.log(
      `  Group keep=${survivor.id} (${survivor.type} ${survivor.name}) deactivated=${losers.length} ids=[${losers.map((l) => l.id).join(", ")}]`
    );
  }

  return {
    groupsInspected: groups.size,
    groupsWithDuplicates,
    rulesDeactivated: deactivatedRuleIds.length,
    deactivatedRuleIds,
  };
}

async function rebuildPayrollRun(runId: string): Promise<void> {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: { employeePayrolls: true },
  });
  if (!run) {
    console.log(`  [skip] run not found: ${runId}`);
    return;
  }
  if (run.status !== "COMPLETED") {
    console.log(`  [skip] run not COMPLETED (${run.status}): ${runId}`);
    return;
  }
  console.log(
    `\n>> Rebuilding run ${run.name} (${run.payPeriod}) [${run.id}] employees=${run.employeePayrolls.length}`
  );

  let totalGrossPay = new Decimal(0);
  let totalDeductions = new Decimal(0);
  let totalNetPay = new Decimal(0);

  for (const ep of run.employeePayrolls) {
    const calc = await PayrollService.calculateEmployeePayroll(
      ep.employeeId,
      run.id,
      run.currencyId || "",
      { bypassActiveRosterCheck: true }
    );

    await prisma.employeePayroll.update({
      where: { id: ep.id },
      data: {
        basicSalary: calc.basicSalary,
        totalAllowances: calc.totalAllowances,
        totalDeductions: calc.totalDeductions,
        grossPay: calc.grossPay,
        netPay: calc.netPay,
      },
    });

    await prisma.payrollDeduction.deleteMany({ where: { employeePayrollId: ep.id } });
    const persistResult = await PayrollService.persistPayrollDeductionLinesFromCalculation(
      ep.id,
      calc,
      run.currencyId
    );

    await prisma.payslip.updateMany({
      where: { employeeId: ep.employeeId, payrollRunId: run.id },
      data: {
        grossPay: calc.grossPay,
        totalDeductions: calc.totalDeductions,
        netPay: calc.netPay,
      },
    });

    totalGrossPay = totalGrossPay.add(calc.grossPay);
    totalDeductions = totalDeductions.add(calc.totalDeductions);
    totalNetPay = totalNetPay.add(calc.netPay);

    console.log(
      `   emp=${ep.employeeId} gross=${calc.grossPay.toString()} ded=${calc.totalDeductions.toString()} net=${calc.netPay.toString()} dedRows=${persistResult.created}`
    );
  }

  await prisma.payrollRun.update({
    where: { id: run.id },
    data: { totalGrossPay, totalDeductions, totalNetPay },
  });

  const { deletedIds } =
    await PayrollService.deletePayrollGrossAccrualJournalEntries(run.id);
  if (deletedIds.length) {
    console.log(`   deleted prior gross-accrual JEs: ${deletedIds.join(", ")}`);
  }

  await PayrollService.createPayrollJournalEntry(
    run.id,
    totalGrossPay,
    totalDeductions,
    totalNetPay,
    run.createdById,
    run.currencyId || "",
    { rethrowOnError: true }
  );

  console.log(
    `   run-totals updated gross=${totalGrossPay.toString()} ded=${totalDeductions.toString()} net=${totalNetPay.toString()} -> JE recreated`
  );

  try {
    const { PerformanceGoalService } = await import(
      "../src/services/PerformanceGoalService"
    );
    await PerformanceGoalService.syncPayrollToGoals(
      run.id,
      totalGrossPay,
      run.createdById
    );
    console.log(`   goals re-synced`);
  } catch (e) {
    console.warn(`   [warn] goal sync failed:`, (e as Error).message);
  }
}

async function main() {
  console.log("== Dedupe active TaxRules ==");
  const stats = await dedupeActiveTaxRules();
  console.log(
    `  groupsInspected=${stats.groupsInspected} groupsWithDuplicates=${stats.groupsWithDuplicates} rulesDeactivated=${stats.rulesDeactivated}`
  );

  const argRunIds = process.argv.slice(2).filter(Boolean);
  let runIds = argRunIds;
  if (runIds.length === 0) {
    const last = await prisma.payrollRun.findFirst({
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (last) runIds = [last.id];
  }

  if (runIds.length === 0) {
    console.log("\nNo COMPLETED payroll runs to rebuild.");
    return;
  }

  console.log(`\n== Rebuilding ${runIds.length} payroll run(s) ==`);
  for (const id of runIds) {
    try {
      await rebuildPayrollRun(id);
    } catch (e) {
      console.error(`  [error] rebuild failed for ${id}:`, e);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
