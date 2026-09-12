/**
 * Resets performance *metric* data and payroll transactional data for a clean sync test.
 *
 * DELETES:
 * - Performance goals (all types), linked tasks (performance / goal-linked), activity logs, BSC workflow rows
 * - performance_goal_progress_events (cascade with goals)
 * - Journal entries: PERF-GOAL-*, KPI-GOAL-*, KPI Achievement, Performance: narratives, PAYROLL-*, PAYROLL-PAY-*
 * - All payroll runs, employee payroll lines, payslips (and linked payroll JEs / payroll cashbook entries)
 * - performance_metric_snapshots, performance_sync_jobs
 *
 * KEEPS:
 * - KPIs, scorecard pillars/aliases, performance contracts/scorecards/strategies/themes/reviews
 * - Employees, tax/allowance/deduction catalog config
 * - Invoices, procurement, general accounting unrelated to payroll/performance JEs above
 *
 * Dry run:  npm run db:reset:performance-metrics-payroll
 * Apply:    npm run db:reset:performance-metrics-payroll -- --apply
 */
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/utils/database";

const APPLY = process.argv.includes("--apply");

function sanitizeDatabaseUrlForLog(databaseUrl: string | undefined) {
  if (!databaseUrl) return "(DATABASE_URL not set)";
  try {
    const u = new URL(databaseUrl);
    if (u.password) u.password = "****";
    return `${u.protocol}//${u.username ? `${u.username}@` : ""}${u.host}${u.pathname}`;
  } catch {
    return "(DATABASE_URL set)";
  }
}

async function chunked<T>(items: T[], size = 500): Promise<T[][]> {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function isPerformanceOrPayrollJournal(ref: string, desc: string): boolean {
  const r = (ref || "").toUpperCase();
  const d = desc || "";
  if (r.startsWith("PERF-GOAL-")) return true;
  if (r.startsWith("KPI-GOAL-")) return true;
  if (r.startsWith("VR-KPI-")) return true;
  if (r.startsWith("PAYROLL-")) return true;
  if (d.includes("KPI Achievement")) return true;
  if (d.startsWith("Performance:")) return true;
  if (/payroll/i.test(d) && (r.startsWith("PAYROLL") || d.includes("Payroll"))) return true;
  return false;
}

async function findPerformanceAndPayrollJournalIds(): Promise<string[]> {
  const rows = await prisma.journalEntry.findMany({
    where: {
      OR: [
        { referenceNumber: { startsWith: "PERF-GOAL-" } },
        { referenceNumber: { startsWith: "KPI-GOAL-" } },
        { referenceNumber: { startsWith: "VR-KPI-" } },
        { referenceNumber: { startsWith: "PAYROLL-" } },
        { description: { contains: "KPI Achievement" } },
        { description: { startsWith: "Performance:" } },
        { description: { contains: "Payroll" } }
      ]
    },
    select: { id: true, referenceNumber: true, description: true }
  });

  const fromEvents = await prisma.performanceGoalProgressEvent.findMany({
    where: { journalEntryId: { not: null } },
    select: { journalEntryId: true }
  });

  const ids = new Set<string>();
  for (const row of rows) {
    if (isPerformanceOrPayrollJournal(row.referenceNumber, row.description)) {
      ids.add(row.id);
    }
  }
  for (const e of fromEvents) {
    if (e.journalEntryId) ids.add(e.journalEntryId);
  }
  return [...ids];
}

async function deleteJournalEntriesByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const chunks = await chunked(ids, 50);
  let deleted = 0;
  for (const chunkIds of chunks) {
    await prisma.$transaction(
      async (tx) => {
        await tx.auditLog.deleteMany({
          where: { entityType: "JournalEntry", entityId: { in: chunkIds } }
        });
        await tx.reconciliationResult.deleteMany({
          where: { journalEntryId: { in: chunkIds } }
        });
        await tx.bankTransaction.updateMany({
          where: { matchedJournalEntryId: { in: chunkIds } },
          data: { matchedJournalEntryId: null, isMatched: false }
        });
        await tx.cashbookEntry.deleteMany({
          where: { journalEntryId: { in: chunkIds } }
        });
        await tx.expense.deleteMany({ where: { journalEntryId: { in: chunkIds } } });
        await tx.revenue.deleteMany({ where: { journalEntryId: { in: chunkIds } } });
        await tx.forexGainLoss.deleteMany({ where: { journalEntryId: { in: chunkIds } } });
        await tx.creditNote.updateMany({
          where: { journalEntryId: { in: chunkIds } },
          data: { journalEntryId: null }
        });
        await tx.invoice.updateMany({
          where: { journalEntryId: { in: chunkIds } },
          data: { journalEntryId: null }
        });
        await tx.purchaseInvoice.updateMany({
          where: {
            OR: [{ journalEntryId: { in: chunkIds } }, { paymentJournalEntryId: { in: chunkIds } }]
          },
          data: { journalEntryId: null, paymentJournalEntryId: null }
        });
        await tx.performanceGoalProgressEvent.updateMany({
          where: { journalEntryId: { in: chunkIds } },
          data: { journalEntryId: null }
        });
        const del = await tx.journalEntry.deleteMany({ where: { id: { in: chunkIds } } });
        deleted += del.count;
      },
      { maxWait: 15_000, timeout: 120_000 }
    );
  }
  return deleted;
}

async function fetchAllGoalIds(): Promise<string[]> {
  const rows = await prisma.performanceGoal.findMany({ select: { id: true } });
  return rows.map((r) => r.id);
}

async function fetchTaskIdsToDelete(goalIds: string[]): Promise<string[]> {
  const rows = await prisma.task.findMany({
    where: {
      OR: [
        { isPerformanceTask: true },
        ...(goalIds.length > 0 ? [{ goalId: { in: goalIds } }] : [])
      ] as Prisma.TaskWhereInput[]
    },
    select: { id: true }
  });
  return rows.map((r) => r.id);
}

async function countPlan(goalIds: string[], taskIds: string[], journalIds: string[]) {
  const [
    kpis,
    pillars,
    goals,
    progressEvents,
    tasksToDelete,
    activityLogs,
    payrollRuns,
    payslips,
    journals,
    metricSnapshots,
    syncJobs
  ] = await Promise.all([
    prisma.kPI.count(),
    prisma.scorecardPillar.count(),
    prisma.performanceGoal.count(),
    prisma.performanceGoalProgressEvent.count(),
    prisma.task.count({
      where: {
        OR: [
          { isPerformanceTask: true },
          ...(goalIds.length > 0 ? [{ goalId: { in: goalIds } }] : [])
        ] as Prisma.TaskWhereInput[]
      }
    }),
    prisma.activityLog.count({
      where: {
        OR: [
          ...(goalIds.length > 0 ? [{ goalId: { in: goalIds } }] : []),
          ...(taskIds.length > 0 ? [{ taskId: { in: taskIds } }] : [])
        ] as Prisma.ActivityLogWhereInput[]
      }
    }),
    prisma.payrollRun.count(),
    prisma.payslip.count(),
    Promise.resolve(journalIds.length),
    prisma.performanceMetricSnapshot.count(),
    prisma.performanceSyncJob.count()
  ]);

  return {
    keep: { kpis, pillars },
    delete: {
      performanceGoals: goals,
      progressEvents,
      tasksToDelete,
      activityLogs,
      payrollRuns,
      payslips,
      performancePayrollJournals: journals,
      metricSnapshots,
      syncJobs
    }
  };
}

async function deletePerformanceMetrics(goalIds: string[], taskIds: string[]) {
  const results: Record<string, number> = {};
  const goalIdChunks = await chunked(goalIds, 500);
  const taskIdChunks = await chunked(taskIds, 500);

  const clearedParents = await prisma.performanceGoal.updateMany({
    where: { parentGoalId: { not: null } },
    data: { parentGoalId: null }
  });
  results.parentGoalLinksCleared = clearedParents.count;

  let varianceDeleted = 0;
  for (const ids of goalIdChunks) {
    if (!ids.length) continue;
    varianceDeleted += (
      await prisma.bscBudgetVarianceReport.deleteMany({
        where: { performanceGoalId: { in: ids } }
      })
    ).count;
  }
  results.bscBudgetVarianceReports = varianceDeleted;

  let statutoryDeleted = 0;
  for (const ids of goalIdChunks) {
    if (!ids.length) continue;
    statutoryDeleted += (
      await prisma.bscStatutorySubmission.deleteMany({
        where: { performanceGoalId: { in: ids } }
      })
    ).count;
  }
  results.bscStatutorySubmissions = statutoryDeleted;

  let activityDeleted = 0;
  for (const ids of goalIdChunks) {
    if (!ids.length) continue;
    activityDeleted += (await prisma.activityLog.deleteMany({ where: { goalId: { in: ids } } })).count;
  }
  for (const ids of taskIdChunks) {
    if (!ids.length) continue;
    activityDeleted += (await prisma.activityLog.deleteMany({ where: { taskId: { in: ids } } })).count;
  }
  results.activityLogs = activityDeleted;

  let tasksDeleted = 0;
  for (const ids of taskIdChunks) {
    if (!ids.length) continue;
    tasksDeleted += (await prisma.task.deleteMany({ where: { id: { in: ids } } })).count;
  }
  results.tasks = tasksDeleted;

  let goalsDeleted = 0;
  for (const ids of goalIdChunks) {
    if (!ids.length) continue;
    goalsDeleted += (await prisma.performanceGoal.deleteMany({ where: { id: { in: ids } } })).count;
  }
  results.performanceGoals = goalsDeleted;

  results.metricSnapshots = (await prisma.performanceMetricSnapshot.deleteMany({})).count;
  results.syncJobs = (await prisma.performanceSyncJob.deleteMany({})).count;

  await prisma.performanceSyncSettings.upsert({
    where: { id: "default" },
    create: { id: "default", lastLoginSyncAt: null },
    update: { lastLoginSyncAt: null }
  });
  results.syncSettingsReset = 1;

  return results;
}

async function deletePayrollData() {
  const payslips = (await prisma.payslip.deleteMany({})).count;
  const runs = (await prisma.payrollRun.deleteMany({})).count;
  return { payslips, payrollRuns: runs };
}

async function main() {
  console.log("============================================================");
  console.log("RESET: Performance metrics + payroll (transactional only)");
  console.log("============================================================");
  console.log(`Mode: ${APPLY ? "APPLY (DESTRUCTIVE)" : "DRY RUN"}`);
  console.log(`Database: ${sanitizeDatabaseUrlForLog(process.env.DATABASE_URL)}`);
  console.log("");

  const goalIds = await fetchAllGoalIds();
  const taskIds = await fetchTaskIdsToDelete(goalIds);
  const journalIds = await findPerformanceAndPayrollJournalIds();
  const plan = await countPlan(goalIds, taskIds, journalIds);

  console.log("KEEP (config):", plan.keep);
  console.log("DELETE (counts):", plan.delete);

  if (!APPLY) {
    console.log("");
    console.log("Dry run complete. To apply, re-run with: --apply");
    return;
  }

  console.log("");
  console.log("Step 1: Deleting performance / payroll journal entries…");
  const journalsDeleted = await deleteJournalEntriesByIds(journalIds);
  console.log(`  journal entries deleted: ${journalsDeleted}`);

  console.log("Step 2: Deleting performance goals, tasks, progress…");
  const perfDeleted = await deletePerformanceMetrics(goalIds, taskIds);
  console.log(" ", perfDeleted);

  console.log("Step 3: Deleting payroll runs and payslips…");
  const payrollDeleted = await deletePayrollData();
  console.log(" ", payrollDeleted);

  const afterGoalIds = await fetchAllGoalIds();
  const afterTaskIds = await fetchTaskIdsToDelete(afterGoalIds);
  const afterJournalIds = await findPerformanceAndPayrollJournalIds();
  const after = await countPlan(afterGoalIds, afterTaskIds, afterJournalIds);
  console.log("");
  console.log("After reset — KEEP:", after.keep);
  console.log("After reset — DELETE counts (should be 0):", after.delete);
  console.log("");
  console.log("Reset completed. Log in or run sync:financial-goals-from-gl to repopulate from accounting.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
