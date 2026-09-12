/**
 * Backfill after payroll PAYE/NSSA deduction + GL fixes:
 * 1. Rebuild `PayrollDeduction` lines per employee on each completed run (from current tax/catalog rules).
 * 2. Remove gross-pay **accrual** journals for that run (description / PAYROLL-* reference — not payment journals).
 * 3. Post a fresh accrual journal (2150 / 2160 / 2250 split).
 * 4. Re-run payroll → performance goals sync (same as `processPayrollRun`).
 *
 * Usage:
 *   npx ts-node --transpile-only -r dotenv/config scripts/backfill-payroll-run-deductions-gl-and-goals.ts --dry-run --run-id=<cuid>
 *   npx ts-node --transpile-only -r dotenv/config scripts/backfill-payroll-run-deductions-gl-and-goals.ts --run-id=<cuid>
 *   npx ts-node --transpile-only -r dotenv/config scripts/backfill-payroll-run-deductions-gl-and-goals.ts --confirm --from=2025-01-01
 *
 * `--confirm` is required when processing more than one run (omit `--run-id`).
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { PayrollService } from "../src/services/PayrollService";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === name || a.startsWith(`${name}=`));
  if (!hit) return undefined;
  if (hit.includes("=")) return hit.split("=").slice(1).join("=");
  const i = process.argv.indexOf(hit);
  return process.argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const runId = arg("--run-id");
  const fromStr = arg("--from");
  const confirm = hasFlag("--confirm");

  const fromDate = fromStr ? new Date(`${fromStr}T00:00:00.000Z`) : undefined;
  if (fromStr && Number.isNaN(fromDate!.getTime())) {
    throw new Error(`Invalid --from date: ${fromStr}`);
  }

  const where = {
    status: "COMPLETED" as const,
    ...(fromDate ? { endDate: { gte: fromDate } } : {}),
    ...(runId ? { id: runId } : {}),
  };

  const runs = await prisma.payrollRun.findMany({
    where,
    orderBy: { endDate: "asc" },
    select: {
      id: true,
      name: true,
      payPeriod: true,
      endDate: true,
      totalGrossPay: true,
      status: true,
    },
  });

  if (runs.length === 0) {
    console.log("No COMPLETED payroll runs match the filter.");
    return;
  }

  if (!runId && runs.length > 1 && !confirm) {
    console.error(
      `Refusing to modify ${runs.length} runs without --confirm. Use --run-id=<id> for one run, or add --confirm.`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Selected ${runs.length} payroll run(s). dryRun=${dryRun}`);

  for (const run of runs) {
    const exactDesc = PayrollService.payrollGrossAccrualJournalDescription(run);
    const accrualCandidates = await prisma.journalEntry.findMany({
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
      select: { id: true, referenceNumber: true, description: true, transactionDate: true },
    });
    const wouldDelete = accrualCandidates.filter(
      (je) =>
        je.referenceNumber.startsWith("PAYROLL-") ||
        je.description.startsWith("Payroll Journal - Gross Pay:")
    );

    console.log("\n────────────────────────────────────────");
    console.log(`Run ${run.id} | ${run.name} | ${run.payPeriod} | ends ${run.endDate.toISOString()}`);
    console.log(`  Accrual JE candidates to remove: ${wouldDelete.length}`, wouldDelete.map((j) => j.id));

    if (dryRun) {
      console.log("  [dry-run] skip rebuild / delete / journal / goals");
      continue;
    }

    const result = await PayrollService.repairCompletedPayrollRunAccounting(run.id, {
      rethrowJournalErrors: true,
    });
    console.log("  Deduction rebuild:", result.deductions);
    console.log("  Deleted journal entry ids:", result.deletedJournalEntryIds);
    console.log("  [ok] accrual journal recreated + goals re-synced");
  }

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
