/**
 * Compare payroll GL debits vs completed payroll runs vs performance goals.
 * Identifies orphan/duplicate POSTED journals on payroll expense accounts.
 *
 *   npx ts-node --transpile-only -r dotenv/config scripts/audit-payroll-gl-orphans.ts
 *   npx ts-node --transpile-only -r dotenv/config scripts/audit-payroll-gl-orphans.ts --year 2026
 *   npx ts-node --transpile-only -r dotenv/config scripts/audit-payroll-gl-orphans.ts --void-orphans
 */
import { prisma } from "../src/utils/database";
import { getPostedPeriodExpenseByAccount } from "../src/services/AccountingGlPeriodTotalsService";
import {
  isCanonicalPayrollGrossJournal,
  sumCompletedPayrollGrossOverlappingPeriod,
  sumPayrollGoalTargetsOverlappingPeriod,
} from "../src/services/performanceDashboardPayrollBudget";
import { resolveSalariesAndWagesExpenseAccount } from "../src/services/payrollGlAccountResolver";
import { JournalEntryService } from "../src/services/JournalEntryService";
import { PerformanceGoalService } from "../src/services/PerformanceGoalService";

function parseArgs() {
  const args = process.argv.slice(2);
  const yearIdx = args.indexOf("--year");
  const year = yearIdx >= 0 ? parseInt(args[yearIdx + 1], 10) : new Date().getFullYear();
  const voidOrphans = args.includes("--void-orphans");
  const periodStart = new Date(year, 0, 1, 0, 0, 0, 0);
  const periodEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  return { year, voidOrphans, periodStart, periodEnd };
}

async function main() {
  const { year, voidOrphans, periodStart, periodEnd } = parseArgs();
  console.log(`\n=== Payroll GL audit (${year}) ===\n`);

  const payrollAccount = await resolveSalariesAndWagesExpenseAccount();
  const [glByAccount, grossFromRuns, goalTargets, glLines] = await Promise.all([
    getPostedPeriodExpenseByAccount(periodStart, periodEnd),
    sumCompletedPayrollGrossOverlappingPeriod(periodStart, periodEnd),
    sumPayrollGoalTargetsOverlappingPeriod(periodStart, periodEnd),
    prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          status: "POSTED",
          transactionDate: { gte: periodStart, lte: periodEnd },
        },
        chartOfAccountId: payrollAccount.id,
        debitAmount: { gt: 0 },
      },
      select: {
        id: true,
        debitAmount: true,
        journalEntry: {
          select: {
            id: true,
            referenceNumber: true,
            description: true,
            transactionDate: true,
            totalAmount: true,
          },
        },
      },
    }),
  ]);

  const glPayrollTotal =
    glByAccount.find((a) => a.chartOfAccountId === payrollAccount.id)?.actualAmount ?? 0;

  const payrollKpi = await PerformanceGoalService.resolvePayrollExpenseKpiForSync();
  const goals = payrollKpi
    ? await prisma.performanceGoal.findMany({
        where: {
          OR: [{ kpiId: payrollKpi.id }, { formulaType: "PAYROLL_EXPENSE" }],
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
        },
        select: {
          id: true,
          title: true,
          targetValue: true,
          currentValue: true,
          startDate: true,
          endDate: true,
        },
      })
    : [];

  const netFromRuns = await prisma.payrollRun.aggregate({
    where: {
      status: "COMPLETED",
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
    },
    _sum: { totalNetPay: true },
  });

  console.log("Totals (same period overlap rules as performance goals):");
  console.log(`  GL posted debits (${payrollAccount.accountNo}):     $${glPayrollTotal.toFixed(2)}`);
  console.log(`  Completed payroll runs (gross):                    $${grossFromRuns.toFixed(2)}`);
  console.log(`  Completed payroll runs (net — payroll dashboard):  $${Number(netFromRuns._sum.totalNetPay || 0).toFixed(2)}`);
  console.log(`  Payroll Expense goal targets (budget):             $${goalTargets.toFixed(2)}`);
  console.log(`  GL minus gross runs:                               $${(glPayrollTotal - grossFromRuns).toFixed(2)}`);

  if (goals.length) {
    console.log("\nPayroll goals in period:");
    for (const g of goals) {
      console.log(
        `  - ${g.title}: target=$${Number(g.targetValue || 0).toFixed(2)} current=$${Number(g.currentValue || 0).toFixed(2)} (${g.startDate.toISOString().slice(0, 10)} .. ${g.endDate.toISOString().slice(0, 10)})`
      );
    }
  }

  const byJe = new Map<
    string,
    {
      je: (typeof glLines)[0]["journalEntry"];
      debit: number;
      canonical: boolean;
    }
  >();

  for (const line of glLines) {
    const id = line.journalEntry.id;
    const debit = parseFloat(String(line.debitAmount));
    const existing = byJe.get(id);
    if (existing) {
      existing.debit += debit;
    } else {
      byJe.set(id, {
        je: line.journalEntry,
        debit,
        canonical: isCanonicalPayrollGrossJournal(line.journalEntry),
      });
    }
  }

  const canonical: typeof byJe extends Map<string, infer V> ? V[] : never = [];
  const orphans: typeof canonical = [];

  for (const row of byJe.values()) {
    if (row.canonical) canonical.push(row);
    else orphans.push(row);
  }

  const canonicalTotal = canonical.reduce((s, r) => s + r.debit, 0);
  const orphanTotal = orphans.reduce((s, r) => s + r.debit, 0);

  console.log(`\nJournal entries on ${payrollAccount.accountNo}:`);
  console.log(`  Canonical PAYROLL-* gross journals: ${canonical.length} ($${canonicalTotal.toFixed(2)})`);
  console.log(`  Orphan / non-payroll-run journals:  ${orphans.length} ($${orphanTotal.toFixed(2)})`);

  if (orphans.length) {
    console.log("\nOrphan journal entries (candidates to void):");
    for (const o of orphans) {
      console.log(
        `  ${o.je.id} | ${o.je.referenceNumber} | ${o.je.transactionDate.toISOString().slice(0, 10)} | DR $${o.debit.toFixed(2)}`
      );
      console.log(`    ${o.je.description}`);
    }
  }

  if (canonical.length > 0) {
    console.log("\nCanonical payroll journals:");
    for (const c of canonical) {
      console.log(
        `  ${c.je.id} | ${c.je.referenceNumber} | $${c.debit.toFixed(2)} | ${c.je.description.slice(0, 80)}`
      );
    }
  }

  if (voidOrphans) {
    if (!orphans.length) {
      console.log("\nNo orphans to void.");
      return;
    }
    let actor = await prisma.user.findFirst({
      where: { role: { name: "admin" } },
      select: { id: true, email: true },
    });
    if (!actor) {
      actor = await prisma.user.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true },
      });
    }
    if (!actor) {
      throw new Error("No admin user found to void journals");
    }
    console.log(`\nVoiding ${orphans.length} orphan JE(s) as ${actor.email}...`);
    for (const o of orphans) {
      await JournalEntryService.voidJournalEntry(o.je.id, actor.id);
      console.log(`  VOID ${o.je.referenceNumber}`);
    }
    console.log("\nDone. Re-run audit to confirm GL aligns with payroll runs.");
  } else if (orphans.length) {
    console.log("\nTo void orphan entries: add --void-orphans (review list above first).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
