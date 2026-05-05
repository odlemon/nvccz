/**
 * Cleanup (wipe) performance module transactional data while preserving core reference data:
 * - KEEP: kpis, scorecard_pillars, scorecard_pillar_aliases
 * - DELETE: performance goals/tasks/contracts/scorecards/strategies/themes/reviews + attached logs/workflow
 *
 * Default mode is DRY RUN (no deletes). To apply deletes, pass `--apply`.
 *
 * Run:
 * - Dry run:  npm run db:cleanup:performance-module
 * - Apply:    npm run db:cleanup:performance-module -- --apply
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { Prisma } from "@prisma/client";

type Id = string;

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function sanitizeDatabaseUrlForLog(databaseUrl: string | undefined) {
  if (!databaseUrl) return "(DATABASE_URL not set)";
  try {
    const u = new URL(databaseUrl);
    // never print password
    if (u.password) u.password = "****";
    return `${u.protocol}//${u.username ? `${u.username}@` : ""}${u.host}${u.pathname}${u.search}`;
  } catch {
    // Might be a non-URL form; avoid leaking secrets.
    return "(DATABASE_URL set; unable to parse safely)";
  }
}

async function chunked<T>(items: T[], size = 500) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchAllGoalIds(): Promise<Id[]> {
  const rows = await prisma.performanceGoal.findMany({ select: { id: true } });
  return rows.map((r) => r.id);
}

async function fetchTaskIdsToDelete(goalIds: Id[]): Promise<Id[]> {
  // Tasks are shared with other modules; only remove performance tasks or tasks linked to performance goals.
  const rows = await prisma.task.findMany({
    where: {
      OR: [
        { isPerformanceTask: true },
        goalIds.length > 0 ? { goalId: { in: goalIds } } : undefined
      ].filter(Boolean) as Prisma.TaskWhereInput[]
    },
    select: { id: true }
  });
  return rows.map((r) => r.id);
}

async function countPlan(goalIds: Id[], taskIds: Id[]) {
  const [
    kpis,
    pillars,
    pillarAliases,
    goals,
    tasksTotal,
    tasksToDelete,
    activityLogsToDelete,
    varianceReportsToDelete,
    statutorySubmissionsToDelete,
    scorecards,
    contracts,
    strategies,
    themes,
    reviewFeedback,
    reviews,
    cycles,
    syncJobs,
    metricSnapshots
  ] = await Promise.all([
    prisma.kPI.count(),
    prisma.scorecardPillar.count(),
    prisma.scorecardPillarAlias.count(),
    prisma.performanceGoal.count(),
    prisma.task.count(),
    prisma.task.count({
      where: {
        OR: [
          { isPerformanceTask: true },
          goalIds.length > 0 ? { goalId: { in: goalIds } } : undefined
        ].filter(Boolean) as Prisma.TaskWhereInput[]
      }
    }),
    prisma.activityLog.count({
      where: {
        OR: [
          goalIds.length > 0 ? { goalId: { in: goalIds } } : undefined,
          taskIds.length > 0 ? { taskId: { in: taskIds } } : undefined
        ].filter(Boolean) as Prisma.ActivityLogWhereInput[]
      }
    }),
    prisma.bscBudgetVarianceReport.count({
      where: goalIds.length > 0 ? { performanceGoalId: { in: goalIds } } : undefined
    }),
    prisma.bscStatutorySubmission.count({
      where: goalIds.length > 0 ? { performanceGoalId: { in: goalIds } } : undefined
    }),
    prisma.performanceScorecard.count(),
    prisma.performanceContract.count(),
    prisma.performanceStrategy.count(),
    prisma.performanceTheme.count(),
    prisma.performanceReviewFeedback.count(),
    prisma.performanceReview.count(),
    prisma.performanceReviewCycle.count(),
    prisma.performanceSyncJob.count(),
    prisma.performanceMetricSnapshot.count()
  ]);

  return {
    keep: { kpis, pillars, pillarAliases },
    delete: {
      performanceGoals: goals,
      tasksTotal,
      tasksToDelete,
      activityLogsToDelete,
      bscBudgetVarianceReports: varianceReportsToDelete,
      bscStatutorySubmissions: statutorySubmissionsToDelete,
      performanceScorecards: scorecards,
      performanceContracts: contracts,
      performanceStrategies: strategies,
      performanceThemes: themes,
      performanceReviewFeedback: reviewFeedback,
      performanceReviews: reviews,
      performanceReviewCycles: cycles,
      performanceSyncJobs: syncJobs,
      performanceMetricSnapshots: metricSnapshots
    }
  };
}

async function deleteInApplyMode(goalIds: Id[], taskIds: Id[]) {
  const goalIdChunks = await chunked(goalIds, 500);
  const taskIdChunks = await chunked(taskIds, 500);

  // Important FK constraints:
  // - PerformanceGoal.parentGoalId is NoAction; ensure we detach hierarchy before deleting.
  // - ActivityLog has NoAction to goal/task; must delete logs before deleting referenced rows.
  // - BSC workflow tables cascade on goal delete, but we delete explicitly for clean counts.

  const results: Record<string, number> = {};

  // 1) Clear goal hierarchy pointers to avoid NoAction FK failures when deleting in bulk.
  const clearedParents = await prisma.performanceGoal.updateMany({
    where: { parentGoalId: { not: null } },
    data: { parentGoalId: null }
  });
  results.performanceGoalsClearedParentGoalId = clearedParents.count;

  // 2) Delete BSC workflow rows tied to performance goals.
  let varianceDeleted = 0;
  for (const ids of goalIdChunks) {
    const del = await prisma.bscBudgetVarianceReport.deleteMany({
      where: { performanceGoalId: { in: ids } }
    });
    varianceDeleted += del.count;
  }
  results.bscBudgetVarianceReportsDeleted = varianceDeleted;

  let statutoryDeleted = 0;
  for (const ids of goalIdChunks) {
    const del = await prisma.bscStatutorySubmission.deleteMany({
      where: { performanceGoalId: { in: ids } }
    });
    statutoryDeleted += del.count;
  }
  results.bscStatutorySubmissionsDeleted = statutoryDeleted;

  // 3) Delete activity logs for those goals/tasks.
  let activityDeleted = 0;
  for (const ids of goalIdChunks) {
    if (ids.length === 0) continue;
    const del = await prisma.activityLog.deleteMany({
      where: { goalId: { in: ids } }
    });
    activityDeleted += del.count;
  }
  for (const ids of taskIdChunks) {
    if (ids.length === 0) continue;
    const del = await prisma.activityLog.deleteMany({
      where: { taskId: { in: ids } }
    });
    activityDeleted += del.count;
  }
  results.activityLogsDeleted = activityDeleted;

  // 4) Delete tasks (performance subset).
  let tasksDeleted = 0;
  for (const ids of taskIdChunks) {
    if (ids.length === 0) continue;
    const del = await prisma.task.deleteMany({ where: { id: { in: ids } } });
    tasksDeleted += del.count;
  }
  results.tasksDeleted = tasksDeleted;

  // 5) Delete performance goals.
  let goalsDeleted = 0;
  for (const ids of goalIdChunks) {
    if (ids.length === 0) continue;
    const del = await prisma.performanceGoal.deleteMany({ where: { id: { in: ids } } });
    goalsDeleted += del.count;
  }
  results.performanceGoalsDeleted = goalsDeleted;

  // 6) Contracts/scorecards (delete scorecards first because they can reference contracts).
  const scorecardsDeleted = await prisma.performanceScorecard.deleteMany({});
  results.performanceScorecardsDeleted = scorecardsDeleted.count;

  const contractsDeleted = await prisma.performanceContract.deleteMany({});
  results.performanceContractsDeleted = contractsDeleted.count;

  // 7) Strategies/themes
  const strategiesDeleted = await prisma.performanceStrategy.deleteMany({});
  results.performanceStrategiesDeleted = strategiesDeleted.count;

  // Nulling theme/strategy FKs on goals is unnecessary now (goals deleted),
  // but themes can remain referenced nowhere; safe to delete.
  const themesDeleted = await prisma.performanceTheme.deleteMany({});
  results.performanceThemesDeleted = themesDeleted.count;

  // 8) Reviews (feedback cascades from review delete, but we delete explicitly for clean counts).
  const feedbackDeleted = await prisma.performanceReviewFeedback.deleteMany({});
  results.performanceReviewFeedbackDeleted = feedbackDeleted.count;

  const reviewsDeleted = await prisma.performanceReview.deleteMany({});
  results.performanceReviewsDeleted = reviewsDeleted.count;

  const cyclesDeleted = await prisma.performanceReviewCycle.deleteMany({});
  results.performanceReviewCyclesDeleted = cyclesDeleted.count;

  // 9) Sync jobs and snapshots
  const syncJobsDeleted = await prisma.performanceSyncJob.deleteMany({});
  results.performanceSyncJobsDeleted = syncJobsDeleted.count;

  const metricSnapshotsDeleted = await prisma.performanceMetricSnapshot.deleteMany({});
  results.performanceMetricSnapshotsDeleted = metricSnapshotsDeleted.count;

  return results;
}

async function main() {
  const apply = hasFlag("--apply");

  console.log("============================================================");
  console.log("PERFORMANCE MODULE CLEANUP (TRANSACTIONAL DATA ONLY)");
  console.log("============================================================");
  console.log(`Mode: ${apply ? "APPLY (DESTRUCTIVE)" : "DRY RUN"}`);
  console.log(`Database: ${sanitizeDatabaseUrlForLog(process.env.DATABASE_URL)}`);
  console.log("KEEP: kpis, scorecard_pillars, scorecard_pillar_aliases");
  console.log("");

  const goalIds = await fetchAllGoalIds();
  const taskIds = await fetchTaskIdsToDelete(goalIds);

  const plan = await countPlan(goalIds, taskIds);
  console.log("Counts (keep):", plan.keep);
  console.log("Counts (delete):", plan.delete);

  if (!apply) {
    console.log("");
    console.log("Dry run complete. To apply deletes, re-run with: --apply");
    return;
  }

  console.log("");
  console.log("APPLY MODE: deleting…");

  // We intentionally do not wrap everything in a single transaction because large deletes can exceed
  // transaction timeouts/lock limits in some environments. The order is chosen to satisfy FK rules.
  const deleted = await deleteInApplyMode(goalIds, taskIds);
  console.log("Deleted:", deleted);

  console.log("");
  const afterGoalIds = await fetchAllGoalIds();
  const afterTaskIds = await fetchTaskIdsToDelete(afterGoalIds);
  const after = await countPlan(afterGoalIds, afterTaskIds);
  console.log("Counts after (keep):", after.keep);
  console.log("Counts after (delete):", after.delete);
  console.log("");
  console.log("Cleanup completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

