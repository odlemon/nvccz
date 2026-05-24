/**
 * Permanently removes erroneous KPI Achievement journals (and VR-KPI-* reversals),
 * then re-syncs Payroll Expense performance goals from COMPLETED payroll runs.
 *
 * Dry run:  npx ts-node --transpile-only -r dotenv/config scripts/purge-kpi-achievement-journals-and-resync.ts
 * Execute:  ... --execute
 * Period:   ... --period=2026-05  (optional — only delete JEs in that calendar month)
 *
 * npm run db:purge:kpi-achievement-journals
 * npm run db:purge:kpi-achievement-journals -- --execute
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();
const EXECUTE = process.argv.includes("--execute");
const RESYNC_ONLY = process.argv.includes("--resync-only");
const periodArg = process.argv.find((a) => a.startsWith("--period="));
const PERIOD = periodArg ? periodArg.split("=")[1] : null;

function periodBounds(period: string) {
  const [y, m] = period.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)),
  };
}

function isKpiAchievementJournal(ref: string, desc: string): boolean {
  const r = ref || "";
  const d = desc || "";
  if (d.includes("KPI Achievement")) return true;
  if (r.startsWith("VR-KPI-")) return true;
  if (r.startsWith("KPI-GOAL-")) return true;
  if (r.startsWith("KPI-") && !r.startsWith("KPI-GOAL-")) return true;
  return false;
}

async function findKpiAchievementJournalIds(): Promise<string[]> {
  const dateFilter = PERIOD ? periodBounds(PERIOD) : null;
  const rows = await prisma.journalEntry.findMany({
    where: {
      ...(dateFilter
        ? { transactionDate: { gte: dateFilter.start, lte: dateFilter.end } }
        : {}),
      OR: [
        { description: { contains: "KPI Achievement" } },
        { referenceNumber: { startsWith: "KPI-" } },
        { referenceNumber: { startsWith: "VR-KPI-" } },
      ],
    },
    select: { id: true, referenceNumber: true, description: true, status: true },
  });
  return rows.filter((r) => isKpiAchievementJournal(r.referenceNumber, r.description)).map((r) => r.id);
}

async function deleteJournalEntriesByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const chunkSize = 50;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunkIds = ids.slice(i, i + chunkSize);
    await prisma.$transaction(
      async (tx) => {
        await tx.auditLog.deleteMany({
          where: { entityType: "JournalEntry", entityId: { in: chunkIds } },
        });
        await tx.reconciliationResult.deleteMany({
          where: { journalEntryId: { in: chunkIds } },
        });
        await tx.bankTransaction.updateMany({
          where: { matchedJournalEntryId: { in: chunkIds } },
          data: { matchedJournalEntryId: null, isMatched: false },
        });
        await tx.cashbookEntry.deleteMany({
          where: { journalEntryId: { in: chunkIds } },
        });
        await tx.expense.deleteMany({ where: { journalEntryId: { in: chunkIds } } });
        await tx.revenue.deleteMany({ where: { journalEntryId: { in: chunkIds } } });
        await tx.forexGainLoss.deleteMany({ where: { journalEntryId: { in: chunkIds } } });
        await tx.creditNote.updateMany({
          where: { journalEntryId: { in: chunkIds } },
          data: { journalEntryId: null },
        });
        await tx.invoice.updateMany({
          where: { journalEntryId: { in: chunkIds } },
          data: { journalEntryId: null },
        });
        await tx.purchaseInvoice.updateMany({
          where: { OR: [{ journalEntryId: { in: chunkIds } }, { paymentJournalEntryId: { in: chunkIds } }] },
          data: { journalEntryId: null, paymentJournalEntryId: null },
        });
        const del = await tx.journalEntry.deleteMany({ where: { id: { in: chunkIds } } });
        deleted += del.count;
      },
      { maxWait: 15_000, timeout: 120_000 }
    );
  }
  return deleted;
}

function dateRangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

async function expectedPayrollTotalForGoal(goal: {
  startDate: Date;
  endDate: Date;
}): Promise<number> {
  const runs = await prisma.payrollRun.findMany({
    where: {
      status: "COMPLETED",
      startDate: { lte: goal.endDate },
      endDate: { gte: goal.startDate },
    },
    select: { totalGrossPay: true },
  });
  let total = new Decimal(0);
  for (const r of runs) {
    if (r.totalGrossPay) total = total.add(r.totalGrossPay);
  }
  return parseFloat(total.toString());
}

async function resyncPayrollGoals(): Promise<void> {
  const { PerformanceGoalService } = await import("../src/services/PerformanceGoalService");
  const { TaskService } = await import("../src/services/TaskService");
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!user) throw new Error("No user for sync");

  const latestRun = await prisma.payrollRun.findFirst({
    where: { status: "COMPLETED" },
    orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
    select: { id: true, totalGrossPay: true, name: true },
  });
  if (!latestRun) {
    console.log("No COMPLETED payroll runs — skip goal resync.");
    return;
  }

  console.log(`\n🔄 Re-syncing root payroll goals (via latest run: ${latestRun.name})...`);
  await PerformanceGoalService.syncPayrollToGoals(
    latestRun.id,
    latestRun.totalGrossPay ?? new Decimal(0),
    user.id
  );

  const payrollKpi = await prisma.kPI.findFirst({
    where: { OR: [{ code: "PAYROLL_EXPENSE" }, { name: { contains: "Payroll Expense" } }] },
    select: { id: true },
  });
  if (payrollKpi) {
    const subGoals = await prisma.performanceGoal.findMany({
      where: {
        parentGoalId: { not: null },
        OR: [{ kpiId: payrollKpi.id }, { formulaType: "PAYROLL_EXPENSE" }],
      },
      select: { id: true, title: true },
    });
    console.log(`   Recomputing ${subGoals.length} sub-goal(s) from linked tasks...`);
    for (const g of subGoals) {
      try {
        await TaskService.recalculateGoalProgressFromTasks(g.id);
      } catch (e) {
        console.warn(`   ⚠️ Task rollup failed for "${g.title}":`, (e as Error).message);
      }
    }
    const roots = await prisma.performanceGoal.findMany({
      where: {
        parentGoalId: null,
        OR: [{ kpiId: payrollKpi.id }, { formulaType: "PAYROLL_EXPENSE" }],
      },
      select: { id: true },
    });
    for (const root of roots) {
      const children = await prisma.performanceGoal.findMany({
        where: { parentGoalId: root.id },
        select: { id: true },
      });
      for (const c of children) {
        await PerformanceGoalService.updateParentGoalProgress(c.id).catch(() => undefined);
      }

      const rootRow = await prisma.performanceGoal.findUnique({
        where: { id: root.id },
        select: { id: true, title: true, targetValue: true, startDate: true, endDate: true },
      });
      if (!rootRow) continue;
      const expected = await expectedPayrollTotalForGoal(rootRow);
      const target = rootRow.targetValue ? parseFloat(rootRow.targetValue.toString()) : 0;
      const progress = target > 0 ? Math.min((expected / target) * 100, 100) : 0;
      await prisma.performanceGoal.update({
        where: { id: root.id },
        data: {
          currentValue: expected,
          monetaryValueAchieved: expected,
          progressPercentage: progress,
          status: expected >= target && target > 0 ? "completed" : "active",
          stage: expected >= target && target > 0 ? "completed" : "in_progress",
          updatedAt: new Date(),
        },
      });
      console.log(`   Root "${rootRow.title}" set to payroll total $${expected.toFixed(2)}`);
    }
  }
}

async function verify(): Promise<number> {
  let failures = 0;
  const fail = (msg: string) => {
    failures++;
    console.error(`   ❌ ${msg}`);
  };
  const ok = (msg: string) => console.log(`   ✅ ${msg}`);

  const remaining = await prisma.journalEntry.count({
    where: {
      OR: [
        { description: { contains: "KPI Achievement" } },
        { referenceNumber: { startsWith: "KPI-" } },
        { referenceNumber: { startsWith: "VR-KPI-" } },
      ],
    },
  });
  if (remaining > 0) fail(`${remaining} KPI-related journal(s) still in database`);
  else ok("No KPI Achievement / KPI-* / VR-KPI-* journals remain");

  const payrollKpi = await prisma.kPI.findFirst({
    where: {
      OR: [{ code: "PAYROLL_EXPENSE" }, { name: { contains: "Payroll Expense" } }],
    },
  });
  if (!payrollKpi) {
    console.log("   ⚠️ Payroll Expense KPI not found — skipping goal reconciliation");
  } else {
    const goals = await prisma.performanceGoal.findMany({
      where: {
        OR: [{ kpiId: payrollKpi.id }, { formulaType: "PAYROLL_EXPENSE" }],
        status: { in: ["active", "completed", "in_progress"] },
      },
      select: {
        id: true,
        title: true,
        parentGoalId: true,
        currentValue: true,
        startDate: true,
        endDate: true,
      },
    });

    const roots = goals.filter((g) => !g.parentGoalId);
    let goalMismatches = 0;
    for (const g of roots) {
      const expected = await expectedPayrollTotalForGoal(g);
      const actual = g.currentValue ? parseFloat(g.currentValue.toString()) : 0;
      if (Math.abs(actual - expected) > 0.02) {
        goalMismatches++;
        fail(`Root goal "${g.title}" currentValue ${actual} != payroll sum ${expected}`);
      }
    }
    if (goalMismatches === 0) {
      ok(`${roots.length} root payroll goal(s) match COMPLETED payroll totals`);
    }
  }

  const acct5030 = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: "5030", isActive: true },
    select: { id: true },
  });
  if (acct5030) {
    for (const period of ["2026-05", "2025-10"]) {
      const { start, end } = periodBounds(period);
      const lines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: acct5030.id,
          journalEntry: {
            status: "POSTED",
            transactionDate: { gte: start, lte: end },
            referenceNumber: { not: { startsWith: "VR-" } },
          },
        },
        include: {
          journalEntry: { select: { referenceNumber: true, description: true } },
        },
      });
      let net = 0;
      let kpiLines = 0;
      let payrollLines = 0;
      for (const l of lines) {
        net += Number(l.debitAmount || 0) - Number(l.creditAmount || 0);
        const ref = l.journalEntry.referenceNumber || "";
        const desc = l.journalEntry.description || "";
        if (desc.includes("KPI Achievement") || ref.startsWith("KPI-")) kpiLines++;
        if (ref.startsWith("PAYROLL-")) payrollLines++;
      }
      if (kpiLines > 0) fail(`${period} 5030 still has ${kpiLines} line(s) from KPI journals`);
      else ok(`${period} 5030: net=$${net.toFixed(2)} (payroll-tagged lines: ${payrollLines})`);
    }
  }

  return failures;
}

async function main() {
  console.log("\n🧹 Purge KPI Achievement journals + payroll goal resync\n");
  console.log(`Mode: ${EXECUTE ? "EXECUTE (destructive)" : "DRY RUN"}`);
  if (PERIOD) console.log(`Period filter: ${PERIOD}`);
  console.log("");

  const ids = await findKpiAchievementJournalIds();
  const sample = await prisma.journalEntry.findMany({
    where: { id: { in: ids.slice(0, 10) } },
    select: { referenceNumber: true, status: true, description: true, transactionDate: true },
  });
  console.log(`Found ${ids.length} journal entry/entries to remove.`);
  for (const s of sample) {
    console.log(
      `  - [${s.status}] ${s.referenceNumber} | ${s.transactionDate.toISOString().slice(0, 10)} | ${(s.description || "").slice(0, 60)}`
    );
  }
  if (ids.length > 10) console.log(`  ... and ${ids.length - 10} more`);

  if (RESYNC_ONLY) {
    await resyncPayrollGoals();
    console.log("\n📋 Verification\n");
    const failures = await verify();
    process.exit(failures > 0 ? 1 : 0);
  }

  if (!EXECUTE) {
    console.log("\nRe-run with --execute to delete and resync.");
    console.log("Or --resync-only to refresh payroll goals without deleting journals.\n");
    process.exit(0);
  }

  const deleted = await deleteJournalEntriesByIds(ids);
  console.log(`\n🗑️  Deleted ${deleted} journal entry/entries (lines cascade).\n`);

  await resyncPayrollGoals();

  console.log("\n📋 Verification\n");
  const failures = await verify();
  console.log(failures === 0 ? "\n✅ Verification passed\n" : `\n❌ ${failures} verification failure(s)\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
